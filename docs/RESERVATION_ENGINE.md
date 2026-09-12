# Reservation engine

> How seats, rates and holds actually work. Read this before touching capacity,
> pricing, holds, or anything under `native_*`.
>
> Code: `backend/src/services/nativeInventoryService.js`,
> `reservationProviders.js`, `reservationOutboxService.js`.

---

## 1. What a supplier configures

**Supplier dashboard → Listings → Seats and schedule**, five tabs:

| Tab | Sets |
| :--- | :--- |
| **Seats & schedule** | Operating weekdays, departure times, seats per departure, adult/child prices, senior/youth/infant prices, seatless units, party-size bounds, cut-off minutes, free-cancellation hours, blackout dates |
| **Seasonal rates** | Date-ranged, weekday-filtered rates with a priority |
| **Calendar** | Close or resize one date, one departure, or a whole date range |
| **Promotions** | Percentage or flat discounts, optionally behind a promo code, optionally keyed on booking lead time |
| **Shared vehicle** | Link this option to a vehicle or guide shared with other options |

Times are `Asia/Kolkata`. Prices are INR **before** the 5% tax calculation.
Saving enables instant confirmation for that option.

Guard rails: a listing with untracked existing reservations cannot enable seat
inventory until reconciled; capacity can never drop below seats already
reserved; blackouts and closures stop new sales without cancelling held or
confirmed reservations.

A range edit (`calendar/range`) applies to every operating date in one
transaction, optionally narrowed to selected weekdays. It is deliberately
**all-or-nothing**: one date with too many seats already reserved leaves the
whole range untouched rather than half-edited. Non-operating dates are skipped
and reported back.

---

## 2. How a departure resolves

For any `(option, date, time)`:

**Price** — first match wins:
1. Highest-`priority` seasonal schedule covering the date *and* its weekday.
   Ties break on the most recently created.
2. The option's base `adult_price` / `child_price`.

A seasonal rate **overlays** the base unit-price map rather than replacing it, so
a senior rate priced once on the schedule keeps selling in season unless the
seasonal rate deliberately overrides it.

**Capacity and open/closed** — first match wins:
1. An override for that exact `(date, time)`.
2. An override for the whole `(date)`.
3. The weekly operating rules and blackout dates.

**Promotion** — applied *after* the rate resolves, discounting whatever price
that day already had:
1. Collect active promotions whose every declared window is satisfied — booking
   date, travel date, party size, redemption cap, and **booking lead time**.
2. A promotion with no `code` is public. One with a code applies only when the
   traveler supplies it, so unredeemed codes never appear in public availability
   or the price calendar.
3. Highest priority wins, then the deepest discount. **At most one promotion ever
   applies — discounts never stack**, because a stacked total is impossible to
   explain back to a supplier.

The slot publishes both: `listAdultPrice`/`listUnitPrices` (before discount) and
`adultPrice`/`unitPrices` (what the traveler pays), plus `promotion`.

**Final vacancies** are the **smallest** of the departure's own pool and every
shared resource linked to it, counted per departure time — so one van is free
again at a later slot.

`status` is one of `AVAILABLE`, `SOLD_OUT`, `CUTOFF`, `CLOSED`.

---

## 3. Hold lifecycle

```
ON_HOLD ──(verified payment)──► CONFIRMED
   │
   ├──(10 min elapse)──► EXPIRED
   └──(failure/cancel)──► CANCELLED
```

- The product page polls uncached availability every 15 seconds. Checkout
  reserves seats for **10 minutes** on entry, after sign-in.
- Requests carry an **owner-scoped idempotency key**. Refreshing checkout reuses
  the same hold and its original expiry. Reusing a key with different details is
  rejected as `IDEMPOTENCY_CONFLICT`.
- Both engines serialise capacity mutations on the product row inside a
  transaction. Expired holds stop occupying seats **immediately** by query, not
  when the cleanup timer runs.
- A hold is bound to its owner, option, departure and unit breakdown. Its price
  and cancellation terms are **frozen**; the hold's own breakdown wins over
  anything re-sent at checkout.
- Verified payment flips `ON_HOLD → CONFIRMED` with no second deduction.
- Signed payment failure releases unconfirmed inventory. Late or
  amount-mismatched captures enter `PAYMENT_REVIEW_REQUIRED`, raise an ops task,
  and never confirm unavailable seats.
- Native bookings are supplier-accepted immediately and skip the manual
  acceptance timer. Cancellation frees inventory; rescheduling moves reserved
  seats inside the booking transaction.
- Paid vouchers carry a QR pointing at the protected booking page. It contains a
  booking reference — never guest details or the pickup OTP.

Demo payments are restricted to local and test runtimes. Cloud Run and
production cannot issue free confirmations even if legacy demo flags are set.

---

## 4. Unit types

| Unit | Occupies | Billed from |
| :--- | :--- | :--- |
| `ADULT`, `SENIOR`, `YOUTH` | an adult seat | its own rate |
| `CHILD`, `INFANT` | a child seat | its own rate |

- `ADULT` and `CHILD` always sell. Other types sell **only** when the supplier
  priced them; an unpriced type is refused with `UNIT_TYPE_NOT_SOLD` rather than
  quietly billing as an adult.
- `bookings.adults` / `bookings.children` stay the **canonical seat counts** read
  by capacity, dispatch, vouchers, finance and notifications.
  `booking_unit_items` is the additive billing breakdown.
- **Seatless units** (`seatless_units`) bill without consuming a seat — an infant
  on a lap. They are excluded from the seat counts but still priced and still
  recorded for the manifest. `ADULT` can never be seatless. Opt-in per option.

---

## 5. Three pricing mechanisms, kept distinct

Easy to confuse, so: they key on different things and stack in this order.

| Mechanism | Keyed on | Produces |
| :--- | :--- | :--- |
| `native_price_schedules` | **travel** date + weekday | an absolute seasonal rate |
| `native_promotions` | **booking** time, lead time, party size, code | a discount off the resolved rate |
| `promo_codes` (`promoService`) | a traveler-entered platform code at checkout | a discount off the booking **total** |

A supplier promotion changes the departure's price and is visible in availability.
A platform promo code is applied later, at checkout, against the whole order.
They are independent and can both apply to one booking.

---

## 6. Notifications

Confirmation inserts a durable outbox row in the **same transaction** as seat
confirmation. Delivery starts immediately; a five-second worker recovers pending
work and failed channels retry after five minutes. A lease stops two workers
claiming one event, and provider delivery keys suppress successful retries.

A process failure between provider acceptance and local acknowledgement can still
cause at-least-once redelivery. Outbox rows stay pending when a channel is
unconfigured. Operations can inspect `/api/ops/notification-health`.

---

## 7. OCTo alignment

| Internal concept | OCTo field / state |
| :--- | :--- |
| Product and booking option | `productId`, `optionId` |
| Stable departure identity | `availabilityId`, `availability_slot` |
| Departure availability | `localDateTimeStart`, `utcCutoffAt`, `capacity`, `vacancies` |
| Reservation lifecycle | `ON_HOLD`, `CONFIRMED`, `EXPIRED`, `CANCELLED` |
| Hold deadline | `utcExpiresAt` |
| Traveler units | `unitItems` with stable unit identities |

`reservationProviders.js` defines the provider boundary: availability, reserve,
confirm, release. `reservation_external_references` maps supplier-scoped provider
IDs to local product/option/unit/availability/booking IDs.

This is an **OCTo-aligned internal foundation**, not an OCTo-certified public API.

---

## 8. Schema

| Migration | Adds |
| :--- | :--- |
| `017_native_reservations` | Rules, departure slots, reservations |
| `018_native_reservation_delivery` | Confirmation outbox |
| `019_native_hold_pricing` | Frozen pricing snapshot on holds |
| `021_reservation_engine_v2` | Seasonal rates, calendar overrides, party-size bounds |
| `022_booking_unit_items` | Extended unit prices, billed unit breakdown |
| `023_shared_resources` | Shared vehicles/guides, seatless units |
| `024_native_promotions` | Promotional rates, promo codes, redemption tracking |

Apply with `cd backend && npm run migrate:up`. Server startup also applies
pending migrations. Field-level detail is in [`DATA_MODEL.md`](DATA_MODEL.md);
endpoints are in [`API_CONTRACTS.md`](API_CONTRACTS.md).

---

## 9. Known gaps

- **Bulk calendar editing** — a capacity or closure across a date range needs one
  request per date today.
- **External provider adapters** — the channel manager imports products, but
  `reservationProviders.js` still runs only `NATIVE` for live availability and
  booking. A real Bókun/FareHarbor adapter must implement supplier
  authentication, capability discovery, its own idempotency and reconciliation.
