# Coupons

> **Summary:** Rules for admin coupons (`promo_codes`): how a discount is priced and charged, who and what a code applies to, usage limits, and when a use is given back. The giveaway cap itself is BUSINESS_RULES §3.2.
> **Read when:** changing coupon validation, checkout discounts, the Coupons admin page, or `coupon_redemptions`. Code: `promoService.js` (checking, charging, releasing), `couponService.js` (admin).

## 1. Pricing and charging

1. **The server prices the discount from its own quote** (whole rupees, rounded
   down), cuts it to what the giveaway cap leaves after any referral and creator
   commission, and takes it off `amount_inr`. It comes out of commission, never the
   supplier's payout (`bookings.coupon_discount_inr`, ADR 017).
2. `POST /api/bookings/quote` returns the same figure checkout shows.
3. **A code that is no longer valid when the booking is created refuses the
   booking**, with the reason; it is never silently dropped.
4. One typed code per booking. A creator's code, a traveler `REF-` code and an admin
   coupon exclude each other; a Share & Earn first-trip discount from a signup link
   can combine with a coupon, within the cap. Wallet credit can be added on top.
5. Supplier promotions (`native_promotions`) price the rate first; the coupon
   applies to the result.

## 2. Who and what a code is for

A code is checked in this order; the first rule that fails is the message shown.

1. **On**, **not expired**, and **started** (`starts_at`). Dates without a time
   start at 00:00:00 and end at 23:59:59.
2. **Audience** `TRAVELER`. Codes for other audiences (supplier subscriptions,
   SUPPLIER_PLANS.md §5) cannot be used for bookings.
3. **Total uses** below `usage_limit` (empty = no limit).
4. **Per traveler** (`per_user_limit`) and **first booking only** need a signed-in
   traveler. First booking means no `PAID` or `PARTIALLY_REFUNDED` booking yet.
5. **Targeting:** `product_types_json`, `product_ids_json`, `supplier_ids_json` (all
   must match; empty = any). The checkout "Apply" button checks targeting when it
   knows the product; the quote always does.
6. **Minimum booking** (`min_order_inr`).

## 3. Uses

1. **A booking's use is recorded in the booking transaction**
   (`coupon_redemptions`, one per booking) with the rupees taken off.
   `times_used` rises in the same statement that checks the limit, so two
   bookings cannot both take the last use; the loser is refused with `409 USAGE_LIMIT`.
2. **A use is given back** (`RELEASED`, `times_used` decremented) when its booking
   never went ahead: the checkout hold lapsed unpaid, payment failed or expired, it
   was cancelled before payment, or it was **fully** refunded. A partly refunded
   booking keeps its use. The 5-minute lifecycle job does this; it is safe to repeat.

## 4. Admin

1. Admins create, edit, switch off and report on coupons in Admin → Coupons.
   Coupons are never deleted, because bookings refer to their code. A code cannot
   be renamed.
2. Codes are 3–40 letters, digits, `-` or `_`, stored upper case. `REF-` is
   reserved for traveler referral codes, and a creator's code cannot be reused.
3. **A creator's code** is managed by the affiliate program, which sets its
   discount from the creator's tier: here it can only be switched on or off.
4. `GET /api/promo/active` lists only codes anyone can use (no targeting, limits
   per traveler or first-booking rule). `POST /api/promo/validate` allows 30
   checks a minute per client, so codes cannot be guessed by brute force.
