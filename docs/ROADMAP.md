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
- **Phase 3 — built, release in progress:** `android-driver/` app (ADR 014).
  - **D-U-N-S approved** (owner, 2026-09-28) for Idea Holiday Private Limited, Lucknow. The Play organisation account must use that exact legal name and address.
  - **Done:** privacy policy names the app and covers location while the app is closed or the screen is locked, who sees it, the notification and 30-day deletion; registered office added (2026-09-28).
  - **Play Console organisation account** created 2026-09-28 and ready to publish 2026-09-29 (account ID 6122682140764081503). Before the first release, check that the public developer name is Idea Holiday Private Limited, and finish "Android developer verification" in the Console.
  - **Upload key** created 2026-09-29 (RSA 4096, valid to 2056, kept outside the repo; SHA-256 `CC:F8:2F:9F:63:F5:D4:12:39:83:23:43:9E:F5:59:4A:05:C0:FA:81:71:F3:92:14:48:A0:6A:AC:32:CC:9E:71`). `bundleRelease` builds a signed `.aab`.
  - **Done 2026-09-30:** internal testing track (version 1); driver sign-in by email code and My trips (ADR 053, version 2 / 1.1.0 built); Firebase push; `ANDROID_DRIVER_APP_SHA256` set in `deploy.sh`.
  - **Done 2026-09-30:** version 2 sent to production review with the location foreground-service declaration and video; the two bundle warnings (no deobfuscation file, no native symbols) need nothing: R8 is off, and the only native library (AndroidX DataStore, via Firebase) ships stripped.
  - Then, in order: Google's approval → test on Xiaomi/Oppo/Vivo battery savers → show the Play link on the browser trip page. The link is wired in but off (2026-10-01): set `DRIVER_APP_LINK_ON = true` in `frontend/src/lib/driverAppLink.js` and deploy. `VITE_DRIVER_APP_URL` still overrides it in local builds only, since `.dockerignore` keeps every `.env` file out of the image.
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
- **Phase 10 — done:** per-km car pricing (rate per km, minimum km per day, driver allowance per day) and a warning when hotel rooms sleep too few (ADR 044). Deployed 2026-09-25 (owner).
- **Phase 11 — done:** running an accepted trip: a trip file with each line's status, confirmation and vendor cost; hotel booking requests by email; drivers for cars with clash checks and a weekly car schedule; vendor payments and margin; the final itinerary by email and WhatsApp (ADR 045). `DATA_MODEL.md` split: operator tables in `DATA_MODEL_OPERATOR.md`. Needs migration 072 (applied automatically on the next deploy).
- **Phase 12 — done:** quotation builder replan (ADR 051): a start screen for single-city, multi-city, a ready route or a copy; a live trip calculator with room and cab suggestions and price from a target; travel days with the transfer between cities; arrival and departure points; three itinerary themes on a redesigned PDF, a web itinerary page (`/q/:token`) and a themed HTML email with a preview. Needs migration 079 (applied automatically on the next deploy).

**IdeaHoliday B2B travel agents** (owner request 2026-10-01; [ADR 054](DECISIONS_B2B.md), [`plans/b2b-travel-agents.md`](plans/b2b-travel-agents.md)): agents sign up on ideaholiday.in, IdeaHoliday approves them, and they book every listing type and circuits at a 5–10% net price, prepaid.

- **B1 — built 2026-10-01, not deployed:** `/agents` sign-up (GSTIN or PAN), admin approval at `/admin/agencies` with a 5–10% discount, emails. Needs migration 082 (applied automatically on the next deploy).
- **B2 — built 2026-10-01, not deployed:** agent price on the listing, checkout and circuits (`IH_B2B`, out of commission, no coupons); the agency gets the invoice, the guest the voucher. Needs migration 083.
- **B3 — built 2026-10-01, not deployed:** agent dashboard at `/agents/dashboard`: bookings by guest and date, voucher and invoice, cancel, statement CSV.
- **B4 — built 2026-10-01, not deployed:** the client's voucher names the agency and its phone, no price; links last to a week after the trip; "Send to client" on WhatsApp and copy from the dashboard. All four phases of the plan are built.

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

**2. Provider-specific adapters** *(Bókun done, not yet verified against real Bókun; ADR 046)*
Bókun now books through its OCTo API, following the published standard; it needs a run against Bókun's test
environment (`https://api.bokuntest.com/octo/v1`) with a real OCTo key. Found on the way, owner to decide:
the other five adapters return built-in sample products and report "connected" without calling the provider;
the importer invents missing values (Goa, ₹1,500, 09:00/14:00, 15 seats); and our own OCTo server and client
use a dialect (`/bookings/reservation|confirmation|cancellation`, `unitType`) rather than the standard, which
standard OCTo resellers can't call. Changing the server would affect partners already integrated.

`OCTO_GENERIC` now does availability, reserve, confirm and cancel, and the
provider boundary is real. The remaining six adapters (Bókun, FareHarbor,
Bookingkit, TourCMS, Activitar, Anchor) still only import products and return
`PROVIDER_CAPABILITY_MISSING` for live operations. Each needs that provider's
own credentials and API documentation — they cannot be written honestly without
them, so treat each as its own scoped piece of work.

**3. Traveler and supplier Android apps** *(owner, 2026-09-29; ADR 052, [`DECISIONS_MOBILE.md`](DECISIONS_MOBILE.md))*
Built together with the driver app and released together (ADR 053). Both are in `android-apps/` on one shared WebView shell: Google sign-in in a Custom Tab, Cashfree UPI handoff, file uploads, downloads, App Links, Firebase push. **Done 2026-09-30:** apps created in Play Console, signed version 1 bundles uploaded to internal testing, App Links fingerprints in `deploy.sh`, push live (keyless, Cloud Run service account). All three apps' Play certificates (classic, deployment, hybrid) and upload keys are in `deploy.sh` (read from the downloaded `.der` files, 2026-09-30). Deployed and confirmed live on 2026-09-30 (four fingerprints per app). **Done 2026-10-01 (version 2 / 1.0.1, not yet uploaded):** the shell grants the camera to its own pages (supplier QR check-in and KYB selfie; `CAMERA` declared in the supplier app only, never the microphone), and a push opens the booking it is about (`/bookings?ref=…`, `/supplier/bookings?ref=…`). **Next:** test on real phones (Google sign-in return, UPI payment, voucher and export downloads, uploads, push); store listings and data-safety forms, drafted in [`PLAY_STORE.md`](PLAY_STORE.md) with two open items (GTM tags, reviewer test accounts); camera capture from upload fields is not supported yet.
- **Traveler app** (ideaholiday.in): search, book and pay in the app. Cashfree UPI payments must open the UPI app from the WebView, and App Links for booking and voucher URLs must open the app. Vouchers must download.
- **Supplier app** (supply.ideaholiday.in): the extranet for owners and staff, with the same shell.
- Decided (ADR 053): `in.ideaholiday.app`, `in.ideaholiday.supplier`, Firebase push for all three apps.

---

## LATER

- **Proximity dispatch** — allocate drivers by live GPS and rating.
- **B2B agent credit** — deposits, credit lines and corporate billing for IdeaHoliday's agents (ADR 054 starts prepaid).
- **BigQuery warehouse** — only worth it past ~1000 bookings/day.

---

## NOT DOING

See non-goals in [`PRODUCT.md`](PRODUCT.md) §5: no airline GDS, no standalone
hotel brokerage, no foreign-currency payouts, no self-drive rentals, no
peer-to-peer drivers, no unrequested UI redesigns.
