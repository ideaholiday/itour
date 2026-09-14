# Plan: Commission, Coupons, Share & Earn, Affiliates, Supplier Subscriptions

> **Summary:** Plan for 5 admin-controlled money programs: 30% commission, admin coupons, admin-tunable Share & Earn, affiliate earnings you can spend, and required subscriptions for new suppliers with admin waivers and coupons.
> **Read when:** Building any of these programs. **Status:** APPROVED by the owner 2026-09-14 ([ADR 017](../DECISIONS.md)). Not started; it isn't on the ROADMAP yet.

Most of this is already built. This plan **extends** what exists and does not rebuild it
(R1, R2). File references are from the `feat/supplier-profiles` branch.

---

## 0. Owner decisions (ADR 017)

| Topic | Decision |
| :--- | :--- |
| Commission | **30% for every supplier, now**, on new bookings. Admins can set a different rate per product. No notice for this change; **later rate changes send the supplier a notice**. |
| Giveaway cap | Everything a booking gives away together ≤ **10% of booking value** (and never more than its commission). Admins set the cap. |
| Affiliate base | Stays a **% of booking value**. |
| Affiliate TDS | **1%** on every payout, including moves to the wallet. **A verified PAN is required to be paid.** |
| Supplier subscription | **Required for suppliers who sign up from 2026-09-14**: products aren't bookable until the subscription is paid, waived or covered by a coupon. Suppliers registered before then are exempt. |
| Payment gateway | **Cashfree** |
| Subscription invoice | **SAC 998559, GST 18%** |
| Launch waiver | New suppliers covered free, **no end date yet**; admin sets it later |
| Subscription price | **Decided later** |

**Still open** (these don't block Phases 0–3):
- Subscription price and billing period (yearly or monthly).
- New affiliate tier values that fit the 10% cap (§7a).
- Which Income Tax section the 1% TDS falls under (CA). This affects the section printed on payout statements.

**Progress (2026-09-14):**
- Built: step 1 coupon bug (migration 036); Phase 0 settings + giveaway cap
  (037); Phase 1 30% commission per product (038); Phase 4b 1% TDS + verified PAN;
  Phase 5 core — exemption, bookability check, launch and admin waivers, expiry
  and reminders (039); Phase 3 Share & Earn settings (in Admin → Programs, not a
  tab in Travel & Earn). Rules for subscriptions live in `docs/SUPPLIER_PLANS.md`.
- Next: Phase 2 coupon engine + admin UI.
- Waiting on the owner: new affiliate tier rates (Phase 4a), subscription price
  (Phase 5 payment, supplier coupons). Phase 4c (spend affiliate earnings) can follow 4a.

---

## 1. What already exists

| Program | Built today | Missing for this request |
| :--- | :--- | :--- |
| Commission | `resolveCommissionRate` ([financeService.js](../../backend/src/services/financeService.js)): supplier override → category default → supplier rate → 18. Frozen on the booking (`commission_rate_snapshot`). Admin can set it per supplier and per category, capped at 50%. | No **per-product** rate. The platform default is hard-coded as `18` (also in `transferEngine.js` and `routes/transfers.js`). Category codes (`DAY_TOUR`, `MULTI_DAY_PACKAGE`) don't match the product types (`TOUR`, `PACKAGE`). |
| Coupons | `promo_codes` + `validatePromoCode` / `applyPromoCode` ([promoService.js](../../backend/src/services/promoService.js)). | **Bug:** checkout *shows* the coupon discount ([Checkout.jsx:334](../../frontend/src/pages/Checkout.jsx#L334)), but the booking route never subtracts it from `amount_inr`, so the traveler pays full price. This affects affiliate coupons too. No admin page, per-user limit, targeting, or budget. |
| Share & Earn | Travel & Earn v3 ([referralService.js](../../backend/src/services/referralService.js), BUSINESS_RULES §11). | The rates are frozen constants in `REFERRAL_POLICY`. |
| Affiliates | Full program (BUSINESS_RULES §10): tiers, 14-day hold, payouts, TDS 5%/20% (`TDS_RATE_WITH_PAN` / `TDS_RATE_WITHOUT_PAN` in [affiliateService.js](../../backend/src/services/affiliateService.js)). | Admins can't edit tiers or rates. Earnings can't be spent. The TDS rates don't match ADR 017. No verified-PAN requirement. |
| Supplier subscriptions | Nothing. The bookability check is one function, `approvedSupplierSql` ([supplierKybGate.js](../../backend/src/services/supplierKybGate.js)), used by search, activities, availability, traveler, SEO and OCTo. | Plans, subscriptions, payments, waivers, supplier coupons, and the bookability check. |

---

## 2. The rule that holds every program together: the 10% giveaway cap

At 30% commission, a ₹10,000 booking earns ₹3,000 commission and pays the supplier ₹7,000.
The programs together may give away at most **₹1,000** of that ₹3,000.

**New rule (for BUSINESS_RULES §3.2):**

```
giveaway = coupon discount + referral friend discount + referrer credit
         + affiliate commission + affiliate traveler discount
giveaway ≤ min(booking value × max_giveaway_pct (10%), commission_amount)
```

- **Discounts come out of commission, never out of the supplier's payout**:
  `amount_inr + wallet_credit + referral_discount + coupon_discount = commission + supplier_payout`.
- **Order when over the cap:** the admin coupon discount is cut first, then the
  affiliate traveler discount. Money already promised to a referrer or creator is never cut
  after the fact; the admin screens stop those rates from being set too high in the first
  place. The booking is never refused because of the cap; checkout shows the capped
  discount from the server quote.
- **Wallet credit isn't counted.** The platform already paid for it on the earlier booking that
  earned it, or it is the affiliate's own earned money (§7b).
- **The admin screens refuse settings that can't fit**, for example affiliate rate +
  traveler discount > 10%. The form shows a worked ₹10,000 example.

| Program on a ₹10,000 booking | Today's rate | Rupees | Fits in ₹1,000? |
| :--- | :--- | :--- | :--- |
| Share & Earn (first trip) | 10% + 10% of ₹3,000 commission | ₹600 | Yes |
| Share & Earn (later trips) | 10% of commission | ₹300 | Yes |
| Affiliate Starter | 10% + 5% traveler discount | ₹1,500 | **No** |
| Affiliate Elite | 15% + 7% | ₹2,200 | **No** |

---

## 3. Phase 0: shared foundation

**Migration `036_program_settings.sql`**
- `program_settings` (`key`, `value_json`, `updated_by`, `updated_at`): one row per program
  (`commission`, `giveaway`, `coupons`, `referral`, `affiliate`, `supplier_subscriptions`).
- `program_settings_audit`: append-only (old value, new value, admin id, reason).

**Service `programSettingsService.js`**
- `getSettings(db, key)`: validated with zod 4, with defaults that match today's behaviour, so
  deploying Phase 0 on its own changes nothing.
- `updateSettings(db, key, patch, adminId, reason)`: one transaction, validates, checks the
  giveaway cap, writes the audit row.
- `giveawayBudget({ bookingValue, commissionAmount })`: the single place the cap is
  calculated.
- Cached per process for 60 s and cleared on write.

**Frozen at booking.** Every program copies the rate it used onto its own row, so a settings
change applies only to **new** bookings (invariant 3).

**Admin UI:** a "Programs" view in `frontend/src/pages/admin/` with one tab per program and
an "Audit" tab.

---

## 4. Phase 1: 30% commission, set per product

1. Migration: `products.commission_override_rate REAL NULL`, plus a `commission_rate_changes`
   audit table (scope PLATFORM | CATEGORY | SUPPLIER | PRODUCT, old rate, new rate,
   admin, `notified_at`).
2. `resolveCommissionRate(db, supplierId, productType, productId)`, most specific first:
   **product override → supplier override → platform default (setting, 30)**. Category defaults
   are dropped from the order, because their codes don't match product types and "30% for
   everyone" makes them redundant. The table stays (append-only rule). Callers
   (`bookingService`, `circuitOrderService`, `supplierAssignmentService`, `transferEngine`,
   `routes/transfers.js`) pass `productId` and stop hard-coding `18`.
3. **"Everyone, now":** existing `suppliers.commission_override_rate` values would keep those
   suppliers off 30%. A one-time admin action, "Apply 30% to all suppliers", lists the
   suppliers that have overrides (count and names) and clears them after a confirm click. It
   is logged, and the list is kept in the audit table, so it can be reversed.
   `supplierVerificationService` only keeps an existing override (`COALESCE`), so KYB
   approval won't bring overrides back.
4. **Notice for later changes:** changing a product, supplier or platform rate after launch
   sends the affected suppliers a notice (email + WhatsApp through the existing outbox) and
   sets `notified_at`. The launch change to 30% sends none.
5. Admin API: `PUT /api/admin/products/:id/commission` and `PUT /api/admin/programs/commission`.
   The existing supplier route also writes an audit row and sends a notice.
6. Supplier extranet: "Platform commission: 30% · you receive ₹X" on each product and in
   the price editor.

**Effect on money:** commission is taken out of the traveler price, so traveler prices don't
change and suppliers receive 70% instead of 82%. Existing bookings keep their frozen rate.

**Tests:** resolution order; rate frozen on the booking; a hold keeps its price; circuit orders
use the product rate; "apply to all" clears overrides; later changes queue a notice and the
launch change doesn't.

---

## 5. Phase 2: admin coupons

**Fix the discount bug first.** On its own this is a pricing-correctness fix (invariant 1).
- `bookings.coupon_discount_inr` (migration). The booking route calculates the discount **on
  the server** from the server quote, caps it (§2), and subtracts it from `amount_inr` in the
  booking transaction.
- Checkout shows the discount from the server's response.
- The discount comes out of commission.

**Migration: extend `promo_codes`** (with `ALTER` only, R7):
- `audience` (`TRAVELER` | `SUPPLIER_SUBSCRIPTION`), `per_user_limit`,
  `first_booking_only`, `starts_at`, `product_types_json`, `product_ids_json`,
  `supplier_ids_json`, `created_by`.
- `coupon_redemptions` (`coupon_id`, `user_id`, `booking_id` UNIQUE, `discount_inr`, `status`
  ACTIVE | RELEASED). Usage is counted from these rows, not from `times_used`.
- Released when a booking is abandoned before payment or fully refunded.

**Rules**
- One typed code per booking: an admin coupon, a creator coupon or a traveler `REF-` code
  (§11.1.5). A Share & Earn first-trip discount from a signup link can combine with an admin
  coupon, within the cap. Wallet credit can be added on top.
- Supplier `native_promotions` apply first; the admin coupon applies to what's left.
- Admin API: CRUD at `/api/admin/coupons` and a redemption report. Deactivate, never delete.
- Rate-limit `/api/promo/validate` so codes can't be guessed by brute force.

**Tests:** charged amount = quote − capped coupon; per-user limit; release on abandon; stacking
refused.

---

## 6. Phase 3: Share & Earn under admin control

1. `REFERRAL_POLICY` becomes `getSettings(db, "referral")`, with the same keys and today's
   values as defaults. `computeReferralAmounts` already accepts `policy`.
2. **What the admin can set:** friend %, referrer % (both **% of commission**, as today),
   first-trip-only, earning window, clearing hold, credit expiry, fraud limits, wallet spend
   limits (50% / ₹2,000), and an on/off switch.
3. **Limit:** at the lowest commission in use,
   `(friend % + referrer %) × commission rate ≤ 10% of booking value`. At 30% commission that
   means friend + referrer ≤ 33% of commission. Today's 10% + 10% fits.
4. Rates stay frozen on `referral_rewards`.
5. A "Rules" tab in the existing `ReferralProgramView`.

**Tests:** a changed rate applies only to new rewards; switching off stops new rewards but
existing ones still clear; over-cap settings are refused.

---

## 7. Phase 4: affiliates

### 7a. Admins set the rates
- CRUD for `affiliate_tiers` plus per-affiliate overrides
  (`affiliates.commission_override_rate`, `traveler_discount_override_pct`) for negotiated
  deals.
- **Every tier and override must have `rate + traveler discount ≤ 10%`.** Today's tiers
  (10+5, 12+5, 15+7) don't fit. Before this phase ships, the owner or an admin picks new
  values. Commission already accrued keeps its rate (BUSINESS_RULES §10.2.2). A migration
  must not change a live creator's rate silently: new tiers apply to new bookings, and
  creators are told.
- Keep each creator's `promo_codes` discount in step with their tier (the tier refresh does this
  already).

### 7b. TDS and PAN (ADR 017)
- Replace `TDS_RATE_WITH_PAN` (5%) and `TDS_RATE_WITHOUT_PAN` (20%) with one setting,
  `tdsRate = 0.01`.
- **A payout request without a verified PAN is refused** (`PAN_NOT_VERIFIED`) for both bank
  payouts and wallet transfers. Commission still accrues; only payment waits for the PAN.
- The "u/s 194H" label in the ledger note becomes a setting until the CA confirms the section.
- Update BUSINESS_RULES §10.5.2 and the payout preview UI.

### 7c. Spend earnings on bookings ("Use for travel")
- A **payout with `method = 'WALLET'`**: reuses the balance maths, ledger and PAID settlement.
- 1% TDS withheld; the net amount is posted with `postWalletEntry` as `AFFILIATE_TRANSFER`,
  with a new column `wallet_transactions.credit_source` (`REFERRAL` | `AFFILIATE` |
  `ADJUSTMENT`).
- Affiliate credit **never expires**, isn't limited by the 50% / ₹2,000 caps (it can pay up to
  100% of a booking), and is spent after credit that expires. Refunds give it back in the same
  share as the cash refund.
- One-way: it can't be turned back into cash (§11.4.4). No ₹1,000 minimum.

**Tests:** PAN required; 1% TDS on bank and wallet payouts; balance can't be spent twice
(cash and wallet in parallel); credit with no expiry spent last; refund gives it back; a tier over
the cap is refused.

---

## 8. Phase 5: required subscriptions for new suppliers

**Migration `supplier_plans`, `supplier_subscriptions`, `supplier_plan_payments`,
`product_spotlights`**, plus `suppliers.subscription_exempt INTEGER` set to 1 **by the
migration** for every supplier registered before 2026-09-14.
- `supplier_plans`: code, name, price, GST %, billing period, benefits, `required_to_sell`
  (the subscription plan) or optional add-on (Verified check, Spotlight, per ADR 008),
  active. **Prices are admin-editable; the subscription price is still to be set.**
- `supplier_subscriptions`: supplier, plan, status (`PENDING_PAYMENT` | `ACTIVE` | `WAIVED` |
  `EXPIRED` | `CANCELLED`), `starts_at`, `ends_at`, `source` (`PURCHASE` | `WAIVER` |
  `COUPON`), `waived_by`, `waiver_reason`.
- `supplier_plan_payments`: gross, coupon discount, taxable value, GST, total, Cashfree order
  and payment ids, invoice number.

**Bookability** (changes `approvedSupplierSql`, so every sales channel gets it at once):

```
KYB APPROVED  AND  product PUBLISHED
AND ( supplier.subscription_exempt = 1
      OR an ACTIVE or WAIVED required subscription covers today )
```

- **Confirmed bookings are always honoured** when a subscription lapses; only new bookings stop.
  Active holds finish.
- Profiles stay public and indexable once KYB is approved (ADR 008). An unsubscribed new
  supplier's profile shows "Not taking bookings yet".
- The supplier extranet shows a banner and a subscribe button until the supplier is covered.
  Suppliers can still create and publish products before paying.

**Admin waiver**
- Per supplier: plan, end date, reason. `WAIVED`, no payment, no invoice.
- **Launch waiver** switch (setting `launchWaiverUntil`): new sign-ups before that date get
  `WAIVED` until then. Turning it off doesn't affect waivers already given.
- A waiver never grants the Verified badge; the check still has to pass (ADR 008).

**Supplier coupons:** `promo_codes` with `audience = 'SUPPLIER_SUBSCRIPTION'`, limited to
certain plans and with per-supplier and total usage limits. GST is charged on the discounted
price. A 100% coupon creates a subscription with `source = COUPON` and no payment.

**Payment:** Cashfree one-time orders, using the existing checkout/webhook verification
pattern. Activate only after the server verifies the payment, never from a browser redirect.
GST tax invoice with SAC 998559 at 18%.

**Renewal:** a daily job sends reminders 30, 7 and 1 days before `ends_at` (waivers included),
then marks the subscription `EXPIRED`. Products go off sale on the next quote.

**Tests:** an exempt supplier is always bookable; a new unsubscribed supplier is hidden in
search, activities, availability and OCTo; a waiver or 100% coupon makes it bookable; expiry
blocks new bookings but keeps confirmed ones; Cashfree webhook activation is idempotent.

---

## 9. Build order and delivery

| Order | Work | Why this order | Size |
| :--- | :--- | :--- | :--- |
| 1 | Coupon discount bug (Phase 2, first part) | Travelers are shown a price they aren't charged, today | S |
| 2 | Phase 0: settings + giveaway cap | Every other phase reads from it | M |
| 3 | Phase 1: 30% commission | Owner wants it now | M |
| 4 | Phase 4b: 1% TDS + verified PAN | Small; changes live payouts | S |
| 5 | Phase 5: exempt flag + bookability check + waiver | New suppliers are already "new" from 2026-09-14; ship the exempt flag and launch waiver before anything else in Phase 5 | M |
| 6 | Phase 3: Share & Earn settings | Small | S |
| 7 | Phase 2: rest of the coupon engine + admin UI | | M |
| 8 | Phase 4a: new affiliate tiers | Needs tier values from the owner | M |
| 9 | Phase 4c: spend affiliate earnings | | M |
| 10 | Phase 5: Cashfree payments, supplier coupons, renewals | Needs subscription price | L |

**Gap to know about:** suppliers who sign up between 2026-09-14 and step 5 shipping are "new"
under ADR 017. Until step 5 ships nothing enforces it, so they can sell. When it ships, turn on
the launch waiver so they don't suddenly lose bookings.

**Each step is its own PR** and must pass the AGENTS.md "done" checklist: one new migration
with `-- @down`, tests that fail without the change, `npm run check` green, Playwright checkout
journey green, `npm audit --omit=dev` at 0. Update these docs when a step lands:
BUSINESS_RULES (§3.2 cap, §10.5, §11, new §13 subscriptions), DATA_MODEL, API_CONTRACTS,
CODEMAP.

**Security (SECURITY.md):** every settings, coupon, waiver and commission endpoint is
admin-only, validated with zod and audit-logged. The browser never sends a rate, a discount
amount, a waiver flag or a payment status that the server trusts.
