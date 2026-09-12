# Business Rules: Idea Holiday Real-Time Reservation Platform

## 1. Native Inventory & Real-Time Seat Allocation Rules

### 1.1 Dynamic Seat Vacancy Formula
For any given product option, date, and departure time slot, available capacity is computed dynamically:
$$\text{Vacancies} = \text{Configured Max Capacity} - \text{Confirmed Seats} - \text{Active Holds}$$
- **Atomic Serialization**: Database transactions serialize capacity checks and mutations on the product/slot row, preventing race conditions when multiple users attempt checkout simultaneously.
- **Seat Occupancy**: Every passenger unit (both Adult and Child) occupies exactly one physical seat against the departure capacity.

### 1.2 10-Minute Cart Lock Rules (`native_reservations`)
1. **Hold Duration**: When a traveler enters checkout, the backend locks the requested seats for exactly **10 minutes** (`utc_expires_at = now() + 10 min`).
2. **Idempotency & Re-entry**: A traveler refreshing or re-entering the checkout flow within the 10-minute window reuses their existing hold and original expiration timer (`request_key` scoped to owner).
3. **Automatic Expiration**: The moment `utc_expires_at < now()`, the hold stops occupying capacity immediately in vacancy calculations, even before the periodic cleanup cron executes.
4. **Failure Release**: An explicit payment cancellation or signed gateway failure webhook immediately releases held inventory back to the bookable pool.
5. **Payment Transition**: Verified payment atomically transitions the hold from `ON_HOLD` to `CONFIRMED` without performing a double-deduction.

### 1.3 Booking Cut-Off Rules Engine
1. **Supplier Cut-Off Configuration**: Suppliers define booking cut-off thresholds in minutes (`cutoff_minutes`, e.g., `120` = 2 hours).
2. **Automatic Sales Close**: If:
   $$\text{Departure Start Time} - \text{Current Time} \le \text{Cut-Off Minutes}$$
   the departure slot is automatically closed for new bookings. The frontend displays the slot as "Booking Closed" or removes it from live availability.

### 1.4 Supplier Extranet Capacity Modification & Blackout Rules
1. **Capacity Reduction Protection**: A supplier cannot reduce a departure slot's maximum capacity below the number of seats already confirmed or actively held.
2. **Blackout Date Isolation**: Adding a blackout date prevents new searches, holds, and bookings on that date. It does **NOT** cancel pre-existing held or confirmed reservations.

---

## 2. Instant Confirmation vs. Manual Acceptance

1. **Native Reservation Options (`INSTANT`)**:
   - Listings configured with departure schedules and seat inventory in `native_inventory_rules` are **instantly confirmed** upon verified payment.
   - They do **NOT** enter the 24-hour manual supplier acceptance queue. Digital QR vouchers and supplier notifications are issued immediately.
2. **On-Demand / Request-Based Options (`REQUEST`)**:
   - Custom charter transfers or un-slotted activities enter a **24-hour supplier acceptance SLA**.
   - If the supplier does not accept within 24 hours, the booking is automatically escalated to Operations for driver fallback reallocation.

---

## 3. Pricing, Taxes & 5 Product Types Fare Modeling

### 3.1 5 Product Types Fare Rules
1. **Attraction Tickets & Experiential Tours (`ATTRACTION`, `EXPERIENCE`)**:
   - Priced per passenger ticket tier (`Adult`, `Child`, `Senior`, `Infant`) defined in `product_ticket_tiers`.
   - Free infant tiers (`is_free = 1`) count towards max group occupancy but add zero fare.
2. **Transfers (`TRANSFER`)**:
   - Point-to-point and airport transfer routes priced by vehicle category (`product_vehicle_options` or dynamic transfer engine):
     $$\text{Total Price} = \max(\text{Base Fare}, \text{Calculated KM} \times \text{Per-KM Rate}) + \text{Tolls} + \text{Interstate Permit} + \text{GST (5\%)}$$
     Where $\text{Calculated KM} = \text{Haversine Distance} \times 1.25$.
3. **Day Sightseeing Tours (`TOUR`)**:
   - Private tours priced per vehicle category (`SEDAN`, `SUV`, `TEMPO`).
   - Shared tours (SIC) priced per seat from designated `product_sic_hubs`.
4. **Multi-Day Packaged Holidays (`PACKAGE`)**:
   - Tiered hotel packages (`Cab Only`, `3-Star`, `4-Star`, `5-Star`) priced per person per night + base transport fare.

### 3.2 Platform Commission & Supplier Net Earnings
1. **Standard Platform Commission**: **18.0%** (unless overridden by supplier contract or product category).
2. **Frozen Commission**: Commission percentage and exact rupee amount are frozen on the booking record at creation.
3. **Supplier Net Payable**:
   $$\text{Supplier Earnings} = \text{Total Fare} - \text{Platform Commission} - \text{Retained Tax}$$

---

## 4. Cancellation & Refund Rules

Suppliers define custom free-cancellation deadlines in hours (e.g., 24h, 48h, 72h). Standard policy tiers apply:

| Hours Remaining Before Departure | Refund to Traveler | Platform Commission Status | Supplier Payout Status |
| :--- | :--- | :--- | :--- |
| **> Free Cancellation Deadline (e.g. 48h)**| 100% Full Refund | ₹0 Retained | ₹0 Paid |
| **Between Deadline and 24 Hours** | 50% Partial Refund | 50% Retained | 50% Paid |
| **< 24 Hours or No-Show** | 0% (Non-refundable) | 100% Retained | 100% Paid |

- **Supplier SLA Breach / Cancellation**: If a supplier cancels a confirmed booking or fails to provide service, the traveler receives an immediate 100% refund, and a penalty is recorded against the supplier.

---

## 5. Grouped Circuit Itinerary Rules

1. **Atomic All-or-Nothing Guarantee**: When a traveler reserves a multi-day circuit consisting of multiple suppliers, all child native holds must be secured together. If any stop is unavailable, the entire reservation is rolled back.
2. **Single Grouped Payment**: The traveler pays once for the parent circuit order (`circuit_orders`). Payment confirmation confirms all child bookings atomically.
3. **Reschedule Reconfirmation SLA**: An approved reschedule gives all affected suppliers 24 hours to reconfirm the new dates. If any supplier declines, the circuit holds for Operations review to prevent single-stop itinerary breaks.

---

## 6. Pickup OTP Security Handshake Rules

1. **Private Secret**: The 6-digit OTP is revealed only to the traveler in My Trips and on the digital voucher.
2. **Verification Gate**: Chauffeurs cannot start a trip without entering the customer's OTP into the portal.
3. **Brute-Force Lockout**: 5 failed OTP verification attempts lock the booking verification, requiring Operations manual reset.
4. **Payout Hold**: Supplier payouts remain in `SCHEDULED` status until the trip status moves to `completed` via verified OTP.

---

## 7. Financial Settlement Lifecycle

Supplier payouts transition strictly through 4 states:
1. `SCHEDULED`: Trip complete; funds held pending settlement cycle.
2. `BATCHED`: Grouped into the supplier's active settlement batch.
3. `PROCESSED`: Bank transfer / UPI payout initiated with provider transaction reference.
4. `RECONCILED`: Matched against debit entries in bank statements.
- **KYB Prerequisite**: Payouts are blocked if the supplier's `kyb_status` is not `APPROVED`.

---

## 8. Multi-Domain Routing & ResTech Channel Manager Rules

### 8.1 Domain Role Isolation
1. **Supplier Extranet (`supply.ideaholiday.in`)**:
   - Dedicated for `SUPPLIER` credentials and product publishing extranet.
   - Login attempts by `USER` or unauthorized roles are blocked with a clear redirect notice.
2. **Administrative Console (`admin.ideaholiday.in`)**:
   - Restricted exclusively to authenticated users with `ADMIN` or `STAFF` roles.
3. **Traveler Marketplace (`ideaholiday.in`)**:
   - Consumer-facing marketplace for searching, reserving, and managing traveler trips.
4. **Local Development Parity**:
   - Local execution resolves `supply.localhost` and `admin.localhost` or query parameters (`?portal=supplier`, `?portal=admin`) without requiring `/etc/hosts` DNS overrides.

### 8.2 ResTech Channel Sync & Catalog Mapping Rules
1. **Connection Validation**: Channel connections (`supplier_channel_connections`) require an active endpoint, API key, and automated health verification before product sync is permitted.
2. **External Catalog Ingestion**: ResTech product ingestion maps remote experiences (Bókun, FareHarbor, Bookingkit, TourCMS, Activitar, Anchor, OCTo) into native Idea Holiday activities and option rows.
3. **External Reference Tracking**: Ingested inventory records external IDs in `reservation_external_references` with provider types (`BOKUN`, `FAREHARBOR`, `BOOKINGKIT`, `TOURCMS`, `ACTIVITAR`, `ANCHOR`, `OCTO_GENERIC`) to guarantee idempotency across sync cycles.
4. **OCTo Standard Interoperability**: The platform exposes `/api/octo/v1/*` endpoints complying with the OCTo specification, enabling external booking aggregators to query real-time availability and dispatch reservation holds and confirmations.
