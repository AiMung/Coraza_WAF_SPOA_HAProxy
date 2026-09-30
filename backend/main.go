package main

import (
	"log"
	"os"
	"path/filepath"
	"waf-backend/database"
	"waf-backend/handlers"
	"waf-backend/services"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	log.Println("Starting Coraza WAF Management Backend API...")

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/waf.db"
	}
	auditLogPath := os.Getenv("AUDIT_LOG_PATH")
	if auditLogPath == "" {
		auditLogPath = "/var/log/coraza/audit.log"
	}

	// 1. Initialize SQLite Database
	database.InitDB(dbPath)

	// 2. Load Configuration & Start Interactive Telegram Bot
	services.LoadTelegramConfig()
	services.StartTelegramBot()

	// 3. Sync IP Blacklist/Whitelist to HAProxy & Coraza + Start Expiration Countdown Daemon
	_ = services.SyncIPRulesToFile()
	services.StartIPRulesExpirationDaemon()

	// 4. Sync Protected Sites → Auto-generate HAProxy VHost routing config
	if err := services.SyncSitesToHAProxy(); err != nil {
		log.Printf("Warning: Initial HAProxy sites sync failed: %v", err)
	}

	// 5. Sync Custom Rules to custom_rules.conf
	if err := services.SyncCustomRulesToFile(); err != nil {
		log.Printf("Warning: Initial custom rules sync failed: %v", err)
	}

	// 6. Start WebSocket Hub in background
	go services.WSHub.Run()

	// 7. Start Coraza Audit Log Watcher in background
	services.StartLogWatcher(auditLogPath)

	// 8. Setup Gin Router
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// CORS Setup
	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// API Routes
	api := r.Group("/api")
	{
		api.GET("/stats", handlers.GetStats)
		api.GET("/logs", handlers.GetLogs)
		api.GET("/logs/export", handlers.ExportLogs)
		api.GET("/rules", handlers.GetRules)
		api.GET("/custom-rules", handlers.GetCustomRules)
		api.POST("/custom-rules", handlers.CreateCustomRule)
		api.PUT("/custom-rules/:id", handlers.UpdateCustomRule)
		api.DELETE("/custom-rules/:id", handlers.DeleteCustomRule)
		api.POST("/custom-rules/:id/toggle", handlers.ToggleCustomRule)
		api.POST("/custom-rules/test-eval", handlers.TestCustomRuleSyntax)
		api.GET("/ip-rules", handlers.GetIPRules)
		api.POST("/ip-rules", handlers.AddIPRule)
		api.DELETE("/ip-rules/:id", handlers.DeleteIPRule)
		api.GET("/telegram", handlers.GetTelegram)
		api.POST("/telegram", handlers.UpdateTelegram)
		api.GET("/sites", handlers.GetSites)
		api.POST("/sites", handlers.AddSite)
		api.PUT("/sites/:id", handlers.UpdateSite)
		api.DELETE("/sites/:id", handlers.DeleteSite)
		api.POST("/sites/:id/toggle", handlers.ToggleSiteWAF)
		api.POST("/sites/:id/ping", handlers.PingSite)
		api.POST("/sites/:id/test-waf", handlers.TestWAFSite)
		api.POST("/simulate-attack", handlers.SimulateAttack)
		api.GET("/settings", handlers.GetSettings)
		api.POST("/settings", handlers.SaveSettings)
		api.POST("/settings/password", handlers.UpdateAdminPassword)
		api.POST("/system/fix", handlers.SystemFix)
		api.POST("/system/reboot", handlers.SystemReboot)
	}

	// WebSocket Live Endpoint
	r.GET("/ws", func(c *gin.Context) {
		services.HandleWebSocket(services.WSHub, c.Writer, c.Request)
	})

	// Serve Static Frontend Assets
	frontendDir := os.Getenv("FRONTEND_DIR")
	if frontendDir == "" {
		frontendDir = "/app/frontend"
	}

	r.Static("/css", filepath.Join(frontendDir, "css"))
	r.Static("/js", filepath.Join(frontendDir, "js"))
	r.Static("/assets", filepath.Join(frontendDir, "assets"))

	r.NoRoute(func(c *gin.Context) {
		path := filepath.Join(frontendDir, c.Request.URL.Path)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			c.File(path)
			return
		}
		c.File(filepath.Join(frontendDir, "index.html"))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server listening on port %s (http://0.0.0.0:%s)\n", port, port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
