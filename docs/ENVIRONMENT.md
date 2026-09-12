# Environment Configuration: Idea Holiday

## Overview & Guidelines
Idea Holiday utilizes environment-specific `.env` files locally and Google Secret Manager for cloud deployments.
- **NEVER** store real production credentials, tokens, or private keys inside Markdown documentation or git repositories.
- Use placeholders (e.g., `<configured separately>`) in all documentation.
- Reference `.env.example` at the repository root for the full master template.

---

## 1. Environment Tiers

| Environment | Purpose | Database Engine | Payment Gateways |
| :--- | :--- | :--- | :--- |
| **Development** | Local coding, rapid prototyping | SQLite (`better-sqlite3` with WAL mode) | Demo Payment (`ENABLE_DEMO_PAYMENT=true`) / Sandbox |
| **Staging** | Automated CI verification & pre-release | Supabase Postgres (Staging Project) | Sandbox (Cashfree & Razorpay Test Keys) |
| **Production** | Live marketplace on Google Cloud Run | Supabase Postgres (Production PostGIS) | Live Merchant Production Credentials |

---

## 2. Core Server & Database Variables

| Variable | Required? | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `development` / `production` | Node runtime mode. |
| `PORT` | Optional | `4000` | Backend listening port. |
| `DATABASE_ENGINE` | Optional | `sqlite` / `postgres` | Selects SQLite vs Supabase PostgreSQL. |
| `DATABASE_URL` | If Postgres | `postgresql://user:pass@host:5432/db` | Connection string for PostgreSQL. |
| `POSTGRES_SCHEMA` | Optional | `marketplace` | Target database schema in Postgres. |
| `SQLITE_DB_PATH` | If SQLite | `./wanderindia.db` | File path for SQLite database. |
| `SQLITE_JOURNAL_MODE` | Optional | `WAL` | SQLite journal mode (`WAL`, `DELETE`). |
| `JWT_SECRET` | Yes | `<long-random-string>` | Signing key for Idea Holiday session JWTs. |
| `PUBLIC_APP_URL` | Yes | `https://ideaholiday.in` | Base URL used for generated voucher links. |
| `DOCUMENT_LINK_SECRET`| Yes | `<random-secret>` | Key for signing guest voucher/invoice links. |

---

## 3. Third-Party Integration Variables

### 3.1 WhatsApp Cloud API (Meta)
| Variable | Required? | Example Placeholder | Purpose |
| :--- | :--- | :--- | :--- |
| `WHATSAPP_CLOUD_API_ENABLED` | Yes | `true` | Enables WhatsApp outbound messaging. |
| `WHATSAPP_APP_ID` | Yes | `1488217219329539` | Meta Application ID. |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | `1091999820653021` | Meta Phone Number ID. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID`| Yes | `794585599913804` | Meta WABA ID. |
| `WHATSAPP_ACCESS_TOKEN` | Yes | `<meta-system-user-token>` | Bearer access token for Graph API. |
| `WHATSAPP_API_VERSION` | Optional | `v22.0` | Meta Graph API version. |
| `WHATSAPP_APP_SECRET` | Optional | `<meta-app-secret>` | Webhook signature verification. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`| Optional | `<meta-verify-token>` | Webhook registration handshake. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Optional | `en_US` | Default template locale. |

### 3.2 Payment Gateways
| Variable | Required? | Example Placeholder | Purpose |
| :--- | :--- | :--- | :--- |
| `ENABLE_DEMO_PAYMENT` | Dev Only | `true` / `false` | Enables instant test payment bypass. |
| `CASHFREE_APP_ID` | For Cashfree| `<cashfree-app-id>` | Cashfree Merchant Application ID. |
| `CASHFREE_SECRET_KEY` | For Cashfree| `<cashfree-secret-key>` | Cashfree Merchant API Secret. |
| `CASHFREE_ENVIRONMENT` | For Cashfree| `SANDBOX` / `PRODUCTION` | Cashfree API environment. |
| `RAZORPAY_KEY_ID` | For Razorpay| `<razorpay-key-id>` | Razorpay Public Key. |
| `RAZORPAY_KEY_SECRET` | For Razorpay| `<razorpay-secret-key>` | Razorpay Secret Key. |

### 3.3 Transactional Email (SES / Brevo)
| Variable | Required? | Example Placeholder | Purpose |
| :--- | :--- | :--- | :--- |
| `EMAIL_NOTIFICATIONS_ENABLED` | Yes | `true` | Enables outbound transactional email. |
| `EMAIL_PROVIDER` | Yes | `SES` / `BREVO` | Selects email dispatch provider. |
| `SES_REGION` | If SES | `ap-south-1` | AWS Region for Amazon SES. |
| `SES_FROM_EMAIL` | If SES | `no-reply@ideaholiday.in` | Verified SES sender address. |
| `BREVO_API_KEY` | If Brevo | `<brevo-api-key>` | API key for Brevo SMTP/REST API. |
| `BREVO_SENDER_EMAIL` | If Brevo | `no-reply@ideaholiday.in` | Sender address for Brevo. |

### 3.4 Geocoding & Supabase
| Variable | Required? | Example Placeholder | Purpose |
| :--- | :--- | :--- | :--- |
| `MAPPLS_API_KEY` | Optional | `<mappls-api-key>` | Mappls MapmyIndia search key. |
| `SUPABASE_URL` | Optional | `https://<id>.supabase.co` | Supabase Cloud project URL. |
| `SUPABASE_ANON_KEY` | Optional | `<supabase-anon-key>` | Supabase anonymous public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | `<supabase-service-key>`| Supabase backend service role key. |

---

## 4. Observability & Monitoring
| Variable | Required? | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `METRICS_TOKEN` | Optional | `<random-string>` | Bearer token for scraping `/api/metrics`. |
| `LOG_LEVEL` | Optional | `info` / `debug` / `warn` | Winston logging verbosity level. |
| `LOG_REQUEST_BODY` | Optional | `false` | Enables full request logging for debugging. |
| `SLOW_REQUEST_MS` | Optional | `1000` | Threshold in ms to log slow requests. |
