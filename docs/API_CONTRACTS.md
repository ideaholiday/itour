# API Contracts: Idea Holiday

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
- **`POST /api/activities/:id/validate-pickup`**: Validates whether coordinates or address fall within the tour's pickup bounds.
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

- **`GET /api/products/:id/price-calendar?month=YYYY-MM`**:
  - One month of per-day prices for the traveler price calendar.
  - When the product has native seat inventory, days resolve through the same
    seasonal rates and calendar overrides the departure picker uses, and the
    response carries `pricingSource: "NATIVE_INVENTORY"`. Each day reports
    `priceInr`, `tier` (`PEAK`/`SAVER`/`STANDARD`) and `available`; a date the
    supplier closed returns `available: false`.
  - Products without seat inventory keep demand-rule pricing over `price_inr`
    and omit `pricingSource`.

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

### 3.2 Driver Assignment & Roster Dispatch
- **Endpoint**: `POST /api/suppliers/bookings/:id/assign-driver`
- **Request Body**:
  ```json
  {
    "driverName": "Ramesh Kumar",
    "driverPhone": "+919839011223",
    "vehicleModel": "Toyota Innova Crysta",
    "vehicleNumber": "UP-32-DN-4821"
  }
  ```
- **Response (200 OK)**: Dispatches automated WhatsApp template with trip details to driver and alerts traveler of assignment.

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
- **`POST /api/ops/fallback-override`**: Manually overrides a stalled booking with a fallback driver.
- **`POST /api/ops/reset-pickup-otp`**: Resets an OTP lock for a stranded traveler after telephone verification.

### 4.2 Circuit Management Queue
- **`GET /api/ops/circuits`**: Lists pending multi-supplier circuit reschedule/cancellation requests.
- **`POST /api/ops/circuits/:id/approve`**: Atomically approves a circuit modification across all suppliers and executes grouped refund.

### 4.3 Notification Health & Testing
- **`GET /api/ops/notification-health`**: Reports operational status of WhatsApp, SES, and SMS without leaking secrets.
- **`POST /api/ops/notifications/test`**: Dispatches an authenticated provider test message.

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

