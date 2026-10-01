# Plan: IdeaHoliday B2B Travel Agents on ideaholiday.in

> **Summary:** Travel agents sign up on the traveler website, are approved by IdeaHoliday, and then book listings for their clients at an agent price, in the same site and app travelers use.
> **Read when:** building the B2B agent portal. **Status:** APPROVED by the owner 2026-10-01 ([ADR 054](../DECISIONS_B2B.md)). On the ROADMAP as NOW; B1–B4 built 2026-10-01; deploy needs migrations 082 and 083.

This is **IdeaHoliday's own** B2B channel. It is not the supplier's own agents
(ADR 039), who stay in the supplier extranet and pay the supplier offline.

| | Supplier's agents (ADR 039, done) | IdeaHoliday B2B agents (this plan) |
| :--- | :--- | :--- |
| Who signs them up | The supplier, in the extranet | The agent, on ideaholiday.in |
| Who approves them | The supplier | IdeaHoliday admin |
| What they can book | That one supplier's listings | Every bookable marketplace listing |
| Who is paid | The supplier, offline | IdeaHoliday, online (Cashfree or wallet) |
| Booking source | `AGENT`, `OFFLINE` | `IH_B2B`, `PAID` |
| IdeaHoliday commission | None | Yes, frozen as for B2C (ADR 017) |

---

## 0. Owner decisions (ADR 054, 2026-10-01)

| # | Topic | Decision |
| :--- | :--- | :--- |
| 1 | How the agent earns | **Net price**: 5–10% below the website price, set per agency by admin (5% until set). |
| 2 | Discount budget | **Its own budget**, not the 10% giveaway cap; always below the booking's commission. |
| 3 | Agency proof | **GSTIN or PAN**, plus admin approval. |
| 4 | Payment | **Prepaid first** (Cashfree or wallet). Deposits and credit later. |
| 5 | Coupons and creator codes | **No** on agent bookings. |
| 6 | GST invoice to agents | **Yes.** SAC, rate and wording UNKNOWN until the CA confirms. |
| 7 | Products | **All marketplace listing types** (activities, tours, attractions, transfers, packages) **and circuits**. |

---

## 1. What already exists (reuse, don't rebuild)

- **`bookings.source = 'IH_B2B'`** (migration 062, `lib/bookingSources.js`): already a
  valid source in the IdeaHoliday group (commission applies). Nothing creates it yet.
  The supplier booking list already labels it "IdeaHoliday B2B".
- **The marketplace channel switch** (`sell_marketplace`, migration 068, ADR 041)
  already covers "IdeaHoliday B2B": a listing switched off is not offered to agents.
- **One quote and checkout**: `calculateBookingQuote` (`bookingService.js`), `/api/bookings/quote`,
  `/hold`, `/`, and `/api/checkout/*` (Cashfree, wallet). Agents use the same flow; the
  server adds the agent discount. The supplier's payout does not change.
- **Traveler sign-up and login** (`/api/auth/signup`, Supabase or native JWT). Agents use the
  same accounts.
- **Wallet, refunds, vouchers, My Bookings**: reused as they are.

---

## 2. Design

1. **An agent is a traveler account with an approved agency.** No new `users.role`:
   the account stays `TRAVELER`, and a `travel_agencies` row linked to it turns on agent
   prices once `status = 'APPROVED'`. RBAC and every traveler page keep working unchanged.
2. **Sign-up from the traveler site.** The login page and footer get "Travel agent? Sign up";
   `/agents/signup` creates the account (or uses the signed-in one) and the agency
   application. Until it is approved the account is a normal traveler.
3. **The server prices it.** When the signed-in user's agency is approved, the quote shows the
   website price, the agent discount and the agent price. The browser never sends a price
   (invariant 1). The discount is frozen on the booking with the commission.
4. **Booking for a client.** Checkout asks for the lead guest's name and phone (the agent's
   own contact stays on the account). The voucher names the guest.
5. **Cancellations** follow the normal refund policy; refunds go to the agent's wallet or
   original payment as for travelers.
6. **Supplier side unchanged.** The supplier sees an `IH_B2B` booking like any marketplace
   booking, with the same payout.

---

## 3. Phases

**B1: Agency sign-up and approval**
- Migration 082 `travel_agencies`: `user_id` (unique), `agency_name`, `contact_name`, `phone`,
  `gstin`, `pan` (one required), `address`, `city`, `state`, `discount_pct` (5–10, default 5),
  `status` (`PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`), `reviewed_by`, `reviewed_at`,
  `review_note`, timestamps. `-- @down` included.
- `POST /api/agents/apply`, `GET /api/agents/me`; admin `GET /api/admin/agencies`,
  `POST /api/admin/agencies/:id/review`.
- Pages: `/agents` (what the program offers), `/agents/signup`, admin Agencies queue.
  Email on received, approved and rejected.

**B2: Agent price and booking**
- The agency's discount % (5–10, admin-set in B1, 5% until set) is applied by the server.
- Quote and hold return `agent: { websitePrice, discount, price }` for an approved agency;
  booking creation sets `source = 'IH_B2B'` and freezes the discount; the discount is
  taken out of commission and never makes the supplier's payout smaller.
- Activity page and checkout show "Agent price"; checkout collects the lead guest.
- Coupons and creator codes refused on agent bookings.
- Transfers, packages and circuits get the same agent price (decision 7).
- GST invoice to the agent once the CA confirms SAC and rate (decision 6).

**B3: Agent dashboard**
- `/agents/dashboard` (inside My Account): bookings by guest and trip date, filters,
  cancel, voucher download, a statement with CSV (what was paid, refunded, saved).

**B4: Client-ready vouchers and sharing**
- A voucher variant with the agency's name and phone and no price, to forward to the client;
  WhatsApp share of the voucher link.

**Later (not in this plan):** credit lines and deposits, agency sub-users, agent API keys,
agency markup display.

---

## 4. Docs to update as it ships

`PRODUCT.md` §2 roles, `BUSINESS_RULES.md` §3.2 (agent discount), `DATA_MODEL.md`,
`API_CONTRACTS.md`, `SECURITY.md` (who sees an agency's GSTIN/PAN), `CODEMAP.md`,
an ADR in `DECISIONS.md` with the §0 answers, and `ROADMAP.md` (move the item to NOW).
