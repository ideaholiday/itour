# Plan: Cross-Border Listings, Asia and Europe Suppliers, Individual Vehicle Owners

> **Summary:** Three plans: (A) an Indian supplier lists a product in another country, (B) suppliers from more Asian and European countries, (C) individual owners (one or more vehicles) join without GST, using PAN, Aadhaar, driving licence and vehicle RC.
> **Read when:** Building any of these. **Status:** Partly decided 2026-09-22 ([ADR 024](../DECISIONS.md)): order, country list, GST for A, owner auto-approval. D1, D4–D8 and the Cashfree DL/RC check are still open. Not on the ROADMAP.

Builds on ADR 022/023 (Thailand, UAE). File references are from `feat/supplier-profiles`.
Nothing here starts until the owner answers §0 and it is recorded in `DECISIONS.md` (R8).

---

## 0. Owner decisions needed

| # | Question | Why it blocks |
| :--- | :--- | :--- |
| D1 | **Decided 2026-09-22:** Indian KYB (GSTIN + PAN, optional CIN, or admin approval) is enough to sell in any listing country; no foreign licence or vehicle document. | A2's document check was removed; A3 needs no permits table. |
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
3. **Vehicles as records.** Reuse the fleet, `supplier_drivers` (done, C2: migration 051) — add registration number,
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

---

## Progress (moved from ADR 024)

Still open: whether our Cashfree SecureID plan includes driving licence and vehicle RC checks (until confirmed, those documents go to manual review); a D1 per-country licence rule; GST on non-GST owners' cab bookings (section 9(5)); Europe payouts and VAT/DAC7/GDPR. Japan, and China if any Chinese city uses a different zone, must be checked against the fixed-offset time code; Japan has no daylight saving. A1 (done): an Indian supplier can already list a tour in a Thai city; nothing blocked it. A2 (built, then removed): a Thai vehicle document was briefly required for an Indian supplier's transfer abroad. A3 (owner decision 2026-09-22): **an Indian supplier sells abroad on its Indian KYB** — verified GSTIN + PAN, or an admin's manual approval — with no licence or vehicle document from the other country, transfers included. A Certificate of Incorporation (CIN) is an optional upload for Indian suppliers. Covered by `integration/crossBorderListing.test.js`. C1 (done): migration 050 adds `suppliers.supplier_kind`; signup offers "a company or firm" or "an individual vehicle owner (no GST)", the latter in India only. Owners get their own document list (`INDIVIDUAL_OWNER_RULES`): PAN, masked Aadhaar, commercial driving licence, vehicle RC, commercial permit, vehicle insurance, cancelled cheque; an admin approves once all are uploaded, and GSTIN checks are refused. The full Aadhaar number is never stored: an Aadhaar document number must be only the last 4 digits. Covered by `integration/individualOwner.test.js`. C2 (done): the fleet (`supplier_drivers`, not `native_resources` as the plan first said) records expiry dates for the driving licence, permit, insurance and fitness certificate (migration 051), set when adding a vehicle or later (`PATCH /api/suppliers/:id/drivers/:driverId/documents`). A vehicle whose papers expire before the trip date can't be assigned, by hand or by automatic dispatch; a date not entered doesn't block. This applies to every supplier's fleet. A driver typed in by hand at assignment (not from the fleet) isn't checked. Covered by `test/driverDispatchService.test.js`. A4 (done): an Indian supplier's product abroad quotes **18% GST** in place of India's rate, in every path that adds GST (booking quote, native-hold price check, OCTO); the traveler sees GST wording and gets a GST invoice, not a receipt. A Thai supplier's product in Thailand stays at 0%; Indian products are unchanged. The quote's GST line no longer says "5%". Covered by `integration/thaiProductTax.test.js` and `test/nativeInventoryService.test.js`. C3 (built, simulated only): Cashfree SecureID documents driving licence (`/verification/driving-license`) and vehicle RC (`/verification/vehicle-rc`) checks; **whether our Cashfree plan has them enabled is still unconfirmed**, and the request field names differ between Cashfree's doc versions, so both must be tried in the sandbox before going live. Every Indian supplier (owners included) can check a driver's licence and a vehicle's RC from Manage Fleet; a valid licence sets that row's licence number and expiry, a valid RC its insurance and permit expiry. Owners may check PAN, not GSTIN. Aadhaar OKYC (an OTP flow) is not built; owners upload a masked Aadhaar. Covered by `integration/ownerSecureIdChecks.test.js`. C4 (done): an individual owner is approved automatically (`kyb_approval_source = CASHFREE_SECUREID`) once Cashfree has verified their current PAN, a driving licence and a vehicle RC, the three names match (score ≥ 85, `OWNER_NAME_MATCH_MIN`), and every required document is uploaded, masked Aadhaar included. It is tried after each valid check and each document upload. Anything failed or missing leaves them for an admin. Never grants the Verified badge. Simulated results approve only outside production, as for GSTIN + PAN. UAE (done, owner decisions 2026-09-22): **listings open in the UAE** (Dubai). UAE suppliers upload a trade licence, DTCM tour operator licence and the owner's passport or Emirates ID (the manager's is optional), plus an RTA vehicle permit once they list a transfer; an admin approves by hand. A UAE supplier's product in the UAE is 0% (a booking receipt); an Indian supplier's is 18% GST. Times use Gulf time (`Asia/Dubai`). Not done: traveler copy still says "India and Thailand", and Home doesn't link a UAE landing. Covered by `integration/listingCountries.test.js`, `integration/thaiProductTax.test.js` and `test/supplierVerificationService.test.js`. Singapore (done, owner decisions 2026-09-22): migration 052 adds Singapore as the one city, and listings open there. Singapore suppliers upload an ACRA BizFile company profile, an STB travel agent licence and a director's passport or NRIC, plus an LTA vehicle licence or permit once they list a transfer; an admin approves by hand. A Singapore supplier's product is 0%; an Indian supplier's 18% GST. Times are `Asia/Singapore` (SGT); phones take `+65` (8 digits starting 8 or 9). **SGD** displays at a fixed **78 INR per dollar** (was 64.20); payment stays in INR. The owner answered the tax question by repeating it; 0% was taken to follow Thailand and the UAE, as proposed. Indonesia (done, owner decisions 2026-09-22): migration 053 adds Bali and Jakarta, and listings open. Indonesian suppliers upload an NIB business registration, a tourism business licence (TDUP) and a director's passport or KTP, plus a vehicle registration (STNK) or transport permit once they list a transfer; an admin approves by hand. An Indonesian supplier's product is 0%; an Indian supplier's 18% GST. **Time zones are now per city where needed** (`CITY_TIME` in `localTime.js`): Bali is `Asia/Makassar` (WITA, UTC+8), Jakarta and the rest of Indonesia `Asia/Jakarta` (WIB, UTC+7); the product page and voucher show the city's zone. Phones take `+62` mobiles of 9–12 digits (`maxLength` in the phone rules). **IDR** displays at a fixed **190 rupiah per rupee**, in whole rupiah; payment stays in INR. Covered by `test/localTime.test.js`, `test/phone.test.js`, `test/currencyService.test.js`, `test/supplierVerificationService.test.js` and `integration/thaiProductTax.test.js`. Maldives (done, owner decisions 2026-09-22): migration 054 adds Malé; resort islands are entered as pickup or drop points. Maldives suppliers upload a business registration certificate, a Ministry of Tourism tour operator or travel agency licence and a director's passport or Maldivian ID, plus a vessel or vehicle registration from the Transport Authority once they list a transfer; an admin approves by hand. A Maldivian supplier's product is **0%** (Maldives T-GST is left to the supplier's own price); an Indian supplier's 18% GST. Time is `Indian/Maldives` (MVT, UTC+5); phones take `+960` mobiles (7 digits, starting 7 or 9). No MVR: travelers pick USD, which is now fixed at **97 INR per dollar site-wide** (was 86.50; the owner first said 198 and was shown that it would cut every USD price by more than half). Covered by `test/phone.test.js`, `test/currencyService.test.js`, `test/supplierVerificationService.test.js` and `integration/thaiProductTax.test.js`. Bhutan (done, owner decisions 2026-09-22): migration 055 adds Thimphu and Paro. Bhutan suppliers upload a Department of Tourism licensed tour operator certificate, a trade licence and a director's CID or passport, plus an RSTA vehicle registration or permit once they list a transfer; an admin approves by hand. **The Sustainable Development Fee is included in the supplier's own price** (the platform adds nothing and asks no nationality). A Bhutanese supplier's product is 0%; an Indian supplier's 18% GST. Time is `Asia/Thimphu` (BTT, UTC+6); phones take `+975` mobiles (8 digits starting 17 or 77). No ngultrum currency: it is pegged 1:1 to the rupee, so prices show in INR. Japan (done, owner decisions 2026-09-22): migration 056 adds Tokyo, Osaka and Kyoto. Japanese suppliers upload a certificate of company registration (tōki), a Travel Agency Registration certificate and the representative director's passport or residence card (never My Number), plus a passenger transport business permit (green plate) once they list a transfer; an admin approves by hand. A Japanese supplier's product is 0% (the 10% consumption tax is in their own price); an Indian supplier's 18% GST. Time is `Asia/Tokyo` (JST, UTC+9, no daylight saving); phones take `+81` mobiles (10 digits starting 70, 80 or 90). **JPY** displays at a fixed **1.7 yen per rupee**, in whole yen. **Open legal question:** Japan's Travel Agency Act may require Idea Holiday itself to register before selling tours in Japan; check with a lawyer before promoting Japan.
