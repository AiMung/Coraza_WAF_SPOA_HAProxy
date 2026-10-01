package services

import (
	"fmt"
	"log"
	"net"
	"regexp"
	"strconv"
	"strings"
	"time"
	"waf-backend/database"
)

var (
	// Example HAProxy log:
	// 192.168.246.1:54321 [01/Oct/2026:09:15:30.123] default backend_site_1/origin_1 403 212 "GET /admin HTTP/1.1" - spoa-error:- waf-action:- blocked-by:HAProxy-IP-Blacklist
	// or:
	// 192.168.246.1:54322 [01/Oct/2026:09:15:31.456] default - 429 200 "GET /login HTTP/1.1" - spoa-error:- waf-action:- blocked-by:aaWAF-CC-Shield
	syslogIPRegex     = regexp.MustCompile(`^(\d+\.\d+\.\d+\.\d+)`)
	syslogStatusRegex = regexp.MustCompile(`\s(\d{3})\s+\d+\s+"`)
	syslogReqRegex    = regexp.MustCompile(`"([A-Z]+)\s+([^"\s]+)`)
	syslogBlockedBy   = regexp.MustCompile(`blocked-by:([^\s"]+)`)
)

// StartHAProxySyslogListener starts a lightweight UDP syslog listener to capture Layer-1 blocks
func StartHAProxySyslogListener(bindAddr string) {
	if bindAddr == "" {
		bindAddr = "0.0.0.0:5140"
	}

	go func() {
		addr, err := net.ResolveUDPAddr("udp", bindAddr)
		if err != nil {
			log.Printf("[Syslog] Error resolving UDP address %s: %v", bindAddr, err)
			return
		}

		conn, err := net.ListenUDP("udp", addr)
		if err != nil {
			log.Printf("[Syslog] Warning: Unable to listen on UDP %s: %v (HAProxy blocks will rely on direct logging)", bindAddr, err)
			return
		}
		defer conn.Close()

		log.Printf("[Syslog] HAProxy Syslog Ingestion Engine listening on %s (UDP)", bindAddr)
		buf := make([]byte, 8192)

		for {
			n, _, err := conn.ReadFrom(buf)
			if err != nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}

			line := strings.TrimSpace(string(buf[:n]))
			if line == "" {
				continue
			}

			ProcessHAProxyLogLine(line)
		}
	}()
}

// ProcessHAProxyLogLine parses HAProxy log and persists L1 attack events
func ProcessHAProxyLogLine(line string) bool {
	// Look for blocked-by tag
	blockedMatch := syslogBlockedBy.FindStringSubmatch(line)
	if len(blockedMatch) < 2 {
		return false
	}
	blockedReason := blockedMatch[1]
	if blockedReason == "-" || blockedReason == "" {
		return false
	}

	// Extract Client IP
	clientIP := "127.0.0.1"
	ipMatch := syslogIPRegex.FindStringSubmatch(line)
	if len(ipMatch) > 1 {
		clientIP = ipMatch[1]
	}

	// Extract Status Code
	status := 403
	statusMatch := syslogStatusRegex.FindStringSubmatch(line)
	if len(statusMatch) > 1 {
		status, _ = strconv.Atoi(statusMatch[1])
	}

	// Extract Method & URI
	method := "GET"
	uri := "/"
	reqMatch := syslogReqRegex.FindStringSubmatch(line)
	if len(reqMatch) > 2 {
		method = reqMatch[1]
		uri = reqMatch[2]
	}

	var attackType string
	var ruleID int
	var ruleMsg string

	switch {
	case strings.Contains(blockedReason, "Blacklist"):
		attackType = "IP Blacklist Enforcement"
		ruleID = 10001
		ruleMsg = "IP Address is permanently or temporarily banned in HAProxy Blacklist"
	case strings.Contains(blockedReason, "Scanner"):
		attackType = "Vulnerability Scanner Block"
		ruleID = 10002
		ruleMsg = "Malicious Security Scanner User-Agent blocked by aaWAF Scanner Shield"
	case strings.Contains(blockedReason, "CC") || status == 429:
		attackType = "CC Flood / HTTP Flood"
		ruleID = 10003
		ruleMsg = "Request burst exceeded rate limit threshold; HTTP 429 Challenge triggered"
	default:
		attackType = "HAProxy Fast-Path Deny"
		ruleID = 10000
		ruleMsg = "Request intercepted by Layer 1 HAProxy Access Policy: " + blockedReason
	}

	// Record into attack_logs
	now := VietnamNowRFC3339()
	txnID := fmt.Sprintf("haproxy-%d", time.Now().UnixNano())

	query := `
		INSERT INTO attack_logs (
			txn_id, client_ip, timestamp, method, uri, user_agent,
			attack_type, rule_id, rule_msg, action, status, raw_payload, target_host
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := database.DB.Exec(query,
		txnID,
		clientIP,
		now,
		method,
		uri,
		"HAProxy-Layer1-Inspection",
		attackType,
		ruleID,
		ruleMsg,
		"DENY",
		status,
		fmt.Sprintf("Rule: %s | Target: %s", blockedReason, uri),
		"HAProxy Gateway",
	)

	if err != nil {
		log.Printf("[Syslog] Error saving HAProxy attack log: %v", err)
		return false
	}

	// Broadcast via WebSocket Hub
	geo := LookupGeoIP(clientIP)
	logItem := database.AttackLog{
		TxnID:      txnID,
		ClientIP:   clientIP,
		Timestamp:  now,
		Method:     method,
		URI:        uri,
		UserAgent:  "HAProxy-Layer1-Inspection",
		AttackType: attackType,
		RuleID:     ruleID,
		RuleMsg:    ruleMsg,
		Action:     "DENY",
		Status:     status,
		RawPayload: fmt.Sprintf("Rule: %s", blockedReason),
		Country:    geo.Country,
		Flag:       geo.Flag,
		City:       geo.City,
		TargetHost: "HAProxy Gateway",
	}

	WSHub.BroadcastJSON(map[string]interface{}{
		"type": "new_attack",
		"data": logItem,
	})

	// Dispatch Telegram notification
	SendAttackAlert(logItem)

	log.Printf("[Syslog] Logged Layer-1 block: %s from %s [%s]", attackType, clientIP, uri)
	return true
}

// RecordDirectBlock allows backend code to directly record a block event (e.g. from challenge verification or tests)
func RecordDirectBlock(clientIP, method, uri, userAgent, attackType string, ruleID int, ruleMsg string, status int, targetHost string) {
	now := VietnamNowRFC3339()
	txnID := fmt.Sprintf("l1-%d", time.Now().UnixNano())

	query := `
		INSERT INTO attack_logs (
			txn_id, client_ip, timestamp, method, uri, user_agent,
			attack_type, rule_id, rule_msg, action, status, raw_payload, target_host
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := database.DB.Exec(query,
		txnID, clientIP, now, method, uri, userAgent,
		attackType, ruleID, ruleMsg, "DENY", status,
		fmt.Sprintf("Enforced by aaWAF Layer 1: %s", ruleMsg), targetHost,
	)
	if err != nil {
		return
	}

	geo := LookupGeoIP(clientIP)
	logItem := database.AttackLog{
		TxnID:      txnID,
		ClientIP:   clientIP,
		Timestamp:  now,
		Method:     method,
		URI:        uri,
		UserAgent:  userAgent,
		AttackType: attackType,
		RuleID:     ruleID,
		RuleMsg:    ruleMsg,
		Action:     "DENY",
		Status:     status,
		RawPayload: ruleMsg,
		Country:    geo.Country,
		Flag:       geo.Flag,
		City:       geo.City,
		TargetHost: targetHost,
	}

	WSHub.BroadcastJSON(map[string]interface{}{
		"type": "new_attack",
		"data": logItem,
	})

	SendAttackAlert(logItem)
}
