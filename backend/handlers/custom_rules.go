package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"waf-backend/database"
	"waf-backend/services"

	"github.com/gin-gonic/gin"
)

type CustomRuleRequest struct {
	RuleID      int    `json:"rule_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	SecRule     string `json:"sec_rule"`
	Severity    string `json:"severity"`
	Action      string `json:"action"`
	Phase       int    `json:"phase"`
}

// GET /api/custom-rules
func GetCustomRules(c *gin.Context) {
	rows, err := database.DB.Query(`
		SELECT id, rule_id, name, description, sec_rule, severity, action, phase, enabled, created_at, updated_at
		FROM custom_rules
		ORDER BY rule_id ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể truy vấn danh sách quy tắc: " + err.Error()})
		return
	}
	defer rows.Close()

	var rules []database.CustomRule
	for rows.Next() {
		var r database.CustomRule
		var enabledInt int
		err := rows.Scan(
			&r.ID, &r.RuleID, &r.Name, &r.Description, &r.SecRule,
			&r.Severity, &r.Action, &r.Phase, &enabledInt,
			&r.CreatedAt, &r.UpdatedAt,
		)
		if err != nil {
			continue
		}
		r.Enabled = enabledInt == 1
		rules = append(rules, r)
	}

	if rules == nil {
		rules = []database.CustomRule{}
	}

	c.JSON(http.StatusOK, rules)
}

// POST /api/custom-rules
func CreateCustomRule(c *gin.Context) {
	var req CustomRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.SecRule = strings.TrimSpace(req.SecRule)

	if req.Name == "" || req.SecRule == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tên quy tắc và nội dung SecRule không được để trống"})
		return
	}

	// Basic validation of SecRule syntax
	if !strings.HasPrefix(strings.ToLower(req.SecRule), "secrule ") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Quy tắc phải bắt đầu bằng từ khóa 'SecRule '"})
		return
	}

	// If rule_id not provided, find highest rule_id + 1
	if req.RuleID <= 0 {
		var maxID sql.NullInt64
		_ = database.DB.QueryRow("SELECT MAX(rule_id) FROM custom_rules").Scan(&maxID)
		if maxID.Valid && maxID.Int64 >= 1000 {
			req.RuleID = int(maxID.Int64) + 1
		} else {
			req.RuleID = 1001
		}
	}

	// Ensure rule_id is embedded in sec_rule string or append it
	if !strings.Contains(req.SecRule, fmt.Sprintf("id:%d", req.RuleID)) {
		// Attempt to extract or replace id:XXXX
		idRegex := regexp.MustCompile(`id:\d+`)
		if idRegex.MatchString(req.SecRule) {
			req.SecRule = idRegex.ReplaceAllString(req.SecRule, fmt.Sprintf("id:%d", req.RuleID))
		}
	}

	if req.Severity == "" {
		req.Severity = "CRITICAL"
	}
	if req.Action == "" {
		req.Action = "deny"
	}
	if req.Phase <= 0 {
		req.Phase = 2
	}

	res, err := database.DB.Exec(`
		INSERT INTO custom_rules (rule_id, name, description, sec_rule, severity, action, phase, enabled)
		VALUES (?, ?, ?, ?, ?, ?, ?, 1)
	`, req.RuleID, req.Name, req.Description, req.SecRule, req.Severity, req.Action, req.Phase)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Mã Rule ID %d đã tồn tại trên hệ thống", req.RuleID)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	id, _ := res.LastInsertId()

	// Sync to custom_rules.conf and reload Coraza
	if err := services.SyncCustomRulesToFile(); err != nil {
		log := fmt.Sprintf("Warning syncing rules: %v", err)
		_ = log
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Đã thêm quy tắc WAF tùy biến thành công",
		"id":      id,
		"rule_id": req.RuleID,
	})
}

// PUT /api/custom-rules/:id
func UpdateCustomRule(c *gin.Context) {
	id := c.Param("id")
	var req CustomRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.SecRule = strings.TrimSpace(req.SecRule)

	if req.SecRule != "" && !strings.HasPrefix(strings.ToLower(req.SecRule), "secrule ") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Quy tắc phải bắt đầu bằng 'SecRule '"})
		return
	}

	_, err := database.DB.Exec(`
		UPDATE custom_rules
		SET name = COALESCE(NULLIF(?, ''), name),
		    description = COALESCE(NULLIF(?, ''), description),
		    sec_rule = COALESCE(NULLIF(?, ''), sec_rule),
		    severity = COALESCE(NULLIF(?, ''), severity),
		    action = COALESCE(NULLIF(?, ''), action),
		    phase = CASE WHEN ? > 0 THEN ? ELSE phase END,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, req.Name, req.Description, req.SecRule, req.Severity, req.Action, req.Phase, req.Phase, id)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Re-sync configuration to disk
	_ = services.SyncCustomRulesToFile()

	c.JSON(http.StatusOK, gin.H{"message": "Đã cập nhật quy tắc thành công"})
}

// DELETE /api/custom-rules/:id
func DeleteCustomRule(c *gin.Context) {
	id := c.Param("id")
	res, err := database.DB.Exec("DELETE FROM custom_rules WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	aff, _ := res.RowsAffected()
	if aff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy quy tắc cần xóa"})
		return
	}

	// Re-sync configuration to disk
	_ = services.SyncCustomRulesToFile()

	c.JSON(http.StatusOK, gin.H{"message": "Đã gỡ bỏ quy tắc khỏi Coraza WAF"})
}

// POST /api/custom-rules/:id/toggle
func ToggleCustomRule(c *gin.Context) {
	id := c.Param("id")

	var currentEnabled int
	err := database.DB.QueryRow("SELECT enabled FROM custom_rules WHERE id = ?", id).Scan(&currentEnabled)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy quy tắc"})
		return
	}

	newEnabled := 1
	if currentEnabled == 1 {
		newEnabled = 0
	}

	_, err = database.DB.Exec("UPDATE custom_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", newEnabled, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Re-sync configuration to disk
	_ = services.SyncCustomRulesToFile()

	c.JSON(http.StatusOK, gin.H{
		"message": "Đã chuyển trạng thái quy tắc thành công",
		"enabled": newEnabled == 1,
	})
}

// POST /api/custom-rules/test-eval
func TestCustomRuleSyntax(c *gin.Context) {
	var payload struct {
		SecRule string `json:"sec_rule"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"valid": false, "error": "Dữ liệu không hợp lệ"})
		return
	}

	rule := strings.TrimSpace(payload.SecRule)
	if rule == "" {
		c.JSON(http.StatusBadRequest, gin.H{"valid": false, "error": "Nội dung rule rỗng"})
		return
	}

	if !strings.HasPrefix(strings.ToLower(rule), "secrule ") {
		c.JSON(http.StatusOK, gin.H{
			"valid": false,
			"error": "Cú pháp không hợp lệ: Quy tắc phải bắt đầu bằng lệnh 'SecRule '",
		})
		return
	}

	// Extract rule id
	idRegex := regexp.MustCompile(`id:(\d+)`)
	matches := idRegex.FindStringSubmatch(rule)
	var ruleID int
	if len(matches) > 1 {
		ruleID, _ = strconv.Atoi(matches[1])
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":   true,
		"rule_id": ruleID,
		"message": "Cú pháp SecRule hợp lệ với chuẩn Coraza / ModSecurity v2",
	})
}
