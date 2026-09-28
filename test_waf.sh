#!/bin/bash
# ==========================================================
# WAF Smoke Test & Attack Verification Script
# ==========================================================

TARGET_IP=${1:-"127.0.0.1"}
echo "=========================================================="
echo "🛡️  BẮT ĐẦU KIỂM TRA HỆ THỐNG WAF TẠI http://${TARGET_IP}"
echo "=========================================================="

# 1. Test Clean Traffic (Must be 200 OK)
echo -e "\n[1] Kiểm tra truy cập hợp lệ (Clean Traffic)..."
CLEAN_RESP=$(curl -s -o /dev/null -w "%{http_code}" "http://${TARGET_IP}/")
if [ "$CLEAN_RESP" == "200" ]; then
    echo "  -> ✅ PASS: Trả về HTTP 200 OK"
else
    echo "  -> ❌ FAIL: Trả về HTTP $CLEAN_RESP"
fi

# 2. Test Custom Smoke Rule
echo -e "\n[2] Kiểm tra Rule Smoke Test (?testwaf=attack)..."
SMOKE_RESP=$(curl -s -o /dev/null -w "%{http_code}" "http://${TARGET_IP}/?testwaf=attack")
if [ "$SMOKE_RESP" == "403" ]; then
    echo "  -> ✅ PASS: Đã chặn thành công với HTTP 403 Forbidden"
else
    echo "  -> ❌ FAIL: Nhận mã HTTP $SMOKE_RESP"
fi

# 3. Test SQL Injection
echo -e "\n[3] Kiểm tra chặn SQL Injection (SQLi)..."
SQLI_RESP=$(curl -s -o /dev/null -w "%{http_code}" "http://${TARGET_IP}/?id=1'%20OR%201=1--")
if [ "$SQLI_RESP" == "403" ]; then
    echo "  -> ✅ PASS: Đã chặn SQL Injection với HTTP 403 Forbidden"
else
    echo "  -> ❌ FAIL: Nhận mã HTTP $SQLI_RESP"
fi

# 4. Test Cross-Site Scripting (XSS)
echo -e "\n[4] Kiểm tra chặn Cross-Site Scripting (XSS)..."
XSS_RESP=$(curl -s -o /dev/null -w "%{http_code}" "http://${TARGET_IP}/?q=<script>alert(1)</script>")
if [ "$XSS_RESP" == "403" ]; then
    echo "  -> ✅ PASS: Đã chặn XSS với HTTP 403 Forbidden"
else
    echo "  -> ❌ FAIL: Nhận mã HTTP $XSS_RESP"
fi

# 5. Test Path Traversal / LFI
echo -e "\n[5] Kiểm tra chặn Path Traversal / LFI (/etc/passwd)..."
LFI_RESP=$(curl -s -o /dev/null -w "%{http_code}" "http://${TARGET_IP}/?file=../../../../etc/passwd")
if [ "$LFI_RESP" == "403" ]; then
    echo "  -> ✅ PASS: Đã chặn LFI với HTTP 403 Forbidden"
else
    echo "  -> ❌ FAIL: Nhận mã HTTP $LFI_RESP"
fi

# 6. Test Scanner User-Agent Block (sqlmap)
echo -e "\n[6] Kiểm tra chặn Scanner (sqlmap User-Agent)..."
SCANNER_RESP=$(curl -s -o /dev/null -w "%{http_code}" -A "sqlmap/1.6#stable" "http://${TARGET_IP}/")
if [ "$SCANNER_RESP" == "403" ]; then
    echo "  -> ✅ PASS: Đã chặn Security Scanner với HTTP 403 Forbidden"
else
    echo "  -> ❌ FAIL: Nhận mã HTTP $SCANNER_RESP"
fi

echo -e "\n=========================================================="
echo "🎉 HOÀN TẤT KIỂM TRA! Hãy mở Web Dashboard tại:"
echo "👉 http://${TARGET_IP}:8080 để xem thống kê Realtime & Telegram Alert"
echo "=========================================================="
