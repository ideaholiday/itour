# Pick & Drop Point Logic — CTO Implementation Plan
> **Idea Holiday | Product Engineering | v1.0**
> Author perspective: CTO / Head of Product Engineering

---

## Executive Summary

The platform currently has a **critical logical gap**: pickup and drop-off points are collected from users as free-text or lat/lng pairs with **zero semantic validation** against the product's defined operational scope. This allowed a traveler to book **MOPA Airport (GOX) → North Goa Hotels** (a Goa-specific product) and arbitrarily input **New Delhi Airport** as the drop-off — which the system silently accepted.

This plan defines the **canonical pickup/drop validation architecture** for all four product verticals: Airport Transfer, City Transfer, Sightseeing/Day Tour, and Multi-Day Package.

---

## Root Cause Analysis: The MOPA → Delhi Bug

```
Product:     MOPA Airport (GOX) to North Goa Hotels Private AC Cab Transfer
Route Type:  AIRPORT_PICKUP
Origin:      MOPA Airport (lat: 15.7130, lng: 73.9140)  — Fixed
Destination: North Goa Hotels service zone               — Constrained polygon

User input:  Drop = New Delhi Airport (lat: 28.5562, lng: 77.1000)

What happened:  System accepted user lat/lng as-is and computed Haversine
                distance (≈1,900 km), producing an absurd ₹25,000+ quote
                that was accepted into booking.
```

**Why it happened:**
1. `transfer_routes` defines `dest_lat/dest_lng` but the booking API does **not validate** that the user-supplied `drop_lat/drop_lng` falls within `dest_radius_km` of the route's canonical destination.
2. The transfer search engine performs geo-fence matching on *supplier service zones* (to find which supplier can serve), but **never validates the drop point against the product's own destination constraint**.
3. `day_tours` has `pickup_service_type = 'HOTEL_PICKUP_ANYWHERE'` with **no geo boundary** enforced at booking time.
4. No concept of **Point Type** (airport IATA code, hotel zone, landmark) exists to prevent semantic mismatches.

---

## Core Concept: Location Entity & Point Type System

Every pickup and drop point in the system must be typed. We introduce a **canonical location registry** and a **product location binding** system.

### Location Types (Taxonomy)

| Type Code | Description | Examples |
|-----------|-------------|---------|
| `AIRPORT` | Airport terminal (IATA-coded) | MOPA/GOX, DEL, BOM, MAA |
| `RAILWAY_STATION` | Rail terminus | Madgaon, CSMT, Hazrat Nizamuddin |
| `BUS_STAND` | State or private bus depot | Panaji Bus Stand |
| `HOTEL_ZONE` | Named hotel service polygon | North Goa Hotels, Calangute Belt |
| `CITY_CENTER` | City central reference point | Panaji City Center |
| `LANDMARK` | Named tourist landmark | Dudhsagar Falls, India Gate |
| `CRUISE_PORT` | Sea port / cruise terminal | Mormugao Port |
| `PICKUP_ZONE` | Generic named service area | South Goa Resorts Belt |

---

## Product Vertical Logic

### 🔵 Vertical 1: Airport Transfer

**Sub-types:**
- `AIRPORT_PICKUP` — Fixed origin (airport), flexible destination within service zone
- `AIRPORT_DROP` — Flexible origin within service zone, fixed destination (airport)
- `AIRPORT_TO_AIRPORT` — Rarely used, inter-city

**Rules:**

| Field | Rule |
|-------|------|
| Origin (AIRPORT_PICKUP) | **LOCKED** to the product's `origin_iata` code. User cannot change it. Frontend shows read-only badge: `"MOPA Airport (GOX) ✈ — Fixed Pickup"`. |
| Destination (AIRPORT_PICKUP) | Must fall within `dest_radius_km` of the product's `dest_lat/dest_lng`. Backend validates at quote time. |
| Origin (AIRPORT_DROP) | Must fall within `origin_radius_km` of the product's `origin_lat/origin_lng`. |
| Destination (AIRPORT_DROP) | **LOCKED** to product's `dest_iata` code. |
| Cross-state drop validation | If user-supplied drop is in a different **state** than the product's `dest_state`, return `400 INVALID_DROP_POINT`. |
| Flight info required | `AIRPORT_PICKUP` requires `flight_number` + `flight_arrival_time`. `AIRPORT_DROP` requires `flight_number` + `flight_departure_time`. |

**The MOPA fix specifically:**
```
Product constraint:  dest_state = "Goa", dest_radius_km = 40km from Panaji centroid
User input:          New Delhi Airport → distance from centroid = 1,926 km
Validation outcome:  REJECT with error:
  "This transfer is valid only within North Goa (within 40 km of Panaji).
   Your selected drop-off (New Delhi Airport) is outside the service area.
   Please select a hotel or address in North Goa."
```

---

### 🟢 Vertical 2: City-to-City Transfer

**Rules:**

| Field | Rule |
|-------|------|
| Origin | Must fall within `origin_radius_km` of the route's `origin_lat/lng`. |
| Destination | Must fall within `dest_radius_km` of the route's `dest_lat/lng`. |
| State boundary check | If crossing states, confirm `interstate_permit_tax` flag is active on the product. |
| Same-city drop validation | Origin city ≠ Destination city enforced. Cannot create city-to-same-city booking. |

---

### 🟡 Vertical 3: Day Sightseeing / Activity Tour

Day tours are fundamentally different — the vehicle departs from the traveler's hotel and covers a fixed itinerary of places. The **route is defined by the product's `places_covered` list**, not the user.

**Rules:**

| Field | Rule |
|-------|------|
| Pickup | Hotel/accommodation address **within the supplier's operational geo-fence**. Free-form address input with Mappls autocomplete, constrained to the city. |
| Drop-off | Same as pickup (return to hotel) by default. |
| User-defined stops | **NOT ALLOWED**. The places-to-visit sequence is the product's itinerary. Users cannot add/remove stops. |
| Pickup city validation | Address city must match `products.city`. Backend validates at quote time using reverse-geocode or geo-fence point-in-polygon. |
| Duration slot | User selects a time slot from `day_tours.available_time_slots`. Backend validates slot availability for the selected date. |

**Example rejection:**
```
Product:  North Goa 8-Hour Sightseeing Tour (city = "Goa")
User:     Pickup = Hotel in Pune
Outcome:  REJECT — "This tour departs only from hotels in North Goa.
           Please enter your hotel address in North Goa."
```

---

### 🟣 Vertical 4: Multi-Day Package

Multi-day packages have the most complex pickup logic because the itinerary spans multiple days and cities.

**Rules:**

| Field | Rule |
|-------|------|
| Day 1 Pickup | Arrival city pickup — typically an airport or railway station in the `start_city`. Must match `package_itineraries.start_city`. |
| Daily pickups | Each day's pickup is defined by the previous day's hotel check-in city (defined in `day_wise_details`). User provides hotel name; system geocodes to validate it's in the expected city. |
| Final Drop | Must be in `package_itineraries.end_city` — typically the departure airport. |
| Inter-day logic | The system must validate that each hotel the user provides corresponds to the city defined for that day in the itinerary JSON. |

---

## New Database Objects Required

### `canonical_locations` table
Master registry of all typed location anchors.

```sql
CREATE TABLE canonical_locations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,         -- "MOPA Airport (GOX)"
  short_name    VARCHAR(100),                  -- "MOPA Airport"
  iata_code     VARCHAR(10),                   -- "GOX" (airports only)
  location_type VARCHAR(50) NOT NULL,          -- 'AIRPORT','HOTEL_ZONE','LANDMARK' etc.
  city          VARCHAR(100) NOT NULL,         -- "North Goa"
  state         VARCHAR(100) NOT NULL,         -- "Goa"
  country       VARCHAR(50) DEFAULT 'India',
  lat           DECIMAL(10,7) NOT NULL,
  lng           DECIMAL(10,7) NOT NULL,
  radius_km     DECIMAL(6,2) DEFAULT 5.0,      -- acceptance radius
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### `product_location_rules` table
Binds a product to its allowed pickup/drop location constraints.

```sql
CREATE TABLE product_location_rules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id            UUID REFERENCES products(id) ON DELETE CASCADE,
  rule_side             VARCHAR(10) NOT NULL,   -- 'PICKUP' | 'DROP'
  rule_mode             VARCHAR(30) NOT NULL,   -- 'FIXED_LOCATION' | 'ZONE_POLYGON' | 'RADIUS_FROM_CENTER' | 'CITY_ANYWHERE'
  fixed_location_id     UUID REFERENCES canonical_locations(id), -- for FIXED_LOCATION
  allowed_location_types TEXT[] DEFAULT '{}',   -- ['HOTEL_ZONE','CRUISE_PORT'] for flexible sides
  center_lat            DECIMAL(10,7),
  center_lng            DECIMAL(10,7),
  radius_km             DECIMAL(6,2),
  allowed_state         VARCHAR(100),           -- state-level guard
  allowed_city          VARCHAR(100),           -- city-level guard
  polygon_coordinates   JSONB DEFAULT '[]',     -- for ZONE_POLYGON mode
  error_message         TEXT,                   -- custom user-facing error
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Extend `transfer_routes` table
Add explicit IATA codes and constraint links:

```sql
ALTER TABLE transfer_routes ADD COLUMN origin_iata VARCHAR(10);
ALTER TABLE transfer_routes ADD COLUMN dest_iata VARCHAR(10);
ALTER TABLE transfer_routes ADD COLUMN origin_location_id UUID REFERENCES canonical_locations(id);
ALTER TABLE transfer_routes ADD COLUMN dest_location_id UUID REFERENCES canonical_locations(id);
```

---

## Backend Validation Engine: `locationValidationService.js`

New service with the following exported functions:

### `validatePickupPoint(productId, side, userLat, userLng, userAddress)`

```
1. Load product_location_rules for this product+side
2. For FIXED_LOCATION:
   - Check distance from canonical_location lat/lng < canonical_location.radius_km
   - If fails → REJECT with error_message
3. For RADIUS_FROM_CENTER:
   - Check Haversine(userLat, userLng, center_lat, center_lng) < radius_km
   - If fails → REJECT
4. For ZONE_POLYGON:
   - Run ray-casting point-in-polygon against polygon_coordinates
   - If fails → REJECT
5. For CITY_ANYWHERE:
   - Reverse geocode userLat/userLng → extract city+state
   - Compare to allowed_city + allowed_state
   - If mismatch → REJECT
6. If allowed_location_types is set:
   - Check that the nearest canonical_location of matching type is within 2km
   - Prevents entering a random coordinate that is not actually a hotel/airport
7. Return { valid: true } or { valid: false, error: string, code: 'INVALID_PICKUP_POINT' }
```

### `validateTransferRoute(productId, pickupLat, pickupLng, dropLat, dropLng)`
Runs `validatePickupPoint` for both sides and returns combined result.

### `getPickupSuggestions(productId, side, searchQuery)`
Returns typeahead suggestions scoped to the product's allowed location types and geographic area — **drives the frontend autocomplete**.

---

## API Contract Changes

### `POST /api/transfers/quote` — Add validation

**Request body additions:**
```json
{
  "productId": "uuid",          // NEW — required for context-aware validation
  "pickupLat": 15.7130,
  "pickupLng": 73.9140,
  "dropLat":   15.5050,          // within North Goa — VALID
  "dropLng":   73.8000,
  "dropAddress": "Taj Holiday Village, Calangute"
}
```

**New error response (400):**
```json
{
  "error": "The drop-off location is outside the service area for this transfer.",
  "code": "INVALID_DROP_POINT",
  "detail": {
    "allowed_area": "North Goa Hotels (within 40 km of Panaji)",
    "allowed_state": "Goa",
    "provided_distance_km": 1926.4,
    "suggestion": "Please select a hotel or address in North Goa."
  },
  "requestId": "..."
}
```

### `POST /api/activities/:id/pickup-suggestions` — NEW endpoint

Returns autocomplete suggestions for pickup/drop scoped to the product:

**Response:**
```json
{
  "suggestions": [
    {
      "id": "uuid",
      "name": "Taj Holiday Village, Calangute",
      "type": "HOTEL_ZONE",
      "lat": 15.5450,
      "lng": 73.7523,
      "city": "North Goa",
      "displayHint": "North Goa Hotels Area"
    }
  ]
}
```

---

## Frontend UX Flow by Vertical

### Airport Transfer Booking Flow

```
Step 1: User lands on product page
        "MOPA Airport (GOX) → North Goa Hotels"

Step 2: Pickup shown as READ-ONLY locked badge
        [✈ MOPA Airport (Goa) — Fixed Pickup Point]
        User CANNOT change this.

Step 3: Drop-off input — constrained autocomplete
        Placeholder: "Enter your hotel in North Goa"
        Autocomplete: Calls /api/activities/:id/pickup-suggestions?side=drop&q=...
        Results: Only returns hotels/landmarks in North Goa
        User selects: "Taj Holiday Village, Calangute"

Step 4: Flight info panel (conditional on route_type = AIRPORT_PICKUP)
        - Flight Number (required)
        - Arrival Time (required)
        - Terminal (optional)

Step 5: Date & PAX selection → Quote computed → Checkout
```

### Day Tour Booking Flow

```
Step 1: Product page shows stops as locked timeline:
        [India Gate → Qutub Minar → Lotus Temple → Akshardham]

Step 2: Pickup input — free-form address within product city
        Placeholder: "Enter your hotel in North Goa"
        Validation: POST /api/activities/:id/validate-pickup
        If outside city → inline error shown immediately

Step 3: Time slot picker (from day_tours.available_time_slots)

Step 4: PAX → Quote → Checkout
```

---

## Supplier Dashboard: Location Rules Builder

Suppliers must be able to define pickup/drop rules when creating a product. New section in the listing builder:

### Transfer Route Builder (enhanced)

```
Route Type: [AIRPORT_PICKUP ▼]

Origin (FIXED):
  [📍 Select Airport — IATA lookup]  → "MOPA Airport (GOX)"
  Mode: FIXED_LOCATION — user cannot change at booking

Destination (FLEXIBLE):
  Constraint mode: [RADIUS_FROM_CENTER ▼]
  Center: [📍 Panaji City Center]  → auto-fills lat/lng
  Radius: [40 km]
  Allowed location types: [✓ HOTEL_ZONE] [✓ CRUISE_PORT] [✓ CITY_CENTER]
  Error message: "Please select a hotel or address in North Goa (within 40 km of Panaji)"
```

### Sightseeing Product Builder (enhanced)

```
Pickup Zone:
  Mode: [CITY_ANYWHERE ▼]
  City: [North Goa]
  State: [Goa]
  Allowed types: [✓ HOTEL_ZONE] [✓ LANDMARK]

Drop-off: [Same as pickup ▼]

Itinerary (locked — user cannot modify):
  + Add Place | Order ↕
  [India Gate] [Qutub Minar] [Lotus Temple]
```

---

## Validation State Machine at Booking Time

```
POST /api/bookings  or  POST /api/checkout
         │
         ▼
[1] Load product + product_location_rules
         │
         ▼
[2] validatePickupPoint(product, PICKUP, userPickupLat, userPickupLng)
         │ FAIL → 400 INVALID_PICKUP_POINT
         ▼
[3] validatePickupPoint(product, DROP, userDropLat, userDropLng)
         │ FAIL → 400 INVALID_DROP_POINT
         ▼
[4] Product-type specific validations:
     TRANSFER → validate route_type, check flight info for AIRPORT_PICKUP
     DAY_TOUR → validate city match, check slot availability
     MULTI_DAY → validate start_city match, hotel city per day
         │ FAIL → 400 INVALID_BOOKING_PARAMS
         ▼
[5] computeTransferQuote() / computeTourQuote()
         │
         ▼
[6] Create pending_payment booking (existing flow)
```

---

## Product-Type Specific Additional Validations

### Airport Transfer Extras

| Validation | Rule |
|------------|------|
| Flight number format | Regex: `^[A-Z]{2}\d{1,4}$` (e.g., G8 421, AI 103) |
| Arrival time required for AIRPORT_PICKUP | Reject if missing |
| Departure time required for AIRPORT_DROP | Reject if missing |
| Free waiting time display | Show "60 min free waiting" prominently |
| Night surcharge | If arrival time 22:00–06:00 → apply `night_allowance_inr` |
| Terminal info | Optional but stored for driver guidance |

### Sightseeing Tour Extras

| Validation | Rule |
|------------|------|
| Pickup within operating hours | Cannot book pickup at 03:00 AM for an 09:00 AM tour |
| Capacity by vehicle rule | Enforce `day_tours.vehicle_rules` pax brackets |
| Cutoff time | Reject same-day bookings if < 4 hours from slot time |
| Max distance from city center | Pickup must be within `day_tours.distance_km_limit` of city center |

### Multi-Day Package Extras

| Validation | Rule |
|------------|------|
| Start city airport/rail | Day 1 pickup must be airport/station in `start_city` |
| Daily hotel city validation | Each hotel provided must be in the city defined for that day |
| End city validation | Final drop = airport/station in `end_city` |
| Hotel tier validation | If hotel variant selected (3-Star), hotel must be in approved list or flagged for ops review |

---

## Phased Rollout Plan

### Phase 1 — Foundation (Week 1–2)
- [x] Create `canonical_locations` table and seed with all Indian airports (IATA), major railway stations, Goa hotel zones
- [x] Create `product_location_rules` table
- [x] Write `locationValidationService.js` core validator
- [x] Add `origin_iata` / `dest_iata` + `origin_location_id` / `dest_location_id` to `transfer_routes`
- [x] Write migration file

### Phase 2 — Transfer Validation (Week 2–3)
- [x] Integrate `validateTransferRoute()` into `POST /api/transfers/quote`
- [x] Integrate into `POST /api/bookings` (checkout path)
- [x] Return structured `INVALID_DROP_POINT` / `INVALID_PICKUP_POINT` errors
- [x] Add `/api/activities/:id/pickup-suggestions` endpoint
- [x] Write backend tests covering: MOPA→Delhi rejection, MOPA→Calangute acceptance, cross-state rejection
- [x] Add airport transfer `flight_number` / arrival time required validation

### Phase 3 — Sightseeing & Tour Validation (Week 3–4)
- [x] Extend validation for `DAY_TOUR` products
- [x] City-match validation for pickup address
- [x] Slot availability check
- [x] Cutoff time enforcement

### Phase 4 — Multi-Day Package Validation (Week 4–5)
- [x] Per-day hotel city validation
- [x] Start/end city anchor validation

### Phase 5 — Frontend & Supplier UX (Week 5–6)
- [x] Replace free-text drop-off with constrained autocomplete (Mappls, scoped)
- [x] Lock fixed-origin display for AIRPORT_PICKUP
- [x] Add flight info panel
- [x] Supplier listing builder: location rules UI
- [x] Inline validation on blur in booking form

### Phase 6 — Testing & Hardening (Week 6–7)
- [x] 10+ backend unit tests for `locationValidationService`
- [x] Integration tests for all four product verticals
- [x] E2E test: attempt MOPA→Delhi booking → expect rejection
- [x] E2E test: MOPA→Calangute → expect success + flight info required

---

## Open Questions

### Resolution (v1 implementation)

The v1 rollout resolves these decisions as follows: Mappls is used when
`MAPPLS_API_KEY` is configured, with the offline canonical registry as the
deterministic fallback; free-form hotels use the hybrid trust model (city and
geo validation, with non-canonical points flagged for operations review);
existing products are backfilled automatically and existing bookings remain
unchanged; supplier products receive derived rules on creation/backfill; and
the seed catalog uses a curated set of the airports, railway stations and Goa
zones served by the marketplace. A future data refresh can extend the catalog
without changing the validation contract.

> [!IMPORTANT]
> **Q1: Mappls Reverse Geocode API**
> City-level validation for sightseeing pickup requires reverse geocoding user-supplied lat/lng to extract city+state. Do we use the existing Mappls API key (`MAPPLS_API_KEY` referenced in `backend/.env`)? What's the rate limit / cost implication?

> [!IMPORTANT]
> **Q2: Hotel Address Trust Model**
> For sightseeing and package pickup, should we:
> - **Option A**: Trust the Mappls geocode result for city validation (free-form address → lat/lng → validate)
> - **Option B**: Maintain a curated `canonical_locations` list of partner hotels and require selection from it
> - **Option C**: Hybrid — allow free-form with city validation, but flag non-canonical addresses for ops review

> [!IMPORTANT]
> **Q3: Existing Bookings Migration**
> There are existing bookings with potentially out-of-zone drop points. Do we:
> - Leave them as-is (they're already confirmed)
> - Run a one-time audit script to flag anomalies for ops review

> [!NOTE]
> **Q4: Supplier UX for Location Rules**
> Should existing suppliers have their products auto-populated with location rules derived from `transfer_routes.dest_lat/dest_lng` + `dest_radius_km`, or do we require them to explicitly re-confirm the rules in the updated dashboard?

> [!NOTE]
> **Q5: IATA Airport Data Source**
> We need a seed dataset of Indian airport IATA codes + coordinates. Options: open-source OurAirports CSV, or manual seed for the ~50 airports we serve.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Out-of-zone booking attempts rejected | 100% |
| False rejection rate (valid bookings rejected) | < 0.5% |
| Time to validate pickup/drop at quote | < 50ms (p95) |
| Supplier listing completion rate with location rules | > 90% |
| Support tickets for "wrong drop location" | Reduce by 95% |

---

## Summary of Critical Invariants (to be enforced in code review)

1. **No booking may be created without server-side location validation** — client-submitted lat/lng is never trusted without validation against product rules.
2. **Fixed locations (airport origins) are never overridable by the user** — the product defines them, the frontend displays them as read-only.
3. **Cross-state drops for Goa-specific transfers must be hard-rejected** — state boundary is the outer envelope before radius check.
4. **All location validation errors must include a user-friendly `suggestion` field** — generic "invalid location" is not acceptable.
5. **Flight info is mandatory for AIRPORT_PICKUP and AIRPORT_DROP** — booking must not proceed to payment without it.
