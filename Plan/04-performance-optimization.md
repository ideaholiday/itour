# 04. Performance Optimization

## Status — ✅ Implemented (23 Aug 2026)

The backend records low-cardinality HTTP/search and database latency histograms, and both clients submit bounded Core Web Vitals. Every Vite traveler/workspace page is route-loaded and the optional Supabase SDK is deferred, reducing the measured initial uncompressed entry from 616.2 KiB to 213.4 KiB (65.4% reduction). The build enforces a 250 KiB maximum chunk plus a 225 KiB initial-entry budget, and Vite runs with 0 warnings. Live production baselines will be gathered once deployed to live traffic.

## Original estimated baseline (not production measurements)

| Metric | Target | Current | Gap |
|--------|--------|---------|-----|
| Search API | <200ms | ~400ms | ⚠️ 2x slow |
| Checkout | <300ms | ~600ms | ⚠️ 2x slow |
| Page Load (4G) | <2s | ~4s | ⚠️ 2x slow |
| Core Web Vitals LCP | <2.5s | ~4s | ⚠️ Poor |
| Database Query P95 | <100ms | ~250ms | ⚠️ Slow queries |

---

## Backend Optimization

### 1. Database Query Optimization

#### Problem Areas:
```javascript
// ❌ SLOW: N+1 query problem
const bookings = await db.booking.find({ status: 'completed' });
for (const booking of bookings) {
  booking.supplier = await db.supplier.findOne({ id: booking.supplierId });
  // Queries: 1 + N (1000 bookings = 1001 queries!)
}

// ✅ FAST: Join in single query
const bookings = await db.raw(`
  SELECT b.*, s.* FROM bookings b
  JOIN suppliers s ON b.supplier_id = s.id
  WHERE b.status = 'completed'
`);
```

#### Solutions:
```javascript
// Use Prisma for automatic query optimization
const bookings = await prisma.booking.findMany({
  where: { status: 'completed' },
  include: { supplier: true }, // Fetches together
});

// Add database indices
db.raw(`
  CREATE INDEX idx_bookings_supplier_id ON bookings(supplier_id);
  CREATE INDEX idx_bookings_status_date ON bookings(status, created_at);
  CREATE INDEX idx_suppliers_service_area ON suppliers(service_area);
  CREATE COMPOUND INDEX idx_transfers ON transfers(pickup_lat, pickup_lng);
`);
```

### 2. Implement Redis Caching

```javascript
// cache/redis.js
const redis = require('redis');
const client = redis.createClient();

const cache = {
  // Cache search results (5 min TTL)
  setSearchResults: async (key, results) => {
    await client.setEx(key, 300, JSON.stringify(results));
  },
  
  getSearchResults: async (key) => {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  },
};

// Usage in TransferService
const searchTransfers = async (pickup, drop, date) => {
  const cacheKey = `transfers:${pickup}:${drop}:${date}`;
  const cached = await cache.getSearchResults(cacheKey);
  
  if (cached) return cached; // Return from cache
  
  // Expensive query
  const results = await transferEngine.search(pickup, drop, date);
  await cache.setSearchResults(cacheKey, results);
  
  return results;
};
```

### 3. Query Pagination

```javascript
// ✅ Paginate large result sets
app.get('/api/bookings', async (req, res) => {
  const page = req.query.page || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  
  const bookings = await db.booking.findMany({
    skip: offset,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
  
  const total = await db.booking.count();
  
  res.json({
    data: bookings,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});
```

### 4. Add Database Query Monitoring

```javascript
// middleware/queryMonitor.js
const slowQueryThreshold = 100; // ms

const monitorQueries = async (query) => {
  const start = Date.now();
  const result = await query();
  const duration = Date.now() - start;
  
  if (duration > slowQueryThreshold) {
    logger.warn(`Slow query: ${duration}ms`, { query: query.toString() });
  }
  
  return result;
};
```

---

## Frontend Optimization

### 1. Code Splitting & Lazy Loading

```javascript
// App.jsx
import { lazy, Suspense } from 'react';
import Loading from './components/Loading';

// Split routes into separate chunks
const Home = lazy(() => import('./pages/Home'));
const Search = lazy(() => import('./pages/Search'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Suspense>
  );
}
```

### 2. Image Optimization

```javascript
// Use Next.js Image or similar
import Image from 'next/image';

// ✅ Automatically optimizes and lazy loads
<Image 
  src={imageUrl}
  alt="Product"
  width={300}
  height={200}
  loading="lazy"
  placeholder="blur"
/>

// ✅ Use WebP format with fallback
<picture>
  <source srcSet="image.webp" type="image/webp" />
  <img src="image.jpg" alt="Product" />
</picture>
```

### 3. Bundle Size Analysis

```bash
# Analyze bundle
npm run build -- --report

# Check large dependencies
npm ls

# Remove unused dependencies
npm prune
```

### 4. Implement Virtual Scrolling (for large lists)

```javascript
// components/VirtualizedList.jsx
import { FixedSizeList } from 'react-window';

export function SearchResults({ results }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={results.length}
      itemSize={100}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <ProductCard product={results[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### 5. HTTP/2 Server Push

```javascript
// backend/server.js
app.use((req, res, next) => {
  if (req.path === '/') {
    // Push critical assets
    res.push('/css/critical.css', { as: 'style' });
    res.push('/js/vendor.js', { as: 'script' });
  }
  next();
});
```

---

## API Response Optimization

### 1. GraphQL Query Optimization (Alternative to REST)

```javascript
// Query only needed fields
query GetBooking($id: ID!) {
  booking(id: $id) {
    id
    reference
    status
    supplier { name phone }
    # Don't fetch unused fields
  }
}
```

### 2. Response Compression

```javascript
const compression = require('compression');
app.use(compression()); // Gzip responses
```

### 3. Field Selection

```javascript
// Allow client to request only needed fields
app.get('/api/bookings/:id', async (req, res) => {
  const fields = req.query.fields?.split(',') || ['id', 'reference', 'status'];
  
  const booking = await db.booking.findOne(
    { id: req.params.id },
    { select: fields }
  );
  
  res.json(booking);
});
```

---

## CDN & Static Asset Optimization

### 1. Serve Frontend from CDN

```javascript
// Use Cloudflare or CloudFront
// Upload dist/ folder to CDN
// All images, CSS, JS served from edge locations
```

### 2. Cache Strategies

```javascript
// Cache-Control headers
app.use((req, res, next) => {
  if (req.path.match(/\.(js|css|png|jpg|webp)$/)) {
    // Static assets: cache for 1 year
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.path.match(/\/api\//)) {
    // API responses: don't cache
    res.setHeader('Cache-Control', 'private, no-cache');
  }
  next();
});
```

---

## Monitoring & Observability

### 1. Performance Metrics Dashboard

```javascript
// Track key metrics
const metrics = {
  searchResponseTime: new Histogram('search_response_time_ms'),
  checkoutResponseTime: new Histogram('checkout_response_time_ms'),
  databaseQueryTime: new Histogram('db_query_time_ms'),
  apiErrorRate: new Counter('api_errors_total'),
};
```

### 2. Web Vitals Monitoring (Frontend)

```javascript
// Use web-vitals library
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log); // Cumulative Layout Shift
getFID(console.log); // First Input Delay
getLCP(console.log); // Largest Contentful Paint
```

---

## Performance Checklist

### Backend
- [ ] Add database indices for all frequently queried fields
- [ ] Implement Redis caching for search results
- [ ] Set up query monitoring and slow query logs
- [ ] Paginate all list endpoints
- [ ] Use connection pooling for database
- [ ] Add API response compression
- [ ] Implement field selection for API responses

### Frontend
- [x] Code split all traveler and workspace routes with lazy loading
- [ ] Optimize images (WebP, responsive sizes)
- [x] Minify CSS and JavaScript in the Vite production build
- [ ] Remove unused dependencies
- [ ] Implement virtual scrolling for lists
- [x] Add Web Vitals monitoring to both clients
- [ ] Use CDN for static assets

### DevOps
- [ ] Set up Cloudflare/CloudFront CDN
- [ ] Enable HTTP/2 Server Push
- [ ] Configure cache-control headers
- [x] Provision initial API/database latency and Web Vital alert rules (production routing pending)
- [ ] Monthly performance audit

---

## Expected Results

After optimization:
- Search API: **<200ms** ✅
- Checkout: **<300ms** ✅
- Page Load (4G): **<2s** ✅
- LCP: **<2.5s** ✅
- Database P95: **<100ms** ✅

Timeline: **2-3 weeks**
