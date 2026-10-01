package services

import (
	"crypto/tls"
	"fmt"
	"net/smtp"
	"time"
	"waf-backend/database"
)

type EmailConfig struct {
	SMTPHost    string `json:"smtp_host"`
	SMTPPort    int    `json:"smtp_port"`
	SenderEmail string `json:"sender_email"`
	AppPassword string `json:"app_password"`
	Recipient   string `json:"recipient"`
	Enabled     bool   `json:"enabled"`
}

// GetEmailConfig loads email settings from DB
func GetEmailConfig() EmailConfig {
	cfg := EmailConfig{
		SMTPHost: "smtp.gmail.com",
		SMTPPort: 587,
		Enabled:  false,
	}

	if database.DB == nil {
		return cfg
	}

	_ = database.DB.QueryRow("SELECT value FROM settings WHERE key = 'email_smtp_host'").Scan(&cfg.SMTPHost)
	var portStr string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'email_smtp_port'").Scan(&portStr); err == nil && portStr != "" {
		fmt.Sscanf(portStr, "%d", &cfg.SMTPPort)
	}
	_ = database.DB.QueryRow("SELECT value FROM settings WHERE key = 'email_sender'").Scan(&cfg.SenderEmail)
	_ = database.DB.QueryRow("SELECT value FROM settings WHERE key = 'email_app_password'").Scan(&cfg.AppPassword)
	_ = database.DB.QueryRow("SELECT value FROM settings WHERE key = 'email_recipient'").Scan(&cfg.Recipient)
	var enabledStr string
	if err := database.DB.QueryRow("SELECT value FROM settings WHERE key = 'email_enabled'").Scan(&enabledStr); err == nil {
		cfg.Enabled = enabledStr == "true"
	}

	return cfg
}

// SaveEmailConfig persists email settings
func SaveEmailConfig(cfg EmailConfig) error {
	if database.DB == nil {
		return fmt.Errorf("database not initialized")
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	enabledStr := "false"
	if cfg.Enabled {
		enabledStr = "true"
	}

	pairs := [][2]string{
		{"email_smtp_host", cfg.SMTPHost},
		{"email_smtp_port", fmt.Sprintf("%d", cfg.SMTPPort)},
		{"email_sender", cfg.SenderEmail},
		{"email_app_password", cfg.AppPassword},
		{"email_recipient", cfg.Recipient},
		{"email_enabled", enabledStr},
	}

	for _, p := range pairs {
		if _, err := stmt.Exec(p[0], p[1]); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// SendHTMLEmail sends an HTML email over SMTP (STARTTLS)
func SendHTMLEmail(cfg EmailConfig, to, subject, htmlBody string) error {
	if cfg.SMTPHost == "" || cfg.SenderEmail == "" || cfg.AppPassword == "" {
		return fmt.Errorf("cấu hình SMTP Gmail chưa đầy đủ (thiếu email người gửi hoặc App Password)")
	}
	if to == "" {
		to = cfg.Recipient
	}
	if to == "" {
		return fmt.Errorf("chưa có email người nhận")
	}

	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort)
	auth := smtp.PlainAuth("", cfg.SenderEmail, cfg.AppPassword, cfg.SMTPHost)

	headers := make(map[string]string)
	headers["From"] = fmt.Sprintf("aaWAF Enterprise Security <%s>", cfg.SenderEmail)
	headers["To"] = to
	headers["Subject"] = subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"
	headers["Date"] = time.Now().Format(time.RFC1123Z)

	headerStr := ""
	for k, v := range headers {
		headerStr += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	msg := []byte(headerStr + "\r\n" + htmlBody)

	// Direct TLS for 465, STARTTLS for 587
	if cfg.SMTPPort == 465 {
		tlsConfig := &tls.Config{
			ServerName: cfg.SMTPHost,
		}
		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			return fmt.Errorf("lỗi kết nối SSL tới %s: %w", addr, err)
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			return err
		}
		defer client.Quit()

		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("xác thực Gmail thất bại: %w", err)
		}
		if err = client.Mail(cfg.SenderEmail); err != nil {
			return err
		}
		if err = client.Rcpt(to); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = w.Write(msg)
		if err != nil {
			return err
		}
		return w.Close()
	}

	// Standard STARTTLS (587)
	return smtp.SendMail(addr, auth, cfg.SenderEmail, []string{to}, msg)
}

// GenerateSecurityReportHTML compiles live metrics into an executive HTML document
func GenerateSecurityReportHTML() (string, string) {
	var totalAttacks, attacksToday, blockedIPs, whitelistedIPs int64

	_ = database.DB.QueryRow("SELECT COUNT(*) FROM attack_logs").Scan(&totalAttacks)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM attack_logs WHERE date(timestamp) = date('now')").Scan(&attacksToday)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM ip_rules WHERE rule_type = 'blacklist'").Scan(&blockedIPs)
	_ = database.DB.QueryRow("SELECT COUNT(*) FROM ip_rules WHERE rule_type = 'whitelist'").Scan(&whitelistedIPs)

	nowStr := time.Now().Format("15:04:05 02/01/2006")
	subject := fmt.Sprintf("🛡️ [aaWAF Security Audit] Báo Cáo An Ninh Mạng — %s (%d đợt tấn công đã chặn)", time.Now().Format("02/01/2006"), attacksToday)

	// Top attacking IPs
	topIPRows := ""
	if rows, err := database.DB.Query("SELECT client_ip, COUNT(*) as c FROM attack_logs GROUP BY client_ip ORDER BY c DESC LIMIT 5"); err == nil {
		defer rows.Close()
		rank := 1
		for rows.Next() {
			var ip string
			var count int64
			if err := rows.Scan(&ip, &count); err == nil {
				geo := LookupGeoIP(ip)
				topIPRows += fmt.Sprintf(`<tr>
					<td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 700;">#%d</td>
					<td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace; color: #1e293b;">%s</td>
					<td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">%s %s</td>
					<td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #dc2626;">%d lượt</td>
				</tr>`, rank, ip, geo.Flag, geo.Country, count)
				rank++
			}
		}
	}
	if topIPRows == "" {
		topIPRows = `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #64748b;">Chưa ghi nhận kẻ tấn công.</td></tr>`
	}

	// Recent incidents
	recentRows := ""
	if rows, err := database.DB.Query("SELECT client_ip, attack_type, rule_id, method, uri, timestamp FROM attack_logs ORDER BY id DESC LIMIT 5"); err == nil {
		defer rows.Close()
		for rows.Next() {
			var ip, attackType, method, uri, ts string
			var ruleID int
			if err := rows.Scan(&ip, &attackType, &ruleID, &method, &uri, &ts); err == nil {
				geo := LookupGeoIP(ip)
				recentRows += fmt.Sprintf(`<tr>
					<td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">%s</td>
					<td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #b91c1c;">%s</td>
					<td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">%s (%s)</td>
					<td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 11.5px; color: #475569;">%s %s</td>
					<td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;"><span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">DENIED (403)</span></td>
				</tr>`, ts, attackType, ip, geo.Country, method, uri)
			}
		}
	}
	if recentRows == "" {
		recentRows = `<tr><td colspan="5" style="padding: 12px; text-align: center; color: #64748b;">Không có mối đe dọa gần đây.</td></tr>`
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<title>aaWAF Security Audit Report</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
	<div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
		<!-- Header -->
		<div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 28px 32px; color: #ffffff;">
			<div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8; font-weight: 800; margin-bottom: 6px;">Enterprise Web Application Firewall</div>
			<h1 style="margin: 0; font-size: 22px; font-weight: 800;">Báo Cáo Kiểm Toán An Ninh Mạng</h1>
			<p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Thời gian trích xuất: %s · Hệ thống Coraza WAF + HAProxy Gateway</p>
		</div>

		<!-- Summary Badges -->
		<div style="padding: 24px 32px 16px 32px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
			<div style="background: #f1f5f9; padding: 14px; border-radius: 10px; text-align: center;">
				<div style="font-size: 11.5px; color: #64748b; font-weight: 600;">Tấn Công Hôm Nay</div>
				<div style="font-size: 22px; font-weight: 800; color: #dc2626; margin-top: 4px;">%d</div>
			</div>
			<div style="background: #f1f5f9; padding: 14px; border-radius: 10px; text-align: center;">
				<div style="font-size: 11.5px; color: #64748b; font-weight: 600;">Tổng Vi Phạm Đã Chặn</div>
				<div style="font-size: 22px; font-weight: 800; color: #0284c7; margin-top: 4px;">%d</div>
			</div>
			<div style="background: #f1f5f9; padding: 14px; border-radius: 10px; text-align: center;">
				<div style="font-size: 11.5px; color: #64748b; font-weight: 600;">IP Trong Blacklist</div>
				<div style="font-size: 22px; font-weight: 800; color: #b91c1c; margin-top: 4px;">%d</div>
			</div>
			<div style="background: #f1f5f9; padding: 14px; border-radius: 10px; text-align: center;">
				<div style="font-size: 11.5px; color: #64748b; font-weight: 600;">Tỷ Lệ Chặn Thành Công</div>
				<div style="font-size: 22px; font-weight: 800; color: #16a34a; margin-top: 4px;">100%%</div>
			</div>
		</div>

		<!-- Top Attackers Section -->
		<div style="padding: 0 32px 20px 32px;">
			<h3 style="font-size: 15px; margin: 16px 0 10px 0; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Top Kẻ Tấn Công Nguy Hiểm Nhất</h3>
			<table style="width: 100%%; border-collapse: collapse; font-size: 12.5px; text-align: left;">
				<thead>
					<tr style="background: #f8fafc; color: #475569; font-weight: 700;">
						<th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Hạng</th>
						<th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Địa Chỉ IP</th>
						<th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Quốc Gia</th>
						<th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Lưu Lượng Tấn Công</th>
					</tr>
				</thead>
				<tbody>
					%s
				</tbody>
			</table>
		</div>

		<!-- Recent Incidents Section -->
		<div style="padding: 0 32px 24px 32px;">
			<h3 style="font-size: 15px; margin: 16px 0 10px 0; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Sự Kiện Xâm Nhập Đã Bị Vô Hiệu Hóa Gần Đây</h3>
			<table style="width: 100%%; border-collapse: collapse; font-size: 12px; text-align: left;">
				<thead>
					<tr style="background: #f8fafc; color: #475569; font-weight: 700;">
						<th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Thời Gian</th>
						<th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Mối Đe Dọa</th>
						<th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Nguồn Tấn Công</th>
						<th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Đích Nhắm</th>
						<th style="padding: 8px 12px; border-bottom: 1px solid #cbd5e1;">Xử Lý</th>
					</tr>
				</thead>
				<tbody>
					%s
				</tbody>
			</table>
		</div>

		<!-- Footer -->
		<div style="background: #f1f5f9; padding: 18px 32px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0;">
			Bản tin an ninh tự động được gửi từ hệ thống phòng thủ <strong>aaWAF Enterprise Gateway</strong>.<br>
			Bảo mật nhiều tầng bởi <strong>Coraza WAF (CRS v4) & HAProxy Layer 7 Gateway</strong>.
		</div>
	</div>
</body>
</html>`, nowStr, attacksToday, totalAttacks, blockedIPs, topIPRows, recentRows)

	return subject, html
}
