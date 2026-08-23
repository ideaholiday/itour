# Idea Holiday — Viator-Style Experiences & Transfer Marketplace for India

A complete, full-stack production platform for Indian tours, airport transfers, day sightseeing, and multi-day packaged holidays with a **4-Role Ecosystem** (Traveler, Tour Supplier / Fleet Vendor, Ground Ops Staff, Super Admin). Built with React 19, Vite, Next.js, Tailwind CSS, Node/Express, SQLite (local zero-config dev), and Supabase PostgreSQL with PostGIS extensions.

---

## 🌟 Key Architecture & Engine Features

### 1. Database Architecture & 4-Role Ecosystem
- **Postgres / Supabase Master Schema**: `backend/src/supabase_schema.sql` (PostGIS enabled for spatial geo-fencing).
- **SQLite Local Engine**: `backend/src/db.js` for zero-config local development and testing.
- **4 Ecosystem Roles**:
  - **Traveler**: Browse, search, view day-wise itineraries, select vehicle categories, and book tours/transfers.
  - **Supplier / Fleet Vendor**: KYB compliance, define PostGIS polygon service areas, publish transfers, sightseeing tours & multi-day packages, dispatch drivers.
  - **Ground Ops Staff**: Resolve dispatch fallbacks, task management, monitor booking OTPs.
  - **Admin**: Approve KYB compliance documents, oversee commission payouts, manage listings.

### 2. Location & Geo-Fencing Transfer Engine
- **Spatial Route Search Route**: `POST /api/transfers/search` and `GET /api/transfers/search`.
- **PostGIS & Ray-Casting Point-in-Polygon Engine**: Matches pickup/drop coordinates against active supplier operational polygons (with circle radius fallback).
- **Capacity Filtering**: Validates passenger count & check-in luggage count against vehicle taxonomy specs.
- **Dynamic Cost Breakdown**:
  - Distance & Travel Time calculation (Haversine + road multiplier).
  - Base Fare (per KM or minimum fare).
  - Fastag Highway Tolls calculation.
  - Interstate Permit Tax allowance (when crossing state boundaries).
  - 5% GST tax calculation.
  - Platform Commission & Net Supplier Payout calculation.

### 3. Supplier Dashboard & Listing Builder
- **Service Area Builder**: Define operational service zones with center coordinates, radius KM, and **PostGIS polygon vertices** (`[[lat, lng], ...]`) with auto-generated bounding boxes.
- **Sightseeing Tour Builder**: Create 4h / 8h / 12h day tours with custom places-to-visit stop sequences, inclusions/exclusions, and vehicle rules.
- **Multi-Day Package Builder (e.g. 3N/4D Goa)**: Build packaged tours with total days/nights, day-wise activity editor, vehicle category choices, and hotel option tier variants (Cab Only, 3-Star, 4-Star).
- **Chauffeur & Vehicle Dispatch**: Assign an available roster driver and compatible vehicle, prevent overlapping trips, audit reassignments, and track `Assigned → En route → Arrived → OTP start → Completed`.

### 4. Traveler Search, Product Details & Booking Checkout
- **Unified Search**: Search across Airport Transfers, Day Sightseeing Tours, and Multi-Day Holiday Packages.
- **Product Details Page (`ActivityDetail.jsx`)**:
  - **Day-Wise Itinerary Accordion**: Expandable day-by-day itinerary cards (`Day 1`, `Day 2`, `Day 3`, `Day 4`) with activity highlights.
  - **Places-to-Visit Stop Timeline**: Vertical timeline for sightseeing stop sequences.
  - **Vehicle Selector Widget**: Interactive selector for vehicle taxonomy (Sedan, SUV, Premium MUV / Innova Crysta, Luxury, Group Tempo Traveller).
  - **Hotel Option & Pricing Variant Selector**: Cab Only, 3-Star Resort, 4-Star Resort, 5-Star Luxury Resort with real-time fare recalculation.
- **Multi-Gateway Payment Checkout (`Checkout.jsx`)**:
  - **Razorpay Gateway** (UPI, Credit/Debit Cards, Netbanking, Wallets).
  - **PhonePe Payment Gateway** (Direct PhonePe UPI & QR).
  - **Easebuzz PG** (Debit/Credit Cards & Corporate Netbanking).
  - **Instant UPI QR & Scan** (GPay / PhonePe / Paytm / BHIM).

### 5. Booking and Pickup OTP Lifecycle

The backend owns the price and booking state. Checkout first requests a canonical quote, then creates an idempotent `pending_payment` booking. A successful verified payment activates the booking; browser-supplied totals are never accepted as the source of truth.

The state path is:

`pending_payment -> confirmed -> driver_assigned -> in_progress -> completed`

A cryptographically random six-digit pickup OTP is created only after payment. The database stores a verification hash and an AES-GCM encrypted copy, while supplier, driver, admin, operations and notification-list APIs omit the secret. The traveler sees it in My Trips. At pickup, the traveler first checks the driver and vehicle plate, then shares the code. The supplier enters it in the booking manager; a correct code atomically marks pickup verified and starts the trip. Five incorrect attempts lock verification, the code expires after the pickup window, and only operations can reset it. Supplier payout remains held until the trip is completed.

### Finance controls

- Commission is resolved from a supplier override or the product-type default, then frozen on the booking.
- Refunds use the cancellation policy accepted at checkout and keep pending, processed, failed, gateway-reference, and idempotency records.
- Partial and no-refund cancellations recalculate only the retained commission and supplier payable.
- Supplier payouts move through `SCHEDULED → BATCHED → PROCESSED → RECONCILED`; processing requires a bank or payout-provider reference.
- The immutable finance event log and reconciliation report flag amount mismatches, missing payout/refund records, missing transfer references, and bank-statement reconciliation work.

## Transactional email and WhatsApp

The Express backend supports Amazon SES v2 and Meta WhatsApp Cloud API. Configuration keys are documented in `.env.example`; production values must be injected through the hosting platform's secret manager.

- Verify `no-reply@ideaholiday.in` (or the whole domain) in the same SES region configured by `SES_REGION`. Move the SES account out of sandbox before messaging arbitrary customer addresses.
- Give the runtime IAM role `ses:SendEmail`, or provide a rotated access key through deployment secrets.
- Register `https://ideaholiday.in/api/webhooks/whatsapp` in Meta and configure both `WHATSAPP_APP_SECRET` and a private `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- Set `PUBLIC_APP_URL` and a long random `DOCUMENT_LINK_SECRET` so guest voucher/invoice links are signed and expire automatically. Travelers can manage email/WhatsApp preferences and review delivery status in My Trips; operations can resend only approved booking events from the notification console.
- Traveler cancellations, complaints, safety concerns and refund disputes are tracked under `/api/support/cases`. Refund requests require an administrator or operations decision before the payment provider and finance ledger are updated.
- Completed bookings can submit one verified review with separate experience, supplier and driver ratings. Published reviews update marketplace ratings and evidence-based quality scores; risky content enters the `/admin/quality` moderation queue.
- Create and approve Meta templates for proactive transactional messages. Free-form text works only inside WhatsApp's allowed customer-service conversation window.
- Enable each provider only after configuration is complete. `/api/ops/notification-health` reports configuration state without exposing credentials, and `/api/ops/notifications/test` sends an authenticated provider test.

All attempts are recorded in `notification_deliveries`, with provider message IDs, retries, failures, and WhatsApp delivery/read webhook status. Legacy email and WhatsApp log screens remain supported.

## API authentication, authorization, and audit logging

Protected Express APIs accept either an existing Idea Holiday JWT or a verified Supabase access token in `Authorization: Bearer <token>`. Supabase tokens are verified with `supabase.auth.getUser`; the backend then resolves the account, role, supplier association, and booking ownership from its own database. Supabase metadata and legacy `X-User-Id` / `X-User-Email` headers never grant access.

- Public access is limited to discovery, quotes, places, published reviews, SEO/health, signed guest documents, authentication, and signature-verified webhooks.
- Traveler booking, checkout, document, notification, support, and review operations require booking ownership. Supplier APIs require the linked supplier account or `ADMIN`/`STAFF`; operations require `ADMIN`/`STAFF` except the scheduler-token timeout task; `/api/admin` requires `ADMIN`.
- Missing or invalid identity returns `401/AUTH_REQUIRED`; insufficient scope returns `403/FORBIDDEN`. Every JSON error and `X-Request-Id` response header carries the same request ID.
- Winston writes redacted JSON to stdout for Cloud Run. Request bodies are disabled by default, and credentials, tokens, OTPs, payment/bank fields, email addresses, phone numbers, PAN/GST identifiers, and provider secrets are removed or masked recursively.
- Successful authenticated mutations and authorization denials are stored in `audit_logs`; raw request payloads, secrets, full PII, and raw IP addresses are not stored.

Production requires `JWT_SECRET`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. Logging is controlled by `LOG_LEVEL`, `LOG_FORMAT`, `SLOW_REQUEST_MS`, and `LOG_REQUEST_BODY` as documented in `.env.example`.

## Metrics and performance instrumentation

The backend publishes Prometheus-compatible process, HTTP latency/status, in-flight request, search, booking, payment, refund, database-query, and frontend Web Vital metrics at `GET /api/metrics`. The endpoint is private: use an `ADMIN`/`STAFF` bearer token or configure a random `METRICS_TOKEN` of at least 32 characters. Scrapers can send that value as a standard bearer credential or through `X-Metrics-Token`. Never put the scraper token in either browser application.

Both the Vite and Next.js clients report only bounded metric name/value/rating, normalized route, application, and navigation type to `POST /api/telemetry/web-vitals`; identifiers, query strings, emails, and other PII are not collected. Every Vite page/workspace is route-loaded and the optional Supabase SDK is deferred. This reduced the initial uncompressed JavaScript entry from 616.2 KiB to 213.0 KiB. `npm run check:bundle` enforces a 250 KiB maximum chunk and a stricter 225 KiB initial-entry budget.

`docker-compose.observability.yml` starts a localhost-only Prometheus/Grafana stack with a file-backed scrape credential, seven service/UX alert rules, and two automatically provisioned dashboards. Follow `observability/README.md`; production Cloud Run sidecar deployment and notification routing still require cloud credentials and an incident destination.

## Request validation and CI quality gates

Zod schemas validate authentication, booking, checkout, supplier, administration, operations, support, review, and transfer mutation payloads. Known fields are normalized and bounded while extension fields remain compatible; signed provider webhooks are not reshaped. A global boundary rejects excessive depth or collection sizes and prototype-pollution keys. Invalid input returns `400/VALIDATION_ERROR` with the current request ID and never echoes submitted values.

Run `cd backend && npm run test:coverage` to execute all 100 backend tests with enforced 70% line and function coverage. Run `cd backend && npm run test:integration` for the isolated real-HTTP traveler API journey, and root `npm run test:e2e` for the three Chromium traveler, supplier, and operations/refund journeys. GitHub Actions runs all suites, the backend production dependency audit, the Vite production build with its bundle budget, and the root Next.js production build; Playwright failure artifacts are retained for diagnosis.

## Analytics & Business Intelligence Command Center

The platform includes an in-app executive analytics engine accessible at `/admin/analytics` backed by 6 API endpoints under `/api/analytics`:
- **Real-Time KPIs**: Period-over-period bookings, revenue, AOV, cancellations, and active suppliers.
- **Visual Trends**: Inline SVG time-series charts for booking volume and GMV revenue.
- **Conversion Funnel**: Multi-stage funnel analysis from discovery through confirmed checkout.
- **Supplier Scorecard**: Performance rankings by revenue, completed booking count, and rating.
- **Anomaly Detection**: Z-score anomaly alerting for unusual booking or cancellation spikes.

## Versioned Database Migrations

The backend features a dual-engine (SQLite & PostgreSQL) versioned SQL migration runner:
- `npm run migrate:status`: View pending vs. applied migration batches.
- `npm run migrate:up`: Incrementally apply versioned schema changes from `backend/migrations/`.
- `npm run migrate:down`: Safely rollback the last migration batch.
- `_schema_migrations`: Immutable database ledger recording migration versions, checksums, and execution timestamps.

WhatsApp template body variables must use these orders:

- `BOOKING_CONFIRMED`: booking reference, product, date, time, pickup, voucher URL, invoice URL.
- `SUPPLIER_ASSIGNMENT`: booking reference, product, date, pickup, response deadline.
- `SUPPLIER_ACCEPTED`: booking reference, supplier name.
- `DRIVER_ASSIGNED`: booking reference, driver name, driver phone, vehicle, pickup time, pickup.
- `DRIVER_TRIP`: booking reference, traveler name, traveler phone, date/time, pickup, drop, vehicle number.
- `SUPPLIER_STATUS`: status, reason.
- `OPS_ALERT`: booking reference, alert summary.
- `TRIP_STATUS`: booking reference, dispatch status, traveler-facing status message.
- `REFUND_STATUS`: booking reference, refund amount, refund percentage, gateway reference.
- `PAYOUT_STATUS`: settlement reference, net amount, payout count, bank/provider reference.

---

## 🚀 Running Locally

### Next.js authentication experience (email + Google)

The root app contains the current Idea Holiday sign-up and sign-in experience powered by Supabase Auth.

```bash
npm install
npm run dev
```

Set these values in `.env.local` before starting:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

For Google sign-up, enable the Google provider in Supabase and add `http://localhost:3000/auth/callback` (plus the production equivalent) to the allowed redirect URLs. Email/password sign-up works through the same `/signup` page and respects Supabase's email-confirmation setting.

### Marketplace frontend and API

```bash
# 1. Terminal 1 — Backend
cd backend
npm install
# Add MAPPLS_API_KEY to backend/.env for pickup autocomplete
ALLOW_DESTRUCTIVE_SEED=true node src/seed.js  # Replaces local data with demo data
npm run dev           # Runs server at http://localhost:4000

# 2. Terminal 2 — Frontend
cd frontend
npm install
npm run dev           # Runs Vite frontend at http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173 in your browser.

---

## 🗄️ Supabase PostgreSQL & PostGIS Seeding

To connect and seed a Supabase PostgreSQL database:

1. Configure `DATABASE_URL` in `backend/.env`.
2. Run database migrations:
```bash
cd backend
npm run migrate:up
```
3. Run the Supabase seeder script:
```bash
cd backend
node seed-supabase.js
```

---

## ☁️ Cloud Run Deployment & CI/CD

Cloud Run runs the application with **2 GiB RAM / 2 vCPUs** while Supabase PostgreSQL stores all persistent marketplace data in the isolated `marketplace` schema. `DATABASE_URL` is injected from Google Secret Manager as `idea-holiday-database-url`.

### Automated CI/CD (GitHub Actions)
- `.github/workflows/ci.yml`: Runs 100 backend tests, coverage gates, HTTP integration, 3 E2E journeys, and builds on PR/push.
- `.github/workflows/deploy.yml`: Deploys to staging on `staging` branch, and performs zero-downtime blue-green production deployment on `main` with automated smoke test verification and rollback.

### Manual / CLI Deploy
```bash
chmod +x deploy.sh
./deploy.sh
```

Post-deployment smoke testing:
```bash
bash scripts/smoke-tests.sh https://idea-holiday-marketplace-723912383049.us-central1.run.app
```

---

## 📂 Project Structure

```
.
├── .github/workflows/
│   ├── ci.yml                       # CI Quality Pipeline & Coverage Gate
│   └── deploy.yml                   # Staging & Blue-Green Production CD
├── backend/
│   ├── migrations/                  # Versioned SQL Migration Files
│   ├── src/
│   │   ├── engine/
│   │   │   └── transferEngine.js   # Haversine & Ray-Casting Geo-Fence Engine
│   │   ├── routes/
│   │   │   ├── activities.js        # Product Search & Detail API
│   │   │   ├── analytics.js         # Executive Analytics & Trend Endpoints
│   │   │   ├── transfers.js         # Transfer Routing & Quotes
│   │   │   ├── suppliers.js         # Geo-Fences, KYB & Listing Builder
│   │   │   ├── bookings.js          # Booking Creation & Voucher Lifecycle
│   │   │   ├── metrics.js           # Protected Prometheus Scrape Endpoint
│   │   │   ├── securityTxt.js       # RFC 9116 Vulnerability Disclosure
│   │   │   └── admin.js             # Admin Compliance & Analytics API
│   │   ├── services/                # 17 Isolated Domain Services
│   │   │   ├── analyticsService.js
│   │   │   ├── bookingService.js
│   │   │   ├── migrationRunner.js
│   │   │   └── ...
│   │   ├── middleware/              # Auth, RBAC, Validation & Observability
│   │   ├── db.js                    # Dual SQLite/Postgres Layer
│   │   └── server.js                # Express App Server Entry
│   ├── test/                        # 100 Deterministic Backend Tests
│   └── integration/                 # Real-HTTP Isolated Journey Tests
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   │   └── AnalyticsDashboardView.jsx # Executive Analytics Dashboard
│   │   │   ├── AdminPanel.jsx
│   │   │   ├── Checkout.jsx
│   │   │   └── ...
│   │   └── lib/
│   │       ├── analytics.js         # GA4 / GTM Telemetry Layer
│   │       └── webVitals.js         # Core Web Vitals Reporter
│   └── scripts/
│       └── check-bundle-size.js     # Bundle Budget Check (213.4 KiB)
├── observability/                   # Prometheus & Grafana Provisioning
├── scripts/
│   ├── smoke-tests.sh               # 8-Check Post-Deploy Smoke Runner
│   ├── rollback.sh                  # Instant Revision Rollback Automation
│   └── monitor-post-deploy.sh       # Post-Deploy Health Monitor
├── deploy.sh                        # Cloud Run Deployment Script
└── README.md
```
