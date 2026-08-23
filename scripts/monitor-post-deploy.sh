#!/usr/bin/env bash
# scripts/monitor-post-deploy.sh — Post-deploy health watcher
#
# Polls /api/health for a configurable duration after a deployment.
# Triggers automatic rollback if any health check fails.
#
# Usage: bash scripts/monitor-post-deploy.sh <SERVICE_URL> [DURATION_SECONDS] [INTERVAL_SECONDS]
# Example: bash scripts/monitor-post-deploy.sh https://idea-holiday-marketplace-abc.run.app 180 30
#
# Exits 0 if healthy throughout, 1 if rollback was triggered.

set -euo pipefail

SERVICE_URL="${1:?Usage: monitor-post-deploy.sh <SERVICE_URL> [DURATION] [INTERVAL]}"
SERVICE_URL="${SERVICE_URL%/}"
DURATION="${2:-180}"   # 3 minutes default
INTERVAL="${3:-30}"    # 30 seconds default

SERVICE_NAME="${SERVICE_NAME:-idea-holiday-marketplace}"
REGION="${REGION:-us-central1}"
PROJECT_ID="${PROJECT_ID:-my-project-8591-489308}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "🔍 Post-Deploy Health Monitor"
echo "  URL:      ${SERVICE_URL}"
echo "  Duration: ${DURATION}s"
echo "  Interval: ${INTERVAL}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

START_TIME=$(date +%s)
CHECK_COUNT=0
FAIL_COUNT=0

while true; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))

  if [ "$ELAPSED" -ge "$DURATION" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Monitoring complete — ${CHECK_COUNT} checks passed over ${ELAPSED}s"
    exit 0
  fi

  CHECK_COUNT=$((CHECK_COUNT + 1))
  TIMESTAMP=$(date -u +"%H:%M:%S")

  # Check health endpoint
  HTTP_STATUS=$(curl -s -o /tmp/monitor-health-response -w "%{http_code}" \
    --max-time 10 "${SERVICE_URL}/api/health" 2>/dev/null) || HTTP_STATUS="000"

  if [ "$HTTP_STATUS" = "200" ]; then
    # Verify the JSON response has ok: true
    OK_VALUE=$(cat /tmp/monitor-health-response 2>/dev/null | \
      node -e "
        let d = '';
        process.stdin.on('data', c => d += c);
        process.stdin.on('end', () => {
          try { console.log(JSON.parse(d).ok); }
          catch { console.log('false'); }
        });
      " 2>/dev/null) || OK_VALUE="false"

    if [ "$OK_VALUE" = "true" ]; then
      echo "  [${TIMESTAMP}] Check #${CHECK_COUNT}: ✅ healthy (HTTP 200, ok=true)"
    else
      echo "  [${TIMESTAMP}] Check #${CHECK_COUNT}: ❌ unhealthy (HTTP 200 but ok!=true)"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  else
    echo "  [${TIMESTAMP}] Check #${CHECK_COUNT}: ❌ unhealthy (HTTP ${HTTP_STATUS})"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  # Trigger rollback on first failure
  if [ "$FAIL_COUNT" -gt 0 ]; then
    echo ""
    echo "❌ Health check failed — initiating automatic rollback..."
    if [ -x "${SCRIPT_DIR}/rollback.sh" ]; then
      bash "${SCRIPT_DIR}/rollback.sh" "$SERVICE_NAME" "$REGION" "$PROJECT_ID"
    else
      echo "⚠️  rollback.sh not found at ${SCRIPT_DIR}/rollback.sh — manual rollback needed"
    fi
    exit 1
  fi

  sleep "$INTERVAL"
done
