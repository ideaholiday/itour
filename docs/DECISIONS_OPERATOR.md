# Operator Platform Decisions (ADR 034 onward): Idea Holiday

> **Summary:** Owner decisions for running an operator's whole business on supply.ideaholiday.in: direct bookings, B2B agents, packages and quotations, with their reasons.
> **Read when:** changing walk-in/phone/manual bookings, supplier staff roles, supplier agents, quotations or PDFs, or recording a new decision in that area. Other ADRs: [`DECISIONS.md`](DECISIONS.md).

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

---

## ADR 036: Supplier Staff Logins with Four Roles
- **Date**: 2026-09-25
- **Context**: Counter staff took walk-ins with the owner's password, which also opens bank details, KYB and plan payments.
- **Decision Made** (owner, 2026-09-25): The supplier's own login is the **owner** and can do everything. Staff get their own email and password, linked to one supplier (`supplier_members`), with one role:
  - **Manager**: all day-to-day work (listings, prices, rates, calendar, bookings, cancellations, dispatch, drivers, resources, reviews, enquiries, support, analytics, channel manager). No bank/payout details or payout ledger, KYB, plans and billing, business profile, or staff.
  - **Front desk**: availability, quote and create walk-in/phone/manual bookings, record payments, see bookings, resend vouchers, manifest and check-in. No price, listing or cancellation changes.
  - **Guide**: departure manifest, check-in and attendance. Sees traveler name, headcount, pickup and **phone**, never email or what a guest owes.
  - Only the **owner** adds, changes, resets or removes staff. **No per-plan seat limit** for now.
- **Consequences**: The role is read from the database on every request, so a change applies to open sessions. Front desk and guides are refused any supplier endpoint not on their allowlist (`supplierStaffService.js`). Managers are refused only the owner-only areas, so a new owner-only endpoint must go under an owner-only path or be added to that list. Removing a staff member sets the account back to `TRAVELER`.

---

## ADR 037: Departures Board, Crew Assignment and Supplier Reschedule
- **Date**: 2026-09-25
- **Decision Made** (owner, 2026-09-25), for operator-platform Phase 3:
  1. **Order**: 3a is the departures board plus assigning guides, vehicles and equipment to departures; 3b is the booking calendar and supplier reschedule.
  2. **Guides, vehicles and equipment** are the existing shared resources (`native_resources`) with a `kind`. A guide resource may be linked to a staff login; that guide then sees and checks in only the departures they are assigned to.
  3. **Supplier reschedule** (3b): the price never changes and seats move atomically. For a marketplace booking the traveler is notified and may decline, which cancels it with a full wallet refund exactly like a supplier cancellation (ADR 019). A direct (walk-in, phone, manual) booking simply moves.
- **Consequences**: An assignment names a departure by product, date and time, the same key as the guest list. One guide or vehicle cannot be assigned to two departures at the same date and time.

---

## ADR 038: Supplier Dashboard Numbers Are Real, or Say "Not Enough Data"
- **Date**: 2026-09-25
- **Context**: The supplier dashboard showed invented numbers: a fixed 6-month revenue chart, +14.8% growth, a made-up weekly trend and four hardcoded service metrics.
- **Decision Made** (owner, 2026-09-25):
  1. **Earnings** are what the supplier earns, on the **trip date**: the net payout on marketplace and partner bookings (after commission) plus the full amount of their own walk-in, phone and manual bookings. Split into marketplace and direct; direct is split into collected and still due. Cancelled and unpaid bookings are left out.
  2. **Growth** compares earnings from the 1st of this month to today with the same days last month, and is hidden when last month had nothing.
  3. **Service metrics** over the last 90 days: median response time to marketplace booking requests, % answered before the deadline, no-show rate from check-in, and pickup OTP verified % on completed trips that had one. Each shows "Not enough data" below 5 bookings, never a made-up value.
- **Consequences**: No dashboard number has a hardcoded fallback. "Today" is the supplier's own country date.

---

## ADR 039: Supplier Agents Book Through Staff at a Net Rate, on Credit
- **Date**: 2026-09-25
- **Decision Made** (owner, 2026-09-25), for operator-platform Phase 5:
  1. **Staff book for the agent** in the walk-in/phone drawer by choosing the agent. An agent login portal and agent API keys come later (Phase 7).
  2. **Net rate is a commission % per agent**, with an optional % per listing for special deals. The agent pays the server quote minus that commission; staff cannot also discount it.
  3. **Credit limit, refused over it.** A booking adds its unpaid net amount to what the agent owes; one that would take them over their limit is refused unless enough is paid now. The supplier records the agent's payments.
  4. **Agent bookings are the supplier's own sales**, like walk-ins (ADR 034): source `AGENT`, `payment_status = OFFLINE`, no IdeaHoliday commission or payout, the same shared inventory.
- **Consequences**: What an agent owes is the `balance_due_inr` of their live bookings, so there is one ledger. A payment on the agent's account is applied to their oldest open bookings first and cannot exceed what they owe. The guest of an agent booking is never asked to pay at the meeting point.

---

## ADR 040: Package Quotations: One Markup, 5% Package GST, Book Listings in One Click
- **Date**: 2026-09-25
- **Decision Made** (owner, 2026-09-25), for operator-platform Phase 6:
  1. **Lines**: hotel nights from the supplier's own rate sheet (hotel, room type, meal plan, net rate per night by season), the supplier's own listings (priced by the server quote, before tax), and custom lines (flights, permits, guide fees). Hotel and custom lines are the supplier's costs and carry one **markup %** per quotation; listings enter at their own price. The customer sees one package price, not the breakdown.
  2. **GST**: 5% on the whole package price for an Indian supplier (tour-operator rate, no input tax credit), shown once. Suppliers outside India quote tax-inclusive with no GST line. The owner will confirm the rate with their CA.
  3. **Accepting**: staff mark the quotation accepted; each listing line then gets "Book now", which makes a booking on the shared inventory and checks seats at that moment. Hotels stay as lines; the supplier books them with the hotel.
  4. **Delivery**: email with the PDF attached where the provider allows (Brevo) and a signed link in the body, which can also be sent on WhatsApp.
- **Consequences**: A booking made from a quotation holds the seats and records the listing's share of the package (`quotation_id`); the customer's money is tracked on the quotation, so the booking carries no balance of its own. The PDF uses "INR" because the PDF's built-in fonts have no rupee sign.
