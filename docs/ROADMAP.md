# Roadmap

> **Rule for agents:** work only on **NOW**, or on what the user explicitly asks for.
> Never promote a **NEXT** or **LATER** item into current work on your own.
>
> Why we are building this: [`PRODUCT.md`](PRODUCT.md).

---

## DONE — the current baseline

Do not rebuild these. Extend them if asked.

| Area | State |
| :--- | :--- |
| Supplier extranet | Listings, schedules, capacity, cut-offs, blackouts |
| Reservation engine | Live vacancies, 10-min holds, atomic deduction, QR vouchers |
| Seasonal rates | Date-ranged, weekday-filtered, priority-resolved |
| Calendar control | Close or resize one date, or one departure |
| Party-size rules | Minimum to run, maximum per booking |
| Unit types | Senior/youth/infant priced; seatless infant-on-lap |
| Shared resources | One vehicle or guide capping every option that uses it |
| Promotional rates | Percent/flat discounts, promo codes, last-minute and early-bird windows |
| Bulk calendar editing | Close or resize a date range in one atomic request |
| Channel manager | Bókun, FareHarbor, Bookingkit, Palisis/TourCMS, Activitar, Anchor, generic OCTo — connect and import |
| OCTo v1 API | `/api/octo` and `/octo` |
| Transfer engine | PostGIS geo-fencing, tolls, permits, GST |
| Pickup OTP | SHA-256 verify hash, AES-GCM vault, 5-attempt lockout |
| Circuit planner | Atomic multi-supplier orders and rollback |
| Finance | Frozen commission, payout lifecycle, refund policy engine |
| Notifications | WhatsApp, email, SMS with a durable outbox |
| Analytics | `/admin/analytics` |

---

## NOW

Nothing is mid-flight. Pick from **NEXT** when asked, or take direction from the user.

Standing obligations that apply to every change:

- Keep `npm audit --omit=dev` at **0 vulnerabilities**.
- Keep coverage above the **70%** gate.
- Keep all suites green: 313 unit, 17 integration, 12 e2e.

---

## NEXT — ready to start, highest value first

**1. Branch coverage on error paths**
Line coverage is ~88% but branch coverage is ~63%. The gap is error handling —
where undiscovered bugs live. Target the payment, refund and dispatch services.

**2. Real external provider adapter**
The channel manager imports products, but `reservationProviders.js` still runs
only `NATIVE` for live availability and booking. A true Bókun or FareHarbor
adapter needs supplier auth, capability discovery, its own idempotency and
reconciliation. Biggest single piece of remaining Phase 2 work.

---

## LATER

- **Chauffeur PWA** — driver app for QR scanning and OTP entry.
- **Proximity dispatch** — allocate drivers by live GPS and rating.
- **Mappls telemetry** — turn-by-turn driver tracking.
- **B2B sub-agent portal** — credit lines, whitelabel vouchers, corporate billing.
- **BigQuery warehouse** — only worth it past ~1000 bookings/day.

---

## NOT DOING

See non-goals in [`PRODUCT.md`](PRODUCT.md) §5: no airline GDS, no standalone
hotel brokerage, no foreign-currency payouts, no self-drive rentals, no
peer-to-peer drivers, no unrequested UI redesigns.
