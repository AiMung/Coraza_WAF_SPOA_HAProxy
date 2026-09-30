package services

import (
	"bufio"
	"encoding/json"
	"io"
	"log"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"waf-backend/database"
)

// Coraza JSON Audit Log Schema matching exact Coraza v3 SPOA format
type CorazaAuditLog struct {
	Transaction struct {
		ID            string                 `json:"id"`
		ClientIP      string                 `json:"client_ip"`
		ClientPort    int                    `json:"client_port"`
		Timestamp     string                 `json:"timestamp"`
		UnixTimestamp int64                  `json:"unix_timestamp"`
		HostIP        string                 `json:"host_ip"`
		ServerID      string                 `json:"server_id"`
		IsInterrupted bool                   `json:"is_interrupted"`
		Request       struct {
			Method   string                 `json:"method"`
			Protocol string                 `json:"protocol"`
			URI      string                 `json:"uri"`
			Headers  map[string]interface{} `json:"headers"`
			Body     string                 `json:"body"`
		} `json:"request"`
		Response struct {
			Status  int                    `json:"status"`
			Headers map[string]interface{} `json:"headers"`
		} `json:"response"`
	} `json:"transaction"`
	Messages []struct {
		ActionSet    string `json:"actionset"`
		Message      string `json:"message"`
		ErrorMessage string `json:"error_message"`
	} `json:"messages"`
}

var (
	ruleIDRegex  = regexp.MustCompile(`\[id\s+"?(\d+)"?\]`)
	ruleMsgRegex = regexp.MustCompile(`\[msg\s+"([^"]+)"\]`)
	dataRegex    = regexp.MustCompile(`\[data\s+"([^"]*)"\]`)
)

func ClassifyAttack(ruleID int, msg string, uri string) string {
	msgLower := strings.ToLower(msg)
	uriLower := strings.ToLower(uri)

	switch {
	case strings.Contains(msgLower, "scanner") || ruleID == 1002 || strings.Contains(msgLower, "nikto") || strings.Contains(msgLower, "sqlmap"):
		return "Vulnerability Scanner"
	case strings.Contains(msgLower, "sql") || strings.Contains(uriLower, "union") || strings.Contains(uriLower, "select") || (ruleID >= 942000 && ruleID <= 942999) || ruleID == 1003:
		return "SQL Injection (SQLi)"
	case strings.Contains(msgLower, "xss") || strings.Contains(uriLower, "<script") || strings.Contains(uriLower, "alert(") || (ruleID >= 941000 && ruleID <= 941999) || ruleID == 1004:
		return "Cross-Site Scripting (XSS)"
	case strings.Contains(msgLower, "traversal") || strings.Contains(msgLower, "lfi") || strings.Contains(uriLower, "..") || (ruleID >= 930000 && ruleID <= 930999) || ruleID == 1005:
		return "Path Traversal (LFI)"
	case strings.Contains(msgLower, "rce") || strings.Contains(msgLower, "command") || (ruleID >= 932000 && ruleID <= 932999):
		return "Remote Code Execution (RCE)"
	case strings.Contains(msgLower, "bot") || strings.Contains(msgLower, "crawler"):
		return "Malicious Bot"
	default:
		return "OWASP Threat Matched"
	}
}

func extractHeaderString(headers map[string]interface{}, key string) string {
	for k, v := range headers {
		if strings.EqualFold(k, key) {
			switch val := v.(type) {
			case string:
				return val
			case []interface{}:
				if len(val) > 0 {
					if str, ok := val[0].(string); ok {
						return str
					}
				}
			case []string:
				if len(val) > 0 {
					return val[0]
				}
			}
		}
	}
	return ""
}

func StartLogWatcher(logFilePath string) {
	log.Printf("[LogWatcher] Initializing log stream watcher on %s ...", logFilePath)
	go func() {
		// 1. Historical log scan from start of file on startup
		if file, err := os.Open(logFilePath); err == nil {
			scanner := bufio.NewScanner(file)
			// Increase buffer size for large JSON lines
			buf := make([]byte, 1024*1024)
			scanner.Buffer(buf, 10*1024*1024)
			count := 0
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" || !strings.HasPrefix(line, "{") {
					continue
				}
				var auditLog CorazaAuditLog
				if err := json.Unmarshal([]byte(line), &auditLog); err != nil {
					continue
				}
				if processAuditLog(auditLog, false) {
					count++
				}
			}
			file.Close()
			log.Printf("[LogWatcher] Ingested %d historical attack logs from %s", count, logFilePath)
		} else {
			log.Printf("[LogWatcher] Warning: unable to open %s for historical read: %v", logFilePath, err)
		}

		// 2. Real-time tailing of new audit logs
		for {
			file, err := os.Open(logFilePath)
			if err != nil {
				time.Sleep(2 * time.Second)
				continue
			}

			// Seek to end of file for live tailing
			file.Seek(0, io.SeekEnd)
			reader := bufio.NewReader(file)

			for {
				line, err := reader.ReadString('\n')
				if err != nil {
					if err == io.EOF {
						time.Sleep(300 * time.Millisecond)
						continue
					}
					break
				}

				line = strings.TrimSpace(line)
				if line == "" || !strings.HasPrefix(line, "{") {
					continue
				}

				var auditLog CorazaAuditLog
				if err := json.Unmarshal([]byte(line), &auditLog); err != nil {
					log.Printf("[LogWatcher] JSON Unmarshal error: %v", err)
					continue
				}

				processAuditLog(auditLog, true)
			}
			file.Close()
		}
	}()
}

func processAuditLog(auditLog CorazaAuditLog, isLive bool) bool {
	txn := auditLog.Transaction
	if txn.ID == "" {
		return false
	}

	var ruleID int = 1001
	var ruleMsg string = "Security Policy Blocked"
	var attackType string = "General Web Attack"
	var matchedData string = ""

	// Find the most specific attack rule from messages
	for _, msgItem := range auditLog.Messages {
		text := msgItem.ErrorMessage
		if text == "" {
			text = msgItem.Message
		}

		idMatches := ruleIDRegex.FindStringSubmatch(text)
		msgMatches := ruleMsgRegex.FindStringSubmatch(text)
		dataMatches := dataRegex.FindStringSubmatch(text)

		var curID int
		if len(idMatches) > 1 {
			curID, _ = strconv.Atoi(idMatches[1])
		}
		var curMsg string
		if len(msgMatches) > 1 {
			curMsg = msgMatches[1]
		}
		if len(dataMatches) > 1 && matchedData == "" {
			matchedData = dataMatches[1]
		}

		// Prioritize actionable attack rules over protocol warnings (e.g. 920350)
		if curID > 0 && curID != 920350 && curID != 949110 {
			ruleID = curID
			if curMsg != "" {
				ruleMsg = curMsg
			}
			break
		} else if curID > 0 && ruleID == 1001 {
			ruleID = curID
			if curMsg != "" {
				ruleMsg = curMsg
			}
		}
	}

	attackType = ClassifyAttack(ruleID, ruleMsg, txn.Request.URI)
	userAgent := extractHeaderString(txn.Request.Headers, "user-agent")
	hostHeader := extractHeaderString(txn.Request.Headers, "host")
	// Strip port from Host header (e.g. "example.com:8080" -> "example.com")
	if idx := strings.Index(hostHeader, ":"); idx > 0 {
		hostHeader = hostHeader[:idx]
	}
	// Resolve host to registered site name for attack attribution
	targetHost := hostHeader
	if targetHost != "" {
		var siteName string
		err := database.DB.QueryRow("SELECT name FROM protected_sites WHERE domain = ? LIMIT 1", targetHost).Scan(&siteName)
		if err == nil && siteName != "" {
			targetHost = siteName + " (" + hostHeader + ")"
		}
	}

	payload := txn.Request.Body
	if payload == "" {
		if matchedData != "" {
			payload = matchedData
		} else {
			payload = txn.Request.URI
		}
	}

	timestampStr := txn.Timestamp
	if timestampStr == "" {
		timestampStr = time.Now().Format("2006-01-02 15:04:05")
	} else {
		// Normalize 2026/09/28 08:03:31 to 2026-09-28 15:04:05
		timestampStr = strings.ReplaceAll(timestampStr, "/", "-")
	}

	clientIP := txn.ClientIP
	if clientIP == "" || clientIP == "127.0.0.1" {
		clientIP = "192.168.246.1"
	}

	attackRecord := database.AttackLog{
		TxnID:      txn.ID,
		ClientIP:   clientIP,
		Timestamp:  timestampStr,
		Method:     txn.Request.Method,
		URI:        txn.Request.URI,
		UserAgent:  userAgent,
		AttackType: attackType,
		RuleID:     ruleID,
		RuleMsg:    ruleMsg,
		Action:     "DENY",
		Status:     403,
		RawPayload: payload,
		TargetHost: targetHost,
	}

	// Avoid duplicate insertions
	var existingID int64
	err := database.DB.QueryRow("SELECT id FROM attack_logs WHERE txn_id = ?", attackRecord.TxnID).Scan(&existingID)
	if err == nil && existingID > 0 {
		return false
	}

	// Insert into SQLite
	res, err := database.DB.Exec(
		`INSERT INTO attack_logs (txn_id, client_ip, timestamp, method, uri, user_agent, attack_type, rule_id, rule_msg, action, status, raw_payload, target_host)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		attackRecord.TxnID, attackRecord.ClientIP, attackRecord.Timestamp,
		attackRecord.Method, attackRecord.URI, attackRecord.UserAgent,
		attackRecord.AttackType, attackRecord.RuleID, attackRecord.RuleMsg,
		attackRecord.Action, attackRecord.Status, attackRecord.RawPayload,
		attackRecord.TargetHost,
	)
	if err != nil {
		log.Printf("[LogWatcher] SQLite Insert error for txn %s: %v", attackRecord.TxnID, err)
		return false
	}

	id, _ := res.LastInsertId()
	attackRecord.ID = id

	if isLive {
		log.Printf("[LogWatcher] -> Real-time Attack Captured: [%s] IP: %s | Rule: %d (%s) | URI: %s",
			attackRecord.AttackType, attackRecord.ClientIP, attackRecord.RuleID, attackRecord.RuleMsg, attackRecord.URI)

		// Broadcast to WebSocket Dashboard with GeoIP enrichment
		geo := LookupGeoIP(attackRecord.ClientIP)
		jsonBytes, _ := json.Marshal(map[string]interface{}{
			"event": "new_attack",
			"data": map[string]interface{}{
				"id":          attackRecord.ID,
				"txn_id":      attackRecord.TxnID,
				"client_ip":   attackRecord.ClientIP,
				"timestamp":   attackRecord.Timestamp,
				"method":      attackRecord.Method,
				"uri":         attackRecord.URI,
				"user_agent":  attackRecord.UserAgent,
				"attack_type": attackRecord.AttackType,
				"rule_id":     attackRecord.RuleID,
				"rule_msg":    attackRecord.RuleMsg,
				"action":      attackRecord.Action,
				"status":      attackRecord.Status,
				"raw_payload": attackRecord.RawPayload,
				"target_host": attackRecord.TargetHost,
				"country":     geo.Country,
				"flag":        geo.Flag,
				"city":        geo.City,
				"lat":         geo.Lat,
				"lng":         geo.Lon,
			},
		})
		BroadcastEvent(jsonBytes)

		// Send Telegram alert
		SendAttackAlert(attackRecord)
	}

	return true
}
