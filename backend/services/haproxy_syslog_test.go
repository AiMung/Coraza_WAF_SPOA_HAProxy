package services

import (
	"testing"
	"waf-backend/database"
)

func TestProcessHAProxyLogLine(t *testing.T) {
	database.InitDB(":memory:")

	// 1. Line without blocked-by should be ignored
	normalLine := `192.168.1.100:54321 [01/Oct/2026:09:15:30.123] default backend_site_1/origin_1 200 1024 "GET /index.html HTTP/1.1" - spoa-error:- waf-action:- blocked-by:-`
	if ProcessHAProxyLogLine(normalLine) {
		t.Errorf("Expected normalLine to not be logged as attack")
	}

	// 2. Line with Blacklist block
	blacklistLine := `192.168.246.50:54321 [01/Oct/2026:09:15:30.123] default - 403 212 "GET /secret HTTP/1.1" - spoa-error:- waf-action:- blocked-by:HAProxy-IP-Blacklist`
	if !ProcessHAProxyLogLine(blacklistLine) {
		t.Errorf("Expected blacklistLine to be processed and logged")
	}

	// 3. Line with CC flood block
	ccLine := `192.168.246.50:54322 [01/Oct/2026:09:15:31.456] default - 429 200 "GET /api/flood HTTP/1.1" - spoa-error:- waf-action:- blocked-by:aaWAF-CC-Shield`
	if !ProcessHAProxyLogLine(ccLine) {
		t.Errorf("Expected ccLine to be processed and logged")
	}

	// 4. Line with Scanner block
	scannerLine := `192.168.246.50:54323 [01/Oct/2026:09:15:32.789] default - 403 200 "GET /phpinfo.php HTTP/1.1" - spoa-error:- waf-action:- blocked-by:aaWAF-Scanner-Shield`
	if !ProcessHAProxyLogLine(scannerLine) {
		t.Errorf("Expected scannerLine to be processed and logged")
	}

	// Check count in database
	var count int
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM attack_logs").Scan(&count)
	if count != 3 {
		t.Errorf("Expected 3 attack logs, got %d", count)
	}

	// Check that CC attack was classified properly
	var attackType string
	_ = database.DB.QueryRow("SELECT attack_type FROM attack_logs WHERE uri = '/api/flood'").Scan(&attackType)
	if attackType != "CC Flood / HTTP Flood" {
		t.Errorf("Expected attack_type 'CC Flood / HTTP Flood', got '%s'", attackType)
	}
}

func TestRecordDirectBlock(t *testing.T) {
	database.InitDB(":memory:")
	RecordDirectBlock("10.0.0.99", "POST", "/login", "curl/7.68.0", "CC Flood / HTTP Flood", 10003, "Rate Limit Exceeded", 429, "Test Site")

	var count int
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM attack_logs WHERE client_ip = '10.0.0.99'").Scan(&count)
	if count != 1 {
		t.Errorf("Expected 1 log, got %d", count)
	}
}
