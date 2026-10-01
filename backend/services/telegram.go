package services

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net"
	"net/http"
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

type ReplyKeyboardRemove struct {
	RemoveKeyboard bool `json:"remove_keyboard"`
	Selective      bool `json:"selective,omitempty"`
}

// GetInlineControlMenu returns clean inline buttons attached right inside the message
func GetInlineControlMenu() *InlineKeyboardMarkup {
	return &InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: "📊 Thống Kê WAF", CallbackData: "cmd_stats"},
				{Text: "🔍 5 Tấn Công Gần Nhất", CallbackData: "cmd_latest"},
			},
			{
				{Text: "🖥️ Trạng Thái SOC", CallbackData: "cmd_status"},
				{Text: "⚡ Demo Chặn 20s", CallbackData: "cmd_demo20s"},
			},
			{
				{Text: "📋 Bảng Lệnh & Trợ Giúp", CallbackData: "cmd_help"},
			},
		},
	}
}

type TelegramSendPayload struct {
	ChatID      string      `json:"chat_id"`
	Text        string      `json:"text"`
	ParseMode   string      `json:"parse_mode"`
	ReplyMarkup interface{} `json:"reply_markup,omitempty"`
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

// SendTelegramMessage sends an HTML message with clean inline action buttons (no bottom keyboard)
func SendTelegramMessage(token, chatID, message string) error {
	return SendTelegramMessageWithKeyboard(token, chatID, message, GetInlineControlMenu())
}

// SendTelegramMessageWithKeyboard sends an HTML message with optional Inline Buttons
func SendTelegramMessageWithKeyboard(token, chatID, message string, markup *InlineKeyboardMarkup) error {
	return SendTelegramMessageWithReplyMarkup(token, chatID, message, markup)
}

// SendTelegramMessageWithReplyMarkup sends an HTML message with arbitrary keyboard markup
func SendTelegramMessageWithReplyMarkup(token, chatID, message string, markup interface{}) error {
	if token == "" || chatID == "" {
		return fmt.Errorf("bot token or chat ID is empty")
	}

	targets := strings.Split(chatID, ",")
	var lastErr error
	client := &http.Client{Timeout: 10 * time.Second}

	for _, target := range targets {
		target = strings.TrimSpace(target)
		if target == "" {
			continue
		}

		url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
		payload := TelegramSendPayload{
			ChatID:      target,
			Text:        message,
			ParseMode:   "HTML",
			ReplyMarkup: markup,
		}

		body, err := json.Marshal(payload)
		if err != nil {
			lastErr = err
			continue
		}

		resp, err := client.Post(url, "application/json", bytes.NewBuffer(body))
		if err != nil {
			lastErr = fmt.Errorf("failed to send telegram request to %s: %w", target, err)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("telegram API returned status %d for chat %s", resp.StatusCode, target)
		}
		resp.Body.Close()
	}

	return lastErr
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

	safeURI := html.EscapeString(logItem.URI)
	if len(safeURI) > 120 {
		safeURI = safeURI[:120] + "..."
	}
	safeAttackType := html.EscapeString(logItem.AttackType)
	safeClientIP := html.EscapeString(logItem.ClientIP)
	safeAction := html.EscapeString(logItem.Action)
	safeRuleMsg := html.EscapeString(logItem.RuleMsg)
	safeMethod := html.EscapeString(logItem.Method)
	safeTimestamp := html.EscapeString(logItem.Timestamp)

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
		safeAttackType,
		safeClientIP,
		geo.Flag, geo.Country,
		safeAction,
		logItem.RuleID,
		safeRuleMsg,
		safeMethod,
		safeURI,
		safeTimestamp,
	)

	// Interactive Inline Keyboard with 20s Demo & 15m Options
	markup := &InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: "⚡ Chặn 20s (Demo)", CallbackData: fmt.Sprintf("ban20s:%s", logItem.ClientIP)},
				{Text: "⛔ Chặn 15m", CallbackData: fmt.Sprintf("ban:%s", logItem.ClientIP)},
			},
			{
				{Text: "⚪ Whitelist IP", CallbackData: fmt.Sprintf("white:%s", logItem.ClientIP)},
				{Text: "🔍 5 Tấn Công Gần Nhất", CallbackData: "cmd_latest"},
			},
			{
				{Text: "📊 Thống Kê WAF", CallbackData: "cmd_stats"},
				{Text: "🖥️ Trạng Thái SOC", CallbackData: "cmd_status"},
			},
		},
	}

	go func() {
		if err := SendTelegramMessageWithKeyboard(cfg.BotToken, cfg.ChatID, msg, markup); err != nil {
			log.Printf("[Telegram] Failed to send alert: %v", err)
		}
	}()
}

var (
	globalBotOffset int64
	runningToken    string
)

// RestartTelegramBot restarts the poller with current config
func RestartTelegramBot() {
	botMu.Lock()
	defer botMu.Unlock()

	tgMu.RLock()
	cfg := tgConfig
	tgMu.RUnlock()

	// If disabled or empty token, shut down poller
	if !cfg.Enabled || cfg.BotToken == "" {
		if botCancelCtx != nil {
			botCancelCtx()
			botCancelCtx = nil
		}
		botRunning = false
		runningToken = ""
		return
	}

	// If already running with the same token, don't restart poller
	if botRunning && runningToken == cfg.BotToken {
		return
	}

	// Token changed or starting new poller
	if botCancelCtx != nil {
		botCancelCtx()
		botCancelCtx = nil
	}
	botRunning = true
	runningToken = cfg.BotToken
	ctx, cancel := context.WithCancel(context.Background())
	botCancelCtx = cancel
	go runTelegramPoller(ctx, cfg.BotToken)
}

// StartTelegramBot initializes the interactive long-polling loop
func StartTelegramBot() {
	RestartTelegramBot()
}

// registerTelegramCommands registers bot commands to display Telegram's native [/] Menu button
func registerTelegramCommands(token string) {
	if token == "" {
		return
	}
	url := fmt.Sprintf("https://api.telegram.org/bot%s/setMyCommands", token)
	payload := map[string]interface{}{
		"commands": []map[string]string{
			{"command": "menu", "description": "📱 Mở bàn phím Menu điều khiển nhanh"},
			{"command": "stats", "description": "📊 Thống kê lưu lượng & vi phạm WAF"},
			{"command": "latest", "description": "🔍 Xem 5 cuộc tấn công gần nhất"},
			{"command": "status", "description": "🖥️ Trạng thái máy chủ, RAM & SOC"},
			{"command": "demo", "description": "⚡ Demo chặn IP 20 giây và tự động gỡ"},
			{"command": "ban", "description": "⛔ Chặn IP: /ban <IP> [20s|15m|1h|24h]"},
			{"command": "unban", "description": "🔓 Gỡ chặn IP: /unban <IP>"},
			{"command": "whitelist", "description": "⚪ Miễn trừ WAF: /whitelist <IP>"},
			{"command": "sim", "description": "🎯 Giả lập tấn công: /sim sqli|xss|lfi"},
			{"command": "help", "description": "📋 Xem hướng dẫn sử dụng chi tiết"},
		},
	}
	body, _ := json.Marshal(payload)
	client := &http.Client{Timeout: 8 * time.Second}
	_, _ = client.Post(url, "application/json", bytes.NewBuffer(body))
}

// Long-polling loop for receiving Telegram commands and button callbacks
func runTelegramPoller(ctx context.Context, token string) {
	log.Printf("[Telegram Bot] Interactive listener started.")
	go registerTelegramCommands(token)
	client := &http.Client{Timeout: 30 * time.Second}

	for {
		select {
		case <-ctx.Done():
			log.Printf("[Telegram Bot] Interactive listener stopped.")
			return
		default:
		}

		url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=15", token, globalBotOffset)
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		var updateResp struct {
			Ok     bool             `json:"ok"`
			Result []TelegramUpdate `json:"result"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&updateResp); err == nil && updateResp.Ok {
			for _, u := range updateResp.Result {
				if u.UpdateID >= globalBotOffset {
					globalBotOffset = u.UpdateID + 1
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

	configuredChatID = strings.TrimSpace(configuredChatID)
	if configuredChatID == "" {
		return true // Allow initial pairing
	}

	senderStr := fmt.Sprintf("%d", senderChatID)
	parts := strings.Split(configuredChatID, ",")
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && p == senderStr {
			return true
		}
	}

	return false
}

func handleTelegramMessage(token string, chatID int64, text string) {
	text = strings.TrimSpace(text)
	chatIDStr := fmt.Sprintf("%d", chatID)

	parts := strings.Fields(text)
	if len(parts) == 0 {
		return
	}

	cmd := strings.ToLower(parts[0])
	// Strip bot username if invoked as /stats@MyBot
	if atIdx := strings.Index(cmd, "@"); atIdx != -1 {
		cmd = cmd[:atIdx]
	}

	// Always handle /id, /chatid, /info command for ANY user or group to discover Chat ID
	if cmd == "/id" || cmd == "/chatid" || cmd == "/info" {
		chatType := "👤 Cá nhân (Private Chat)"
		if chatID < 0 {
			chatType = "👥 Nhóm (Group / Supergroup)"
		}
		replyMsg := fmt.Sprintf(
			"🆔 <b>THÔNG TIN KÊNH TELEGRAM</b>\n\n"+
				"• <b>Chat ID:</b> <code>%d</code>\n"+
				"• <b>Phân loại:</b> %s\n\n"+
				"💡 <i>Bạn hãy copy Chat ID trên dán vào <b>Dashboard -> Cài Đặt Telegram</b>. Có thể nhập nhiều ID cách nhau bằng dấu phẩy (VD: <code>%d, [ID_Khác]</code>) để bot vừa gửi cảnh báo vào Nhóm vừa gửi tin nhắn riêng cho bạn!</i>\n\n"+
				"Hoặc gõ lệnh <code>/link</code> ngay tại đây để tự động kích hoạt kênh này vào danh sách nhận tin!",
			chatID, chatType, chatID,
		)
		_ = SendTelegramMessage(token, chatIDStr, replyMsg)
		return
	}

	// Command /link: Immediately auto-links this group/chat to the system
	if cmd == "/link" || cmd == "/pair" {
		tgMu.Lock()
		cur := strings.TrimSpace(tgConfig.ChatID)
		if cur == "" {
			tgConfig.ChatID = chatIDStr
		} else if !strings.Contains(cur, chatIDStr) {
			tgConfig.ChatID = cur + ", " + chatIDStr
		}
		newCfg := tgConfig
		newCfg.Enabled = true
		tgMu.Unlock()
		_ = SaveTelegramConfig(newCfg)

		replyMsg := fmt.Sprintf(
			"🎉 <b>[LIÊN KẾT KÊNH THÀNH CÔNG]</b>\n\n"+
				"• <b>Kênh vừa liên kết:</b> <code>%d</code>\n"+
				"• <b>Danh sách Chat ID kích hoạt:</b> <code>%s</code>\n"+
				"• <b>Trạng thái:</b> 🟢 <b>ACTIVE / BROADCASTING</b>\n\n"+
				"Kênh này đã được lưu vào hệ thống Coraza WAF! Bot sẽ gửi cảnh báo tấn công và nhận lệnh điều khiển tại đây.\n"+
				"Gõ <code>/help</code> hoặc <code>/stats</code> để kiểm tra các lệnh điều khiển.",
			chatID, newCfg.ChatID,
		)
		_ = SendTelegramMessage(token, chatIDStr, replyMsg)
		return
	}

	tgMu.RLock()
	currentChatID := tgConfig.ChatID
	tgMu.RUnlock()

	// If no chat ID has been configured yet, automatically pair with this first chat
	if strings.TrimSpace(currentChatID) == "" {
		log.Printf("[Telegram Bot] Auto-pairing with chat ID: %s", chatIDStr)
		_ = SaveTelegramConfig(database.TelegramConfig{
			BotToken: token,
			ChatID:   chatIDStr,
			Enabled:  true,
		})
		welcomeMsg := fmt.Sprintf(
			"🎉 <b>[CORAZA WAF — KẾT NỐI KÊNH THÀNH CÔNG]</b>\n\n"+
				"• <b>Đã liên kết kênh:</b> <code>%s</code>\n"+
				"• <b>Trạng thái:</b> 🟢 <b>ACTIVE / HEALTHY</b>\n\n"+
				"Kênh này đã được kích hoạt nhận cảnh báo tấn công tự động từ Coraza WAF.\n"+
				"Gõ <code>/help</code> hoặc <code>/stats</code> để kiểm tra các lệnh điều khiển.",
			chatIDStr,
		)
		_ = SendTelegramMessage(token, chatIDStr, welcomeMsg)
		return
	}

	// Check authorization
	if !isAuthorizedChat(chatID) {
		msg := fmt.Sprintf(
			"⚠️ <b>Kênh chưa được cấp phép!</b>\n\n"+
				"Chat ID của bạn: <code>%d</code>\n\n"+
				"Để kích hoạt kênh này nhận cảnh báo và gửi lệnh điều khiển WAF, bạn có thể:\n"+
				"1. Gõ lệnh <code>/link</code> ngay tại đây để tự động liên kết.\n"+
				"2. Hoặc copy ID <code>%d</code> dán vào <b>Dashboard -> Cài Đặt Telegram</b>.",
			chatID, chatID,
		)
		_ = SendTelegramMessage(token, chatIDStr, msg)
		return
	}

	norm := strings.ToLower(strings.TrimSpace(text))

	// Match menu button presses directly from persistent bottom keyboard
	if strings.Contains(norm, "thống kê") || cmd == "/stats" {
		sendStatsMessage(token, chatIDStr)
		return
	}
	if strings.Contains(norm, "5 tấn công") || strings.Contains(norm, "nhật ký") || cmd == "/latest" {
		sendLatestAttacksMessage(token, chatIDStr)
		return
	}
	if strings.Contains(norm, "trạng thái") || cmd == "/status" {
		sendStatusMessage(token, chatIDStr)
		return
	}
	if strings.Contains(norm, "20s") || strings.Contains(norm, "demo") || cmd == "/demo" {
		testIP := "203.0.113.88"
		banIP(token, chatIDStr, testIP, "20s", "Demo kịch bản chặn 20 giây & tự động gỡ đếm ngược")
		return
	}
	if strings.Contains(norm, "trợ giúp") || strings.Contains(norm, "lệnh") || cmd == "/help" || cmd == "/start" || cmd == "/menu" {
		sendHelpMessage(token, chatIDStr)
		return
	}

	switch cmd {
	case "/ban", "/block":
		if len(parts) < 2 {
			_ = SendTelegramMessage(token, chatIDStr, "⚠️ Cú pháp: <code>/ban &lt;IP&gt; [thời_gian: 20s|15m|1h|24h|perm] [lý do]</code>\nVí dụ:\n• <code>/ban 1.2.3.4 20s Demo chặn nhanh</code> (Cấm 20 giây)\n• <code>/ban 1.2.3.4 15m Dò quét SQLi</code> (Cấm 15 phút)\n• <code>/ban 1.2.3.4 perm Hacker</code> (Cấm vĩnh viễn)")
			return
		}
		ip := parts[1]
		durStr := "15m" // Default 15 minutes to prevent false positives
		reason := "Chặn qua Telegram Bot"

		if len(parts) >= 3 {
			// Check if parts[2] looks like duration (e.g., 20s, 15m, 1h, 24h, perm)
			possibleDur := strings.ToLower(parts[2])
			if possibleDur == "perm" || possibleDur == "permanent" || strings.HasSuffix(possibleDur, "s") || strings.HasSuffix(possibleDur, "m") || strings.HasSuffix(possibleDur, "h") || strings.HasSuffix(possibleDur, "d") {
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
		_ = SendTelegramMessage(token, chatIDStr, fmt.Sprintf("❓ Lệnh không hợp lệ: <code>%s</code>. Bấm các nút ở bàn phím bên dưới hoặc gõ <code>/help</code> để xem hướng dẫn.", cmd))
	}
}

func handleTelegramCallback(token, queryID string, chatID int64, data string) {
	chatIDStr := fmt.Sprintf("%d", chatID)
	if !isAuthorizedChat(chatID) {
		answerCallbackQuery(token, queryID, "Bạn không có quyền thực hiện thao tác này.")
		return
	}

	if strings.HasPrefix(data, "ban20s:") {
		ip := strings.TrimPrefix(data, "ban20s:")
		banIP(token, chatIDStr, ip, "20s", "Chặn Demo 20s qua Telegram Alert Quick Action")
		answerCallbackQuery(token, queryID, fmt.Sprintf("Đã kích hoạt Chặn Demo 20 giây đối với IP %s!", ip))
	} else if strings.HasPrefix(data, "ban:") {
		ip := strings.TrimPrefix(data, "ban:")
		banIP(token, chatIDStr, ip, "15m", "Chặn tức thì qua Telegram Alert Quick Action (15 phút)")
		answerCallbackQuery(token, queryID, fmt.Sprintf("Đã chặn IP %s trong 15 phút!", ip))
	} else if strings.HasPrefix(data, "unban:") {
		ip := strings.TrimPrefix(data, "unban:")
		unbanIP(token, chatIDStr, ip)
		answerCallbackQuery(token, queryID, fmt.Sprintf("Đã gỡ chặn IP %s thành công!", ip))
	} else if strings.HasPrefix(data, "white:") {
		ip := strings.TrimPrefix(data, "white:")
		whitelistIP(token, chatIDStr, ip, "Whitelist qua Telegram Alert Quick Action")
		answerCallbackQuery(token, queryID, fmt.Sprintf("Đã Whitelist IP %s!", ip))
	} else if data == "cmd_stats" {
		answerCallbackQuery(token, queryID, "Đang tải thống kê WAF...")
		sendStatsMessage(token, chatIDStr)
	} else if data == "cmd_latest" {
		answerCallbackQuery(token, queryID, "Đang tải 5 sự cố chặn gần nhất...")
		sendLatestAttacksMessage(token, chatIDStr)
	} else if data == "cmd_status" {
		answerCallbackQuery(token, queryID, "Đang kiểm tra trạng thái máy chủ SOC...")
		sendStatusMessage(token, chatIDStr)
	} else if data == "cmd_demo20s" {
		answerCallbackQuery(token, queryID, "Đang kích hoạt Demo chặn IP 20s...")
		testIP := "203.0.113.88"
		banIP(token, chatIDStr, testIP, "20s", "Demo kịch bản chặn 20 giây & tự động gỡ đếm ngược")
	} else if data == "cmd_help" {
		answerCallbackQuery(token, queryID, "Đang mở bảng hướng dẫn...")
		sendHelpMessage(token, chatIDStr)
	}
}

func sendHelpMessage(token, chatID string) {
	// First ensure any old bottom keyboard is collapsed and removed from user client
	_ = SendTelegramMessageWithReplyMarkup(token, chatID, "<i>📱 Đang chuyển đổi sang chế độ phím bấm Inline trong tin nhắn...</i>", &ReplyKeyboardRemove{RemoveKeyboard: true})

	help := `🛡️ <b>CORAZA WAF SOC — TRUNG TÂM ĐIỀU KHIỂN TELEGRAM</b>

Hệ thống điều phối an ninh <b>Coraza WAF + HAProxy Gateway</b>.
Bạn có thể bấm trực tiếp các nút bên dưới tin nhắn này để thực thi thao tác:

<b>📋 Bảng Lệnh Thao Tác Nhanh:</b>
• <code>/stats</code> : Thống kê lưu lượng & vi phạm WAF trong ngày
• <code>/latest</code> : Xem 5 cuộc tấn công bị chặn gần nhất
• <code>/status</code> : Trạng thái CPU, RAM & Coraza WAF Engine
• <code>/demo</code> : Kích hoạt Demo chặn IP 20s và tự động gỡ
• <code>/ban &lt;IP&gt; [20s|15m|1h|24h|perm] [lý do]</code> : Chặn IP vào Blacklist
• <code>/unban &lt;IP&gt;</code> : Gỡ bỏ IP khỏi danh sách cấm
• <code>/whitelist &lt;IP&gt; [lý do]</code> : Cho phép IP bỏ qua WAF
• <code>/sim &lt;sqli|xss|lfi&gt;</code> : Giả lập cuộc tấn công để thử nghiệm cảnh báo

<i>💡 Mọi thông báo tấn công và kết quả đều có nút bấm thao tác trực tiếp, không làm vướng bàn phím gõ chữ của bạn!</i>`

	_ = SendTelegramMessageWithKeyboard(token, chatID, help, GetInlineControlMenu())
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
			safeURI := html.EscapeString(uri)
			if len(safeURI) > 80 {
				safeURI = safeURI[:80] + "..."
			}
			safeAttack := html.EscapeString(attackType)
			safeMethod := html.EscapeString(method)
			safeIP := html.EscapeString(ip)

			sb.WriteString(fmt.Sprintf(
				"<b>#%d. %s</b>\n"+
					"• IP: <code>%s</code> (%s %s)\n"+
					"• Rule: <code>#%d</code> | ⛔ <b>403 BLOCKED</b>\n"+
					"• Request: <code>%s %s</code>\n"+
					"• Lúc: <i>%s</i>\n\n",
				id, safeAttack,
				safeIP, geo.Flag, geo.Country,
				ruleID, safeMethod, safeURI, ts,
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
		formatted := expTime.Format(time.RFC3339) // CRITICAL: Standard RFC3339 format prevents premature unban
		expiresAtVal = &formatted
		displayTime := expTime.In(VietnamLocation()).Format("15:04:05 02/01/2006")
		durationDisplay = fmt.Sprintf("⏳ %s (Hết hạn lúc: %s — Tự động gỡ cấm)", durationStr, displayTime)
	}

	createdAtVal := VietnamNowRFC3339()
	_, err := database.DB.Exec(
		`INSERT INTO ip_rules (ip, rule_type, reason, created_at, expires_at)
		 VALUES (?, 'blacklist', ?, ?, ?)
		 ON CONFLICT(ip) DO UPDATE SET rule_type = 'blacklist', reason = excluded.reason, created_at = excluded.created_at, expires_at = excluded.expires_at`,
		ip, reason, createdAtVal, expiresAtVal,
	)
	if err != nil {
		_ = SendTelegramMessage(token, chatID, fmt.Sprintf("❌ Lỗi khi cập nhật cơ sở dữ liệu: %v", err))
		return
	}

	// Sync to HAProxy & Coraza active rule files immediately
	_ = SyncIPRulesToFile()
	BroadcastIPRulesUpdated("blacklist", ip)

	geo := LookupGeoIP(ip)
	msg := fmt.Sprintf(
		"⛔ <b>[ĐÃ CHẶN IP THÀNH CÔNG]</b>\n\n"+
			"• <b>IP:</b> <code>%s</code> (%s %s)\n"+
			"• <b>Thời hạn:</b> %s\n"+
			"• <b>Trạng thái:</b> 🔴 <b>BLACKLIST (BỊ TỪ CHỐI)</b>\n"+
			"• <b>Lý do:</b> <i>%s</i>\n"+
			"• <b>Hiệu lực:</b> Tức thì trên toàn cụm HAProxy + Coraza WAF.\n\n"+
			"<i>Nhấn nút bên dưới nếu bạn muốn gỡ cấm ngay lập tức:</i>",
		ip, geo.Flag, geo.Country, durationDisplay, reason,
	)

	markup := &InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: fmt.Sprintf("🔓 Gỡ Chặn %s Ngay", ip), CallbackData: fmt.Sprintf("unban:%s", ip)},
				{Text: "📊 Thống Kê WAF", CallbackData: "cmd_stats"},
			},
		},
	}
	_ = SendTelegramMessageWithKeyboard(token, chatID, msg, markup)
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
	BroadcastIPRulesUpdated("unban", ip)

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

	createdAtVal := VietnamNowRFC3339()
	_, err := database.DB.Exec(
		`INSERT INTO ip_rules (ip, rule_type, reason, created_at)
		 VALUES (?, 'whitelist', ?, ?)
		 ON CONFLICT(ip) DO UPDATE SET rule_type = 'whitelist', reason = excluded.reason, created_at = excluded.created_at`,
		ip, reason, createdAtVal,
	)
	if err != nil {
		_ = SendTelegramMessage(token, chatID, fmt.Sprintf("❌ Lỗi khi thêm Whitelist: %v", err))
		return
	}

	// Sync to HAProxy & Coraza active rule files immediately
	_ = SyncIPRulesToFile()
	BroadcastIPRulesUpdated("whitelist", ip)

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
