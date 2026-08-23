#!/usr/bin/env bash
# scripts/rollback.sh — Roll back a Cloud Run service to its previous revision
#
# Usage: bash scripts/rollback.sh [SERVICE_NAME] [REGION] [PROJECT_ID]
#
# Defaults match deploy.sh / deploy.yml conventions.
# Exits 0 on successful rollback, 1 if no previous revision exists.

set -euo pipefail

SERVICE_NAME="${1:-idea-holiday-marketplace}"
REGION="${2:-us-central1}"
PROJECT_ID="${3:-my-project-8591-489308}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

echo "🔄 Rolling back ${SERVICE_NAME} in ${PROJECT_ID}/${REGION}..."

# List the two most recent revisions (active first)
REVISIONS=$(gcloud run revisions list \
  --service="$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --sort-by="~creationTimestamp" \
  --limit=2 \
  --format="value(metadata.name)" 2>/dev/null) || {
  echo "❌ Failed to list revisions for ${SERVICE_NAME}"
  exit 1
}

CURRENT=$(echo "$REVISIONS" | head -n1)
PREVIOUS=$(echo "$REVISIONS" | tail -n1)

if [ -z "$PREVIOUS" ] || [ "$PREVIOUS" = "$CURRENT" ]; then
  echo "❌ No previous revision to roll back to. Only one revision exists: ${CURRENT:-none}"
  exit 1
fi

echo "  Current revision:  ${CURRENT}"
echo "  Rolling back to:   ${PREVIOUS}"

# Route 100% traffic to the previous revision
gcloud run services update-traffic "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --to-revisions="${PREVIOUS}=100" \
  --quiet || {
  echo "❌ Traffic shift failed"
  exit 1
}

echo "✅ Rolled back to ${PREVIOUS} — all traffic now routed there."

# Verify the rollback with a health check
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format="value(status.url)" 2>/dev/null) || SERVICE_URL=""

if [ -n "$SERVICE_URL" ]; then
  echo "  Verifying health at ${SERVICE_URL}/api/health ..."
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "${SERVICE_URL}/api/health" 2>/dev/null) || HEALTH_STATUS="000"

  if [ "$HEALTH_STATUS" = "200" ]; then
    echo "  ✅ Health check passed after rollback"
  else
    echo "  ⚠️  Health check returned ${HEALTH_STATUS} — manual verification needed"
  fi
fi

# Send Slack notification if webhook is configured
if [ -n "$SLACK_WEBHOOK" ]; then
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  curl -s -X POST "$SLACK_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"🔄 *ROLLBACK* — ${SERVICE_NAME} rolled back from \`${CURRENT}\` to \`${PREVIOUS}\` at ${TIMESTAMP}\"}" \
    >/dev/null 2>&1 || true
  echo "  📢 Slack notification sent"
fi
