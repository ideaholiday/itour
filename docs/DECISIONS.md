# Architecture & Product Decision Records (ADR): Idea Holiday

> **Summary:** Architecture and owner decisions (ADRs) with their reasons. Do not overturn without an explicit request.
> **Read when:** you wonder why something is built this way, or the owner makes a new decision (add an ADR, rule R8).

This document records significant technical and product architectural decisions.
**Rule for AI Agents**: Do NOT repeatedly revisit or overturn established decisions without an explicit user requirement.

---

## ADR 001: Dual-Engine Database Architecture (SQLite + Supabase PostgreSQL)
- **Date**: 2026-08-10
- **Context**: The platform requires frictionless zero-config local development and blazing-fast in-memory/file testing without running Docker or cloud services, while production requires PostGIS spatial indexing, connection pooling, and multi-region durability on Google Cloud Run.
- **Options Considered**:
  1. PostgreSQL only (requires local Docker daemon for all tests and developers).
  2. SQLite only (lacks native cloud clustering and native PostGIS spatial functions).
  3. Abstracted Dual-Engine Layer (SQLite for local dev/CI + PostgreSQL for production).
- **Decision Made**: Adopted Option 3.
- **Reason**: Enables `node:test` suites to execute 250+ tests in under 4 seconds locally without network dependencies, while allowing Cloud Run to leverage managed Supabase PostgreSQL with PostGIS in production.
- **Consequences**: Database queries must avoid PostgreSQL-only or SQLite-only non-standard syntax unless wrapped in engine checks. Versioned migrations must provide cross-compatible SQL.

---

## ADR 002: Backend Owns Price, Tax, and State (Zero Client Trust)
- **Date**: 2026-08-15
- **Context**: Travel marketplaces are vulnerable to client-side price manipulation attacks where users modify JavaScript totals in checkout before submitting payment.
- **Options Considered**:
  1. Trust frontend total if verified against simple listing base price.
  2. Compute canonical price strictly on the backend at quote time and verify upon payment.
- **Decision Made**: Adopted Option 2.
- **Reason**: Prevents tampering with interstate permit taxes, FASTag tolls, seat quantities, and GST rates.
- **Consequences**: Checkout must request a canonical quote from the backend; browser-supplied totals are rejected.

---

## ADR 003: Pickup OTP Cryptographic Isolation
- **Date**: 2026-08-20
- **Context**: Handing over pickup codes to drivers or staff in advance creates risks of drivers marking trips started without passenger presence or unauthorized pickups.
- **Options Considered**:
  1. Store OTP in plaintext in `bookings` table.
  2. Store SHA-256 hash for verification and AES-GCM encrypted cipher for traveler retrieval.
- **Decision Made**: Adopted Option 2.
- **Reason**: Guarantees that neither database administrators, ground staff, nor drivers can see the code in advance. Only the traveler can reveal the code after inspecting the driver and vehicle plate.
- **Consequences**: Requires AES-GCM encryption helper using `JWT_SECRET`; verification queries compare input hash in constant time.

---

## ADR 004: Native 10-Minute Reservation Holds
- **Date**: 2026-08-25
- **Context**: High-demand tours and airport transfers suffer from race conditions where two travelers pay for the same vehicle or seat simultaneously.
- **Options Considered**:
  1. Optimistic locking without holds (causes payment refunds when booking fails after capture).
  2. 10-minute temporary reservation holds (`native_reservations`).
- **Decision Made**: Adopted Option 2.
- **Reason**: Guarantees seat availability while the traveler completes OTP authentication or 3D-Secure card authorization, eliminating unexpected post-payment booking failures.
- **Consequences**: Expired holds must be released automatically; queries for available seats must deduct active holds (`native_reservations`).

---

## ADR 005: Grouped Circuit Ordering & Atomic All-or-Nothing Confirmation
- **Date**: 2026-09-01
- **Context**: Multi-day itineraries (e.g. Golden Triangle: Delhi → Agra → Jaipur) involve multiple independent fleet suppliers. If one stop fails to confirm, a traveler is left stranded midway through their trip.
- **Options Considered**:
  1. Separate independent bookings with separate payments for each stop.
  2. Single parent `circuit_order` confirming child bookings atomically.
- **Decision Made**: Adopted Option 2.
- **Reason**: Provides a unified checkout experience and ensures that any inventory failure triggers an immediate rollback across all child lines, protecting traveler itinerary integrity.
- **Consequences**: Circuit orders require parent-level payment verification and grouped refund logic.

---

## ADR 006: Meta WhatsApp Cloud API Template Enforcement
- **Date**: 2026-09-06
- **Context**: Meta enforces strict messaging policies. Outside the 24-hour customer service window, free-form text messages are dropped or rejected.
- **Options Considered**:
  1. Attempt free-form text delivery with silent failure.
  2. Enforce pre-approved Meta message templates for all outbound transactional dispatches.
- **Decision Made**: Adopted Option 2.
- **Reason**: Ensures guaranteed delivery to user handsets regardless of whether an inbound message was sent recently.
- **Consequences**: All transactional notifications must map their payload variables into registered Meta template parameter sequences.

---

## ADR 007: 5-Product-Types Architecture and Additive Catalog Modeling
- **Date**: 2026-09-07
- **Context**: Expanding from initial tours and transfers into attraction tickets and experiential activities requires distinct pricing entities (e.g. passenger age tiers, vehicle classifications, SIC shared hubs, hotel categories). Dropping or restructuring existing product tables would risk breaking live bookings.
- **Options Considered**:
  1. Monolithic schema rewrite with unified pricing table.
  2. Additive polymorphic tables: `product_ticket_tiers`, `product_vehicle_options`, `product_sic_hubs`, `product_hotel_tiers`, `product_itinerary_items` keyed to `products(id)`.
- **Decision Made**: Adopted Option 2.
- **Reason**: Allows specialized booking widgets per product type while maintaining 100% backward compatibility for all existing transfer and tour listings without data migrations or downtime.
- **Consequences**: Frontend renders type-aware booking panels; backend quote calculators query respective tier/option tables.

---

## ADR 008: Supplier Profiles Are Free to Index; the Verified Badge Is Never Sold
- **Date**: 2026-09-13
- **Context**: Every registered supplier needs Google discoverability, while travelers must be able to trust the Verified badge and bookings must stay on-platform.
- **Decision Made**:
  - Profiles are public for all registered suppliers and become indexable once the **free KYB is `APPROVED`** (noindex before). Indexing is never gated on payment.
  - Profiles show no phone or WhatsApp; travelers use the on-platform **Enquire** flow.
  - Payment restricts the **profile only**: a supplier's products are hidden on its profile unless paid (Spotlight). Marketplace search and booking are unchanged for KYB-approved suppliers.
  - The Verified badge is **never sold**. Payment buys a yearly check; the badge is granted only if checks pass, with a full refund if rejected.
  - Planned prices (all + GST): Free; Verified ₹999/yr; Spotlight ₹2,999 one-time **per product** (locked to the product, 1 swap/yr); Verified Plus ₹3,499 first year including 1 Spotlight, renewing at ₹999. Optional: 3-pack ₹6,999, founding offer ₹499. Razorpay one-time orders with renewal reminders. The GST invoice SAC code needs CA confirmation.
- **Consequences**: Profiles, SEO, the admin-granted badge and enquiries have shipped (rules in `BUSINESS_RULES.md` §12). The share kit, then paid plans, follow per `ROADMAP.md`. Do not re-litigate these choices.

---

## ADR 009: KYB Gates Bookability; Cashfree-Verified GSTIN + PAN Auto-Approves
- **Date**: 2026-09-13
- **Context**: Verified suppliers should sell immediately without waiting for manual review, but admins must never approve on placeholder or missing data.
- **Decision Made**:
  - A product is bookable only when its supplier's KYB is `APPROVED` **and** the product is `PUBLISHED`. Approving KYB makes all of that supplier's published products bookable; suspending or rejecting KYB takes them all off sale.
  - When Cashfree SecureID has verified **both** GSTIN and PAN, the supplier is set to KYB `APPROVED` (and `is_verified`) automatically, with no admin click.
  - Admins see the real KYB: no placeholder documents or numbers, every uploaded document is viewable, and manual approval is blocked while required documents (transport license, PAN) are missing. KYB files are never publicly reachable.
- **Consequences**: KYB approval is separate from the yearly Verified badge (ADR 008). Auto-approval must never grant the badge.

---

## ADR 010: Production Takes Real Cashfree Payments
- **Date**: 2026-09-14
- **Context**: Production ran the Cashfree payment gateway on sandbox keys, so checkout collected no real money. SecureID was already live but failed every call because its signing key never reached the container.
- **Decision Made**:
  - Production (`ideaholiday.in`) runs Cashfree PG with `CASHFREE_ENV=PROD` and real payments.
  - Live Cashfree credentials (PG App ID, PG secret, SecureID public key) come only from Secret Manager. `deploy.sh` never reads them, or `CASHFREE_ENV`, from a local `backend/.env`.
  - Live traffic (Cloud Run or `NODE_ENV=production`) never simulates money or identity: no simulated supplier payout UTR, no simulated SecureID result.
- **Consequences**: A failed automated supplier transfer surfaces as an error; ops pay manually and record the bank UTR. Sandbox testing belongs on local or staging, not on production.

---

## ADR 011: Admins Manage Staff in the Admin Panel
- **Date**: 2026-09-14
- **Context**: Staff could only be created by editing the database, so there was no way to add a person, fix a staff member's WhatsApp number (alerts to one were failing as undeliverable), or revoke access. Staff who signed in at the admin portal landed on a page that denied them.
- **Decision Made**:
  - Admin → Team lists `ADMIN` and `STAFF` users and lets an `ADMIN` add, edit, reset the password of, and remove them. Only `ADMIN` has this.
  - Every member needs a WhatsApp-deliverable number, stored as `+<country><number>`, because all team members receive alerts.
  - A new person gets a temporary password shown to the admin once; there is no emailed invite. An existing traveler account is promoted and keeps its password. Supplier accounts cannot be given team roles.
  - Removing someone sets their role to `TRAVELER` rather than deleting the user, so their history stays. Nobody can remove or demote themselves, and the last administrator always remains.
  - `STAFF` sign in at the admin portal and land in Operations (`/ops`); the admin panel stays `ADMIN`-only.
- **Consequences**: Per-person alert preferences and self-service password change are not part of this; ask an admin to reset a password.

---

## ADR 012: Live Driver GPS, Web First
- **Date**: 2026-09-14
- **Context**: The ops map showed invented driver positions. Owners want real driver and trip tracking from the driver's phone.
- **Decision Made**:
  - **Web first.** Drivers share location from the private trip page in the phone browser. An Android app (Phase 3) is built only if web gaps (locked screen, switching to Maps) prove to be a problem.
  - **Sharing is mandatory.** A driver can't go "On the way", arrive or start the trip without a recent position from their own phone. Operations and suppliers can still move a trip for a driver who can't share.
  - **Visibility.** Operations, the booking's supplier and the traveler can see the driver's location for the whole trip.
  - **Retention.** Positions are deleted after 30 days.
  - Maps never show invented positions; a trip without a reported position is marked as having none.
- **Consequences**: Phase 1 (sharing, storage, ops and supplier views) shipped first; the traveler tracking link and alerts are Phase 2. Web tracking pauses when the page is not on screen.

---

## ADR 013: Traveler Tracking Link and Missed-Pickup Alerts
- **Date**: 2026-09-14
- **Context**: Phase 2 of ADR 012: travelers follow their driver, and operations hear about a likely missed pickup before it happens.
- **Decision Made**:
  - The traveler opens tracking from a signed link (booking-bound, 7 days) in the "driver on the way" and "trip started" messages, or from My Trips when signed in. No sign-in is required for the link.
  - The ETA shown to travelers comes from Mappls driving time with live traffic (`ETA_PROVIDER=mappls`), cached for a minute per route; if Mappls fails, a local estimate is shown and marked as estimated.
  - Missed-pickup alerts use only the local estimate, so the scheduler never spends paid routing calls.
- **Consequences**: A trip without pickup coordinates gets no ETA, running-late or arrival prompt; it still gets not-on-the-way, signal-lost and not-moving alerts.

---

## ADR 014: Driver Android App as a Thin Shell
- **Date**: 2026-09-14
- **Context**: Browser GPS stops when the driver locks the phone or switches to Maps (ADR 012). Owners approved an Android app.
- **Decision Made**:
  - A small native Kotlin app (`in.ideaholiday.driver`) shows the existing driver trip page in a WebView; there is no second driver UI.
  - A foreground service of type `location` sends positions to the same `/api/driver-trips/location` endpoint, using Android's own location providers (no Google Play services, so phones without them work). It needs only "while using the app" permission, never background location, and shows an ongoing notification.
  - The page detects the app bridge and hands sharing to the service; in a browser it works as before.
  - Trip links open the app through Android App Links once `ANDROID_DRIVER_APP_SHA256` is set.
  - Target the SDK level Google Play requires (API 36 from 31 Aug 2026), minimum Android 8 (API 26).
- **Consequences**: The app is built with Gradle outside `npm run check`. iPhone drivers keep the web page. Some Android makers still stop background services under aggressive battery settings; drivers may need to exempt the app.

---

## ADR 015: Ola Maps for Maps, Places and ETA; Fares Keep the Formula
- **Date**: 2026-09-14
- **Context**: OpenStreetMap blocked our map tiles (the site sent no Referer), and its public tile and search servers are not meant for production traffic. Owners chose Ola Maps as the India location provider.
- **Decision Made**:
  - Ola Maps serves base-map tiles, address autocomplete, place details, geocoding, reverse geocoding and traveler tracking ETA (supersedes the Mappls ETA in ADR 013).
  - The server authenticates with OAuth client credentials; tiles are proxied through `/api/maps/tiles` so no Ola credential is in the browser bundle.
  - **Transfer fares keep the straight-line × 1.25 distance formula.** Ola road distance is not used for pricing, so no fares change.
  - Without Ola credentials the app falls back to OpenStreetMap tiles, OSM place search and estimated ETAs; Mappls stays selectable.
  - Pages send `Referrer-Policy: strict-origin-when-cross-origin` so third-party map servers see only our origin.
- **Consequences**: Tile traffic passes through Cloud Run (browser-cached for a day). Transfer search still shows the pricing distance, which can differ from the real road distance.

---

## ADR 016: Cloud Run Runs in Tokyo, Next to the Database
- **Date**: 2026-09-14
- **Context**: The API ran in `us-central1` while the Supabase database is in `ap-northeast-1` (Tokyo) and travelers and Ola Maps are in India. Every request crossed the Pacific, and each database read crossed it again. Owners asked for a faster site with **no increase in running cost**: no load balancer, Redis or always-on instances.
- **Decision Made**:
  - The Cloud Run service `idea-holiday-marketplace` moves to `asia-northeast1` (Tokyo): the same Tier 1 price as `us-central1`, next to the database, and it supports Cloud Run domain mappings, so DNS at GoDaddy is unchanged.
  - `asia-south1` (Mumbai) was rejected: it does not support domain mappings (would need a paid load balancer) and every database read would still go to Tokyo.
  - `ideaholiday.in`, `supply.ideaholiday.in` and `admin.ideaholiday.in` are remapped to the Tokyo service; Cloud Scheduler jobs keep their `us-central1` location and call the Tokyo URL.
  - The `us-central1` service is left idle (scales to zero, no cost) as a fallback until the move is confirmed, then deleted. Container images stay in the `us-central1` Artifact Registry.
  - `--min-instances` stays at 0 (no always-on cost), so the first request after idle still waits for a cold start.
- **Consequences**: Remapping domains reissues their managed certificates, with brief HTTPS errors during the switch. India to Tokyo is about 0.1 s each way; database reads become local.

