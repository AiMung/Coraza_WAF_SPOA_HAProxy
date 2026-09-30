package services

import (
	"path/filepath"
	"testing"
	"waf-backend/database"
)

func initTestDB(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "tg_test.db")
	database.InitDB(dbPath)
}

func TestTelegramAuthorization(t *testing.T) {
	initTestDB(t)

	// Case 1: Configured chat ID
	tgMu.Lock()
	tgConfig = database.TelegramConfig{
		BotToken: "test_token",
		ChatID:   "99887766",
		Enabled:  true,
	}
	tgMu.Unlock()

	if !isAuthorizedChat(99887766) {
		t.Errorf("Expected chat ID 99887766 to be authorized")
	}

	if isAuthorizedChat(11223344) {
		t.Errorf("Expected chat ID 11223344 to be unauthorized")
	}

	// Case 2: Unconfigured chat ID (initial pairing mode)
	tgMu.Lock()
	tgConfig = database.TelegramConfig{
		BotToken: "test_token",
		ChatID:   "",
		Enabled:  true,
	}
	tgMu.Unlock()

	if !isAuthorizedChat(12345) {
		t.Errorf("Expected any chat ID to be allowed for initial pairing when config is empty")
	}
}

func TestTelegramBanAndUnbanIP(t *testing.T) {
	initTestDB(t)

	// 1. Ban valid IP
	banIP("", "0", "198.51.100.22", "15m", "Automated Telegram Test")

	var ruleType, reason string
	err := database.DB.QueryRow("SELECT rule_type, reason FROM ip_rules WHERE ip = ?", "198.51.100.22").Scan(&ruleType, &reason)
	if err != nil {
		t.Fatalf("Failed to find banned IP in database: %v", err)
	}

	if ruleType != "blacklist" {
		t.Errorf("Expected rule_type 'blacklist', got '%s'", ruleType)
	}

	// 2. Unban IP
	unbanIP("", "0", "198.51.100.22")

	var count int
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM ip_rules WHERE ip = ?", "198.51.100.22").Scan(&count)
	if count != 0 {
		t.Errorf("Expected IP to be removed after unban, count = %d", count)
	}
}

func TestTelegramWhitelistIP(t *testing.T) {
	initTestDB(t)

	whitelistIP("", "0", "203.0.113.88", "Trusted IP Test")

	var ruleType string
	err := database.DB.QueryRow("SELECT rule_type FROM ip_rules WHERE ip = ?", "203.0.113.88").Scan(&ruleType)
	if err != nil {
		t.Fatalf("Failed to find whitelisted IP: %v", err)
	}

	if ruleType != "whitelist" {
		t.Errorf("Expected rule_type 'whitelist', got '%s'", ruleType)
	}
}

func TestTelegramInvalidIP(t *testing.T) {
	initTestDB(t)

	banIP("", "0", "not-a-valid-ip", "15m", "Test reason")

	var count int
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM ip_rules WHERE ip = ?", "not-a-valid-ip").Scan(&count)
	if count != 0 {
		t.Errorf("Invalid IP should not be inserted into database")
	}
}
