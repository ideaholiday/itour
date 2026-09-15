# Refund Credit

> **Summary:** A supplier cancelling a paid booking refunds the traveler to their wallet at once as refund credit (no cap, no expiry), and the traveler has 10 days to send the unspent part back to the original payment method (ADR 019).
> **Read when:** changing supplier cancellations, refund credit, wallet spending order, `POST /api/checkout/wallet-payment` or `POST /api/bookings/:id/refund-to-source`. Code: `refundCreditService.js`, `referralService.js` (wallet ledger), `loyaltyService.js` (checkout cap).

## Rules
1. **A supplier cancelling a paid booking refunds the traveler to the wallet at once.** The whole
   `amount_inr` becomes refund credit (`credit_source = 'REFUND'`), the booking becomes
   `payment_status = 'REFUNDED_TO_WALLET'`, and the supplier is paid nothing. Wallet credit the
   booking spent comes back too. The traveler gets an email and a WhatsApp.
2. **No cap, no expiry.** Refund credit can pay for a whole booking. A booking it pays for in full
   is confirmed without a gateway (`payment_method = 'WALLET'`).
3. **Spent last**, after referral credit and creator earnings, so it stays cash-refundable as long
   as possible. A referral clawback never takes it.
4. **Back to the original payment method within 10 days.** Until `cash_refundable_until`, the
   traveler can send the unspent refund credit of that booking back from My Trips. It is refunded
   through the gateway at once. If the gateway fails, the booking is left `REFUND_INITIATED` for
   Finance to retry, as for a traveler cancellation. After 10 days it stays as credit.
5. **Restored refund credit is credit only.** If a booking paid with refund credit is cancelled,
   that part comes back as refund credit (`REFUND_CREDIT_RESTORED`), but it cannot be sent back as cash.
6. **Self-cancelling a booking credit paid for** gives credit back at the policy's refund share,
   even when nothing was paid by card.

## How it is recorded
- `bookings.payment_status = 'REFUNDED_TO_WALLET'`, `refunded_to_wallet_inr`, `refund_amount_inr`; the payout is zeroed and `CANCELLED`.
- `wallet_transactions`: `SUPPLIER_CANCEL_CREDIT` (credit, `credit_source = 'REFUND'`, `cash_refundable_until`),
  `REFUND_CASHOUT` (debit that draws down that row only), `REFUND_CREDIT_RESTORED`, and `refund_inr` on a `REDEMPTION`.
- `financial_ledger`: `REFUND_TO_WALLET` when credited; the usual `refunds` row and `REFUND_PROCESSED` event when cashed out.
  Because `refunded_to_wallet_inr` is set, `finalizeRefund` keeps the supplier's payout at zero for a partial cash refund.
