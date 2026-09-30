package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"waf-backend/database"

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

	c.JSON(http.StatusOK, gin.H{"message": "Đã lưu toàn bộ cấu hình hệ thống thành công"})
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
