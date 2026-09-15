# 8. Overview, analytics, notifications and channels

> **Summary:** What each card on the Overview (home) screen means and which numbers are real, the Analytics screen, notifications, and the Channel Manager for suppliers who use another booking system.
> **Read when:** a supplier asks what a number on their dashboard means, or wants to connect Bókun, FareHarbor or another system.

[Back to the guide](README.md)

## 8.1 The Overview screen, top to bottom

### Header
"Partner command center" with **Refresh**, **Manage bookings** and **New listing**.

### Four cards
| Card | Shows | Reliable? |
| :--- | :--- | :--- |
| **Earnings overview** | "Today's payouts", "This month", growth %, 7-day trip line | **No.** "Today" is total revenue ÷ 30, "This month" is all-time revenue, the growth % (14.8%) and the 7-day line are placeholders. |
| **Today's trip snapshot** | In progress, upcoming, completed | Partly. "Completed" is all-time, not today. |
| **Quality score** | Rating, fulfillment, cancellation rate | Rating and fulfillment are real. Cancellation rate is just 100 − fulfillment. |
| **Quick actions** | New listing, Fleet & drivers, Block dates, Analytics, Payouts & bank | Shortcuts. "New listing" scrolls to the listings panel; "Payouts & bank" scrolls to the payouts table. |

> **Team note:** don't quote the Earnings overview card to suppliers. Use the **Net revenue** tile and the **Settlement register**, which use real payout data.

### Setup checklist
Only for new suppliers with no listings and no bookings. See [chapter 1](01-getting-started.md#14-the-setup-checklist).

### Four number tiles (real data)
| Tile | Calculation |
| :--- | :--- |
| **Net revenue** | Net payouts that aren't cancelled; the small line shows how much is already paid out |
| **Active bookings** | Bookings not completed or cancelled; the small line shows how many await confirmation |
| **Fulfillment rate** | Completed ÷ bookings not cancelled |
| **Partner score** (out of 100) | Traveler rating (35) + fulfillment (25) + share of listings marked instant (20) + listing completeness (20). With no reviews, the rating counts as 4.5 but the screen says "No verified reviews yet". |

### "What needs you now" (Action center)
Items appear only when they apply:
| Item | Level | Button goes to |
| :--- | :--- | :--- |
| Awaiting KYB / rejected / suspended | Urgent | Compliance |
| Subscription needed — not receiving new bookings | Urgent | Plans |
| Free launch offer until <date> | Info | Plans |
| X bookings need confirmation | Urgent | Bookings |
| X trips need a driver | Urgent | Fleet |
| Improve listing quality | Info | New listing |

When nothing applies: "You're all caught up".

### Growth score card
Shows the partner score. **Known gap:** it always says "Excellent" and the same encouraging text, whatever the score.

> **Team note:** the partner score is **not** used to rank listings. Marketplace search ranks by the bestseller flag, then the listing's **rating from verified reviews**. To rank higher, a supplier needs more good reviews from real bookings.

### Revenue pulse
Monthly net earnings bars, average booking, next payout, commission %. Details and the chart-month gap: [chapter 6](06-money-and-payouts.md#64-the-settlement-register-overview).

### Readiness & fleet
Bars for fleet drivers available, bookable (published) listings, and active blackout rules, plus **Manage calendar** and **Manage fleet** buttons.

### Settlement register
Latest payouts. See [chapter 6](06-money-and-payouts.md#64-the-settlement-register-overview).

### Upcoming trips
Up to 4 active bookings: date and time, reference (copy), Product ID (copy), traveler and pickup, driver ("Unassigned" in amber), call and WhatsApp buttons. **Open all bookings** goes to the Bookings page.

### Inventory & listings, and quality signals
The listings panel ([chapter 3](03-listings-and-inventory.md#33-managing-listings-overview--inventory--listings)) and 4 bars: traveler rating, trip fulfillment, listing completeness, instant bookability.

## 8.2 Analytics

Open with the **Analytics** quick action (the Analytics *tab* currently just shows the Overview).

| Section | Reliable? |
| :--- | :--- |
| Top 5 products by earnings | **Yes**, real bookings |
| Revenue trend (Mar–Aug 2026) | **No.** The same sample numbers for every supplier. |
| Avg response time 24 min, SLA 98.2%, driver assignment 95.5%, OTP 99.1% | **No.** Fixed sample numbers. |

> **Known gap:** do not show the Analytics screen to a supplier as their performance. Only the top-products list is real.

## 8.3 Notifications

- **Notification bell** (top bar): the latest 30 notices for the supplier. Mark one read, or all as read.
- **Bookings bell:** number of bookings waiting for confirmation. Click to open Bookings.
- Most urgent alerts (new booking to accept, driver needed, pickup not started) are also sent by **email and WhatsApp** to the supplier's registered contacts.

> **Tell the supplier:** "Save Idea Holiday's WhatsApp number and don't mute it. That's where urgent booking alerts arrive."

## 8.4 Channel Manager

**Channel Manager** tab. For suppliers who already manage bookings in another system.

**Two directions:**
1. **Idea Holiday → partners (OCTo API):** published products are available to connected partners through Idea Holiday's standard OCTo endpoints (`/api/octo/...`). OCTo is an open standard for sharing tour availability and bookings.
2. **Other systems → Idea Holiday (import):** connect a channel, press **Test Connection & Save**, then **Fetch & Import** to copy products into the supplier's catalog. **Disconnect** pauses the sync.

**Channels on screen:** Bókun, FareHarbor, Bookingkit (ResTech Europe), Palisis / TourCMS, an adventure & safari system, a ticketing & ferry system, and **Standard OCTo Endpoint** (any OCTo v1 system).

> **Known gap (important):** only the **Standard OCTo Endpoint** fully works: real products, live availability and bookings. For Bókun and the other named providers:
> - **Without an OCTo endpoint URL:** "Test connection" says connected as long as a key is typed (it isn't checked), and "Fetch" returns **sample products** (e.g. "Bókun Curated Island Tour & Water Sports"), not the supplier's real ones.
> - **With an OCTo endpoint URL:** real products can be fetched, but live availability and booking through that provider aren't built.
>
> **Don't let suppliers import from a named provider without an OCTo URL.** It would create fake listings in their account. Use the Standard OCTo Endpoint with their URL and token, or build listings manually.

---
For the tech team: `components/supplier/SupplierDashboardOverview.jsx`, `SupplierRevenueCard.jsx`, `SupplierPerformanceRing.jsx`, `SupplierAnalyticsDashboard.jsx`, route `/api/suppliers/:id/analytics/overview`, `SupplierNotificationBell.jsx`, `pages/supplier/SupplierChannelManagerPage.jsx`, `services/channels/channelRegistry.js`. Known gaps: [`RESERVATION_ENGINE.md`](../RESERVATION_ENGINE.md) §9.
