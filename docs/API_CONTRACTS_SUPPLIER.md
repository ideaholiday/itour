# API Contracts: Supplier Extranet

> **Summary:** Endpoints the supplier workspace (`supply.ideaholiday.in`) calls under `/api/suppliers/:id`, including direct (walk-in, phone, manual) bookings.
> **Read when:** adding or changing a supplier endpoint. Conventions (errors, auth, pagination) are in [`API_CONTRACTS.md`](API_CONTRACTS.md).

## 3. Supplier Endpoints (Requires `SUPPLIER` linked to vendor ID)

### 3.1 Supplier Extranet Inventory Management
- **`GET /api/suppliers/:supplierId/products/:productId/inventory`**:
  - Retrieves owned options, operating days, departure slots, seat quotas, and blackout dates.
- **`PUT /api/suppliers/:supplierId/products/:productId/inventory/:optionId`**:
  - Validates and saves inventory rules. Rejects capacity reductions below currently occupied seats.
  - **Request Body**:
    ```json
    {
      "operatingDays": [0, 1, 2, 3, 4, 5, 6],
      "departureTimes": ["09:00", "14:00"],
      "capacity": 20,
      "adultPrice": 1200,
      "childPrice": 600,
      "cutoffMinutes": 120,
      "cancellationHours": 24,
      "blackoutDates": ["2026-12-25"],
      "minPartySize": 1,
      "maxPartySize": 0,
      "unitPrices": { "SENIOR": 700, "INFANT": 0 },
      "seatlessUnits": ["INFANT"]
    }
    ```
  - `seatlessUnits` lists types that bill but consume no seat (an infant on a
    lap). They are excluded from the `adults`/`children` seat counts but still
    priced and still recorded in `booking_unit_items`. `ADULT` cannot be
    seatless. Omit-to-keep like the fields below.
  - `unitPrices` prices extended traveler types. `ADULT` and `CHILD` always come
    from `adultPrice`/`childPrice`; a type left out is not sold, and reserving it
    returns `UNIT_TYPE_NOT_SOLD`.
  - `minPartySize`, `maxPartySize` and `unitPrices` are **omit-to-keep**: leaving a
    field out preserves the stored value, so a client that predates these fields
    cannot silently reset them. Send an explicit value (`{}` for `unitPrices`) to
    clear one. A `maxPartySize` below `minPartySize` returns `INVALID_PARTY_SIZE`.
  - `minPartySize` defaults to 1 and `maxPartySize` to `0` (no cap). A hold below
    the minimum returns `BELOW_MIN_PARTY_SIZE`; above the maximum returns
    `ABOVE_MAX_PARTY_SIZE`.

### 3.1.1 Seasonal Rates
- **`GET /api/suppliers/:supplierId/products/:productId/inventory/:optionId/rates`**:
  - Lists date-ranged rate schedules, highest priority first.
- **`POST .../inventory/:optionId/rates`**: Creates one schedule.
  - **Request Body**:
    ```json
    {
      "label": "Christmas week",
      "startsOn": "2099-12-20",
      "endsOn": "2099-12-26",
      "weekdays": [5, 6],
      "adultPrice": 4000,
      "childPrice": 1800,
      "priority": 10
    }
    ```
  - The highest-`priority` schedule covering the travel date and its weekday
    wins; otherwise the option's base price applies. A hold freezes the resolved
    price, so repricing mid-checkout cannot change a traveler's total.
- **`DELETE .../inventory/:optionId/rates/:rateId`**: Removes a schedule.

### 3.1.2 Calendar Overrides
- **`GET .../inventory/:optionId/calendar?from=&to=`**: Lists overrides in range.
- **`PUT .../inventory/:optionId/calendar`**: Closes or resizes a date or a single departure.
  - **Request Body**:
    ```json
    {
      "localDate": "2099-12-25",
      "localTime": "09:00",
      "capacity": 4,
      "closed": false,
      "note": "Reduced boat capacity"
    }
    ```
  - Omit `localTime` to apply to the whole day. `capacity: null` inherits the rule
    capacity. Reducing capacity below seats already held or confirmed returns
    `CAPACITY_BELOW_RESERVED`.
- **`DELETE .../inventory/:optionId/calendar?localDate=&localTime=`**: Removes an
  override, restoring the weekly rule.
- **`PUT .../inventory/:optionId/calendar/range`**: Applies one override across a
  date range in a **single transaction**.
  - **Request Body**:
    ```json
    {
      "from": "2099-07-01",
      "to": "2099-07-31",
      "weekdays": [1, 2],
      "localTime": "09:00",
      "capacity": null,
      "closed": true,
      "note": "Monsoon closure"
    }
    ```
  - `weekdays` is optional and narrows the range ("every Monday in July");
    omitted means every day. `localTime` omitted or `""` means the whole day.
  - Dates the option does not operate on are **skipped**, and reported in
    `skippedNonOperating`. The response returns `applied` and `appliedCount`.
  - **All-or-nothing**: if any date in the range already has more seats reserved
    than the new capacity, nothing is written and `CAPACITY_BELOW_RESERVED` is
    returned. A range longer than 366 days returns `RANGE_TOO_LONG`.
- **`DELETE .../inventory/:optionId/calendar/range?from=&to=&localTime=`**: Clears
  every override in the range, reopening those dates onto the weekly rules.
  Returns `removedCount`.

### 3.1.2b Promotions
- **`GET .../inventory/:optionId/promotions`**: Lists promotions with live `redeemed` counts.
- **`POST .../inventory/:optionId/promotions`**: Creates one.
  - **Request Body**:
    ```json
    {
      "label": "Monsoon flash sale",
      "code": "MONSOON20",
      "discountType": "PERCENT",
      "discountValue": 20,
      "maxLeadHours": 48,
      "minLeadHours": null,
      "travelFrom": "2099-06-01",
      "travelUntil": "2099-09-30",
      "minPartySize": null,
      "maxRedemptions": 100,
      "priority": 10,
      "active": true
    }
    ```
  - `code` omitted or `null` makes the promotion **public** — shown to everyone in
    availability and in the price calendar. With a code it applies only when the
    traveler supplies one, and never leaks into public responses.
  - `maxLeadHours` is last-minute ("within 48h of departure"); `minLeadHours` is
    early-bird ("booked 30 days ahead"). Both are optional.
  - `PERCENT` values above 100 return `VALIDATION_ERROR`. A duplicate code on the
    same option returns `PROMO_CODE_EXISTS`. `maxRedemptions: 0` means unlimited;
    redemptions are counted live from reservations, so the count cannot drift.
  - **At most one promotion applies** — highest priority, then deepest discount.
- **`DELETE .../inventory/:optionId/promotions/:promotionId`**: Removes it. Holds
  already taken keep their frozen discounted price.

### 3.1.3 Shared Resources
- **`GET /api/suppliers/:supplierId/resources`**: Lists shared vehicles/guides (`kind`, `user_id`) and the options each constrains, plus `staff: [{ id, name, role }]` for linking a guide to a login.
- **`POST /api/suppliers/:supplierId/resources`**: Creates one.
  - **Request Body**: `{ "name": "Tempo Traveller GA-07", "capacity": 6, "optionIds": ["opt_a", "opt_b"], "kind"?: "GUIDE|VEHICLE|EQUIPMENT|GENERAL", "userId"?: "<staff user id>" }`. A `userId` that isn't this supplier's staff is `404 STAFF_MEMBER_NOT_FOUND`.
- **`PUT .../resources/:resourceId`**: Replaces name, capacity and the linked options; `kind` and `userId` are kept when omitted (`userId: null` unlinks).
- **`DELETE .../resources/:resourceId`**: Removes it and its departure assignments, releasing the shared cap.
- A departure's vacancies are the smallest of its own pool and every linked
  resource, counted per departure time. Shrinking below seats already committed
  returns `CAPACITY_BELOW_RESERVED`; linking an option owned by another supplier
  returns `OPTION_NOT_FOUND`.

### 3.1.4 Review Share Links

- **`GET /api/reviews/share-links`**: The supplier's links, each with its funnel (`view_count`, `claim_count`, `invites_issued`, `reviews_submitted`), plus an aggregate `stats` block (`issued`, `opened`, `submitted`, `conversionPct`).
- **`POST /api/reviews/share-links`**: `{ productId?, label? }` → a new link. Omitting `productId` accepts a booking for any of the supplier's listings; supplying one restricts claims to that listing. A listing belonging to another supplier is rejected with `403`.
- **`PATCH /api/reviews/share-links/:id`**: `{ isActive }` deactivates or reactivates a link. A deactivated slug returns `410` to travelers. Another supplier's link is `403`.

### 3.1.5 Check-in, guest lists and departure cancellation

The supplier, `ADMIN` or `STAFF`. Rules: [`SUPPLIER_OPERATIONS.md`](SUPPLIER_OPERATIONS.md). A departure is one product on one `date`, optionally at one `time` (`HH:MM`, matched against `bookings.pickup_time`).

- **`POST /api/suppliers/:id/check-in`** `{ code, allowOtherDate? }`: `code` is the voucher QR link (`…/booking-confirmed/<ref>`) or the booking reference. Returns `{ alreadyCheckedIn, booking: { id, ref, travelerName, adults, children, productTitle, activityDate, pickupTime, attendanceStatus, checkedInAt } }`; a repeat scan returns `alreadyCheckedIn: true` with the first time. Errors: `400 INVALID_CODE`, `404 BOOKING_NOT_FOUND` (including another supplier's booking), `409 WRONG_DATE` (not today in India; retry with `allowOtherDate: true`), `409 BOOKING_CANCELLED`, `409 BOOKING_NOT_PAID`.
- **`PATCH /api/suppliers/:id/bookings/:bookingId/attendance`** `{ status: "CHECKED_IN" | "NO_SHOW" | "NONE" }`: `NONE` clears a mistake. Returns `{ booking }`. `409 TOO_EARLY` for a no-show before the trip date.
- **`GET /api/suppliers/:id/manifest?productId=&date=&time=&format=csv`**: the guest list. JSON `{ manifest: { product, date, time, departureTimes, totals: { bookings, guests, checkedIn, noShow, cancelledBookings }, bookings: [{ id, ref, travelerName, travelerPhone, adults, children, pickupTime, pickupLocation, specialRequests, variantName, status, attendanceStatus, checkedInAt }] } }`, or a CSV download with `format=csv`. Unpaid and cancelled bookings are left out. `404 PRODUCT_NOT_FOUND` for another supplier's product.
- **`POST /api/suppliers/:id/products/:productId/departures/cancel`** `{ date, time?, reason, notes?, dryRun? }`: cancels every booking on the departure and closes it on the seat calendar, all or nothing. Returns `{ bookings, guests, paidBookings, walletRefundInr, closesOptions, dryRun, cancelled: [{ id, ref, walletCreditInr }] }`; with `dryRun: true` nothing changes and `cancelled` is empty. Each traveler is notified as for a single supplier cancellation. Errors: `409 DEPARTURE_IN_PAST`, `409 DEPARTURE_STARTED` (a booking is in progress or completed; the message lists the references), `409 NOTHING_TO_CANCEL`, `404 PRODUCT_NOT_FOUND`.

### 3.2 Driver Assignment & Roster Dispatch
- **`GET /api/suppliers/:id/drivers/availability?bookingId=`**: Every fleet driver with `available` and, when not available, a `reason` (status, vehicle category, seats, missing email, or a clashing booking ref).
- **`POST /api/suppliers/:id/assign-driver`**: Assigns a fleet driver (`supplierDriverId`) or an outside driver. The driver receives a trip request and must accept from the private link, unless `confirmedByPhone` is set.
  ```json
  {
    "bookingId": "bk_123",
    "supplierDriverId": "drv_sup_1",
    "confirmedByPhone": true,
    "note": "Called Ravi at 18:05, he accepted"
  }
  ```
  Outside driver instead of `supplierDriverId`: `driverName`, `driverPhone`, `driverEmail`, `seatCapacity`, `vehicleModel`, `vehicleNumber`. `note` (3+ characters) is required with `confirmedByPhone`.
- **`GET /api/suppliers/:id/bookings/:bookingId/dispatch-timeline`**: The booking's driver and trip events (`event_type`, `new_status`, `actor_id`, `note`, `details`, `created_at`), plus the trip city's `timeZone` and `timeLabel` (`IST`, `ICT`). `404` for another supplier's booking.
- **`POST /api/suppliers/:id/bookings/:bookingId/confirm-driver`** `{ "note": "Called Ravi at 18:05" }`: Records a pending driver's acceptance taken by phone. Allowed after the response deadline while the assignment is still pending; `409` once the driver was removed or the schedule changed. Idempotent for an already accepted driver. Queues the driver-confirmed notifications, closes the assignment task, and writes an `ACCEPT_BY_PHONE` audit event with the note.
- **`GET /api/suppliers/:id/dispatch`**: Effective dispatch settings (`automatic_enabled`, `lead_hours`, `response_minutes`, `max_attempts`, `buffer_minutes`, and `source` of `DEFAULT` or `SUPPLIER`), fleet `readiness` (`total`, `ready`, and each driver's `missing` fields), open "assign manually" tasks (most urgent pickup first, with `pickup_at`, `minutes_to_pickup`, the trip city's `time_zone` and `time_label`, `priority`, `driver_state` of `NO_DRIVER` or `AWAITING_DRIVER`), and recent notification jobs.

### 3.3 Verify Pickup OTP & Commence Journey
- **Endpoint**: `POST /api/bookings/:id/verify-pickup-otp`
- **Request Body**:
  ```json
  {
    "otp": "849201"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "status": "in_progress",
    "message": "Pickup verified successfully. Trip commenced."
  }
  ```
- **Error (400 / 423)**: Returns remaining attempts or `OTP_LOCKED` error if failed 5 times.

---


### 3.4 Direct bookings: walk-in, phone, manual (ADR 034)
Front desk staff may call every endpoint in this section (ADR 036). An agent booking (ADR 039) sends `source: "AGENT"` and `agent_id`, and no `discount_inr` (`400 AGENT_DISCOUNT`); the quote then also returns `agentCommissionPct`, `agentCommissionInr`, `agentOwedInr`, `agentAvailableCreditInr`, and `amountDueInr` is the agent's net. Errors: `400 AGENT_REQUIRED`, `404 AGENT_NOT_FOUND`, `409 AGENT_INACTIVE`, `409 AGENT_CREDIT_LIMIT`.
The supplier's own customers. Seats come from the same native inventory as marketplace and OCTo bookings (`reserveNativeInventory`), the price from `calculateBookingQuote`; the browser never sends a total. Commission is 0, no `payouts` row is written, and `payment_status` is `OFFLINE` so no IdeaHoliday refund path touches it. Counter sales ignore the online `cutoff_minutes` and close when the departure starts. All routes need `requireSupplierAccess`; errors are `400 VALIDATION_ERROR`, `404 PRODUCT_NOT_FOUND`, `409 INVENTORY_UNAVAILABLE`.
- **`GET /api/suppliers/:id/availability?date=YYYY-MM-DD`**: `{ products: [{ productId, optionId, title, optionName, departures: [slot] }] }` for every active seat-inventory option; `slot` is the native slot view (`localTime`, `capacity`, `vacancies`, `status`), computed as a counter sale.
- **`POST /api/suppliers/:id/bookings/quote`**: body `{ product_id, product_option_id?, activity_date, pickup_time?, adults, children?, unit_items?, discount_inr? }` → `{ quote: { baseAmount, taxAmount, totalAmount, discountInr, amountDueInr, vacancies } }`. Takes no seats.
- **`POST /api/suppliers/:id/bookings`**: body `{ source: WALK_IN|PHONE|MANUAL, product_id, product_option_id?, activity_date, pickup_time (required for seat inventory), adults, children?, unit_items?, traveler_name, traveler_phone, traveler_email?, pickup_location?, special_requests?, discount_inr?, payments?: [{ mode: CASH|UPI|CARD|BANK, amount_inr, reference?, note? }], client_request_id? }`. Unknown fields are refused. `discount_inr` cannot exceed the total; payments cannot exceed the amount due. Returns `201 { booking, payments, documents: { voucherUrl, invoiceUrl } }` with `status = confirmed`; a repeated `client_request_id` returns `200` and the same booking.
- **`GET /api/suppliers/:id/bookings/:bookingId/payments`**: `{ amountInr, balanceDueInr, payments, documents }`.
- **`POST /api/suppliers/:id/bookings/:bookingId/payments`**: body `{ mode, amount_inr, reference?, note? }` records money collected later; refused over the balance (`400 OVERPAYMENT`) or for a booking IdeaHoliday collected (`409 NOT_SUPPLIER_DIRECT`).
- For an `OFFLINE` booking, `/api/bookings/:ref/documents/invoice` renders the operator's payment summary, not an IdeaHoliday invoice. Travelers cannot self-cancel, reschedule or amend it (`SUPPLIER_DIRECT_BOOKING`).

### 3.5 Staff logins (ADR 036)
A signed-in supplier user is the owner or a staff member. `GET /api/suppliers/:id` returns `access: { role: OWNER|MANAGER|FRONT_DESK|GUIDE }` (admins and operations count as `OWNER`), and `POST /api/auth/login` returns `user.supplier_role`. Staff are refused what their role doesn't allow with `403 SUPPLIER_ROLE_FORBIDDEN`. The staff endpoints below are owner only:
- **`GET /api/suppliers/:id/staff`**: `{ members: [{ id, name, email, phone, role, createdAt }] }`.
- **`POST /api/suppliers/:id/staff`**: body `{ name, email, phone?, role: MANAGER|FRONT_DESK|GUIDE }` → `201 { member, temporaryPassword, linkedExistingAccount }`. A new person gets a temporary password (returned once, `Cache-Control: no-store`); an existing traveler account is linked, keeps its password and `temporaryPassword` is `null`. An email that already has a supplier or IdeaHoliday team account is `409 ACCOUNT_IN_USE`.
- **`PATCH /api/suppliers/:id/staff/:userId`**: body `{ name?, phone?, role? }` → `{ member }`. It applies to open sessions immediately.
- **`POST /api/suppliers/:id/staff/:userId/reset-password`**: `{ member, temporaryPassword }`; the old password stops working.
- **`DELETE /api/suppliers/:id/staff/:userId`**: `{ id, removed: true }`; the account becomes a `TRAVELER`.

### 3.6 Departures board and crew (ADR 037)
Rules: [`SUPPLIER_OPERATIONS.md`](SUPPLIER_OPERATIONS.md). Every staff role may read the board; assigning is owner or manager.
- **`GET /api/suppliers/:id/departures?from=YYYY-MM-DD&days=1..14`**: `{ from, to, days, departures: [{ key, productId, title, date, time, options: [{ optionId, optionName, capacity, vacancies, status }], capacity, freeSeats, bookings, guests, checkedIn, noShow, balanceDueInr, assignments: [{ id, resourceId, name, kind }] }] }`. Unpaid and cancelled bookings are left out. A guide linked to a guide resource gets only their assigned departures and `balanceDueInr: null`.
- **`POST /api/suppliers/:id/departures/assignments`** `{ productId, date, time?, resourceId }` → `201 { assignment }`. Errors: `404 PRODUCT_NOT_FOUND`, `404 RESOURCE_NOT_FOUND`, `409 ALREADY_ASSIGNED`, `409 RESOURCE_BUSY` (on another departure at that date and time).
- **`DELETE /api/suppliers/:id/departures/assignments/:assignmentId`** → `{ id, removed: true }`; `404 ASSIGNMENT_NOT_FOUND`.
- Check-in, attendance and the manifest (§3.1.5) refuse or leave out bookings on departures a linked guide isn't assigned to (`403 NOT_YOUR_DEPARTURE`).
- **`GET /api/suppliers/:id/booking-calendar?month=YYYY-MM`**: `{ month, days: [{ date, bookings, guests, departures }] }`, days with live bookings only. Owner, manager and front desk.

### 3.7 Supplier reschedule (ADR 037)
Rules: [`SUPPLIER_OPERATIONS.md`](SUPPLIER_OPERATIONS.md). Owner or manager.
- **`POST /api/suppliers/:id/bookings/:bookingId/reschedule`** `{ date, time?, reason }` → `{ bookingId, ref, from: { date, time }, to: { date, time }, travelerMayDecline }`. The price is unchanged. When `travelerMayDecline` the traveler is sent `SUPPLIER_RESCHEDULED`. Errors: `404 BOOKING_NOT_FOUND`, `409 INVALID_STATUS`, `409 ALREADY_ATTENDED`, `409 CIRCUIT_BOOKING`, `409 DRIVER_ASSIGNED`, `409 DEPARTURE_STARTED`, `409 SAME_DEPARTURE`, `409 DEPARTURE_IN_PAST`, `409 INVENTORY_UNAVAILABLE`.

### 3.8 Dashboard numbers (ADR 038)
Owner and manager. Real values or `null` ("Not enough data"); no placeholders. Earnings are `supplier_payout_amount` on the trip date for bookings that are not cancelled or unpaid (`payment_status` `PAID` or `OFFLINE`): the net payout for marketplace and partner bookings, the full amount for direct ones. "Today" is the supplier's own country date.
- **`GET /api/suppliers/:id/dashboard-stats`**: `{ as_of, today: { bookings, trips_in_progress, trips_completed, trips_upcoming, earnings_inr }, week: { from, bookings, earnings_inr, trend: [7 daily earnings] }, month: { from, bookings, earnings_inr, marketplace_inr, direct_inr, direct_collected_inr, direct_due_inr, growth_pct }, ratings: { avg, total_reviews, completion_rate, cancellation_rate, sample_bookings }, unread_notifications_count, alerts: [{ type, booking_id, booking_ref, deadline }] }`. `growth_pct` compares the 1st to today with the same days last month; `null` when last month earned nothing. Completion and cancellation are over past trips in the last 90 days; `null` below 5.
- **`GET /api/suppliers/:id/analytics/overview`**: `{ as_of, revenueTrend: [{ key: YYYY-MM, month, revenue_inr, bookings }] (6 months), topProducts: [{ id, title, booking_count, total_earnings }], operationalMetrics: { days: 90, minSample: 5, medianResponseMins, responseSample, onTimeResponsePct, onTimeSample, noShowPct, noShowSample, otpVerifiedPct, otpSample } }`. Response metrics cover marketplace requests with a response deadline (an unanswered request past its deadline counts as late); no-shows are guests marked no-show out of guests with attendance; OTP is completed trips that had a pickup OTP. Each is `null` below 5 bookings.

### 3.9 Agents (ADR 039)
Rules: [`SUPPLIER_OPERATIONS.md`](SUPPLIER_OPERATIONS.md). Owner or manager, except `GET .../agents`, which front desk may call to pick an agent.
- **`GET /api/suppliers/:id/agents`**: `{ agents: [{ id, name, contactName, phone, email, commissionPct, creditLimitInr, status, owedInr, availableCreditInr, rates: [{ productId, commissionPct }] }] }`.
- **`POST /api/suppliers/:id/agents`** / **`PUT .../agents/:agentId`**: `{ name, contactName?, phone?, email?, commissionPct (0–90), creditLimitInr, status? }` → `{ agent }`.
- **`PUT .../agents/:agentId/rates`**: `{ rates: [{ productId, commissionPct }] }` replaces the agent's per-listing commissions → `{ agent }`.
- **`GET .../agents/:agentId/statement?from=&to=`**: by trip date → `{ agent, bookings: [{ id, ref, date, time, status, productTitle, travelerName, guests, grossInr, commissionInr, netInr, paidInr, dueInr }], payments, totals: { bookings, grossInr, commissionInr, netInr, paidInr, dueInr } }`; totals leave out cancelled bookings.
- **`POST .../agents/:agentId/payments`**: `{ mode: CASH|UPI|CARD|BANK, amount_inr, reference?, note? }` → `201 { agent, applied: [{ bookingId, ref, amountInr }] }`, oldest trip first. `400 OVERPAYMENT` above what the agent owes.

### 3.10 Hotel rate sheet and package quotations (ADR 040)
Rules: [`SUPPLIER_OPERATIONS.md`](SUPPLIER_OPERATIONS.md). Owner or manager.
- **`GET /api/suppliers/:id/hotels`**, **`POST .../hotels`** `{ name, city?, starRating?, notes?, status? }`, **`PUT .../hotels/:hotelId`** → `{ hotel: { id, name, city, starRating, notes, status, rates: [{ id, roomType, mealPlan, validFrom, validTo, netPerNightInr, extraAdultInr, childInr }] } }`.
- **`POST .../hotels/:hotelId/rates`** `{ roomType, mealPlan: EP|CP|MAP|AP, validFrom, validTo, netPerNightInr, extraAdultInr?, childInr? }` → `201 { hotel }`; `409 RATE_OVERLAP`. **`DELETE .../hotels/:hotelId/rates/:rateId`** → `{ hotel }`.
- **`GET /api/suppliers/:id/quotations`** → `{ quotations: [{ id, ref, title, customerName, startDate, status, totalInr, updatedAt }] }`.
- **`POST .../quotations`** / **`PUT .../quotations/:quotationId`** `{ title, customerName, customerEmail?, customerPhone?, agentId?, startDate, adults, children, markupPct, notes?, validUntil?, lines: [HOTEL { dayNumber, title, description?, hotelId, roomType, mealPlan, checkIn, nights, rooms, extraAdults, children } | LISTING { dayNumber, title, description?, productId, productOptionId?, date, pickupTime?, adults, children } | CUSTOM { dayNumber, title, description?, date?, amountInr }] }` → `{ quotation: { id, ref, title, status, customer…, lines: [… priceInr, bookingId], totals: { costInr, listingsInr, markupInr, subtotalInr, gstPct, gstInr, totalInr, paidInr, dueInr }, payments } }`. Every line is priced on the server; a client price is never read. Errors: `404 HOTEL_NOT_FOUND`, `404 PRODUCT_NOT_FOUND`, `404 AGENT_NOT_FOUND`, `409 RATE_MISSING`, `409 LISTING_UNAVAILABLE`, `409 QUOTATION_FINAL` (accepted or declined).
- **`GET .../quotations/:quotationId`** → `{ quotation }`. **`GET .../quotations/:quotationId/pdf`** → the customer's PDF.
- **`POST .../quotations/:quotationId/send`** `{ email?: false }` → `{ shareUrl, whatsappText, email: { status, error }, quotation }`. Emails the PDF when the quotation has a customer email; a draft becomes `SENT`.
- **`POST .../quotations/:quotationId/status`** `{ status: SENT|ACCEPTED|DECLINED }` → `{ quotation }`; `409 INVALID_TRANSITION` (only draft → sent → accepted or declined).
- **`POST .../quotations/:quotationId/lines/:lineId/book`** → `201 { booking, quotation }`: books an accepted quotation's listing line as a `MANUAL` direct booking with `quotation_id`. Errors: `409 NOT_ACCEPTED`, `409 NOT_A_LISTING`, `409 ALREADY_BOOKED`, `409 PHONE_REQUIRED`, and the direct-booking seat errors.
- **`POST .../quotations/:quotationId/payments`** `{ mode, amount_inr, reference? }` → `201 { quotation }`; `409 NOT_ACCEPTED`, `400 OVERPAYMENT`.
- **Public**: **`GET /api/quotations/share/:token`** returns the PDF for a signed, 60-day token, no sign-in; `404` when forged or expired. Rate-limited per client (`scope: "quotation-share"`).

### 3.11 Sales channels and reseller keys (ADR 041)
Rules: [`SUPPLIER_OPERATIONS.md`](SUPPLIER_OPERATIONS.md).
- **`PATCH /api/suppliers/:id/products/:productId/channels`** `{ marketplace?, ideaholidayApi?, ownResellers? }` (booleans; omitted ones stay) → `{ productId, channels: { marketplace, ideaholidayApi, ownResellers } }`. Owner or manager. The listing's `sell_*` columns come back on `GET /api/suppliers/:id` products.
- **`GET /api/suppliers/:id/api-keys`** → `{ resellers: [{ id, name, keyPrefix, status, agentId, agentName, lastUsedAt, createdAt }] }`. Owner only; IdeaHoliday-issued keys are not listed.
- **`POST .../api-keys`** `{ name, agentId? }` → `201 { key, reseller }`; the key is returned once (`Cache-Control: no-store`). `404 AGENT_NOT_FOUND`. Owner only.
- **`DELETE .../api-keys/:partnerId`** → `{ id, status: "REVOKED" }`; `404 KEY_NOT_FOUND`. Owner only.
