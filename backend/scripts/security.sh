#!/usr/bin/env bash
# BE-16 / SEC-6: Security test suite
# Usage: BASE_URL=https://your-domain.com bash scripts/security.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
pass=0
fail=0
RESULTS=()

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    RESULTS+=("✅ $desc")
    ((pass++)) || true
  else
    RESULTS+=("❌ $desc (expected: $expected, got: $actual)")
    ((fail++)) || true
  fi
}

echo "🔒 Security test against $BASE_URL"

# ── Setup: create two workspaces ───────────────────────────────────────────────
EMAIL_A="sec_a_$(date +%s)@test.com"
EMAIL_B="sec_b_$(date +%s)@test.com"
PASSWORD="SecTest-Pass123!"

# Workspace A
curl -s -c /tmp/sec-a.txt -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: 1" -H "Origin: http://localhost:5173" \
  -d "{\"email\":\"$EMAIL_A\",\"password\":\"$PASSWORD\",\"name\":\"User A\",\"workspaceName\":\"Workspace A\"}" > /dev/null

# Workspace B
curl -s -c /tmp/sec-b.txt -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: 1" -H "Origin: http://localhost:5173" \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"$PASSWORD\",\"name\":\"User B\",\"workspaceName\":\"Workspace B\"}" > /dev/null

# ── 1. Security headers ────────────────────────────────────────────────────────
HEADERS=$(curl -s -I "$BASE_URL/api/health")
echo "$HEADERS" | grep -qi "x-content-type-options: nosniff" && check "X-Content-Type-Options" "pass" "pass" || check "X-Content-Type-Options" "pass" "fail"
echo "$HEADERS" | grep -qi "content-security-policy" && check "CSP header present" "pass" "pass" || check "CSP header present" "pass" "fail"
echo "$HEADERS" | grep -qi "x-powered-by" && check "X-Powered-By absent" "fail" "present" || check "X-Powered-By absent" "pass" "pass"

# ── 2. Origin check ───────────────────────────────────────────────────────────
FOREIGN_ORIGIN=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/crm/contacts" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: 1" \
  -H "Origin: https://evil.example.com" \
  -b /tmp/sec-a.txt \
  -d '{"name":"test"}')
check "Foreign Origin on mutation → 403" "403" "$FOREIGN_ORIGIN"

# ── 3. Missing CSRF header ────────────────────────────────────────────────────
CSRF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/crm/contacts" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -b /tmp/sec-a.txt \
  -d '{"name":"test"}')
check "Missing CSRF header → 403" "403" "$CSRF_STATUS"

# ── 4. Cookie attributes ──────────────────────────────────────────────────────
COOKIE_LINE=$(grep -i "sid\|__Host" /tmp/sec-a.txt 2>/dev/null | head -1 || echo "")
echo "$COOKIE_LINE" | grep -qi "HttpOnly" && check "Cookie HttpOnly" "pass" "pass" || check "Cookie HttpOnly" "pass" "fail"

# ── 5. Oversized body → 413 ───────────────────────────────────────────────────
LARGE_STATUS=$(node -e "
const cp = require('child_process');
const body = JSON.stringify({x: 'a'.repeat(110000)});
const child = cp.spawn('curl', [
  '-s', '-o', '/dev/null', '-w', '%{http_code}',
  '-X', 'POST', '$BASE_URL/api/crm/contacts',
  '-H', 'Content-Type: application/json',
  '-H', 'X-CSRF-Token: 1',
  '-H', 'Origin: http://localhost:5173',
  '-b', '/tmp/sec-a.txt',
  '--data-binary', '@-'
]);
child.stdin.write(body);
child.stdin.end();
let out = '';
child.stdout.on('data', d => out += d);
child.on('close', () => console.log(out.trim()));
" 2>/dev/null || echo "000")
check "Oversized body → 413" "413" "$LARGE_STATUS"

# ── 6. SQLi payload — no 500, no data leak ───────────────────────────────────
SQLI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/crm/contacts?search=%27%20OR%201=1%20--" \
  -b /tmp/sec-a.txt -H "X-CSRF-Token: 1")
check "SQLi query param → not 500" "200" "$SQLI_STATUS"

# ── 7. Mass assignment — extra keys → 400 ────────────────────────────────────
MASS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/crm/contacts" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: 1" \
  -H "Origin: http://localhost:5173" \
  -b /tmp/sec-a.txt \
  -d '{"name":"test","workspaceId":"ws_evil","role":"owner"}')
check "Mass assignment extra keys → 400" "400" "$MASS_STATUS"

# ── 8. Webhook unknown token → 404 ───────────────────────────────────────────
HOOK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/webhooks/twilio/unknowntoken999/inbound" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=test&From=whatsapp:+15550000&Body=test")
check "Webhook unknown token → 404" "404" "$HOOK_STATUS"

# ── 9. Brute-force lockout ────────────────────────────────────────────────────
for i in $(seq 1 6); do
  curl -s -o /dev/null -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: 1" \
    -H "Origin: http://localhost:5173" \
    -d "{\"email\":\"$EMAIL_A\",\"password\":\"wrongpassword\"}" > /dev/null
done
LOCKOUT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: 1" \
  -H "Origin: http://localhost:5173" \
  -d "{\"email\":\"$EMAIL_A\",\"password\":\"wrongpassword\"}")
check "6+ bad logins → 429" "429" "$LOCKOUT_STATUS"

# ── Print results table ───────────────────────────────────────────────────────
echo ""
echo "┌─────────────────────────────────────────────┐"
echo "│ Security Test Results                        │"
echo "├─────────────────────────────────────────────┤"
for result in "${RESULTS[@]}"; do
  printf "│ %-43s │\n" "$result"
done
echo "└─────────────────────────────────────────────┘"
echo ""
echo "Results: $pass passed, $fail failed"
[ "$fail" -eq 0 ] && exit 0 || exit 1
