# Project Context: Idea Holiday

## Project Overview
**Idea Holiday** (`ideaholiday.in`, internal code: `viator-india`) is a full-stack, enterprise-grade online reservation marketplace for Indian travel experiences, airport and intercity transfers, day sightseeing tours, and multi-day packaged holiday circuits.

### Core Strategic Direction
The strategic mission of Idea Holiday is to **transform into a real-time reservation platform like Viator**, specifically **prioritizing non-tech, manual, and offline suppliers first** before connecting external ResTech API platforms (such as Bókun or FareHarbor).

- **Phase 1 (Current Core Focus)**: Build and operate a digital **Supplier Extranet Portal & Automated Reservation Engine** to transition manual/offline tour suppliers and fleet operators into an automated, real-time online reservation system.
- **Phase 2 (Future Scalability)**: Plug in external ResTech channel manager APIs (Bókun, FareHarbor, Rezdy) seamlessly via standard **OCTo (Open Connectivity for Tourism)** interfaces without requiring a database or business logic overhaul.

---

## Business Objective & Problem Solved

### The Problem in the Indian Market
1. **Offline / Non-Tech Supplier Fragmentation**: Over 85% of local tour operators, fleet vendors, and activity providers in India operate manually via spreadsheets, phone calls, and chaotic WhatsApp groups with no digital inventory management.
2. **Opaque Pricing & Hidden Extras**: Travelers frequently face unexpected demands for interstate entry permits, state border taxes, toll booth fees, and night driving surcharges.
3. **No Real-Time Seat Availability**: Traditional Indian tour portals operate on delayed inquiry/quote models rather than live seat vacancies and instant confirmations.
4. **Safety & Identity Vulnerability**: Handing over traveler details to third-party drivers without verification leads to scams, wrong vehicle pickups, and safety concerns.
5. **Multi-Stop Itinerary Friction**: Travelers booking multi-city circuits (e.g., Delhi → Agra → Jaipur → Goa) must coordinate across multiple disconnected vendors with zero atomic booking or refund protection.

### The Solution: Idea Holiday Platform
Idea Holiday solves this with:
- **Supplier Extranet (Direct Onboarding)**: A streamlined dashboard where direct suppliers create listings, set departure schedules, define real-time seat capacities per slot, set booking cut-off rules, and manage blackout calendars.
- **Automated Real-Time Reservation Engine**:
  - **Dynamic Seat Allocation**: Immediately deducts capacity when payment succeeds.
  - **10-Minute Cart Lock**: Temporarily holds inventory during checkout to eliminate double-booking; auto-releases inventory if payment fails or expires.
  - **Cut-Off Rules Engine**: Enforces supplier-defined cut-off times (e.g., stop sales 2 hours before departure) automatically.
  - **Instant Digital Confirmation**: Generates QR-coded vouchers and dispatches instant WhatsApp, Email, and SMS notifications to both travelers and suppliers.
- **OCTo-Ready Scalable Architecture**: Database schemas and service interfaces built to match the OCTo specification (`productId`, `optionId`, `availabilityId`, `availability_slot`, `capacity`, `unitItems`), enabling seamless Phase 2 connection to Bókun and FareHarbor.
- **Location & Geo-Fencing Transfer Engine**: PostGIS polygon zones and ray-casting algorithms to match pickup/drop points directly to verified fleet operators.
- **Pickup OTP Security Lifecycle**: Cryptographically secure 6-digit OTP stored in encrypted form, revealed only to travelers, and validated at vehicle pickup before trip activation.
- **Grouped Circuit Planner**: Atomic all-or-nothing confirmation across multi-supplier itineraries with single-transaction checkout.

---

## Target Users & Ecosystem Roles
| Role | Description | Primary Interfaces |
| :--- | :--- | :--- |
| **Traveler** (`TRAVELER`) | Tourists discovering experiences, checking live seat availability, booking instant tours/transfers, and planning custom multi-day circuits. | `/`, `/search`, `/activity/:id`, `/circuit-planner`, `/checkout`, `/circuit-checkout`, `/my-trips`, `/my-reviews` |
| **Supplier** (`SUPPLIER`) | Local tour operators, taxi fleet owners, and DMCs managing digital extranet listings, departure schedules, seat capacity, blackout dates, and driver rosters. | `/supplier/dashboard`, `/supplier/listings`, `/supplier/builder`, `/supplier/transfer-builder`, `/supplier/bookings`, `/supplier/coverage` |
| **Ground Operations** (`STAFF`) | Operations team monitoring driver dispatch, managing fallback reallocations, resolving SLA timeouts, resetting locked OTPs, and auditing notifications. | `/ops`, `/ops/circuits`, `/ops/notifications`, `/ops/live-trip-board`, `/ops/support` |
| **Platform Administrator** (`ADMIN`) | Executive administrators reviewing KYB compliance, approving listings, managing platform commissions, processing finance settlements, and moderating reviews. | `/admin`, `/admin/suppliers`, `/admin/products`, `/admin/coverage`, `/admin/finance`, `/admin/quality`, `/admin/analytics` |

---

## 5 Core Product Types
The marketplace supports 5 distinct operational product models:
1. **Airport & Intercity Transfers** (`TRANSFER`): Point-to-point and airport transfer routes backed by vehicle options (`product_vehicle_options`), geo-fences, vehicle taxonomies (Sedan, SUV, Premium MUV, Tempo Traveller), toll calculators, and permit rules.
2. **Day Sightseeing Tours** (`DAY_TOUR`): 4h, 8h, or 12h curated city sightseeing itineraries with predefined stop sequences, private vehicle allocation, or Seat-In-Coach (`product_sic_hubs`).
3. **Multi-Day Packaged Holidays** (`MULTI_DAY_PACKAGE`): Fixed-duration holiday packages (e.g., 3N/4D Goa or Golden Triangle) with day-by-day activity timelines (`product_itinerary_items`), vehicle inclusions, and tiered hotel accommodation variants (`product_hotel_tiers`: `Cab Only`, `3-Star`, `4-Star`, `5-Star`).
4. **Attraction Tickets** (`ATTRACTION_TICKET`): Theme parks, monuments, museums, and shows backed by ticket tiers (`product_ticket_tiers`: `Adult`, `Child`, `Senior`, `Infant`) and departure slot capacities.
5. **Experiential Activities** (`EXPERIENCE`): Water sports, cooking classes, scuba diving, hot air ballooning, and outdoor workshops with live slot availability and seat capacity.

---

## Current Project Status
- **Phase 1 & Phase 2 Active**: Core Supplier Extranet, Native Automated Reservation Engine, Multi-Domain Ecosystem (`ideaholiday.in`, `supply.ideaholiday.in`, `admin.ideaholiday.in`), Standard OCTo API (`/api/octo`), and Multi-Channel ResTech Ingestion (Bókun, FareHarbor, Bookingkit, Palisis/TourCMS, Activitar, Anchor, Generic OCTo) deployed and operational.
- **Infrastructure**: Google Cloud Run (Container runtime, 2 GiB RAM / 2 vCPUs) + Supabase PostgreSQL (PostGIS enabled) for production; SQLite (WAL mode) for local zero-config testing and development.
- **Automated Testing**: 283 backend unit tests across 9 suites and isolated HTTP integration tests passing; Playwright E2E browser tests covering extranet setup, live availability selection, held checkout, payment, and QR voucher generation.
- **Notifications**: Live Meta WhatsApp Cloud API (App ID `1488217219329539`), Amazon SES / Brevo transactional emails, and optional Twilio SMS.

---

## Future Vision & Next Steps
- **Chauffeur Companion Mobile PWA**: Progressive Web App for drivers with live GPS telemetry streaming and inline OTP validation.
- **Dynamic Proximity Driver Dispatch**: Automated driver allocation based on real-time vehicle GPS proximity and driver ratings.
- **B2B Sub-Agent Portal**: Sub-agent credit lines, whitelabel agency vouchers, and corporate billing.

---

## Explicitly Out-of-Scope Items
- Live Airline GDS Integration (Amadeus / Sabre / Galileo).
- Standalone Hotel Room Brokerage (unbundled without transport or experience).
- Multi-currency international FX payment settlements (transactions and payouts are anchored in INR).
- Unvetted peer-to-peer private car drivers (only verified commercial suppliers with valid KYB documents).
