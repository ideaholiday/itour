# Glossary: Idea Holiday

> **Summary:** Project terms and role names.
> **Read when:** you meet a term you don't recognise.

This glossary defines project-specific domain and technical terminology to ensure AI agents and engineers interpret concepts accurately.

---

### Ecosystem Roles
- **Traveler (`TRAVELER`)**: The customer purchasing airport transfers, day tours, activities, or multi-day custom circuits.
- **Supplier (`SUPPLIER`)**: A verified commercial tour operator, fleet owner, or destination management company (DMC) providing vehicles, guides, and activities.
- **Ground Operations Staff (`STAFF`)**: Operations desk personnel monitoring live trip dispatch, resolving SLA timeouts, reallocating fallback drivers, and managing traveler exceptions.
- **Super Administrator (`ADMIN`)**: Platform executive managing KYB approvals, commission rates, listing moderation, financial settlements, and executive analytics.

---

### 5-Product-Types Taxonomy
- **Transfer (`TRANSFER`)**: Point-to-point, airport, or intercity transportation backed by vehicle options, distance calculation, FASTag highway tolls, and interstate taxes.
- **Day Sightseeing Tour (`TOUR`, legacy `DAY_TOUR`)**: Curated 4h, 8h, or 12h city sightseeing itineraries with predefined stop sequences, private vehicle categories, or SIC shared departures.
- **Multi-Day Packaged Holiday (`PACKAGE`, legacy `MULTI_DAY_PACKAGE`)**: Multi-day packaged tours featuring day-by-day activity timelines, vehicle inclusions, and tiered hotel accommodation options (`Cab Only`, `3-Star`, `4-Star`, `5-Star`).
- **Attraction Ticket (`ATTRACTION`)**: Theme parks, monuments, museums, shows with ticket tiers (`Adult`, `Child`, `Senior`, `Infant`).
- **Experiential Activity (`EXPERIENCE`)**: Water sports, cooking classes, scuba diving, hot air ballooning, and outdoor workshops with departure slot times and seat capacity.

---

### Technical & Operational Terms
- **Circuit**: A multi-day custom traveler journey consisting of linked city transfers, sightseeing tours, and hotel stays across one or more destinations.
- **Circuit Quote (`circuit_quotes`)**: A server-computed, immutable 15-minute price snapshot freezing the exact cost and availability of all itinerary lines.
- **Circuit Order (`circuit_orders`)**: The parent transactional entity that atomically holds and confirms child bookings across multiple independent suppliers under a single payment.
- **Native Reservation / Hold (`native_reservations`)**: A 10-minute temporary seat reservation created during checkout to prevent double-booking while the traveler completes payment (`ON_HOLD` status).
- **Native Inventory Rules (`native_inventory_rules`)**: Supplier-configured operating days, departure times, capacity limits, adult/child pricing, cutoffs, and blackout dates.
- **Native Availability Slot (`native_availability_slots`)**: Unique date and time departure instance with configured capacity and remaining vacancies.
- **Native Reservation Outbox (`native_reservation_outbox`)**: Durable queue ensuring reliable at-least-once delivery of confirmation notifications.
- **Ticket Tiers (`product_ticket_tiers`)**: Passenger classification tiers (`Adult`, `Child`, `Senior`, `Infant`) with age bounds and pricing.
- **Vehicle Options (`product_vehicle_options`)**: Specific vehicle classifications offered for a transfer or private tour (`SEDAN`, `SUV`, `TEMPO`, `MINI_BUS`, `BUS`).
- **SIC Pickup Hub (`product_sic_hubs`)**: Designated physical assembly and departure point for Seat-In-Coach tours with scheduled departure times and seat capacities.
- **Hotel Tier (`product_hotel_tiers`)**: Packaged accommodation categories (`3-Star`, `4-Star`, `5-Star`) priced per person per night.
- **Pickup OTP**: A cryptographically random 6-digit code (`crypto.randomInt(100000, 1000000)`) stored as a SHA-256 verification hash and AES-GCM encrypted cipher. Revealed only to the traveler in My Trips and submitted by the driver to verify pickup.
- **KYB (Know Your Business)**: Mandatory corporate verification for suppliers involving GSTIN, PAN, and commercial passenger vehicle permit validation before listing publication.
- **Supplier Response SLA**: 24-hour time window within which a supplier must accept a requested booking assignment before the platform initiates fallback reallocation.
- **Geo-Fence / Polygon Zone**: Spatial boundary defined by PostGIS polygon vertices or lat/lng radius where a supplier is authorized to operate transfers.
- **Ray-Casting Algorithm**: The in-memory computational geometry algorithm used by the SQLite engine to test whether pickup/drop coordinates fall within a supplier's operational polygon.
- **FASTag Toll Allowance**: Estimated highway toll charges included in upfront customer quotes to prevent on-road cash demands by drivers.
- **Interstate Permit Tax**: State passenger transport entry tax assessed when a route crosses an Indian state border.
- **Platform Commission**: The marketplace revenue share (default 18.0%, or category/supplier specific override) frozen on the booking record upon creation.
- **Settlement Lifecycle**: Four-stage state progression for supplier disbursements: `SCHEDULED → BATCHED → PROCESSED → RECONCILED`.
- **OCTO (Open Connectivity for Tourism)**: The standardized open specification for tours, activities, and attractions API distribution.
