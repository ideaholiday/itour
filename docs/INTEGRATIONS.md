# External Integrations: Idea Holiday

> **Summary:** WhatsApp, Cashfree, Razorpay, email, SMS, maps and channel-manager providers.
> **Read when:** code talks to an external provider.

## 1. Meta WhatsApp Cloud API

### Overview & Purpose
Provides automated, high-deliverability transactional messaging to travelers, tour suppliers, and roster drivers (booking vouchers, driver dispatch alerts, operations escalation, trip updates).

### Configuration & Credentials
| Variable | Value / Format | Purpose |
| :--- | :--- | :--- |
| `WHATSAPP_CLOUD_API_ENABLED` | `true` / `false` | Master toggle for WhatsApp integration. |
| `WHATSAPP_APP_ID` | `1488217219329539` | Meta Application ID (Idea Holiday Pvt Ltd). |
| `WHATSAPP_PHONE_NUMBER_ID` | `1091999820653021` | Phone Number Identifier registered in Meta. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `794585599913804` | WhatsApp Business Account (WABA) ID. |
| `WHATSAPP_ACCESS_TOKEN` | Bearer token (System User) | Permanent system user token with messaging scopes. |
| `WHATSAPP_API_VERSION` | `v22.0` | Meta Graph API version. |
| `WHATSAPP_BASE_URL` | `https://graph.facebook.com` | Base Graph API host. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | `en_US` (or `en`) | Default language code for message templates. |
| `WHATSAPP_APP_SECRET` | Secret string | Verifies incoming webhook HMAC-SHA256 signatures. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`| Secret string | Token for Meta webhook registration verification. |

### Message Templates

Meta templates are **positional**: send variables in exactly this order. Each
template name is set by the `WHATSAPP_TEMPLATE_<KEY>` variable in `.env.example`.
Source of truth: the `whatsAppTemplate(...)` calls in `notificationService.js`
and `whatsappService.js`.

| Key | Variables, in order |
| :--- | :--- |
| `BOOKING_CONFIRMED` | booking ref, product, date, pickup time, pickup, voucher URL, invoice URL |
| `BOOKING_DOCUMENTS` | booking ref, voucher URL, invoice URL |
| `SUPPLIER_ASSIGNMENT` | booking ref, product, date, pickup, response deadline |
| `SUPPLIER_ACCEPTED` | booking ref, supplier name |
| `DRIVER_ASSIGNED` | booking ref, driver name, driver phone, vehicle model, vehicle number, pickup time, pickup, voucher URL |
| `DRIVER_TRIP` | booking ref, traveler name, traveler phone, date + time, pickup, drop, vehicle number |
| `SUPPLIER_STATUS` | status/action, reason |
| `OPS_ALERT` | booking ref, alert message |
| `TRIP_STATUS` | booking ref, status, message |
| `REFUND_STATUS` | booking ref, refund amount, refund percentage, gateway refund ID |
| `PAYOUT_STATUS` | batch ref, net amount, payout count, provider batch ID |
| `SUPPORT_CASE` | case ref, booking ref, status, resolution |
| `PRODUCT_PUBLISHED` | listing title |
| `TRIP_REMINDER` | booking ref, experience name, date, pickup |
| `REVIEW_REQUEST` | booking ref, experience name |
| `CIRCUIT_RESCHEDULE` | circuit order ref, reschedule state, reconfirmation deadline |

`TRIP_STATUS` also carries the traveler logistics updates (supplier confirmation
pending, pickup details updated, driver arriving, amendment recorded), so it
must be approved and configured in production. Every call site for a key must
pass the same number of variables; `backend/test/whatsappTemplateArity.test.js`
fails when they differ.

**Driver dispatch** uses its own `WHATSAPP_TEMPLATE_DISPATCH_*` templates. Their
names, variables, example values and approved body text are defined in
`DISPATCH_WHATSAPP_TEMPLATES` in `backend/src/services/dispatchNotificationService.js`.

### Important Limitations & Policies
- **24-Hour Customer Window**: Meta strictly prohibits sending free-form text outside the 24-hour customer care window. Proactive transactional messages **must use pre-approved templates**.

---

## 2. Cashfree Payments & SecureID

### Overview & Purpose
Primary payment gateway for domestic Indian payments (UPI, Credit/Debit cards, Corporate Netbanking) and automated KYB bank account verification.

### Configuration & Credentials
- `CASHFREE_APP_ID`: Client application identifier.
- `CASHFREE_SECRET_KEY`: Merchant secret key.
- `CASHFREE_ENV`: `TEST` (sandbox, `https://sandbox.cashfree.com/pg`) or `PROD` (real money, `https://api.cashfree.com/pg`).
- Orders send `order_meta.notify_url` = `${PUBLIC_APP_URL}/api/checkout/cashfree/webhook` (https only), so a traveler who closes the tab after paying is still confirmed.
- Supplier settlements through "Process via Cashfree" never record a simulated UTR on live traffic; if the Payouts call does not succeed, pay manually and record the bank UTR.

### Request & Webhook Flow
1. Server initializes payment session via `POST /orders` using `x-client-id` and `x-client-secret`.
2. Traveler completes payment on Cashfree SDK or hosted checkout.
3. Webhook listener (`POST /api/checkout/cashfree/webhook`) verifies signature using Cashfree public key and reconciles booking state idempotently.

---

## 3. Razorpay Payments

### Overview & Purpose
Secondary payment gateway providing instant UPI QR code generation, card checkout, and direct refunds.

### Configuration & Credentials
- `RAZORPAY_KEY_ID`: Public key for client checkout scripts.
- `RAZORPAY_KEY_SECRET`: Private server-side secret.

### Verification Flow
Server computes `crypto.createHmac("sha256", secret).update(order_id + "|" + payment_id).digest("hex")` and performs timing-safe comparison against the submitted signature.

---

## 4. Amazon SES v2 & Brevo (Transactional Email)

### Overview & Purpose
Dispatches HTML-rendered booking vouchers, PDF e-tickets, payment receipts, and staff notifications.

### Configuration & Credentials
- `EMAIL_NOTIFICATIONS_ENABLED`: `true` / `false`.
- `EMAIL_PROVIDER`: `SES` or `BREVO`.
- **For SES**: `SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`.
- **For Brevo**: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`.

### Delivery Security
Voucher links in emails are cryptographically signed using `DOCUMENT_LINK_SECRET` with time-based HMAC expirations, preventing URL tampering.

---

## 5. Twilio SMS Messaging

### Overview & Purpose
Fallback channel for urgent supplier booking dispatches in low-connectivity areas.

### Configuration & Credentials
- `SMS_NOTIFICATIONS_ENABLED`: `true` / `false`.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`.

---

## 6. Mappls / MapmyIndia Geocoding

### Overview & Purpose
Indian geocoding, reverse geocoding, and address autocomplete fallback for addresses not found in `canonical_locations`.

### Configuration & Credentials
- `MAPPLS_API_KEY`: API key for MapmyIndia place search.
- Used when a product has no rigid pickup polygon constraint.

---

## 7. Supabase Auth & Storage

### Overview & Purpose
User identity management (Google OAuth, email confirmation) and cloud object storage for KYB documents.

### Configuration & Credentials
- `SUPABASE_URL`: Supabase project URL (`https://<project>.supabase.co`).
- `SUPABASE_ANON_KEY`: Public client key.
- `SUPABASE_SERVICE_ROLE_KEY`: Privileged server-side key for administrative operations.

---

## 8. Multi-Channel ResTech Connectors

### Overview & Purpose
Enables suppliers on `supply.ideaholiday.in` to link their existing booking engines and reservation systems, fetch remote experiences, test credentials in real time, and import inventory with one click into Idea Holiday's catalog.

### Supported Channel Engines
| Channel | Adapter Type | Auth Scheme | Sync Capabilities |
| :--- | :--- | :--- | :--- |
| **Bókun (Tripadvisor)** | `BOKUN` | Access Key + Secret | Activities, departure rates, external reference mapping |
| **FareHarbor** | `FAREHARBOR` | API App Key | Experience discovery, item options |
| **Bookingkit** | `BOOKINGKIT` | Client ID + Client Secret | Experience listings, pricing tiers |
| **Palisis Group / TourCMS** | `TOURCMS` | Marketplace ID + API Key | Tour catalog, options |
| **Activitar** | `ACTIVITAR` | Supplier API Key | Live inventory, activities |
| **Anchor Operating System**| `ANCHOR` | Bearer Token | Attraction & ferry booking inventory |
| **Generic OCTo Endpoint** | `OCTO_GENERIC` | Bearer Token | Standard OCTo v1 capabilities, products, availability |

### Database Persistence & Endpoints
- Table: `supplier_channel_connections` (`backend/migrations/020_supplier_channel_connections.sql`).
- API Endpoints:
  - `GET /api/supplier-channels`: List supplier's active channel integrations.
  - `POST /api/supplier-channels`: Connect a new booking system.
  - `POST /api/supplier-channels/:id/test`: Perform live health check probe against remote API.
  - `GET /api/supplier-channels/:id/fetch-products`: Query remote catalog.
  - `POST /api/supplier-channels/:id/import-product`: Map external experience into `activities` and `reservation_external_references`.

---

## 9. OCTo Standard API Specification

### Overview & Purpose
Idea Holiday implements the Open Connectivity for Tours, Activities & Attractions (OCTo) specification (`v1`), acting as a standard supplier reservation system endpoint. Aggregators and external ResTech platforms can query live vacancies and issue reservation holds without custom bespoke adapters.

### Implemented Endpoints
- `GET /api/octo/v1/capabilities`: Advertises OCTo capabilities (`octo/core`, `octo/pricing`, `octo/content`).
- `GET /api/octo/v1/suppliers`: Returns verified supplier details.
- `GET /api/octo/v1/products`: Returns published catalog in OCTo format.
- `GET /api/octo/v1/products/:id`: Returns individual product with options.
- `POST /api/octo/v1/availability`: Real-time availability calculation for requested date/timeslot.
- `POST /api/octo/v1/bookings/reservation`: 10-minute temporary seat hold (`native_reservations`).
- `POST /api/octo/v1/bookings/confirmation`: Instant booking activation and voucher generation.
- `POST /api/octo/v1/bookings/cancellation`: Policy-compliant booking cancellation and inventory release.

