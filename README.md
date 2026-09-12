# Idea Holiday — Experiences & Transfer Marketplace for India

A complete, full-stack production platform for Indian tours, airport transfers, day sightseeing, and multi-day packaged holidays with a **4-Role Ecosystem** (Traveler, Tour Supplier / Fleet Vendor, Ground Ops Staff, Super Admin). Built with React 19, Vite, Next.js, Tailwind CSS, Node/Express, SQLite (local zero-config dev), and Supabase PostgreSQL with PostGIS extensions.

---

## Contents

- [Quick start](#quick-start) — get the stack running locally
- [How the platform fits together](#how-the-platform-fits-together) — the 10-second mental model
- [Platform capabilities](#platform-capabilities) — what is built, feature by feature
- [Notifications](#notifications-email-whatsapp-and-sms) — SES, WhatsApp Cloud API, template contracts
- [Security and access control](#security-and-access-control)
- [Observability and quality gates](#observability-and-quality-gates)
- [Database migrations](#database-migrations)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Documentation map](#documentation-map) — which doc to read for which task

---

## Quick start

You need **Node.js 20.9+**. Local development uses SQLite, so there is no database to install.

The marketplace is two processes: the Express API and the Vite client. Run each in its own terminal.

```bash
# Terminal 1 — Backend API on http://localhost:4000
cd backend
npm install
npm run seed:demo      # Idempotently adds a bookable Goa demo supplier/catalog
npm run dev

# Terminal 2 — Frontend on http://localhost:5173 (proxies /api to :4000)
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Add `MAPPLS_API_KEY` to `backend/.env` if you want pickup autocomplete.

### Checking your work

```bash
cd backend && npm test              # 286 unit tests across 9 suites
cd backend && npm run test:integration  # 16 real-HTTP journey tests
cd backend && npm run test:coverage     # enforces 70% line + function coverage
cd frontend && npm run build            # includes the bundle-size budget check
```

### Next.js authentication app (optional)

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

---

## How the platform fits together

Four roles share one Express API and one database:

| Role | Where they work | What they do |
| :--- | :--- | :--- |
| **Traveler** | `ideaholiday.in` | Search, hold seats for 10 minutes, pay, receive a QR voucher |
| **Supplier / fleet vendor** | `supply.ideaholiday.in` | Pass KYB, publish listings, set seats and schedules |
| **Ground ops** | `/ops` | Resolve dispatch exceptions, verify OTPs, monitor live trips |
| **Admin** | `admin.ideaholiday.in` | Approve suppliers, moderate products, manage commission and payouts |

The backend is the single source of truth for price and booking state. A browser never supplies a total that the server trusts: checkout requests a canonical quote, creates a `pending_payment` booking, and only a verified payment activates it.

---

## Platform capabilities

### 1. Database architecture and the 4-role ecosystem

- **Postgres / Supabase Master Schema**: `backend/src/supabase_schema.sql` (PostGIS enabled for spatial geo-fencing).
- **SQLite Local Engine**: `backend/src/db.js` for zero-config local development and testing.
- **4 Ecosystem Roles**:
  - **Traveler**: Browse, search, view day-wise itineraries, select vehicle categories, and book tours/transfers on `ideaholiday.in`.
  - **Supplier / Fleet Vendor**: KYB compliance, define service areas, publish listings, manage real-time seat inventory, and connect ResTech channels on `supply.ideaholiday.in`.
  - **Ground Ops Staff**: Resolve dispatch fallbacks, task management, monitor booking OTPs on `/ops`.
  - **Admin**: Approve KYB compliance documents, oversee commission payouts, manage listings on `admin.ideaholiday.in`.

### 2. Multi-domain routing and dedicated portals

- **Consumer Marketplace (`ideaholiday.in`)**: Traveler discovery, live availability, cart with 10-minute hold, and payment checkout.
- **Supplier Reservation System (`supply.ideaholiday.in`)**: Dedicated supplier extranet, login, product builder, seat inventory, and channel manager.
- **Admin Control Plane (`admin.ideaholiday.in`)**: High-security administration for KYB verification, product moderation, commission settings, and finance.
- **Development Routing**: Seamlessly detects `supply.localhost:5173`, `admin.localhost:5173`, or query overrides (`?portal=supplier`, `?portal=admin`) on a single local dev port.

### 3. Standard OCTo API and multi-channel ingestion

- **OCTo v1 Compliance**: Full REST endpoints mounted at `/api/octo` and `/octo` (`/capabilities`, `/suppliers`, `/products`, `/availability`, `/bookings/reservation`, `/bookings/confirmation`, `/bookings/cancellation`).
- **Modular ResTech Connectors**: Connect external booking channels (Bókun, FareHarbor, Bookingkit, Palisis/TourCMS, Activitar, Anchor, Generic OCTo).
- **Product Import & Sync**: Fetch remote catalog items and import into Idea Holiday with options, departures, and mapped IDs in `reservation_external_references`.

### 4. Location and geo-fencing transfer engine

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

#### Product-scoped pickup and drop validation

Every published product is bound to typed records in `canonical_locations` and
`product_location_rules` (migration `014_product_location_validation.sql`).
`locationValidationService.js` validates fixed airports/stations, radius and
polygon zones, city-only day-tour pickups, package start/end anchors, flight
requirements, day-tour slots/cutoffs, and per-night hotel cities at quote and
booking time. Invalid points return `INVALID_PICKUP_POINT` or
`INVALID_DROP_POINT` with an allowed-area and actionable `suggestion`.

The Express endpoints are `GET/POST /api/activities/:id/pickup-suggestions`
and `POST /api/activities/:id/validate-pickup`; both clients use these scoped
endpoints for autocomplete and inline confirmation, falling back to the global
Mappls search only when a product has no published rule. Existing products are
backfilled on startup, while new supplier listings persist their explicit
location rules and transfer IATA anchors.

### 5. Supplier dashboard and listing builder

Native seat reservations are available under **Listings → Seats and schedule** (`SupplierInventoryEditor.jsx`). See [Phase 1 setup, behavior and verification](docs/native-reservations-phase1.md) for operating days, departures, capacity, blackout dates, 10-minute holds, instant confirmation, QR vouchers, notification setup, and the OCTO-aligned provider boundary.

- **Service Area Builder**: Define operational service zones with center coordinates, radius KM, and **PostGIS polygon vertices** (`[[lat, lng], ...]`) with auto-generated bounding boxes.
- **Sightseeing Tour Builder**: Create 4h / 8h / 12h day tours with custom places-to-visit stop sequences, inclusions/exclusions, vehicle rules, and Seat-In-Coach hubs (`product_sic_hubs`).
- **Multi-Day Package Builder (e.g. 3N/4D Goa)**: Build packaged tours with total days/nights, day-wise activity editor (`product_itinerary_items`), vehicle category choices, and hotel option tier variants (`product_hotel_tiers`: Cab Only, 3-Star, 4-Star, 5-Star).
- **Extranet Seat Inventory Editor**: Configure operating days, departure slots, seat quotas, adult/child prices, cut-off minutes, cancellation deadline hours, and blackout dates.
- **Chauffeur & Vehicle Dispatch**: Assign an available roster driver and compatible vehicle, prevent overlapping trips, audit reassignments, and track `Assigned → En route → Arrived → OTP start → Completed`.

### 6. Traveler search, product details and checkout

- **Unified 5-Type Search (`Search.jsx`)**: Search across Airport Transfers, Day Sightseeing Tours, Multi-Day Packages, Attraction Tickets, and Experiential Activities with type tabs and recent search history.
- **Product Details Page (`ActivityDetail.jsx`)**:
  - **Type-Specific Booking Panels**: Specialized reservation widgets for each product model (Ticket Tiers, Vehicle Options, SIC Hubs, Hotel Accommodation Tiers).
  - **Live Departure Picker (`LiveDeparturePicker.jsx`)**: Real-time slot selection showing remaining vacancies and countdown-backed 10-minute checkout holds (`native_reservations`).
  - **Day-Wise Itinerary Accordion**: Expandable day-by-day itinerary cards (`Day 1`, `Day 2`, `Day 3`, `Day 4`) with activity highlights.
  - **Places-to-Visit Stop Timeline**: Vertical timeline for sightseeing stop sequences.
  - **Vehicle Selector Widget**: Interactive selector for vehicle taxonomy (Sedan, SUV, Premium MUV / Innova Crysta, Luxury, Group Tempo Traveller).
  - **Hotel Option & Pricing Variant Selector**: Cab Only, 3-Star Resort, 4-Star Resort, 5-Star Luxury Resort with real-time fare recalculation.
- **Multi-Gateway Payment Checkout (`Checkout.jsx`)**:
  - **Razorpay Gateway** (UPI, Credit/Debit Cards, Netbanking, Wallets).
  - **Cashfree Payments** (UPI, Cards, Netbanking).
  - **PhonePe & Instant UPI QR** (GPay / PhonePe / Paytm / BHIM).

### 7. Booking and pickup OTP lifecycle

The backend owns the price and booking state. Checkout first requests a canonical quote, then creates an idempotent `pending_payment` booking. A successful verified payment activates the booking; browser-supplied totals are never accepted as the source of truth.

The traveler Circuit Planner follows the same rule. `POST /api/itineraries/:id/quote` reprices every linked itinerary item for its actual trip day and guest count, checks current publication and supplier availability, and persists a 15-minute `circuit_quotes` snapshot. Custom, unlinked, unpublished, or unavailable items are returned as explicit issues and never contribute browser-entered estimates to the verified total. An authenticated traveler can consume an owned, unexpired `READY` quote through `POST /api/circuit-orders`. The backend atomically creates one parent circuit order, one `pending_payment` child booking and payout snapshot per line, and 10-minute inventory holds. Consumption is idempotent, a quote can be consumed only once, and any unavailable line rolls back the complete order.

Circuit orders support one parent-level Cashfree or Razorpay charge through `POST /api/circuit-orders/:id/payment-order` and `POST /api/circuit-orders/:id/verify-payment`; isolated environments can use `POST /api/circuit-orders/:id/demo-payment`. A verified charge atomically confirms every child booking, creates each pickup OTP, holds every supplier payout, consumes every inventory hold, records per-booking finance entries, and starts the supplier response SLA. Provider webhooks share the same replay-safe state machine. Failed charges release the full circuit, while late or amount-mismatched captures activate no child bookings and enter `PAYMENT_REVIEW_REQUIRED`.

The Circuit Planner now exposes the complete grouped journey. A ready quote can be reserved once with a stable browser idempotency key, resumed after refresh, and opened at `/circuit-checkout/:id`. Checkout displays every held experience, the reservation countdown, the single verified INR total, and Cashfree, Razorpay, or demo payment choices. Successful verification routes to `/circuit-confirmed/:ref`, where the traveler sees the parent reference and every confirmed child booking without exposing pickup OTP secrets.

The planner summary shows the four booking stages—save, quote, reserve and pay—and keeps the grouped-checkout action visible after a quote is ready. Planner exports are explicitly labeled as an estimate or live quote, while the confirmation page produces the official grouped circuit voucher with parent and child booking references. Print previews use an isolated A4 document so the application layout cannot create blank trailing pages.

Confirmed circuits can be managed at `/circuit/:ref/manage`. Cancellation previews aggregate each child supplier policy into one parent refund, while reschedules preserve the circuit spacing and recheck every proposed stop. Both actions create an idempotent parent request and leave all bookings unchanged until operations reviews it at `/ops/circuits`. Approval is atomic across every child; a grouped refund is submitted once against the parent payment, and provider failure leaves all children confirmed for a safe retry.

Approved circuit reschedules now enter a 24-hour supplier reconfirmation SLA. Suppliers receive the new dates and respond from their booking workspace; the parent circuit completes only after every stop is accepted. A rejection or timeout never reassigns one child independently—it holds the grouped itinerary and creates one critical operations task. Traveler, supplier and operations email/WhatsApp updates use replay-safe delivery keys. Live Cashfree and Razorpay refund webhooks reconcile the parent refund idempotently, delay the final refund notification until provider confirmation, and send failed or amount-mismatched events to operations review.

The state path is:

`pending_payment -> confirmed -> driver_assigned -> in_progress -> completed`

A cryptographically random six-digit pickup OTP is created only after payment. The database stores a verification hash and an AES-GCM encrypted copy, while supplier, driver, admin, operations and notification-list APIs omit the secret. The traveler sees it in My Trips. At pickup, the traveler first checks the driver and vehicle plate, then shares the code. The supplier enters it in the booking manager; a correct code atomically marks pickup verified and starts the trip. Five incorrect attempts lock verification, the code expires after the pickup window, and only operations can reset it. Supplier payout remains held until the trip is completed.

### 8. Finance controls

- Commission is resolved from a supplier override or the product-type default, then frozen on the booking.
- Refunds use the cancellation policy accepted at checkout and keep pending, processed, failed, gateway-reference, and idempotency records.
- Partial and no-refund cancellations recalculate only the retained commission and supplier payable.
- Supplier payouts move through `SCHEDULED → BATCHED → PROCESSED → RECONCILED`; processing requires a bank or payout-provider reference.
- The immutable finance event log and reconciliation report flag amount mismatches, missing payout/refund records, missing transfer references, and bank-statement reconciliation work.

### 9. Analytics and business intelligence

The platform includes an in-app executive analytics engine accessible at `/admin/analytics` backed by 6 API endpoints under `/api/analytics`:
- **Real-Time KPIs**: Period-over-period bookings, revenue, AOV, cancellations, and active suppliers.
- **Visual Trends**: Inline SVG time-series charts for booking volume and GMV revenue.
- **Conversion Funnel**: Multi-stage funnel analysis from discovery through confirmed checkout.
- **Supplier Scorecard**: Performance rankings by revenue, completed booking count, and rating.
- **Anomaly Detection**: Z-score anomaly alerting for unusual booking or cancellation spikes.

---

## Notifications (email, WhatsApp and SMS)

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

### WhatsApp template variable order

Meta templates are positional. Each template's body variables must be supplied in exactly this order:

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
- `SUPPORT_CASE`: case reference, booking reference, status, resolution.
- `PRODUCT_PUBLISHED`: listing title.
- `TRIP_REMINDER`: booking reference, experience name, travel date, pickup location.
- `REVIEW_REQUEST`: booking reference, experience name.
- `CIRCUIT_RESCHEDULE` (supplier-facing reconfirmation alert): circuit order reference, reschedule state, reconfirmation deadline.

---

## Security and access control

Protected Express APIs accept either an existing Idea Holiday JWT or a verified Supabase access token in `Authorization: Bearer <token>`. Supabase tokens are verified with `supabase.auth.getUser`; the backend then resolves the account, role, supplier association, and booking ownership from its own database. Supabase metadata and legacy `X-User-Id` / `X-User-Email` headers never grant access.

- Public access is limited to discovery, quotes, places, published reviews, SEO/health, signed guest documents, authentication, and signature-verified webhooks.
- Traveler booking, checkout, document, notification, support, and review operations require booking ownership. Supplier APIs require the linked supplier account or `ADMIN`/`STAFF`; operations require `ADMIN`/`STAFF` except the scheduler-token timeout task; `/api/admin` requires `ADMIN`.
- Missing or invalid identity returns `401/AUTH_REQUIRED`; insufficient scope returns `403/FORBIDDEN`. Every JSON error and `X-Request-Id` response header carries the same request ID.
- Winston writes redacted JSON to stdout for Cloud Run. Request bodies are disabled by default, and credentials, tokens, OTPs, payment/bank fields, email addresses, phone numbers, PAN/GST identifiers, and provider secrets are removed or masked recursively.
- Successful authenticated mutations and authorization denials are stored in `audit_logs`; raw request payloads, secrets, full PII, and raw IP addresses are not stored.

Production requires `JWT_SECRET`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. Logging is controlled by `LOG_LEVEL`, `LOG_FORMAT`, `SLOW_REQUEST_MS`, and `LOG_REQUEST_BODY` as documented in `.env.example`.

### Request validation

Zod schemas validate authentication, booking, checkout, supplier, administration, operations, support, review, and transfer mutation payloads. Known fields are normalized and bounded while extension fields remain compatible; signed provider webhooks are not reshaped. A global boundary rejects excessive depth or collection sizes and prototype-pollution keys. Invalid input returns `400/VALIDATION_ERROR` with the current request ID and never echoes submitted values.

---

## Observability and quality gates

The backend publishes Prometheus-compatible process, HTTP latency/status, in-flight request, search, booking, payment, refund, database-query, and frontend Web Vital metrics at `GET /api/metrics`. The endpoint is private: use an `ADMIN`/`STAFF` bearer token or configure a random `METRICS_TOKEN` of at least 32 characters. Scrapers can send that value as a standard bearer credential or through `X-Metrics-Token`. Never put the scraper token in either browser application.

Both the Vite and Next.js clients report only bounded metric name/value/rating, normalized route, application, and navigation type to `POST /api/telemetry/web-vitals`; identifiers, query strings, emails, and other PII are not collected. Every Vite page/workspace is route-loaded and the optional Supabase SDK is deferred. This reduced the initial uncompressed JavaScript entry from 616.2 KiB to 213.0 KiB. `npm run check:bundle` enforces a 250 KiB maximum chunk and a stricter 225 KiB initial-entry budget.

`docker-compose.observability.yml` starts a localhost-only Prometheus/Grafana stack with a file-backed scrape credential, seven service/UX alert rules, and two automatically provisioned dashboards. Follow `observability/README.md`; production Cloud Run sidecar deployment and notification routing still require cloud credentials and an incident destination.

### CI quality gates

Run `cd backend && npm run test:coverage` to execute the backend tests with enforced 70% line and function coverage. Run `cd backend && npm run test:integration` for the isolated real-HTTP traveler API journey, including circuit-order consumption and grouped payment, and root `npm run test:e2e` for four Chromium traveler, grouped-circuit checkout and management, supplier, and operations/refund journeys. GitHub Actions runs all suites, the backend production dependency audit, the Vite production build with its bundle budget, and the root Next.js production build; Playwright failure artifacts are retained for diagnosis.

---

## Database migrations

The backend features a dual-engine (SQLite & PostgreSQL) versioned SQL migration runner:
- `npm run migrate:status`: View pending vs. applied migration batches.
- `npm run migrate:up`: Incrementally apply versioned schema changes from `backend/migrations/`.
- `npm run migrate:down`: Safely rollback the last migration batch.
- `_schema_migrations`: Immutable database ledger recording migration versions, checksums, and execution timestamps.

Pending migrations run as one transaction. SQLite conditionally adds missing columns without relying on PostgreSQL-only syntax, applied-file checksum drift blocks deployment, and rollback refuses to remove ledger entries when a migration has no down section.

Migrations are applied in filename order and tracked in the ledger by full filename. Give every new migration an unused number — `npm run migrate:status` warns when two files share one. (`017` is currently used twice for historical reasons; the files are not renamed because the ledger keys on the filename, so a rename would re-apply them on existing databases.)

### Supabase PostgreSQL and PostGIS seeding

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

---

## Deployment

Cloud Run runs the application with **2 GiB RAM / 2 vCPUs** while Supabase PostgreSQL stores all persistent marketplace data in the isolated `marketplace` schema. `DATABASE_URL` is injected from Google Secret Manager as `idea-holiday-database-url`.

### Automated CI/CD (GitHub Actions)

- `.github/workflows/ci.yml`: Runs 286 backend unit tests across 9 suites, 16 HTTP integration tests, coverage gates, Playwright E2E journeys, and builds on PR/push.
- `.github/workflows/deploy.yml`: Deploys to staging on `staging` branch, and performs zero-downtime blue-green production deployment on `main` with automated smoke test verification and rollback.

### Manual / CLI deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

Post-deployment smoke testing:
```bash
bash scripts/smoke-tests.sh https://idea-holiday-marketplace-723912383049.us-central1.run.app
```

---

---

## Project structure

```
.
├── .github/workflows/
│   ├── ci.yml                       # CI Quality Pipeline & Coverage Gate
│   └── deploy.yml                   # Staging & Blue-Green Production CD
├── backend/
│   ├── migrations/                  # Versioned SQL Migration Files (001 to 022)
│   ├── src/
│   │   ├── engine/
│   │   │   └── transferEngine.js   # Haversine & Ray-Casting Geo-Fence Engine
│   │   ├── routes/
│   │   │   ├── activities.js        # Product Search, 5-Types & Detail API
│   │   │   ├── analytics.js         # Executive Analytics & Trend Endpoints
│   │   │   ├── availability.js      # Native Real-Time Availability & Holds
│   │   │   ├── octo.js              # Standard OCTo v1 Endpoints (/api/octo)
│   │   │   ├── supplierChannels.js  # ResTech Ingestion & Channel Manager
│   │   │   ├── transfers.js         # Transfer Routing & Quotes
│   │   │   ├── suppliers.js         # Geo-Fences, KYB & Listing Builder
│   │   │   ├── bookings.js          # Booking Creation & Voucher Lifecycle
│   │   │   ├── metrics.js           # Protected Prometheus Scrape Endpoint
│   │   │   ├── securityTxt.js       # RFC 9116 Vulnerability Disclosure
│   │   │   └── admin.js             # Admin Compliance & Analytics API
│   │   ├── services/                # 49 Isolated Domain Services
│   │   │   ├── octoService.js       # Standard OCTo Serializers & Engine
│   │   │   ├── channelManagerService.js # ResTech Connector & Product Ingestion
│   │   │   ├── channels/            # ResTech Adapters (Bókun, FareHarbor, etc.)
│   │   │   ├── nativeInventoryService.js
│   │   │   ├── reservationProviders.js
│   │   │   ├── reservationOutboxService.js
│   │   │   └── ...
│   │   ├── middleware/              # Auth, RBAC, Validation & Observability
│   │   ├── db.js                    # Dual SQLite/Postgres Layer
│   │   └── server.js                # Express App Server Entry
│   ├── test/                        # 286 Deterministic Backend Unit Tests (9 Suites)
│   └── integration/                 # 16 Real-HTTP Isolated Journey Tests
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

---

## Documentation map

Reference docs live in [`docs/`](docs/). Read the one that matches your task rather than all of them — [`AGENTS.md`](AGENTS.md) carries the same routing table for AI agents.

| Your task | Start here |
| :--- | :--- |
| Understand scope and product intent | [`docs/PROJECT_GOALS.md`](docs/PROJECT_GOALS.md), [`docs/PRD.md`](docs/PRD.md), [`docs/SCOPE.md`](docs/SCOPE.md) |
| Seat capacity, holds, reservations | [`docs/native-reservations-phase1.md`](docs/native-reservations-phase1.md), [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) |
| Pricing, commission, booking state | [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) |
| Schema or field changes | [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Adding or changing an API route | [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md), [`docs/SECURITY.md`](docs/SECURITY.md) |
| Third-party integrations | [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md), [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) |
| Local setup, migrations, tooling | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| Writing tests | [`docs/TESTING.md`](docs/TESTING.md) |
| Architecture background | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) |
| Terminology | [`docs/GLOSSARY.md`](docs/GLOSSARY.md) |
