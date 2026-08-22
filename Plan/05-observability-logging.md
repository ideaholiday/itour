# 05. Observability & Logging

## Implementation checkpoint — 22 Aug 2026

Winston JSON logging to stdout is implemented for direct Cloud Run ingestion. Requests include correlation ID, normalized route, method, status, latency, actor context, and slow/error severity. Recursive redaction covers credentials, authorization/cookies, OTPs, payment/bank/card fields, email, phone, PAN/GST, and provider secrets; bodies remain disabled unless explicitly enabled. Runtime backend `console.*` calls were removed, and API errors no longer expose stacks or provider messages.

No Google logging transport or separate logging credentials are required. Metrics, Prometheus/Grafana, tracing, dashboards, and alerting remain open roadmap work. The original target design below is retained for those later slices.

## Current State
- ❌ console.log scattered throughout code
- ❌ No structured logging
- ❌ No metrics collection
- ❌ No distributed tracing
- ❌ No alerting on errors

## Target State

```
┌─────────────────────────────────────┐
│  Application Code                   │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌─────────────┐   ┌──────────────────┐
│  Logs       │   │  Metrics         │
│  (Winston)  │   │  (Prometheus)    │
└─────────────┘   └──────────────────┘
    │                     │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │                     │
    ▼                     ▼
┌─────────────────┐  ┌────────────────┐
│  Cloud Logging  │  │  Grafana       │
│  (GCP)          │  │  Dashboard     │
└─────────────────┘  └────────────────┘
```

---

## 1. Structured Logging

### Setup Winston Logger

```javascript
// config/logger.js
const winston = require('winston');
const CloudLoggingTransport = require('@google-cloud/logging-winston').LoggingWinston;

const cloudLogging = new CloudLoggingTransport({
  projectId: process.env.GCP_PROJECT_ID,
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: {
    service: 'idea-holiday-api',
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, ...meta }) =>
            `${timestamp} [${level}]: ${message} ${JSON.stringify(meta)}`
        )
      ),
    }),
    cloudLogging, // Production logging
  ],
});

module.exports = logger;
```

### Log Levels & Usage

```javascript
// Different severity levels
logger.error('Payment verification failed', {
  bookingId,
  paymentId,
  error: error.message,
  stack: error.stack,
});

logger.warn('High latency detected', {
  endpoint: '/api/transfers/search',
  duration: 450, // ms
  threshold: 200,
});

logger.info('Booking created successfully', {
  bookingId,
  supplierId,
  amount: 5000,
  currency: 'INR',
});

logger.debug('Cache hit', {
  cacheKey,
  ttl: 300,
});
```

### Middleware for Request/Response Logging

```javascript
// middleware/requestLogger.js
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userId: req.user?.id,
      userRole: req.user?.role,
      params: req.params,
      // Redact sensitive fields
      body: redactSensitive(req.body),
    });
    
    // Alert on slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        path: req.path,
        duration,
      });
    }
  });
  
  next();
};

const redactSensitive = (obj) => {
  const sensitiveKeys = ['password', 'token', 'otp', 'card', 'cvv'];
  const copy = JSON.parse(JSON.stringify(obj || {}));
  
  sensitiveKeys.forEach(key => {
    if (copy[key]) copy[key] = '***REDACTED***';
  });
  
  return copy;
};
```

### Audit Logging for Sensitive Operations

```javascript
// services/AuditService.js
const auditLog = async (action, user, resource, changes, context) => {
  logger.info(`AUDIT: ${action}`, {
    action, // 'CREATE_BOOKING', 'PROCESS_REFUND', 'APPROVE_SUPPLIER'
    actorId: user.id,
    actorRole: user.role,
    resourceType: resource.type,
    resourceId: resource.id,
    changes, // { before: {}, after: {} }
    ip: context.ip,
    userAgent: context.userAgent,
    timestamp: new Date().toISOString(),
  });
  
  // Also store in database for compliance
  await db.auditLog.create({
    action, actorId: user.id, resourceType: resource.type,
    resourceId: resource.id, changes, ip: context.ip, timestamp: new Date(),
  });
};

// Usage
await auditLog(
  'PROCESS_REFUND',
  req.user,
  { type: 'booking', id: bookingId },
  { status: 'pending -> processed', amount: 5000 },
  { ip: req.ip, userAgent: req.headers['user-agent'] }
);
```

---

## 2. Metrics Collection (Prometheus)

### Setup Prometheus Client

```javascript
// config/metrics.js
const promClient = require('prom-client');

// Default metrics
promClient.collectDefaultMetrics();

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [50, 100, 200, 500, 1000, 2000],
});

const searchResponseTime = new promClient.Histogram({
  name: 'search_response_time_ms',
  help: 'Transfer search response time',
  labelNames: ['product_type'],
  buckets: [50, 100, 150, 200, 300, 500],
});

const bookingCreated = new promClient.Counter({
  name: 'booking_created_total',
  help: 'Total bookings created',
  labelNames: ['product_type', 'supplier_id'],
});

const paymentProcessed = new promClient.Counter({
  name: 'payment_processed_total',
  help: 'Total payments processed',
  labelNames: ['gateway', 'status'],
});

const refundProcessed = new promClient.Counter({
  name: 'refund_processed_total',
  help: 'Total refunds processed',
  labelNames: ['reason', 'status'],
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
});

const databaseQueryTime = new promClient.Histogram({
  name: 'db_query_duration_ms',
  help: 'Database query execution time',
  labelNames: ['table', 'operation'],
  buckets: [10, 25, 50, 100, 250, 500],
});

module.exports = {
  httpRequestDuration,
  searchResponseTime,
  bookingCreated,
  paymentProcessed,
  refundProcessed,
  activeConnections,
  databaseQueryTime,
};
```

### Use Metrics in Code

```javascript
// In route handlers
const { searchResponseTime, bookingCreated } = require('./config/metrics');

app.get('/api/transfers/search', async (req, res) => {
  const start = Date.now();
  
  const results = await transferService.search(req.body);
  
  const duration = Date.now() - start;
  searchResponseTime.observe({ product_type: 'transfer' }, duration);
  
  res.json(results);
});

// In booking service
const createBooking = async (booking) => {
  const { id, productId, supplierId } = booking;
  
  // ... create logic ...
  
  bookingCreated.inc({
    product_type: booking.productType,
    supplier_id: supplierId,
  });
  
  return id;
};

// In payment service
const processPayment = async (gateway, payment) => {
  try {
    // ... process logic ...
    paymentProcessed.inc({ gateway, status: 'success' });
  } catch (error) {
    paymentProcessed.inc({ gateway, status: 'failed' });
    throw error;
  }
};
```

### Expose Metrics Endpoint

```javascript
// routes/metrics.js
const express = require('express');
const promClient = require('prom-client');

const router = express.Router();

router.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

module.exports = router;
```

---

## 3. Distributed Tracing

### Setup OpenTelemetry

```javascript
// config/tracing.js
const { NodeTracer } = require('@opentelemetry/node');
const { W3CTraceContextPropagator } = require('@opentelemetry/core');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { BatchSpanProcessor } = require('@opentelemetry/tracing');

const tracer = new NodeTracer({
  serviceName: 'idea-holiday-api',
  plugins: {
    http: require('@opentelemetry/plugin-http'),
    express: require('@opentelemetry/plugin-express'),
    pg: require('@opentelemetry/plugin-pg'),
  },
});

const jaegerExporter = new JaegerExporter({
  host: process.env.JAEGER_HOST || 'localhost',
  port: process.env.JAEGER_PORT || 6831,
});

tracer.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));

module.exports = tracer;
```

### Trace Key Operations

```javascript
// services/BookingService.js
const tracer = require('../config/tracing');

const createBooking = async (booking) => {
  const span = tracer.startSpan('createBooking');
  span.setAttributes({
    'booking.product_type': booking.productType,
    'booking.supplier_id': booking.supplierId,
  });
  
  try {
    const savedBooking = await db.booking.create(booking);
    span.setStatus({ code: 'OK' });
    return savedBooking;
  } catch (error) {
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
};
```

---

## 4. Alerting

### Setup Alert Rules

```yaml
# prometheus-rules.yaml
groups:
  - name: idea_holiday_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} per second"
      
      - alert: SlowSearchAPI
        expr: histogram_quantile(0.95, search_response_time_ms) > 500
        for: 5m
        annotations:
          summary: "Search API is slow"
          description: "P95 latency: {{ $value }}ms"
      
      - alert: PaymentFailureSpike
        expr: rate(payment_processed_total{status="failed"}[5m]) > 0.1
        for: 2m
        annotations:
          summary: "Payment failures spiking"
          description: "Failure rate: {{ $value }} per second"
      
      - alert: DatabaseSlowQueries
        expr: histogram_quantile(0.99, db_query_duration_ms) > 250
        for: 5m
        annotations:
          summary: "Database queries are slow"
          description: "P99 query time: {{ $value }}ms"
```

### Send Alerts to Slack/PagerDuty

```javascript
// config/alerting.js
const axios = require('axios');

const sendAlert = async (alert) => {
  await axios.post(process.env.SLACK_WEBHOOK_URL, {
    text: `🚨 Alert: ${alert.summary}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.summary}*\n${alert.description}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Service: ${alert.service}\nTime: ${new Date().toISOString()}`,
        },
      },
    ],
  });
};

module.exports = { sendAlert };
```

---

## 5. Dashboards (Grafana)

### Key Dashboards to Create

#### 1. API Health Dashboard
```
┌──────────────────────────────────────────┐
│ API Health                               │
├────────────────┬────────────────┬────────┤
│ Requests/sec   │ Error Rate     │ Uptime │
│ 450            │ 0.2%           │ 99.8%  │
├────────────────┴────────────────┴────────┤
│ Response Time (P95)    │ Active Requests   │
│ 150ms                  │ 245               │
├──────────────────────────────────────────┤
│ Request Rate by Endpoint                 │
│ /search: 120/s, /checkout: 45/s          │
└──────────────────────────────────────────┘
```

#### 2. Business Metrics Dashboard
```
┌──────────────────────────────────────────┐
│ Business Metrics                         │
├────────────────┬────────────────┬────────┤
│ Bookings (24h) │ Revenue (24h)  │ Conv.  │
│ 1,250          │ ₹62,50,000     │ 4.2%   │
├────────────────┴────────────────┴────────┤
│ Avg Booking Value      │ Cancellations    │
│ ₹5,000                 │ 3.2%             │
├──────────────────────────────────────────┤
│ Top Products                             │
│ Day Tours: 45%, Transfers: 40%, Packages:│
└──────────────────────────────────────────┘
```

#### 3. Performance Dashboard
```
┌──────────────────────────────────────────┐
│ Performance                              │
├────────────────┬────────────────┬────────┤
│ Search <200ms  │ Checkout <300ms│ P95    │
│ 85% ✅         │ 92% ✅         │ 180ms  │
├────────────────┴────────────────┴────────┤
│ Database P99   │ Cache Hit Rate │ Memory │
│ 120ms          │ 72%            │ 1.2GB  │
└──────────────────────────────────────────┘
```

---

## Implementation Checklist

### Week 1: Logging
- [ ] Set up Winston logger
- [ ] Add request/response logging
- [ ] Redact sensitive data in logs
- [ ] Add audit logging
- [ ] Deploy to Cloud Logging

### Week 2: Metrics
- [ ] Set up Prometheus
- [ ] Add custom metrics (search, booking, payment)
- [ ] Expose /metrics endpoint
- [ ] Set up scraping schedule

### Week 3: Tracing & Dashboards
- [ ] Set up Jaeger/OpenTelemetry
- [ ] Create Grafana dashboards
- [ ] Add alerting rules
- [ ] Connect Slack integration

### Week 4: Monitoring & On-call
- [ ] Document alert playbooks
- [ ] Set up on-call rotation
- [ ] Weekly metrics review
- [ ] Optimize based on data

---

## Key Metrics to Track

### Availability
- Uptime %
- Error rate by endpoint
- Response time (P50, P95, P99)

### Business
- Bookings per hour/day
- Revenue (24h, 7d, 30d)
- Conversion rate (search → booking)
- Cancellation rate
- Average booking value

### Operations
- Supplier response SLA compliance
- Driver assignment time
- OTP verification success rate
- Refund processing time

### Infrastructure
- Database connection pool utilization
- Cache hit rate
- Server CPU/Memory
- Network bandwidth

---

## Success Criteria

- ✅ All logs structured and searchable
- ✅ Metrics collected for all critical paths
- ✅ Dashboards updated in real-time
- ✅ Alerts notify team within 5 min
- ✅ <1% observability overhead
- ✅ >90% trace capture rate

Timeline: **2-3 weeks**
