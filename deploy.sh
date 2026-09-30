#!/usr/bin/env bash

set -e

PROJECT_ID="my-project-8591-489308"
REGION="asia-northeast1"
SERVICE_NAME="idea-holiday-marketplace"
# Live Cashfree credentials come only from Secret Manager, never from a local
# backend/.env (which holds sandbox keys for development).
DEPLOY_SECRETS="JWT_SECRET=idea-holiday-jwt-secret:latest,OTP_SECRET=idea-holiday-otp-secret:latest,MAPPLS_API_KEY=idea-holiday-mappls-api-key:latest,DATABASE_URL=idea-holiday-database-url:latest,ASSIGNMENT_SCHEDULER_TOKEN=idea-holiday-assignment-scheduler-token:latest,CASHFREE_APP_ID=idea-holiday-cashfree-app-id:latest,CASHFREE_SECRET_KEY=idea-holiday-cashfree-secret-key:latest,CASHFREE_SECUREID_PUBLIC_KEY=idea-holiday-cashfree-secureid-public-key:latest,WHATSAPP_APP_SECRET=idea-holiday-whatsapp-app-secret:latest,WHATSAPP_WEBHOOK_VERIFY_TOKEN=idea-holiday-whatsapp-webhook-verify-token:latest,OLA_MAPS_CLIENT_ID=idea-holiday-ola-maps-client-id:latest,OLA_MAPS_CLIENT_SECRET=idea-holiday-ola-maps-client-secret:latest,SUPABASE_SERVICE_ROLE_KEY=idea-holiday-supabase-service-role-key:latest"

if [ -f "backend/.env" ]; then
  source backend/.env
fi

SUPABASE_URL="${SUPABASE_URL:-https://jidknptoyloucgldaool.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-sb_publishable_WwdMLSfWZE8fErjAKcs6UQ_tIBSHZcA}"
MAPPLS_API_KEY="${MAPPLS_API_KEY:-${MAPMYINDIA_API_KEY:-}}"
MAPPLS_ORIGIN="${MAPPLS_ORIGIN:-https://ideaholiday.in}"
# Production takes real payments. backend/.env sets CASHFREE_ENV=TEST for local
# work, so it is deliberately not read here; override with DEPLOY_CASHFREE_ENV.
CASHFREE_ENV="${DEPLOY_CASHFREE_ENV:-PROD}"
CASHFREE_API_VERSION="${CASHFREE_API_VERSION:-2023-08-01}"
DEMO_PAYMENT_ONLY="${DEMO_PAYMENT_ONLY:-false}"
ENABLE_DEMO_PAYMENT="${ENABLE_DEMO_PAYMENT:-true}"

# Push to the Android apps signs in as this service's own account (no key; ADR 053).
DEPLOY_ENV_VARS="NODE_ENV=production,FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-ideaholiday-todothing},ETA_PROVIDER=ola,SUPABASE_URL=${SUPABASE_URL},SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY},CASHFREE_ENV=${CASHFREE_ENV},CASHFREE_API_VERSION=${CASHFREE_API_VERSION},DEMO_PAYMENT_ONLY=${DEMO_PAYMENT_ONLY},ENABLE_DEMO_PAYMENT=${ENABLE_DEMO_PAYMENT},DATABASE_ENGINE=postgres,POSTGRES_SCHEMA=marketplace,MEDIA_STORAGE=supabase"

# Android App Links (public certificate fingerprints, not secrets): Play's certificates
# (classic, deployment, hybrid; from Play Console's certificate downloads), then the upload key; `;` between them. Fixed on purpose: a stale value
# exported in the terminal once replaced these and broke App Links.
ANDROID_DRIVER_APP_SHA256="88:3E:1D:D1:70:91:FA:2E:CE:28:24:11:9F:39:24:38:24:C5:8B:D5:69:13:2C:F8:E5:3D:50:05:00:18:18:F3;B0:72:41:89:67:84:39:CA:32:0A:6F:3E:08:B7:30:61:45:31:15:39:EE:EA:02:BD:F9:C3:D2:C2:54:79:5D:34;FA:06:D6:06:34:97:EB:3E:72:5E:28:49:EF:57:A8:1D:55:D5:FE:88:AD:1F:83:BB:02:A9:69:4A:B7:FB:75:0D;CC:F8:2F:9F:63:F5:D4:12:39:83:23:43:9E:F5:59:4A:05:C0:FA:81:71:F3:92:14:48:A0:6A:AC:32:CC:9E:71"
ANDROID_TRAVELER_APP_SHA256="DA:87:46:F9:EA:54:9C:7C:D0:48:69:BE:A0:C0:8A:66:D5:4F:C6:C7:CB:BF:7E:FE:19:E8:0B:52:F5:BA:74:50;24:99:76:A3:CA:F0:32:AA:26:21:A3:82:50:EE:16:BF:22:A9:CA:B2:87:DD:8D:AB:5D:0A:E6:CB:46:D1:AC:E3"
ANDROID_SUPPLIER_APP_SHA256="35:2E:5E:40:0D:67:2D:CA:3C:AA:2F:A2:50:24:5E:63:9A:4E:86:A4:80:81:1E:AA:F9:D7:76:37:DC:FE:2D:E9;64:B0:37:AA:BA:EB:E1:50:BE:2F:52:94:77:6C:55:F3:90:0F:0C:91:F3:04:44:B6:F7:A0:65:D6:B9:0B:73:5C"

# Keep the production runtime aligned with locally configured transactional
# notification providers. Long-lived credentials should be moved to Secret
# Manager when they are rotated; this preserves the existing deployment flow.
for key in \
  CASHFREE_SECUREID_CLIENT_ID CASHFREE_SECUREID_CLIENT_SECRET CASHFREE_SECUREID_ENV \
  CASHFREE_SECUREID_API_VERSION CASHFREE_SECUREID_PUBLIC_KEY_PATH CASHFREE_SECUREID_MERCHANT_ID \
  CASHFREE_SECUREID_ACCOUNT_ID CASHFREE_SECUREID_PROXY_URL CASHFREE_SECUREID_SIMULATION_FALLBACK \
  WHATSAPP_CLOUD_API_ENABLED WHATSAPP_API_VERSION WHATSAPP_BASE_URL \
  WHATSAPP_PHONE_NUMBER_ID WHATSAPP_BUSINESS_ACCOUNT_ID WHATSAPP_ACCESS_TOKEN \
  WHATSAPP_DEFAULT_COUNTRY_CODE WHATSAPP_SENDER_PHONE WHATSAPP_TIMEOUT \
  WHATSAPP_TEMPLATE_LANGUAGE \
  WHATSAPP_TEMPLATE_BOOKING_CONFIRMED WHATSAPP_TEMPLATE_BOOKING_DOCUMENTS \
  WHATSAPP_TEMPLATE_SUPPLIER_ASSIGNMENT WHATSAPP_TEMPLATE_SUPPLIER_ACCEPTED \
  WHATSAPP_TEMPLATE_DRIVER_ASSIGNED WHATSAPP_TEMPLATE_DRIVER_TRIP \
  WHATSAPP_TEMPLATE_SUPPLIER_STATUS WHATSAPP_TEMPLATE_OPS_ALERT \
  WHATSAPP_TEMPLATE_TRIP_STATUS WHATSAPP_TEMPLATE_REFUND_STATUS \
  WHATSAPP_TEMPLATE_PAYOUT_STATUS WHATSAPP_TEMPLATE_SUPPORT_CASE \
  WHATSAPP_TEMPLATE_PRODUCT_PUBLISHED WHATSAPP_TEMPLATE_TRIP_REMINDER \
  WHATSAPP_TEMPLATE_REVIEW_REQUEST WHATSAPP_TEMPLATE_CIRCUIT_RESCHEDULE \
  WHATSAPP_TEMPLATE_DISPATCH_DRIVER_REQUEST WHATSAPP_TEMPLATE_DISPATCH_DRIVER_TRIP \
  WHATSAPP_TEMPLATE_DISPATCH_DRIVER_CANCELLED WHATSAPP_TEMPLATE_DISPATCH_TRAVELER_DRIVER \
  WHATSAPP_TEMPLATE_DISPATCH_TRAVELER_PENDING WHATSAPP_TEMPLATE_DISPATCH_TRIP_STATUS \
  WHATSAPP_TEMPLATE_DISPATCH_OPS_ALERT PUBLIC_APP_URL DOCUMENT_LINK_SECRET \
  EMAIL_NOTIFICATIONS_ENABLED EMAIL_PROVIDER BREVO_API_KEY BREVO_SENDER_NAME \
  BREVO_SENDER_EMAIL EMAIL_FROM SES_REGION SES_FROM_EMAIL \
  BREVO_NEWSLETTER_LIST_ID NEWSLETTER_UNSUBSCRIBE_SECRET \
  ANDROID_DRIVER_APP_SHA256 ANDROID_TRAVELER_APP_SHA256 ANDROID_SUPPLIER_APP_SHA256; do
  value="${!key:-}"
  if [ -n "$value" ]; then
    DEPLOY_ENV_VARS="${DEPLOY_ENV_VARS},${key}=${value}"
  fi
done

# Mappls is the legacy provider, used only with PLACES_PROVIDER=mappls or ETA_PROVIDER=mappls.
if [ -n "$MAPPLS_API_KEY" ]; then
  DEPLOY_ENV_VARS="${DEPLOY_ENV_VARS},MAPPLS_ORIGIN=${MAPPLS_ORIGIN}"
fi

echo "🚀 Deploying $SERVICE_NAME to Cloud Run ($PROJECT_ID / $REGION)..."

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --port 8080 \
  --allow-unauthenticated \
  --execution-environment gen2 \
  --max-instances 10 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --set-env-vars "$DEPLOY_ENV_VARS" \
  --set-secrets "$DEPLOY_SECRETS" \
  --quiet

gcloud run services update-traffic "$SERVICE_NAME" \
  --to-latest \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --quiet

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format="value(status.url)")

echo "✅ Deployed successfully! Live URL: $SERVICE_URL"
