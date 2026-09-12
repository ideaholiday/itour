# Project Scope: Idea Holiday Real-Time Reservation Platform

## IN SCOPE (Phase 1: Native Reservation Engine & Supplier Extranet)
AI agents, developers, and team members are authorized to work on and maintain the following Phase 1 functional areas:

### 1. Supplier Extranet & Digital Inventory Builder
- **Extranet Interface**: Extranet screens under **Supplier dashboard → Listings → Seats and schedule** (`SupplierInventoryEditor.jsx`).
- **Schedule Management**: Setting operating weekdays (Monday to Sunday) and specific daily departure times (e.g., `09:00 AM`, `02:00 PM`).
- **Capacity & Tiered Pricing**: Setting maximum seat capacity per departure slot and adult/child unit pricing.
- **Automated Rules Engine**:
  - Setting cut-off rules in minutes (`cutoff_minutes`, e.g., stop bookings 2 hours / 120 minutes before departure).
  - Setting free-cancellation deadlines in hours (`cancellation_hours`).
  - Adding and managing blackout dates without affecting pre-existing confirmed bookings.

### 2. Real-Time Reservation & Inventory Engine
- **Live Vacancy Polling**: Frontend real-time availability polling (uncached every 15s) via `GET /api/availability/native/:productId`.
- **10-Minute Cart Lock**: Temporary seat reservation holds (`native_reservations`) created upon checkout entry (`POST /api/availability/native/hold`).
- **Dynamic Seat Allocation**: Atomic capacity deduction upon verified payment; capacity = configured max - confirmed seats - active holds.
- **Automatic Hold Release**: Automatic release of held inventory when payment fails, expires (>10 min), or the user cancels.
- **Instant Digital Confirmation**: Issuing digital vouchers with verifiable QR codes and generating instant WhatsApp, Email, and SMS alerts.

### 3. Scalable OCTo Data Foundation
- Maintaining database schemas matching the **OCTo (Open Connectivity for Tourism)** specification:
  - Tables: `native_inventory_rules`, `native_availability_slots`, `native_reservations`, `native_reservation_outbox`, `reservation_external_references`.
  - Service boundary: `reservationProviders.js` with `NATIVE` provider active.

### 4. Marketplace Core & Ground Fulfillment
- Transfer Engine with spatial polygon geo-fencing and ray-casting.
- 5 product models (`TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, `EXPERIENCE`) and supporting tables (`product_ticket_tiers`, `product_vehicle_options`, `product_sic_hubs`, `product_hotel_tiers`, `product_itinerary_items`).
- Cryptographic pickup OTP lifecycle (SHA-256 hash verify, AES-GCM encrypted vault, 5-attempt lockout).
- Multi-day Circuit Planner with atomic grouped payment confirmation.
- Dual payment gateways: Cashfree and Razorpay with webhook signature verification.

---

## OUT OF SCOPE (Phase 2 & Unauthorized Work)
Agents must **NOT** introduce, build, or connect the following items during Phase 1:

1. **Live External ResTech Connections (Phase 2)**:
   - Do **NOT** connect live third-party booking APIs (Bókun, FareHarbor, Rezdy) during Phase 1.
   - The system must use the `NATIVE` provider in `reservationProviders.js`. External ResTech connectors belong strictly to Phase 2.
2. **Airline Flight GDS**: No integration with Amadeus, Sabre, Galileo, or airline ticket distribution.
3. **Standalone Hotel Aggregation**: No hotel bedbank connections (Hotelbeds, WebBeds) or standalone room booking.
4. **Foreign Currency Payouts**: Supplier earnings and marketplace transactions remain exclusively in INR.
5. **Self-Drive Vehicle Rentals**: No self-drive rental services; only commercial chauffeur-driven vehicles.
6. **Unsolicited UI Redesigns**: Do not redesign existing layouts or replace Tailwind CSS with other frameworks.

---

## CURRENT PRIORITIES (Phase 1 Active Work)
1. **Frictionless Supplier Extranet**: Ensure direct tour suppliers can effortlessly configure departure slots, seat quotas, adult/child prices, and cut-off minutes.
2. **Rock-Solid 10-Minute Cart Lock**: Ensure temporary seat holds reliably prevent race conditions and double-booking during concurrent checkouts, and release seats immediately upon abandonment or timeout.
3. **Instant Confirmation & QR Vouchers**: Ensure verified payments instantly produce verifiable QR vouchers and trigger transactional WhatsApp/Email notifications.
4. **Meta WhatsApp Cloud API Compliance**: Maintain approved Meta templates and delivery webhook listeners.

---

## FUTURE (Phase 2 Roadmap - DO NOT Implement Now)
- **Phase 2: External ResTech Channel Connectors**:
  - Implement Bókun and FareHarbor adapters within `reservationProviders.js` utilizing the pre-built OCTo schema foundation.
- **Chauffeur Companion Mobile PWA**:
  - Dedicated mobile web app for drivers to scan passenger QR codes and input OTPs.
- **Dynamic Demand-Based Surge Pricing**:
  - Automated seasonal surge pricing based on festival dates.
