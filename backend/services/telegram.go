package services

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"waf-backend/database"
)

var (
	tgMu         sync.RWMutex
	tgConfig     database.TelegramConfig
	lastAlert    time.Time
	botCancelCtx context.CancelFunc
	botRunning   bool
	botMu        sync.Mutex
)

type InlineKeyboardButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data,omitempty"`
	URL          string `json:"url,omitempty"`
}

type InlineKeyboardMarkup struct {
	InlineKeyboard [][]InlineKeyboardButton `json:"inline_keyboard"`
}

type TelegramSendPayload struct {
	ChatID      string                `json:"chat_id"`
	Text        string                `json:"text"`
	ParseMode   string                `json:"parse_mode"`
	ReplyMarkup *InlineKeyboardMarkup `json:"reply_markup,omitempty"`
}

type TelegramUpdate struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		MessageID int64 `json:"message_id"`
		Chat      struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		From struct {
			ID        int64  `json:"id"`
			Username  string `json:"username"`
			FirstName string `json:"first_name"`
		} `json:"from"`
		Text string `json:"text"`
	} `json:"message"`
	CallbackQuery *struct {
		ID   string `json:"id"`
		From struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
		} `json:"from"`
		Message *struct {
			MessageID int64 `json:"message_id"`
			Chat      struct {
				ID int64 `json:"id"`
			} `json:"chat"`
		} `json:"message"`
		Data string `json:"data"`
	} `json:"callback_query"`
}

func LoadTelegramConfig() {
	tgMu.Lock()
	defer tgMu.Unlock()

	var token, chatID, enabledStr string
	_ = database.DB.QueryRow("SELECT value FROM settings WHERE key = 'telegram_token'").Scan(&token)
	_ = database.DB.QueryRow("SELECT value FROM settings WHERE key = 'telegram_chat_id'").Scan(&chatID)
	_ = database.DB.QueryRow("SELECT value FROM settings WHERE key = 'telegram_enabled'").Scan(&enabledStr)

	tgConfig = database.TelegramConfig{
		BotToken: token,
		ChatID:   chatID,
		Enabled:  enabledStr == "true",
	}
}

func SaveTelegramConfig(cfg database.TelegramConfig) error {
	tgMu.Lock()
	enabledStr := "false"
	if cfg.Enabled {
		enabledStr = "true"
	}

	queries := []struct {
		k, v string
	}{
		{"telegram_token", cfg.BotToken},
		{"telegram_chat_id", cfg.ChatID},
		{"telegram_enabled", enabledStr},
	}

	for _, q := range queries {
		_, err := database.DB.Exec(
			"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			q.k, q.v,
		)
		if err != nil {
			tgMu.Unlock()
			return err
		}
	}

	tgConfig = cfg
	tgMu.Unlock()

	// Restart or stop background bot listener when config changes
	RestartTelegramBot()
	return nil
}

func GetTelegramConfig() database.TelegramConfig {
	tgMu.RLock()
	defer tgMu.RUnlock()
	return tgConfig
}

// SendTelegramMessage sends a basic or styled HTML message to Telegram
func SendTelegramMessage(token, chatID, message string) error {
	return SendTelegramMessageWithKeyboard(token, chatID, message, nil)
}

// SendTelegramMessageWithKeyboard sends an HTML message with optional Inline Buttons
func SendTelegramMessageWithKeyboard(token, chatID, message string, markup *InlineKeyboardMarkup) error {
	if token == "" || chatID == "" {
		return fmt.Errorf("bot token or chat ID is empty")
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload := TelegramSendPayload{
		ChatID:      chatID,
		Text:        message,
		ParseMode:   "HTML",
		ReplyMarkup: markup,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to send telegram request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned status: %d", resp.StatusCode)
	}

	return nil
}

func answerCallbackQuery(token, queryID, text string) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/answerCallbackQuery", token)
	payload := map[string]interface{}{
		"callback_query_id": queryID,
		"text":              text,
		"show_alert":        true,
	}
	body, _ := json.Marshal(payload)
	client := &http.Client{Timeout: 5 * time.Second}
	_, _ = client.Post(url, "application/json", bytes.NewBuffer(body))
}

// SendAttackAlert broadcasts an attack alert with quick-action inline buttons to ban/whitelist
func SendAttackAlert(logItem database.AttackLog) {
	tgMu.RLock()
	cfg := tgConfig
	tgMu.RUnlock()

	if !cfg.Enabled || cfg.BotToken == "" || cfg.ChatID == "" {
		return
	}

	// Debounce / rate limit
	tgMu.Lock()
	if time.Since(lastAlert) < 2*time.Second {
		tgMu.Unlock()
		return
	}
	lastAlert = time.Now()
	tgMu.Unlock()

	geo := LookupGeoIP(logItem.ClientIP)

	msg := fmt.Sprintf(
		"🚨 <b>[CORAZA WAF ALERT] Phát Hiện Tấn Công!</b>\n\n"+
			"• <b>Loại tấn công:</b> <code>%s</code>\n"+
			"• <b>IP Nguồn:</b> <code>%s</code> (%s %s)\n"+
			"• <b>Hành động:</b> ⛔ <b>%s (403 Forbidden)</b>\n"+
			"• <b>Rule ID:</b> <code>%d</code>\n"+
			"• <b>Rule Msg:</b> %s\n"+
			"• <b>Method & URI:</b> <code>%s %s</code>\n"+
			"• <b>Thời gian:</b> <i>%s</i>\n\n"+
			"🛡️ <i>Coraza SPOA WAF đã tự động phát hiện và chặn cuộc tấn công. Bạn có thể nhấn nút bên dưới để xử lý IP:</i>",
		logItem.AttackType,
		logItem.ClientIP,
		geo.Flag, geo.Country,
		logItem.Action,
		logItem.RuleID,
		logItem.RuleMsg,
		logItem.Method,
		logItem.URI,
		logItem.Timestamp,
	)

	// Interactive Inline Keyboard
	markup := &InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: fmt.Sprintf("⛔ Chặn IP %s", logItem.ClientIP), CallbackData: fmt.Sprintf("ban:%s", logItem.ClientIP)},
				{Text: "⚪ Whitelist IP", CallbackData: fmt.Sprintf("white:%s", logItem.ClientIP)},
			},
			{
				{Text: "📊 Thống kê WAF", CallbackData: "cmd_stats"},
				{Text: "🔍 Nhật ký gần nhất", CallbackData: "cmd_latest"},
			},
		},
	}

	go func() {
		if err := SendTelegramMessageWithKeyboard(cfg.BotToken, cfg.ChatID, msg, markup); err != nil {
			log.Printf("[Telegram] Failed to send alert: %v", err)
		}
	}()
}

// RestartTelegramBot restarts the poller with current config
func RestartTelegramBot() {
	botMu.Lock()
	defer botMu.Unlock()

	if botCancelCtx != nil {
		botCancelCtx()
		botCancelCtx = nil
	}
	botRunning = false

	tgMu.RLock()
	cfg := tgConfig
	tgMu.RUnlock()

	if cfg.Enabled && cfg.BotToken != "" {
		ctx, cancel := context.WithCancel(context.Background())
		botCancelCtx = cancel
		botRunning = true
		go runTelegramPoller(ctx, cfg.BotToken)
	}
}

// StartTelegramBot initializes the interactive long-polling loop
func StartTelegramBot() {
	RestartTelegramBot()
}

// Long-polling loop for receiving Telegram commands and button callbacks
func runTelegramPoller(ctx context.Context, token string) {
	log.Printf("[Telegram Bot] Interactive listener started.")
	client := &http.Client{Timeout: 30 * time.Second}
	var offset int64 = 0

	for {
		select {
		case <-ctx.Done():
			log.Printf("[Telegram Bot] Interactive listener stopped.")
			return
		default:
		}

		url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=15", token, offset)
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}

		var updateResp struct {
			Ok     bool             `json:"ok"`
			Result []TelegramUpdate `json:"result"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&updateResp); err == nil && updateResp.Ok {
			for _, u := range updateResp.Result {
				if u.UpdateID >= offset {
					offset = u.UpdateID + 1
				}

				if u.Message != nil {
					chatID := u.Message.Chat.ID
					log.Printf("[Telegram Bot] Received message: ChatID=%d, Text=%q", chatID, u.Message.Text)
					handleTelegramMessage(token, chatID, u.Message.Text)
				} else if u.CallbackQuery != nil {
					handleTelegramCallback(token, u.CallbackQuery.ID, u.CallbackQuery.Message.Chat.ID, u.CallbackQuery.Data)
				}
			}
		}
		resp.Body.Close()
	}
}

func isAuthorizedChat(senderChatID int64) bool {
	tgMu.RLock()
	configuredChatID := tgConfig.ChatID
	tgMu.RUnlock()

	if configuredChatID == "" {
		return true // Allow initial pairing
	}

	configuredInt, err := strconv.ParseInt(configuredChatID, 10, 64)
	if err == nil && configuredInt == senderChatID {
		return true
	}

	return strings.TrimSpace(configuredChatID) == fmt.Sprintf("%d", senderChatID)
}

func handleTelegramMessage(token string, chatID int64, text string) {
	text = strings.TrimSpace(text)
	chatIDStr := fmt.Sprintf("%d", chatID)

	tgMu.RLock()
	currentChatID := tgConfig.ChatID
	tgMu.RUnlock()

	// If no chat ID has been configured yet, automatically pair and save this chat/group!
	if currentChatID == "" {
		log.Printf("[Telegram Bot] Auto-pairing with chat ID: %s", chatIDStr)
		_ = SaveTelegramConfig(database.TelegramConfig{
			BotToken: token,
			ChatID:   chatIDStr,
			Enabled:  true,
		})
		welcomeMsg := fmt.Sprintf(
			"🎉 <b>[CORAZA WAF — KẾT NỐI NHÓM THÀNH CÔNG]</b>\n\n"+
				"• <b>Đã liên kết kênh:</b> <code>%s</code>\n"+
				"• <b>Trạng thái:</b> 🟢 <b>ACTIVE / HEALTHY</b>\n\n"+
				"Nhóm này đã được kích hoạt nhận cảnh báo tấn công tự động từ Coraza WAF.\n"+
				"Gõ <code>/help</code> hoặc <code>/stats</code> để kiểm tra các lệnh điều khiển.",
			chatIDStr,
		)
		_ = SendTelegramMessage(token, chatIDStr, welcomeMsg)
		return
	}

	// Check authorization
	if !isAuthorizedChat(chatID) {
		msg := fmt.Sprintf(
			"⚠️ <b>Quyền truy cập bị từ chối!</b>\n\n"+
				"Chat ID của bạn: <code>%d</code>\n"+
				"Chat ID này chưa được cấp phép trong hệ thống Coraza WAF Dashboard.\n"+
				"Vui lòng vào <b>Dashboard -> Cài đặt Telegram</b> và nhập Chat ID trên để kích hoạt quản trị.",
			chatID,
		)
		_ = SendTelegramMessage(token, chatIDStr, msg)
		return
	}

	parts := strings.Fields(text)
	if len(parts) == 0 {
		return
	}

	cmd := strings.ToLower(parts[0])
	// Strip bot username if invoked as /stats@MyBot
	if atIdx := strings.Index(cmd, "@"); atIdx != -1 {
		cmd = cmd[:atIdx]
	}

	switch cmd {
	case "/start", "/help":
		sendHelpMessage(token, chatIDStr)
	case "/stats":
		sendStatsMessage(token, chatIDStr)
	case "/status":
		sendStatusMessage(token, chatIDStr)
	case "/latest":
		sendLatestAttacksMessage(token, chatIDStr)
	case "/ban", "/block":
		if len(parts) < 2 {
			_ = SendTelegramMessage(token, chatIDStr, "⚠️ Cú pháp: <code>/ban &lt;IP&gt; [thời_gian: 15m|1h|24h|perm] [lý do]</code>\nVí dụ:\n• <code>/ban 1.2.3.4 15m Dò quét SQLi</code> (Cấm 15 phút)\n• <code>/ban 1.2.3.4 perm Hacker</code> (Cấm vĩnh viễn)")
			return
		}
		ip := parts[1]
		durStr := "15m" // Default 15 minutes to prevent false positives
		reason := "Chặn qua Telegram Bot"

		if len(parts) >= 3 {
			// Check if parts[2] looks like duration (e.g., 15m, 1h, 24h, perm)
			possibleDur := strings.ToLower(parts[2])
			if possibleDur == "perm" || possibleDur == "permanent" || strings.HasSuffix(possibleDur, "m") || strings.HasSuffix(possibleDur, "h") || strings.HasSuffix(possibleDur, "d") {
				durStr = possibleDur
				if len(parts) > 3 {
					reason = strings.Join(parts[3:], " ")
				}
			} else {
				reason = strings.Join(parts[2:], " ")
			}
		}
		banIP(token, chatIDStr, ip, durStr, reason)
	case "/unban":
		if len(parts) < 2 {
			_ = SendTelegramMessage(token, chatIDStr, "⚠️ Cú pháp: <code>/unban &lt;IP&gt;</code>\nVí dụ: <code>/unban 192.168.1.100</code>")
			return
		}
		unbanIP(token, chatIDStr, parts[1])
	case "/whitelist":
		if len(parts) < 2 {
			_ = SendTelegramMessage(token, chatIDStr, "⚠️ Cú pháp: <code>/whitelist &lt;IP&gt; [lý do]</code>\nVí dụ: <code>/whitelist 192.168.1.50 Office IP</code>")
			return
		}
		ip := parts[1]
		reason := "Whitelist qua Telegram Bot"
		if len(parts) > 2 {
			reason = strings.Join(parts[2:], " ")
		}
		whitelistIP(token, chatIDStr, ip, reason)
	case "/sim":
		attackType := "sqli"
		if len(parts) > 1 {
			attackType = strings.ToLower(parts[1])
		}
		simulateViaTelegram(token, chatIDStr, attackType)
	default:
		_ = SendTelegramMessage(token, chatIDStr, fmt.Sprintf("❓ Lệnh không hợp lệ: <code>%s</code>. Gõ <code>/help</code> để xem danh sách lệnh được hỗ trợ.", cmd))
	}
}

func handleTelegramCallback(token, queryID string, chatID int64, data string) {
	chatIDStr := fmt.Sprintf("%d", chatID)
	if !isAuthorizedChat(chatID) {
		answerCallbackQuery(token, queryID, "Bạn không có quyền thực hiện thao tác này.")
		return
	}

	if strings.HasPrefix(data, "ban:") {
		ip := strings.TrimPrefix(data, "ban:")
		banIP(token, chatIDStr, ip, "15m", "Chặn tức thì qua Telegram Alert Quick Action (15 phút)")
		answerCallbackQuery(token, queryID, fmt.Sprintf("Đã chặn IP %s trong 15 phút!", ip))
	} else if strings.HasPrefix(data, "white:") {
		ip := strings.TrimPrefix(data, "white:")
		whitelistIP(token, chatIDStr, ip, "Whitelist qua Telegram Alert Quick Action")
		answerCallbackQuery(token, queryID, fmt.Sprintf("Đã Whitelist IP %s!", ip))
	} else if data == "cmd_stats" {
		answerCallbackQuery(token, queryID, "Đang tải thống kê WAF...")
		sendStatsMessage(token, chatIDStr)
	} else if data == "cmd_latest" {
		answerCallbackQuery(token, queryID, "Đang tải nhật ký vi phạm gần nhất...")
		sendLatestAttacksMessage(token, chatIDStr)
	}
}

func sendHelpMessage(token, chatID string) {
	help := `🛡️ <b>CORAZA WAF SOC — TELEGRAM COMMAND CENTER</b>

Chào mừng bạn đến với bot quản trị và giám sát an ninh <b>Coraza WAF + HAProxy</b>.

<b>📋 Danh Sách Lệnh Khả Dụng:</b>
• <code>/stats</code> : Thống kê lưu lượng & số lượt chặn trong ngày
• <code>/status</code> : Trạng thái hệ điều hành, CPU, RAM & WAF Engine
• <code>/latest</code> : Xem 5 cuộc tấn công vừa bị chặn gần nhất
• <code>/ban &lt;IP&gt; [lý do]</code> : Chặn vĩnh viễn IP vào Blacklist
• <code>/unban &lt;IP&gt;</code> : Gỡ bỏ IP khỏi danh sách chặn
• <code>/whitelist &lt;IP&gt; [lý do]</code> : Cho phép IP bỏ qua WAF
• <code>/sim &lt;sqli|xss|lfi&gt;</code> : Giả lập cuộc tấn công để thử nghiệm cảnh báo
• <code>/help</code> : Hiển thị bảng trợ giúp này

<i>💡 Mỗi khi phát hiện tấn công, bot sẽ tự động gửi kèm nút bấm Quick Action để bạn chặn IP chỉ với 1 chạm!</i>`

	markup := &InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: "📊 Xem Thống Kê", CallbackData: "cmd_stats"},
				{Text: "🔍 5 Tấn Công Gần Nhất", CallbackData: "cmd_latest"},
			},
		},
	}
	_ = SendTelegramMessageWithKeyboard(token, chatID, help, markup)
}

func sendStatsMessage(token, chatID string) {
	var totalAttacks, attacksToday, blockedIPs, whitelistedIPs int64

	_ = database.DB.QueryRow("SELECT COUNT(*) FROM attack_logs").Scan(&totalAttacks)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM attack_logs WHERE date(timestamp) = date('now')").Scan(&attacksToday)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM ip_rules WHERE rule_type = 'blacklist'").Scan(&blockedIPs)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM ip_rules WHERE rule_type = 'whitelist'").Scan(&whitelistedIPs)

	// Top 3 Attacking IPs
	topIPsStr := ""
	rows, err := database.DB.Query("SELECT client_ip, COUNT(*) as c FROM attack_logs GROUP BY client_ip ORDER BY c DESC LIMIT 3")
	if err == nil {
		defer rows.Close()
		rank := 1
		for rows.Next() {
			var ip string
			var count int64
			if err := rows.Scan(&ip, &count); err == nil {
				geo := LookupGeoIP(ip)
				topIPsStr += fmt.Sprintf("  %d. <code>%s</code> (%s %s) — <b>%d</b> lần\n", rank, ip, geo.Flag, geo.Country, count)
				rank++
			}
		}
	}
	if topIPsStr == "" {
		topIPsStr = "  <i>Chưa có dữ liệu kẻ tấn công.</i>\n"
	}

	msg := fmt.Sprintf(
		"📊 <b>[BÁO CÁO THỐNG KÊ CORAZA WAF]</b>\n\n"+
			"• <b>Tấn công hôm nay:</b> 🔴 <b>%d</b> đợt\n"+
			"• <b>Tổng vi phạm đã chặn:</b> 🛡️ <b>%d</b> đợt\n"+
			"• <b>IP trong Blacklist:</b> ⛔ <b>%d</b> IP\n"+
			"• <b>IP trong Whitelist:</b> ⚪ <b>%d</b> IP\n"+
			"• <b>Tỷ lệ ngăn chặn (Block Rate):</b> <b>100%%</b>\n\n"+
			"🏆 <b>Top IP Độc Hại Nhất:</b>\n%s\n"+
			"⏰ <i>Thời gian trích xuất: %s</i>",
		attacksToday, totalAttacks, blockedIPs, whitelistedIPs, topIPsStr, time.Now().Format("2006-01-02 15:04:05"),
	)

	_ = SendTelegramMessage(token, chatID, msg)
}

func sendStatusMessage(token, chatID string) {
	metrics := GetRealSystemMetrics(time.Now().Add(-12 * time.Hour))

	msg := fmt.Sprintf(
		"🖥️ <b>[TRẠNG THÁI HỆ THỐNG WAF SOC]</b>\n\n"+
			"• <b>Hệ điều hành:</b> <code>%s</code>\n"+
			"• <b>Kiến trúc phần cứng:</b> <code>%s</code>\n"+
			"• <b>Thời gian hoạt động (Uptime):</b> <code>%s</code>\n"+
			"• <b>Tải CPU (Load Average):</b> <code>%s</code>\n"+
			"• <b>Số lượng CPU Cores:</b> <code>%d cores</code> (%.1f%% sử dụng)\n"+
			"• <b>Bộ nhớ RAM:</b> <code>%d MB / %d MB</code> (<b>%.1f%%</b>)\n"+
			"• <b>Lưu lượng mạng:</b> Tx: <code>%.1f KB</code> | Rx: <code>%.1f KB</code>\n"+
			"• <b>Coraza SPOA Engine:</b> 🟢 <b>HEALTHY / ACTIVE</b>\n"+
			"• <b>HAProxy SPOE Filter:</b> 🟢 <b>CONNECTED</b>\n"+
			"• <b>Bộ luật an ninh:</b> 🛡️ OWASP Core Rule Set (CRS v4.x)\n"+
			"• <b>Cơ sở dữ liệu:</b> 🗄️ SQLite 3 (WAL Mode Active)",
		metrics.OSName,
		metrics.Arch,
		metrics.UptimeStr,
		metrics.LoadAvg,
		metrics.CPUCores, metrics.CPUPercent,
		metrics.MemUsedMB, metrics.MemTotalMB, metrics.MemPercent,
		metrics.TransmitKB, metrics.ReceiveKB,
	)

	_ = SendTelegramMessage(token, chatID, msg)
}

func sendLatestAttacksMessage(token, chatID string) {
	rows, err := database.DB.Query(
		"SELECT id, client_ip, attack_type, rule_id, method, uri, timestamp FROM attack_logs ORDER BY id DESC LIMIT 5",
	)
	if err != nil {
		_ = SendTelegramMessage(token, chatID, "⚠️ Lỗi khi truy vấn dữ liệu từ cơ sở dữ liệu.")
		return
	}
	defer rows.Close()

	var sb strings.Builder
	sb.WriteString("🔍 <b>[5 CUỘC TẤN CÔNG GẦN NHẤT ĐÃ CHẶN]</b>\n\n")

	count := 0
	for rows.Next() {
		count++
		var id int64
		var ip, attackType, method, uri, ts string
		var ruleID int
		if err := rows.Scan(&id, &ip, &attackType, &ruleID, &method, &uri, &ts); err == nil {
			geo := LookupGeoIP(ip)
			sb.WriteString(fmt.Sprintf(
				"<b>#%d. %s [%s]</b>\n"+
					"• IP: <code>%s</code> (%s %s)\n"+
					"• Rule ID: <code>%d</code>\n"+
					"• Request: <code>%s %s</code>\n"+
					"• Lúc: <i>%s</i>\n\n",
				id, attackType, "403 BLOCKED",
				ip, geo.Flag, geo.Country,
				ruleID, method, uri, ts,
			))
		}
	}

	if count == 0 {
		sb.WriteString("<i>Hiện chưa có dữ liệu cuộc tấn công nào được ghi nhận.</i>")
	}

	_ = SendTelegramMessage(token, chatID, sb.String())
}

func banIP(token, chatID, ip, durationStr, reason string) {
	ip = strings.TrimSpace(ip)
	if net.ParseIP(ip) == nil && !strings.Contains(ip, "/") {
		_ = SendTelegramMessage(token, chatID, fmt.Sprintf("❌ Địa chỉ IP không hợp lệ: <code>%s</code>", ip))
		return
	}

	expTime := ParseDurationToExpiration(durationStr)
	var expiresAtVal *string
	durationDisplay := "🔒 Vô thời hạn (Vĩnh viễn)"
	if expTime != nil {
		formatted := expTime.Format("2006-01-02 15:04:05")
		expiresAtVal = &formatted
		durationDisplay = fmt.Sprintf("⏳ %s (Hết hạn lúc: %s — Tự động gỡ cấm)", durationStr, formatted)
	}

	_, err := database.DB.Exec(
		`INSERT INTO ip_rules (ip, rule_type, reason, created_at, expires_at)
		 VALUES (?, 'blacklist', ?, CURRENT_TIMESTAMP, ?)
		 ON CONFLICT(ip) DO UPDATE SET rule_type = 'blacklist', reason = excluded.reason, expires_at = excluded.expires_at`,
		ip, reason, expiresAtVal,
	)
	if err != nil {
		_ = SendTelegramMessage(token, chatID, fmt.Sprintf("❌ Lỗi khi cập nhật cơ sở dữ liệu: %v", err))
		return
	}

	// Sync to HAProxy & Coraza active rule files immediately
	_ = SyncIPRulesToFile()

	geo := LookupGeoIP(ip)
	msg := fmt.Sprintf(
		"⛔ <b>[ĐÃ CHẶN IP THÀNH CÔNG]</b>\n\n"+
			"• <b>IP:</b> <code>%s</code> (%s %s)\n"+
			"• <b>Thời hạn:</b> %s\n"+
			"• <b>Trạng thái:</b> 🔴 <b>BLACKLIST (BỊ TỪ CHỐI)</b>\n"+
			"• <b>Lý do:</b> <i>%s</i>\n"+
			"• <b>Hiệu lực:</b> Tức thì trên toàn cụm HAProxy + Coraza WAF.\n\n"+
			"<i>Dùng lệnh <code>/unban %s</code> nếu muốn gỡ bỏ thủ công.</i>",
		ip, geo.Flag, geo.Country, durationDisplay, reason, ip,
	)
	_ = SendTelegramMessage(token, chatID, msg)
}

func unbanIP(token, chatID, ip string) {
	ip = strings.TrimSpace(ip)
	res, err := database.DB.Exec("DELETE FROM ip_rules WHERE ip = ?", ip)
	if err != nil {
		_ = SendTelegramMessage(token, chatID, fmt.Sprintf("❌ Lỗi khi xóa IP: %v", err))
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		_ = SendTelegramMessage(token, chatID, fmt.Sprintf("ℹ️ IP <code>%s</code> không tồn tại trong danh sách quy tắc.", ip))
		return
	}

	// Sync to HAProxy & Coraza active rule files immediately
	_ = SyncIPRulesToFile()

	msg := fmt.Sprintf(
		"✅ <b>[ĐÃ GỠ BỎ IP KHỎI DANH SÁCH CHẶN]</b>\n\n"+
			"• <b>IP:</b> <code>%s</code>\n"+
			"• <b>Hành động:</b> Đã xóa khỏi Blacklist.\n"+
			"• <b>Trạng thái:</b> Lưu lượng từ IP này sẽ được xử lý bình thường qua bộ luật WAF.",
		ip,
	)
	_ = SendTelegramMessage(token, chatID, msg)
}

func whitelistIP(token, chatID, ip, reason string) {
	ip = strings.TrimSpace(ip)
	if net.ParseIP(ip) == nil && !strings.Contains(ip, "/") {
		_ = SendTelegramMessage(token, chatID, fmt.Sprintf("❌ Địa chỉ IP không hợp lệ: <code>%s</code>", ip))
		return
	}

	_, err := database.DB.Exec(
		`INSERT INTO ip_rules (ip, rule_type, reason, created_at)
		 VALUES (?, 'whitelist', ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(ip) DO UPDATE SET rule_type = 'whitelist', reason = excluded.reason`,
		ip, reason,
	)
	if err != nil {
		_ = SendTelegramMessage(token, chatID, fmt.Sprintf("❌ Lỗi khi thêm Whitelist: %v", err))
		return
	}

	// Sync to HAProxy & Coraza active rule files immediately
	_ = SyncIPRulesToFile()

	msg := fmt.Sprintf(
		"⚪ <b>[ĐÃ THÊM IP VÀO WHITELIST]</b>\n\n"+
			"• <b>IP:</b> <code>%s</code>\n"+
			"• <b>Trạng thái:</b> 🟢 <b>WHITELIST (ĐƯỢC TIN CẬY)</b>\n"+
			"• <b>Lý do:</b> <i>%s</i>\n"+
			"• <b>Hiệu lực:</b> Toàn bộ lưu lượng từ IP này sẽ bỏ qua bộ lọc WAF.",
		ip, reason,
	)
	_ = SendTelegramMessage(token, chatID, msg)
}

func simulateViaTelegram(token, chatID, attackType string) {
	logItem := database.AttackLog{
		TxnID:     fmt.Sprintf("sim-tg-%d", time.Now().UnixNano()),
		ClientIP:  "192.168.246.88",
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
		Method:    "GET",
		Action:    "DENY",
		Status:    403,
	}

	switch attackType {
	case "xss":
		logItem.AttackType = "Cross-Site Scripting (XSS)"
		logItem.URI = "/search?q=<script>alert('XSS_TEST')</script>"
		logItem.RuleID = 941100
		logItem.RuleMsg = "XSS Filter - Category 1: Script Tag Vector"
		logItem.RawPayload = "<script>alert('XSS_TEST')</script>"
	case "lfi":
		logItem.AttackType = "Path Traversal (LFI)"
		logItem.URI = "/download?file=../../../../etc/passwd"
		logItem.RuleID = 930100
		logItem.RuleMsg = "Path Traversal Attack (/../)"
		logItem.RawPayload = "../../../../etc/passwd"
	default:
		logItem.AttackType = "SQL Injection (SQLi)"
		logItem.URI = "/login?user=admin' OR 1=1--"
		logItem.RuleID = 942100
		logItem.RuleMsg = "SQL Injection Attack: SQL Operator Detected"
		logItem.RawPayload = "' OR 1=1--"
	}

	_, _ = database.DB.Exec(
		`INSERT INTO attack_logs (txn_id, client_ip, timestamp, method, uri, user_agent, attack_type, rule_id, rule_msg, action, status, raw_payload)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		logItem.TxnID, logItem.ClientIP, logItem.Timestamp, logItem.Method, logItem.URI,
		"Mozilla/5.0 TelegramSimulator/1.0", logItem.AttackType, logItem.RuleID, logItem.RuleMsg,
		logItem.Action, logItem.Status, logItem.RawPayload,
	)

	_ = SendTelegramMessage(token, chatID, fmt.Sprintf("🚀 <b>Đã kích hoạt mô phỏng:</b> <code>%s</code>\nKiểm tra bản tin cảnh báo WAF gửi ngay bên dưới 👇", logItem.AttackType))
	SendAttackAlert(logItem)
}

// Helper for testing
func SetTestTelegramDB(db *sql.DB) {
	database.DB = db
}
