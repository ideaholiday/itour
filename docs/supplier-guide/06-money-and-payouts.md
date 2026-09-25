# 6. Money and payouts

> **Summary:** How commission works, what the supplier earns per booking, the stages a payout moves through, what holds a payout, and how to read the settlement table.
> **Read when:** a supplier asks "how much do I earn?", "why is my commission 30%?", or "where is my payout?".

[Back to the guide](README.md)

## 6.1 Commission

- Idea Holiday's commission is **30% by default** for every supplier (ADR 017, from 14 Sep 2026).
- An admin can set a different rate for **one supplier** or **one product** (0% to 50%), always with a reason. Order: product rate → supplier rate → default.
- **The rate is frozen on each booking when it is made.** A later rate change only affects new bookings.
- When a supplier's rate changes, that supplier gets a notice by email and WhatsApp.
- The supplier sees their current rate on the Overview, under **Revenue pulse → Commission**.

## 6.2 What the supplier earns

For each booking, the booking details show a **Payout breakdown**:

| Line | Meaning |
| :--- | :--- |
| Gross booking | What the traveler paid for this booking |
| Commission | Idea Holiday's share, at the rate frozen on the booking |
| Net payout | What the supplier receives |

**Discounts that don't reduce the supplier's payout:**
- Idea Holiday coupons, Travel & Earn referral rewards and creator (affiliate) commission all come **out of Idea Holiday's commission**. They are capped at 10% of the booking value and never more than the commission.
- A traveler paying with wallet credit changes nothing for the supplier.

**Discounts that do reduce it:**
- The supplier's own **promotions** lower the price itself, so the commission and payout are worked out on the lower price. The same applies to a lower seasonal rate.

**When a booking is cancelled:**
- **Supplier cancels:** zero payout ([chapter 4](04-bookings.md#44-supplier-cancellations)).
- **Traveler cancels with a 100% refund:** zero payout.
- **Traveler cancels late, with a 50% or 0% refund:** the supplier is paid their share of the money Idea Holiday kept, at the booking's commission rate.

> **Known gap:** if the traveler cancels from the My Trips "cancel / change booking" screen, the supplier's payout is **cancelled even when the traveler gets a partial or no refund**. The supplier then receives nothing for a late cancellation. Escalate such cases to Finance.

> **Tell the supplier:** "If a traveler used an Idea Holiday coupon, you still get your full share. We pay for the discount, not you."

## 6.3 Payout stages

| Stage | Meaning | What moves it on |
| :--- | :--- | :--- |
| `PENDING_PAYMENT` | Booking not paid yet | Traveler pays |
| `PAYMENT_HELD` | Paid; the trip hasn't happened yet | Trip marked **completed** |
| `SCHEDULED` | Trip done; waiting for the next settlement | Finance adds it to a settlement batch |
| `ISSUE_HOLD` | A complaint, safety or refund-dispute case is open on this booking | The case is closed (resolved, rejected or closed) → back to SCHEDULED |
| `BATCHED` | Grouped into the supplier's settlement batch | Finance sends the bank transfer |
| `PROCESSED` | Bank transfer or UPI sent. The **Reference** column shows the transfer ID. | Finance matches it with the bank statement |
| `RECONCILED` | Confirmed against the bank statement | Final |
| `CANCELLED` | Booking cancelled; nothing to pay | Final |

**Payouts are blocked while KYB is not APPROVED.**

> **Team note:** settlement batches are created by Finance from the admin panel. There is no automatic weekly or monthly cycle in the system, so tell suppliers the cycle Finance actually runs, not a guess. If an automatic Cashfree transfer fails, Finance pays by hand and records the bank UTR.

## 6.4 The settlement register (Overview)

**Supplier payouts & settlement** shows the latest 8 payouts:

| Column | Meaning |
| :--- | :--- |
| Booking | Booking reference |
| Gross | Booking amount |
| Commission | Idea Holiday's share |
| Net payable | Supplier's amount |
| Settlement | The stage from §6.3 |
| Reference | Bank or batch reference once paid; "Scheduled" before that |

"Processed to date" at the top is the total already paid out.

The **Revenue pulse** card also shows:
- **Net revenue:** all net payouts that aren't cancelled (paid and still to pay).
- **Avg. booking:** average booking amount.
- **Next payout:** total of SCHEDULED and BATCHED payouts.

> **Known gap:** the monthly bar chart in Revenue pulse always shows **March to August 2026**. Bookings from September 2026 onward don't appear in the bars, though they are included in the totals.

## 6.5 "Where is my payout?" checklist

1. Is KYB **APPROVED**? ([chapter 2](02-kyb-and-bank.md))
2. Is the **bank account** saved and penny-drop verified?
3. Did the trip reach **completed**? A trip never marked complete stays in PAYMENT_HELD.
4. Is there an open **support case** on that booking? (ISSUE_HOLD)
5. Is it SCHEDULED? Then it's waiting for Finance's next settlement batch.
6. Is it PROCESSED? Give the supplier the **Reference** to trace with their bank.

## 6.6 Supplier subscription and plan payments

These are separate from trip earnings. The supplier pays Idea Holiday by Cashfree, with 18% GST and a tax invoice. See [chapter 7](07-profile-sharekit-plans.md#75-subscription).

---
For the tech team: `components/supplier/SupplierDashboardOverview.jsx` (settlement register, revenue pulse), `services/financeService.js`, `commissionService.js`. Rules: [`BUSINESS_RULES.md`](../BUSINESS_RULES.md) §3.2, §6.4, §7; ADR 017.
