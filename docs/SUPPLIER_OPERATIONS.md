# Supplier Operations

> **Summary:** On the day of a trip, a supplier checks travelers in by scanning the voucher QR, marks no-shows, reads the guest list for a departure, and can cancel a whole departure, refunding every paid traveler to their wallet.
> **Read when:** changing check-in, attendance, the manifest or departure cancellation. Code: `supplierDepartureService.js`, `routes/suppliers.js`, `components/supplier/SupplierDeparturesPanel.jsx`. Endpoints: [`API_CONTRACTS.md`](API_CONTRACTS.md) §3.1.5.

## Rules
1. **Check-in is a record, not a state change.** Scanning the voucher QR (or typing the reference) sets `attendance_status = CHECKED_IN` with the time and the user. It does not move the booking status, the payout or any refund. Trips with a driver still start with the pickup OTP ([`BUSINESS_RULES.md`](BUSINESS_RULES.md) §6).
2. **Only the trip date, by default.** "Today" is the date in India. A voucher for another date is refused until the supplier confirms it. A second scan of the same voucher shows when it was first checked in and records nothing new. Cancelled and unpaid bookings cannot be checked in.
3. **No-shows** can be recorded on or after the trip date only. A no-show changes no money: the cancellation table in [`BUSINESS_RULES.md`](BUSINESS_RULES.md) §4 already treats a no-show as non-refundable with the supplier paid in full. Attendance can be cleared to fix a mistake.
4. **A departure** is one product on one date, optionally at one departure time. The guest list shows its paid, non-cancelled bookings.
5. **Cancelling a departure** (weather, too few travelers) is the supplier cancelling each booking on it: every paid booking is refunded in full to the traveler's wallet and every traveler is notified, exactly as for one supplier cancellation. It also closes the departure on the seat calendar with the reason as the note. It happens all or nothing, is refused for past dates or if any booking has already started or finished, and can be previewed first.
