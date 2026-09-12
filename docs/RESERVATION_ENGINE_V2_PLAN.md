# Backend Improvement Plan: Reservation Engine v2

> **Status**: P0 implemented (migration `021`). P1 implemented (migration `022`).
> Supplier and traveler UI implemented. P2–P3 sequenced, not started.
> **Context**: [`docs/PROJECT_GOALS.md`](PROJECT_GOALS.md) — two products, one backend:
> `ideaholiday.in` (marketplace, Viator-like) and `supply.ideaholiday.in`
> (supplier reservation system, Bókun-like).

## Why this plan exists

Phase 1 delivered a working reservation engine: live vacancies, 10-minute holds,
atomic capacity deduction, cut-off enforcement, QR vouchers. That engine is
correct and well tested, but it is **thin where real ResTech platforms are deep**.

Audited against Bókun, Viator, GetYourGuide and Klook, four gaps stood out. Each
one is something a real supplier hits in their first week on the platform.

---

## Gap analysis

### Gap 1 — Pricing is frozen for all time *(P0, fixed)*

`native_inventory_rules` holds exactly one `adult_price` and one `child_price`
per option, with no date dimension. A supplier cannot charge more in December
than in monsoon season, or more at weekends than midweek.

Every comparable platform treats this as table stakes: Bókun calls it a *price
schedule*, GetYourGuide a *pricing period*, Viator *seasonal pricing*. Without
it, suppliers keep a spreadsheet and edit prices by hand twice a year — exactly
the manual work this platform exists to remove.

### Gap 2 — The calendar cannot be edited *(P0, fixed)*

A supplier could set weekly operating rules and blackout whole dates, but could
not say *"this Tuesday's 9:00 AM runs with 12 seats instead of 20"* or *"cancel
only the 2:00 PM departure on 14 March"*.

Worse, per-date capacity was actively impossible: `saveInventoryRules` rewrote
**every** materialized slot's capacity back to the rule capacity on every edit,
so any per-date value was silently clobbered on the supplier's next save.

### Gap 3 — No party-size rules *(P0, fixed)*

Nothing expressed *"this trek needs at least 4 travelers to run"* or *"maximum 8
per booking"*. Minimum-participant thresholds are standard on all four reference
platforms, and shared/SIC departures are the core Indian tour model.

### Gap 4 — OCTo unit types collapse to adult/child *(P0, bug fixed)*

`createOctoReservation` classified units with
`String(item.unitId).includes("child")`. A `SENIOR`, `INFANT` or `YOUTH` unit —
all valid OCTo types, and all present in `product_ticket_tiers` — silently
counted as an **adult and was charged the adult price**. The check also keyed on
the free-text `unitId` rather than the typed `unitType`, so a unit with id
`child_ticket` and type `ADULT` was miscounted too.

---

## P0 — Delivered

| # | Change | Where |
| :-- | :--- | :--- |
| 1 | Seasonal pricing: date-ranged, weekday-filtered, priority-resolved rate schedules | `native_price_schedules` |
| 2 | Per-departure calendar control: close or resize a single date, or one departure on a date | `native_slot_overrides` |
| 3 | Party-size rules: `min_party_size`, `max_party_size` | `native_inventory_rules` |
| 4 | OCTo unit mapping keyed on typed `unitType`, with documented adult/child collapse | `octoService.js` |

**Resolution order for a departure's price** — first match wins:
1. Highest-`priority` schedule whose date range contains the travel date *and*
   whose weekday list includes that weekday. Ties break on the most recently
   created schedule.
2. The option's base `adult_price` / `child_price`.

**Resolution order for a departure's capacity and open/closed state**:
1. An override for that exact `(date, time)`.
2. An override for the whole `(date)`.
3. The option's weekly operating rules and blackout dates.

Holds keep their existing price-snapshot guarantee: the price resolved when the
hold was taken is frozen into `pricing_snapshot`, so a supplier changing a rate
mid-checkout cannot move the traveler's total.

---

## P1 — Multi-unit-type bookings *(delivered, migration `022`)*

`SENIOR`, `INFANT` and `YOUTH` are now first-class billable units end to end,
without disturbing the seat counts the rest of the platform depends on.

**The design that made this safe**: `bookings.adults` and `bookings.children`
remain the *canonical seat counts* that capacity, dispatch, vouchers, finance and
notifications read. Unit items are an **additive breakdown** carrying the billed
unit type and its frozen price. Every unit still occupies exactly one seat, so
capacity arithmetic is unchanged — only the money moved.

| Unit type | Occupies | Priced from |
| :--- | :--- | :--- |
| `ADULT`, `SENIOR`, `YOUTH` | an adult seat | its own rate, falling back to none |
| `CHILD`, `INFANT` | a child seat | its own rate, falling back to none |

- `native_inventory_rules.unit_prices` and `native_price_schedules.unit_prices`
  hold the extended rate map. `ADULT` and `CHILD` always exist; other types are
  sold **only** when the supplier priced them, so an unpriced type is refused
  with `UNIT_TYPE_NOT_SOLD` rather than being quietly billed as an adult.
- Seasonal schedules carry their own unit map, so a senior rate can differ in
  peak season.
- `native_reservations.unit_items` freezes the breakdown at hold time, and the
  hold's own breakdown wins over anything re-sent at checkout.
- `booking_unit_items` records the billed lines per booking. Databases without
  the table are skipped rather than failing checkout.
- OCTo reservations now pass real unit types through instead of collapsing them;
  an unrecognized type falls back to `ADULT` so an unknown unit never blocks a
  booking.

**Still deliberately not modelled**: infant-on-lap, where a unit bills but
consumes no capacity. Every unit occupies a seat today. Adding it means a
per-unit-type `occupies_seat` flag and a capacity path that counts seats rather
than travelers.

## UI — Delivered

The backend work above is reachable from the product, not just the API.

**Supplier extranet** — the *Seats and schedule* editor is now tabbed:
- *Seats & schedule* also carries party-size bounds and prices for senior, youth
  and infant travelers.
- *Seasonal rates* adds, lists and removes date-ranged rates.
- *Calendar* closes or resizes one date, or one departure on a date.

Rates and calendar stay locked until the option has a saved schedule, since both
adjust a base the option does not otherwise have. Saving a schedule reloads the
options so the tabs unlock immediately.

**Traveler** — the live departure picker shows the per-adult price for each
departure, the seasonal rate's name when one applies, the minimum party size when
above one, and the supplier's reason on a closed departure. It also moves the
traveler to the first bookable departure when the product's default start time
has been closed for that date, instead of landing them on an error.

Covered end to end by `e2e/z-supplier-rates-calendar.spec.js`.

### Known inconsistency, not yet addressed

Two older surfaces on the activity page still price from the product's static
`price_inr` and do not know about seasonal rates, so they can disagree with the
departure picker on the same screen:

- the **"From ₹…" headline** in the booking sidebar, and
- the **"Seasonal & Demand Price Calendar"** widget, which renders its own
  weekend/peak pricing unrelated to `native_price_schedules`.

Reconciling them means teaching both to read native availability. Worth doing
before this goes in front of real travelers.

---

## P2 — Shared resource capacity (next)

One vehicle or guide serving two options can currently be sold twice: capacity
pools are per-option with no shared constraint. Bókun models this as *resources*.
Needs a `native_resources` table plus a resource join on capacity checks.

## P3 — Extranet depth

- Bulk calendar editing across a date range in one request.
- Promotional/last-minute rates with their own validity windows.
- Per-departure supplier notes surfaced to ops.

---

## Explicitly not in scope

Unchanged from [`docs/PROJECT_GOALS.md`](PROJECT_GOALS.md): no airline GDS, no
standalone hotel brokerage, no foreign-currency payouts, no self-drive rentals.
