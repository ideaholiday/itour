# Plan: Cross-Border Listings, Asia and Europe Suppliers, Individual Vehicle Owners

> **Summary:** Three plans: (A) an Indian supplier lists a product in another country, (B) suppliers from more Asian and European countries, (C) individual owners (one or more vehicles) join without GST, using PAN, Aadhaar, driving licence and vehicle RC.
> **Read when:** Building any of these. **Status:** Partly decided 2026-09-22 ([ADR 024](../DECISIONS.md)): order, country list, GST for A, owner auto-approval. D1, D4–D8 and the Cashfree DL/RC check are still open. Not on the ROADMAP.

Builds on ADR 022/023 (Thailand, UAE). File references are from `feat/supplier-profiles`.
Nothing here starts until the owner answers §0 and it is recorded in `DECISIONS.md` (R8).

---

## 0. Owner decisions needed

| # | Question | Why it blocks |
| :--- | :--- | :--- |
| D1 | Can an Indian supplier sell in **any** listing country, or only where they hold that country's licence (e.g. TAT for Thailand)? | Decides whether A needs extra documents. |
| D2 | ~~GST when an Indian supplier sells abroad~~ **Decided: 18% GST, no TDS** (ADR 024). | Tax must key on supplier country + product country, not product city alone. |
| D3 | **Decided:** UAE, Singapore, Thailand (live), Indonesia, Maldives, Bhutan, Japan, Vietnam, China, Nepal; Europe last (ADR 024). | Each country needs its own document list, time zone and tax rule. |
| D4 | **Europe payouts.** PRODUCT non-goal 3 says everything settles in INR. EU suppliers realistically need EUR payouts. | Contradicts a non-goal — owner must lift it or keep INR-only for Europe. |
| D5 | Europe compliance: VAT on travel (TOMS), DAC7 platform reporting of sellers, GDPR. | **UNKNOWN — needs legal advice.** Europe should not open until answered. |
| D6 | Individual owners (C): confirm this fits non-goal 5 ("verified suppliers with valid KYB only") — they would be KYB-verified, just as individuals. Non-goal 4 (no self-drive) still holds: owner must be or employ the driver. | Scope check. |
| D7 | GST for a non-GST owner's transfer bookings. For cab services sold through an e-commerce operator, the platform may have to pay the GST itself (section 9(5)). | **UNKNOWN — needs a CA.** Changes who pays the 5% on the quote. |
| D8 | Aadhaar: we must **not store the full Aadhaar number** (UIDAI rules). Use Cashfree Aadhaar OKYC / DigiLocker and keep only the last 4 digits + verified name. | Confirms the approach. |

---

## A. Indian supplier lists a product in another country

**What already works:** the product's country comes from the product's **city**
(`productCountry` in `lib/productTax.js`, `resolveCatalogLocation` in `lib/locationCatalog.js`).
Local time (L2), 0% GST (L4), traveler display and receipts (L5) all follow the product's city.
So an Indian supplier picking Bangkok most likely already passes the create route. **Verify first with a test.**

**Gaps:**
1. **Documents follow the supplier, not the product.** `missingTransferDocument` uses the supplier's base
   city, so an Indian supplier's Bangkok transfer never asks for the Thai vehicle permit. Fix: check the
   **product's** country rules for `transfersOnly` documents at publish (`transferPublishRefusal`, `routes/suppliers.js:89`).
2. **Operating licence per country (D1).** If yes: new table `supplier_country_permits`
   (supplier_id, country, doc refs, status, reviewed_by) — admin approves a supplier for a country.
   Publishing a product abroad requires an approved permit for that country. Home-country KYB stays as is.
3. **Tax (D2, decided).** Indian supplier + product abroad = **18% GST**, no TDS. Thai supplier in Thailand stays 0%. Change `isGstFreeProduct`/quote in `bookingService.js` to use supplier country + product country.
4. **UI:** supplier city picker already groups by country; show "needs {country} approval" on locked countries.
5. **Tests:** `integration/crossBorderListing.test.js` — Indian supplier creates a Bangkok tour (allowed), a Bangkok
   transfer without the Thai permit (409), Dubai (still refused).

Steps: A1 test current behaviour → A2 product-country documents at publish → A3 country permits (migration) → A4 tax after D2.

---

## B. Suppliers from more Asian and European countries

Adding a country today touches five fixed lists. Do this per country:

| Where | Change |
| :--- | :--- |
| New migration | Insert base cities into `destinations` with `country` (like 049). |
| `lib/locationCatalog.js` | Add to `LISTING_COUNTRIES` when listings open. |
| `lib/localTime.js` | Add to `COUNTRY_TIME`. |
| `services/supplierVerificationService.js` | Add `KYB_COUNTRY_RULES` entry (documents per country). |
| `lib/productTax.js` | Tax rule for the country. |
| `lib/phone.js` + phone picker | Mobile format and country option. |
| `currencyService.js`, `frontend/src/lib/currency.jsx` | Display currency (fixed rate, like THB). |
| `seo.js` | Automatic once a live product exists (`liveCountries`). |

**Asia (after D3):** same shape as Thailand — admin-approved local documents, INR payouts, 0% GST
(confirm per country). Low risk; one country per PR.

**Europe — extra work, blocked on D4/D5:**
1. **Daylight saving.** `localTime.js` assumes fixed offsets ("no daylight saving"). European times need
   real zone conversion (`Intl` with the IANA zone) — must be done and tested before any EU listing.
2. **Payouts in EUR/GBP** (D4) — new payout rail; out of scope until non-goal 3 is lifted.
3. **VAT / DAC7 / GDPR** (D5) — seller reporting data (tax ID, address) in KYB; GDPR data rights for EU travelers.
4. **Several zones per country** is not an issue for Western Europe but is for Indonesia/Russia etc.; key
   time zone by city, not country, if such a country is added.

Suggested order: B1 refactor the five lists into one `COUNTRIES` config (only if owner agrees — R6) → B2 Asian countries one by one → B3 DST support → B4 Europe after D4/D5.

---

## C. Individual owners with vehicles, no GST

**Today:** India KYB requires a **commercial transport licence + PAN** (`REQUIRED_KYB_DOCUMENTS`), and
automatic approval needs **GSTIN + PAN**. A single cab owner without GST can only wait for manual review.

**Plan:**
1. **Supplier kind.** Migration: `suppliers.supplier_kind` = `BUSINESS` (default, today) | `INDIVIDUAL_OWNER`
   (one person, one or more vehicles). Reuse existing `business_type` only if it is unused for logic (check first).
2. **Individual KYB rules (India)** — new entry used when `supplier_kind = INDIVIDUAL_OWNER`:
   - PAN (required) — Cashfree verify
   - Aadhaar (required) — Cashfree OKYC/DigiLocker; store only last 4 digits + name (D8)
   - Driving licence (required, per driver) — Cashfree DL verify; must be a commercial/transport licence
   - Per vehicle: RC (Cashfree vehicle RC verify), **commercial permit**, insurance, fitness certificate (with expiry dates)
   - Bank account (cancelled cheque / penny-drop)
   - Name match: PAN name = Aadhaar name = bank holder = RC owner (or an owner-authorisation letter)
   - **Confirm Cashfree SecureID offers DL and RC checks on our plan — UNKNOWN until checked.**
3. **Vehicles as records.** Reuse `resources` (migration 023, "one vehicle") — add registration number,
   vehicle_type, seats, RC/permit/insurance doc refs and expiry dates in a new migration. Multi-vehicle owners
   add several. A vehicle with an expired document can't be assigned to a trip.
4. **Auto-approval (decided):** PAN + Aadhaar + DL + RC all verified and names match → KYB `APPROVED`,
   like ADR 009. Anything failed or missing → manual admin approval. Never grants the Verified badge.
5. **Tax (D7):** quote logic in `bookingService.js` must not assume the supplier charges GST; who pays follows the CA answer.
6. **Payouts:** INR to the owner's bank; TDS/TCS rules for individuals need the CA answer too.
7. **Signup UI:** "I am a company / I am an individual vehicle owner" on supplier signup; compliance page shows the right list.
8. **Products allowed:** transfers and private tours only (chauffeur-driven, non-goal 4).
9. **Security:** Aadhaar/DL/RC files are KYB files — never public, admin-only (SECURITY.md); add to PII list.
10. **Tests:** individual signup → docs → approval; expired insurance blocks assignment; full Aadhaar never stored.

Steps: C1 supplier_kind + document rules → C2 vehicle records with expiry → C3 Cashfree checks → C4 auto-approval → C5 tax after D7.

---

## Suggested overall order
1. **A1–A2** (small, mostly verifying what exists).
2. **C1–C3** (strong demand, India-only, no non-goal conflict once D6 confirmed).
3. **B2** Asian countries one by one.
4. **A3–A4, C4–C5** after CA answers.
5. **Europe** last, after D4/D5 and DST support.
