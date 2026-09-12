# Project Roadmap: Idea Holiday Real-Time Reservation Platform

> **CRITICAL RULE FOR AI AGENTS**:
> Agents must **ONLY** work on tasks in the **NOW** section or tasks explicitly requested by the user.
> Do **NOT** implement items in **NEXT** or **LATER** without explicit authorization.

---

## 1. NOW (Phase 1: Native Reservation Engine & Supplier Extranet)

The primary goal of Phase 1 is to **digitize manual/offline tour suppliers and fleet operators into an automated real-time online reservation system like Viator**.

### Active Phase 1 Deliverables:
1. **Supplier Extranet Dashboard**:
   - Frictionless inventory management under **Supplier dashboard → Listings → Seats and schedule** (`SupplierInventoryEditor.jsx`).
   - Digital Inventory Builder: Operating weekdays, daily departure time slots (e.g., `09:00 AM`, `02:00 PM`), and maximum seat quotas per slot.
   - Tiered Pricing: Dedicated Adult and Child unit pricing in INR.
   - Automated Rules Engine: Booking cut-off rules in minutes (e.g. stop sales 2h before departure), free-cancellation deadline in hours, and blackout calendars.
2. **Automated Real-Time Reservation Engine**:
   - Dynamic Seat Allocation: Instant seat capacity deduction upon verified payment; capacity = max seats - confirmed seats - active holds.
   - 10-Minute Cart Lock (`native_reservations`): Temporary seat reservation holds during checkout to eliminate double-booking, with automatic expiration and release.
   - Instant Digital Confirmation: Instant voucher generation with verifiable QR codes linking to booking details.
3. **Automated Real-Time Notifications**:
   - Meta WhatsApp Cloud API (App ID `1488217219329539`) template messaging for booking vouchers and driver dispatches.
   - Amazon SES v2 / Brevo transactional emails with signed document URLs.
   - Twilio SMS for urgent supplier assignment alerts.
4. **OCTo Data Foundation (API-Ready)**:
   - Database tables matching OCTo standard fields (`native_inventory_rules`, `native_availability_slots`, `native_reservations`, `native_reservation_outbox`, `reservation_external_references`).
   - Abstracted provider boundary in `reservationProviders.js` running the `NATIVE` provider.
5. **5 Product Types Marketplace Architecture**:
   - Frontend and backend models supporting `TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, and `EXPERIENCE`.
   - Dedicated booking widgets and panels for ticket tiers, vehicle categories, SIC hubs, and hotel packages.
6. **Marketplace Ground Operations**:
   - Location & geo-fencing transfer engine with PostGIS polygon zones.
   - Pickup OTP vault security (SHA-256 verify hash, AES-GCM encrypted secret, 5-attempt lockout).
   - Grouped circuit itinerary checkout with atomic multi-supplier confirmation.

---

## 2. PHASE 2 (Connected ResTech & Channel Management - COMPLETED)
- [x] **OCTo Specification Compliance**: Standard endpoints at `/api/octo` and `/octo` (`capabilities`, `suppliers`, `products`, `availability`, `bookings/reservation`, `bookings/confirmation`, `bookings/cancellation`).
- [x] **Multi-Domain Ecosystem**: Subdomain separation for `ideaholiday.in`, `supply.ideaholiday.in`, and `admin.ideaholiday.in` with role-governed logins.
- [x] **Multi-Channel ResTech Connectors**:
  - Bókun Channel Connector (Tripadvisor)
  - FareHarbor API Connector (Booking Holdings)
  - Bookingkit Connector
  - Palisis Group / TourCMS Connector
  - Activitar Safari & Adventure Connector
  - Anchor Ticketing & Transit Connector
  - Generic OCTo Inbound / Outbound Endpoint
- [x] **Supplier Product Import & External Reference Mapping**: Remote product preview, 1-click import into Idea Holiday catalog, and mapping into `reservation_external_references`.

---

## 3. NEXT (Future Operations Enhancements)
1. **Chauffeur Companion Mobile PWA**:
   - Dedicated mobile web app for drivers to view passenger manifests, scan voucher QR codes, and validate 6-digit pickup OTPs.
2. **Dynamic Proximity Driver Dispatch**:
   - Automated driver allocation based on real-time vehicle GPS proximity and driver ratings.

---

## 4. LATER (Future Horizons - DO NOT Implement)
- **Multi-Currency Display**:
  - Real-time conversion display in USD, EUR, GBP, and AED (checkout remains in INR).
- **B2B Sub-Agent Portal**:
  - Whitelabel agency vouchers, sub-agent credit lines, and corporate invoice generation.
- **Hotel Channel Manager Connector**:
  - Direct integration with hotel CRS/PMS systems for real-time room availability in multi-day holiday packages.

---

## 4. COMPLETED (Historical Milestones)
- [x] **Meta WhatsApp Cloud API Connection**: Subscribed App ID `1488217219329539` to WABA `794585599913804`, added CLI test tool, and configured verified templates (`idea_holiday_ops_alert`, `hello_world`, `idea_holiday_driver_details`).
- [x] **Native Seat Reservations Phase 1 Backend**: Migrations `017_native_reservations.sql`, `018_native_reservation_delivery.sql`, and `019_native_hold_pricing.sql` applied with 10-minute holds.
- [x] **Supplier Extranet Inventory Editor**: Frontend UI for configuring departure slots, seat capacity, cut-off minutes, and blackout dates (`SupplierInventoryEditor.jsx`).
- [x] **5 Product Types Architecture**: Implemented `TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, and `EXPERIENCE` with tables `product_ticket_tiers`, `product_vehicle_options`, `product_sic_hubs`, `product_hotel_tiers`, `product_itinerary_items` (`017_five_product_types.sql`).
- [x] **Dual Database Engine**: Synchronous SQLite WAL mode for local dev/testing + Supabase PostgreSQL for cloud production.
- [x] **Pickup OTP Vault**: Cryptographic 6-digit OTP generation, verification hashing (SHA-256), and AES-GCM encryption with 5-attempt lockout.
- [x] **Payment Gateways**: Dual Cashfree and Razorpay integrations with verified webhook listeners.
- [x] **Circuit Planner & Grouped Orders**: Repricing engine (`circuit_quotes`), atomic child booking confirmation, and grouped payment order flow.
