# Product: what Idea Holiday is and what we are building

> The single source for mission, users, scope and priorities.
> Architecture lives in [`ARCHITECTURE.md`](ARCHITECTURE.md); what to build next lives in [`ROADMAP.md`](ROADMAP.md).

---

## 1. Mission

Build **two products on one backend**, prioritising **non-tech, manual and offline
suppliers first**:

| Product | Domain | Comparable to | Serves |
| :--- | :--- | :--- | :--- |
| **Marketplace** | `ideaholiday.in` | Viator, GetYourGuide, Klook | Travelers discovering and booking experiences |
| **Reservation system** | `supply.ideaholiday.in` | Bókun, FareHarbor | Suppliers running live inventory, rates and calendars |
| *(Admin control plane)* | `admin.ideaholiday.in` | — | KYB approval, moderation, commission, finance |

They share one Express API, one database and **one pricing authority**. The
marketplace is never the source of truth for price or availability — the
reservation system is. That separation is what lets external ResTech providers
plug in without reworking the storefront.

### The problem this solves

1. **Offline supplier fragmentation** — most Indian tour operators and fleet
   vendors run on spreadsheets, phone calls and WhatsApp groups, with no digital
   inventory.
2. **Opaque pricing** — travelers get surprised by interstate permits, state
   border taxes, tolls and night-driving surcharges.
3. **No real-time availability** — Indian tour portals run on inquiry-and-quote,
   not live seats and instant confirmation.
4. **Safety gaps** — traveler details handed to unverified drivers.
5. **Multi-stop friction** — a Delhi → Agra → Jaipur circuit means several
   disconnected vendors with no atomic booking or refund.

### Two supplier acquisition paths

Both converge on the same catalog, availability and booking engine, so the
marketplace treats every product identically regardless of origin.

1. **Connected suppliers** already run Bókun, FareHarbor, Bookingkit,
   Palisis/TourCMS, Activitar or Anchor. They connect that system and import
   products instead of re-entering data.
2. **Unconnected suppliers** run on spreadsheets or nothing. They build listings
   natively in the supplier extranet.

---

## 2. Roles

| Role | Works in | Does |
| :--- | :--- | :--- |
| **Traveler** (`TRAVELER`) | `/`, `/search`, `/activity/:id`, `/checkout`, `/circuit-planner`, `/my-trips` | Search, hold seats for 10 minutes, pay, receive a QR voucher, cancel, review |
| **Supplier** (`SUPPLIER`) | `/supplier/*` | KYB, coverage zones, publish listings, seats, rates, calendar, driver roster |
| **Ground ops** (`STAFF`) | `/ops/*` | Dispatch fallbacks, OTP resets, SLA timeouts, notification audits |
| **Admin** (`ADMIN`) | `/admin/*` | KYB approval, product moderation, commission, finance, analytics |

---

## 3. The 5 product types

These are the exact values `POST /api/suppliers/:id/products/v2` accepts. Sending
anything else returns `400`.

| `product_type` | What it is | Typical `product_sub_type` | Backing tables |
| :--- | :--- | :--- | :--- |
| `TRANSFER` | Airport and intercity point-to-point | `AIRPORT_RAILWAY`, `CITY_TO_CITY`, `INTERCITY_HOTEL` | `product_vehicle_options`, geo-fences, toll/permit rules |
| `TOUR` | 4h / 8h / 12h sightseeing | `SIC`, `PRIVATE` | `product_sic_hubs` |
| `PACKAGE` | Fixed-duration holidays (3N/4D Goa, Golden Triangle) | `WITH_HOTEL`, `WITHOUT_HOTEL` | `product_itinerary_items`, `product_hotel_tiers` |
| `ATTRACTION` | Parks, monuments, museums, shows | `TICKET_ONLY`, `TICKET_SIC`, `TICKET_PRIVATE` | `product_ticket_tiers` |
| `EXPERIENCE` | Water sports, cooking classes, diving, workshops | `TICKET_ONLY`, `TICKET_SIC` | native seat inventory |

> **Legacy names.** Older rows still carry `DAY_TOUR` (now `TOUR`) and
> `MULTI_DAY_PACKAGE` (now `PACKAGE`), and the legacy `POST /:id/products`
> endpoint still accepts those two plus `TRANSFER`. Location and pricing code
> matches both spellings deliberately — see `locationValidationService.js`.
> **`ATTRACTION_TICKET` is not a real value**; it appeared only in old docs.
> Write new code against the five canonical types above.

---

## 4. What is built

Treat this as the current baseline — **do not rebuild it**.

- **Supplier extranet**: listings, operating days, departure times, seat capacity,
  adult/child prices, cut-offs, cancellation windows, blackout dates, **seasonal
  rates**, **per-departure calendar control**, **party-size rules**, **shared
  vehicle capacity**, **promotions with optional promo codes**.
- **Reservation engine**: live vacancies, 10-minute holds, atomic capacity
  deduction on verified payment, cut-off enforcement, QR vouchers. See
  [`RESERVATION_ENGINE.md`](RESERVATION_ENGINE.md).
- **Channel manager**: connectors for Bókun, FareHarbor, Bookingkit,
  Palisis/TourCMS, Activitar, Anchor and generic OCTo, with remote product import.
- **OCTo v1 API** at `/api/octo` and `/octo`.
- **Transfer engine**: PostGIS polygon geo-fencing with ray-casting, toll/permit
  and GST calculation.
- **Pickup OTP lifecycle**: SHA-256 verification hash, AES-GCM vault, 5-attempt
  lockout.
- **Circuit planner**: atomic all-or-nothing multi-supplier orders.
- **Finance**: frozen commission, payout lifecycle `SCHEDULED → BATCHED →
  PROCESSED → RECONCILED`, refund policy engine.
- **Notifications**: Meta WhatsApp Cloud API, SES/Brevo email, optional Twilio SMS,
  with a durable outbox.
- **Analytics**: executive dashboard at `/admin/analytics`.

**Infrastructure**: Google Cloud Run (2 GiB / 2 vCPU) + Supabase PostgreSQL with
PostGIS in production; SQLite WAL locally and in CI.

---

## 5. Non-goals

Do not build these. If a request implies one, say so before starting.

1. **Airline GDS** — no Amadeus, Sabre, Galileo, no flight ticketing.
2. **Standalone hotel brokerage** — hotels sell only as package components.
3. **Foreign-currency payouts** — everything settles in INR.
4. **Self-drive rentals** — commercial chauffeur-driven vehicles only.
5. **Peer-to-peer drivers** — verified suppliers with valid KYB only.
6. **Unrequested UI redesigns** — no replacing Tailwind, no re-theming.

---

## 6. Invariants

Break these and the platform is wrong, however green the tests are.

1. **The backend owns price.** Checkout requests a canonical server quote. A
   browser-supplied total is never trusted.
2. **The backend owns booking state.** Transitions happen server-side inside a
   transaction.
3. **A hold freezes its price.** A supplier repricing mid-checkout cannot change
   a traveler's total.
4. **Capacity is atomic.** `vacancies = capacity − confirmed − active holds`,
   serialised on the product row across both database engines.
5. **Seat counts stay canonical.** `bookings.adults` / `bookings.children` are
   what capacity, dispatch, vouchers and notifications read. Unit-type detail is
   additive in `booking_unit_items`.
6. **Migrations are append-only.** Never edit or renumber an applied migration.
7. **Secrets never enter the repo.** No keys in code, tests, fixtures or docs.
