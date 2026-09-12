# Changelog: Idea Holiday

All notable technical and architectural changes to this project are documented in this file.

---

## [2026-09-11] - Multi-Domain Segregation, Standard OCTo API & ResTech Ingestion
- **Change**: 
  1. Multi-Domain Routing & Authentication: Segregated `ideaholiday.in` (traveler consumer marketplace), `supply.ideaholiday.in` (supplier reservation extranet & dedicated login), and `admin.ideaholiday.in` (platform administration & dedicated login) with role enforcement on login.
  2. Standard OCTo API Server: Implemented standard OCTo v1 specification at `/api/octo` and `/octo` (`/capabilities`, `/suppliers`, `/products`, `/availability`, `/bookings/reservation`, `/bookings/confirmation`, `/bookings/cancellation`).
  3. Multi-Channel ResTech Ingestion: Implemented channel connection manager and remote product import for Bókun, FareHarbor, Bookingkit, Palisis/TourCMS, Activitar, Anchor, and generic OCTo endpoints, mapping external references to `reservation_external_references`.
- **Reason**: Empower suppliers to manage real-time inventory and import products from existing booking channels, while isolating supplier extranet and admin operations onto dedicated subdomains.
- **Affected Components**: `backend/migrations/020_supplier_channel_connections.sql`, `backend/src/routes/octo.js`, `backend/src/services/octoService.js`, `backend/src/services/channelManagerService.js`, `backend/src/services/channels/channelRegistry.js`, `backend/src/routes/supplierChannels.js`, `backend/src/routes/auth.js`, `frontend/src/lib/domainContext.js`, `frontend/src/pages/SupplierLoginPage.jsx`, `frontend/src/pages/AdminLoginPage.jsx`, `frontend/src/pages/supplier/SupplierChannelManagerPage.jsx`, `frontend/src/App.jsx`.
- **Migration Requirements**: Applied migration `020_supplier_channel_connections.sql`.

---

## [2026-09-08] - Meta WhatsApp Cloud API Linking & Template Delivery Fixes
- **Change**: Subscribed Meta App ID `1488217219329539` ("Idea Holiday Pvt Ltd") to WABA `794585599913804`, added `WHATSAPP_APP_ID` to `backend/.env`, and updated the Operations notification test endpoint to dispatch approved Meta templates (`idea_holiday_ops_alert`, `hello_world`) rather than plain text.
- **Reason**: Handsets outside the 24-hour customer care window were not receiving free-form test messages due to Meta Cloud API restrictions, and the WABA was previously linked only to an older app ID.
- **Affected Components**: `backend/.env`, `backend/src/services/whatsappService.js`, `backend/src/routes/ops.js`, `backend/src/validators/apiSchemas.js`.
- **Migration Requirements**: None.

---

## [2026-09-07] - 5-Product-Types Marketplace Architecture & Rebuilt Booking Panels
- **Change**: Implemented additive 5-product-types architecture supporting `TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, and `EXPERIENCE`. Rebuilt `ActivityDetail.jsx` with specialized booking panels for each product type, added search category tabs and recent searches, and updated checkout with type-aware summaries.
- **Reason**: Enable dedicated booking UX and pricing models for attractions (passenger age tiers), private/shared transfers (vehicle options), shared day tours (SIC hubs), and holiday packages (hotel accommodation tiers) without monolithic schema changes.
- **Affected Components**: `backend/migrations/017_five_product_types.sql`, `backend/src/routes/activities.js`, `frontend/src/pages/ActivityDetail.jsx`, `frontend/src/pages/Search.jsx`, `frontend/src/pages/Checkout.jsx`.
- **Migration Requirements**: Applied migration `017_five_product_types.sql`.

---

## [2026-09-06] - Native Seat Reservations & Hold System (Phase 1)
- **Change**: Added native inventory models (`native_inventory_rules`, `native_availability_slots`, `native_reservations`, `native_reservation_outbox`, `reservation_external_references`), 10-minute temporary checkout holds, and instant QR voucher dispatches.
- **Reason**: Prevented race conditions and double-booking on high-demand tours while supporting instant confirmation vs. supplier request routing.
- **Affected Components**: `backend/migrations/017_native_reservations.sql`, `018_native_reservation_delivery.sql`, `019_native_hold_pricing.sql`, `backend/src/services/nativeInventoryService.js`, `backend/src/services/reservationProviders.js`, `backend/src/services/reservationOutboxService.js`, `backend/src/routes/availability.js`.
- **Migration Requirements**: Applied migrations `017_native_reservations.sql`, `018_native_reservation_delivery.sql`, and `019_native_hold_pricing.sql`.

---

## [2026-09-01] - Multi-Day Circuit Planner & Grouped Order Checkout
- **Change**: Introduced `circuit_quotes`, parent `circuit_orders`, grouped payment reconciliation, and atomic multi-supplier rollback.
- **Reason**: Enabled travelers to plan custom multi-city itineraries and pay via a single Cashfree/Razorpay charge with atomic confirmation guarantees.
- **Affected Components**: `backend/migrations/009_circuit_quotes.sql` - `013_circuit_post_change_orchestration.sql`, `backend/src/services/circuitOrderService.js`, `frontend/src/pages/CircuitPlanner.jsx`, `frontend/src/pages/CircuitCheckout.jsx`.
- **Migration Requirements**: Applied circuit order migrations.

---

## [2026-08-24] - Product-Scoped Pickup Validation & Mappls Autocomplete
- **Change**: Implemented `canonical_locations` and `product_location_rules` with radius, polygon, airport, and station checks at quote and booking time.
- **Reason**: Eliminated invalid booking pickups outside supplier operational zones and provided actionable location suggestions to travelers.
- **Affected Components**: `backend/migrations/014_product_location_validation.sql`, `backend/src/services/locationValidationService.js`, `backend/src/routes/activities.js`.
- **Migration Requirements**: Migration `014_product_location_validation.sql` and startup backfill.

---

## [2026-08-15] - Dual Database Architecture & Versioned Migrations
- **Change**: Abstracted database layer supporting SQLite (WAL mode) for local development and Supabase PostgreSQL (PostGIS) for production, managed by `scripts/migrate.js`.
- **Reason**: Zero-dependency local developer quickstart and high-speed unit testing combined with production-grade cloud spatial querying.
- **Affected Components**: `backend/src/db.js`, `backend/src/postgresSyncDb.js`, `backend/scripts/migrate.js`.
- **Migration Requirements**: Created `_schema_migrations` ledger.
