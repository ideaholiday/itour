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

## 5. Paying for a subscription

1. **Price:** program setting `supplier_subscriptions.priceInr` (before GST) and
   `billingPeriodMonths` (default 12), set by an admin in Programs. While the price
   is empty the subscription is **not for sale** (`409 NOT_FOR_SALE`); the owner had
   not decided it on 2026-09-15. Suppliers stay on the launch offer meanwhile.
2. **The server prices every payment:** price − coupon = taxable value; GST 18% on
   that (SAC 998559, ADR 017); total = taxable + GST, to the paisa.
3. **Coupons** are `promo_codes` with `audience = 'SUPPLIER_SUBSCRIPTION'` (Admin →
   Coupons, "For: supplier subscriptions"), applied before GST; traveler coupons are
   refused (`WRONG_AUDIENCE`) and the reverse. Limits per supplier use
   `per_user_limit`. A use is recorded in `coupon_redemptions` with the plan payment
   id in `booking_id`.
4. **Payment** is a Cashfree order (`subs_…`). The subscription becomes `ACTIVE`
   (`source = 'PURCHASE'`) only after the server confirms the payment — the verify
   call after checkout, or the signed Cashfree webhook — and only if the paid amount
   equals the priced total (else `AMOUNT_MISMATCH`, nothing activated). Confirming
   twice changes nothing. If the order cannot be created the attempt is `FAILED`
   (`502 PAYMENT_UNAVAILABLE`).
5. **A 100% coupon** activates the subscription at once (`status = 'FREE'`,
   `source = 'COUPON'`) with no payment.
6. **When paid cover starts:** now, or when the supplier's latest dated paid,
   coupon or admin-waiver cover ends, so renewing early loses nothing. An open-ended
   or dated launch waiver does not delay it.
7. **Tax invoice:** each `PAID`/`FREE` payment gets a sequential number per
   financial year (`IHS/2026-27/00001`) and an HTML invoice (seller name, GSTIN and
   address from `BUSINESS_LEGAL_NAME`, `BUSINESS_GSTIN`, `BUSINESS_ADDRESS`).
   GST is split CGST 9% + SGST 9% when the supplier's state equals `BUSINESS_STATE`,
   else IGST 18%; with `BUSINESS_STATE` unset it is shown as one GST line —
   set it before selling.

## 6. Not built yet

- **Paid add-ons from ADR 008** (Verified check, Spotlight).
- **Automatic renewal charges:** renewal is a new payment by the supplier, prompted
  by the reminders in §4.
