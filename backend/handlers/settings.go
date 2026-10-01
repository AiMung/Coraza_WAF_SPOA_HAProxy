package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
	"waf-backend/database"
	"waf-backend/services"

	"github.com/gin-gonic/gin"
)

// Default settings map
var defaultSettings = map[string]string{
	"enable_ssl":         "false",
	"two_factor":         "false",
	"strong_pass":        "true",
	"ip_sharing":         "false",
	"bind_domain":        "",
	"authorized_ips":     "",
	"session_timeout":    "2h",
	"security_entrance":  "/corazaWAF",
	"dashboard_port":     "8080",
	"admin_username":     "admin",
	"rate_limit_enabled": "true",
	"rate_limit_req_sec": "20",
	"rate_limit_burst":   "50",
}

// GET /api/settings
func GetSettings(c *gin.Context) {
	rows, err := database.DB.Query("SELECT key, value FROM settings")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể nạp cài đặt hệ thống: " + err.Error()})
		return
	}
	defer rows.Close()

	settings := make(map[string]string)
	for k, v := range defaultSettings {
		settings[k] = v
	}

	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			settings[k] = v
		}
	}

	c.JSON(http.StatusOK, settings)
}

// POST /api/settings
func SaveSettings(c *gin.Context) {
	var payload map[string]string
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	stmt, err := tx.Prepare(`
		INSERT INTO settings (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`)
	if err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer stmt.Close()

	for k, v := range payload {
		// Prevent accidental password write into key-value settings table
		if strings.Contains(strings.ToLower(k), "password") {
			continue
		}
		if _, err := stmt.Exec(k, v); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Invalidate in-memory security middleware cache
	InvalidateSettingsCache()

	c.JSON(http.StatusOK, gin.H{"message": "Đã lưu toàn bộ cấu hình hệ thống thành công và áp dụng hiệu lực ngay lập tức"})
}

// POST /api/settings/password
func UpdateAdminPassword(c *gin.Context) {
	var payload struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	if len(payload.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mật khẩu mới phải có ít nhất 6 ký tự"})
		return
	}

	// Hash password with SHA-256
	h := sha256.New()
	h.Write([]byte(payload.NewPassword))
	newHash := hex.EncodeToString(h.Sum(nil))

	_, err := database.DB.Exec(`
		INSERT INTO settings (key, value) VALUES ('admin_password_hash', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`, newHash)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể cập nhật mật khẩu: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Đã đổi mật khẩu quản trị viên thành công"})
}

// GET /api/settings/backup - Export complete system configuration backup
func BackupSettings(c *gin.Context) {
	rows, err := database.DB.Query("SELECT key, value FROM settings")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			if !strings.Contains(k, "password") {
				settings[k] = v
			}
		}
	}

	// Sites backup
	var sites []gin.H
	if sRows, err := database.DB.Query("SELECT id, name, domain, upstream_target, port, ssl_enabled, waf_mode, status FROM sites"); err == nil {
		defer sRows.Close()
		for sRows.Next() {
			var id, port int
			var name, domain, upstream, wafMode, status string
			var ssl bool
			if err := sRows.Scan(&id, &name, &domain, &upstream, &port, &ssl, &wafMode, &status); err == nil {
				sites = append(sites, gin.H{
					"id": id, "name": name, "domain": domain, "upstream_target": upstream,
					"port": port, "ssl_enabled": ssl, "waf_mode": wafMode, "status": status,
				})
			}
		}
	}
	if sites == nil {
		sites = []gin.H{}
	}

	// IP Rules backup
	var ipRules []gin.H
	if rRows, err := database.DB.Query("SELECT id, ip, rule_type, reason FROM ip_rules"); err == nil {
		defer rRows.Close()
		for rRows.Next() {
			var id int
			var ip, rType, reason string
			if err := rRows.Scan(&id, &ip, &rType, &reason); err == nil {
				ipRules = append(ipRules, gin.H{
					"id": id, "ip": ip, "rule_type": rType, "reason": reason,
				})
			}
		}
	}
	if ipRules == nil {
		ipRules = []gin.H{}
	}

	backupData := gin.H{
		"version":      "aaWAF Enterprise v2.5",
		"generated_at": time.Now().Format(time.RFC3339),
		"settings":     settings,
		"sites":        sites,
		"ip_rules":     ipRules,
	}

	c.Header("Content-Disposition", "attachment; filename=aawaf_backup_"+time.Now().Format("20060102_150405")+".json")
	c.JSON(http.StatusOK, backupData)
}

// POST /api/settings/restore - Restore system configuration from JSON
func RestoreSettings(c *gin.Context) {
	var payload struct {
		Settings map[string]string `json:"settings"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil || len(payload.Settings) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tập tin sao lưu không hợp lệ"})
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	stmt, _ := tx.Prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
	defer stmt.Close()

	for k, v := range payload.Settings {
		if !strings.Contains(strings.ToLower(k), "password") {
			_, _ = stmt.Exec(k, v)
		}
	}

	_ = tx.Commit()
	InvalidateSettingsCache()

	c.JSON(http.StatusOK, gin.H{"message": "Khôi phục cấu hình hệ thống thành công!"})
}

// GET /api/settings/diagnostics - Health check and state of system controls
func GetSystemDiagnostics(c *gin.Context) {
	// 1. HAProxy check
	haproxyLive := false
	if conn, err := net.DialTimeout("tcp", "haproxy:80", 800*time.Millisecond); err == nil {
		conn.Close()
		haproxyLive = true
	} else if conn, err := net.DialTimeout("tcp", "127.0.0.1:80", 800*time.Millisecond); err == nil {
		conn.Close()
		haproxyLive = true
	}

	// 2. Coraza SPOA check
	spoaLive := false
	if conn, err := net.DialTimeout("tcp", "coraza-spoa:9000", 800*time.Millisecond); err == nil {
		conn.Close()
		spoaLive = true
	} else if conn, err := net.DialTimeout("tcp", "127.0.0.1:9000", 800*time.Millisecond); err == nil {
		conn.Close()
		spoaLive = true
	}

	// 3. SQLite status
	sqliteOK := database.DB != nil && database.DB.Ping() == nil

	// 4. Settings status
	cfg := GetCachedSettings()

	authorizedCount := 0
	if strings.TrimSpace(cfg["authorized_ips"]) != "" {
		parts := strings.Split(cfg["authorized_ips"], ",")
		for _, p := range parts {
			if strings.TrimSpace(p) != "" {
				authorizedCount++
			}
		}
	}

	haproxyStatus := "offline"
	if haproxyLive {
		haproxyStatus = "online"
	}
	spoaStatus := "offline"
	if spoaLive {
		spoaStatus = "online"
	}
	sqliteStatus := "offline"
	if sqliteOK {
		sqliteStatus = "active (WAL)"
	}

	c.JSON(http.StatusOK, gin.H{
		"haproxy_live": haproxyLive,
		"spoa_live":    spoaLive,
		"sqlite_live":  sqliteOK,
		"services": gin.H{
			"haproxy": gin.H{
				"ok":     haproxyLive,
				"status": haproxyStatus,
				"port":   80,
			},
			"coraza_spoa": gin.H{
				"ok":     spoaLive,
				"status": spoaStatus,
				"port":   9000,
			},
			"sqlite_db": gin.H{
				"ok":     sqliteOK,
				"status": sqliteStatus,
			},
		},
		"admin_whitelist": gin.H{
			"active": authorizedCount > 0,
			"count":  authorizedCount,
			"ips":    cfg["authorized_ips"],
		},
		"rate_limit_enabled": cfg["rate_limit_enabled"] == "true",
		"rate_limit_req_sec": cfg["rate_limit_req_sec"],
		"rate_limit_burst":   cfg["rate_limit_burst"],
		"authorized_ips":     cfg["authorized_ips"],
		"bind_domain":        cfg["bind_domain"],
		"security_entrance":  cfg["security_entrance"],
		"dashboard_port":     cfg["dashboard_port"],
		"session_timeout":    cfg["session_timeout"],
		"enable_ssl":         cfg["enable_ssl"] == "true",
		"two_factor":         cfg["two_factor"] == "true",
		"timestamp":          services.VietnamNowRFC3339(),
	})
}

// POST /api/settings/reload-engines - Synchronizes all rule files and sends SIGHUP to HAProxy and Coraza
func ReloadWAFEngines(c *gin.Context) {
	_ = services.SyncIPRulesToFile()
	_ = services.SyncSitesToHAProxy()
	_ = services.SyncCustomRulesToFile()

	c.JSON(http.StatusOK, gin.H{
		"message": "Đã đồng bộ toàn bộ tệp cấu hình và gửi tín hiệu SIGHUP reload thành công đến HAProxy & Coraza WAF!",
		"time":    services.VietnamNowRFC3339(),
	})
}

// POST /api/settings/test-whitelist - Checks if a client IP is allowed by authorized_ips
func TestAdminWhitelistIP(c *gin.Context) {
	var payload struct {
		IP string `json:"ip"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil || payload.IP == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Vui lòng nhập địa chỉ IP cần kiểm tra"})
		return
	}

	cfg := GetCachedSettings()
	authorizedIPs := cfg["authorized_ips"]
	if strings.TrimSpace(authorizedIPs) == "" {
		c.JSON(http.StatusOK, gin.H{
			"allowed": true,
			"ip":      payload.IP,
			"reason":  "Danh sách IP quản trị đang để trống, toàn bộ địa chỉ IP được phép truy cập.",
		})
		return
	}

	allowed := false
	target := net.ParseIP(payload.IP)
	for _, raw := range strings.Split(authorizedIPs, ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		if raw == payload.IP {
			allowed = true
			break
		}
		if _, ipNet, err := net.ParseCIDR(raw); err == nil && target != nil && ipNet.Contains(target) {
			allowed = true
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"allowed": allowed,
		"ip":      payload.IP,
		"reason":  fmt.Sprintf("Địa chỉ IP %s %s trong danh sách IP quản trị được phép", payload.IP, func() string {
			if allowed {
				return "NẰM"
			}
			return "KHÔNG NẰM"
		}()),
	})
}
