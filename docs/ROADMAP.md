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
| Destination pages (ADR 025) | `/things-to-do/:city` landing pages built from live listings, with FAQ and ItemList markup; canonical for city searches and in the sitemap |
| WhatsApp sharing (ADR 029, 030) | Share button on activity, city and blog pages with an English or Hindi message, tagged for analytics; a signed-in creator's code is added to the link |
| Hindi city pages (ADR 028) | `/hi/things-to-do/:city` with Hindi copy and FAQs, `hreflang` between versions, in the sitemap |
| Staff blog (ADR 026) | `/blog` travel guides written in the admin panel, linked to city pages and bookable listings, `BlogPosting` markup, in the sitemap |
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

**Operator platform** (owner request 2026-09-25; ADR 034–035, [`DECISIONS_OPERATOR.md`](DECISIONS_OPERATOR.md)): run a tour operator's whole business on supply.ideaholiday.in, Bókun-style, with Sembark-style packages. Every channel books the one inventory.

- **Phase 0 — done:** OCTo partner keys; shared-resource locks.
- **Phase 1 — done:** walk-in / phone / manual bookings, `bookings.source`, supplier payment records and balance due.
- **Phase 2 — done:** supplier staff logins with owner, manager, front desk and guide roles (ADR 036).
- **Phase 3a — done:** departures board; guides, vehicles and equipment assigned to departures; linked guides see only their own (ADR 037).
- **Phase 3b — done:** booking calendar; supplier reschedule at the same price, with the traveler able to decline for a full wallet refund (ADR 037).
- **Phase 4 — done:** real supplier dashboard numbers: earnings by trip date split marketplace/direct, growth against the same days last month, and service metrics that say "Not enough data" instead of inventing (ADR 038).
- **Phase 5 — done:** the supplier's own agents booked by staff at a commission-based net rate, on credit up to a limit, with payments on account and statements (ADR 039).
- **Phase 6 — done:** package quotations with a hotel rate sheet, one markup, 5% package GST for Indian suppliers, PDF by email and share link, listing lines booked in one click once accepted (ADR 040).
- **Phase 7 — done:** three sales-channel switches per listing, and reseller API keys the owner issues, booked as the supplier's direct sales, optionally at an agent's net rate and credit (ADR 041).
- Phases 0–7 are deployed to production (owner, 2026-09-25).
- **Phase 8 — done:** private rate sheet for cab types, transfers, sightseeing and activities; quotations built day by day from it with day text, seat/date/hotel-night warnings, a per-person price, copy to a new date and past-quotation suggestions (ADR 042). Deployed 2026-09-25 (owner).
- **Phase 9 — done:** hotel options in one quotation (3 Star, 4 Star…), each priced on its own; the customer's choice sets the price (ADR 043). Deployed 2026-09-25 (owner).
- **Phase 10 — done:** per-km car pricing (rate per km, minimum km per day, driver allowance per day) and a warning when hotel rooms sleep too few (ADR 044). Needs migration 071 (applied automatically on the next deploy).

Standing obligations that apply to every change:

- Keep `npm audit --omit=dev` at **0 vulnerabilities**.
- Keep coverage above the **70%** gate.
- Keep all suites green: `npm run check` and `npx playwright test`.

---

## NEXT — ready to start, highest value first

**1. Branch coverage on error paths** *(in progress)*
Unit branch coverage is ~76% against ~91% line. Payment, channel, SLA, the
provider boundary, the booking quote, Cashfree SecureID, analytics and driver
dispatch have had a pass, surfacing two refund bugs, six in the OCTo confirmation
path and three in analytics (the overview and revenue breakdown read columns that
don't exist; bookings dropping to zero raised no alert). The named services are
done; what remains is the six unimplemented adapters, which need provider
credentials (item 2).

Found during the pass, left for later (owner to decide):
- The conversion funnel on `/admin/analytics` fills a missing search or view
  count with bookings × 15 or × 5 once any audit event exists, so it can show
  made-up numbers (`getConversionFunnel` in `analyticsService.js`). Show only
  real counts?
- `runComprehensiveSupplierKyb` reports `overallVerified: true` when a supplier
  has neither PAN nor bank details. Nothing reads it today (approval uses its
  own readiness check), so it is harmless until something does.

A lesson worth keeping: the OCTo bugs were all masked by a unit-test fixture that
hand-rolled a `bookings` table not matching production, and the analytics bugs
the same way. Prefer fixtures built from the real migrations
(`backend/test/helpers/migratedDb.js`).

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
