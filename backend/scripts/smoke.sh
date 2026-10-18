#!/usr/bin/env bash
# BE-16: Smoke test — core flow verification
# Usage: BASE_URL=http://localhost:3000 bash scripts/smoke.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="smoke_$(date +%s)@test.com"
PASSWORD="Smoke-Test-Pass123!"

pass=0
fail=0

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "✅ $desc"
    ((pass++)) || true
  else
    echo "❌ $desc (expected: $expected, got: $actual)"
    ((fail++)) || true
  fi
}

echo "🧪 Smoke test against $BASE_URL"

# Health check
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health")
check "Health check" "200" "$STATUS"

# Signup
SIGNUP=$(curl -s -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: 1" \
  -H "Origin: http://localhost:5173" \
  -c /tmp/smoke-cookies.txt \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke User\",\"workspaceName\":\"Smoke WS\"}")
SIGNUP_STATUS=$(echo "$SIGNUP" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{const d=JSON.parse(b);console.log(d.userId?'ok':'fail')}catch{console.log('fail')}})")
check "Signup creates user" "ok" "$SIGNUP_STATUS"

# /api/me
ME_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/me" \
  -b /tmp/smoke-cookies.txt \
  -H "X-CSRF-Token: 1")
check "GET /api/me returns 200" "200" "$ME_STATUS"

# Create lead manually
LEAD=$(curl -s -X POST "$BASE_URL/api/leads" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: 1" \
  -H "Origin: http://localhost:5173" \
  -b /tmp/smoke-cookies.txt \
  -d '{"contactId":"","source":"manual"}' 2>/dev/null || echo '{}')

# Cross-workspace 404 (use a fake workspace id)
CROSS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/leads/lead_nonexistent" \
  -b /tmp/smoke-cookies.txt)
check "Non-existent lead returns 404" "404" "$CROSS"

# Audit log PATCH returns 405
PATCH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PATCH "$BASE_URL/api/audit/some-id" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: 1" \
  -H "Origin: http://localhost:5173" \
  -b /tmp/smoke-cookies.txt \
  -d '{}')
check "PATCH /api/audit returns 405" "405" "$PATCH_STATUS"

# Forged Twilio webhook (no signature)
FORGED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/webhooks/twilio/badtoken123/inbound" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM123&From=whatsapp:+15550001234&Body=Hello")
check "Forged Twilio webhook returns 404" "404" "$FORGED_STATUS"

# Oversized body
LARGE_STATUS=$(node -e "process.stdout.write(JSON.stringify({x:'a'.repeat(110000)}))" | curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/crm/contacts" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: 1" \
  -H "Origin: http://localhost:5173" \
  -b /tmp/smoke-cookies.txt \
  --data-binary @-)
check "101 kB body returns 413" "413" "$LARGE_STATUS"

# Logout
LOGOUT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/auth/logout" \
  -H "X-CSRF-Token: 1" \
  -H "Origin: http://localhost:5173" \
  -b /tmp/smoke-cookies.txt)
check "Logout returns 200" "200" "$LOGOUT_STATUS"

# Unauthenticated access after logout
UNAUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/leads" \
  -b /tmp/smoke-cookies.txt)
check "Unauthenticated access returns 401" "401" "$UNAUTH_STATUS"

echo ""
echo "Results: $pass passed, $fail failed"
[ "$fail" -eq 0 ] && exit 0 || exit 1
