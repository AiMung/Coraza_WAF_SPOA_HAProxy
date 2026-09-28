package services

import (
	"bufio"
	"encoding/json"
	"io"
	"log"
	"os"
	"strings"
	"time"
	"waf-backend/database"
)

// Coraza JSON Audit Log Schema
type CorazaAuditLog struct {
	Transaction struct {
		ID        string `json:"id"`
		ClientIP  string `json:"client_ip"`
		Timestamp string `json:"timestamp"`
		HostIP    string `json:"host_ip"`
		Request   struct {
			Method  string            `json:"method"`
			URI     string            `json:"uri"`
			Headers map[string]string `json:"headers"`
			Body    string            `json:"body"`
		} `json:"request"`
		Response struct {
			Status  int               `json:"status"`
			Headers map[string]string `json:"headers"`
		} `json:"response"`
		Producer struct {
			Messages []struct {
				Message string `json:"message"`
				Data    struct {
					File     string   `json:"file"`
					Line     int      `json:"line"`
					ID       int      `json:"id"`
					Data     string   `json:"data"`
					Severity string   `json:"severity"`
					Tags     []string `json:"tags"`
				} `json:"data"`
			} `json:"messages"`
		} `json:"producer"`
	} `json:"transaction"`
}

func ClassifyAttack(ruleID int, msg string, uri string) string {
	msgLower := strings.ToLower(msg)
	uriLower := strings.ToLower(uri)

	switch {
	case strings.Contains(msgLower, "sql") || strings.Contains(uriLower, "union") || strings.Contains(uriLower, "select") || (ruleID >= 942000 && ruleID <= 942999) || ruleID == 1003:
		return "SQL Injection (SQLi)"
	case strings.Contains(msgLower, "xss") || strings.Contains(uriLower, "<script") || (ruleID >= 941000 && ruleID <= 941999) || ruleID == 1004:
		return "Cross-Site Scripting (XSS)"
	case strings.Contains(msgLower, "traversal") || strings.Contains(msgLower, "lfi") || strings.Contains(uriLower, "..") || (ruleID >= 930000 && ruleID <= 930999) || ruleID == 1005:
		return "Path Traversal (LFI)"
	case strings.Contains(msgLower, "rce") || strings.Contains(msgLower, "command") || (ruleID >= 932000 && ruleID <= 932999):
		return "Remote Code Execution (RCE)"
	case strings.Contains(msgLower, "scanner") || ruleID == 1002:
		return "Vulnerability Scanner"
	case strings.Contains(msgLower, "bot") || strings.Contains(msgLower, "crawler"):
		return "Malicious Bot"
	default:
		return "OWASP Threat Matched"
	}
}

func StartLogWatcher(logFilePath string) {
	go func() {
		for {
			file, err := os.Open(logFilePath)
			if err != nil {
				time.Sleep(2 * time.Second)
				continue
			}

			// Seek to end initially or read from start
			file.Seek(0, io.SeekEnd)
			reader := bufio.NewReader(file)

			for {
				line, err := reader.ReadString('\n')
				if err != nil {
					if err == io.EOF {
						time.Sleep(500 * time.Millisecond)
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
					continue
				}

				txn := auditLog.Transaction
				var ruleID int = 1001
				var ruleMsg string = "Security Policy Blocked"
				var attackType string = "General Web Attack"

				if len(txn.Producer.Messages) > 0 {
					firstMsg := txn.Producer.Messages[0]
					ruleID = firstMsg.Data.ID
					ruleMsg = firstMsg.Message
					attackType = ClassifyAttack(ruleID, ruleMsg, txn.Request.URI)
				}

				userAgent := txn.Request.Headers["user-agent"]
				if userAgent == "" {
					userAgent = txn.Request.Headers["User-Agent"]
				}

				attackRecord := database.AttackLog{
					TxnID:      txn.ID,
					ClientIP:   txn.ClientIP,
					Timestamp:  time.Now().Format("2006-01-02 15:04:05"),
					Method:     txn.Request.Method,
					URI:        txn.Request.URI,
					UserAgent:  userAgent,
					AttackType: attackType,
					RuleID:     ruleID,
					RuleMsg:    ruleMsg,
					Action:     "DENY",
					Status:     403,
					RawPayload: txn.Request.Body,
				}

				// Insert into SQLite
				res, err := database.DB.Exec(
					`INSERT INTO attack_logs (txn_id, client_ip, timestamp, method, uri, user_agent, attack_type, rule_id, rule_msg, action, status, raw_payload)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					attackRecord.TxnID, attackRecord.ClientIP, attackRecord.Timestamp,
					attackRecord.Method, attackRecord.URI, attackRecord.UserAgent,
					attackRecord.AttackType, attackRecord.RuleID, attackRecord.RuleMsg,
					attackRecord.Action, attackRecord.Status, attackRecord.RawPayload,
				)
				if err == nil {
					id, _ := res.LastInsertId()
					attackRecord.ID = id
				}

				// Broadcast to WebSocket Dashboard
				jsonBytes, _ := json.Marshal(map[string]interface{}{
					"event": "new_attack",
					"data":  attackRecord,
				})
				BroadcastEvent(jsonBytes)

				// Send Telegram alert
				SendAttackAlert(attackRecord)
			}
			file.Close()
		}
	}()
}
