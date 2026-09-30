package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"waf-backend/database"
	"waf-backend/services"

	"github.com/gin-gonic/gin"
)

func setupTestRouter(t *testing.T) *gin.Engine {
	gin.SetMode(gin.TestMode)

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	database.InitDB(dbPath)
	services.LoadTelegramConfig()

	r := gin.Default()
	api := r.Group("/api")
	{
		api.GET("/stats", GetStats)
		api.GET("/logs", GetLogs)
		api.GET("/logs/export", ExportLogs)
		api.GET("/rules", GetRules)
		api.GET("/ip-rules", GetIPRules)
		api.POST("/ip-rules", AddIPRule)
		api.DELETE("/ip-rules/:id", DeleteIPRule)
		api.GET("/telegram", GetTelegram)
		api.POST("/telegram", UpdateTelegram)
		api.POST("/simulate-attack", SimulateAttack)
		api.POST("/system/fix", SystemFix)
		api.POST("/system/reboot", SystemReboot)
	}

	return r
}

func TestGetStats(t *testing.T) {
	r := setupTestRouter(t)

	req, _ := http.NewRequest("GET", "/api/stats?range=today", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
	}

	var resp AaWafOverviewResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.Range != "today" {
		t.Errorf("Expected range today, got %s", resp.Range)
	}
}

func TestSimulateAttackAndGetLogs(t *testing.T) {
	r := setupTestRouter(t)

	// 1. Simulate an attack
	req, _ := http.NewRequest("POST", "/api/simulate-attack", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("SimulateAttack expected status 200, got %d", w.Code)
	}

	// 2. Fetch logs
	reqLogs, _ := http.NewRequest("GET", "/api/logs?page=1&limit=10", nil)
	wLogs := httptest.NewRecorder()
	r.ServeHTTP(wLogs, reqLogs)

	if wLogs.Code != http.StatusOK {
		t.Fatalf("GetLogs expected status 200, got %d", wLogs.Code)
	}

	var logsResp struct {
		TotalCount int64                `json:"total_count"`
		Data       []database.AttackLog `json:"data"`
	}
	if err := json.Unmarshal(wLogs.Body.Bytes(), &logsResp); err != nil {
		t.Fatalf("Failed to parse logs response: %v", err)
	}

	if logsResp.TotalCount < 1 {
		t.Errorf("Expected at least 1 log after simulation, got %d", logsResp.TotalCount)
	}
}

func TestExportLogsCSVAndJSON(t *testing.T) {
	r := setupTestRouter(t)

	// Simulate one attack first so we have data
	reqSim, _ := http.NewRequest("POST", "/api/simulate-attack", nil)
	wSim := httptest.NewRecorder()
	r.ServeHTTP(wSim, reqSim)

	// Test CSV Export
	reqCSV, _ := http.NewRequest("GET", "/api/logs/export?format=csv", nil)
	wCSV := httptest.NewRecorder()
	r.ServeHTTP(wCSV, reqCSV)

	if wCSV.Code != http.StatusOK {
		t.Fatalf("ExportLogs CSV expected 200, got %d", wCSV.Code)
	}
	if !bytes.Contains(wCSV.Body.Bytes(), []byte("ID,TxnID,ClientIP")) {
		t.Errorf("Expected CSV header in export output, got: %s", wCSV.Body.String())
	}

	// Test JSON Export
	reqJSON, _ := http.NewRequest("GET", "/api/logs/export?format=json", nil)
	wJSON := httptest.NewRecorder()
	r.ServeHTTP(wJSON, reqJSON)

	if wJSON.Code != http.StatusOK {
		t.Fatalf("ExportLogs JSON expected 200, got %d", wJSON.Code)
	}
	var exportResp struct {
		Total int                  `json:"total"`
		Data  []database.AttackLog `json:"data"`
	}
	if err := json.Unmarshal(wJSON.Body.Bytes(), &exportResp); err != nil {
		t.Fatalf("ExportLogs JSON parse failed: %v", err)
	}
	if exportResp.Total < 1 {
		t.Errorf("Expected at least 1 exported log item, got %d", exportResp.Total)
	}
}

func TestIPRulesCRUD(t *testing.T) {
	r := setupTestRouter(t)

	// 1. Add IP rule
	ruleBody := map[string]string{
		"ip":        "203.0.113.45",
		"rule_type": "blacklist",
		"reason":    "Automated port scanner test",
	}
	bodyBytes, _ := json.Marshal(ruleBody)
	reqAdd, _ := http.NewRequest("POST", "/api/ip-rules", bytes.NewReader(bodyBytes))
	reqAdd.Header.Set("Content-Type", "application/json")
	wAdd := httptest.NewRecorder()
	r.ServeHTTP(wAdd, reqAdd)

	if wAdd.Code != http.StatusOK {
		t.Fatalf("AddIPRule expected 200, got %d, body: %s", wAdd.Code, wAdd.Body.String())
	}

	// 2. Get IP rules
	reqGet, _ := http.NewRequest("GET", "/api/ip-rules", nil)
	wGet := httptest.NewRecorder()
	r.ServeHTTP(wGet, reqGet)

	if wGet.Code != http.StatusOK {
		t.Fatalf("GetIPRules expected 200, got %d", wGet.Code)
	}

	var rules []database.IPRule
	if err := json.Unmarshal(wGet.Body.Bytes(), &rules); err != nil {
		t.Fatalf("Failed to parse IPRules: %v", err)
	}

	var createdID int64
	found := false
	for _, rule := range rules {
		if rule.IP == "203.0.113.45" {
			found = true
			createdID = rule.ID
			break
		}
	}
	if !found {
		t.Fatalf("Created IP rule not found in list")
	}

	// 3. Delete IP rule
	reqDel, _ := http.NewRequest("DELETE", fmt.Sprintf("/api/ip-rules/%d", createdID), nil)
	wDel := httptest.NewRecorder()
	r.ServeHTTP(wDel, reqDel)

	if wDel.Code != http.StatusOK {
		t.Errorf("DeleteIPRule expected 200, got %d", wDel.Code)
	}
}

func TestTelegramConfigEndpoints(t *testing.T) {
	r := setupTestRouter(t)

	// Update config
	cfg := database.TelegramConfig{
		BotToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
		ChatID:   "-100123456789",
		Enabled:  true,
	}
	bodyBytes, _ := json.Marshal(cfg)
	reqUpdate, _ := http.NewRequest("POST", "/api/telegram", bytes.NewReader(bodyBytes))
	reqUpdate.Header.Set("Content-Type", "application/json")
	wUpdate := httptest.NewRecorder()
	r.ServeHTTP(wUpdate, reqUpdate)

	if wUpdate.Code != http.StatusOK {
		t.Fatalf("UpdateTelegram expected 200, got %d", wUpdate.Code)
	}

	// Get config
	reqGet, _ := http.NewRequest("GET", "/api/telegram", nil)
	wGet := httptest.NewRecorder()
	r.ServeHTTP(wGet, reqGet)

	if wGet.Code != http.StatusOK {
		t.Fatalf("GetTelegram expected 200, got %d", wGet.Code)
	}

	var fetched database.TelegramConfig
	if err := json.Unmarshal(wGet.Body.Bytes(), &fetched); err != nil {
		t.Fatalf("Failed to parse Telegram config: %v", err)
	}

	if fetched.ChatID != "-100123456789" || !fetched.Enabled {
		t.Errorf("Telegram config mismatch: %+v", fetched)
	}
}

func TestSystemEndpoints(t *testing.T) {
	r := setupTestRouter(t)

	// Test System Fix
	reqFix, _ := http.NewRequest("POST", "/api/system/fix", nil)
	wFix := httptest.NewRecorder()
	r.ServeHTTP(wFix, reqFix)
	if wFix.Code != http.StatusOK {
		t.Errorf("SystemFix expected 200, got %d", wFix.Code)
	}

	// Test System Reboot
	reqReboot, _ := http.NewRequest("POST", "/api/system/reboot", nil)
	wReboot := httptest.NewRecorder()
	r.ServeHTTP(wReboot, reqReboot)
	if wReboot.Code != http.StatusOK {
		t.Errorf("SystemReboot expected 200, got %d", wReboot.Code)
	}
}
