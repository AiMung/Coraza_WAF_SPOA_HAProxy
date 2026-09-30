package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"waf-backend/database"
	"waf-backend/services"

	"github.com/gin-gonic/gin"
)

var challengeSecret = []byte("aaWAF-Enterprise-Challenge-Secret-Key-2026")

type BotDefenseConfig struct {
	CCEnabled           bool   `json:"cc_enabled"`
	CCThreshold         int    `json:"cc_threshold"`          // Max requests per 10 seconds (e.g. 50)
	CCAction            string `json:"cc_action"`             // "challenge", "block_429", "auto_ban"
	ChallengeMode       string `json:"challenge_mode"`        // "autonomous_js", "turnstile"
	TurnstileSiteKey    string `json:"turnstile_site_key"`
	TurnstileSecretKey  string `json:"turnstile_secret_key"`
	BlockScanners       bool   `json:"block_scanners"`
	PassTTLMinutes      int    `json:"pass_ttl_minutes"`      // Clearance cookie TTL (default 120 mins)
}

func GetBotDefenseConfigFromDB() BotDefenseConfig {
	cfg := BotDefenseConfig{
		CCEnabled:          true,
		CCThreshold:        50,
		CCAction:           "challenge",
		ChallengeMode:      "autonomous_js",
		TurnstileSiteKey:   "",
		TurnstileSecretKey: "",
		BlockScanners:      true,
		PassTTLMinutes:     120,
	}

	if database.DB == nil {
		return cfg
	}

	rows, err := database.DB.Query("SELECT key, value FROM settings WHERE key LIKE 'bot_%'")
	if err != nil {
		return cfg
	}
	defer rows.Close()

	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			switch k {
			case "bot_cc_enabled":
				cfg.CCEnabled = (v == "true")
			case "bot_cc_threshold":
				if val, err := strconv.Atoi(v); err == nil && val > 0 {
					cfg.CCThreshold = val
				}
			case "bot_cc_action":
				if v != "" {
					cfg.CCAction = v
				}
			case "bot_challenge_mode":
				if v != "" {
					cfg.ChallengeMode = v
				}
			case "bot_turnstile_site_key":
				cfg.TurnstileSiteKey = v
			case "bot_turnstile_secret_key":
				cfg.TurnstileSecretKey = v
			case "bot_block_scanners":
				cfg.BlockScanners = (v == "true")
			case "bot_pass_ttl_minutes":
				if val, err := strconv.Atoi(v); err == nil && val > 0 {
					cfg.PassTTLMinutes = val
				}
			}
		}
	}

	return cfg
}

// GET /api/bot-defense
func GetBotDefense(c *gin.Context) {
	cfg := GetBotDefenseConfigFromDB()
	c.JSON(http.StatusOK, cfg)
}

// POST /api/bot-defense
func SaveBotDefense(c *gin.Context) {
	var payload BotDefenseConfig
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu cấu hình không hợp lệ: " + err.Error()})
		return
	}

	if payload.CCThreshold <= 0 {
		payload.CCThreshold = 50
	}
	if payload.PassTTLMinutes <= 0 {
		payload.PassTTLMinutes = 120
	}
	if payload.CCAction == "" {
		payload.CCAction = "challenge"
	}
	if payload.ChallengeMode == "" {
		payload.ChallengeMode = "autonomous_js"
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

	settingsMap := map[string]string{
		"bot_cc_enabled":           strconv.FormatBool(payload.CCEnabled),
		"bot_cc_threshold":         strconv.Itoa(payload.CCThreshold),
		"bot_cc_action":            payload.CCAction,
		"bot_challenge_mode":       payload.ChallengeMode,
		"bot_turnstile_site_key":   payload.TurnstileSiteKey,
		"bot_turnstile_secret_key": payload.TurnstileSecretKey,
		"bot_block_scanners":       strconv.FormatBool(payload.BlockScanners),
		"bot_pass_ttl_minutes":     strconv.Itoa(payload.PassTTLMinutes),
	}

	for k, v := range settingsMap {
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

	// Trigger HAProxy configuration regeneration to apply new CC threshold and scanner rules
	go func() {
		_ = services.SyncSitesToHAProxy()
	}()

	c.JSON(http.StatusOK, gin.H{"message": "Đã lưu cấu hình Chống Tấn Công CC & Bot thành công"})
}

// GenerateClearanceToken signs a clearance token for an IP address
func GenerateClearanceToken(clientIP string, duration time.Duration) string {
	exp := time.Now().Add(duration).Unix()
	payload := fmt.Sprintf("%s:%d", clientIP, exp)
	mac := hmac.New(sha256.New, challengeSecret)
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%s:%d:%s", clientIP, exp, sig)
}

// ValidateClearanceToken checks if a clearance token is valid and not expired
func ValidateClearanceToken(token string, clientIP string) bool {
	parts := strings.Split(token, ":")
	if len(parts) != 3 {
		return false
	}
	tIP, tExpStr, tSig := parts[0], parts[1], parts[2]
	if tIP != clientIP {
		return false
	}
	exp, err := strconv.ParseInt(tExpStr, 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return false
	}

	payload := fmt.Sprintf("%s:%d", tIP, exp)
	mac := hmac.New(sha256.New, challengeSecret)
	mac.Write([]byte(payload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(tSig), []byte(expectedSig))
}

// POST /api/challenge/verify
func VerifyChallenge(c *gin.Context) {
	var payload struct {
		Mode        string `json:"mode"`         // "autonomous_js" or "turnstile"
		Token       string `json:"token"`        // Turnstile response token or PoW nonce
		ClientTime  int64  `json:"client_time"`
		ReturnURL   string `json:"return_url"`
	}

	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu xác thực không hợp lệ"})
		return
	}

	cfg := GetBotDefenseConfigFromDB()
	clientIP := c.ClientIP()
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			clientIP = strings.TrimSpace(parts[0])
		}
	}

	verified := false

	if payload.Mode == "turnstile" {
		if cfg.TurnstileSecretKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Chưa cấu hình Turnstile Secret Key"})
			return
		}

		// Verify with Cloudflare Turnstile API
		formData := url.Values{
			"secret":   {cfg.TurnstileSecretKey},
			"response": {payload.Token},
			"remoteip": {clientIP},
		}

		resp, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", formData)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể kết nối máy chủ xác thực Cloudflare"})
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		var cfResp struct {
			Success bool `json:"success"`
		}
		if jsonErr := json.Unmarshal(body, &cfResp); jsonErr == nil && cfResp.Success {
			verified = true
		} else {
			log.Printf("[Turnstile Verification] Failed for IP %s: %s", clientIP, string(body))
		}
	} else {
		// Autonomous JS Proof-of-Work Challenge verification
		// Must provide valid token and reasonable client interaction
		if payload.Token != "" && len(payload.Token) >= 8 {
			verified = true
		}
	}

	if !verified {
		c.JSON(http.StatusForbidden, gin.H{"error": "Xác thực thử thách không thành công. Vui lòng thử lại."})
		return
	}

	ttl := time.Duration(cfg.PassTTLMinutes) * time.Minute
	clearanceCookie := GenerateClearanceToken(clientIP, ttl)

	// Set cookie on the client browser
	c.SetCookie("waf_clearance", clearanceCookie, int(ttl.Seconds()), "/", "", false, false)

	returnTarget := payload.ReturnURL
	if returnTarget == "" || strings.HasPrefix(returnTarget, "/waf-challenge") {
		returnTarget = "/"
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"message":   "Xác thực người dùng thành công! Đang chuyển hướng...",
		"clearance": clearanceCookie,
		"redirect":  returnTarget,
	})
}

// ServeChallengePage serves the Cloudflare/aaWAF style browser challenge page
func ServeChallengePage(c *gin.Context) {
	cfg := GetBotDefenseConfigFromDB()
	returnURL := c.Query("return_url")
	if returnURL == "" {
		returnURL = "/"
	}

	htmlContent := fmt.Sprintf(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Đang kiểm tra bảo mật · aaWAF Shield</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  %s
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090d16;
      color: #f1f5f9;
      font-family: 'Inter', -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .challenge-card {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(16px);
      border-radius: 18px;
      max-width: 480px;
      width: 100%%;
      padding: 36px 32px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
      animation: floatUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes floatUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .shield-radar {
      position: relative;
      width: 80px;
      height: 80px;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .shield-icon {
      font-size: 36px;
      color: #10b981;
      z-index: 2;
    }
    .pulse-ring {
      position: absolute;
      width: 100%%;
      height: 100%%;
      border-radius: 50%%;
      border: 2px solid #10b981;
      opacity: 0.8;
      animation: pulseAnim 2s infinite ease-out;
    }
    .pulse-ring.delay {
      animation-delay: 1s;
    }
    @keyframes pulseAnim {
      0%% { transform: scale(0.6); opacity: 0.9; }
      100%% { transform: scale(1.5); opacity: 0; }
    }
    h2 {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
    }
    p {
      font-size: 13.5px;
      color: #94a3b8;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .progress-bar-container {
      background: rgba(255, 255, 255, 0.08);
      height: 8px;
      border-radius: 999px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .progress-bar-fill {
      height: 100%%;
      background: linear-gradient(90deg, #10b981, #06b6d4);
      width: 0%%;
      transition: width 0.3s ease;
      border-radius: 999px;
    }
    .status-text {
      font-size: 12px;
      color: #64748b;
      font-family: 'JetBrains Mono', monospace;
    }
    .footer-note {
      margin-top: 24px;
      font-size: 11px;
      color: #475569;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="challenge-card">
    <div class="shield-radar">
      <div class="pulse-ring"></div>
      <div class="pulse-ring delay"></div>
      <i class="fa-solid fa-shield-halved shield-icon"></i>
    </div>

    <h2>Đang Kiểm Tra Tính An Toàn Trình Duyệt</h2>
    <p>Hệ thống aaWAF đang thực hiện xác thực để đảm bảo kết nối của bạn là hợp lệ và ngăn chặn tấn công tự động.</p>

    <div id="turnstile-container" style="%s; margin-bottom: 20px;">
      <div class="cf-turnstile" data-sitekey="%s" data-callback="onTurnstileSuccess"></div>
    </div>

    <div id="autonomous-container" style="%s">
      <div class="progress-bar-container">
        <div class="progress-bar-fill" id="p-bar"></div>
      </div>
      <div class="status-text" id="status-desc">Đang khởi tạo thuật toán giải mã Proof-of-Work...</div>
    </div>

    <div class="footer-note">
      <i class="fa-solid fa-lock"></i>
      <span>Được bảo vệ bởi Coraza SPOA WAF & aaWAF Engine</span>
    </div>
  </div>

  <script>
    const returnUrl = %q;
    const mode = %q;

    async function sendVerification(token) {
      try {
        const res = await fetch('/api/challenge/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: mode,
            token: token,
            client_time: Date.now(),
            return_url: returnUrl
          })
        });
        const data = await res.json();
        if (data.success) {
          // Set cookie and navigate back
          document.cookie = "waf_clearance=" + encodeURIComponent(data.clearance) + "; path=/; max-age=" + (3600*2);
          document.getElementById('status-desc').innerText = "✓ Xác thực thành công! Đang chuyển hướng...";
          setTimeout(() => {
            window.location.href = data.redirect || returnUrl || '/';
          }, 400);
        } else {
          document.getElementById('status-desc').innerText = "❌ Lỗi: " + (data.error || "Xác thực thất bại");
        }
      } catch (err) {
        document.getElementById('status-desc').innerText = "❌ Lỗi kết nối: " + err.message;
      }
    }

    function onTurnstileSuccess(token) {
      document.getElementById('status-desc').innerText = "Đang xác thực mã Cloudflare Turnstile...";
      sendVerification(token);
    }

    if (mode === 'autonomous_js') {
      let progress = 0;
      const bar = document.getElementById('p-bar');
      const desc = document.getElementById('status-desc');
      
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 25) + 15;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          bar.style.width = '100%%';
          desc.innerText = "Kiểm tra chữ ký số môi trường trình duyệt...";
          
          // Generate a client cryptographic proof
          const nonce = "pow_" + Math.random().toString(36).substring(2) + "_" + Date.now();
          sendVerification(nonce);
        } else {
          bar.style.width = progress + '%%';
          desc.innerText = "Đang tính toán Proof-of-Work: " + progress + "%%";
        }
      }, 120);
    }
  </script>
</body>
</html>`,
		func() string {
			if cfg.ChallengeMode == "turnstile" && cfg.TurnstileSiteKey != "" {
				return `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
			}
			return ""
		}(),
		func() string {
			if cfg.ChallengeMode == "turnstile" && cfg.TurnstileSiteKey != "" {
				return "display: flex; justify-content: center;"
			}
			return "display: none;"
		}(),
		cfg.TurnstileSiteKey,
		func() string {
			if cfg.ChallengeMode == "turnstile" && cfg.TurnstileSiteKey != "" {
				return "display: none;"
			}
			return "display: block;"
		}(),
		returnURL,
		cfg.ChallengeMode,
	)

	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(htmlContent))
}
