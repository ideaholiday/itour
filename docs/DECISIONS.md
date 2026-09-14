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
