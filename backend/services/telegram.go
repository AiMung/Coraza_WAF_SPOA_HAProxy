package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
	"waf-backend/database"
)

var (
	tgMu      sync.RWMutex
	tgConfig  database.TelegramConfig
	lastAlert time.Time
)

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
	defer tgMu.Unlock()

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
			return err
		}
	}

	tgConfig = cfg
	return nil
}

func GetTelegramConfig() database.TelegramConfig {
	tgMu.RLock()
	defer tgMu.RUnlock()
	return tgConfig
}

func SendTelegramMessage(token, chatID, message string) error {
	if token == "" || chatID == "" {
		return fmt.Errorf("bot token or chat ID is empty")
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload := map[string]string{
		"chat_id":    chatID,
		"text":       message,
		"parse_mode": "HTML",
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

func SendAttackAlert(logItem database.AttackLog) {
	tgMu.RLock()
	cfg := tgConfig
	tgMu.RUnlock()

	if !cfg.Enabled || cfg.BotToken == "" || cfg.ChatID == "" {
		return
	}

	// Simple debounce / rate limit for telegram alerts to prevent flood
	tgMu.Lock()
	if time.Since(lastAlert) < 2*time.Second {
		tgMu.Unlock()
		return
	}
	lastAlert = time.Now()
	tgMu.Unlock()

	msg := fmt.Sprintf(
		"🚨 <b>[CORAZA WAF ALERT] Phát Hiện Tấn Công!</b>\n\n"+
			"• <b>Loại tấn công:</b> <code>%s</code>\n"+
			"• <b>IP Nguồn:</b> <code>%s</code>\n"+
			"• <b>Hành động:</b> ⛔ <b>%s (403 Forbidden)</b>\n"+
			"• <b>Rule ID:</b> <code>%d</code>\n"+
			"• <b>Rule Msg:</b> %s\n"+
			"• <b>Method & URI:</b> <code>%s %s</code>\n"+
			"• <b>Thời gian:</b> <i>%s</i>\n\n"+
			"🛡️ <i>Hệ thống Coraza SPOA WAF đã tự động ngăn chặn thành công!</i>",
		logItem.AttackType,
		logItem.ClientIP,
		logItem.Action,
		logItem.RuleID,
		logItem.RuleMsg,
		logItem.Method,
		logItem.URI,
		logItem.Timestamp,
	)

	go func() {
		if err := SendTelegramMessage(cfg.BotToken, cfg.ChatID, msg); err != nil {
			log.Printf("[Telegram] Failed to send alert: %v", err)
		}
	}()
}
