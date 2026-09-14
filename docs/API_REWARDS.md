# Rewards & Programs API: Idea Holiday

> **Summary:** Endpoints for creator/affiliate commission, Travel & Earn referrals, coupons, and admin program settings (commission, giveaway cap).
> **Read when:** adding or changing one of those endpoints. Other endpoints: [`API_CONTRACTS.md`](API_CONTRACTS.md). Rules: [`BUSINESS_RULES.md`](BUSINESS_RULES.md) §3.2, §10, §11.

## 8. Creator & Affiliate Endpoints (`/api/affiliate`)

Commission rules behind these endpoints are in BUSINESS_RULES §10.

### 8.1 Attribution (public)
- **`POST /api/affiliate/track-click`**: Records a referral click and opens the
  attribution window. Called by the browser whenever a `?ref=` link is opened.
  - **Body**: `{ "affiliateCode": "TRAVELPRO10", "visitorId": "…", "subId": "reels-march", "destinationPath": "/activity/goa-scuba", "referrerUrl": "…" }`
  - **Response**: `{ "success": true, "attributionExpiresAt": "2026-10-12 09:00:00", "windowDays": 30 }`
  - `visitorId` is an anonymous, browser-generated token (`lib/affiliateAttribution.js`).
    Without it the click is logged but no attribution window opens, and a link
    referral will not be credited.

Booking creation (`POST /api/bookings`) accepts `visitor_id`, and optionally
`affiliate_code` and `affiliate_sub_id`. **The code alone earns nothing** — the
server credits a link referral only when an unexpired attribution exists for
that `visitor_id`. A coupon code applied through `promo_code` follows the normal
promo path and is credited on the code itself.

### 8.2 Profile (Requires authentication)
- **`GET /api/affiliate/me`**: `{ registered, affiliate }` for the signed-in user.
- **`POST /api/affiliate/register`**: Creates the creator profile and provisions
  the matching traveler-facing promo code.
  - **Body**: `{ "channelName": "...", "channelType": "YOUTUBE", "channelUrl": "...", "customCode": "TRAVELPRO10", "bio": "..." }`
- **`PUT /api/affiliate/profile`**: Updates channel name, type, URL, bio.
- **`POST /api/affiliate/kyc`**: Submits PAN (and optionally bank/UPI, which are
  routed through the payout-account flow below).
  - **Body**: `{ "panNumber": "ABCDE1234F", "panHolderName": "...", "bankAccountNumber": "...", "bankIfsc": "...", "bankAccountHolder": "...", "upiId": "...", "gstin": "..." }`
- **`GET /api/affiliate/dashboard`**: Full creator dashboard — tier and progress,
  balance breakdown (pending / on hold / withdrawable / reserved / paid), payout
  policy, payout accounts, referrals, campaign totals, payouts and ledger.
- **`GET /api/affiliate/share-link?path=/activity/x&subId=reels-march`**: Builds
  a trackable deep link.

### 8.3 Payout accounts (Requires authentication)
- **`GET /api/affiliate/payout-accounts`**: Accounts on file. Account numbers are
  **masked** to the last four digits.
- **`POST /api/affiliate/payout-accounts`**: Adds a bank account (verified by
  penny drop) or a UPI ID.
  - **Body (bank)**: `{ "method": "BANK_TRANSFER", "accountNumber": "...", "ifsc": "HDFC0001234", "accountHolder": "...", "accountType": "SAVINGS", "makePrimary": true }`
  - **Body (UPI)**: `{ "method": "UPI", "upiId": "name@okhdfcbank" }`
  - A *second* or later account is verified immediately but cannot receive a
    payout for 24 hours (`usableFrom`); the first account is exempt.
  - **Errors**: `400` malformed details, `409` already on file.
- **`PATCH /api/affiliate/payout-accounts/:id/primary`**: Points future payouts at
  this account.
- **`DELETE /api/affiliate/payout-accounts/:id`**: Archives it. `409` while a
  payout to it is in flight.

### 8.4 Payouts (Requires authentication)
- **`GET /api/affiliate/payout-preview?amountInr=5000`**: Balances plus the
  gross / TDS / net split for this amount, before committing to it.
- **`POST /api/affiliate/payout/request`**: Requests a withdrawal.
  - **Body**: `{ "amountInr": 5000, "paymentMethod": "BANK_TRANSFER", "payoutAccountId": "affacc_..." }`
  - **Errors**: `403` KYC incomplete, PAN not verified (`code: "PAN_NOT_VERIFIED"`),
    account unverified, or account still cooling off; `400` below the ₹1,000 minimum or above the withdrawable
    balance (the message names how much is still clearing).

### 8.5 Admin (`/api/admin/affiliates`, requires `ADMIN`)
- **`GET /api/admin/affiliates`**: Lists creators. Filters: `status`,
  `kyc_status`, `search`.
- **`PATCH /api/admin/affiliates/:id/status`**: `ACTIVE`, `SUSPENDED`, `REJECTED`, `PENDING`.
- **`PATCH /api/admin/affiliates/:id/kyc`**: Manual PAN decision. **Cannot** mark
  a bank account verified — only the bank can.
- **`POST /api/admin/affiliates/:id/refresh-tier`**: Recomputes the tier.
- **`GET /api/admin/affiliates/:id/payout-accounts`**: Accounts (including
  archived) plus derived balances.
- **`GET /api/admin/affiliates/payouts?status=REQUESTED`**: The payout queue.
  Destinations are **masked**; each row carries gross, TDS and net.
- **`GET /api/admin/affiliates/payouts/:id/instrument`**: The full bank details
  and the exact net amount to transfer. **This disclosure is audit-logged with
  the acting admin.**
- **`POST /api/admin/affiliates/payouts/:id/settle`**: `{ "utrReference": "..." }`.
  Marks the funding commissions `PAID`.
- **`POST /api/admin/affiliates/payouts/:id/reject`**: `{ "reason": "..." }`.
  Returns the balance to the creator.

## 9. Travel & Earn Endpoints (`/api/referral`, `/api/loyalty`)

See BUSINESS_RULES §11.

### 9.1 Public
- **`POST /api/referral/track-click`**: `{ "referralCode": "REF-…", "visitorId": "…", "channel": "WHATSAPP|QR|REVIEW|VOUCHER|COPY|CODE|OTHER", "landingPath": "/signup" }`.
  Records a referral link click for 30 days. Returns `{ tracked, attributionExpiresAt, referrerFirstName }`
  or `{ tracked: false, reason: "UNKNOWN_CODE" | "SELF" }`. Rate limited to 60/minute.
- **`GET /api/referral/qr/:code.svg?ch=QR`**: SVG QR code for the invite link,
  rendered server-side.
- **`GET /api/loyalty/public-ref/:code`**: `{ valid, referrerName, friendDiscountPct, message }`.
  Only the referrer's first name is returned.
- **`POST /api/auth/signup`** accepts `referralCode` and `visitorId`. Response
  includes `referral: { referred: true }` when a relationship was created, else `null`.

### 9.2 Checkout
- **`POST /api/bookings/quote`** accepts `referral_code` and `visitor_id` and returns
  `quote.referral: { eligible, discountInr, referrerFirstName, reason }`. `reason`
  is one of `FIRST_TRIP_USED`, `BLOCKED`, `EXPIRED`, `SELF_REFERRAL`,
  `SAME_PHONE`, `EMAIL_ALIAS`, `SAME_DEVICE`, `NOT_NEW_TRAVELER`, `UNKNOWN_CODE`,
  `NO_REFERRAL`, `AFFILIATE_REFERRAL`. Commission is never returned.
  With a coupon `promo_code` it also returns `quote.coupon: { valid, code,
  description, discountInr, capped }`, or `{ valid: false, code, discountInr: 0, error }`
  for a code that doesn't apply. `discountInr` is within the giveaway cap
  (BUSINESS_RULES §3.2) and is exactly what the booking charges. `null` without a code.
- **`POST /api/bookings`** accepts `referral_code`, `promo_code` and `wallet_credit_inr`,
  and returns `referral_discount_inr`, `coupon_discount_inr` and
  `wallet_credit_applied_inr` alongside `amount_inr` (what the payment gateway
  charges) and `original_amount_inr`. A `promo_code` that is no longer valid
  returns the promo error (`400`/`404`) and creates no booking.
- **`POST /api/promo/validate`** with a `REF-` code returns `type: "REFERRAL"`,
  `discountAmount: 0`: the rupee discount is priced by the quote, not here.

### 9.3 Traveler (requires authentication)
- **`GET /api/loyalty/profile`**: Code, link, wallet (`walletBalanceInr`,
  `expiringSoonInr`, `nextExpiryAt`, `clawbackPendingInr`), totals by stage
  (`totalCreditsEarned`, `clearingCredits`, `upcomingCredits`, `inReviewCredits`),
  `friends`, `rewards` (each with `stage`: `UPCOMING_TRIP`, `CLEARING`,
  `IN_REVIEW`, `CREDITED`, `REVERSED`), tier, `policy`, `referredBy`, and the
  last 20 wallet transactions.
- **`GET /api/referral/me`**: The referral part of the above on its own.
- **`GET /api/promo/user/referral`**: The profile, wrapped as `{ referral }`, for
  older clients.

### 9.4 Operations (requires `ADMIN` or `STAFF`)
- **`GET /api/referral/admin/metrics?days=90`**: Clicks, friends joined,
  referred first trips and bookings, GMV and margin from referred bookings,
  friend discounts, referrer credit cleared, `costPctOfMargin`,
  `clickToFirstTripPct`, `viralCoefficient`, reversals, wallet issued / redeemed /
  expired / `breakagePct`, `walletDiscrepancies`, and abuse signals by type.
- **`GET /api/referral/admin/review`**: `{ rewards, blockedRelationships, signals }`.
- **`POST /api/referral/admin/rewards/:id/review`**: `{ "decision": "APPROVE" | "REJECT", "note": "…" }`.
  Approve clears on the next lifecycle run.
- **`PATCH /api/referral/admin/relationships/:id`**: `{ "status": "ACTIVE" | "BLOCKED", "reason": "…" }`.
  Reopening also clears the review flag.

---

## Program Settings (`/api/admin/programs`, requires `ADMIN`)

Rules: BUSINESS_RULES §3.2. Changes apply to new bookings only.

- **`GET /api/admin/programs`** → `{ programs: [{ key, label, settings, defaults, updatedAt, updatedBy }] }`.
- **`PUT /api/admin/programs/:key`** `{ settings: { … }, reason }` → `{ key, settings, changed, previous }`.
  `settings` is a partial change. `400` with `code: "INVALID_SETTINGS"` for an
  unknown field or out-of-range value, `400` without a reason (3–500 characters),
  `404` for an unknown program. A change that alters nothing returns `changed: false`
  and writes no history.
  - `giveaway`: `{ maxBookingValuePct }`, 0–50, default 10.
  - `supplier_subscriptions`: `{ launchWaiver, launchWaiverUntil: "YYYY-MM-DD" | null }`,
    default `{ true, null }`. A change re-syncs launch waivers and returns
    `launchWaivers: { created, updated }` (SUPPLIER_PLANS.md §2).
  - `referral`: `{ enabled, friendDiscountPct, referrerRewardPct, earningWindowMonths,
    attributionWindowDays, clearingHoldDays, creditExpiryMonths, expiryReminderDays,
    maxSignupsPerDay, maxClearedPer30DaysInr, walletMaxSharePct, walletMaxPerBookingInr }`
    (defaults 10/10/24/30/7/12/30/5/5000/50/2000). `GET /api/loyalty/profile` returns
    them (with `enabled` and the wallet limits) in `policy`; quotes return
    `referral.reason: "PAUSED"` while off.
  - `400 OVER_GIVEAWAY_CAP` when referral rates at the highest commission in use
    (default or any override) would exceed the giveaway cap — for a `referral`,
    `giveaway` or `commission` change, or a commission override.
  - `commission`: `{ defaultRatePercent }`, 0–50, default 30. Also accepts
    `notify` (default `true`): a change records a `PLATFORM` commission change and
    notifies approved suppliers on the default.
- **`GET /api/admin/programs/audit?key=`** → `{ changes: [{ id, key, before, after, changedBy, changedByName, reason, createdAt }] }`, newest first, up to 200.

## Commission (`/api/admin`, requires `ADMIN`)

Rules: BUSINESS_RULES §3.2. Each change needs a `reason` (3–500 characters),
applies to new bookings only, and is recorded in `commission_rate_changes`.

- **`GET /api/admin/commission`** → `{ defaultRatePercent, suppliers: [{ id, name, kybStatus, rate }], products: [{ id, title, supplierId, supplierName, rate }], changes: [...] }`: the overrides in force and the last 100 changes.
- **`PUT /api/admin/products/:id/commission`** `{ commissionRate: 0–50 | null, reason }` → `{ productId, supplierId, override, rate, change }`. `null` clears the product's own rate.
- **`POST /api/admin/suppliers/:id/commission`** `{ commissionRate: 0–50 | null, reason }` → `{ supplierId, override, rate, change, message }`.
- **`POST /api/admin/commission/clear-overrides`** `{ includeProducts = false, notify = true, reason }` → `{ defaultRatePercent, clearedSuppliers, clearedProducts, changes }`.
- `change` is `null` when nothing changed, else `{ id, scope, oldRate, newRate, notify }`. Notices are sent in the background and stamp `notified_at`.
- `/api/admin/categories/commission` was removed: categories no longer set commission.
- Admin product and supplier lists, and `GET /api/suppliers/:id` (supplier and each product), include `commission_rate_effective`.

## Supplier Subscriptions (`/api/admin`, requires `ADMIN`)

Rules: [`SUPPLIER_PLANS.md`](SUPPLIER_PLANS.md). Each change needs a `reason` (3–500 characters).

- **`GET /api/admin/supplier-subscriptions`** → `{ suppliers: [{ id, name, city, kybStatus, signedUpAt, covered, cover, history }] }`: every non-exempt supplier.
- **`GET /api/admin/suppliers/:id/subscription`** → `{ subscription: { supplierId, required, exempt, covered, cover: { id, status, source, endsAt } | null, history } }`. `GET /api/suppliers/:id` includes the same object as `subscription`.
- **`POST /api/admin/suppliers/:id/subscription/waiver`** `{ until: "YYYY-MM-DD" | null, reason }` → `201 { waiver, subscription }`. `400 INVALID_DATE` for a past or malformed date.
- **`POST /api/admin/supplier-subscriptions/:id/end`** `{ reason }` → `{ subscription }`. `409 NOT_ACTIVE` if already ended.
- A quote for an uncovered supplier's product is `409` with `code: "SUPPLIER_SUBSCRIPTION_REQUIRED"`; its listing and detail pages return `404` like an unapproved supplier's.

## Coupons (`/api/admin/coupons`, requires `ADMIN`)

Rules: [`COUPONS.md`](COUPONS.md).

- **`GET /api/admin/coupons`** → `{ coupons: [{ id, code, description, discountType, discountValue, minOrderInr, maxDiscountInr, usageLimit, timesUsed, perUserLimit, firstBookingOnly, startsAt, expiresAt, productTypes, productIds, supplierIds, isActive, isCreatorCode, redeemedCount, discountGivenInr, createdAt, updatedAt }] }`.
- **`POST /api/admin/coupons`** `{ code, discountType: PERCENTAGE|FIXED, discountValue, description?, minOrderInr?, maxDiscountInr?, usageLimit?, perUserLimit?, firstBookingOnly?, startsAt?, expiresAt?, productTypes?, productIds?, supplierIds?, isActive? }` → `201 { coupon }`. `400 INVALID_COUPON` / `RESERVED_CODE` (`REF-`), `409 CODE_TAKEN`.
- **`PATCH /api/admin/coupons/:id`** (same fields, all optional) → `{ coupon }`. `400 CODE_IMMUTABLE` for a new code; `409 CREATOR_CODE` for anything but `isActive` on a creator's code.
- **`GET /api/admin/coupons/:id/redemptions`** → `{ coupon, redemptions: [{ id, bookingId, bookingRef, userId, userName, discountInr, chargedInr, paymentStatus, bookingStatus, status, releaseReason, releasedAt, createdAt }] }`, newest first, up to 200.
- **`POST /api/promo/validate`** also accepts `productId` (checks targeting) and returns the rule's `code` on failure: `NOT_STARTED`, `WRONG_AUDIENCE`, `SIGN_IN_REQUIRED` (401), `PER_USER_LIMIT`, `FIRST_BOOKING_ONLY`, `NOT_APPLICABLE`. `429` after 30 checks a minute. A booking refused for a coupon returns the same codes, or `409 USAGE_LIMIT` when the last use was just taken.
