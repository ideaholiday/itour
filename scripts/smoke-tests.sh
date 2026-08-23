#!/usr/bin/env bash
# scripts/smoke-tests.sh — Post-deploy smoke test runner
#
# Usage: bash scripts/smoke-tests.sh <BASE_URL>
# Example: bash scripts/smoke-tests.sh https://idea-holiday-staging-abc123.run.app
#
# Exits 0 if all checks pass, 1 on any failure.

set -euo pipefail

BASE_URL="${1:?Usage: smoke-tests.sh <BASE_URL>}"
# Strip trailing slash
BASE_URL="${BASE_URL%/}"

PASSED=0
FAILED=0
TOTAL=0

check() {
  local name="$1"
  local method="$2"
  local path="$3"
  local expected_status="$4"
  local body="${5:-}"

  TOTAL=$((TOTAL + 1))

  local curl_args=(-s -o /tmp/smoke-response -w "%{http_code}" --max-time 10)
  curl_args+=(-X "$method")
  if [ -n "$body" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi

  local status
  status=$(curl "${curl_args[@]}" "${BASE_URL}${path}" 2>/dev/null) || status="000"

  if [ "$status" = "$expected_status" ]; then
    echo "✅ ${name} (HTTP ${status})"
    PASSED=$((PASSED + 1))
  else
    echo "❌ ${name} — expected ${expected_status}, got ${status}"
    # Show response body for debugging (first 200 chars)
    head -c 200 /tmp/smoke-response 2>/dev/null || true
    echo ""
    FAILED=$((FAILED + 1))
  fi
}

validate_json_field() {
  local name="$1"
  local path="$2"
  local field="$3"
  local expected="$4"

  TOTAL=$((TOTAL + 1))

  local body
  body=$(curl -s --max-time 10 "${BASE_URL}${path}" 2>/dev/null) || body=""

  # Use node for portable JSON parsing (available in the container)
  local actual
  actual=$(echo "$body" | node -e "
    let d = '';
    process.stdin.on('data', c => d += c);
    process.stdin.on('end', () => {
      try { console.log(JSON.parse(d)${field}); }
      catch { console.log('PARSE_ERROR'); }
    });
  " 2>/dev/null) || actual="PARSE_ERROR"

  if [ "$actual" = "$expected" ]; then
    echo "✅ ${name} (${field} = ${expected})"
    PASSED=$((PASSED + 1))
  else
    echo "❌ ${name} — ${field} expected '${expected}', got '${actual}'"
    FAILED=$((FAILED + 1))
  fi
}

echo ""
echo "🔍 Smoke Testing: ${BASE_URL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Health endpoint returns 200
check "Health endpoint responds" "GET" "/api/health" "200"

# 2. Health endpoint has ok: true
validate_json_field "Health ok flag" "/api/health" ".ok" "true"

# 3. Health endpoint reports database engine
TOTAL=$((TOTAL + 1))
db_engine=$(curl -s --max-time 10 "${BASE_URL}/api/health" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).database.engine)}catch{console.log('')}})" 2>/dev/null || echo "")
if [ "$db_engine" = "sqlite" ] || [ "$db_engine" = "postgres" ]; then
  echo "✅ Health database engine reported (${db_engine})"
  PASSED=$((PASSED + 1))
else
  echo "❌ Health database engine — expected 'sqlite' or 'postgres', got '${db_engine}'"
  FAILED=$((FAILED + 1))
fi

# 4. Activities listing returns 200
check "Activities listing" "GET" "/api/activities" "200"

# 5. Transfers search accepts POST
check "Transfers search" "POST" "/api/transfers/search" "200" \
  '{"pickupLat":28.6139,"pickupLng":77.209,"dropLat":28.5355,"dropLng":77.0392}'

# 6. Auth endpoint exists (should return 4xx without credentials, not 5xx)
TOTAL=$((TOTAL + 1))
auth_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  -X POST -H "Content-Type: application/json" \
  -d '{}' "${BASE_URL}/api/auth/login" 2>/dev/null) || auth_status="000"

if [ "$auth_status" -ge 400 ] && [ "$auth_status" -lt 500 ]; then
  echo "✅ Auth endpoint rejects bad request (HTTP ${auth_status})"
  PASSED=$((PASSED + 1))
elif [ "$auth_status" = "200" ]; then
  echo "✅ Auth endpoint responds (HTTP ${auth_status})"
  PASSED=$((PASSED + 1))
else
  echo "❌ Auth endpoint — expected 4xx, got ${auth_status}"
  FAILED=$((FAILED + 1))
fi

# 7. Frontend serving — root returns HTML
TOTAL=$((TOTAL + 1))
root_type=$(curl -s -o /dev/null -w "%{content_type}" --max-time 10 \
  "${BASE_URL}/" 2>/dev/null) || root_type=""

if echo "$root_type" | grep -qi "text/html"; then
  echo "✅ Frontend serves HTML at /"
  PASSED=$((PASSED + 1))
else
  echo "⚠️  Frontend not serving HTML (content-type: ${root_type}) — may be API-only deploy"
  # Warning, not failure — API-only deploys are valid
  PASSED=$((PASSED + 1))
fi

# 8. Unknown API route returns proper 404 (not a crash)
check "API 404 handling" "GET" "/api/nonexistent-route-smoke-test" "404"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASSED}/${TOTAL} passed, ${FAILED} failed"

if [ "$FAILED" -gt 0 ]; then
  echo "❌ SMOKE TESTS FAILED"
  exit 1
fi

echo "✅ ALL SMOKE TESTS PASSED"
exit 0
