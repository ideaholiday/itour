# Play Store Listings and Forms: Idea Holiday Android apps

> **Summary:** Text and answers to paste into Play Console for the traveler and supplier apps: store listing, data safety, content rating, target audience and app access. Each answer is checked against the code and the privacy policy (2026-10-01).
> **Read when:** filling in or updating a Play Console form, or when an app starts collecting new data. Decisions behind the apps: [`DECISIONS_MOBILE.md`](DECISIONS_MOBILE.md).

Both apps show the live website (ADR 052), so they collect what the website collects, plus a push token. When the website starts collecting something new, update the data-safety form too.

## Open before submitting

1. **Google Tag Manager tags: UNKNOWN.** `GTM-KV6P5HRR` loads on every page, inside the apps too. Which tags it fires is configured in GTM, not in this repo. If a Meta (Facebook) or Google Ads tag fires, add **App activity → App interactions: Shared, Advertising or marketing** to both forms below. If only Google Analytics fires, the forms are right as written.
2. **The KYB selfie** is in the privacy policy since 2026-10-01 (supplier section). Deploy the frontend before submitting, so the live policy matches the form.
3. **App access needs test accounts.** The supplier app is entirely behind sign-in, and traveler booking needs it. Create a reviewer traveler account and a reviewer supplier account with one sample listing, and enter the credentials **only in Play Console** (App content → App access), never in the repo.

## Traveler app: `in.ideaholiday.app`

**Category:** Travel & Local · **Contact email:** grievance@ideaholiday.in or the support address · **Privacy policy:** https://ideaholiday.in/privacy-policy · **Website:** https://ideaholiday.in

**App name** (max 30): `Idea Holiday: Tours & Trips`

**Short description** (max 80):
`Book tours, activities and cabs in India with live seats and instant vouchers`

**Full description** (max 4000):

```
Plan and book your trips in India with Idea Holiday.

Find tours, activities and transfers from local operators, see live seat availability, and get an instant confirmation with a QR voucher. No inquiry forms and no waiting for a quote.

WHAT YOU CAN DO
• Search tours, day trips and activities by city, with clear prices before you pay
• Book airport and city transfers with tolls, permits and GST shown up front
• Book a multi-city trip in one order, such as Delhi, Agra and Jaipur
• Pay securely by UPI or card through Cashfree. The app opens your UPI app for you
• Download your QR voucher and show it at check-in
• Track your driver live on the map on the day of your trip
• Get booking confirmations, reminders and trip updates as notifications, on WhatsApp and by email
• Reschedule or cancel under the operator's policy, with refunds to your Idea Holiday wallet or your original payment method
• Read verified reviews from travelers who completed the trip, and write your own

LOCAL OPERATORS, CHECKED BY US
Operators sign up through our supplier platform. A Verified badge shows operators our team has checked.

YOUR DATA
We ask for your location only when you choose a pickup point. Payment details are entered on our payment gateway's page; we never see or store your card or UPI details.

Idea Holiday Private Limited, Lucknow.
```

### Data safety

- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes** (HTTPS only)
- Do you provide a way for users to request that their data is deleted? **Yes**: https://ideaholiday.in/delete-account

| Data type | Collected | Shared | Required? | Purposes |
| :--- | :--- | :--- | :--- | :--- |
| Personal info → Name | Yes | No | Required | App functionality, Account management |
| Personal info → Email address | Yes | No | Required | App functionality, Account management, Developer communications |
| Personal info → Phone number | Yes | No | Required | App functionality, Developer communications |
| Financial info → Purchase history | Yes | No | Required | App functionality |
| Location → Approximate location | Yes | No | Optional | App functionality, Analytics (from IP address) |
| Location → Precise location | Yes | No | Optional | App functionality (choosing a pickup point) |
| Messages → Other in-app messages | Yes | No | Optional | App functionality (messages to operators and support) |
| Photos and videos → Photos | Yes | No | Optional | App functionality (review photos) |
| App activity → App interactions | Yes | No* | Required | Analytics |
| App activity → In-app search history | Yes | No | Required | App functionality, Analytics |
| App info and performance → Diagnostics | Yes | No | Required | Analytics (page-speed measurements) |
| Device or other IDs | Yes | No | Optional | App functionality (push notification token) |

\* See "Open before submitting" item 1.

Why "Shared: No": the operator receives the traveler's booking details because the traveler booked with them, and Cashfree, Google Cloud, Supabase, Brevo and the other providers process data on our behalf. Google counts neither as sharing. Card and UPI details are entered on Cashfree's page and never reach our servers, so Financial info → Payment info is not declared.

## Supplier app: `in.ideaholiday.supplier`

**Category:** Business · **Privacy policy:** https://ideaholiday.in/privacy-policy · **Website:** https://supply.ideaholiday.in

**App name** (max 30): `Idea Holiday Supplier`

**Short description** (max 80):
`Run your tour business: live bookings, calendar, check-in, quotes and payouts`

**Full description** (max 4000):

```
Idea Holiday Supplier is the app for tour operators, transfer companies and activity providers who sell on Idea Holiday or run their bookings with us.

Your listings, calendar and bookings in one place, on your phone.

RUN YOUR INVENTORY
• Create tours, activities and transfers with schedules, capacity and cut-off times
• Set seasonal rates, promotions and group-size rules
• Close a date or a departure, or resize it, in one tap
• Share vehicles and guides across products so you never overbook

TAKE EVERY BOOKING
• Marketplace bookings from Idea Holiday travelers, with instant notifications
• Add walk-in, phone and WhatsApp bookings to the same calendar
• Give agents their own net rates and credit limits
• Import your products from Bókun, FareHarbor and other booking systems

ON THE DAY
• Scan a traveler's QR voucher with your camera to check them in
• See the guest list for each departure and download it
• Assign guides, drivers and vehicles to departures
• Mark no-shows, or cancel a departure with refunds handled for you

QUOTES AND PACKAGES
• Build day-by-day package quotations from your own rate sheet
• Send them as a PDF by email or WhatsApp

YOUR TEAM AND YOUR MONEY
• Logins for managers, front desk staff and guides, each seeing only what they need
• Earnings, payouts and balance due on direct bookings

You need an Idea Holiday supplier account. Sign up at supply.ideaholiday.in.

Idea Holiday Private Limited, Lucknow.
```

### Data safety

General answers are the same as the traveler app (collects data: Yes; encrypted in transit: Yes; deletion: https://ideaholiday.in/delete-account).

| Data type | Collected | Shared | Required? | Purposes |
| :--- | :--- | :--- | :--- | :--- |
| Personal info → Name | Yes | No | Required | App functionality, Account management |
| Personal info → Email address | Yes | No | Required | App functionality, Account management, Developer communications |
| Personal info → Phone number | Yes | No | Required | App functionality, Developer communications |
| Personal info → Address | Yes | No | Required | App functionality, Fraud prevention, security and compliance (business address) |
| Personal info → Other info | Yes | No | Required | Fraud prevention, security and compliance (PAN, GSTIN) |
| Financial info → Other financial info | Yes | No | Required | App functionality (bank account for payouts) |
| Financial info → Purchase history | Yes | No | Optional | App functionality (paid plans) |
| Photos and videos → Photos | Yes | No | Optional | App functionality (listing photos), Fraud prevention, security and compliance (owner selfie) |
| Files and docs | Yes | No | Required | Fraud prevention, security and compliance (licences, business documents) |
| Location → Approximate location | Yes | No | Optional | Analytics (from IP address) |
| Location → Precise location | Yes | No | Optional | App functionality (placing transfer points on a map) |
| Messages → Other in-app messages | Yes | No | Optional | App functionality (support) |
| App activity → App interactions | Yes | No* | Required | Analytics |
| App info and performance → Diagnostics | Yes | No | Required | Analytics (page-speed measurements) |
| Device or other IDs | Yes | No | Optional | App functionality (push notification token) |

\* See "Open before submitting" item 1. Cashfree verifies PAN, GSTIN and bank accounts on our behalf, which is processing, not sharing.

## Both apps: other App content forms

- **Ads:** No, the app does not contain ads.
- **Content rating:** category *All Other App Types*. Answer No to violence, sexuality, language, controlled substances and gambling. Users interact or exchange content: **Yes** (reviews and messages, moderated). Shares the user's location with other users: **No**. Digital purchases: **No** (bookings are real-world services).
- **Target audience:** 18 and over only. Not designed for children.
- **Financial features:** none. The wallet holds refund credit that can only be spent on Idea Holiday.
- **Government app / Health / News:** No.
- **Foreground service (supplier and traveler):** none; only the driver app declares one (ADR 052).
