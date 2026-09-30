package database

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB

type AttackLog struct {
	ID         int64  `json:"id"`
	TxnID      string `json:"txn_id"`
	ClientIP   string `json:"client_ip"`
	Timestamp  string `json:"timestamp"`
	Method     string `json:"method"`
	URI        string `json:"uri"`
	UserAgent  string `json:"user_agent"`
	AttackType string `json:"attack_type"`
	RuleID     int    `json:"rule_id"`
	RuleMsg    string `json:"rule_msg"`
	Action     string `json:"action"`
	Status     int    `json:"status"`
	RawPayload string `json:"raw_payload"`
	TargetHost string `json:"target_host"`
	Country    string `json:"country,omitempty"`
	City       string `json:"city,omitempty"`
	Flag       string `json:"flag,omitempty"`
}

type IPRule struct {
	ID        int64   `json:"id"`
	IP        string  `json:"ip"`
	RuleType  string  `json:"rule_type"` // "blacklist" or "whitelist"
	Reason    string  `json:"reason"`
	CreatedAt string  `json:"created_at"`
	ExpiresAt *string `json:"expires_at,omitempty"`
	Country   string  `json:"country,omitempty"`
	Flag      string  `json:"flag,omitempty"`
}

type ProtectedSite struct {
	ID             int64  `json:"id"`
	Name           string `json:"name"`
	Domain         string `json:"domain"`
	UpstreamTarget string `json:"upstream_target"`
	Port           int    `json:"port"`
	SSLEnabled     bool   `json:"ssl_enabled"`
	WAFMode        string `json:"waf_mode"` // "prevention", "detection", "bypass"
	Status         string `json:"status"`   // "active", "paused"
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
	Health         string `json:"health,omitempty"`
	LatencyMs      int64  `json:"latency_ms"`
	StatusCode     int    `json:"status_code"`
	LastPingAt     string `json:"last_ping_at,omitempty"`
	ValidRequests  int64  `json:"valid_requests"`
	BlockedRequests int64 `json:"blocked_requests"`
	AttacksBlocked int64  `json:"attacks_blocked,omitempty"`
	TotalRequests  int64  `json:"total_requests,omitempty"`
}

type TelegramConfig struct {
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"`
	Enabled  bool   `json:"enabled"`
}

type CustomRule struct {
	ID          int64  `json:"id"`
	RuleID      int    `json:"rule_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	SecRule     string `json:"sec_rule"`
	Severity    string `json:"severity"`
	Action      string `json:"action"` // "deny", "allow", "drop"
	Phase       int    `json:"phase"`  // 1, 2
	Enabled     bool   `json:"enabled"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

func InitDB(dbPath string) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("Warning creating db directory: %v", err)
	}

	var err error
	DB, err = sql.Open("sqlite3", dbPath+"?_journal=WAL&_sync=NORMAL")
	if err != nil {
		log.Fatalf("Failed to open SQLite database: %v", err)
	}

	createTablesQuery := `
	CREATE TABLE IF NOT EXISTS attack_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		txn_id TEXT,
		client_ip TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		method TEXT,
		uri TEXT,
		user_agent TEXT,
		attack_type TEXT,
		rule_id INTEGER,
		rule_msg TEXT,
		action TEXT,
		status INTEGER,
		raw_payload TEXT,
		target_host TEXT DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS ip_rules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ip TEXT UNIQUE,
		rule_type TEXT,
		reason TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		expires_at DATETIME
	);

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT
	);

	CREATE TABLE IF NOT EXISTS traffic_stats (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		total_reqs INTEGER DEFAULT 0,
		blocked_reqs INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS protected_sites (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		domain TEXT UNIQUE NOT NULL,
		upstream_target TEXT NOT NULL,
		port INTEGER DEFAULT 80,
		ssl_enabled INTEGER DEFAULT 0,
		waf_mode TEXT DEFAULT 'prevention',
		status TEXT DEFAULT 'active',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS custom_rules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		rule_id INTEGER UNIQUE,
		name TEXT NOT NULL,
		description TEXT,
		sec_rule TEXT NOT NULL,
		severity TEXT DEFAULT 'CRITICAL',
		action TEXT DEFAULT 'deny',
		phase INTEGER DEFAULT 2,
		enabled INTEGER DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err = DB.Exec(createTablesQuery)
	if err != nil {
		log.Fatalf("Failed to initialize database tables: %v", err)
	}
	_, _ = DB.Exec("ALTER TABLE ip_rules ADD COLUMN expires_at DATETIME")
	_, _ = DB.Exec("ALTER TABLE attack_logs ADD COLUMN target_host TEXT DEFAULT ''")

	// Seed default protected site if empty
	var siteCount int
	_ = DB.QueryRow("SELECT COUNT(*) FROM protected_sites").Scan(&siteCount)
	if siteCount == 0 {
		_, _ = DB.Exec(`
			INSERT INTO protected_sites (name, domain, upstream_target, port, ssl_enabled, waf_mode, status)
			VALUES ('Demo Web Application', '192.168.246.100', 'protected-app:80', 80, 0, 'prevention', 'active')
		`)
	}

	// Seed default custom rules if empty
	var ruleCount int
	_ = DB.QueryRow("SELECT COUNT(*) FROM custom_rules").Scan(&ruleCount)
	if ruleCount == 0 {
		defaultRules := []struct {
			ruleID      int
			name        string
			description string
			secRule     string
			severity    string
			action      string
			phase       int
		}{
			{
				1001,
				"Smoke Test Verification Rule",
				"Rule kiểm tra nhanh hệ thống WAF hoạt động bằng tham số ?testwaf=attack",
				"SecRule ARGS:testwaf \"@streq attack\" \"id:1001,phase:1,deny,status:403,log,auditlog,msg:'Test WAF Signature Detected - System Verified',tag:'custom-test',severity:'CRITICAL'\"",
				"CRITICAL",
				"deny",
				1,
			},
			{
				1002,
				"Block Malicious User-Agents / Scanners",
				"Chặn các công cụ quét lỗ hổng bảo mật tự động (sqlmap, nikto, acunetix, dirbuster...)",
				"SecRule REQUEST_HEADERS:User-Agent \"@rx (?i)(sqlmap|nikto|acunetix|nessus|nmap|masscan|dirbuster|gobuster|wpscan)\" \"id:1002,phase:1,deny,status:403,log,auditlog,msg:'Security Scanner / Vulnerability Probing Detected',tag:'scanner-block',severity:'CRITICAL'\"",
				"CRITICAL",
				"deny",
				1,
			},
			{
				1003,
				"Quick SQL Injection Pattern Block",
				"Chặn nhanh các mẫu SQL Injection kinh điển (union select, or 1=1, information_schema)",
				"SecRule ARGS|REQUEST_URI|REQUEST_BODY \"@rx (?i)(union\\s+select|select\\s+.*\\s+from|or\\s+1\\s*=\\s*1|and\\s+1\\s*=\\s*1|--\\s*$|information_schema|sys\\.tables)\" \"id:1003,phase:2,deny,status:403,log,auditlog,msg:'Generic SQL Injection Pattern Matched',tag:'sqli',severity:'CRITICAL'\"",
				"CRITICAL",
				"deny",
				2,
			},
			{
				1004,
				"Quick Cross-Site Scripting (XSS) Block",
				"Chặn các chuỗi script độc hại phổ biến trong tham số và body (<script, onerror=, onload=)",
				"SecRule ARGS|REQUEST_URI|REQUEST_BODY \"@rx (?i)(<script\\b|javascript:|onerror\\s*=|onload\\s*=|alert\\(|document\\.cookie|%3Cscript)\" \"id:1004,phase:2,deny,status:403,log,auditlog,msg:'Generic Cross-Site Scripting (XSS) Matched',tag:'xss',severity:'CRITICAL'\"",
				"CRITICAL",
				"deny",
				2,
			},
			{
				1005,
				"Path Traversal & LFI Block",
				"Chặn hành vi dò quét đọc trộm tệp hệ thống (/etc/passwd, ../, boot.ini)",
				"SecRule ARGS|REQUEST_URI \"@rx (?i)(\\.\\./|\\.\\.\\\\|/etc/passwd|/etc/shadow|/windows/win\\.ini|/boot\\.ini)\" \"id:1005,phase:1,deny,status:403,log,auditlog,msg:'Path Traversal / Local File Inclusion (LFI) Attempt',tag:'lfi',severity:'CRITICAL'\"",
				"CRITICAL",
				"deny",
				1,
			},
		}

		for _, r := range defaultRules {
			_, _ = DB.Exec(`
				INSERT INTO custom_rules (rule_id, name, description, sec_rule, severity, action, phase, enabled)
				VALUES (?, ?, ?, ?, ?, ?, ?, 1)
			`, r.ruleID, r.name, r.description, r.secRule, r.severity, r.action, r.phase)
		}
	}

	log.Println("SQLite Database initialized successfully.")
}
