# 08. Analytics & Business Intelligence

## Current State
- ❌ No analytics dashboard
- ❌ No KPI tracking
- ❌ No cohort analysis
- ❌ No supplier performance metrics
- ❌ No revenue insights

---

## 1. Core KPIs to Track

### Business Metrics

```
┌─────────────────────────────────────────────────────────┐
│ Daily / Weekly / Monthly Overview                       │
├────────────────────┬────────────────────┬───────────────┤
│ Total Bookings     │ Revenue (₹)         │ Avg Value (₹) │
│ 1,250 (↑ 12%)      │ ₹62,50,000 (↑ 15%) │ ₹5,000 (→)    │
├────────────────────┼────────────────────┼───────────────┤
│ Conversion Rate    │ Cancellations      │ Refund Rate   │
│ 4.2% (↓ 0.5%)      │ 3.2%               │ 1.8%          │
├────────────────────┼────────────────────┼───────────────┤
│ Completed Trips    │ Active Suppliers   │ Repeat Customers
│ 1,210 (96.8%)      │ 287 (↑ 5)          │ 42% of total  │
└────────────────────┴────────────────────┴───────────────┘
```

### Key Formulas

```javascript
// Conversion Rate
conversionRate = (completedBookings / searchEvents) * 100

// Average Order Value
AOV = totalRevenue / totalBookings

// Customer Lifetime Value
CLV = (avgOrderValue * purchaseFrequency) / (1 - retentionRate)

// Cost of Acquisition
CAC = marketingSpend / newCustomers

// Return on Ad Spend
ROAS = revenue / adSpend
```

---

## 2. Analytics Data Warehouse

### Setup BigQuery for Analytics

```sql
-- Create analytics dataset
CREATE SCHEMA marketplace_analytics;

-- Event tracking table
CREATE TABLE marketplace_analytics.events (
  event_id STRING,
  event_name STRING,
  event_timestamp TIMESTAMP,
  user_id STRING,
  session_id STRING,
  event_properties JSON,
  device_info JSON,
  geographic_info JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(event_timestamp)
CLUSTER BY user_id, event_name;

-- Bookings fact table
CREATE TABLE marketplace_analytics.bookings_fact (
  booking_id STRING,
  date_key INT,
  user_id STRING,
  product_type STRING,
  destination STRING,
  supplier_id STRING,
  booking_amount DECIMAL(10, 2),
  commission_amount DECIMAL(10, 2),
  supplier_payout DECIMAL(10, 2),
  status STRING,
  created_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  refund_amount DECIMAL(10, 2),
  refund_reason STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY user_id, supplier_id;

-- Users dimension table
CREATE TABLE marketplace_analytics.users_dim (
  user_id STRING PRIMARY KEY,
  signup_date DATE,
  first_booking_date DATE,
  total_bookings INT,
  total_spent DECIMAL(12, 2),
  city STRING,
  device_type STRING,
  traffic_source STRING,
  last_active_date DATE
);

-- Suppliers dimension table
CREATE TABLE marketplace_analytics.suppliers_dim (
  supplier_id STRING PRIMARY KEY,
  supplier_name STRING,
  signup_date DATE,
  category STRING,
  city STRING,
  total_bookings INT,
  avg_rating FLOAT,
  total_payout DECIMAL(12, 2),
  status STRING
);
```

---

## 3. Event Tracking Implementation

### Track User Journeys

```javascript
// lib/analytics.js
const analytics = {
  // Search events
  trackSearch: (filters, resultCount) => {
    window.gtag?.('event', 'search', {
      search_term: filters.destination,
      product_type: filters.productType,
      result_count: resultCount,
      search_term: filters.destination,
    });
  },
  
  // View product
  trackViewProduct: (product) => {
    window.gtag?.('event', 'view_item', {
      items: [{
        item_id: product.id,
        item_name: product.name,
        item_category: product.type,
        price: product.price,
      }],
    });
  },
  
  // Add to cart / Create booking
  trackAddToCart: (product, quantity) => {
    window.gtag?.('event', 'add_to_cart', {
      items: [{
        item_id: product.id,
        item_name: product.name,
        price: product.price,
        quantity,
      }],
      value: product.price * quantity,
      currency: 'INR',
    });
  },
  
  // Checkout
  trackCheckout: (bookingTotal) => {
    window.gtag?.('event', 'begin_checkout', {
      value: bookingTotal,
      currency: 'INR',
    });
  },
  
  // Purchase
  trackPurchase: (booking) => {
    window.gtag?.('event', 'purchase', {
      transaction_id: booking.reference,
      value: booking.totalAmount,
      currency: 'INR',
      items: [{
        item_id: booking.productId,
        item_name: booking.productName,
        price: booking.totalAmount,
      }],
    });
  },
  
  // Cancellation
  trackCancellation: (booking, reason) => {
    window.gtag?.('event', 'cancel_booking', {
      transaction_id: booking.reference,
      value: booking.totalAmount,
      reason,
    });
  },
};

export default analytics;
```

### Backend Event Logging

```javascript
// services/AnalyticsService.js
const publishEvent = async (eventName, properties) => {
  await bigquery
    .dataset('marketplace_analytics')
    .table('events')
    .insert({
      event_id: uuid(),
      event_name: eventName,
      event_timestamp: new Date(),
      event_properties: properties,
      created_at: new Date(),
    });
};

// Usage in booking service
const createBooking = async (booking) => {
  const saved = await db.booking.create(booking);
  
  // Publish event to BigQuery
  await publishEvent('booking_created', {
    booking_id: saved.id,
    product_type: booking.productType,
    amount: booking.totalAmount,
    supplier_id: booking.supplierId,
  });
  
  return saved;
};
```

---

## 4. Dashboard 1: Daily Overview

### Create Looker Studio Report

```
Dashboard: Daily Overview
Updated: Every hour

┌──────────────────────────────────────────────────────────────┐
│ KPI Cards (24-hour window)                                   │
├──────────────────────────────────────────────────────────────┤
│
│  Bookings        Revenue         Avg Order Value
│  ┌──────────┐    ┌──────────┐    ┌──────────┐
│  │  1,250   │    │₹62.5L    │    │  ₹5,000  │
│  │↑ 12%    │    │↑ 15%    │    │→         │
│  └──────────┘    └──────────┘    └──────────┘
│
│  Conversion Rate Cancellations  Refund Rate
│  ┌──────────┐    ┌──────────┐    ┌──────────┐
│  │  4.2%    │    │  3.2%    │    │  1.8%    │
│  │↓ 0.5%   │    │→         │    │↑ 0.2%   │
│  └──────────┘    └──────────┘    └──────────┘
│
├──────────────────────────────────────────────────────────────┤
│ Hourly Booking Trend (24h)                                   │
│                    ╱╲      ╱╲
│    ╱╲     ╱╲    ╱  ╲  ╱  ╲
│ ╱╲╱  ╲  ╱  ╲╱╲╱    ╲╱    ╲
├──────────────────────────────────────────────────────────────┤
│ Top Products                │ Top Destinations
│ 1. Day Tours        45%     │ 1. Goa           320 bookings
│ 2. Transfers        40%     │ 2. Delhi         280 bookings
│ 3. Packages         15%     │ 3. Jaipur        210 bookings
└──────────────────────────────────────────────────────────────┘
```

### SQL Query

```sql
-- Daily overview
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_bookings,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
  SUM(booking_amount) as total_revenue,
  AVG(booking_amount) as avg_order_value,
  COUNT(CASE WHEN cancelled_at IS NOT NULL THEN 1 END) / COUNT(*) as cancellation_rate,
  COUNT(CASE WHEN refund_amount > 0 THEN 1 END) / COUNT(*) as refund_rate
FROM marketplace_analytics.bookings_fact
WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY date
ORDER BY date DESC;
```

---

## 5. Dashboard 2: Cohort Analysis

### Analyze Customer Retention

```
Cohort Analysis: Retention by Signup Month

           Month 0  Month 1  Month 2  Month 3  Month 6
Jan 2024   1000     670      520      420      180
           100%     67%      52%      42%      18%

Feb 2024   1200     750      580      440      -
           100%     62.5%    48%      37%      -

Mar 2024   980      650      510      -        -
           100%     66%      52%      -        -

Apr 2024   1100     720      -        -        -
           100%     65%      -        -        -

May 2024   1350     -        -        -        -
           100%     -        -        -        -
```

### SQL Cohort Query

```sql
-- Cohort analysis
WITH user_cohorts AS (
  SELECT
    user_id,
    DATE_TRUNC(DATE(MIN(created_at)), MONTH) as cohort_month,
    DATE_TRUNC(DATE(created_at), MONTH) as booking_month,
    DATE_DIFF(DATE_TRUNC(DATE(created_at), MONTH), 
              DATE_TRUNC(DATE(MIN(created_at)), MONTH), MONTH) as months_since_cohort
  FROM marketplace_analytics.bookings_fact
  GROUP BY user_id, booking_month
)
SELECT
  cohort_month,
  months_since_cohort,
  COUNT(DISTINCT user_id) as users_active,
  ROUND(COUNT(DISTINCT user_id) / 
    MAX(IF(months_since_cohort = 0, COUNT(DISTINCT user_id), NULL)) 
    OVER (PARTITION BY cohort_month) * 100, 1) as retention_percentage
FROM user_cohorts
GROUP BY cohort_month, months_since_cohort
ORDER BY cohort_month DESC, months_since_cohort;
```

---

## 6. Dashboard 3: Supplier Performance

### Track Supplier KPIs

```
Supplier Performance Ranking

Rank  Supplier Name           Bookings  Revenue    Rating  Payout    SLA Score
1     Sky Travels (Delhi)     245       ₹12.25L    4.8⭐   ₹9.8L     98%
2     Goa Tours Ltd           198       ₹9.90L     4.6⭐   ₹7.92L    95%
3     Mumbai Taxi Service     180       ₹9.0L      4.4⭐   ₹7.2L     92%
4     Rajasthan Adventures    165       ₹8.25L     4.7⭐   ₹6.6L     88%
5     Bangalore Travels       142       ₹7.1L      4.5⭐   ₹5.68L    90%
...
```

### SQL Query

```sql
SELECT
  s.supplier_id,
  s.supplier_name,
  s.city,
  COUNT(DISTINCT b.booking_id) as total_bookings,
  SUM(b.booking_amount) as total_revenue,
  AVG(r.rating) as avg_rating,
  SUM(b.supplier_payout) as total_payout,
  ROUND(COUNT(CASE WHEN b.status = 'completed' THEN 1 END) / 
    COUNT(*) * 100, 1) as completion_rate,
  ROUND(COUNT(CASE WHEN b.cancelled_at IS NOT NULL THEN 1 END) / 
    COUNT(*) * 100, 1) as cancellation_rate,
  ROUND(AVG(DATE_DIFF(b.updated_at, b.created_at, HOUR)), 1) as avg_completion_time_hours
FROM marketplace_analytics.suppliers_dim s
LEFT JOIN marketplace_analytics.bookings_fact b ON s.supplier_id = b.supplier_id
LEFT JOIN marketplace_analytics.reviews_fact r ON s.supplier_id = r.supplier_id
WHERE b.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY s.supplier_id, s.supplier_name, s.city
ORDER BY total_revenue DESC;
```

---

## 7. Dashboard 4: Revenue & Finance

### Track P&L Metrics

```
┌─────────────────────────────────────────────┐
│ Revenue & Finance Dashboard                 │
├─────────────────────────────────────────────┤
│ Gross Revenue (30d)        ₹1,87,50,000     │
│ Commission (20%)           ₹37,50,000       │
│ Platform Revenue           ₹37,50,000       │
│ Supplier Payout            ₹1,50,00,000     │
│ Refunds Processed          ₹3,37,500 (1.8%) │
│ Net Platform Revenue       ₹34,12,500       │
├─────────────────────────────────────────────┤
│ Revenue by Product Type                     │
│ Day Tours: 45% (₹84,37,500)                 │
│ Transfers: 40% (₹75,00,000)                 │
│ Packages: 15% (₹28,12,500)                  │
├─────────────────────────────────────────────┤
│ Revenue by City                             │
│ Goa: 32% (₹60,00,000)                       │
│ Delhi: 28% (₹52,50,000)                     │
│ Jaipur: 22% (₹41,25,000)                    │
│ Others: 18% (₹33,75,000)                    │
└─────────────────────────────────────────────┘
```

### SQL Query

```sql
SELECT
  DATE_TRUNC(DATE(created_at), DAY) as date,
  product_type,
  COUNT(*) as bookings,
  SUM(booking_amount) as gross_revenue,
  SUM(commission_amount) as commission,
  SUM(supplier_payout) as payout,
  SUM(CASE WHEN refund_amount > 0 THEN refund_amount ELSE 0 END) as refunds,
  SUM(booking_amount) - 
  SUM(CASE WHEN refund_amount > 0 THEN refund_amount ELSE 0 END) -
  SUM(supplier_payout) as net_revenue
FROM marketplace_analytics.bookings_fact
GROUP BY date, product_type
ORDER BY date DESC;
```

---

## 8. Alerts & Anomaly Detection

### Setup Anomaly Detection

```python
# python/anomaly_detection.py
import pandas as pd
from google.cloud import bigquery

def detect_anomalies():
    client = bigquery.Client()
    
    # Get last 30 days of daily metrics
    query = """
    SELECT
      DATE(created_at) as date,
      COUNT(*) as bookings,
      SUM(booking_amount) as revenue
    FROM marketplace_analytics.bookings_fact
    WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    GROUP BY date
    ORDER BY date
    """
    
    df = client.query(query).to_dataframe()
    
    # Calculate mean and std dev
    mean_bookings = df['bookings'].mean()
    std_bookings = df['bookings'].std()
    
    # Flag if today's bookings are > 2 std dev below mean
    today_bookings = df.iloc[-1]['bookings']
    
    if today_bookings < (mean_bookings - 2 * std_bookings):
        send_alert(f"⚠️ Booking volume unusually low: {today_bookings} (expected: {mean_bookings})")
    
    # Similar check for revenue
    mean_revenue = df['revenue'].mean()
    std_revenue = df['revenue'].std()
    today_revenue = df.iloc[-1]['revenue']
    
    if today_revenue < (mean_revenue - 2 * std_revenue):
        send_alert(f"⚠️ Revenue unusually low: ₹{today_revenue} (expected: ₹{mean_revenue})")

if __name__ == "__main__":
    detect_anomalies()
```

### Cloud Scheduler Job

```bash
# Deploy anomaly detection as scheduled job
gcloud scheduler jobs create app-engine detect-anomalies \
  --schedule="0 8 * * *" \
  --http-method=POST \
  --uri="https://project.cloudfunctions.net/detect-anomalies"
```

---

## 9. Implementation Checklist

### Week 1: Data Warehouse Setup
- [ ] Create BigQuery dataset
- [ ] Design star schema (fact + dimension tables)
- [ ] Set up data pipelines from source databases
- [ ] Verify data quality and completeness

### Week 2: Event Tracking
- [ ] Implement Google Analytics 4
- [ ] Add frontend event tracking
- [ ] Add backend event logging
- [ ] Test events with Looker Studio

### Week 3: Dashboard Creation
- [ ] Create daily overview dashboard
- [ ] Create cohort analysis dashboard
- [ ] Create supplier performance dashboard
- [ ] Create revenue & finance dashboard

### Week 4: Monitoring & Alerts
- [ ] Set up anomaly detection
- [ ] Configure alerts for key metrics
- [ ] Create alerting runbooks
- [ ] Weekly metrics review cadence

---

## Success Criteria

- ✅ Real-time KPI tracking
- ✅ 30-day historical data
- ✅ All stakeholders have dashboard access
- ✅ Alert triggered within 5 min of anomaly
- ✅ <100ms dashboard load time
- ✅ 99.9% data pipeline uptime

Timeline: **3-4 weeks**
