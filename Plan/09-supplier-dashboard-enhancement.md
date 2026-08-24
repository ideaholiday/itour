# Supplier Dashboard & Product Management Enhancement Plan

**Area**: Supplier Portal — Dashboard, Product Builder, Operations  
**Priority**: High  
**Estimated Effort**: 4-5 weeks  
**Owner**: Frontend Lead + Backend Lead  

---

## Current State Assessment

### What Exists Today ✅
- **Supplier Dashboard** (`SupplierDashboardPage.jsx`, `SupplierDashboardOverview.jsx` — 37K component): KYB status banner, bookings overview, fleet panel, listings panel, payouts summary
- **Listing Chooser** (`SupplierListingChooser.jsx`): 4-category card selector — Transfers, Day Tours, Activities, Multi-Day Packages
- **Tour Product Builder** (`TourProductBuilder.jsx` — 583 lines, 4-step wizard): Basic Info → Itinerary → Pricing/Inclusions → Inventory/Booking settings with localStorage auto-save and Zod validation
- **Transfer Builder** (`SupplierTransferBuilder.jsx` — 39K): PostGIS polygon-based service area definition, vehicle category selection, hub-to-zone pricing
- **Booking Manager** (`SupplierBookingManager.jsx` — 51K): Booking list with accept/reject, driver assignment, dispatch status, OTP verification, support cases, reviews
- **Fleet Management** (`ManageFleetModal.jsx` — 16K): Add/edit drivers and vehicles
- **Block Dates** (`BlockDatesModal.jsx` — 13K): Date-based availability blocking

### What's Missing / Gaps 🔴

| Area | Gap | Impact |
|------|-----|--------|
| **Dashboard Home** | No revenue charts, no daily booking snapshot, no earnings graph | Supplier can't see business health at a glance |
| **Product Media** | Only `hero_image` and JSON `images` array — no gallery management UI, no drag-reorder, no video support | Product listings look basic vs. Viator/GetYourGuide |
| **Product Edit/Clone** | No edit mode for published products, no clone/duplicate | Supplier must create from scratch every time |
| **Inventory Calendar** | Only `blocked_dates` — no visual calendar, no per-day capacity, no time-slot management | Can't manage seasonal availability or capacity |
| **Supplier Analytics** | Zero analytics in supplier portal — no booking trends, revenue graphs, conversion data | Suppliers are blind to their own performance |
| **Bulk Operations** | No bulk publish/unpublish, no bulk price update, no seasonal pricing | Tedious for suppliers with 10+ products |
| **Product Status Workflow** | Only `PUBLISHED`/unpublished — no `DRAFT`, `PENDING_REVIEW`, `ARCHIVED` states | No staged product creation flow |
| **Multi-language Support** | No i18n for product descriptions | Limits foreign tourist appeal |
| **Mobile Responsiveness** | Dashboard is desktop-optimized, supplier components are large and dense | Indian suppliers often use mobile |
| **Notifications Center** | No in-app notification bell — only external email/WhatsApp | Supplier misses time-sensitive booking alerts |

---

## Proposed Changes

### Phase A: Supplier Dashboard Redesign (Week 1-2)

#### 1. Dashboard Home — Revenue & Booking Snapshot

**New Components**:
- `SupplierRevenueCard.jsx` — Today's earnings, weekly trend sparkline, month total, YoY growth
- `SupplierBookingSnapshot.jsx` — Today's trips (in-progress, upcoming, completed), pending assignments, expiring SLA alerts
- `SupplierPerformanceRing.jsx` — Donut chart showing completion rate, cancellation rate, average rating
- `SupplierQuickActions.jsx` — One-tap shortcuts: "New Listing", "Block Dates", "Fleet Check", "View Payouts"

**Backend API** (`/api/suppliers/:id/dashboard-stats`):
```
{
  today: { bookings: 5, revenue_inr: 42000, trips_in_progress: 2 },
  week:  { bookings: 28, revenue_inr: 235000, trend: [5, 3, 4, 6, 3, 4, 3] },
  month: { bookings: 112, revenue_inr: 920000, growth_pct: 15.2 },
  ratings: { avg: 4.7, total_reviews: 342, completion_rate: 96.5 },
  alerts: [
    { type: "SLA_EXPIRING", booking_id: "BK-1234", deadline: "2h 15m" },
    { type: "KYB_RENEWAL", days_until: 30 }
  ]
}
```

#### 2. In-App Notification Center

**New Component**: `SupplierNotificationBell.jsx`
- Real-time badge count for unread notifications
- Dropdown panel with categorized notifications (Bookings, Payments, System)
- Mark as read / mark all as read
- Link each notification to its relevant action page

**Backend**: New table `supplier_notifications` + API `GET /api/suppliers/:id/notifications`

#### 3. Dashboard Layout Overhaul

**Current**: Single-column stacked panels  
**Proposed**: Responsive grid layout

```
┌──────────────────────────────────────────────────────┐
│  Header Nav (with Notification Bell)                  │
├──────────────┬───────────────────────────────────────┤
│  Revenue     │  Today's Booking Snapshot              │
│  Card        │  (In-Progress • Upcoming • SLA Alerts) │
├──────────────┴───────────────────────────────────────┤
│  Weekly Revenue Sparkline Chart                       │
├──────────────┬───────────────────────────────────────┤
│  Performance │  Quick Actions Grid                    │
│  Ring/Score  │  (New Listing, Fleet, Dates, Payouts)  │
├──────────────┴───────────────────────────────────────┤
│  Active Listings Summary (with status badges)         │
├──────────────────────────────────────────────────────┤
│  Recent Bookings Table (last 5, with action buttons)  │
└──────────────────────────────────────────────────────┘
```

- Mobile: Stack vertically with collapsible sections
- Tablet: 2-column grid
- Desktop: Full dashboard grid

---

### Phase B: Product Builder Enhancement (Week 2-3)

#### 4. Product Status Workflow

**New statuses**: `DRAFT` → `PENDING_REVIEW` → `PUBLISHED` → `PAUSED` → `ARCHIVED`

**Database Migration**: Add `status` enum values and `submitted_at`, `reviewed_at`, `reviewer_notes` columns to `products`.

**Business Rules**:
- Supplier saves incomplete product as `DRAFT` (already partially supported via localStorage — move to DB)
- Supplier submits for review → `PENDING_REVIEW` (admin sees in moderation queue)
- Admin approves → `PUBLISHED` | Admin rejects with notes → `DRAFT` + reviewer notes shown
- Supplier pauses own listing → `PAUSED` (reversible)
- Supplier archives → `ARCHIVED` (soft-delete, recoverable for 90 days)

#### 5. Product Media Gallery Manager

**New Component**: `ProductMediaGallery.jsx`

Features:
- Drag-and-drop image reordering (first image = hero)
- Upload up to 15 images per product (currently unlimited JSON array, no upload UI)
- Image preview with crop/rotate controls
- Video upload support (YouTube embed URL or direct upload)
- Auto-generate WebP thumbnails for performance
- Alt-text input for each image (SEO + accessibility)

**Backend Changes**:
- New `product_media` table: `id, product_id, media_type (IMAGE|VIDEO), url, thumbnail_url, alt_text, sort_order, created_at`
- Image upload endpoint: `POST /api/suppliers/:id/products/:productId/media`
- Reorder endpoint: `PATCH /api/suppliers/:id/products/:productId/media/reorder`
- Cloud Storage integration (GCS bucket for production, local filesystem for dev)

#### 6. Product Edit & Clone

**Edit Mode**:
- Load existing product data into TourProductBuilder
- Show diff preview before save ("You changed price from ₹2,499 to ₹2,799")
- Version history: keep last 5 edits with timestamp and changed fields
- Route: `/supplier/tours/:productId/edit`

**Clone/Duplicate**:
- One-click clone from listings panel → opens pre-filled builder with "(Copy)" suffix
- New product ID generated, status set to `DRAFT`
- Route: `/supplier/tours/create?clone=PROD_ID`

#### 7. Inventory & Availability Calendar

**New Component**: `InventoryCalendar.jsx`

Features:
- Visual month calendar showing availability per product
- Color-coded: Green (available), Yellow (limited), Red (blocked/full), Gray (past)
- Click a date to set:
  - Available capacity (e.g., 10 seats for group tours, or 3 vehicles for transfers)
  - Custom pricing for that date (seasonal/holiday surcharge)
  - Time slots for activity-based products (9 AM, 2 PM, 5 PM departure slots)
- Bulk date selection: "Apply to all weekends", "Apply to date range"
- Integration with existing `blocked_dates` table

**Database Changes**:
- New `product_availability` table:
  ```
  id, product_id, date, capacity, booked_count, 
  price_override_inr, time_slots (JSON), 
  status (AVAILABLE|LIMITED|BLOCKED)
  ```
- New `product_time_slots` table (for activity products):
  ```
  id, product_id, slot_label, start_time, end_time, 
  max_capacity, is_active
  ```

#### 8. Bulk Product Operations

**New Component**: `ProductBulkActions.jsx`

Operations:
- Multi-select products with checkboxes
- Bulk publish / unpublish / pause / archive
- Bulk price adjustment: "Increase all by ₹500" or "Apply 10% discount"
- Bulk seasonal pricing: "Apply holiday surcharge for Dec 20 – Jan 5"
- Export product catalog as CSV/Excel

**Backend**: `POST /api/suppliers/:id/products/bulk-action` with `{ action, product_ids, params }`

---

### Phase C: Supplier Analytics Dashboard (Week 3-4)

#### 9. Supplier Performance Analytics

**New Page**: `/supplier/analytics` (`SupplierAnalyticsDashboard.jsx`)

**Sections**:

1. **Revenue Analytics**
   - Daily/weekly/monthly revenue chart (bar + line)
   - Revenue by product type (pie chart)
   - Revenue by city/destination (horizontal bar)
   - Average order value trend
   - Commission paid vs. net earnings breakdown

2. **Booking Analytics**
   - Booking volume over time (with comparison to previous period)
   - Conversion: views → bookings (from search impression data)
   - Cancellation rate and common reasons
   - Repeat customer percentage
   - Peak booking days/hours heatmap

3. **Product Performance**
   - Product leaderboard (by revenue, bookings, rating)
   - Products with declining bookings (alert)
   - Products with low ratings needing attention
   - Price comparison with similar products (if data available)

4. **Operational Metrics**
   - Average response time to booking assignments
   - SLA compliance rate
   - Driver assignment efficiency
   - OTP verification success rate
   - Support case resolution time

**Backend APIs**:
- `GET /api/suppliers/:id/analytics/revenue?period=30d`
- `GET /api/suppliers/:id/analytics/bookings?period=30d`
- `GET /api/suppliers/:id/analytics/products?sort=revenue`
- `GET /api/suppliers/:id/analytics/operations?period=30d`

---

### Phase D: Advanced Product Capabilities (Week 4-5)

#### 10. Dynamic/Seasonal Pricing Engine

- Base price + date-specific overrides
- Day-of-week pricing (weekday vs. weekend)
- Festival/holiday surge rules
- Early-bird discount (book 30+ days ahead = 10% off)
- Last-minute discount (book within 24h = 15% off if availability > 50%)
- Group discount tiers (6+ people = 5% off, 10+ = 10% off)

**Database**: New `pricing_rules` table:
```
id, product_id, rule_type (SEASONAL|DOW|EARLY_BIRD|LAST_MINUTE|GROUP),
start_date, end_date, day_of_week, min_group_size,
adjustment_type (PERCENT|FIXED), adjustment_value,
priority, is_active
```

#### 11. Product Add-Ons & Extras

Allow suppliers to offer optional add-ons with their products:

Examples:
- Photography package: +₹1,500
- Lunch at heritage restaurant: +₹800/person
- Airport lounge access: +₹500
- Travel insurance: +₹200/person
- English-speaking guide upgrade: +₹1,000

**Database**: New `product_addons` table:
```
id, product_id, addon_name, description, price_inr,
pricing_type (FLAT|PER_PERSON), max_quantity,
is_active, sort_order
```

**Frontend**: Add-on selector in checkout flow + add-on manager in product builder

#### 12. Product Combination/Bundle Offers

- Bundle multiple products: "Book Taj Sunrise + Agra Fort = Save ₹500"
- Cross-sell from activity detail page
- Supplier-defined bundles with combined pricing

#### 13. Product FAQ & Pre-Trip Information

**New Component**: `ProductFAQBuilder.jsx`

- Supplier adds FAQ items per product (What to bring? Is it wheelchair accessible? etc.)
- Pre-trip checklist items (ID required, comfortable shoes, sunscreen, etc.)
- Displayed on ActivityDetail page as expandable accordion below itinerary

**Database**: New `product_faqs` table:
```
id, product_id, question, answer, sort_order, is_active
```

#### 14. Multi-Vehicle Pricing Matrix

Currently each product has one price. Enhance for multiple vehicle categories:

```
Product: "Jaipur Full Day Sightseeing"
┌───────────────────┬───────────┬──────────┬──────────┐
│ Vehicle           │ Capacity  │ Price    │ Status   │
├───────────────────┼───────────┼──────────┼──────────┤
│ Sedan (Swift)     │ 4 pax     │ ₹2,499   │ Active   │
│ SUV (Ertiga)      │ 6 pax     │ ₹3,299   │ Active   │
│ Premium (Innova)  │ 7 pax     │ ₹4,499   │ Active   │
│ Luxury (Fortuner) │ 7 pax     │ ₹6,999   │ Active   │
│ Tempo Traveller   │ 12 pax    │ ₹8,499   │ Paused   │
└───────────────────┴───────────┴──────────┴──────────┘
```

This is partially supported via `product_pricing` variants but the UI doesn't fully expose it in the builder.

---

## Summary: New Files & Database Changes

### New Frontend Files
| File | Purpose |
|------|---------|
| `SupplierRevenueCard.jsx` | Dashboard revenue overview widget |
| `SupplierBookingSnapshot.jsx` | Today's trips summary |
| `SupplierPerformanceRing.jsx` | Donut chart — completion/rating |
| `SupplierQuickActions.jsx` | Action shortcut grid |
| `SupplierNotificationBell.jsx` | In-app notification center |
| `ProductMediaGallery.jsx` | Drag-drop image/video manager |
| `InventoryCalendar.jsx` | Visual availability calendar |
| `ProductBulkActions.jsx` | Multi-select bulk operations |
| `SupplierAnalyticsDashboard.jsx` | Full analytics page |
| `ProductFAQBuilder.jsx` | FAQ/pre-trip info editor |
| `PricingRulesEditor.jsx` | Dynamic pricing configuration |
| `ProductAddonsManager.jsx` | Add-on extras manager |

### New Database Tables
| Table | Purpose |
|-------|---------|
| `supplier_notifications` | In-app notifications for suppliers |
| `product_media` | Media gallery with sort order |
| `product_availability` | Per-date capacity + price overrides |
| `product_time_slots` | Activity departure time slots |
| `pricing_rules` | Dynamic/seasonal pricing engine |
| `product_addons` | Optional add-on extras |
| `product_faqs` | FAQ and pre-trip info |

### Modified Files
| File | Changes |
|------|---------|
| `SupplierDashboardOverview.jsx` | Integrate new dashboard widgets |
| `SupplierHeaderNav.jsx` | Add notification bell + analytics nav link |
| `TourProductBuilder.jsx` | Add media gallery step, edit/clone mode |
| `SupplierListingsPanel.jsx` | Add bulk actions, status badges, edit/clone buttons |
| `products` table | Add `submitted_at`, `reviewed_at`, `reviewer_notes` columns |
| `suppliers.js` (routes) | New analytics + notification + media endpoints |
| `Checkout.jsx` | Support add-ons selection |
| `ActivityDetail.jsx` | Show FAQ section, add-ons, media gallery |

---

## Verification Plan

### Automated Tests
- Backend: Add tests for new analytics endpoints, media upload, bulk actions, pricing rules
- E2E: Playwright journey for "Supplier creates product with media → sets availability → views analytics"

### Manual Verification
- Supplier dashboard loads with realistic data and charts render correctly
- Product media gallery supports drag-reorder and uploads
- Inventory calendar correctly blocks dates and shows booked capacity
- Bulk operations apply to selected products without affecting others
- Analytics data matches actual booking/revenue records

---

**Created**: August 2026  
**Status**: ✅ **Complete & Verified**  
**Dependencies**: Existing Plan files 01–08 (Phase 1-3 ✅ complete)
