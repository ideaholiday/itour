# B2B Travel Agent Decisions (ADR 054 onward): Idea Holiday

> **Summary:** Owner decisions for IdeaHoliday's own B2B channel: travel agents who sign up on ideaholiday.in and book at an agent price.
> **Read when:** changing agency sign-up, approval, agent prices or agent bookings. Other ADRs: [`DECISIONS.md`](DECISIONS.md); a supplier's own agents: [`DECISIONS_OPERATOR.md`](DECISIONS_OPERATOR.md) ADR 039.

## ADR 054: IdeaHoliday B2B Travel Agents Book on ideaholiday.in at a Net Price
- **Date**: 2026-10-01
- **Context**: Travel agents want to book IdeaHoliday listings for their clients. The supplier's own agents (ADR 039) are each supplier's business; this is IdeaHoliday's own B2B channel, the roadmap's LATER "B2B sub-agent portal", which the owner started on 2026-10-01. Plan: [`plans/b2b-travel-agents.md`](plans/b2b-travel-agents.md).
- **Decision Made** (owner, 2026-10-01):
  1. **Agents sign up and log in on the traveler website and app.** No separate agent app or site. An agent is a traveler account with an agency profile that IdeaHoliday approves.
  2. **Proof:** a GSTIN or a PAN, plus admin approval.
  3. **Net price:** an approved agent pays **5–10% less** than the website price; admin sets the % per agency within that range. The discount is **its own budget**, not the 10% giveaway cap (ADR 017), and is always below the booking's commission. It never reduces the supplier's payout.
  4. **Prepaid first:** agents pay online (Cashfree or wallet) like travelers. Deposits and credit lines come later.
  5. **No coupons or creator codes** on agent bookings.
  6. **GST invoice to agents: yes.** Its SAC, rate and wording are UNKNOWN until the CA confirms.
  7. **Products in the first release:** every marketplace listing type (activities, tours, attractions, transfers, packages) and circuits. "Packages" means marketplace `PACKAGE` listings, not supplier quotations.
- **Consequences**: Agent bookings use the existing source `IH_B2B` with IdeaHoliday commission frozen as for B2C. A listing with the marketplace channel off (ADR 041) is not offered to agents. Until the admin sets one, an agency's discount is 5%, the bottom of the range.

---

## ADR 055: 18% GST on Our Service Fee to Agents; White-Label Vouchers and Messages
- **Date**: 2026-10-01
- **Context**: B1–B4 of ADR 054 were deployed and checked by the owner on 2026-10-01. The GST invoice to agents was UNKNOWN, and the client's voucher still carried IdeaHoliday's brand.
- **Decision Made** (owner, 2026-10-01, GST advice from the owner's CA):
  1. **GST on the agent invoice is 18% on IdeaHoliday's service fee, added on top** of the agent price. The service fee is the booking's commission less the agent discount. Agents pay the agent price plus that GST; supplier payouts don't change.
  2. **SAC 998551** on the service fee (owner's CA, given 2026-10-01). The code defaults to it; `BUSINESS_AGENT_SAC` overrides it.
  3. **White-label for the agent's client: the voucher and the guest's messages.** The voucher shows the agency's logo (or name) and contact, never IdeaHoliday. Guest emails come in the agency's name with replies to the agency; the text never names IdeaHoliday.
  4. **Agency logo** uploaded by the agent (PNG, JPG or WEBP), shown on the voucher; without one, the agency's name.
- **Consequences**: Migration 084 adds the fee, GST and logo columns. WhatsApp can only send Meta-approved wording from IdeaHoliday's number, and the approved templates name IdeaHoliday, so the client's WhatsApp is white-label only once the owner gets a neutral template approved and sets `WHATSAPP_TEMPLATE_AGENT_GUEST_UPDATE`. The link domain stays ideaholiday.in. The tax invoice stays IdeaHoliday's, billed to the agency.

