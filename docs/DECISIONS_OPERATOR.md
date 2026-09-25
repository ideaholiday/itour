# Operator Platform Decisions (ADR 034 onward): Idea Holiday

> **Summary:** Owner decisions for running an operator's whole business on supply.ideaholiday.in: direct bookings, B2B agents, packages and quotations, with their reasons.
> **Read when:** changing walk-in/phone/manual bookings, supplier agents, quotations or PDFs, or recording a new decision in that area. Other ADRs: [`DECISIONS.md`](DECISIONS.md).

## ADR 034: Supplier-Direct Bookings Share the Inventory and Pay No Commission
- **Date**: 2026-09-25
- **Context**: Operators sell to walk-in, phone and their own customers outside IdeaHoliday, and those sales must not overbook the seats the marketplace sells.
- **Decision Made** (owner, 2026-09-25): Every booking has a `source`. Walk-in, phone and manual bookings are the supplier's own customers: they take seats from the same native inventory and price through the same quote, but pay **no commission** (the subscription covers them; ADR 017 commission applies to IdeaHoliday B2C/B2B only). The supplier collects the money (cash, UPI, card, bank), so the booking is `payment_status = OFFLINE`: no `payouts` row, no IdeaHoliday refund or wallet credit, and the traveler cannot cancel, reschedule or amend it through IdeaHoliday. The supplier may discount (never below zero) and record part payments; the rest is `balance_due_inr`. A counter sale may be made after the online cut-off, until the departure starts.
- **Consequences**: Operational checks that required `PAID` (dispatch, pickup OTP, voucher QR, guest resend, trip reminder) accept `OFFLINE`; refund and settlement checks still require `PAID`. The "invoice" of an `OFFLINE` booking is the operator's payment summary. The marketplace confirmation message is skipped; the supplier sends the voucher.

---

## ADR 035: Operator Platform Scope: Hotel Line Items, Supplier's Own Agents, PDF Files
- **Date**: 2026-09-25
- **Decision Made** (owner, 2026-09-25), for the operator-platform plan (ROADMAP NOW):
  1. **Hotels** appear in operator-built packages only as quotation line items from the operator's own rate sheet. No live hotel inventory or hotel booking (PRODUCT.md non-goal kept).
  2. **B2B agents** are each supplier's own agents, hotels and resellers, with net rates and commission. The platform-wide B2B sub-agent portal stays LATER.
  3. **PDF**: add `pdfkit` (pure JavaScript) for quotation, voucher and invoice attachments.
- **Consequences**: Agent bookings and quotations reuse the one inventory and quote. `pdfkit` is the only new dependency and must keep `npm audit --omit=dev` at 0.
