# Supplier Operations

> **Summary:** A supplier sells to its own walk-in, phone and manual customers from the same seat inventory the marketplace sells, then on the day checks travelers in by voucher QR, marks no-shows, reads the guest list, and can cancel a whole departure.
> **Read when:** changing direct bookings, check-in, attendance, the manifest or departure cancellation. Code: `supplierBookingService.js`, `supplierDepartureService.js`, `routes/suppliers.js`, `components/supplier/WalkInBookingDrawer.jsx`, `components/supplier/SupplierDeparturesPanel.jsx`. Endpoints: [`API_CONTRACTS_SUPPLIER.md`](API_CONTRACTS_SUPPLIER.md) §3.1.5, §3.4.

## Direct bookings (ADR 034, [`DECISIONS_OPERATOR.md`](DECISIONS_OPERATOR.md))
1. **One inventory.** A walk-in, phone or manual booking (`bookings.source`) holds and confirms its seats through the same `reserveNativeInventory` and locks as a marketplace checkout or OCTo partner. Capacity 20 with 3 sold online, 5 by a partner and 12 at the counter leaves 0 for everyone.
2. **The server prices it.** The counter sees the quote from `calculateBookingQuote`; staff may give a discount up to the total, never type a total.
3. **The supplier holds the money.** `payment_status = OFFLINE`, commission 0, no `payouts` row. Payments collected (cash, UPI, card, bank) are `booking_payments`; what is still owed is `balance_due_inr`, shown on the booking list and the guest list ("Collect ₹…"). Part payments and pay-later are allowed; overpayment is refused.
4. **No IdeaHoliday refund.** Cancelling it returns the seats; any refund is between guest and operator. The traveler cannot cancel, reschedule or amend it through IdeaHoliday. Its "invoice" is the operator's payment summary.
5. **Counter sales ignore the online cut-off** and close when the departure starts. Capacity, closures and party-size rules still apply.
6. **No automatic message.** The marketplace confirmation is skipped; staff print the voucher or send it by WhatsApp or email from the confirmation screen.

## Departures board and crew (ADR 037)
1. **A departure is a product on a date at a time**, the guest-list key. The board merges the seat inventory's slots with live bookings, so a departure with bookings but no seat inventory still shows. Free seats are summed across the product's options.
2. **Crew** are shared resources with a kind: guide, vehicle, equipment. Owners and managers put them on departures; a resource works one departure per date and time (`409 RESOURCE_BUSY`), but is free again at another time.
3. **A guide linked to a login** sees, lists and checks in only the departures they are assigned to (`403 NOT_YOUR_DEPARTURE`). An unlinked guide login keeps the guide role's normal access (ADR 036).
4. **The booking calendar** shows bookings, guests and departures per day for a month; picking a day opens it on the board.

## Agents (ADR 039)
1. **Staff book for an agent** from the walk-in drawer: source `AGENT`, the same inventory and quote, commission-free for IdeaHoliday (`payment_status = OFFLINE`, no payout).
2. **Net rate.** The agent pays the quote minus their commission (`commission_pct`, or a per-listing `supplier_agent_rates` %). No discount on top.
3. **Credit.** What the agent owes is the unpaid net of their live bookings. A booking whose unpaid part would take them over `credit_limit_inr` is refused (`409 AGENT_CREDIT_LIMIT`, saying how much to take now). An inactive agent can't book.
4. **Payments on account** are applied to the agent's open bookings, oldest trip first, and can't exceed what they owe. Cancelling an agent booking removes what was owed on it; any money already paid is settled between supplier and agent.
5. **The guest is never asked to pay**: the guest list and board show no balance for agent bookings.

## Supplier reschedule (ADR 037)
1. **Same option, same price.** An owner or manager moves a booking to another date or time; the seats move in one transaction (`moveNativeReservation`) and `amount_inr` never changes. Like a counter sale, the new departure may be past the online cut-off until it starts.
2. **Refused** when the booking is cancelled, completed, in progress or unpaid; the traveler was already checked in or marked a no-show; a driver is assigned (unassign first); it is a leg of a multi-stop circuit (operations reschedule those); the new departure has started or lacks seats; or nothing changes.
3. **A paid marketplace booking** becomes `MOVED`: the traveler gets an email and WhatsApp and a notice in My Bookings, and can keep it or decline it until the new departure starts. Declining cancels it with a full wallet refund, like a supplier cancellation ([`REFUND_CREDIT.md`](REFUND_CREDIT.md)), and the supplier gets a notification.
4. **A direct booking** (walk-in, phone, manual) just moves; the supplier tells the guest.

## Rules
1. **Check-in is a record, not a state change.** Scanning the voucher QR (or typing the reference) sets `attendance_status = CHECKED_IN` with the time and the user. It does not move the booking status, the payout or any refund. Trips with a driver still start with the pickup OTP ([`BUSINESS_RULES.md`](BUSINESS_RULES.md) §6).
2. **Only the trip date, by default.** "Today" is the date in India. A voucher for another date is refused until the supplier confirms it. A second scan of the same voucher shows when it was first checked in and records nothing new. Cancelled and unpaid bookings cannot be checked in.
3. **No-shows** can be recorded on or after the trip date only. A no-show changes no money: the cancellation table in [`BUSINESS_RULES.md`](BUSINESS_RULES.md) §4 already treats a no-show as non-refundable with the supplier paid in full. Attendance can be cleared to fix a mistake.
4. **A departure** is one product on one date, optionally at one departure time. The guest list shows its paid, non-cancelled bookings.
5. **Cancelling a departure** (weather, too few travelers) is the supplier cancelling each booking on it: every paid booking is refunded in full to the traveler's wallet and every traveler is notified, exactly as for one supplier cancellation. It also closes the departure on the seat calendar with the reason as the note. It happens all or nothing, is refused for past dates or if any booking has already started or finished, and can be previewed first.
