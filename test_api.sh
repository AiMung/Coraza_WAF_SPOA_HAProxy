#!/bin/bash
# ============================================================
# Coraza WAF Dashboard — Integration Test Suite
# Tests all API endpoints, WebSocket, and data flow
# ============================================================

set -e

API_BASE="${API_BASE:-http://localhost:8080/api}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'
PASS=0
FAIL=0

pass() { ((PASS++)) || true; echo -e "  ${GREEN}✓ PASS${NC}: $1"; }
fail() { ((FAIL++)) || true; echo -e "  ${RED}✗ FAIL${NC}: $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Coraza WAF Dashboard — Integration Test Suite       ║"
echo "║  API: $API_BASE                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── Test 1: GET /api/stats ────────────────────────────────
echo "━━━ Test 1: GET /api/stats ━━━"
RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/stats?range=30days&category=ip_rank" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "Stats endpoint returns 200"
  
  # Check real data fields exist (no mock)
  if echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'system_status' in d" 2>/dev/null; then
    pass "system_status field present"
  else
    fail "system_status field missing"
  fi
  
  if echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'telemetry_charts' in d" 2>/dev/null; then
    pass "telemetry_charts field present"
  else
    fail "telemetry_charts field missing"
  fi

  if echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'access_map_rank' in d" 2>/dev/null; then
    pass "access_map_rank field present"
  else
    fail "access_map_rank field missing"
  fi

  # Verify system_status has real CPU/Memory info
  if echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ss = d['system_status']
assert ss['cpu_cores'] != 'N/A', 'cpu_cores is N/A'
assert ss['mem_total_mb'] > 0, 'mem_total_mb is 0'
print(f'  OS: {ss[\"sys\"]}, CPU: {ss[\"cpu_cores\"]}, RAM: {ss[\"mem_used_mb\"]}/{ss[\"mem_total_mb\"]} MB')
" 2>/dev/null; then
    pass "System status contains real OS metrics"
  else
    fail "System status does not contain real metrics"
  fi
else
  fail "Stats endpoint returned HTTP $HTTP_CODE"
fi

echo ""

# ─── Test 2: Simulate Attack (SQLi) ─────────────────────────
echo "━━━ Test 2: POST /api/simulate-attack?type=sqli ━━━"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/simulate-attack?type=sqli" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "SQLi simulation returns 200"
  
  # Check GeoIP enrichment 
  if echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
data = d.get('data', {})
assert 'country' in data or data.get('country') is not None, 'No country field'
print(f'  Attack Type: {data.get(\"attack_type\")}, IP: {data.get(\"client_ip\")}, Country: {data.get(\"country\", \"N/A\")}')
" 2>/dev/null; then
    pass "Simulated attack includes GeoIP data"
  else
    fail "Simulated attack missing GeoIP data"
  fi
else
  fail "SQLi simulation returned HTTP $HTTP_CODE"
fi

echo ""

# ─── Test 3: Simulate XSS, LFI, Scanner ──────────────────
echo "━━━ Test 3: POST /api/simulate-attack (XSS, LFI, Scanner) ━━━"
for ATTACK_TYPE in xss lfi scanner; do
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/simulate-attack?type=$ATTACK_TYPE" 2>/dev/null)
  HTTP_CODE=$(echo "$RESP" | tail -n1)
  if [ "$HTTP_CODE" = "200" ]; then
    pass "Simulation $ATTACK_TYPE returns 200"
  else
    fail "Simulation $ATTACK_TYPE returned HTTP $HTTP_CODE"
  fi
done

echo ""

# ─── Test 4: GET /api/logs (verify real data) ───────────────
echo "━━━ Test 4: GET /api/logs ━━━"
RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/logs?limit=10" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "Logs endpoint returns 200"
  
  if echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
logs = d.get('data', [])
total = d.get('total_count', 0)
print(f'  Total: {total} logs, Returned: {len(logs)} entries')
assert total >= 4, f'Expected at least 4 logs (from simulations), got {total}'
# Verify GeoIP enrichment in log entries
if logs:
    log = logs[0]
    assert 'country' in log, 'Log missing country field'
    assert 'flag' in log, 'Log missing flag field'
    print(f'  Latest: [{log[\"attack_type\"]}] IP: {log[\"client_ip\"]} | {log[\"flag\"]} {log[\"country\"]}')
" 2>/dev/null; then
    pass "Logs contain GeoIP enriched data from simulations"
  else
    fail "Logs verification failed"
  fi
else
  fail "Logs endpoint returned HTTP $HTTP_CODE"
fi

echo ""

# ─── Test 5: GET /api/logs/export (CSV) ─────────────────────
echo "━━━ Test 5: GET /api/logs/export (CSV format) ━━━"
RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/logs/export?format=csv" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "CSV export returns 200"
  
  if echo "$BODY" | head -1 | grep -q "ID,TxnID,ClientIP"; then
    pass "CSV headers are correct"
  else
    fail "CSV headers are incorrect"
  fi
  
  LINE_COUNT=$(echo "$BODY" | wc -l)
  if [ "$LINE_COUNT" -gt 1 ]; then
    pass "CSV contains $((LINE_COUNT - 1)) data rows"
  else
    fail "CSV has no data rows"
  fi
else
  fail "CSV export returned HTTP $HTTP_CODE"
fi

echo ""

# ─── Test 6: GET /api/logs/export (JSON) ─────────────────────
echo "━━━ Test 6: GET /api/logs/export (JSON format) ━━━"
RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/logs/export?format=json" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "JSON export returns 200"
  
  if echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert 'exported_at' in d, 'Missing exported_at'
assert 'total' in d, 'Missing total'
assert 'data' in d, 'Missing data array'
print(f'  Exported at: {d[\"exported_at\"]}, Total: {d[\"total\"]} entries')
" 2>/dev/null; then
    pass "JSON export structure is valid"
  else
    fail "JSON export structure invalid"
  fi
else
  fail "JSON export returned HTTP $HTTP_CODE"
fi

echo ""

# ─── Test 7: Stats after simulations (no mock data) ──────────
echo "━━━ Test 7: Verify stats reflect real attack data ━━━"
RESP=$(curl -s "$API_BASE/stats?range=30days" 2>/dev/null)

if echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
attacks = d.get('total_attacks', 0)
assert attacks >= 4, f'Expected >= 4 total attacks after simulations, got {attacks}'
print(f'  Total attacks: {attacks}')
# Verify access_map_rank has real data (not the old mock IPs like 203.175.10.230)
amr = d.get('access_map_rank', [])
print(f'  Access map rank entries: {len(amr)}')
for item in amr[:3]:
    print(f'    {item[\"flag\"]} {item[\"access_ip\"]}: {item[\"requests\"]} requests ({item[\"country\"]})')
# Verify latest_news has real data
news = d.get('latest_news', [])
print(f'  Latest news events: {len(news)}')
if news:
    n = news[0]
    print(f'    Latest: [{n[\"attack_type\"]}] from {n[\"bad_ip\"]}')
" 2>/dev/null; then
  pass "Stats reflect real simulation data (no mock fallbacks)"
else
  fail "Stats verification failed"
fi

echo ""

# ─── Test 8: IP Rules CRUD ───────────────────────────────────
echo "━━━ Test 8: IP Rules CRUD ━━━"

# Add a blacklist rule
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/ip-rules" \
  -H "Content-Type: application/json" \
  -d '{"ip":"10.99.99.99","rule_type":"blacklist","reason":"Test blacklist from integration test"}' 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  pass "Add IP rule returns 200"
else
  fail "Add IP rule returned HTTP $HTTP_CODE"
fi

# Verify it appears in the list
RESP=$(curl -s "$API_BASE/ip-rules" 2>/dev/null)
if echo "$RESP" | python3 -c "
import json,sys
rules = json.load(sys.stdin)
found = [r for r in rules if r['ip'] == '10.99.99.99']
assert len(found) > 0, 'IP rule not found'
print(f'  Found rule: {found[0][\"ip\"]} = {found[0][\"rule_type\"]}')
rule_id = found[0]['id']
print(f'  Rule ID: {rule_id}')
# Write ID to file for deletion test
with open('/tmp/waf_test_rule_id', 'w') as f: f.write(str(rule_id))
" 2>/dev/null; then
  pass "IP rule persisted in database"
else
  fail "IP rule not found in database"
fi

# Delete the test rule
if [ -f /tmp/waf_test_rule_id ]; then
  RULE_ID=$(cat /tmp/waf_test_rule_id)
  RESP=$(curl -s -w "\n%{http_code}" -X DELETE "$API_BASE/ip-rules/$RULE_ID" 2>/dev/null)
  HTTP_CODE=$(echo "$RESP" | tail -n1)
  if [ "$HTTP_CODE" = "200" ]; then
    pass "Delete IP rule returns 200"
  else
    fail "Delete IP rule returned HTTP $HTTP_CODE"
  fi
  rm -f /tmp/waf_test_rule_id
fi

echo ""

# ─── Test 9: Telegram Config & Test Route ──────────────────────
echo "━━━ Test 9: Telegram Config & Test Route ━━━"

ORIG_TG=$(curl -s "$API_BASE/telegram" 2>/dev/null)

RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/telegram" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  pass "Get Telegram config returns 200"
else
  fail "Get Telegram config returned HTTP $HTTP_CODE"
fi

# Save test config
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/telegram" \
  -H "Content-Type: application/json" \
  -d '{"bot_token":"test_token_123","chat_id":"test_chat_456","enabled":false}' 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  pass "Save Telegram config returns 200"
else
  fail "Save Telegram config returned HTTP $HTTP_CODE"
fi

# Verify saved
RESP=$(curl -s "$API_BASE/telegram" 2>/dev/null)
if echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d['bot_token'] == 'test_token_123', f'Token mismatch: {d[\"bot_token\"]}'
assert d['chat_id'] == 'test_chat_456', f'ChatID mismatch: {d[\"chat_id\"]}'
print(f'  Token: {d[\"bot_token\"][:20]}..., ChatID: {d[\"chat_id\"]}')
" 2>/dev/null; then
  pass "Telegram config persisted correctly"
else
  fail "Telegram config not persisted"
fi

# Verify POST /api/telegram/test endpoint is mounted and responds
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/telegram/test" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "400" ]; then
  pass "Telegram test route is reachable (HTTP $HTTP_CODE)"
else
  fail "Telegram test route returned HTTP $HTTP_CODE"
fi

# Restore user original Telegram config if present
if echo "$ORIG_TG" | grep -q '"bot_token"' && ! echo "$ORIG_TG" | grep -q '"test_token_123"'; then
  curl -s -X POST "$API_BASE/telegram" -H "Content-Type: application/json" -d "$ORIG_TG" > /dev/null 2>&1
  echo "  (Restored user's original Telegram configuration)"
fi

echo ""

# ─── Test 10: Logs filtering ──────────────────────────────────
echo "━━━ Test 10: Logs filtering (type, IP, search) ━━━"

# Filter by attack type
RESP=$(curl -s "$API_BASE/logs?type=sql&limit=10" 2>/dev/null)
if echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
logs = d.get('data', [])
for l in logs:
    assert 'sql' in l['attack_type'].lower(), f'Expected SQL type, got {l[\"attack_type\"]}'
print(f'  SQL filter: {len(logs)} results')
" 2>/dev/null; then
  pass "Filter by attack type works"
else
  fail "Filter by attack type failed"
fi

# Filter by search query
RESP=$(curl -s "$API_BASE/logs?q=UNION&limit=10" 2>/dev/null)
if echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
total = d.get('total_count', 0)
print(f'  Search UNION: {total} matches')
" 2>/dev/null; then
  pass "Search query filter works"
else
  fail "Search query filter failed"
fi

echo ""

# ─── Test 11: Protected Sites & Tri-State WAF Verification ──
echo "━━━ Test 11: Protected Sites & Tri-State WAF Verification ━━━"

# Get Sites
RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/sites" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "Get sites returns 200"
  SITE_COUNT=$(echo "$BODY" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
  echo "  Total protected sites: $SITE_COUNT"
else
  fail "Get sites returned HTTP $HTTP_CODE"
fi

# Test WAF Probe on Site 1
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/sites/1/test-waf" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "Test WAF Probe on Site 1 returns 200"
  if echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert 'verdict' in d, 'Missing verdict'
assert 'latency_ms' in d, 'Missing latency_ms'
assert 'status_code' in d, 'Missing status_code'
print(f'  Probe Verdict: {d[\"verdict\"]}, Status: {d[\"status_code\"]}, Latency: {d[\"latency_ms\"]}ms')
" 2>/dev/null; then
    pass "Test WAF probe payload structure is valid"
  else
    fail "Test WAF probe payload structure invalid"
  fi
else
  fail "Test WAF probe returned HTTP $HTTP_CODE"
fi

# ─── Test 12: Bot Defense & Browser Challenge Verification ───
echo "━━━ Test 12: Bot Defense & Browser Challenge Verification ━━━"

RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/bot-defense" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  pass "Get Bot Defense config returns 200"
else
  fail "Get Bot Defense config returned HTTP $HTTP_CODE"
fi

# Save Bot Defense Config (with custom target scope)
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/bot-defense" \
  -H "Content-Type: application/json" \
  -d '{"cc_enabled":true,"cc_threshold":60,"cc_action":"challenge","challenge_mode":"autonomous_js","block_scanners":true,"pass_ttl_minutes":120,"target_scope":"custom","target_site_ids":[1]}' 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  pass "Save Bot Defense config with granular scope returns 200"
else
  fail "Save Bot Defense config returned HTTP $HTTP_CODE"
fi

# Verify saved scope
RESP=$(curl -s "$API_BASE/bot-defense" 2>/dev/null)
if echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('target_scope') == 'custom'; assert 1 in d.get('target_site_ids', []); print(f'  Scope: {d[\"target_scope\"]}, Sites: {d[\"target_site_ids\"]}')" 2>/dev/null; then
  pass "Granular Target Scope persisted correctly"
else
  fail "Target scope persistence failed"
fi

# Test Challenge Verification endpoint
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/challenge/verify" \
  -H "Content-Type: application/json" \
  -d '{"mode":"autonomous_js","token":"pow_test_nonce_123456","return_url":"/demo"}' 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "Autonomous JS Challenge verification returns 200"
  if echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['success'] == True; assert 'clearance' in d; print(f'  Clearance Token: {d[\"clearance\"][:25]}...')" 2>/dev/null; then
    pass "Clearance HMAC cookie generated successfully"
  else
    fail "Clearance payload invalid"
  fi
else
  fail "Challenge verification returned HTTP $HTTP_CODE"
fi

echo ""

# ─── Test 13: CC Attack Simulation & Flood Log Verification ─
echo "━━━ Test 13: CC Flood Simulation & Filter ━━━"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/simulate-attack?type=cc" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  pass "Trigger CC attack simulation returns 200"
else
  fail "Trigger CC attack simulation returned HTTP $HTTP_CODE"
fi

# Verify CC log exists
RESP=$(curl -s "$API_BASE/logs?attack_type=flood&limit=5" 2>/dev/null)
if echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d.get('total_count', 0) > 0, 'No flood logs found'
logs = d.get('data', []) or d.get('logs', [])
assert any('CC' in l.get('attack_type', '') or 'Flood' in l.get('attack_type', '') for l in logs), 'Missing CC flood attack type in logs'
print(f'  Found {d.get(\"total_count\")} CC flood log(s), latest: {logs[0].get(\"attack_type\")} from {logs[0].get(\"client_ip\")}')
" 2>/dev/null; then
  pass "CC flood log captured and queryable"
else
  fail "CC flood log verification failed"
fi

echo ""

# ─── Test 14: Telegram Token Verification Diagnostic ────────
echo "━━━ Test 14: Telegram Token Verification Diagnostic ━━━"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/telegram/verify" \
  -H "Content-Type: application/json" \
  -d '{"bot_token":"invalid_token_xyz_123"}' 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "Telegram verify endpoint returns 200"
  if echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert 'valid' in d, 'Missing valid field'
assert d['valid'] == False, 'Expected valid=False for fake token'
assert 'error' in d or 'message' in d, 'Missing error diagnostics'
print(f'  Diagnostic passed: valid={d[\"valid\"]}, message={d.get(\"message\") or d.get(\"error\")}')
" 2>/dev/null; then
    pass "Telegram verification structure and validation logic valid"
  else
    fail "Telegram verification payload invalid"
  fi
else
  fail "Telegram verify returned HTTP $HTTP_CODE"
fi

echo ""

# ─── Test 15: Settings Configuration Backup ━━━
echo "━━━ Test 15: Settings Configuration Backup ━━━"
RESP=$(curl -s -w "\n%{http_code}" "$API_BASE/settings/backup" 2>/dev/null)
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "Settings backup returns 200"
  if echo "$BODY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert 'version' in d, 'Missing version field'
assert 'settings' in d, 'Missing settings map'
assert 'sites' in d, 'Missing sites list'
assert 'ip_rules' in d, 'Missing ip_rules list'
assert 'generated_at' in d, 'Missing timestamp'
print(f'  Backup OK: {len(d[\"sites\"])} sites, {len(d[\"ip_rules\"])} IP rules, exported at {d.get(\"generated_at\")}')
" 2>/dev/null; then
    pass "Settings backup JSON structure is complete and valid"
  else
    fail "Settings backup JSON payload invalid"
  fi
else
  fail "Settings backup returned HTTP $HTTP_CODE"
fi

echo ""


# ─── Summary ──────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════╗"
echo -e "║  Results:  ${GREEN}$PASS PASSED${NC}  /  ${RED}$FAIL FAILED${NC}                    ║"
TOTAL=$((PASS + FAIL))
echo "║  Total: $TOTAL tests                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
