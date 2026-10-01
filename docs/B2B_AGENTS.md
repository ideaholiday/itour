# B2B Travel Agents: Idea Holiday

> **Summary:** Rules for IdeaHoliday's own travel agents: who may apply, how an agency is approved, what an agent pays, and who gets which message.
> **Read when:** changing agency sign-up or review, agent prices, agent bookings or their notifications. Decisions: [`DECISIONS_B2B.md`](DECISIONS_B2B.md). Plan: [`plans/b2b-travel-agents.md`](plans/b2b-travel-agents.md). Not a supplier's own agents ([`SUPPLIER_OPERATIONS.md`](SUPPLIER_OPERATIONS.md)).

## Sign-up and review
1. **A traveler account applies** at `/agents/signup` with a GSTIN or a PAN (a GSTIN's PAN is filled in; if both are given they must match). Supplier, staff and admin logins can't apply.
2. **An admin reviews** at `/admin/agencies`: approve with a 5–10% discount (5% until set), reject a pending application with a reason the agency sees, or suspend an approved one. Approving an approved agency changes its discount. Every decision is audited; the agency is emailed when its status changes.
3. A rejected agency fixes its details and applies again (back to pending). An approved or suspended one can't reapply.

## Agent price
1. **Only an `APPROVED` agency** gets it. It is the website price less the agency's `discount_pct`, rounded to the rupee, priced by the server on the quote, the hold and the booking.
2. **Out of commission, its own budget.** It is not part of the 10% giveaway cap ([`BUSINESS_RULES.md`](BUSINESS_RULES.md) §3.2) and always stays below the booking's commission: IdeaHoliday keeps at least ₹1. The supplier's payout never moves: `amount_inr + agent_discount_inr (+ wallet credit) = commission_amount + supplier_payout_amount`.
3. **No coupon, friend discount or creator attribution** on an agent booking (`400 AGENT_NO_COUPONS` for a code). Wallet credit may pay part. Payment is prepaid (Cashfree or wallet).
4. **Every listing type and circuits.** The booking's source is `IH_B2B`. A circuit quote freezes each line's agent discount; an order from it is refused (`409 AGENCY_NOT_APPROVED`) once the agency isn't approved, and its total is net of the discount.
5. A suspended agency is back on website prices at once; bookings already made are unchanged.

## Who owns and hears what
1. **The agency owns the booking**: it is on the agency's account, cancellations and wallet refunds go to the agency. The guest is the agent's client, named on the voucher.
2. **Money goes to the agency, the trip to the guest.** The agency gets the confirmation with the invoice, document resends, cancellation, refund and reschedule messages. The guest gets a confirmation with the voucher only ("Booked for you by …"), and driver, reminder and pickup messages. The guest's voucher carries no referral link.
3. **The agent dashboard** (`/agents/dashboard`) lists the agency's bookings by trip or booking date with paid, saved and refunded amounts, opens the client's voucher and the agency's invoice, cancels single bookings (circuit legs from the circuit's page), and downloads the statement as CSV. A suspended agency keeps its history.
4. **The invoice is billed to the agency**, with its GSTIN and address, showing the agent discount. Its SAC, rate and wording are UNKNOWN until the CA confirms.
