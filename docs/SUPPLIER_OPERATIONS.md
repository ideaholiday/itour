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

## Rules
1. **Check-in is a record, not a state change.** Scanning the voucher QR (or typing the reference) sets `attendance_status = CHECKED_IN` with the time and the user. It does not move the booking status, the payout or any refund. Trips with a driver still start with the pickup OTP ([`BUSINESS_RULES.md`](BUSINESS_RULES.md) §6).
2. **Only the trip date, by default.** "Today" is the date in India. A voucher for another date is refused until the supplier confirms it. A second scan of the same voucher shows when it was first checked in and records nothing new. Cancelled and unpaid bookings cannot be checked in.
3. **No-shows** can be recorded on or after the trip date only. A no-show changes no money: the cancellation table in [`BUSINESS_RULES.md`](BUSINESS_RULES.md) §4 already treats a no-show as non-refundable with the supplier paid in full. Attendance can be cleared to fix a mistake.
4. **A departure** is one product on one date, optionally at one departure time. The guest list shows its paid, non-cancelled bookings.
5. **Cancelling a departure** (weather, too few travelers) is the supplier cancelling each booking on it: every paid booking is refunded in full to the traveler's wallet and every traveler is notified, exactly as for one supplier cancellation. It also closes the departure on the seat calendar with the reason as the note. It happens all or nothing, is refused for past dates or if any booking has already started or finished, and can be previewed first.
