# Environment Configuration: Idea Holiday

> **Summary:** Every environment variable, by tier, with placeholders only.
> **Read when:** a feature needs configuration or a secret. Never put real values in docs.

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
| `ALLOW_DESTRUCTIVE_SEED` | Dev only | `true` | Required by `src/seed.js`; it refuses to wipe and reseed without it. |
| `ALLOW_DEMO_REVIEWS` | Dev only | `true` | Generates 20 demo reviews per published product, each marked `source = 'SEED'`. Hard-fails when `NODE_ENV=production` — production ratings only ever come from verified travelers. |

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

#### 3.1.1 Driver Dispatch Templates
Dispatch messages use their own template names, so existing approved templates keep their variable counts. Each body below is submitted to Meta **exactly as written** as a **Utility** template under the name shown, then the approved name is set in the variable. The wording follows this account's approved templates (fixed opening, `Label: value.`); shorter `Hello {{1}}` styles were rejected as `INVALID_FORMAT` or `INCORRECT_CATEGORY`. A free-text `Update: {{n}}` variable was also rejected as `INCORRECT_CATEGORY`, and new driver-detail templates kept being rejected, so the driver trip and traveler driver-details messages reuse the account's approved `idea_holiday_driver_trip` and `idea_holiday_driver_details` with their approved variables.

- Values are sent as single-line text: line breaks and tabs become ` · `, and empty values become `-`, as Meta requires.
- If a variable is empty, the message is sent as free text instead and a warning is logged once. **Meta only delivers free text to people who messaged your number in the last 24 hours**, so drivers and travelers usually will not receive it. Set all seven variables in production.
- The bodies are defined in `DISPATCH_WHATSAPP_TEMPLATES` in `backend/src/services/dispatchNotificationService.js`; a test checks that each body's variables match its value list.

#### `WHATSAPP_TEMPLATE_DISPATCH_DRIVER_REQUEST` = `idea_holiday_dispatch_driver_request`
**For:** Driver — New trip request; driver must accept or decline. **Category:** Utility. **Language:** en_US.

```text
Idea Holiday has sent you a trip request for booking {{1}}. Service: {{2}}. Scheduled pickup: {{3}}. Pickup location: {{4}}. Passengers: {{5}}. Assigned vehicle: {{6}}. Please accept or decline before {{7}} using your private trip page: {{8}}. Traveler contact details are shared after you accept.
```

{{1}} Booking ref · {{2}} Tour · {{3}} Pickup date and time · {{4}} Pickup location · {{5}} Passengers · {{6}} Vehicle and plate · {{7}} Respond by · {{8}} Private trip link

#### `WHATSAPP_TEMPLATE_DISPATCH_DRIVER_TRIP` = `idea_holiday_driver_trip`
**For:** Driver — Trip confirmed, 24-hour reminder and 2-hour pickup reminder (the trip link is in the driver request and email). **Category:** Utility. **Language:** en_US. **Reuses an already approved template.**

```text
You have been assigned an Idea Holiday trip. Booking reference: {{1}}. Traveler name: {{2}}. Traveler phone: {{3}}. Scheduled pickup: {{4}}. Pickup location: {{5}}. Drop location: {{6}}. Assigned vehicle registration: {{7}}. Confirm the traveler identity and follow the dispatch instructions in your portal.
```

{{1}} Booking ref · {{2}} Traveler name · {{3}} Traveler phone · {{4}} Pickup date and time · {{5}} Pickup location · {{6}} Drop location · {{7}} Vehicle registration

#### `WHATSAPP_TEMPLATE_DISPATCH_DRIVER_CANCELLED` = `idea_holiday_dispatch_driver_cancelled`
**For:** Driver — Driver removed from a trip. **Category:** Utility. **Language:** en_US.

```text
Your assignment for Idea Holiday booking {{1}} scheduled for {{2}} has been cancelled. Reason: {{3}}. Please do not operate this trip or use the previous trip link, and contact your supplier with any questions.
```

{{1}} Booking ref · {{2}} Pickup date and time · {{3}} Reason

#### `WHATSAPP_TEMPLATE_DISPATCH_TRAVELER_DRIVER` = `idea_holiday_driver_details`
**For:** Traveler — Driver confirmed and 24-hour reminder with driver details. **Category:** Utility. **Language:** en_US. **Reuses an already approved template.**

```text
Idea Holiday has updated the transport service details for your existing booking {{1}}. Your assigned driver is {{2}} and can be contacted at {{3}}. The confirmed vehicle is a {{4}} with registration {{5}}. The scheduled pickup time is {{6}} from {{7}}. View the booking voucher at {{8}}. This message only confirms details already associated with your booking.
```

{{1}} Booking ref · {{2}} Driver name · {{3}} Driver phone · {{4}} Vehicle model · {{5}} Vehicle registration · {{6}} Pickup date and time · {{7}} Pickup location · {{8}} Voucher link

#### `WHATSAPP_TEMPLATE_DISPATCH_TRAVELER_PENDING` = `idea_holiday_dispatch_traveler_pending`
**For:** Traveler — 24-hour reminder while the driver is not yet confirmed. **Category:** Utility. **Language:** en_US.

```text
This is a reminder for your existing Idea Holiday booking {{1}}. Service: {{2}}. Scheduled pickup: {{3}} from {{4}}. Driver confirmation is still in progress and our operations team is following up. Driver and vehicle details will be sent as soon as they are confirmed.
```

{{1}} Booking ref · {{2}} Tour · {{3}} Pickup date and time · {{4}} Pickup location

#### `WHATSAPP_TEMPLATE_DISPATCH_TRIP_STATUS` = `idea_holiday_dispatch_trip_status`
**For:** Traveler, Supplier — Driver on the way, arrived, trip started, completed; driver confirmed (supplier). **Category:** Utility. **Language:** en_US.

```text
There is a service update for your Idea Holiday booking {{1}}. Service: {{2}}. Current status: {{3}}. Additional information: {{4}}. Contact support@ideaholiday.in if you need help with this booking.
```

{{1}} Booking ref · {{2}} Tour · {{3}} Status · {{4}} Detail

#### `WHATSAPP_TEMPLATE_DISPATCH_OPS_ALERT` = `idea_holiday_dispatch_ops_alert`
**For:** Supplier, Operations — Driver must be assigned manually. **Category:** Utility. **Language:** en_US.

```text
Idea Holiday booking {{1}} needs a driver assignment. Service: {{2}}. Scheduled pickup: {{3}}. Pickup location: {{4}}. Reason: {{5}}. Assign a driver using this link: {{6}}. The traveler is updated automatically after a driver accepts.
```

{{1}} Booking ref · {{2}} Tour · {{3}} Pickup date and time · {{4}} Pickup location · {{5}} Reason · {{6}} Dashboard link


### 3.2 Payment Gateways
| Variable | Required? | Example Placeholder | Purpose |
| :--- | :--- | :--- | :--- |
| `ENABLE_DEMO_PAYMENT` | Dev Only | `true` / `false` | Enables instant test payment bypass. |
| `CASHFREE_APP_ID` | For Cashfree| `<cashfree-app-id>` | Cashfree Merchant Application ID. |
| `CASHFREE_SECRET_KEY` | For Cashfree| `<cashfree-secret-key>` | Cashfree Merchant API Secret. |
| `CASHFREE_ENVIRONMENT` | For Cashfree| `SANDBOX` / `PRODUCTION` | Cashfree API environment. |
| `CASHFREE_SECUREID_SIMULATE` | No | `true` | Answers every identity/bank verification from a local fixture without calling Cashfree. Set by the test suite so KYC tests do not depend on a live verification wallet; useful offline. **Never set in production** — it would mark bank accounts verified that no bank confirmed. |
| `CASHFREE_SECUREID_SIMULATION_FALLBACK` | No | `false` to disable | When unset, a *network or IP-whitelist failure* falls back to the same fixture. An API that answers with an error (for example an empty verification wallet) is not covered by this and surfaces as a failure. |
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

---

## 5. Scheduled Jobs (Cloud Scheduler)
The API also runs driver dispatch on a 30-second in-process timer, but Cloud Run throttles CPU between requests, so that timer is **not reliable on its own**. When no traffic is coming in, driver requests, the 24-hour trip reminders and "assign manually" alerts can arrive late. Cloud Scheduler is the primary trigger; the in-process timer is a backup. Concurrent runs are safe: each queued notification is claimed with a lease.

| Variable | Required? | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `ASSIGNMENT_SCHEDULER_TOKEN` | Yes (production) | — | Shared secret sent as `X-Scheduler-Token` by Cloud Scheduler. Use a long random value and store it in Secret Manager. |
| `DISPATCH_AUTO_DEFAULT` | Optional | `true` | Automatic driver assignment for suppliers that have not saved a preference. Set `false` to make it opt-in. |
| `DISPATCH_ESCALATION_HOURS` | Optional | `24,12,6` | Hours before pickup at which a booking without an accepted driver escalates: first value alerts the supplier (task `HIGH`), middle values make the task `CRITICAL`, the last hands assignment to operations. |

| Job | Endpoint | Schedule | What it does |
| :--- | :--- | :--- | :--- |
| `driver-dispatch` | `POST /api/ops/process-driver-dispatch` | `*/5 * * * *` | Auto-assigns drivers, expires unanswered requests, queues 24-hour and 2-hour reminders and alerts, and delivers the dispatch notification queue. |
| `idea-holiday-schedule-run` | `POST /api/ops/process-assignment-timeouts` | `*/5 * * * *` | Supplier acceptance SLA and circuit reconfirmation timeouts. |
| `idea-holiday-queue-drain` | `POST /api/ops/process-reservation-outbox` | `* * * * *` | Booking confirmation outbox delivery. |
| `post-trip-invites` | `POST /api/ops/process-post-trip-invites` | `15 * * * *` | Review and report-a-problem invites for trips completed in the last 7 days. |

All four jobs run in `Asia/Kolkata`, send `X-Scheduler-Token` from the `idea-holiday-assignment-scheduler-token` secret, and are created in project `my-project-8591-489308`, region `us-central1`. The token is attached to Cloud Run as `ASSIGNMENT_SCHEDULER_TOKEN` by `deploy.sh`.

Create or update the dispatch job (run once per environment):

```bash
SERVICE_URL=$(gcloud run services describe idea-holiday-marketplace --region=us-central1 --format='value(status.url)')
gcloud scheduler jobs create http driver-dispatch \
  --location=us-central1 --schedule="*/5 * * * *" --time-zone="Asia/Kolkata" \
  --uri="${SERVICE_URL}/api/ops/process-driver-dispatch" --http-method=POST \
  --headers="Content-Type=application/json,X-Scheduler-Token=${ASSIGNMENT_SCHEDULER_TOKEN}" \
  --message-body='{}' --attempt-deadline=120s
# Later changes: replace "create" with "update".
```

**Notification retries.** A dispatch notification that fails at the provider is retried after 2, 4, 8, 16 and 32 minutes. After 6 attempts it is marked `FAILED` and an open `NOTIFICATION_FAILED` staff task is created for the booking. A recipient that can never be reached (invalid phone or email) does not block the other recipients; the job completes and the same staff task records who was missed. Channels switched off by configuration (`SKIPPED`) are not treated as failures.
