# Backend API & Architecture Enhancement Plan

**Area**: Express Backend — API Design, Data Layer, New Capabilities  
**Priority**: Medium-High  
**Estimated Effort**: 3-4 weeks  
**Owner**: Backend Lead  

---

## Current State Assessment

### What Exists Today ✅
- **16 route files** with 808-line `suppliers.js`, comprehensive booking/checkout/admin routes
- **20 service files** covering booking, finance, notification, dispatch, reviews, support, availability, analytics
- **Dual database engine** (SQLite dev / PostgreSQL production) with versioned migrations
- **Full auth/RBAC** with Zod validation, audit logging, redacted logging
- **100 backend tests**, 80.3% coverage, integration tests, E2E suites
- **Metrics & observability** with Prometheus, Winston, Grafana dashboards

### What's Missing / Gaps 🔴

| Area | Gap | Impact |
|------|-----|--------|
| **API Versioning** | No versioning — all routes at `/api/*` | Can't evolve APIs without breaking clients |
| **Pagination** | Some endpoints paginated, many return all records | Performance degrades with data growth |
| **Rate Limiting (per-supplier)** | Global rate limiter only — no per-entity throttling | One hyperactive client can exhaust limits for all |
| **File Upload** | No file upload infrastructure — images are external URLs | Can't host product images, KYB documents |
| **Caching Layer** | No Redis/in-memory cache — every request hits DB | Search and listing pages make redundant queries |
| **Webhook Management** | Razorpay/PhonePe webhooks exist — but no retry/dead-letter queue | Failed webhooks silently lost |
| **Batch/Async Operations** | All operations synchronous — no job queue | Payout batching, bulk operations block request |
| **Search Sophistication** | Basic SQL LIKE queries — no full-text search, no relevance scoring | Poor search quality at scale |
| **Data Export** | No CSV/Excel export for supplier/admin data | Manual reporting is tedious |
| **API Documentation** | No OpenAPI/Swagger spec | Developers must read route files to understand API |

---

## Proposed Changes

### Phase A: API Foundation (Week 1)

#### 1. API Versioning Strategy

**Approach**: URL-based versioning (`/api/v1/*`)

```
/api/v1/activities     — Current stable API
/api/v2/activities     — Future enhanced API (when needed)
/api/health           — Unversioned (infrastructure endpoints)
/api/metrics          — Unversioned
/api/webhooks/*       — Unversioned (provider-determined)
```

**Implementation**:
- Mount all current routes under `/api/v1/`
- Keep `/api/*` as alias for `/api/v1/*` (backward compatibility)
- Deprecation header: `Sunset: [date]` when v1 will be removed
- Version-specific validation schemas

#### 2. Standardized Pagination & Filtering

**Universal Pagination Contract**:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 342,
    "totalPages": 18,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Query Parameters**: `?page=1&limit=20&sort=created_at&order=desc`

**Apply to all list endpoints**:
- `GET /api/v1/activities` — currently returns all
- `GET /api/v1/suppliers/:id/bookings` — currently returns all
- `GET /api/v1/admin/suppliers` — currently returns all
- `GET /api/v1/admin/bookings` — currently returns all
- All new endpoints (wishlists, notifications, search history)

**Filtering**:
```
GET /api/v1/activities?category=DAY_TOUR&city=Jaipur&minPrice=1000&maxPrice=5000&rating=4.5&sort=price&order=asc&page=1&limit=20
```

#### 3. OpenAPI/Swagger Documentation

**Auto-generate from route definitions** using `swagger-jsdoc`:

- Document all 50+ endpoints with request/response schemas
- Include authentication requirements
- Add example requests and responses
- Serve interactive docs at `/api/docs` (only in dev/staging)
- Generate TypeScript types from schema (for frontend type safety)

**Benefits**:
- Self-documenting API
- Auto-generated client SDKs
- Contract testing against schema
- Onboarding new developers faster

---

### Phase B: Data Infrastructure (Week 2)

#### 4. Redis Caching Layer

**Cache Strategy**:

| Data | TTL | Invalidation | Pattern |
|------|-----|--------------|---------|
| Search results | 5 min | On new product publish | Cache-aside |
| Product detail | 10 min | On product update | Cache-aside |
| Destination list | 1 hour | On destination change | Cache-aside |
| Supplier profile | 5 min | On profile update | Write-through |
| Analytics aggregates | 15 min | On new booking | TTL |
| Session data | 24 hours | On logout | Explicit delete |

**Implementation**:
- `cacheService.js` with `get(key)`, `set(key, value, ttl)`, `del(key)`, `invalidatePattern(pattern)`
- Redis for production, in-memory Map for development
- Cache keys: `products:list:jaipur:DAY_TOUR:p1`, `product:detail:PROD_123`, `supplier:profile:SUP_456`
- Cache hit/miss metrics emitted to Prometheus

#### 5. File Upload Infrastructure

**Requirements**:
- Product images (15 per product, max 5MB each)
- KYB documents (PAN, GST cert, bank proof — max 10MB each)
- User profile photos (max 2MB)
- Review photos (max 5MB each)

**Implementation**:

**Development**: Local filesystem storage at `backend/uploads/`  
**Production**: Google Cloud Storage bucket (`idea-holiday-media`)

```
POST /api/v1/uploads
Content-Type: multipart/form-data

Response:
{
  "id": "media_abc123",
  "url": "https://storage.googleapis.com/idea-holiday-media/products/IMG_abc.webp",
  "thumbnail_url": "https://storage.googleapis.com/.../products/IMG_abc_thumb.webp",
  "size_bytes": 245000,
  "mime_type": "image/webp"
}
```

**Processing Pipeline**:
1. Receive upload via Multer middleware
2. Validate file type (JPEG, PNG, WebP, PDF for docs) and size
3. Strip EXIF metadata (privacy)
4. Generate WebP version + thumbnail (using Sharp)
5. Upload to GCS (or save locally in dev)
6. Store metadata in `uploads` table
7. Return signed URL

**Security**:
- Virus scanning via ClamAV (production)
- File type validation (magic bytes, not just extension)
- Rate limit: 10 uploads per minute per user
- Max total storage per supplier: 500MB

#### 6. Full-Text Search Engine

**Current**: SQL `LIKE '%term%'` — no relevance, no fuzzy matching  
**Proposed**: Two options depending on scale:

**Option A (Medium scale, < 10K products)**: SQLite FTS5 / PostgreSQL `tsvector`
```sql
-- PostgreSQL full-text search
SELECT *, ts_rank(search_vector, plainto_tsquery('english', $1)) as relevance
FROM products
WHERE search_vector @@ plainto_tsquery('english', $1)
ORDER BY relevance DESC
LIMIT 20;
```

**Option B (Large scale, > 10K products)**: Meilisearch or Typesense
- Sub-50ms search with typo tolerance
- Faceted filtering (category, city, price range)
- Geo-search (find experiences near lat/lng)
- Synonym handling ("cab" = "car" = "taxi")

**Recommendation**: Start with Option A (native PostgreSQL FTS), migrate to Option B when product catalog exceeds 10K.

---

### Phase C: New API Capabilities (Week 3)

#### 7. Job Queue for Async Operations

**Use Case**: Operations that shouldn't block HTTP requests:
- Payout batch processing
- Bulk product operations (publish/unpublish 50 products)
- Email/WhatsApp sending (already partially async)
- Image processing (resize, thumbnail generation)
- Report generation (CSV/PDF export)
- Webhook retry on failure

**Implementation**: BullMQ with Redis

```
Queue: "notifications"  → Workers: send email, WhatsApp
Queue: "media"          → Workers: image resize, thumbnail, upload to GCS
Queue: "finance"        → Workers: payout batch, reconciliation
Queue: "exports"        → Workers: CSV generation, PDF reports
Queue: "webhooks"       → Workers: retry failed webhook deliveries
```

**Job Dashboard**: Admin can view queue health at `/admin/queues`

#### 8. Webhook Reliability

**Current**: One-shot webhook handler — if processing fails, event is lost  
**Proposed**: Robust webhook pipeline

1. **Receive** webhook → immediately return 200
2. **Store** raw payload in `webhook_events` table
3. **Process** asynchronously via job queue
4. **Retry** on failure (exponential backoff: 1s, 10s, 60s, 300s)
5. **Dead-letter** after 5 failures → alert operations team
6. **Replay**: Admin can manually replay failed webhooks

**Database**: New `webhook_events` table:
```
id, provider (RAZORPAY|PHONEPAY|META), 
event_type, payload (JSON), signature,
status (RECEIVED|PROCESSING|PROCESSED|FAILED|DEAD_LETTER),
attempts, last_error, processed_at, created_at
```

#### 9. Data Export Engine

**Exportable Data**:
- Bookings list (filtered by date, status, product)
- Revenue report (daily/weekly/monthly breakdown)
- Supplier product catalog
- Customer list
- Reviews & ratings
- Support case history
- Payout statements

**Format**: CSV (default), Excel (.xlsx), PDF (for statements)

**API**: `POST /api/v1/exports`
```json
{
  "type": "bookings",
  "format": "csv",
  "filters": { "from": "2026-01-01", "to": "2026-08-23", "status": "completed" }
}
```

Response:
```json
{
  "job_id": "export_abc123",
  "status": "processing",
  "eta_seconds": 30
}
```

Poll: `GET /api/v1/exports/export_abc123` → returns download URL when ready

#### 10. Real-Time Events (WebSocket/SSE)

**Use Cases**:
- Supplier receives new booking alert immediately
- Driver assignment update pushes to supplier dashboard
- Booking status change pushes to traveler's My Trips
- Admin sees new support cases in real-time
- Live trip tracking updates

**Implementation**: Server-Sent Events (SSE) — simpler than WebSocket, works through proxies

```
GET /api/v1/events/stream
Authorization: Bearer <token>

data: {"type": "NEW_BOOKING", "booking_id": "BK-1234", "product": "Taj Sunrise Tour"}
data: {"type": "BOOKING_STATUS", "booking_id": "BK-1234", "status": "driver_assigned"}
data: {"type": "PAYOUT_PROCESSED", "amount_inr": 15000}
```

**Channels**:
- `supplier:{id}` — Supplier-specific events
- `traveler:{id}` — Traveler-specific events
- `ops:global` — All operations events
- `admin:global` — All admin events

---

### Phase D: Data Layer & Performance (Week 4)

#### 11. Database Indexing Strategy

**Critical Missing Indices** (based on common query patterns):

```sql
-- Product search performance
CREATE INDEX idx_products_city_category ON products(city, category) WHERE is_published = 1;
CREATE INDEX idx_products_supplier_status ON products(supplier_id, status);
CREATE INDEX idx_products_price ON products(price_inr) WHERE is_published = 1;

-- Booking lookups
CREATE INDEX idx_bookings_user_status ON bookings(user_id, status);
CREATE INDEX idx_bookings_supplier_date ON bookings(supplier_id, activity_date);
CREATE INDEX idx_bookings_status_date ON bookings(status, activity_date);

-- Support cases
CREATE INDEX idx_support_cases_user ON support_cases(created_by_user_id, status);
CREATE INDEX idx_support_cases_booking ON support_cases(booking_id);

-- Reviews
CREATE INDEX idx_reviews_product ON reviews(product_id, status);
CREATE INDEX idx_reviews_supplier ON reviews(supplier_id);

-- Notifications
CREATE INDEX idx_notifications_user_read ON supplier_notifications(supplier_id, read);
```

**Query Performance Monitoring**:
- Log queries taking > 100ms
- Monthly index analysis to add/remove indices
- Explain plan for all new queries during code review

#### 12. Database Connection Optimization

**Production (PostgreSQL via Supabase)**:
- Connection pool: min 5, max 20, idle timeout 30s
- Read replica routing for heavy queries (analytics, search, export)
- Prepared statements for frequent queries
- Query timeout: 30s for normal queries, 120s for reports

**Development (SQLite)**:
- WAL mode for concurrent reads
- Busy timeout: 5000ms
- Journal mode: WAL
- Foreign keys enforcement

#### 13. API Response Compression

- Enable `compression` middleware for responses > 1KB
- Brotli compression for modern browsers
- Gzip fallback
- Exclude binary content (images, PDFs)
- Expected improvement: 60-70% response size reduction for JSON payloads

---

## Summary: New Files & Changes

### New Backend Files
| File | Purpose |
|------|---------|
| `services/cacheService.js` | Redis/in-memory caching layer |
| `services/uploadService.js` | File upload + processing pipeline |
| `services/searchService.js` | Full-text search engine |
| `services/exportService.js` | Data export (CSV/Excel/PDF) |
| `services/jobQueueService.js` | BullMQ job queue management |
| `services/sseService.js` | Server-Sent Events for real-time |
| `middleware/pagination.js` | Universal pagination middleware |
| `middleware/cache.js` | Route-level cache middleware |
| `middleware/upload.js` | Multer file upload middleware |
| `routes/uploads.js` | File upload API routes |
| `routes/exports.js` | Data export API routes |
| `routes/events.js` | SSE event stream route |
| `config/swagger.js` | OpenAPI documentation config |

### New Database Tables
| Table | Purpose |
|-------|---------|
| `uploads` | File upload metadata |
| `webhook_events` | Raw webhook payload store |
| `export_jobs` | Async export job tracking |

### Modified Files
| File | Changes |
|------|---------|
| `server.js` | API versioning mount, compression, SSE |
| All route files | Add pagination, cache headers, v1 prefix |
| `db.js` | Add new indices, FTS setup |
| `package.json` | Add Redis, BullMQ, Sharp, swagger-jsdoc deps |

---

## Verification Plan

### Automated Tests
- Cache service: test set/get/invalidate/TTL expiry
- Pagination: test boundary conditions (page 0, last page, empty results)
- File upload: test size limits, type validation, processing pipeline
- Search: test relevance ranking, typo tolerance, empty results
- Job queue: test retry logic, dead-letter handling

### Performance Benchmarks
- Search endpoint: < 50ms P95 with cache, < 200ms P95 without
- File upload: < 3s for 5MB image (including processing)
- Export: < 30s for 10K row CSV export
- SSE connection: < 100ms to establish, < 50ms event delivery

---

**Created**: August 2026  
**Status**: ✅ **Complete & Verified**  
**Dependencies**: 
- Plan 06 (Database scaling) ✅ complete
- Plan 04 (Performance optimization) ✅ complete
- Redis infrastructure (new dependency)
