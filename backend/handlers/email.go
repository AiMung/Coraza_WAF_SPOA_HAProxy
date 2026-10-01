package handlers

import (
	"net/http"
	"strings"
	"waf-backend/services"

	"github.com/gin-gonic/gin"
)

// GET /api/email/settings
func GetEmailSettings(c *gin.Context) {
	cfg := services.GetEmailConfig()
	// Mask app password for security
	if len(cfg.AppPassword) > 4 {
		cfg.AppPassword = "••••••••" + cfg.AppPassword[len(cfg.AppPassword)-4:]
	} else if cfg.AppPassword != "" {
		cfg.AppPassword = "••••••••"
	}
	c.JSON(http.StatusOK, cfg)
}

// POST /api/email/settings
func SaveEmailSettings(c *gin.Context) {
	var payload services.EmailConfig
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu cấu hình không hợp lệ"})
		return
	}

	// If masked password sent back, retain existing password
	if strings.HasPrefix(payload.AppPassword, "••••••••") {
		current := services.GetEmailConfig()
		payload.AppPassword = current.AppPassword
	}

	if err := services.SaveEmailConfig(payload); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể lưu cấu hình Email: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Đã lưu cấu hình gửi mail Gmail thành công!"})
}

// POST /api/email/send-test
func SendTestEmail(c *gin.Context) {
	var payload struct {
		Recipient string `json:"recipient"`
	}
	_ = c.ShouldBindJSON(&payload)

	cfg := services.GetEmailConfig()
	to := strings.TrimSpace(payload.Recipient)
	if to == "" {
		to = cfg.Recipient
	}
	if to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Vui lòng nhập địa chỉ email người nhận"})
		return
	}

	subject := "📧 [aaWAF Test] Xác Thực Kết Nối Email Thành Công"
	body := `<div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
		<h2 style="color: #0284c7;">🎉 Kết Nối SMTP Gmail Thành Công!</h2>
		<p>Hệ thống tường lửa <strong>aaWAF Enterprise</strong> đã thiết lập đường truyền gửi báo cáo an toàn tới hòm thư của bạn.</p>
		<p>Các báo cáo định kỳ và cảnh báo xâm nhập mức độ cao sẽ được chuyển giao tin cậy qua giao thức này.</p>
	</div>`

	if err := services.SendHTMLEmail(cfg, to, subject, body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Gửi email thất bại: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Đã gửi email thử nghiệm thành công tới: " + to})
}

// POST /api/email/send-report
func SendReportEmail(c *gin.Context) {
	var payload struct {
		Recipient string `json:"recipient"`
	}
	_ = c.ShouldBindJSON(&payload)

	cfg := services.GetEmailConfig()
	to := strings.TrimSpace(payload.Recipient)
	if to == "" {
		to = cfg.Recipient
	}
	if to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Vui lòng chỉ định email người nhận báo cáo"})
		return
	}

	subject, html := services.GenerateSecurityReportHTML()

	if err := services.SendHTMLEmail(cfg, to, subject, html); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Không thể gửi báo cáo an ninh qua Gmail: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Đã gửi báo cáo kiểm toán an ninh WAF thành công tới: " + to})
}
