package handlers

import (
	"net/http"
	"strings"
	"sync"
	"time"
	"waf-backend/database"

	"github.com/gin-gonic/gin"
)

var (
	settingsCacheMu sync.RWMutex
	cachedSettings  = make(map[string]string)
	lastSettingsLoad time.Time

	// Simple in-memory sliding window rate limiter per client IP
	rateLimiterMu sync.Mutex
	ipRequestCounts = make(map[string][]time.Time)
)

func getCachedSetting(key, defaultValue string) string {
	settingsCacheMu.RLock()
	if time.Since(lastSettingsLoad) < 10*time.Second {
		val, exists := cachedSettings[key]
		settingsCacheMu.RUnlock()
		if exists && val != "" {
			return val
		}
		return defaultValue
	}
	settingsCacheMu.RUnlock()

	// Refresh cache
	settingsCacheMu.Lock()
	defer settingsCacheMu.Unlock()

	rows, err := database.DB.Query("SELECT key, value FROM settings")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				cachedSettings[k] = v
			}
		}
		lastSettingsLoad = time.Now()
	}

	if val, ok := cachedSettings[key]; ok && val != "" {
		return val
	}
	return defaultValue
}

// GetCachedSettings returns a copy of current system settings
func GetCachedSettings() map[string]string {
	settingsCacheMu.Lock()
	defer settingsCacheMu.Unlock()

	if time.Since(lastSettingsLoad) >= 10*time.Second {
		rows, err := database.DB.Query("SELECT key, value FROM settings")
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var k, v string
				if err := rows.Scan(&k, &v); err == nil {
					cachedSettings[k] = v
				}
			}
			lastSettingsLoad = time.Now()
		}
	}

	clone := make(map[string]string, len(cachedSettings))
	for k, v := range cachedSettings {
		clone[k] = v
	}
	return clone
}

// InvalidateSettingsCache forces immediate cache refresh
func InvalidateSettingsCache() {
	settingsCacheMu.Lock()
	defer settingsCacheMu.Unlock()
	lastSettingsLoad = time.Time{}
}

// SecurityMiddleware validates authorized_ips and rate limits on admin API
func SecurityMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()

		// 1. Authorized IPs Whitelist Enforcement for management actions
		// Applies to modifying settings, rebooting, deleting sites/rules
		authorizedIPsStr := getCachedSetting("authorized_ips", "")
		if authorizedIPsStr != "" {
			allowedList := strings.Split(authorizedIPsStr, ",")
			isAllowed := false

			// Always allow internal docker networks and localhost
			if clientIP == "127.0.0.1" || clientIP == "::1" || strings.HasPrefix(clientIP, "172.") || strings.HasPrefix(clientIP, "10.") {
				isAllowed = true
			}

			if !isAllowed {
				for _, ip := range allowedList {
					trimmed := strings.TrimSpace(ip)
					if trimmed != "" && (trimmed == clientIP || strings.HasPrefix(clientIP, trimmed)) {
						isAllowed = true
						break
					}
				}
			}

			// If restricted and IP is not in whitelist, deny write/system access
			if !isAllowed && (strings.HasPrefix(c.Request.URL.Path, "/api/settings") || strings.HasPrefix(c.Request.URL.Path, "/api/system")) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"error": "Quyền truy cập bị từ chối: Địa chỉ IP của bạn (" + clientIP + ") không nằm trong danh sách IP Được Phép Quản Trị (Authorized IPs).",
				})
				return
			}
		}

		// 2. API Rate Limiting
		rateLimitEnabled := getCachedSetting("rate_limit_enabled", "true")
		if rateLimitEnabled == "true" || rateLimitEnabled == "1" {
			rateLimiterMu.Lock()
			now := time.Now()
			windowStart := now.Add(-10 * time.Second)

			// Clean old timestamps
			validTimes := make([]time.Time, 0, len(ipRequestCounts[clientIP]))
			for _, t := range ipRequestCounts[clientIP] {
				if t.After(windowStart) {
					validTimes = append(validTimes, t)
				}
			}

			maxReqs := 100 // Allow up to 100 requests per 10s per client for dashboard APIs
			if len(validTimes) >= maxReqs {
				rateLimiterMu.Unlock()
				c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
					"error": "Quá nhiều yêu cầu tới Dashboard API. Vui lòng thử lại sau.",
				})
				return
			}

			ipRequestCounts[clientIP] = append(validTimes, now)
			rateLimiterMu.Unlock()
		}

		c.Next()
	}
}
