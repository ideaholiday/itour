# 3. Listings and inventory

> **Summary:** Creating a listing with the 7-step wizard, what every field really does, managing listings (publish, price, clone), and setting seats, schedules, seasonal rates, promotions and closed dates.
> **Read when:** helping a supplier list a product, change a price, close dates, or understand why a date shows sold out.

[Back to the guide](README.md)

## 3.1 The 5 product types

Start with **New listing** (Overview) → choose a type → the wizard opens.

| Type | For | Sub-types |
| :--- | :--- | :--- |
| **Package** | 2 to 7+ day holidays | With hotel (3/4/5-star tiers) · Without hotel |
| **Tour** | Day tours and excursions | Shared (SIC coach, per-person price, fixed pickup hubs) · Private tour (price per vehicle) |
| **Transfer** | Point-to-point private rides | Airport / Railway · Intercity hotel · City to city |
| **Attraction** | Venues, shows, theme parks | Ticket only · Ticket + shared transfer · Ticket + private transfer |
| **Experience** | Active, hands-on activities | Ticket only · Ticket + shared transfer · Ticket + private transfer |

> **Tell the supplier:** "Make one listing per thing a traveler would search for. An airport pickup and a city tour are two listings, not one."

## 3.2 The listing wizard, step by step

The steps along the top: **Product Type → About & Photos → Overview → Itinerary → Pricing → Settings → Review**. The wizard auto-saves progress in the supplier's browser, so an accidental refresh doesn't lose work.

### Step 1: Product Type
Choose the type and sub-type. The later steps only show fields that type needs.

### Step 2: About & Photos
| Field | Required | Advice |
| :--- | :--- | :--- |
| Product title | Yes | Say what and where: "Goa Airport to North Goa Hotel, Private AC Sedan" |
| City, State / Region | Yes | The city travelers will search |
| Short summary | Strongly advised | 1 to 2 sentences shown on the listing card |
| Full description | No | What makes it special. If left empty, the short summary is used. |
| Hero image URL | Strongly advised | **A web link to an image**, not a file upload. Listings without one look broken. |
| Gallery images | No | Up to 5 more image links |

> **Known gap:** the wizard takes image *links*, not uploads. Suppliers without their photos online need help from the team.

### Step 3: Overview
Four lists: **Highlights** (e.g. "Dudhsagar waterfall visit"), **Inclusions** (e.g. "AC vehicle, English guide"), **Exclusions** (e.g. "Meals, entry tickets"), **Essential info** (e.g. "Minimum age 18").

> **Tell the supplier:** "Clear exclusions prevent most complaints. If the entry ticket isn't included, say so."

### Step 4: Itinerary
Add steps with day number, time, title, duration and description. A package uses day numbers; a day tour uses times.

### Step 5: Pricing
- **Base price (₹)**: required, above 0. It is the "from" price on the listing card.
- **Strike / crossed price**: optional. Shows a crossed-out higher price with a discount badge. Only use a real earlier price.
- Depending on type:
  - **Ticket tiers** (Attraction, Experience, shared Tour): Adult, Child, Senior, Infant with age range and price. "Free" for infants.
  - **Vehicle options** (Transfer, private Tour, ticket + private transfer): Sedan, SUV/MPV, Tempo Traveller, Mini Bus, AC Coach. The price is **per vehicle**, not per person. Mark one "★ Best".
  - **Hotel tiers** (Package with hotel): extra price per person per night for each star category.

### Step 6: Settings
**Duration & Capacity**
| Field | What it means |
| :--- | :--- |
| Duration hours (days for packages) | How long the trip lasts. **If left blank, 4 hours is saved.** The grey "8" is only an example. |
| Min pax / Max pax | Smallest and largest group allowed |
| Min advance booking (hours) | Meant to be how long before the start time bookings stop. See the gap below. |

**Booking mode**
- **Instant Confirmation**: the traveler pays and the booking is confirmed straight away.
- **Request Approval**: the supplier accepts or rejects each booking.

> **Known gap:** on this screen, *Min advance booking* and *Booking mode* are saved but **not used** when a traveler books. What really controls them:
> - The cut-off is **"Stop bookings before start (minutes)"** in Seats & schedule (§3.4).
> - Confirmation is **instant** once Seats & schedule is saved. **Before** a schedule is saved, every paid booking waits for the supplier to accept, whatever was chosen here.
>
> Don't promise a supplier that this screen's choice will apply.

**Cancellation policy**: Non-Refundable · Flexible 24h · Flexible 48h · Moderate 48h. See [chapter 4](04-bookings.md#45-traveler-cancellations-and-refunds) for the refunds each one really gives. There is also a **Show "Free Cancellation" badge** tick box.

**Languages**: tap every language the guide or driver speaks.

**SIC pickup hubs** (shared tours only): hub name, address and departure time. Add at least one.

### Step 7: Review
A checklist shows: type selected, title, city and state, short description, hero image, base price. The system only *requires* title, city, state and a price above 0; the rest is advice, but follow it. Then:
- **Publish to Marketplace**: creates the listing as **PUBLISHED** and shows its public marketplace link.
- **Save Draft** (top right): creates the listing as **DRAFT**, not visible to travelers.

> **Known gap:** after a listing is created, its title, description, photos, itinerary and settings **cannot be edited** in the portal. Only price, schedule and publish status can be changed. To fix content, the supplier makes a new listing (or uses Clone for a new draft, which copies the same content) and unpublishes the old one. Check everything on the Review step before publishing.

## 3.3 Managing listings (Overview → "Inventory & Listings")

Search by keyword, and filter by type and status. Each listing card shows:
- Status: **PUBLISHED**, **DRAFT**, **PAUSED** or **PENDING_REVIEW**, and a small ⚡ when "instant booking" is on.
- **Copy Product ID** and **Copy SEO Link** (the public marketplace link).

Actions:
| Button | What it does |
| :--- | :--- |
| **Publish Live / Unpublish** | Publish puts it in marketplace search. Unpublish moves it to DRAFT, out of search. Existing bookings stay. |
| **Update pricing** | Quick change of the base price and strike price. Affects **new** bookings only. |
| **Seats and schedule** | Opens the inventory editor (§3.4). Not shown for transfers. |
| **Clone** | Makes a copy as a DRAFT |
| **View live on marketplace** | Opens the public page |

> **Known gap:** the **bulk actions** bar (tick several listings → Publish / Pause / Archive / ± ₹ price) shows "completed successfully" but **changes nothing**. Change listings one by one until this is fixed.

> **Team note:** the Overview shows "Improve listing quality" when any listing is missing some of: title, short description, hero image, price, inclusions, itinerary.

> **Team note:** publishing isn't enough. The supplier must also be KYB-approved and covered by a subscription ([chapter 1](01-getting-started.md#13-the-4-things-a-supplier-needs-before-they-can-sell)).

## 3.4 Seats and schedule (the inventory editor)

This controls which dates and times can be booked and how many seats each has. **Saving it turns on instant confirmation for that option.** All times are India Standard Time. Choose the **booking option** at the top (usually "Standard option").

Five tabs:

### Seats & schedule (save this first)
| Field | Meaning | Default |
| :--- | :--- | :--- |
| Operating days | Weekdays the trip runs | All 7 |
| Departure times | Start times. Each one repeats on every operating day. | 09:00 |
| Seats per departure | Capacity of each departure | 20 |
| Adult price / Child price (₹) | Price **before 5% tax** | From the base price; child 50% |
| Stop bookings before start (minutes) | The real booking cut-off. 120 = bookings close 2 hours before. | 120 |
| Free cancellation before start (hours) | Full refund window for this schedule | 24 |
| Minimum travelers to run | For departures that only run with a group | 1 |
| Maximum per booking | 0 = no limit | 0 |
| Senior / Youth / Infant (₹) | Leave blank if not sold. Tick **No seat** for a lap infant (still billed and on the manifest). | Blank |
| Blackout dates | Close one date, or a range of up to 366 days (e.g. monsoon) | None |

Rules the system enforces:
- Seats can't be reduced below seats already booked or on hold.
- Blackouts stop **new** sales. They don't cancel existing bookings.
- When a traveler starts checkout, their seats are held for **10 minutes**.
- Seats left = seats per departure − confirmed seats − seats on hold.

### Seasonal rates
A different price for a date range (e.g. "Christmas week"), optionally only on some weekdays, with a **priority**. The highest priority wins. Blank traveler types keep the base price.

### Calendar
Change one date or a range without touching the weekly schedule:
- **Close or resize a departure**: one date, one time or the whole day. Close it, or set a different seat count.
- **Apply across a date range**: the same change for many dates, optionally only on certain weekdays. If any date in the range already has more bookings than the new seat count, **nothing** in the range changes.
- Remove an override to go back to the weekly schedule. Travelers see changes immediately.

### Promotions
A discount set by the supplier: **percent off** or **₹ off per traveler**.
- **When it applies:** all the time, **last minute** (within X hours of departure), or **early bird** (booked at least X hours ahead).
- Optional travel dates, a code (e.g. `MONSOON20`) and a usage limit.
- No code = shown to everyone. With a code = only travelers who enter it.
- **Only one promotion applies per booking.** They never stack.

> **Tell the supplier:** "A promotion lowers your price, so it lowers your earnings too. Use last-minute deals to fill empty seats, and early-bird deals for peak season."

### Shared vehicle
Link options that use the **same** vehicle or guide (e.g. one Tempo Traveller for a morning and an afternoon tour). Seats left is then the **smaller** of the option's seats and the vehicle's seats, per departure time.

## 3.5 Block dates (whole-business rules)

Overview → **Block Dates** quick action, or **Manage calendar**. This is separate from the per-listing blackout dates above and is checked on every booking.

1. **What it controls:** everything, one product or route, one vehicle category, or one fleet vehicle.
2. **Dates:** start and end. **Duration:** full day or a time slot.
3. **Inventory:** **Fully closed**, or **Limit capacity** (maximum bookings accepted in that period).
4. **Reason / internal note:** e.g. "Scheduled fleet maintenance".

Current rules are listed below the form and can be removed.

> **Tell the supplier:** "Block a car when it goes for service, and block everything on days you can't operate. It stops new bookings but keeps the ones you already have. Call support if an existing booking is affected."

---
For the tech team: `pages/ProductBuilder.jsx` (wizard, `POST /products/v2`), `components/supplier/SupplierListingsPanel.jsx`, `SupplierInventoryEditor.jsx` and its tabs, `BlockDatesModal.jsx`, `services/nativeInventoryService.js`, `availabilityService.js`. Engine rules: [`RESERVATION_ENGINE.md`](../RESERVATION_ENGINE.md).
