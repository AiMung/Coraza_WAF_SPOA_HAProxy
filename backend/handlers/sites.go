package handlers

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
	"waf-backend/database"
	"waf-backend/services"

	"github.com/gin-gonic/gin"
)

type AddSiteRequest struct {
	Name           string `json:"name" binding:"required"`
	Domain         string `json:"domain" binding:"required"`
	UpstreamTarget string `json:"upstream_target" binding:"required"`
	Port           int    `json:"port"`
	SSLEnabled     bool   `json:"ssl_enabled"`
	WAFMode        string `json:"waf_mode"` // "prevention", "detection", "bypass"
}

type UpdateSiteRequest struct {
	Name           string `json:"name"`
	Domain         string `json:"domain"`
	UpstreamTarget string `json:"upstream_target"`
	Port           int    `json:"port"`
	SSLEnabled     bool   `json:"ssl_enabled"`
	WAFMode        string `json:"waf_mode"`
	Status         string `json:"status"`
}

// Check upstream target network reachability and measure round-trip latency
func pingTarget(target string) (string, int, int64, string) {
	if target == "" {
		return "down", 0, 0, "Chưa cấu hình máy chủ đích"
	}

	cleanTarget := target
	if !strings.HasPrefix(cleanTarget, "http://") && !strings.HasPrefix(cleanTarget, "https://") {
		cleanTarget = "http://" + cleanTarget
	}

	client := http.Client{
		Timeout: 2 * time.Second,
	}

	start := time.Now()
	resp, err := client.Get(cleanTarget)
	latency := time.Since(start).Milliseconds()
	if latency <= 0 {
		latency = 1
	}

	if err != nil {
		// Fallback to TCP probe
		tcpClean := strings.TrimPrefix(target, "http://")
		tcpClean = strings.TrimPrefix(tcpClean, "https://")
		tcpClean = strings.Split(tcpClean, "/")[0]
		if !strings.Contains(tcpClean, ":") {
			tcpClean += ":80"
		}
		tcpStart := time.Now()
		conn, tcpErr := net.DialTimeout("tcp", tcpClean, 1500*time.Millisecond)
		tcpLatency := time.Since(tcpStart).Milliseconds()
		if tcpLatency <= 0 {
			tcpLatency = 1
		}
		if tcpErr != nil {
			return "down", 0, tcpLatency, "Không thể kết nối đến máy chủ đích (Connection Refused / Timeout)"
		}
		_ = conn.Close()
		return "up", 200, tcpLatency, "TCP Connection Established"
	}
	defer resp.Body.Close()

	msg := http.StatusText(resp.StatusCode)
	if msg == "" {
		msg = "Response OK"
	}
	return "up", resp.StatusCode, latency, msg
}

// fetchHAProxyStats retrieves real request counters from HAProxy's internal Prometheus/CSV stats endpoint
func fetchHAProxyStats() map[string]int64 {
	stats := make(map[string]int64)

	// Try internal docker hostname first, then localhost fallback
	targets := []string{"http://haproxy:8404/;csv", "http://127.0.0.1:8404/;csv"}
	var resp *http.Response
	var err error

	client := http.Client{Timeout: 1 * time.Second}
	for _, target := range targets {
		resp, err = client.Get(target)
		if err == nil && resp.StatusCode == http.StatusOK {
			break
		}
		if resp != nil {
			resp.Body.Close()
			resp = nil
		}
	}

	if resp == nil {
		return stats
	}
	defer resp.Body.Close()

	reader := csv.NewReader(resp.Body)
	records, err := reader.ReadAll()
	if err != nil || len(records) < 2 {
		return stats
	}

	// Header row: # pxname,svname,qcur,qmax,scur,smax,slim,stot,...
	headers := records[0]
	pxIdx := -1
	svIdx := -1
	stotIdx := -1

	for i, h := range headers {
		clean := strings.TrimPrefix(h, "# ")
		clean = strings.TrimSpace(clean)
		switch clean {
		case "pxname":
			pxIdx = i
		case "svname":
			svIdx = i
		case "stot":
			stotIdx = i
		}
	}

	if pxIdx == -1 || svIdx == -1 || stotIdx == -1 {
		return stats
	}

	for _, row := range records[1:] {
		if len(row) <= stotIdx {
			continue
		}
		px := strings.TrimSpace(row[pxIdx])
		sv := strings.TrimSpace(row[svIdx])
		if sv == "BACKEND" {
			if stot, parseErr := strconv.ParseInt(strings.TrimSpace(row[stotIdx]), 10, 64); parseErr == nil {
				stats[px] = stot
			}
		}
	}

	return stats
}

// GET /api/sites
func GetSites(c *gin.Context) {
	rows, err := database.DB.Query(`
		SELECT id, name, domain, upstream_target, port, ssl_enabled, waf_mode, status, created_at, updated_at
		FROM protected_sites
		ORDER BY id ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	// 1. Fetch live metrics from HAProxy
	haproxyStats := fetchHAProxyStats()

	now := time.Now().Format("2006-01-02 15:04:05")
	var sites []database.ProtectedSite
	for rows.Next() {
		var s database.ProtectedSite
		var sslInt int
		err := rows.Scan(
			&s.ID, &s.Name, &s.Domain, &s.UpstreamTarget, &s.Port,
			&sslInt, &s.WAFMode, &s.Status, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			continue
		}
		s.SSLEnabled = sslInt == 1

		// Measure real live ping to upstream target
		health, code, lat, _ := pingTarget(s.UpstreamTarget)
		s.Health = health
		s.StatusCode = code
		s.LatencyMs = lat
		s.LastPingAt = now

		// Real-time blocked requests count from attack_logs
		var attackCount int64
		_ = database.DB.QueryRow(`
			SELECT COUNT(*) FROM attack_logs 
			WHERE target_host LIKE ? OR (target_host = '' AND uri LIKE ?)
		`, "%"+s.Domain+"%", "%"+s.Domain+"%").Scan(&attackCount)
		s.BlockedRequests = attackCount
		s.AttacksBlocked = attackCount

		// Real-time valid requests count forwarded through HAProxy
		backendKey := fmt.Sprintf("backend_site_%d", s.ID)
		validCount, ok := haproxyStats[backendKey]
		if !ok || validCount == 0 {
			// For default demo app, also check default backend
			if s.ID == 1 {
				validCount = haproxyStats["protected-app-backend"]
			}
		}
		s.ValidRequests = validCount
		s.TotalRequests = validCount + attackCount

		sites = append(sites, s)
	}

	if sites == nil {
		sites = []database.ProtectedSite{}
	}

	c.JSON(http.StatusOK, sites)
}

// POST /api/sites/:id/ping
func PingSite(c *gin.Context) {
	id := c.Param("id")
	var target, domain string
	err := database.DB.QueryRow("SELECT upstream_target, domain FROM protected_sites WHERE id = ?", id).Scan(&target, &domain)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy website chỉ định"})
		return
	}

	status, statusCode, latency, msg := pingTarget(target)
	now := time.Now().Format("2006-01-02 15:04:05")

	c.JSON(http.StatusOK, gin.H{
		"site_id":     id,
		"domain":      domain,
		"target":      target,
		"status":      status,
		"status_code": statusCode,
		"latency_ms":  latency,
		"message":     msg,
		"checked_at":  now,
	})
}

// POST /api/sites
func AddSite(c *gin.Context) {
	var req AddSiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Vui lòng nhập đầy đủ Tên, Tên miền và Máy chủ đích"})
		return
	}

	req.Domain = strings.TrimSpace(req.Domain)
	req.Name = strings.TrimSpace(req.Name)
	req.UpstreamTarget = strings.TrimSpace(req.UpstreamTarget)

	if req.Port <= 0 {
		req.Port = 80
	}
	if req.WAFMode == "" {
		req.WAFMode = "prevention"
	}

	sslInt := 0
	if req.SSLEnabled {
		sslInt = 1
	}

	res, err := database.DB.Exec(`
		INSERT INTO protected_sites (name, domain, upstream_target, port, ssl_enabled, waf_mode, status)
		VALUES (?, ?, ?, ?, ?, ?, 'active')
	`, req.Name, req.Domain, req.UpstreamTarget, req.Port, sslInt, req.WAFMode)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			c.JSON(http.StatusConflict, gin.H{"error": "Tên miền này đã được đăng ký bảo vệ trong hệ thống"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	id, _ := res.LastInsertId()

	// Sync HAProxy config to enforce real protection for this new site
	if err := services.SyncSitesToHAProxy(); err != nil {
		log.Printf("[AddSite] Warning: HAProxy sync failed: %v", err)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Đã thêm website vào diện bảo vệ của WAF thành công",
		"id":      id,
	})
}

// PUT /api/sites/:id
func UpdateSite(c *gin.Context) {
	id := c.Param("id")
	var req UpdateSiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	sslInt := 0
	if req.SSLEnabled {
		sslInt = 1
	}

	_, err := database.DB.Exec(`
		UPDATE protected_sites 
		SET name = COALESCE(NULLIF(?, ''), name),
		    domain = COALESCE(NULLIF(?, ''), domain),
		    upstream_target = COALESCE(NULLIF(?, ''), upstream_target),
		    port = CASE WHEN ? > 0 THEN ? ELSE port END,
		    ssl_enabled = ?,
		    waf_mode = COALESCE(NULLIF(?, ''), waf_mode),
		    status = COALESCE(NULLIF(?, ''), status),
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, req.Name, req.Domain, req.UpstreamTarget, req.Port, req.Port, sslInt, req.WAFMode, req.Status, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Re-sync HAProxy config to reflect updated site settings
	if err := services.SyncSitesToHAProxy(); err != nil {
		log.Printf("[UpdateSite] Warning: HAProxy sync failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Đã cập nhật cấu hình website thành công"})
}

// DELETE /api/sites/:id
func DeleteSite(c *gin.Context) {
	id := c.Param("id")
	res, err := database.DB.Exec("DELETE FROM protected_sites WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rowsAff, _ := res.RowsAffected()
	if rowsAff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy website cần xóa"})
		return
	}

	// Re-sync HAProxy config to remove the deleted site's routing
	if err := services.SyncSitesToHAProxy(); err != nil {
		log.Printf("[DeleteSite] Warning: HAProxy sync failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Đã xóa website khỏi diện bảo vệ"})
}

// POST /api/sites/:id/toggle
func ToggleSiteWAF(c *gin.Context) {
	id := c.Param("id")
	var payload struct {
		WAFMode string `json:"waf_mode"`
	}
	_ = c.ShouldBindJSON(&payload)

	var currentMode string
	err := database.DB.QueryRow("SELECT waf_mode FROM protected_sites WHERE id = ?", id).Scan(&currentMode)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Website không tồn tại"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	nextMode := payload.WAFMode
	if nextMode == "" {
		if currentMode == "prevention" {
			nextMode = "bypass"
		} else {
			nextMode = "prevention"
		}
	}

	_, err = database.DB.Exec("UPDATE protected_sites SET waf_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", nextMode, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Re-sync HAProxy config to enforce the new WAF mode (bypass = skip SPOE)
	if err := services.SyncSitesToHAProxy(); err != nil {
		log.Printf("[ToggleSiteWAF] Warning: HAProxy sync failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Đã chuyển chế độ bảo vệ WAF sang " + nextMode,
		"waf_mode": nextMode,
	})
}
