# API Contracts: Idea Holiday

> **Summary:** Every HTTP endpoint: path, auth role, request and response shape.
> **Read when:** adding or changing an endpoint, or calling one from the frontend. Large: `grep -n '^##' docs/API_CONTRACTS.md` and read one section.

## Overview & Standards
All API endpoints follow RESTful design principles and are served under the `/api` prefix.
- **Request Format**: JSON (`Content-Type: application/json`).
- **Response Format**: JSON with consistent top-level keys (`success: true/false`, payload or `error`, `code`, `requestId`).
- **Validation**: Strict schema boundary validation via Zod; invalid requests return HTTP 400 with machine-readable error codes.
- **Authentication**: `Authorization: Bearer <token>` where token is either an Idea Holiday JWT or a verified Supabase access token.
- **Tracing**: Every response includes an `X-Request-Id` header for end-to-end tracing in logs.

---

## 1. Public Endpoints (No Authentication Required)

### 1.1 Spatial Transfer Search
- **Endpoint**: `POST /api/transfers/search` (or `GET /api/transfers/search`)
- **Purpose**: Find compatible vehicle categories and estimated fares between pickup and drop coordinates.
- **Request Body**:
  ```json
  {
    "pickupLat": 15.3803,
    "pickupLng": 73.8350,
    "dropLat": 15.5186,
    "dropLng": 73.7626,
    "passengers": 3,
    "luggage": 2,
    "date": "2026-09-15",
    "pickupTime": "10:30 AM"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "results": [
      {
        "vehicleCategory": "SEDAN",
        "displayName": "Comfort Sedan (Dzire / Etios)",
        "distanceKm": 38.5,
        "estimatedMinutes": 55,
        "pricing": {
          "baseFare": 1200,
          "distanceFare": 577.5,
          "tollAllowance": 120,
          "statePermit": 0,
          "subtotal": 1897.5,
          "gst": 94.88,
          "totalPrice": 1992
        },
        "supplierId": "sup_goa_fleet"
      }
    ]
  }
  ```

### 1.2 Product Details, Pickup Suggestions & Live Availability
- **`GET /api/activities/:id`**: Returns published tour/transfer listing with 5-product-type models (`product_type`, `product_sub_type`, ticket tiers, vehicle options, SIC hubs, hotel tiers, itinerary items) and location rules.
- **`GET /api/activities/:id/pickup-suggestions?q=Airport`**: Returns product-scoped anchor points matching `canonical_locations`.
- **`POST /api/activities/:id/validate-pickup`**: Validates whether coordinates or address fall within the tour's pickup bounds. An invalid point returns `valid: false` with `code` `INVALID_PICKUP_POINT` or `INVALID_DROP_POINT` and `detail.allowed_area`, `detail.allowed_state`, `detail.suggestion` (`locationValidationService.js`).
- **`GET /api/availability/native/:productId?date=YYYY-MM-DD&optionId=...`**:
  - Uncached live departure availability for a product and option.
  - **Response (200 OK)**:
    ```json
    {
      "slots": [
        {
          "id": "opt_7f3a:2026-09-20:09:00",
          "productId": "prd_4c19",
          "optionId": "opt_7f3a",
          "localDate": "2026-09-20",
          "localTime": "09:00",
          "localDateTimeStart": "2026-09-20T09:00:00+05:30",
          "utcCutoffAt": "2026-09-20T01:30:00.000Z",
          "timeZone": "Asia/Kolkata",
          "capacity": 20,
          "vacancies": 14,
          "available": true,
          "status": "AVAILABLE",
          "adultPrice": 1200,
          "childPrice": 600,
          "unitPrices": { "ADULT": 1200, "CHILD": 600 },
          "listAdultPrice": 1200,
          "listUnitPrices": { "ADULT": 1200, "CHILD": 600 },
          "promotion": null,
          "priceScheduleId": null,
          "priceScheduleLabel": null,
          "minPartySize": 1,
          "maxPartySize": 0,
          "seatlessUnits": [],
          "sharedResource": null,
          "supplierNote": null,
          "cancellationHours": 24
        }
      ]
    }
    ```
  - `status` is one of `AVAILABLE`, `SOLD_OUT`, `CUTOFF` (past the booking
    deadline) or `CLOSED` (non-operating day, blackout date, or a supplier
    calendar override).
  - `adultPrice`/`childPrice` are the rate resolved for that travel date. When a
    seasonal schedule applied, `priceScheduleId` and `priceScheduleLabel` name it;
    both are `null` when the option's base rate applied.
  - `supplierNote` carries the supplier's reason when a calendar override closed
    or resized the departure.
  - `sharedResource` names the vehicle or guide capping this departure below its
    own pool, or `null` when nothing is shared.
  - `listAdultPrice`/`listUnitPrices` are the price **before** any promotion;
    `adultPrice`/`unitPrices` are what the traveler pays. `promotion` describes
    the one that applied, or `null`.
  - Add `?promoCode=CODE` to see a coded promotion's price. Holding with a code
    that does not apply returns `PROMO_NOT_APPLICABLE` rather than silently
    charging full price.

- **`GET /api/products/:id/price-calendar?month=YYYY-MM`**:
  - One month of per-day prices for the traveler price calendar.
  - When the product has native seat inventory, days resolve through the same
    seasonal rates and calendar overrides the departure picker uses, and the
    response carries `pricingSource: "NATIVE_INVENTORY"`. Each day reports
    `priceInr`, `tier` (`PEAK`/`SAVER`/`STANDARD`) and `available`; a date the
    supplier closed returns `available: false`.
  - Products without seat inventory keep demand-rule pricing over `price_inr`
    and omit `pricingSource`.

### 1.3 Review Collection Links

Unauthenticated by design: a single-use token, or a claimed share link, is the
traveler's proof that the booking is theirs. Both routes produce an ordinary
verified review — see BUSINESS_RULES §9.3.

- **`GET /api/reviews/invite/:token`**: What the review form should show — booking reference, listing, operator, activity date, and whether a driver rating is expected. `404` unknown, `409` already used or already reviewed, `410` expired.
- **`POST /api/reviews/invite/:token`**: Submits the review and spends the token. Body matches `POST /api/reviews`, minus the booking fields (the token carries them).
- **`GET /api/reviews/share/:slug`**: Public view of a supplier's share link — operator name, and the listing when the link is scoped to one. Reveals nothing about any booking.
- **`POST /api/reviews/share/:slug/claim`**: `{ bookingRef, phoneLast4 }` → `{ token, booking }`. Every mismatch returns the same `404` message. Rate-limited per IP (10 per 15 minutes).

---

## 2. Traveler Endpoints (Requires `TRAVELER`, `ADMIN`, or `STAFF`)

### 2.1 Native Reservation Hold Creation
- **Endpoint**: `POST /api/availability/native/hold`
- **Purpose**: Creates a 10-minute temporary seat reservation hold (`native_reservations`) bound to the authenticated user to prevent double-booking.
- **Request Body**:
  ```json
  {
    "productId": "prd_taj_tour",
    "optionId": "opt_morning_tour",
    "localDate": "2026-09-20",
    "localTime": "09:00",
    "adults": 2,
    "children": 1,
    "unitItems": [
      { "unitType": "SENIOR", "quantity": 2 },
      { "unitType": "INFANT", "quantity": 1 }
    ],
    "requestKey": "req_8192a0d912"
  }
  ```
- `unitItems` is optional. When present it is **authoritative** for the seat
  counts and billing: `ADULT`/`SENIOR`/`YOUTH` roll up into `adults`,
  `CHILD`/`INFANT` into `children`, and every unit occupies one seat. When
  omitted, `adults`/`children` are used as before (`ADULT` and `CHILD` lines).
- The hold freezes both the breakdown and its total, so a supplier repricing
  mid-checkout cannot change the traveler's total. Reserving a unit type the
  supplier has not priced returns `UNIT_TYPE_NOT_SOLD`.
- **Response (201 Created)**:
  ```json
  {
    "holdId": "res_8192a0d912",
    "expiresAt": "2026-09-08T13:10:00.000Z",
    "status": "ON_HOLD"
  }
  ```

### 2.2 Create Booking Checkout Order
- **Endpoint**: `POST /api/checkout/create-order`
- **Request Body**:
  ```json
  {
    "hold_id": "res_8192a0d912",
    "product_id": "prd_taj_tour",
    "activity_date": "2026-09-20",
    "pickup_time": "09:00",
    "traveler_name": "Rohan Gupta",
    "traveler_email": "rohan@example.com",
    "traveler_phone": "+919876543210",
    "pickup_location": "Hotel Taj View, Agra",
    "payment_gateway": "CASHFREE"
  }
  ```
- **Response (200 OK)**: Returns payment session credentials (`payment_session_id` for Cashfree or `order_id` for Razorpay) with canonical price frozen on the server.

### 2.3 Verify Payment & Confirm Booking
- **Endpoint**: `POST /api/checkout/verify` (Razorpay) or `POST /api/checkout/cashfree/verify` (Cashfree)
- **Request Body**: Contains payment IDs and gateway HMAC signature.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "bookingRef": "IH-7192AB",
    "status": "confirmed",
    "voucherUrl": "https://ideaholiday.in/voucher/signed?..."
  }
  ```

### 2.4 Grouped Circuit Quotation & Orders
- **`POST /api/itineraries/:id/quote`**: Reprices entire multi-stop itinerary and returns a 15-minute frozen quote (`quoteId`).
- **`POST /api/circuit-orders`**: Consumes an active quote to create one parent circuit order and child bookings.
- **`POST /api/circuit-orders/:id/payment-order`**: Generates a single payment order covering the parent circuit.
- **`POST /api/circuit-orders/:id/verify-payment`**: Verifies parent payment and atomically confirms all child bookings.
- **`POST /api/circuit-orders/:id/demo-payment`**: Demo charge through the same `confirmCircuitOrderPayment` path; returns `403 DEMO_PAYMENT_DISABLED` unless demo payments are enabled.

---

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
- **`GET /api/suppliers/:supplierId/resources`**: Lists shared vehicles/guides and the options each constrains.
- **`POST /api/suppliers/:supplierId/resources`**: Creates one.
  - **Request Body**: `{ "name": "Tempo Traveller GA-07", "capacity": 6, "optionIds": ["opt_a", "opt_b"] }`
- **`PUT .../resources/:resourceId`**: Replaces name, capacity and the linked options.
- **`DELETE .../resources/:resourceId`**: Removes it, releasing the shared cap.
- A departure's vacancies are the smallest of its own pool and every linked
  resource, counted per departure time. Shrinking below seats already committed
  returns `CAPACITY_BELOW_RESERVED`; linking an option owned by another supplier
  returns `OPTION_NOT_FOUND`.

### 3.1.4 Review Share Links

- **`GET /api/reviews/share-links`**: The supplier's links, each with its funnel (`view_count`, `claim_count`, `invites_issued`, `reviews_submitted`), plus an aggregate `stats` block (`issued`, `opened`, `submitted`, `conversionPct`).
- **`POST /api/reviews/share-links`**: `{ productId?, label? }` → a new link. Omitting `productId` accepts a booking for any of the supplier's listings; supplying one restricts claims to that listing. A listing belonging to another supplier is rejected with `403`.
- **`PATCH /api/reviews/share-links/:id`**: `{ isActive }` deactivates or reactivates a link. A deactivated slug returns `410` to travelers. Another supplier's link is `403`.

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
- **`GET /api/suppliers/:id/bookings/:bookingId/dispatch-timeline`**: The booking's driver and trip events (`event_type`, `new_status`, `actor_id`, `note`, `details`, `created_at`). `404` for another supplier's booking.
- **`POST /api/suppliers/:id/bookings/:bookingId/confirm-driver`** `{ "note": "Called Ravi at 18:05" }`: Records a pending driver's acceptance taken by phone. Allowed after the response deadline while the assignment is still pending; `409` once the driver was removed or the schedule changed. Idempotent for an already accepted driver. Queues the driver-confirmed notifications, closes the assignment task, and writes an `ACCEPT_BY_PHONE` audit event with the note.
- **`GET /api/suppliers/:id/dispatch`**: Effective dispatch settings (`automatic_enabled`, `lead_hours`, `response_minutes`, `max_attempts`, `buffer_minutes`, and `source` of `DEFAULT` or `SUPPLIER`), fleet `readiness` (`total`, `ready`, and each driver's `missing` fields), open "assign manually" tasks (most urgent pickup first, with `minutes_to_pickup`, `priority`, `driver_state` of `NO_DRIVER` or `AWAITING_DRIVER`), and recent notification jobs.

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

## 4. Operations Endpoints (Requires `STAFF` or `ADMIN`)

### 4.1 Live Trip Board & Fallbacks
- **`GET /api/ops/live-dispatch`**: Returns active trips, unassigned bookings, and telemetry status.
- **`GET /api/ops/dispatch-queue`**: All open "assign manually" `tasks` across suppliers, most urgent pickup first, with supplier contact and driver state; `tripIssues` (`PICKUP_NOT_STARTED`, `TRIP_COMPLETION_OVERDUE`); and recent notification jobs. The supplier `GET /api/suppliers/:id/dispatch` returns the same `tripIssues` for its bookings.
- **`GET /api/ops/bookings/:bookingId/dispatch-timeline`**: Timeline for any booking.
- **`POST /api/ops/bookings/:bookingId/trip-override`** `{ "action": "START" | "COMPLETE", "note": "..." }`: Start an accepted trip without the pickup OTP, or complete a started trip. `409` for any other state.
- **`GET /api/ops/bookings/:bookingId/fleet-availability`**: The booking supplier's fleet with availability reasons, available drivers first.
- **`POST /api/ops/fallback-override`**: Operations take over assignment. Body: `bookingId`, `notes` (required reason), and either `supplierDriverId` or an outside driver (`fallbackDriverName`, `fallbackDriverPhone`, `fallbackDriverEmail`, `seatCapacity`, `fallbackVehicleModel`, `fallbackVehicleNumber`). With `confirmedByPhone: true` the driver is accepted immediately and `notes` is recorded as the phone confirmation.
- **`POST /api/ops/bookings/:bookingId/confirm-driver`** `{ "note": "..." }`: Same as the supplier phone confirmation, for any supplier's booking.
- **Scheduler endpoints** (`X-Scheduler-Token` or `ADMIN`/`STAFF`): `POST /api/ops/process-driver-dispatch`, `POST /api/ops/process-assignment-timeouts`, `POST /api/ops/process-reservation-outbox`, `POST /api/ops/process-post-trip-invites`.
- **`POST /api/ops/reset-pickup-otp`**: Resets an OTP lock for a stranded traveler after telephone verification.

### 4.2 Circuit Management Queue
- **`GET /api/ops/circuits`**: Lists pending multi-supplier circuit reschedule/cancellation requests.
- **`POST /api/ops/circuits/:id/approve`**: Atomically approves a circuit modification across all suppliers and executes grouped refund.

### 4.3 Notification Health & Testing
- **`GET /api/ops/notification-health`**: Reports operational status of WhatsApp, SES, and SMS without leaking secrets.
- **`POST /api/ops/notifications/test`**: Dispatches an authenticated provider test message.

### 4.4 Support Cases (`/api/support`, requires authentication)
Cancellations, complaints, safety concerns and refund disputes. Travelers see their own cases; `ADMIN`/`STAFF` decide refunds before the payment provider and finance ledger are updated.
- **`GET /cases`**, **`POST /cases`**, **`GET /cases/:ref`**, **`PATCH /cases/:ref`**
- **`POST /cases/:ref/messages`**, **`POST /cases/:ref/evidence`**
- **`POST /cases/:ref/refund-decision`**

### 4.5 Executive Analytics (`/api/analytics`, requires `ADMIN`)
Backs `/admin/analytics`: **`GET /overview`**, **`/trends`**, **`/cohorts`**, **`/suppliers`**, **`/revenue`**, **`/funnel`**, **`/alerts`** (anomaly alerts).

---

## 5. Webhook Endpoints (Signature Verified)

### 5.1 WhatsApp Delivery Status
- **Endpoint**: `POST /api/webhooks/whatsapp`
- **Security**: Verifies Meta HMAC-SHA256 signature in `X-Hub-Signature-256` using `WHATSAPP_APP_SECRET`.
- **Purpose**: Updates `notification_deliveries` with `DELIVERED`, `READ`, or `FAILED` delivery statuses.
- **Responses**: `200` after processing, `401` for an invalid signature, and `503` on a database processing failure so Meta can retry the event.

### 5.2 Cashfree & Razorpay Payment Webhooks
- **`POST /api/checkout/cashfree/webhook`**: Reconciles charges and refunds idempotently.
- **`POST /api/checkout/webhook`**: Reconciles Razorpay captured charges and refunds.

---

## 6. Standard OCTo (Open Connectivity for Tourism) Endpoints (`/api/octo` and `/octo`)

Compliant with OCTo specification v1. Used by external distributors, OTAs, and API partners to query Idea Holiday inventory and place instant bookings.

- **`GET /api/octo/capabilities`**: Declares supported capabilities (`octo/core`, `octo/pricing`, `octo/content`).
- **`GET /api/octo/suppliers`**: Lists verified suppliers with contact metadata.
- **`GET /api/octo/products`**: Lists published products formatted into OCTo schemas with options, departure start times, and unit pricing (ADULT / CHILD in INR).
- **`GET /api/octo/products/:id`**: Returns a single OCTo product with full unit definitions and cancellation terms.
- **`POST /api/octo/availability`**: Checks availability slots and vacancies for given `productId`, `optionId`, and date range.
- **`POST /api/octo/bookings/reservation`**: Creates an owner-scoped 10-minute temporary seat reservation (`native_reservations`).
- **`POST /api/octo/bookings/confirmation`**: Confirms a reservation into a booking. Populates the same required booking shape as a native checkout (`ref`, `product_type`, `pickup_location`, `amount_inr` from the hold's frozen price) and materialises a guest traveler for the synthetic OCTo owner.
- **`POST /api/octo/bookings/confirmation`**: Commits reservation into confirmed booking with QR code voucher payload.
- **`POST /api/octo/bookings/cancellation`**: Cancels reservation and releases seats back into availability.
- **`GET /api/octo/bookings/:id`**: Fetches booking status and details.

---

## 7. Supplier Channel Manager Endpoints (`/api/supplier-channels`)

Used on `supply.ideaholiday.in` for multi-channel ResTech integration (Bókun, FareHarbor, Bookingkit, Palisis/TourCMS, Activitar, Anchor, generic OCTo).

- **`GET /api/supplier-channels`**: Lists all connected booking channels and sync health for authenticated supplier.
- **`POST /api/supplier-channels`**: Connects a channel after running automated credential validation tests.
  - **Body**: `{ "channelName": "BOKUN", "channelTitle": "...", "credentials": { ... }, "endpointUrl": "..." }`
- **`DELETE /api/supplier-channels/:channelId`**: Disconnects a channel.
- **`GET /api/supplier-channels/:channelId/fetch-products`**: Fetches remote product catalog from the external channel.
- **`POST /api/supplier-channels/:channelId/import`**: Imports selected remote products into Idea Holiday catalog and maps identifiers in `reservation_external_references`.


---

## 8. Creator & Affiliate Endpoints (`/api/affiliate`)

Commission rules behind these endpoints are in BUSINESS_RULES §10.

### 8.1 Attribution (public)
- **`POST /api/affiliate/track-click`**: Records a referral click and opens the
  attribution window. Called by the browser whenever a `?ref=` link is opened.
  - **Body**: `{ "affiliateCode": "TRAVELPRO10", "visitorId": "…", "subId": "reels-march", "destinationPath": "/activity/goa-scuba", "referrerUrl": "…" }`
  - **Response**: `{ "success": true, "attributionExpiresAt": "2026-10-12 09:00:00", "windowDays": 30 }`
  - `visitorId` is an anonymous, browser-generated token (`lib/affiliateAttribution.js`).
    Without it the click is logged but no attribution window opens, and a link
    referral will not be credited.

Booking creation (`POST /api/bookings`) accepts `visitor_id`, and optionally
`affiliate_code` and `affiliate_sub_id`. **The code alone earns nothing** — the
server credits a link referral only when an unexpired attribution exists for
that `visitor_id`. A coupon code applied through `promo_code` follows the normal
promo path and is credited on the code itself.

### 8.2 Profile (Requires authentication)
- **`GET /api/affiliate/me`**: `{ registered, affiliate }` for the signed-in user.
- **`POST /api/affiliate/register`**: Creates the creator profile and provisions
  the matching traveler-facing promo code.
  - **Body**: `{ "channelName": "...", "channelType": "YOUTUBE", "channelUrl": "...", "customCode": "TRAVELPRO10", "bio": "..." }`
- **`PUT /api/affiliate/profile`**: Updates channel name, type, URL, bio.
- **`POST /api/affiliate/kyc`**: Submits PAN (and optionally bank/UPI, which are
  routed through the payout-account flow below).
  - **Body**: `{ "panNumber": "ABCDE1234F", "panHolderName": "...", "bankAccountNumber": "...", "bankIfsc": "...", "bankAccountHolder": "...", "upiId": "...", "gstin": "..." }`
- **`GET /api/affiliate/dashboard`**: Full creator dashboard — tier and progress,
  balance breakdown (pending / on hold / withdrawable / reserved / paid), payout
  policy, payout accounts, referrals, campaign totals, payouts and ledger.
- **`GET /api/affiliate/share-link?path=/activity/x&subId=reels-march`**: Builds
  a trackable deep link.

### 8.3 Payout accounts (Requires authentication)
- **`GET /api/affiliate/payout-accounts`**: Accounts on file. Account numbers are
  **masked** to the last four digits.
- **`POST /api/affiliate/payout-accounts`**: Adds a bank account (verified by
  penny drop) or a UPI ID.
  - **Body (bank)**: `{ "method": "BANK_TRANSFER", "accountNumber": "...", "ifsc": "HDFC0001234", "accountHolder": "...", "accountType": "SAVINGS", "makePrimary": true }`
  - **Body (UPI)**: `{ "method": "UPI", "upiId": "name@okhdfcbank" }`
  - A *second* or later account is verified immediately but cannot receive a
    payout for 24 hours (`usableFrom`); the first account is exempt.
  - **Errors**: `400` malformed details, `409` already on file.
- **`PATCH /api/affiliate/payout-accounts/:id/primary`**: Points future payouts at
  this account.
- **`DELETE /api/affiliate/payout-accounts/:id`**: Archives it. `409` while a
  payout to it is in flight.

### 8.4 Payouts (Requires authentication)
- **`GET /api/affiliate/payout-preview?amountInr=5000`**: Balances plus the
  gross / TDS / net split for this amount, before committing to it.
- **`POST /api/affiliate/payout/request`**: Requests a withdrawal.
  - **Body**: `{ "amountInr": 5000, "paymentMethod": "BANK_TRANSFER", "payoutAccountId": "affacc_..." }`
  - **Errors**: `403` KYC incomplete, account unverified, or account still
    cooling off; `400` below the ₹1,000 minimum or above the withdrawable
    balance (the message names how much is still clearing).

### 8.5 Admin (`/api/admin/affiliates`, requires `ADMIN`)
- **`GET /api/admin/affiliates`**: Lists creators. Filters: `status`,
  `kyc_status`, `search`.
- **`PATCH /api/admin/affiliates/:id/status`**: `ACTIVE`, `SUSPENDED`, `REJECTED`, `PENDING`.
- **`PATCH /api/admin/affiliates/:id/kyc`**: Manual PAN decision. **Cannot** mark
  a bank account verified — only the bank can.
- **`POST /api/admin/affiliates/:id/refresh-tier`**: Recomputes the tier.
- **`GET /api/admin/affiliates/:id/payout-accounts`**: Accounts (including
  archived) plus derived balances.
- **`GET /api/admin/affiliates/payouts?status=REQUESTED`**: The payout queue.
  Destinations are **masked**; each row carries gross, TDS and net.
- **`GET /api/admin/affiliates/payouts/:id/instrument`**: The full bank details
  and the exact net amount to transfer. **This disclosure is audit-logged with
  the acting admin.**
- **`POST /api/admin/affiliates/payouts/:id/settle`**: `{ "utrReference": "..." }`.
  Marks the funding commissions `PAID`.
- **`POST /api/admin/affiliates/payouts/:id/reject`**: `{ "reason": "..." }`.
  Returns the balance to the creator.

## 9. Travel & Earn Endpoints (`/api/referral`, `/api/loyalty`)

See BUSINESS_RULES §11.

### 9.1 Public
- **`POST /api/referral/track-click`**: `{ "referralCode": "REF-…", "visitorId": "…", "channel": "WHATSAPP|QR|REVIEW|VOUCHER|COPY|CODE|OTHER", "landingPath": "/signup" }`.
  Records a referral link click for 30 days. Returns `{ tracked, attributionExpiresAt, referrerFirstName }`
  or `{ tracked: false, reason: "UNKNOWN_CODE" | "SELF" }`. Rate limited to 60/minute.
- **`GET /api/referral/qr/:code.svg?ch=QR`**: SVG QR code for the invite link,
  rendered server-side.
- **`GET /api/loyalty/public-ref/:code`**: `{ valid, referrerName, friendDiscountPct, message }`.
  Only the referrer's first name is returned.
- **`POST /api/auth/signup`** accepts `referralCode` and `visitorId`. Response
  includes `referral: { referred: true }` when a relationship was created, else `null`.

### 9.2 Checkout
- **`POST /api/bookings/quote`** accepts `referral_code` and `visitor_id` and returns
  `quote.referral: { eligible, discountInr, referrerFirstName, reason }`. `reason`
  is one of `FIRST_TRIP_USED`, `BLOCKED`, `EXPIRED`, `SELF_REFERRAL`,
  `SAME_PHONE`, `EMAIL_ALIAS`, `SAME_DEVICE`, `NOT_NEW_TRAVELER`, `UNKNOWN_CODE`,
  `NO_REFERRAL`, `AFFILIATE_REFERRAL`. Commission is never returned.
- **`POST /api/bookings`** accepts `referral_code` and `wallet_credit_inr`, and
  returns `referral_discount_inr` and `wallet_credit_applied_inr` alongside
  `amount_inr` (what the payment gateway charges) and `original_amount_inr`.
- **`POST /api/promo/validate`** with a `REF-` code returns `type: "REFERRAL"`,
  `discountAmount: 0`: the rupee discount is priced by the quote, not here.

### 9.3 Traveler (requires authentication)
- **`GET /api/loyalty/profile`**: Code, link, wallet (`walletBalanceInr`,
  `expiringSoonInr`, `nextExpiryAt`, `clawbackPendingInr`), totals by stage
  (`totalCreditsEarned`, `clearingCredits`, `upcomingCredits`, `inReviewCredits`),
  `friends`, `rewards` (each with `stage`: `UPCOMING_TRIP`, `CLEARING`,
  `IN_REVIEW`, `CREDITED`, `REVERSED`), tier, `policy`, `referredBy`, and the
  last 20 wallet transactions.
- **`GET /api/referral/me`**: The referral part of the above on its own.
- **`GET /api/promo/user/referral`**: The profile, wrapped as `{ referral }`, for
  older clients.

### 9.4 Operations (requires `ADMIN` or `STAFF`)
- **`GET /api/referral/admin/metrics?days=90`**: Clicks, friends joined,
  referred first trips and bookings, GMV and margin from referred bookings,
  friend discounts, referrer credit cleared, `costPctOfMargin`,
  `clickToFirstTripPct`, `viralCoefficient`, reversals, wallet issued / redeemed /
  expired / `breakagePct`, `walletDiscrepancies`, and abuse signals by type.
- **`GET /api/referral/admin/review`**: `{ rewards, blockedRelationships, signals }`.
- **`POST /api/referral/admin/rewards/:id/review`**: `{ "decision": "APPROVE" | "REJECT", "note": "…" }`.
  Approve clears on the next lifecycle run.
- **`PATCH /api/referral/admin/relationships/:id`**: `{ "status": "ACTIVE" | "BLOCKED", "reason": "…" }`.
  Reopening also clears the review flag.

---

## 10. Supplier Profile Endpoints

Rules: BUSINESS_RULES §12. Public responses never include contact, tax or bank details.

### 10.1 Public (`/api/public/suppliers`, no authentication, 120 requests/min)
- **`GET /api/public/suppliers?q=&city=&verified=1&page=&limit=`**: Directory.
  `{ suppliers: [{ slug, path, name, tagline, city, state, logoUrl, verified, rating: { average, count } }], pagination }`.
  Verified first, then by counted reviews. `city` also matches service cities.
- **`GET /api/public/suppliers/cities`**: `{ cities: [{ city, state, slug, path, supplierCount }] }`.
- **`GET /api/public/suppliers/cities/:citySlug`**: `{ city: { …, indexable } }` or `404`.
- **`GET /api/public/suppliers/:slug`**: `{ supplier, seo, reviews, pagination }`, or
  `{ redirectTo }` for a renamed slug, or `404` when hidden, suspended or unknown.
  `supplier`: `slug, path, name, tagline, about, logoUrl, coverUrl, city, state,
  cityPath, businessType, yearsInOperation, memberSince, languages, serviceCities,
  sameAs, badge: { status: "VERIFIED" | "NOT_VERIFIED", verifiedAt, validUntil, checks },
  rating: { average, count }, indexable`. `seo` is the head the server renders.
- **`GET /api/public/suppliers/:slug/reviews?page=`**: `{ reviews: [{ id, rating, title,
  comment, travelerName, createdAt, countedInRating, supplierResponse, photos }], pagination }`.
- **`POST /api/public/suppliers/:slug/enquiries`** (requires authentication, 10/hour):
  `{ "message": "…", "travelDate": "YYYY-MM-DD", "travelers": 2 }` →
  `201 { enquiry, reused: false }`, or `200 { enquiry, reused: true }` when it
  continued an open thread. `400` for contact details, `403` for supplier accounts.

### 10.2 Enquiries (`/api/enquiries`, requires authentication)
Scoped to the caller: a traveler sees their own threads, a supplier the threads sent to it, `ADMIN`/`STAFF` all (read only).
- **`GET /api/enquiries?status=OPEN|REPLIED|CLOSED`**: `{ enquiries: [{ ref, status, supplierName, supplierPath, travelerName, travelDate, travelers, lastMessage, lastMessageAt }] }`.
- **`GET /api/enquiries/:ref`**: the thread with `messages: [{ id, authorRole, message, createdAt }]`.
- **`POST /api/enquiries/:ref/messages`**: `{ "message": "…" }` → `201 { enquiry }`. `409` when closed.
- **`POST /api/enquiries/:ref/close`**: `{ enquiry }`.

### 10.3 Supplier (`/api/suppliers/:id`, the supplier or `ADMIN`/`STAFF`)
- **`GET /api/suppliers/:id/public-profile`**: `{ profile, publicView, visible, indexable, kybStatus, completeness: { score, missing }, verification }`.
- **`PATCH /api/suppliers/:id/public-profile`**: any of `slug, tagline (≤120), about (≤2000),
  logoUrl, coverUrl (https or /uploads/…), languages (≤10), serviceCities (≤30),
  socialLinks { website, instagram, facebook, youtube }, profileStatus: "PUBLISHED" | "HIDDEN"`.
  Returns the same shape as GET. `400` with a reason, `409` for a taken slug or a suspended profile.

### 10.4 Admin (`/api/admin/suppliers/:id`, requires `ADMIN`)
- **`GET …/public-profile`**: the supplier view plus `checkCatalog` and `requiredChecks`.
- **`POST …/profile-verification`**: `{ "action": "GRANT", "checks": ["BUSINESS_IDENTITY", "BANK_ACCOUNT", "BUSINESS_ADDRESS", "OWNER_CALL"], "reason": "…" }` → `201`,
  or `{ "action": "REVOKE", "reason": "…" }`. `409` when KYB is not approved.
- **`PATCH …/profile-status`**: `{ "suspended": true, "reason": "…" }` or `{ "suspended": false }`.

### 10.4.1 Team (`/api/admin/team`, requires `ADMIN`)
The `ADMIN` and `STAFF` users who run the platform; all of them receive booking and operations alerts.
- **`GET /api/admin/team`** → `{ members: [{ id, name, email, phone, role }], currentUserId }`.
- **`POST /api/admin/team`**: `{ "name": "…", "email": "…", "phone": "+91 98765 43210", "role": "STAFF" | "ADMIN" }` → `201`
  `{ member, temporaryPassword, promotedExistingAccount }`. A new person gets a one-time `temporaryPassword`; an existing
  traveler account is promoted and keeps its password (`temporaryPassword: null`). `409` if already on the team or the email
  is a supplier account; `400` if the number is not WhatsApp-deliverable. The phone is stored as `+<country><number>`.
- **`PATCH /api/admin/team/:id`**: any of `{ name, phone, role }`. `409` when demoting yourself or the last `ADMIN`.
- **`DELETE /api/admin/team/:id`**: revokes team access (role becomes `TRAVELER`; the account and history stay). `409` for yourself or the last `ADMIN`.
- **`POST /api/admin/team/:id/reset-password`** → `{ member, temporaryPassword }`; the previous password stops working.

### 10.5 Pages and sitemap (served by `routes/seo.js`)
- **`GET /suppliers`, `/suppliers/in/:citySlug`, `/suppliers/:slug`**: the SPA's
  `index.html` with the page's title, description, canonical, robots, Open Graph
  and JSON-LD (`TravelAgency` + `BreadcrumbList`) written in. `301` for renamed or
  miscased slugs, `404` with `noindex` for unknown or hidden ones. Falls through to
  the SPA when `frontend/dist` is not built.
- **`GET /sitemap-suppliers.xml`**: the directory, indexable city pages and indexable profiles. Listed in `robots.txt`.
