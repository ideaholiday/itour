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
| External provider boundary | OCTo client for availability/reserve/confirm/cancel; external names no longer fall back to native |
| Channel manager | Bókun, FareHarbor, Bookingkit, Palisis/TourCMS, Activitar, Anchor, generic OCTo — connect and import |
| OCTo v1 API | `/api/octo` and `/octo` |
| Transfer engine | PostGIS geo-fencing, tolls, permits, GST |
| Pickup OTP | SHA-256 verify hash, AES-GCM vault, 5-attempt lockout |
| Circuit planner | Atomic multi-supplier orders and rollback |
| Finance | Frozen commission, payout lifecycle, refund policy engine |
| Notifications | WhatsApp, email, SMS with a durable outbox |
| Analytics | `/admin/analytics` |
| Money programs (ADR 017) | 30% commission per product, coupons, giveaway cap, Share & Earn and creator rate controls, creator earnings for travel, supplier subscriptions with waivers and payments |
| Day-of-operations | Voucher QR check-in (camera or typed reference), no-shows, guest list per departure with CSV, cancel a whole departure with wallet refunds and calendar close |
| Supplier profiles | Public pages + directory, server-rendered SEO and sitemap, Verified badge (admin-granted), enquiries, share kit (QR, standee/sticker print, voucher QR, reviews widget, visit counts), paid plans (Verified check queue with refunds, Spotlights, Verified Plus) |

---

## NOW

**Live driver GPS** (ADR 012), web-first:

- **Phase 1 — done:** drivers share phone location from the trip link (required before "On the way"), positions stored for 30 days, real positions with Live / Delayed / Signal lost on the ops map, supplier sees the driver's last position.
- **Phase 2 — done:** traveler tracking link and Track live in My Trips with Ola Maps ETA, "You're at the pickup point" prompt, missed-pickup alerts (not on the way, signal lost, running late, not moving).
- **Phase 3 — built, release ON HOLD:** `android-driver/` app (ADR 014).
  - **Blocked on D-U-N-S** (applied, pending as of 2026-09-14; expected by about 2026-10-14). A Google Play organisation account needs it. Resume when the owner confirms approval.
  - Then, in order: Play Console organisation account → privacy policy page covering driver location → upload key (kept outside the repo) → test on real Android phones (including Xiaomi/Oppo/Vivo battery savers) → Play listing, data-safety form and location foreground-service declaration → internal testing track → set `ANDROID_DRIVER_APP_SHA256` and `VITE_DRIVER_APP_URL` in production.
  - Until then, drivers share location from the browser trip page (Phase 1–2 work as is). The app already targets API 36, which Play requires for new apps from 2026-08-31.

Standing obligations that apply to every change:

- Keep `npm audit --omit=dev` at **0 vulnerabilities**.
- Keep coverage above the **70%** gate.
- Keep all suites green: `npm run check` and `npx playwright test`.

---

## NEXT — ready to start, highest value first

**1. Branch coverage on error paths** *(in progress)*
Branch coverage is ~65% against ~89% line. Payment, channel, SLA and the
provider boundary have had a pass, surfacing two refund bugs and six in the OCTo
confirmation path. Still thin: `bookingService`, `cashfreeSecureIdService`,
`driverDispatchService`, `analyticsService`, and the six unimplemented adapters.

A lesson worth keeping: the OCTo bugs were all masked by a unit-test fixture that
hand-rolled a `bookings` table not matching production. Prefer fixtures built
from the real migrations.

**2. Provider-specific adapters**
`OCTO_GENERIC` now does availability, reserve, confirm and cancel, and the
provider boundary is real. The remaining six adapters (Bókun, FareHarbor,
Bookingkit, TourCMS, Activitar, Anchor) still only import products and return
`PROVIDER_CAPABILITY_MISSING` for live operations. Each needs that provider's
own credentials and API documentation — they cannot be written honestly without
them, so treat each as its own scoped piece of work.

---

## LATER

- **Proximity dispatch** — allocate drivers by live GPS and rating.
- **B2B sub-agent portal** — credit lines, whitelabel vouchers, corporate billing.
- **BigQuery warehouse** — only worth it past ~1000 bookings/day.

---

## NOT DOING

See non-goals in [`PRODUCT.md`](PRODUCT.md) §5: no airline GDS, no standalone
hotel brokerage, no foreign-currency payouts, no self-drive rentals, no
peer-to-peer drivers, no unrequested UI redesigns.
