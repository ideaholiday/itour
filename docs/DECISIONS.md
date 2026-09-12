# Architecture & Product Decision Records (ADR): Idea Holiday

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
