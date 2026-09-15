# 1. Getting started

> **Summary:** How a supplier signs up and logs in, the 4 conditions before their listings can be booked, the setup checklist, and a map of every tab in the portal.
> **Read when:** onboarding a new supplier, or a supplier says "travelers can't book me".

[Back to the guide](README.md)

## 1.1 Sign up

The supplier opens **supply.ideaholiday.in** and chooses **Create partner account** (page `/supplier/signup`).

| Field | Notes |
| :--- | :--- |
| Business or company name | Shown on their public profile. Use the real trading name. |
| Contact person | Private. Never shown to travelers. |
| Mobile number | Private. Used for WhatsApp alerts. |
| Work email address | Used to log in and for email alerts. |
| City | Chosen from Idea Holiday's approved city list. The state fills in automatically. |
| Password | At least 8 characters. |
| Partner terms | Must be accepted. |

After sign-up:
- The supplier gets a **Supplier ID** like `sup_coastalt_ab12cd`. It shows in the portal header. Ask for it whenever they contact support.
- KYB status starts as **PENDING**.
- A public profile page is created at `/suppliers/<name>`. Google won't show it until KYB is approved.
- While the launch offer is running, a new supplier gets a free subscription automatically (see [chapter 7](07-profile-sharekit-plans.md#75-subscription)).

> **Tell the supplier:** "Sign-up takes 2 minutes. Next, finish verification in the **Compliance** tab. Until you're approved, travelers can't see or book your listings."

## 1.2 Log in

- Web address: **supply.ideaholiday.in**, then **Sign in to Supplier Portal**.
- Only supplier accounts can use it. A traveler account is refused there.
- If the login works but the screen says **"Supplier account not linked"**, the user account has no supplier profile attached. They must finish sign-up, or support must link the account.

## 1.3 The 4 things a supplier needs before they can sell

A listing can be booked only when **all** of these are true:

| # | Condition | Where to check | If it is missing |
| :--- | :--- | :--- | :--- |
| 1 | **KYB is APPROVED** | Compliance tab, or the yellow/red banner at the top | Nothing from this supplier is bookable. See [chapter 2](02-kyb-and-bank.md). |
| 2 | **The listing is PUBLISHED** | Listings panel: the "Publish Live" / "Unpublish" button | That listing is hidden from search. |
| 3 | **Subscription is covered** (only for suppliers who joined on or after 14 Sep 2026) | Plans tab, and the Action center on Overview | Listings stay visible but can't take **new** bookings. Existing bookings are not affected. |
| 4 | **The supplier is open on that date/time** | Seats & schedule, Calendar, Block dates | That date shows sold out, closed or past the cut-off. |

> **Team note:** when a supplier says "nobody can book me", check these 4 in order. Number 1 is the most common cause.

## 1.4 The setup checklist

A new supplier with no listings and no bookings sees **"Welcome to Idea Holiday! Complete your setup"** on the Overview, with a progress percentage:

1. **Account created**: always done.
2. **KYB verification**: done when KYB is APPROVED.
3. **Add first listing**: done after one listing is created.
4. **Add fleet driver**: done after one driver is added.

The card disappears as soon as the supplier has a listing or a booking.

> **Tell the supplier:** "Do the steps in order: verify, list, add drivers. Step 4 matters even if you have only one car. Automatic driver assignment only works with drivers added to your fleet."

## 1.5 Map of the portal

The top bar shows the company name, Supplier ID, KYB status, **View marketplace**, a notification bell, a bookings bell with a count of pending bookings, and the account menu (Sign out).

The tabs below it:

| Tab | What it is for | Chapter |
| :--- | :--- | :--- |
| **Overview** | Home screen: numbers, "What needs you now", payouts table, upcoming trips, listings | [8](08-overview-analytics-channels.md) |
| **Bookings** | All bookings: accept, assign drivers, verify OTP, cancel. Also reviews and support cases. The badge counts bookings waiting for confirmation. | [4](04-bookings.md), [5](05-fleet-and-dispatch.md) |
| **Listings** | Jumps to the listings panel on Overview. The badge shows how many listings exist. | [3](03-listings-and-inventory.md) |
| **Channel Manager** | Connect an outside booking system and import products | [8](08-overview-analytics-channels.md#84-channel-manager) |
| **Fleet** | Opens the driver roster | [5](05-fleet-and-dispatch.md) |
| **Analytics** | Meant for performance charts. **Known gap:** this tab currently shows the Overview. Use the Analytics quick action instead. | [8](08-overview-analytics-channels.md#82-analytics) |
| **Public profile** | Edit the public page travelers and Google see | [7](07-profile-sharekit-plans.md) |
| **Share kit** | QR codes, printable standee and sticker, website reviews widget | [7](07-profile-sharekit-plans.md#73-share-kit) |
| **Enquiries** | Questions travelers sent from the profile | [7](07-profile-sharekit-plans.md#72-enquiries) |
| **Compliance** | KYB documents, GSTIN/PAN/bank checks, payout bank account. Shows "Action" or "Rejected" when needed. | [2](02-kyb-and-bank.md) |
| **Plans** | Subscription, Verified check, Spotlight, invoices. Shows "Action" when a subscription is needed. | [7](07-profile-sharekit-plans.md#75-subscription) |

Other pages:
- `/supplier/products/create`: choose the listing type (**New listing** button).
- `/supplier/products/new`: the listing wizard.
- `/supplier/portal` and `/supplier/coverage` simply redirect to the Overview.

## 1.6 Banners at the top

| Banner | Meaning | What the supplier should do |
| :--- | :--- | :--- |
| Yellow: "Your account is pending verification" | KYB is PENDING. Listings are hidden and can't be booked. | Upload documents or run the Cashfree checks in Compliance. |
| Red: "Your verification was not approved" | KYB is REJECTED. | Upload correct documents, or contact support to learn why. |
| Red: "Your account has been suspended" | KYB is SUSPENDED. No new bookings. | Contact support. |

---
For the tech team: `frontend/src/pages/SupplierSignup.jsx`, `SupplierDashboardPage.jsx`, `components/supplier/SupplierHeaderNav.jsx`; bookability rules in `SUPPLIER_PLANS.md` §1 and ADR 009.
