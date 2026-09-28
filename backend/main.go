package main

import (
	"log"
	"net/http"
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

	// 2. Load Configuration (Telegram, Rules)
	services.LoadTelegramConfig()

	// 3. Start WebSocket Hub in background
	go services.WSHub.Run()

	// 4. Start Coraza Audit Log Watcher in background
	services.StartLogWatcher(auditLogPath)

	// 5. Setup Gin Router
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
		api.GET("/rules", handlers.GetRules)
		api.GET("/ip-rules", handlers.GetIPRules)
		api.POST("/ip-rules", handlers.AddIPRule)
		api.DELETE("/ip-rules/:id", handlers.DeleteIPRule)
		api.GET("/telegram", handlers.GetTelegram)
		api.POST("/telegram", handlers.UpdateTelegram)
		api.POST("/telegram/test", handlers.TestTelegram)
		api.POST("/simulate-attack", handlers.SimulateAttack)
	}

	// WebSocket Live Endpoint
	r.GET("/ws", func(c *gin.Context) {
		services.HandleWebSocket(services.WSHub, c.Writer, c.Request)
	})

	// Serve Static Frontend if exists
	frontendDir := os.Getenv("FRONTEND_DIR")
	if frontendDir == "" {
		frontendDir = "../frontend"
	}
	if _, err := os.Stat(frontendDir); err == nil {
		r.Static("/static", frontendDir)
		r.NoRoute(func(c *gin.Context) {
			c.File(filepath.Join(frontendDir, "index.html"))
		})
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server listening on port %s (http://0.0.0.0:%s)\n", port, port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
