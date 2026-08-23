/**
 * Analytics Service — Core analytics queries for the Idea Holiday marketplace.
 *
 * All queries target the existing schema (bookings, suppliers, products, payouts,
 * refunds, reviews, quality_scores, audit_logs) — no additional tables required.
 */

// ─── Helpers ──────────────────────────────────────────────────

function sqliteDate(daysAgo) {
  return `datetime('now', '-${daysAgo} days')`;
}

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

function pctChange(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return round2(((current - previous) / previous) * 100);
}

// ─── Daily Overview ───────────────────────────────────────────

/**
 * Returns KPI overview with period-over-period comparison.
 * @param {object} database — better-sqlite3 or pg-compatible db
 * @param {{ days?: number }} opts
 */
export function getDailyOverview(database, { days = 30 } = {}) {
  const currentPeriod = database.prepare(`
    SELECT
      COUNT(*)                                                        AS total_bookings,
      SUM(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN amount_inr ELSE 0 END) AS revenue,
      AVG(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN amount_inr END)        AS avg_order_value,
      COUNT(CASE WHEN LOWER(status) = 'cancelled' THEN 1 END)        AS cancelled,
      COUNT(DISTINCT supplier_id)                                     AS active_suppliers,
      COUNT(DISTINCT user_id)                                         AS unique_customers
    FROM bookings
    WHERE created_at >= ${sqliteDate(days)}
  `).get();

  const previousPeriod = database.prepare(`
    SELECT
      COUNT(*)                                                        AS total_bookings,
      SUM(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN amount_inr ELSE 0 END) AS revenue,
      AVG(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN amount_inr END)        AS avg_order_value,
      COUNT(CASE WHEN LOWER(status) = 'cancelled' THEN 1 END)        AS cancelled,
      COUNT(DISTINCT supplier_id)                                     AS active_suppliers,
      COUNT(DISTINCT user_id)                                         AS unique_customers
    FROM bookings
    WHERE created_at >= ${sqliteDate(days * 2)} AND created_at < ${sqliteDate(days)}
  `).get();

  const refundsResult = database.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
    FROM refunds
    WHERE created_at >= ${sqliteDate(days)}
  `).get();

  const prevRefunds = database.prepare(`
    SELECT COUNT(*) AS count
    FROM refunds
    WHERE created_at >= ${sqliteDate(days * 2)} AND created_at < ${sqliteDate(days)}
  `).get();

  const cancellationRate = currentPeriod.total_bookings > 0
    ? round2((currentPeriod.cancelled / currentPeriod.total_bookings) * 100) : 0;
  const refundRate = currentPeriod.total_bookings > 0
    ? round2((refundsResult.count / currentPeriod.total_bookings) * 100) : 0;

  return {
    period: { days, label: `Last ${days} days` },
    kpis: {
      totalBookings:    { value: currentPeriod.total_bookings || 0, change: pctChange(currentPeriod.total_bookings, previousPeriod.total_bookings) },
      revenue:          { value: round2(currentPeriod.revenue || 0), change: pctChange(currentPeriod.revenue, previousPeriod.revenue) },
      avgOrderValue:    { value: round2(currentPeriod.avg_order_value || 0), change: pctChange(currentPeriod.avg_order_value, previousPeriod.avg_order_value) },
      cancellationRate: { value: cancellationRate, change: pctChange(currentPeriod.cancelled, previousPeriod.cancelled) },
      refundRate:       { value: refundRate, change: pctChange(refundsResult.count, prevRefunds.count) },
      activeSuppliers:  { value: currentPeriod.active_suppliers || 0, change: pctChange(currentPeriod.active_suppliers, previousPeriod.active_suppliers) },
      uniqueCustomers:  { value: currentPeriod.unique_customers || 0, change: pctChange(currentPeriod.unique_customers, previousPeriod.unique_customers) },
      refundsTotal:     { value: round2(refundsResult.total || 0) },
    },
  };
}

// ─── Booking & Revenue Trends ─────────────────────────────────

/**
 * Time-series data for bookings, revenue, and cancellations.
 * @param {object} database
 * @param {{ days?: number, groupBy?: 'day'|'week'|'month' }} opts
 */
export function getBookingTrends(database, { days = 90, groupBy = "day" } = {}) {
  let dateExpr;
  switch (groupBy) {
    case "week":
      dateExpr = "strftime('%Y-W%W', created_at)";
      break;
    case "month":
      dateExpr = "strftime('%Y-%m', created_at)";
      break;
    default:
      dateExpr = "DATE(created_at)";
  }

  const rows = database.prepare(`
    SELECT
      ${dateExpr}                                                        AS period,
      COUNT(*)                                                           AS bookings,
      SUM(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN amount_inr ELSE 0 END) AS revenue,
      COUNT(CASE WHEN LOWER(status) = 'cancelled' THEN 1 END)           AS cancelled,
      AVG(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN amount_inr END) AS avg_value,
      COUNT(DISTINCT user_id)                                            AS unique_customers
    FROM bookings
    WHERE created_at >= ${sqliteDate(days)}
    GROUP BY period
    ORDER BY period ASC
  `).all();

  return {
    groupBy,
    days,
    points: rows.map((r) => ({
      period: r.period,
      bookings: r.bookings || 0,
      revenue: round2(r.revenue || 0),
      cancelled: r.cancelled || 0,
      avgValue: round2(r.avg_value || 0),
      uniqueCustomers: r.unique_customers || 0,
    })),
  };
}

// ─── Cohort Retention ─────────────────────────────────────────

/**
 * Builds a user retention cohort matrix.
 * Cohort = month of first booking. Retention = subsequent months with at least one booking.
 * @param {object} database
 * @param {{ months?: number }} opts
 */
export function getCohortRetention(database, { months = 6 } = {}) {
  const rows = database.prepare(`
    WITH first_booking AS (
      SELECT user_id, MIN(DATE(created_at)) AS first_date
      FROM bookings
      WHERE user_id IS NOT NULL
      GROUP BY user_id
    ),
    cohorted AS (
      SELECT
        fb.user_id,
        strftime('%Y-%m', fb.first_date) AS cohort_month,
        strftime('%Y-%m', b.created_at)  AS activity_month
      FROM first_booking fb
      JOIN bookings b ON b.user_id = fb.user_id
      WHERE fb.first_date >= ${sqliteDate(months * 30)}
    )
    SELECT
      cohort_month,
      CAST((
        (CAST(substr(activity_month, 1, 4) AS INTEGER) - CAST(substr(cohort_month, 1, 4) AS INTEGER)) * 12
        + CAST(substr(activity_month, 6, 2) AS INTEGER) - CAST(substr(cohort_month, 6, 2) AS INTEGER)
      ) AS INTEGER) AS months_since,
      COUNT(DISTINCT user_id) AS active_users
    FROM cohorted
    GROUP BY cohort_month, months_since
    ORDER BY cohort_month, months_since
  `).all();

  // Transform into matrix: { cohort_month -> { 0: N, 1: N, ... } }
  const matrix = {};
  for (const row of rows) {
    if (!matrix[row.cohort_month]) matrix[row.cohort_month] = {};
    matrix[row.cohort_month][row.months_since] = row.active_users;
  }

  // Build cohorts array with retention percentages
  const cohorts = Object.entries(matrix).map(([month, data]) => {
    const cohortSize = data[0] || 1;
    const retention = {};
    for (const [monthsSince, users] of Object.entries(data)) {
      retention[monthsSince] = {
        users,
        percentage: round2((users / cohortSize) * 100),
      };
    }
    return { month, cohortSize, retention };
  });

  return { months, cohorts };
}

// ─── Supplier Performance ─────────────────────────────────────

/**
 * Ranked supplier performance table.
 * @param {object} database
 * @param {{ days?: number, limit?: number }} opts
 */
export function getSupplierPerformance(database, { days = 90, limit = 20 } = {}) {
  const suppliers = database.prepare(`
    SELECT
      s.id                                              AS supplier_id,
      s.company_name                                    AS name,
      s.city,
      COUNT(DISTINCT b.id)                              AS total_bookings,
      SUM(CASE WHEN LOWER(b.status) NOT IN ('cancelled','pending_payment') THEN b.amount_inr ELSE 0 END) AS revenue,
      SUM(CASE WHEN LOWER(b.status) NOT IN ('cancelled','pending_payment') THEN b.supplier_payout_amount ELSE 0 END) AS total_payout,
      ROUND(AVG(CASE WHEN LOWER(b.status) = 'confirmed' OR LOWER(b.status) = 'completed' THEN 1.0 ELSE 0.0 END) * 100, 1) AS completion_rate,
      ROUND(AVG(CASE WHEN LOWER(b.status) = 'cancelled' THEN 1.0 ELSE 0.0 END) * 100, 1) AS cancellation_rate,
      COUNT(CASE WHEN b.supplier_response_status = 'ACCEPTED' THEN 1 END) AS accepted_count,
      COUNT(CASE WHEN b.supplier_response_status = 'DECLINED' THEN 1 END) AS declined_count
    FROM suppliers s
    LEFT JOIN bookings b ON b.supplier_id = s.id AND b.created_at >= ${sqliteDate(days)}
    WHERE s.kyb_status = 'APPROVED'
    GROUP BY s.id
    HAVING total_bookings > 0
    ORDER BY revenue DESC
    LIMIT ?
  `).all(limit);

  // Enrich with quality scores and review ratings
  const scoreStmt = database.prepare(
    "SELECT score_100, review_count, average_rating FROM quality_scores WHERE entity_type = 'SUPPLIER' AND entity_id = ?"
  );

  return {
    days,
    suppliers: suppliers.map((s, idx) => {
      const qs = scoreStmt.get(s.supplier_id) || {};
      return {
        rank: idx + 1,
        supplierId: s.supplier_id,
        name: s.name,
        city: s.city,
        bookings: s.total_bookings,
        revenue: round2(s.revenue || 0),
        payout: round2(s.total_payout || 0),
        completionRate: s.completion_rate || 0,
        cancellationRate: s.cancellation_rate || 0,
        acceptedCount: s.accepted_count || 0,
        declinedCount: s.declined_count || 0,
        qualityScore: qs.score_100 || null,
        avgRating: qs.average_rating || null,
        reviewCount: qs.review_count || 0,
      };
    }),
  };
}

// ─── Revenue Breakdown ────────────────────────────────────────

/**
 * Revenue breakdown by product type and destination.
 * @param {object} database
 * @param {{ days?: number }} opts
 */
export function getRevenueBreakdown(database, { days = 30 } = {}) {
  const byType = database.prepare(`
    SELECT
      product_type,
      COUNT(*) AS bookings,
      SUM(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN amount_inr ELSE 0 END) AS revenue,
      SUM(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN commission_amount ELSE 0 END) AS commission
    FROM bookings
    WHERE created_at >= ${sqliteDate(days)}
    GROUP BY product_type
    ORDER BY revenue DESC
  `).all();

  const byDestination = database.prepare(`
    SELECT
      COALESCE(p.destination_name, b.pickup_location, 'Unknown') AS destination,
      COUNT(*) AS bookings,
      SUM(CASE WHEN LOWER(b.status) NOT IN ('cancelled','pending_payment') THEN b.amount_inr ELSE 0 END) AS revenue
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    WHERE b.created_at >= ${sqliteDate(days)}
    GROUP BY destination
    ORDER BY revenue DESC
    LIMIT 10
  `).all();

  const byPaymentMethod = database.prepare(`
    SELECT
      COALESCE(payment_method, 'Unknown') AS method,
      COUNT(*) AS bookings,
      SUM(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN amount_inr ELSE 0 END) AS revenue
    FROM bookings
    WHERE created_at >= ${sqliteDate(days)}
    GROUP BY method
    ORDER BY revenue DESC
  `).all();

  const totalRevenue = byType.reduce((sum, r) => sum + (r.revenue || 0), 0);

  return {
    days,
    totalRevenue: round2(totalRevenue),
    byProductType: byType.map((r) => ({
      type: r.product_type,
      bookings: r.bookings,
      revenue: round2(r.revenue || 0),
      commission: round2(r.commission || 0),
      share: totalRevenue > 0 ? round2(((r.revenue || 0) / totalRevenue) * 100) : 0,
    })),
    byDestination: byDestination.map((r) => ({
      destination: r.destination,
      bookings: r.bookings,
      revenue: round2(r.revenue || 0),
      share: totalRevenue > 0 ? round2(((r.revenue || 0) / totalRevenue) * 100) : 0,
    })),
    byPaymentMethod: byPaymentMethod.map((r) => ({
      method: r.method,
      bookings: r.bookings,
      revenue: round2(r.revenue || 0),
    })),
  };
}

// ─── Conversion Funnel ────────────────────────────────────────

/**
 * Funnel data derived from audit_logs (backend mutations) and booking status transitions.
 * @param {object} database
 * @param {{ days?: number }} opts
 */
export function getConversionFunnel(database, { days = 30 } = {}) {
  // Search/view events from audit log (if available)
  const auditSearches = database.prepare(`
    SELECT COUNT(*) AS count FROM audit_logs
    WHERE action LIKE '%search%' AND created_at >= ${sqliteDate(days)}
  `).get().count || 0;

  const auditViews = database.prepare(`
    SELECT COUNT(*) AS count FROM audit_logs
    WHERE action LIKE '%view%' AND created_at >= ${sqliteDate(days)}
  `).get().count || 0;

  // Booking funnel stages from actual data
  const totalCreated = database.prepare(`
    SELECT COUNT(*) AS count FROM bookings WHERE created_at >= ${sqliteDate(days)}
  `).get().count || 0;

  const paymentInitiated = database.prepare(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE created_at >= ${sqliteDate(days)} AND payment_status != 'PENDING'
  `).get().count || 0;

  const confirmed = database.prepare(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE created_at >= ${sqliteDate(days)} AND LOWER(status) IN ('confirmed', 'completed', 'assigned')
  `).get().count || 0;

  const completed = database.prepare(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE created_at >= ${sqliteDate(days)} AND LOWER(status) = 'completed'
  `).get().count || 0;

  // Build funnel stages
  const stages = [
    { name: "Bookings Created", count: totalCreated },
    { name: "Payment Initiated", count: paymentInitiated },
    { name: "Confirmed", count: confirmed },
    { name: "Completed", count: completed },
  ];

  // Add top-of-funnel if audit data exists
  if (auditSearches > 0 || auditViews > 0) {
    stages.unshift(
      { name: "Searches", count: auditSearches || totalCreated * 15 },
      { name: "Product Views", count: auditViews || totalCreated * 5 }
    );
  }

  // Calculate conversion rates between stages
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1].count;
    stages[i].conversionFromPrev = prev > 0 ? round2((stages[i].count / prev) * 100) : 0;
  }
  if (stages.length > 0) stages[0].conversionFromPrev = 100;

  // Overall conversion
  const topCount = stages[0]?.count || 1;
  const bottomCount = stages[stages.length - 1]?.count || 0;

  return {
    days,
    overallConversion: round2((bottomCount / topCount) * 100),
    stages,
  };
}

// ─── Anomaly Alerts ───────────────────────────────────────────

/**
 * Z-score anomaly detection on daily bookings and revenue.
 * Flags if today or yesterday deviate >2σ below the 30-day rolling average.
 * @param {object} database
 */
export function getAnomalyAlerts(database) {
  const dailyData = database.prepare(`
    SELECT
      DATE(created_at) AS day,
      COUNT(*) AS bookings,
      SUM(CASE WHEN LOWER(status) NOT IN ('cancelled','pending_payment') THEN amount_inr ELSE 0 END) AS revenue
    FROM bookings
    WHERE created_at >= ${sqliteDate(30)}
    GROUP BY day
    ORDER BY day ASC
  `).all();

  if (dailyData.length < 7) {
    return { alerts: [], message: "Insufficient data for anomaly detection (need 7+ days)" };
  }

  const bookings = dailyData.map((d) => d.bookings);
  const revenues = dailyData.map((d) => d.revenue || 0);

  function stats(arr) {
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    return { mean: round2(mean), stdDev: round2(stdDev) };
  }

  const bookingStats = stats(bookings);
  const revenueStats = stats(revenues);

  const alerts = [];
  const recent = dailyData.slice(-2); // yesterday + today

  for (const day of recent) {
    // Booking anomaly (low)
    if (bookingStats.stdDev > 0 && day.bookings < bookingStats.mean - 2 * bookingStats.stdDev) {
      alerts.push({
        type: "LOW_BOOKINGS",
        severity: "warning",
        day: day.day,
        metric: "bookings",
        value: day.bookings,
        expected: bookingStats.mean,
        stdDev: bookingStats.stdDev,
        zScore: round2((day.bookings - bookingStats.mean) / bookingStats.stdDev),
        message: `Booking volume unusually low on ${day.day}: ${day.bookings} (expected ~${bookingStats.mean})`,
      });
    }

    // Revenue anomaly (low)
    if (revenueStats.stdDev > 0 && (day.revenue || 0) < revenueStats.mean - 2 * revenueStats.stdDev) {
      alerts.push({
        type: "LOW_REVENUE",
        severity: "warning",
        day: day.day,
        metric: "revenue",
        value: round2(day.revenue || 0),
        expected: revenueStats.mean,
        stdDev: revenueStats.stdDev,
        zScore: round2(((day.revenue || 0) - revenueStats.mean) / revenueStats.stdDev),
        message: `Revenue unusually low on ${day.day}: ₹${round2(day.revenue || 0)} (expected ~₹${revenueStats.mean})`,
      });
    }

    // Booking anomaly (high — could indicate a data issue)
    if (bookingStats.stdDev > 0 && day.bookings > bookingStats.mean + 3 * bookingStats.stdDev) {
      alerts.push({
        type: "HIGH_BOOKINGS",
        severity: "info",
        day: day.day,
        metric: "bookings",
        value: day.bookings,
        expected: bookingStats.mean,
        message: `Booking volume unusually high on ${day.day}: ${day.bookings} (expected ~${bookingStats.mean})`,
      });
    }
  }

  // Check for cancellation spike
  const recentCancelled = database.prepare(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE LOWER(status) = 'cancelled' AND created_at >= ${sqliteDate(1)}
  `).get().count || 0;

  const avgDailyCancelled = database.prepare(`
    SELECT CAST(COUNT(*) AS REAL) / 30.0 AS avg FROM bookings
    WHERE LOWER(status) = 'cancelled' AND created_at >= ${sqliteDate(30)}
  `).get().avg || 0;

  if (avgDailyCancelled > 0 && recentCancelled > avgDailyCancelled * 3) {
    alerts.push({
      type: "CANCELLATION_SPIKE",
      severity: "critical",
      metric: "cancellations",
      value: recentCancelled,
      expected: round2(avgDailyCancelled),
      message: `Cancellation spike: ${recentCancelled} today vs ~${round2(avgDailyCancelled)} daily average`,
    });
  }

  return {
    alerts,
    stats: { bookings: bookingStats, revenue: revenueStats },
  };
}
