# 4. Bookings

> **Summary:** How a booking reaches a supplier, the booking stages, accepting or declining within the time limit, the Bookings screen, supplier cancellations (refund to the traveler's wallet), traveler cancellation refunds, reviews and support cases.
> **Read when:** a supplier asks about a booking, missed an acceptance, wants to cancel, or a traveler disputes a refund.

[Back to the guide](README.md)

## 4.1 How a booking arrives

1. The traveler picks a date, time and travelers. The system holds the seats for **10 minutes** and fixes the price.
2. The traveler pays. The price can't change after this, even if the supplier changes their prices.
3. Next, one of two things happens:

| Listing has saved Seats & schedule? | What happens after payment |
| :--- | :--- |
| **Yes** (instant) | Confirmed at once. The supplier is told "automatically confirmed, no acceptance required". The traveler gets the voucher. |
| **No** (needs acceptance) | The booking waits for the supplier to **accept**. The supplier gets an "Action required: accept booking" email and WhatsApp with a deadline. |

> **Team note:** the acceptance window is **10 minutes** by default (server setting `SUPPLIER_ACCEPTANCE_MINUTES`, 1 to 120). [`BUSINESS_RULES.md`](../BUSINESS_RULES.md) §2 still says 24 hours; the code uses 10 minutes. If the supplier misses it, the booking moves to the **next eligible supplier**, or operations are alerted to assign one by hand.

> **Tell the supplier:**
> - "Turn on WhatsApp notifications and keep the portal open during business hours. You have about **10 minutes** to accept."
> - "Save Seats & schedule on every listing you can. Those bookings confirm instantly and never wait for you."

## 4.2 Booking stages

| Stage | Meaning |
| :--- | :--- |
| `pending_payment` | Traveler is at checkout; seats are on hold |
| `confirmed` | Paid. May still be **Pending Confirmation** from the supplier (acceptance needed). |
| `driver_assigned` | A driver has been assigned |
| `in_progress` | The driver entered the traveler's pickup OTP; the trip has started |
| `completed` | Trip finished. The payout moves to scheduled. |
| `cancelled` | Cancelled by the traveler, the supplier or operations |

The order is fixed: confirmed → driver assigned → in progress → completed. A trip can't be started without the pickup OTP. A completed or cancelled booking can't change.

## 4.3 The Bookings screen

**Tabs:** All bookings · **Pending action** · Active / in-progress · Completed · Cancelled & refunds.

**Search:** booking reference, traveler name, phone, pickup or drop location, product title, Product ID.

**Sort:** newest first, oldest first, highest amount.

**Table columns:** booking ref · travel date and product · traveler · status and dispatch (with "⚠️ Driver unassigned" warnings) · payout · actions (view, cancel).

Opening a booking shows:
- **Confirmation request** (when acceptance is needed): **Accept & Confirm Trip** or **Decline Trip**. A decline needs a short reason.
- **Traveler details:** name, phone, and quick call and WhatsApp buttons.
- **Route & pickup:** pickup, drop, flight or train details.
- **Payout breakdown:** gross booking, commission, net payout ([chapter 6](06-money-and-payouts.md)).
- **Trip security & OTP:** enter the traveler's 6-digit pickup code to start the trip.
- **Driver & fleet dispatch:** choose a fleet driver or an outside driver ([chapter 5](05-fleet-and-dispatch.md)).
- **Driver & trip timeline:** every request, acceptance, decline and status change, with time and who did it.
- **Resend guest confirmation:** sends the traveler the booking update again on every enabled channel.

### Accept or decline

| Action | Result |
| :--- | :--- |
| **Accept** | "Booking accepted. You can now assign the driver and vehicle." |
| **Decline** (reason required) | The booking goes to another eligible supplier. If there is none, operations are alerted. |
| **No answer before the deadline** | Same as decline: the next supplier, or operations. |

**Multi-stop trips (circuits):** if a traveler reschedules a multi-supplier trip, the booking shows **New Dates Pending** with **Accept New Dates** or **Cannot Honor Dates**. Every supplier has 24 hours. If any supplier declines or doesn't answer, the whole trip goes to operations for review. Nothing is reassigned automatically.

## 4.4 Supplier cancellations

Bookings → the booking → **Cancel booking**. The supplier picks a reason and can add notes:
- Vehicle breakdown / mechanical failure
- Assigned driver emergency / unavailability
- Severe weather / road blocked / landslide
- Traveler no-show at pickup point
- Mutual cancellation request with traveler
- Operational overbooking / scheduling conflict
- Other operational constraint

**What happens when a supplier cancels a paid booking:**
1. The traveler gets a **100% refund at once, to their Idea Holiday wallet** as refund credit, by email and WhatsApp.
2. The traveler can rebook with that credit, or within **10 days** send it back to their original payment method.
3. **The supplier is paid nothing** for that booking.
4. Driver assignments are cancelled.

A booking that wasn't paid yet is simply cancelled.

> **Tell the supplier:** "Only cancel when you truly can't run the trip. You earn nothing from it, the traveler loses trust, and a bad review may follow. If a car breaks down, call support first. We may find another vehicle."

> **Team note:** "Traveler no-show" is in the reason list, but choosing it still refunds the traveler 100%. For a real no-show, the supplier should **not** cancel. They should report it to operations instead.

Rules: [`REFUND_CREDIT.md`](../REFUND_CREDIT.md), ADR 019.

## 4.5 Traveler cancellations and refunds

Travelers cancel from **My Trips**. The refund depends on the listing's cancellation policy and how many hours are left before pickup.

**The standard rules** (the refund-quote screen, support and admin):

| Policy | Refund |
| :--- | :--- |
| **Flexible 24h** | 100% if 24h or more before pickup, otherwise 0% |
| **Moderate 48h** | 100% if 48h+ before · 50% between 24h and 48h · 0% under 24h |
| **Flexible 48h** | Not treated as 48h. The general rule applies: 100% more than 24h before · 50% between 12h and 24h · 0% under 12h |
| **Non-Refundable** | 0% |
| **Listing with Seats & schedule** | 100% until the schedule's "Free cancellation before start (hours)", then 0% |
| **Booking grace** | 100% if cancelled within 24h of booking **and** 12h+ before pickup (not for Non-Refundable) |

Admins can override a refund to 0%, 50% or 100%.

> **Known gap:** My Trips has **two** cancel screens that calculate refunds differently. The "cancel / change booking" screen:
> - handles only Flexible 24h (100% at 24h+, **50% between 12h and 24h**) and Moderate 48h,
> - treats **Non-Refundable** and **Flexible 48h** as "100% if 72h+ before, otherwise 0%". So a Non-Refundable booking can get a full refund.
> - ignores the Seats & schedule free-cancellation hours and the booking grace.
>
> If a supplier complains about a refund on a Non-Refundable or Flexible 48h listing, escalate to the tech team.

> **Known gap:** the wizard's label "Moderate: 50% refund if cancelled 48h before" is misleading. The real rule is 100% at 48h+ and 50% between 24h and 48h.

> **Tell the supplier:** "A flexible policy makes travelers more comfortable booking early. Use Non-Refundable only for things you pay for in advance, like permits or tickets."

## 4.6 Reviews

Below the bookings table, **Ratings and public responses** shows the quality score (out of 100), tier and review count, and the latest reviews.

- Only reviews from **real bookings** count toward the rating.
- The supplier can **Write public response** on a published review. The response is shown publicly under it.
- **Collect reviews:** create a review link (for all listings or one listing), label where it will be used ("vehicle window", "voucher"), and copy it. There is a ready WhatsApp message: "Thank you for travelling with us! Would you share a quick review of your trip?"
- Travelers using a review link must confirm their booking reference and phone, so fake reviews can't be posted.
- The day after a trip, the traveler automatically gets a review invite.

> **Tell the supplier:** "Reply to every review, especially bad ones. Stay polite and specific: thank them, explain and fix it. Future travelers read your replies."

## 4.7 Support cases

**Cases requiring supplier response** lists cases opened about the supplier's bookings: case ref, status, subject, booking ref, type, and an **URGENT** tag when urgent.
- **Reply with information** sends the supplier's answer to operations.
- Private operations notes are never shown to the supplier.
- A complaint, safety or refund-dispute case on a completed booking **holds that booking's payout** until the case is closed ([chapter 6](06-money-and-payouts.md#63-payout-stages)).

> **Tell the supplier:** "Answer support cases the same day. Your payout for that trip waits until the case is closed."

---
For the tech team: `pages/SupplierBookingsPage.jsx`, `components/supplier/SupplierBookingManager.jsx`, routes `/api/suppliers/:id/bookings/*`, `services/assignmentSlaService.js`, `refundCreditService.js`, `financeService.calculateRefundQuote`, `bookingModificationService.calculateCancellationRefundPreview`.
