# Plan: Supplier Channel Integration & Onboarding — ideaholiday.in / supply.ideaholiday.in

Status: Draft plan | Owner: Idea Holiday | Last updated: 2026-09-11

## 1. Two-sided platform, restated

- **ideaholiday.in** — the traveler-facing marketplace. Search, book, and pay for transfers, day tours, multi-day packages, attraction tickets, and experiences.
- **supply.ideaholiday.in** — the supplier-facing reservation system: a Bókun-style channel manager and booking-channel partner. Suppliers manage inventory, pricing, and bookings here, either natively or by connecting an existing reservation system.

Two supplier acquisition paths:
1. **Connected suppliers** — already run Bókun, Activitar, Anchor, Bookingkit, FareHarbor, or Palisis/TourCMS. They connect that system and import products instead of re-entering data.
2. **Unconnected suppliers** — run on spreadsheets, WhatsApp, or nothing. They build native listings directly in `supply.ideaholiday.in`.

Both paths converge on the same internal catalog, availability, and booking engine so `ideaholiday.in` treats every product identically regardless of origin.

## 2. Reality check against the current repo

Before planning new work, here is what actually exists versus what the docs assert:

| Claim | Actual state |
| --- | --- |
| `docs/ROADMAP.md` Phase 2 marks Bókun, FareHarbor, Bookingkit, Palisis/TourCMS, Activitar, and Anchor connectors as **COMPLETED** | No connector code exists. Only a generic inbound/outbound OCTo endpoint (`backend/src/routes/octo.js`, `backend/src/services/octoService.js`, 134 + 328 lines) is implemented — this lets Idea Holiday *act as* an OCTo supplier for someone else's channel, it does not pull products *from* Bókun etc. |
| "Supplier Product Import & External Reference Mapping" marked complete | `reservation_external_references` table and generic mapping plumbing exist for the OCTo path, but there is no per-channel importer, no remote-product preview UI, and no OAuth/API-key credential storage for any named channel. |
| Supplier onboarding flow | No onboarding wizard exists anywhere (`grep -ri onboard` across the repo returns nothing). Supplier creation today is a single `POST /api/suppliers` call plus manual KYB document upload/Cashfree SecureID GSTIN/PAN/bank verification (`backend/src/routes/suppliers.js:140-260`). There is no guided flow, no channel-connect step, and no distinction between "connected" and "native" suppliers. |

**Implication:** `docs/ROADMAP.md` Phase 2 should be corrected from COMPLETED to NOT STARTED for the named connectors — this plan treats that work as net-new, and a doc-accuracy fix is listed as a first task in Section 7.

What *does* already exist and this plan builds on:
- Supplier table + KYB documents + Cashfree SecureID instant GSTIN/PAN/bank verification.
- OCTo-shaped internal schema (`native_inventory_rules`, `native_availability_slots`, `native_reservations`, `native_reservation_outbox`, `reservation_external_references`) — this is the right foundation for external channel mapping, it just isn't wired to any external channel yet.
- Subdomain separation for `ideaholiday.in` / `supply.ideaholiday.in` / `admin.ideaholiday.in` with role-based auth.
- 5-product-type catalog model (`TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, `EXPERIENCE`).

## 3. Target architecture: connector framework

Build one abstraction, not six bespoke integrations. A `ChannelConnector` interface, implemented once per channel, plugged into a shared sync engine.

```
supply.ideaholiday.in
  ┌─────────────────────────────────────────────┐
  │  Channel Connection UI (per supplier)        │
  └───────────────────┬───────────────────────────┘
                       │
              Connector Registry
   ┌──────┬──────┬──────────┬────────────┬────────────┬──────────┐
   │Bókun │Anchor│Activitar │ Bookingkit │ FareHarbor │Palisis/  │
   │      │      │          │            │            │TourCMS   │
   └──┬───┴──┬───┴────┬─────┴──────┬─────┴─────┬──────┴────┬─────┘
      │      │        │            │           │           │
      ▼      ▼        ▼            ▼           ▼           ▼
   Each connector implements: authenticate(), listProducts(),
   fetchProduct(id), fetchAvailability(id, range), pushBookingHold(),
   confirmBooking(), cancelBooking(), webhookHandler()
                       │
                       ▼
          Internal Sync Engine (shared, channel-agnostic)
     - normalizes to Idea Holiday product schema
     - writes reservation_external_references (channel, external_id, internal_id)
     - polls or receives webhooks for availability deltas
     - reconciles bookings both directions (push our bookings out,
       pull their bookings in, so double inventory never oversells)
                       │
                       ▼
        Internal catalog / native_inventory_rules /
        native_availability_slots / native_reservations
                       │
                       ▼
                 ideaholiday.in marketplace
```

### 3.1 Per-channel connector notes

| Channel | API shape | Auth | Sync model | Notes |
| --- | --- | --- | --- | --- |
| Bókun | REST, OCTo-adjacent, HMAC-signed requests | Access key + secret | Pull products/availability; push bookings via reservation API or OCTo passthrough | Bókun natively speaks OCTo for some endpoints — reuse the existing `octoService.js` as a base client where possible. |
| FareHarbor | REST (Booking Holdings) | API key + app key | Pull companies/items/availability; push bookings | Rate-limited; needs per-supplier company ID mapping. |
| Bookingkit | REST | API key (per merchant) | Pull products/availability; webhook-based booking push-back | Webhook signature verification required. |
| Palisis Group / TourCMS | XML/REST (older TourCMS API, newer Palisis REST) | Marketplace ID + private key (TourCMS), OAuth (Palisis) | Pull tours/availability; push bookings | Two API generations exist — detect which the supplier is on during connect. |
| Activitar | REST | API key | Pull products/availability | Smaller footprint; verify current API docs before building, vendor detail was not independently confirmed. |
| Anchor | REST | API key or OAuth | Pull products/availability; push bookings | Vendor detail was not independently confirmed — validate live API docs during connector build, not from assumption. |

Build order should be demand-driven: connect the channel your first pipeline of real suppliers actually uses, don't build all six speculatively. Recommended default order if no signal yet: **Bókun → FareHarbor → Bookingkit → Palisis/TourCMS → Activitar → Anchor**, based on market share among tour/activity operators.

### 3.2 Data model additions

- `channel_connections` — `id, supplier_id, channel (enum), credentials (encrypted), status (pending|connected|error|revoked), connected_at, last_synced_at`
- `channel_product_imports` — `id, channel_connection_id, external_product_id, internal_product_id, import_status (previewed|imported|skipped|error), field_mapping_json, imported_at`
- Extend `reservation_external_references` (already exists) to carry `channel_connection_id` so a booking can be traced back to its source channel.
- Credential encryption: reuse whatever secret-encryption pattern already protects pickup OTP secrets (`AES-GCM`, per `docs/ROADMAP.md` Phase 1 notes) rather than inventing a new one.

### 3.3 Bókun connector — build spec (selected as first connector)

Decision: Bókun is the first connector to build (Section 7 updated below). Detail to scope the work:

**Auth**
- Bókun's Channel Manager / Partner API uses an access key + secret key pair issued per Bókun account (generated in Bókun's Settings → API). Every request is HMAC-SHA1 signed and requires an `X-Bokun-Date` header plus `X-Bokun-AccessKey` and `X-Bokun-Signature` headers — no OAuth flow, so the onboarding UI just needs two credential fields (access key, secret key) plus a "Test connection" button that makes one signed call before saving.
- Store the secret key encrypted at rest (same AES-GCM pattern as pickup OTP secrets), never log it, never echo it back to the client after save.

**API surface to integrate**
- Bókun also exposes an OCTo-compliant subset of endpoints for connected channel partners — check during implementation whether the supplier's Bókun plan has OCTo enabled, since that lets the connector reuse `octoService.js`'s existing request/normalization logic almost as-is instead of writing a bespoke Bókun client.
- Where OCTo isn't available (older Bókun plans), fall back to Bókun's native REST endpoints: experience/activity listing, pricing categories, availability calendar, and the reservation/booking endpoints for hold → confirm → cancel.
- Products in Bókun ("experiences"/"activities") map onto the internal `DAY_TOUR`, `EXPERIENCE`, or `ATTRACTION_TICKET` types depending on Bókun's own category field — the import preview screen (Stage 2, Path A, step 4) needs a manual override here since Bókun's categorization won't map 1:1.

**Implementation shape**
- New file `backend/src/services/connectors/bokunConnector.js` implementing the shared `ChannelConnector` interface (`authenticate`, `listProducts`, `fetchProduct`, `fetchAvailability`, `pushBookingHold`, `confirmBooking`, `cancelBooking`, `webhookHandler`).
- Register it in the connector registry (Section 3, new in Phase A) alongside the mock connector used for framework testing.
- Availability sync: start with polling (e.g. every 5–15 minutes per active connection) rather than relying on Bókun webhooks for the first version — simpler to build and verify correctness before adding push-based updates.
- Booking push-back: when a traveler books a Bókun-sourced product on `ideaholiday.in`, the connector must call Bókun's reservation API to hold/confirm the same seat there, so Bókun's own calendar (and any other channel Bókun itself feeds) stays in sync. This is the two-way sync called out as a hard requirement in Section 6's double-inventory risk.

**Verification before go-live**
- Confirm Bókun's current partner-API terms permit resale/redistribution through a third-party marketplace like `ideaholiday.in` (Section 6 legal/ToS risk) — this should be checked once, not per-supplier, since it's an account-type/partnership question with Bókun rather than a per-connection one.
- Get one real or sandbox Bókun account to build and test against before writing the onboarding UI copy — API docs and actual account behavior can diverge.

**Status: blocked, deferred** — as of 2026-09-11, neither a Bókun account (sandbox or partner) nor confirmation of resale/reseller terms is in hand. Do not start `bokunConnector.js` itself until at least one of these exists; everything else in Phase A/B that doesn't require live Bókun access (framework, registry, mock connector, native onboarding path, wizard UI) is unblocked and should proceed first. Revisit this item when the account/terms question is picked back up.

## 4. Supplier onboarding flow

One entry funnel, branching after business verification into "connect a channel" or "build native."

### Stage 0 — Signup
- Supplier registers on `supply.ideaholiday.in` (business name, contact, email/phone, city).
- Creates `suppliers` row with `kyb_status = pending` (existing `POST /api/suppliers` logic, wrapped in a wizard UI instead of a single form dump).

### Stage 1 — Business verification (KYB)
- GSTIN, PAN, bank account — reuse existing Cashfree SecureID instant verification (`verify-gstin`, PAN-to-GSTIN, bank account endpoints already in `suppliers.js`).
- Manual document fallback (`kyb_documents` table) for suppliers without instant-verifiable GSTIN (e.g. very small operators, individual guides).
- Gate: `kyb_status` must reach `verified` or `pending_review` before the supplier can go live, but they can build/import products while KYB is in review — don't block product setup on paperwork.

### Stage 2 — Channel choice (the fork)
Ask one question: *"Do you already use a reservation/booking system?"*

**Path A — Connected supplier**
1. Pick channel from the six supported (or "other — request integration").
2. Enter API credentials / complete OAuth handshake for that channel's connector.
3. System calls `connector.listProducts()` and shows a **remote product preview**: title, type, thumbnail, price, availability snapshot, with a per-product "Import" toggle.
4. Supplier reviews/edits mapped fields (product type classification into the 5 internal types, pricing currency, cancellation policy) before committing.
5. One-click import writes into internal catalog + `channel_product_imports` + `reservation_external_references`.
6. Supplier sets sync mode: **one-time import** (they'll manage inventory natively going forward) or **live sync** (channel stays source of truth, availability/bookings sync continuously both ways).
7. If live sync: system runs a test-booking round-trip (hold → confirm → cancel) against the external channel before flipping the connection to `connected` status, to catch bad credentials or mapping errors before a real traveler hits it.

**Path B — Unconnected / native supplier**
1. Guided listing builder per product type (transfer, day tour, package, attraction ticket, experience) — this reuses the existing `SupplierInventoryEditor.jsx` builder flow rather than duplicating it.
2. Inventory rules: weekday schedule, time slots, seat/unit quotas, tiered adult/child pricing, cut-off and cancellation rules — all already modeled in `native_inventory_rules`.
3. Optional: point-of-sale / driver / fleet setup for transfer-type suppliers (already exists in supplier dashboard).

Both paths converge here:

### Stage 3 — Payout & compliance setup
- Bank account verified (Stage 1) linked to payout ledger (`getSupplierPayoutLedger` already exists in `financeService.js`).
- Accept marketplace terms, commission structure, cancellation/refund policy acknowledgment.

### Stage 4 — Go-live review
- Admin/ops queue reviews new supplier before first public listing (quality gate — matches existing `admin.ideaholiday.in` review surfaces).
- Automated checks: at least one product with valid availability, KYB status, payout details complete, (for connected suppliers) test booking round-trip passed.
- On approval: products flip from `draft`/`preview` to `live`, become searchable on `ideaholiday.in`.

### Stage 5 — Ongoing sync health (connected suppliers only)
- Dashboard widget per channel connection: last successful sync, error count, token expiry warnings.
- Alerting (reuse existing WhatsApp/email notification service) to supplier and internal ops when a channel sync fails repeatedly or credentials expire.
- Manual "resync now" action.

### Onboarding state machine (summary)

```
signup → kyb_pending ⇄ kyb_verified
                │
                ├─(connected)→ channel_selected → credentials_entered →
                │              products_previewed → products_imported →
                │              test_booking_passed → connection_live
                │
                └─(native)→ listings_drafted → inventory_configured
                                    │
                                    ▼
                         payout_configured → pending_review → live
```

## 5. Phased delivery plan

**Phase A — Foundation & correction (near-term)**
1. Correct `docs/ROADMAP.md` Phase 2 status from COMPLETED to planned, so the docs stop overstating shipped capability.
2. Design and migrate `channel_connections` and `channel_product_imports` tables.
3. Build the `ChannelConnector` interface + connector registry (no real channels yet — a mock/fake connector for testing the framework end to end).
4. Build the onboarding wizard shell on `supply.ideaholiday.in` covering Stage 0–1 (signup + KYB), reusing existing supplier/KYB APIs.

**Phase B — First real connector + native path**
5. Ship the native onboarding path (Stage 2 Path B) — this delivers value immediately and doesn't depend on any external API.
6. Ship the Bókun connector end to end (product preview, import, live sync, test-booking round trip) — **blocked** until a Bókun sandbox/partner account and resale-terms confirmation are in hand (Section 3.3, deferred as of 2026-09-11). Everything else in this phase can proceed without it.
7. Ship Stage 4 go-live review queue in the admin panel.

**Phase C — Scale connectors**
8. Add remaining connectors in demand order (Section 3.1) — each is additive once the framework from Phase A/B exists.
9. Add Stage 5 sync health dashboard and alerting.

**Phase D — Hardening**
10. Load-test double-booking prevention across simultaneous native + channel-synced availability changes.
11. Supplier self-serve credential rotation and connection revocation.
12. Commission/payout reconciliation reporting per channel source.

## 6. Key risks & open questions

- **Vendor API access**: Activitar and Anchor API details weren't independently confirmed during this planning pass — get live API docs and sandbox credentials before committing engineering time to either.
- **Rate limits & polling costs**: some channels (FareHarbor, Bookingkit) may not offer webhooks for every event — plan polling intervals and cost accordingly rather than assuming push-based sync everywhere.
- **Double inventory conflicts**: a supplier keeping the source-of-truth in their original channel while also selling on `ideaholiday.in` needs airtight two-way sync; a sync bug here directly causes overselling. Treat the test-booking round trip (Stage 2, step 7) as non-negotiable before any connection goes live.
- **Commission model differences**: connected suppliers already paying commission on their own channel may need a different take-rate than native suppliers — this is a business decision, not just an engineering one, and should be settled before Phase C.
- **Legal/ToS**: some channel providers restrict third-party resale/redistribution via their API — confirm each channel's partner/reseller terms before building against it, not after.

## 7. Immediate next actions

1. Fix the `docs/ROADMAP.md` Phase 2 status discrepancy (documented vs. actually built) so planning and status reporting are trustworthy.
2. ~~Decide the first connector to build~~ — **decided: Bókun** (Section 3.3). **Deferred**: no Bókun sandbox/partner account or resale-terms confirmation yet — pick this back up before starting `bokunConnector.js`; not needed for the items below.
3. Scope and migrate the `channel_connections` / `channel_product_imports` tables — no Bókun dependency, proceed now.
4. Build the `ChannelConnector` interface + connector registry with a mock connector (Phase A, item 3) — no Bókun dependency, proceed now.
5. Design the onboarding wizard UI (Stage 0–4) as a Figma/prototype pass before wiring it to the backend, given no onboarding UI exists today to extend — no Bókun dependency, proceed now.
6. Ship the native onboarding path (Section 4, Path B) — no Bókun dependency, proceed now.
7. Once a Bókun account and resale-terms answer exist: build `backend/src/services/connectors/bokunConnector.js` per Section 3.3.
