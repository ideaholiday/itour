# Project Goals: Idea Holiday

## Strategic Mission
Transform **Idea Holiday** into a real-time reservation platform like **Viator**, prioritizing **non-tech and manual/offline suppliers first** before adding external API connections (like Bókun or FareHarbor).

---

## Core Objective (Phase 1)
Build and operate a digital **Supplier Portal (Extranet) & Automated Reservation Engine** to transition manual/offline tour suppliers and fleet vendors into an automated, real-time online reservation system.

### Key Pillars of Phase 1:
1. **Supplier Extranet**: An intuitive, frictionless dashboard for direct suppliers to create listings, set departure schedules, define real-time seat capacities per slot, set booking cut-off rules, and manage blackout dates.
2. **Automated Inventory Engine**: Automatically deduct capacity upon successful payment, handle 10-minute temporary holds during checkout, and enforce cut-off times without requiring manual supplier intervention.
3. **Real-Time User Booking**: Travelers see live seat vacancies on the frontend, select departures, and receive instant booking confirmations with QR codes.
4. **Scalable Architecture (OCTo-Ready)**: Design database schemas and reservation business logic using **OCTo (Open Connectivity for Tourism)** standards so external ResTech APIs (Bókun, FareHarbor) can be plugged in seamlessly during Phase 2.
5. **5 Product Types Architecture**: Support 5 operational product types (`TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, `EXPERIENCE`) with specialized ticket tiers, vehicle options, SIC hubs, and hotel packages.

---

## Detailed Goal Breakdown

### 1. Phase 1 Action Plan Goals
- **Step 1: Simplify the Supplier Onboarding Dashboard**:
  - *Digital Inventory Builder*: Let suppliers define operating weekdays, departure time slots (e.g., 9:00 AM, 2:00 PM), maximum seats per slot, and pricing tiers (Adult, Child).
  - *Automated Rules Engine*: Allow suppliers to configure automated cut-off rules (`cutoff_minutes`, e.g., "stop accepting bookings 2 hours before departure") and custom cancellation windows.
- **Step 2: Build the Real-Time Reservation Engine**:
  - *Dynamic Seat Allocation*: Atomically deduct available inventory the instant a user completes payment.
  - *10-Minute Cart Lock*: Temporarily reserve seats when a user enters the checkout flow to prevent double-booking. Automatically release inventory if payment fails or times out.
  - *Instant Confirmation*: Issue automated digital vouchers/tickets with QR codes to users and notify suppliers via instant WhatsApp, SMS, and Email notifications.
- **Step 3: Database Foundation (API-Ready)**:
  - Build native database schema with standard fields matching the OCTo format (e.g., `productId`, `optionId`, `availabilityId`, `availability_slot`, `capacity`, `unitItems`).
  - Ensure that Phase 2 connections to Bókun or FareHarbor require zero database overhaul.

### 2. Business & Marketplace Goals
- **Empower Offline Suppliers**: Enable non-technical vendors who currently operate via WhatsApp/phone to run digitized, bookable operations.
- **5 Operational Models**: Support transfers, day sightseeing tours, multi-day packages, attraction tickets, and experiential activities under a unified marketplace.
- **Fair Marketplace Economics**: Protect platform profitability via configurable platform commission (default 18.0%).
- **Automated Finance**: Freeze payable amounts and platform commissions on booking creation, with an audit trail transitioning through `SCHEDULED → BATCHED → PROCESSED → RECONCILED`.

### 3. Technical & Reliability Goals
- **Dual-Engine Persistence**: Maintain SQLite WAL mode for fast local development and CI test execution, with Supabase PostgreSQL for cloud production.
- **Strict Testing Gates**: Enforce >70% line and function test coverage (currently ~87% lines) across 266 unit tests in 9 suites plus 14 HTTP integration tests.
- **Security & PII Hygiene**: Redact sensitive data from logs, isolate pickup OTPs using SHA-256 verification hashes and AES-GCM encryption.

---

## Goal Prioritization Matrix

### MUST HAVE (Phase 1 Core Deliverables)
1. **Supplier Extranet Inventory Builder**: Intuitive UI to configure operating days, departure slots, seat capacity, adult/child prices, cut-off minutes, and blackout dates.
2. **10-Minute Cart Lock (`native_reservations`)**: Temporary reservation holds during checkout with automatic expiration and release.
3. **Dynamic Seat Allocation**: Atomic capacity deduction upon verified payment; capacity = configured max - confirmed seats - active holds.
4. **Automated Cut-Off Enforcement**: Immediate rejection of booking requests past supplier-configured cut-off times.
5. **Instant QR Digital Vouchers**: Generation of verifiable digital vouchers with QR codes linking to secure booking details.
6. **Automated Real-Time Notifications**: Meta WhatsApp Cloud API template dispatches, SES/Brevo emails, and Twilio SMS.
7. **OCTo-Aligned Schema Foundation**: Schema fields structured to OCTo standards (`native_inventory_rules`, `native_availability_slots`, `native_reservations`, `native_reservation_outbox`, `reservation_external_references`).
8. **5 Product Types Modeling**: Additive tables for ticket tiers, vehicle options, SIC hubs, hotel tiers, and itinerary items.

### SHOULD HAVE (High Operational Priority)
1. **Pickup OTP Security Lifecycle**: 6-digit cryptographic handshake verified at physical pickup before trip commencement.
2. **Grouped Circuit Orders**: Single parent checkout that atomically confirms child bookings across multiple suppliers.
3. **Supplier 24-Hour SLA Escalation**: Automated timer escalation for non-instant/custom request bookings.
4. **Automated Pre-Trip Reminders**: 24h pre-trip WhatsApp/email alerts with driver details.

### NICE TO HAVE (Phase 2 Roadmap)
1. **Bókun & FareHarbor External Adapters**: Plug-in ResTech connectors implementing the OCTo provider boundary (`reservationProviders.js`).
2. **Chauffeur Mobile PWA**: Dedicated mobile web app for roster drivers to scan passenger QR codes and input OTPs.
3. **Mappls Turn-by-Turn Telemetry**: Real-time driver GPS tracking.

### NOT A GOAL (Explicit Non-Goals)
1. **Live Airline GDS Integration**: No flight ticket sales or Amadeus/Sabre connections.
2. **Standalone Hotel Room Brokerage**: Hotels are sold strictly as packaged components within multi-day tours.
3. **Foreign Currency Payouts**: All supplier disbursements and transactions are in Indian Rupees (INR).
4. **Self-Drive Vehicle Rentals**: Rentals are exclusively commercial vehicles with licensed chauffeurs.
