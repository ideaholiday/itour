# Supplier Plans & Subscriptions

> **Summary:** Rules for the subscription suppliers need to take bookings (ADR 017): who is exempt, launch waivers, admin waivers, expiry and reminders. Paid plans and online payment are added here when built.
> **Read when:** changing who can take bookings, supplier subscriptions, waivers, or supplier plan pricing. Code: `supplierSubscriptionService.js`, `supplierKybGate.js`.

## 1. Who needs a subscription

1. **Suppliers who signed up from 2026-09-14 need one to take new bookings.**
   Suppliers registered before then are exempt (`suppliers.subscription_exempt = 1`,
   set once by migration 039). There is no way to become exempt later; use a waiver.
2. **A supplier can take bookings** when its KYB is `APPROVED` **and** it is
   covered: exempt, or holding a live `supplier_subscriptions` row — `ACTIVE` (paid)
   or `WAIVED` (free) — whose `starts_at` has passed and whose `ends_at` is empty or
   not yet passed. The check is `approvedSupplierSql` / `isSupplierSubscriptionCovered`,
   so search, listings, availability, SEO, OCTo, quotes, supplier assignment and
   circuit orders all apply it.
3. **Bookings already made are always honoured.** Losing cover only stops new
   bookings; confirmed trips, holds in progress and payouts are unaffected.
4. Profiles stay public and indexable once KYB is approved (ADR 008). Uncovered
   suppliers' products are simply not bookable.

## 2. Launch waiver (until online payment exists)

1. **While the launch offer is on** (program setting `supplier_subscriptions.launchWaiver`,
   default on), every new supplier gets a `WAIVED` row with `source = 'LAUNCH'` —
   at signup, and at API startup for any new supplier without a row.
2. **End date:** `launchWaiverUntil` (a date, UTC end of day). Empty means no end
   date yet (the owner's choice until a date is set, 2026-09-14). Changing it
   updates **every** live launch waiver, including ones already given.
3. **Turning the offer off** stops new launch waivers; waivers already given keep
   running to their end date.
4. Admins change both in Admin → Programs, with a reason; the change is audited.

## 3. Admin waivers

1. An admin can waive the subscription for one supplier until a date or with no
   end date (`source = 'WAIVER'`), with a reason. It adds cover; it never grants
   the Verified badge (ADR 008).
2. An admin can end any live cover early (`status = 'CANCELLED'`, `ends_at` = now),
   with a reason.
3. A supplier may hold several rows; it is covered while any one is live.

## 4. Expiry and reminders

1. An hourly job marks rows whose `ends_at` has passed as `EXPIRED`. Cover already
   follows `ends_at`, so a missed run never keeps a supplier selling.
2. The supplier gets one email + WhatsApp reminder at 30, 7 and 1 days before a
   dated cover ends (`last_reminder_days`), unless another live cover outlasts it.
3. The supplier portal shows the launch offer and its end date, and warns when the
   supplier is not covered.

## 5. Not built yet

- **Price and billing period:** not decided (2026-09-14).
- **Online payment:** Cashfree one-time orders; activate only on server-verified
  payment (`status = 'ACTIVE'`, `source = 'PURCHASE'`).
- **GST invoice:** SAC 998559 at 18% (ADR 017).
- **Supplier coupons:** `promo_codes` for subscriptions; a 100% coupon creates
  `source = 'COUPON'` cover with no payment.
- **Paid add-ons from ADR 008** (Verified check, Spotlight).
