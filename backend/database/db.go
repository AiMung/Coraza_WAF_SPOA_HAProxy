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
}

type IPRule struct {
	ID        int64  `json:"id"`
	IP        string `json:"ip"`
	RuleType  string `json:"rule_type"` // "blacklist" or "whitelist"
	Reason    string `json:"reason"`
	CreatedAt string `json:"created_at"`
}

type TelegramConfig struct {
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"`
	Enabled  bool   `json:"enabled"`
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
		raw_payload TEXT
	);

	CREATE TABLE IF NOT EXISTS ip_rules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ip TEXT UNIQUE,
		rule_type TEXT,
		reason TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
	`

	_, err = DB.Exec(createTablesQuery)
	if err != nil {
		log.Fatalf("Failed to initialize database tables: %v", err)
	}
	log.Println("SQLite Database initialized successfully.")
}
