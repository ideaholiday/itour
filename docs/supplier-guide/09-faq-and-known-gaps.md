# 9. FAQ and known gaps

> **Summary:** Short answers to the questions suppliers ask most, and a list of portal features that don't yet work the way the screen suggests, so the team never promises something the system won't do.
> **Read when:** answering a supplier, or before promising a supplier how a feature behaves.

[Back to the guide](README.md)

## 9.1 Supplier FAQ

### Getting started
**"I signed up. Why can't travelers see my listings?"**
Check the 4 conditions in order: KYB approved → listing published → subscription covered → date open. [Chapter 1](01-getting-started.md#13-the-4-things-a-supplier-needs-before-they-can-sell).

**"How long does approval take?"**
With a GSTIN and a matching business PAN, **Verify All** in Compliance approves within seconds. Otherwise an admin reviews the uploaded transport licence and PAN card. [Chapter 2](02-kyb-and-bank.md#23-two-ways-to-get-approved).

**"Do I have to pay to join?"**
No setup fee. Suppliers who joined from 14 Sep 2026 need a subscription, but it is free during the launch offer, and the price isn't set yet. [Chapter 7](07-profile-sharekit-plans.md#75-subscription).

### Listings and prices
**"How do I change my price?"**
Listings panel → **Update pricing** (base price) or Seats and schedule (per-departure prices, seasonal rates, promotions). New prices apply to **new** bookings only.

**"How do I close a date?"**
One listing: Seats and schedule → Blackout dates or Calendar. Whole business, one vehicle or a vehicle type: **Block dates**. [Chapter 3](03-listings-and-inventory.md#35-block-dates-whole-business-rules).

**"How do I stop last-minute bookings?"**
Seats and schedule → **Stop bookings before start (minutes)**, e.g. 240 for 4 hours. Not the wizard's "Min advance booking" field.

**"How do I edit my listing description or photos?"**
Not possible after creation today. Create a corrected listing (or Clone), then unpublish the old one.

**"Why does my date show sold out?"**
Seats are full (confirmed + 10-minute holds), a shared vehicle is full, or the date is closed in the Calendar or Block dates.

### Bookings
**"I missed a booking. Where did it go?"**
If a booking needing acceptance isn't accepted within the window (10 minutes by default), it moves to another supplier or to operations. Save Seats & schedule so bookings confirm instantly. [Chapter 4](04-bookings.md#41-how-a-booking-arrives).

**"Can I cancel a booking?"**
Yes, but the traveler gets a full refund to their wallet and the supplier is paid nothing. Call support first. [Chapter 4](04-bookings.md#44-supplier-cancellations).

**"The traveler didn't show up."**
Don't cancel. Cancelling refunds them 100%. Report the no-show to operations.

**"Can the traveler's price change after booking?"**
No. The price is fixed at checkout.

### Drivers and trips
**"Why wasn't a driver assigned automatically?"**
Usual causes: driver has no email, no seat count, wrong vehicle category, not Available, or already has a trip at that time. The dispatch queue lists what is missing. [Chapter 5](05-fleet-and-dispatch.md#53-automatic-assignment).

**"The driver can't start the trip."**
The pickup OTP is needed, and the driver's phone must have shared location in the last 5 minutes. After 5 wrong OTP tries it locks and operations must reset it.

**"My driver has no smartphone."**
Assign the driver, call them, then use **confirmed by phone** with a note. [Chapter 5](05-fleet-and-dispatch.md#54-manual-assignment).

### Money
**"How much commission do you take?"**
30% by default, frozen on each booking. Coupons and referral discounts come out of Idea Holiday's share, not the supplier's. [Chapter 6](06-money-and-payouts.md).

**"Where is my payout?"**
Follow the checklist in [chapter 6](06-money-and-payouts.md#65-where-is-my-payout-checklist).

### Growth
**"How do I rank higher?"**
Search ranks by verified review rating. Get more real reviews: review QR in vehicles, voucher QR, review links on WhatsApp. Reply to reviews.

**"Can I buy the Verified badge?"**
No. They can buy the Verified **check** (₹999 + GST a year). The badge appears only if it passes; otherwise they get a refund. [Chapter 7](07-profile-sharekit-plans.md#74-verified-badge-and-spotlight).

**"Why can't I put my phone number on my profile?"**
To keep bookings safe on Idea Holiday. Travelers use Enquiries, and contact details are shared once they book.

## 9.2 Known gaps: don't promise these

Checked 2026-09-15. Tell the tech team when one is fixed, so this list stays true.

| # | Area | What the screen suggests | What really happens | Chapter |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Listing wizard | "Min advance booking (hours)" sets the cut-off | Saved but not used. The cut-off is "Stop bookings before start" in Seats & schedule. | [3](03-listings-and-inventory.md#step-6-settings) |
| 2 | Listing wizard | "Booking mode: Instant / Request approval" | Saved but not used. Instant only after Seats & schedule is saved; before that, every booking needs acceptance. Saving a schedule always makes it instant. | [3](03-listings-and-inventory.md#step-6-settings) |
| 3 | Transfers | Could be instant | Transfers have no Seats & schedule button, so wizard-created transfer bookings always need acceptance | [3](03-listings-and-inventory.md#33-managing-listings-overview--inventory--listings) |
| 4 | Listing wizard | Duration placeholder "8" | Blank duration is saved as 4 hours | [3](03-listings-and-inventory.md#step-6-settings) |
| 5 | Listings | Content can be managed later | Title, description, photos and itinerary can't be edited after creation | [3](03-listings-and-inventory.md#step-7-review) |
| 6 | Listing wizard | Photos | Takes image links only, no upload | [3](03-listings-and-inventory.md#step-2-about--photos) |
| 7 | Listings | Bulk Publish / Pause / Archive / ± price | Shows success, changes nothing | [3](03-listings-and-inventory.md#33-managing-listings-overview--inventory--listings) |
| 8 | Refunds | One refund rule per policy | Two My Trips cancel screens calculate differently. One treats **Non-Refundable** and **Flexible 48h** as "100% if 72h+ before". | [4](04-bookings.md#45-traveler-cancellations-and-refunds) |
| 9 | Refunds | "Moderate: 50% refund if cancelled 48h before" | Really 100% at 48h+, 50% between 24h and 48h | [4](04-bookings.md#45-traveler-cancellations-and-refunds) |
| 10 | Payouts | Late traveler cancellation pays the supplier their share | Via the "cancel / change booking" screen, the payout is cancelled even with a partial or no refund | [6](06-money-and-payouts.md#62-what-the-supplier-earns) |
| 11 | Bookings | [`BUSINESS_RULES.md`](../BUSINESS_RULES.md) §2: 24h to accept | Code default is 10 minutes | [4](04-bookings.md#41-how-a-booking-arrives) |
| 12 | Cancellation | "Traveler no-show" is a supplier cancel reason | Still refunds the traveler 100% and pays the supplier nothing | [4](04-bookings.md#44-supplier-cancellations) |
| 13 | KYB | Any business can be approved | Without Cashfree GSTIN + PAN, approval needs a transport licence, even for attractions or activities | [2](02-kyb-and-bank.md#23-two-ways-to-get-approved) |
| 14 | Overview | Earnings overview card | "Today", "This month", growth % and 7-day line are not real | [8](08-overview-analytics-channels.md#81-the-overview-screen-top-to-bottom) |
| 15 | Overview | Growth score "Excellent" | Always says Excellent | [8](08-overview-analytics-channels.md#growth-score-card) |
| 16 | Overview | Revenue pulse monthly bars | Always March to August 2026 | [6](06-money-and-payouts.md#64-the-settlement-register-overview) |
| 17 | Analytics | Tab opens analytics | Tab shows the Overview; the analytics screen's trend and SLA numbers are samples | [8](08-overview-analytics-channels.md#82-analytics) |
| 18 | Channel Manager | Connect Bókun, FareHarbor and others | Without an OCTo URL: connection isn't checked and import creates **sample** listings. Only Standard OCTo fully works. | [8](08-overview-analytics-channels.md#84-channel-manager) |
| 19 | Public profile | Verified: "Contact support to start" | Suppliers can buy the check in Plans | [7](07-profile-sharekit-plans.md#74-verified-badge-and-spotlight) |
| 20 | Payouts | A payout schedule | No automatic cycle; Finance creates settlement batches by hand | [6](06-money-and-payouts.md#63-payout-stages) |

## 9.3 Escalation

| Problem | Send to |
| :--- | :--- |
| KYB review, rejection reason, suspension | Admin (supplier approval) |
| No driver 6 hours before pickup, OTP locked, traveler no-show | Operations |
| Payout missing, wrong amount, refund dispute | Finance |
| Anything in 9.2, or the portal behaving differently from this guide | Tech team |

When escalating, include the **Supplier ID**, the **booking reference** or **Product ID**, and a screenshot.
