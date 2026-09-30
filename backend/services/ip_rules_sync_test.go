package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"waf-backend/database"
)

func TestParseDurationToExpiration(t *testing.T) {
	// 1. Permanent
	if exp := ParseDurationToExpiration("permanent"); exp != nil {
		t.Errorf("Expected nil for permanent, got %v", exp)
	}
	if exp := ParseDurationToExpiration("perm"); exp != nil {
		t.Errorf("Expected nil for perm, got %v", exp)
	}
	if exp := ParseDurationToExpiration(""); exp != nil {
		t.Errorf("Expected nil for empty string, got %v", exp)
	}

	// 2. 15 minutes
	now := time.Now()
	exp15 := ParseDurationToExpiration("15m")
	if exp15 == nil {
		t.Fatalf("Expected non-nil for 15m")
	}
	diff15 := exp15.Sub(now)
	if diff15 < 14*time.Minute || diff15 > 16*time.Minute {
		t.Errorf("Expected ~15m, got %v", diff15)
	}

	// 3. 1 day
	exp1d := ParseDurationToExpiration("1d")
	if exp1d == nil {
		t.Fatalf("Expected non-nil for 1d")
	}
	diff1d := exp1d.Sub(now)
	if diff1d < 23*time.Hour || diff1d > 25*time.Hour {
		t.Errorf("Expected ~24h for 1d, got %v", diff1d)
	}
}

func TestSyncIPRulesToFile(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "sync_test.db")
	database.InitDB(dbPath)

	// Add test IP rules
	_, _ = database.DB.Exec("INSERT INTO ip_rules (ip, rule_type, reason) VALUES ('192.0.2.1', 'blacklist', 'Test Blacklist')")
	_, _ = database.DB.Exec("INSERT INTO ip_rules (ip, rule_type, reason) VALUES ('192.0.2.200', 'whitelist', 'Test Whitelist')")

	err := SyncIPRulesToFile()
	if err != nil {
		t.Fatalf("SyncIPRulesToFile failed: %v", err)
	}

	// Check if local files were written
	blackFile := "./haproxy/rules/blacklist.ips"
	if data, readErr := os.ReadFile(blackFile); readErr == nil {
		if !strings.Contains(string(data), "192.0.2.1") {
			t.Errorf("Expected 192.0.2.1 in %s, got: %s", blackFile, string(data))
		}
	}

	whiteFile := "./haproxy/rules/whitelist.ips"
	if data, readErr := os.ReadFile(whiteFile); readErr == nil {
		if !strings.Contains(string(data), "192.0.2.200") {
			t.Errorf("Expected 192.0.2.200 in %s, got: %s", whiteFile, string(data))
		}
	}
}
