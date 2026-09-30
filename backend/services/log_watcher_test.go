package services

import (
	"encoding/json"
	"testing"
)

func TestClassifyAttack(t *testing.T) {
	tests := []struct {
		ruleID   int
		msg      string
		uri      string
		expected string
	}{
		{942100, "SQL Injection Attack Detected via libinjection", "/search?q=1' OR 1=1", "SQL Injection (SQLi)"},
		{1003, "custom sql pattern", "/test", "SQL Injection (SQLi)"},
		{0, "plain msg", "/login?user=UNION SELECT", "SQL Injection (SQLi)"},
		{941100, "XSS Filter - Category 1: Script Tag Vector", "/page?name=<script>alert(1)</script>", "Cross-Site Scripting (XSS)"},
		{1004, "xss detected", "/", "Cross-Site Scripting (XSS)"},
		{930100, "Path Traversal Attack (/../)", "/download?file=../../etc/passwd", "Path Traversal (LFI)"},
		{1005, "lfi attempt", "/etc/shadow", "Path Traversal (LFI)"},
		{932100, "Remote Command Execution", "/exec?cmd=whoami", "Remote Code Execution (RCE)"},
		{1002, "Nikto web scanner", "/", "Vulnerability Scanner"},
		{0, "sqlmap/1.4 scanner probe", "/", "Vulnerability Scanner"},
		{0, "Malicious crawler bot", "/", "Malicious Bot"},
		{999999, "Unknown anomalous payload", "/safe", "OWASP Threat Matched"},
	}

	for _, tt := range tests {
		got := ClassifyAttack(tt.ruleID, tt.msg, tt.uri)
		if got != tt.expected {
			t.Errorf("ClassifyAttack(%d, %q, %q) = %q; want %q", tt.ruleID, tt.msg, tt.uri, got, tt.expected)
		}
	}
}

func TestExtractHeaderString(t *testing.T) {
	headers := map[string]interface{}{
		"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)",
		"Host":       []interface{}{"example.com"},
		"empty-list": []interface{}{},
	}

	if val := extractHeaderString(headers, "user-agent"); val != "Mozilla/5.0 (X11; Linux x86_64)" {
		t.Errorf("extractHeaderString user-agent failed: %s", val)
	}

	if val := extractHeaderString(headers, "HOST"); val != "example.com" {
		t.Errorf("extractHeaderString host failed: %s", val)
	}

	if val := extractHeaderString(headers, "Non-Existent"); val != "" {
		t.Errorf("extractHeaderString non-existent should be empty: %s", val)
	}

	if val := extractHeaderString(headers, "empty-list"); val != "" {
		t.Errorf("extractHeaderString empty-list should be empty: %s", val)
	}
}

func TestCorazaAuditLogUnmarshal(t *testing.T) {
	rawJSON := `{
		"transaction": {
			"id": "tx-12345",
			"client_ip": "192.168.1.50",
			"client_port": 54321,
			"timestamp": "29/Sep/2026:10:00:00 +0700",
			"unix_timestamp": 1790676000,
			"is_interrupted": true,
			"request": {
				"method": "GET",
				"protocol": "HTTP/1.1",
				"uri": "/api/users?id=1%20UNION%20SELECT%20null,null--",
				"headers": {
					"user-agent": "sqlmap/1.5"
				},
				"body": ""
			},
			"response": {
				"status": 403
			}
		},
		"messages": [
			{
				"actionset": "block",
				"message": "[id \"942100\"] [msg \"SQL Injection Attack Detected via libinjection\"] [data \"Matched Data: UNION SELECT\"]"
			}
		]
	}`

	var logItem CorazaAuditLog
	err := json.Unmarshal([]byte(rawJSON), &logItem)
	if err != nil {
		t.Fatalf("Failed to unmarshal sample Coraza log: %v", err)
	}

	if logItem.Transaction.ID != "tx-12345" {
		t.Errorf("Expected Tx ID tx-12345, got %s", logItem.Transaction.ID)
	}
	if logItem.Transaction.ClientIP != "192.168.1.50" {
		t.Errorf("Expected ClientIP 192.168.1.50, got %s", logItem.Transaction.ClientIP)
	}
	if !logItem.Transaction.IsInterrupted {
		t.Errorf("Expected IsInterrupted to be true")
	}
	if len(logItem.Messages) != 1 {
		t.Fatalf("Expected 1 message, got %d", len(logItem.Messages))
	}

	// Test regex matching
	msg := logItem.Messages[0].Message
	matches := ruleIDRegex.FindStringSubmatch(msg)
	if len(matches) < 2 || matches[1] != "942100" {
		t.Errorf("ruleIDRegex match failed on %s: %+v", msg, matches)
	}

	msgMatches := ruleMsgRegex.FindStringSubmatch(msg)
	if len(msgMatches) < 2 || msgMatches[1] != "SQL Injection Attack Detected via libinjection" {
		t.Errorf("ruleMsgRegex match failed: %+v", msgMatches)
	}
}
