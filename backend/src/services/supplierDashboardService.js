import { cityTime, localDate } from "../lib/localTime.js";

/**
 * Supplier dashboard numbers (ADR 038). Every figure comes from bookings; when
 * there is too little to say anything, the value is null ("Not enough data"),
 * never a placeholder.
 *
 * Earnings are what the supplier earns, on the trip date: supplier_payout_amount,
 * which is the net payout for marketplace and partner bookings and the full
 * amount for the supplier's own direct bookings. Cancelled and unpaid bookings
 * are left out.
 */

export const MIN_SAMPLE = 5;
const METRIC_DAYS = 90;
const EARNING = "LOWER(status) NOT IN ('cancelled', 'pending_payment') AND payment_status IN ('PAID', 'OFFLINE')";

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function addMonths(date, months) {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.toISOString().slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

const money = (value) => Math.round(Number(value || 0));
const pct = (part, whole) => (whole >= MIN_SAMPLE ? Number(((part / whole) * 100).toFixed(1)) : null);
// SQLite CURRENT_TIMESTAMP has no zone and means UTC.
const instant = (value) => (value ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${String(value).replace(" ", "T")}Z`) : NaN);

function supplierToday(db, supplierId, now) {
  const supplier = db.prepare("SELECT city FROM suppliers WHERE id = ?").get(supplierId);
  return localDate(now, cityTime(db, supplier?.city));
}

function earningRows(db, supplierId, from, to) {
  return db.prepare(`SELECT activity_date, status, payment_status, supplier_payout_amount, amount_inr, balance_due_inr
    FROM bookings WHERE supplier_id = ? AND activity_date BETWEEN ? AND ? AND ${EARNING}`).all(supplierId, from, to);
}

function earningsOf(rows) {
  const direct = rows.filter((row) => row.payment_status === "OFFLINE");
  const directEarned = direct.reduce((sum, row) => sum + money(row.supplier_payout_amount), 0);
  const directDue = direct.reduce((sum, row) => sum + money(row.balance_due_inr), 0);
  const marketplace = rows.filter((row) => row.payment_status !== "OFFLINE").reduce((sum, row) => sum + money(row.supplier_payout_amount), 0);
  return {
    bookings: rows.length,
    earnings_inr: marketplace + directEarned,
    marketplace_inr: marketplace,
    direct_inr: directEarned,
    direct_collected_inr: directEarned - directDue,
    direct_due_inr: directDue,
  };
}

/** Today, the last 7 days, this month to date, ratings and alerts. */
export function supplierDashboardStats(db, supplierId, { now = new Date() } = {}) {
  const today = supplierToday(db, supplierId, now);
  const monthStart = `${today.slice(0, 8)}01`;
  const weekStart = addDays(today, -6);
  const lastMonthStart = addMonths(monthStart, -1);
  const lastMonthSameDay = addMonths(today, -1);

  const todayTrips = db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN LOWER(status) = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN LOWER(status) IN ('confirmed', 'driver_assigned', 'pending_confirmation') THEN 1 ELSE 0 END) AS upcoming
    FROM bookings WHERE supplier_id = ? AND activity_date = ? AND LOWER(status) NOT IN ('cancelled', 'pending_payment')`).get(supplierId, today);

  const weekRows = earningRows(db, supplierId, weekStart, today);
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return weekRows.filter((row) => row.activity_date === date).reduce((sum, row) => sum + money(row.supplier_payout_amount), 0);
  });
  const month = earningsOf(earningRows(db, supplierId, monthStart, today));
  const lastMonth = earningsOf(earningRows(db, supplierId, lastMonthStart, lastMonthSameDay));

  // Completion and cancellation over trips whose date has passed, last 90 days.
  const since = addDays(today, -METRIC_DAYS);
  const past = db.prepare(`SELECT
      SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN LOWER(status) = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
      COUNT(*) AS total
    FROM bookings WHERE supplier_id = ? AND activity_date BETWEEN ? AND ? AND LOWER(status) <> 'pending_payment'`).get(supplierId, since, addDays(today, -1));
  const quality = db.prepare("SELECT review_count, average_rating FROM quality_scores WHERE entity_type = 'SUPPLIER' AND entity_id = ?").get(supplierId);

  const unread = db.prepare("SELECT COUNT(*) AS count FROM supplier_notifications WHERE supplier_id = ? AND is_read = 0").get(supplierId)?.count || 0;
  const alerts = db.prepare(`SELECT id, ref, supplier_response_deadline FROM bookings
    WHERE supplier_id = ? AND supplier_assignment_status = 'PENDING' AND LOWER(status) NOT IN ('cancelled', 'pending_payment')
    ORDER BY supplier_response_deadline LIMIT 5`).all(supplierId);

  return {
    as_of: today,
    today: {
      bookings: Number(todayTrips.total || 0),
      trips_in_progress: Number(todayTrips.in_progress || 0),
      trips_completed: Number(todayTrips.completed || 0),
      trips_upcoming: Number(todayTrips.upcoming || 0),
      earnings_inr: trend[6],
    },
    week: { from: weekStart, bookings: weekRows.length, earnings_inr: trend.reduce((a, b) => a + b, 0), trend },
    month: {
      from: monthStart,
      ...month,
      // Same days last month; hidden when there's nothing to compare.
      growth_pct: lastMonth.earnings_inr > 0 ? Number((((month.earnings_inr - lastMonth.earnings_inr) / lastMonth.earnings_inr) * 100).toFixed(1)) : null,
    },
    ratings: {
      avg: quality?.review_count ? Number(quality.average_rating) : null,
      total_reviews: Number(quality?.review_count || 0),
      completion_rate: pct(Number(past.completed || 0), Number(past.total || 0)),
      cancellation_rate: pct(Number(past.cancelled || 0), Number(past.total || 0)),
      sample_bookings: Number(past.total || 0),
    },
    unread_notifications_count: Number(unread),
    alerts: alerts.map((row) => ({ type: "SLA_PENDING", booking_id: row.id, booking_ref: row.ref, deadline: row.supplier_response_deadline || null })),
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Six months of earnings by trip month, top listings, and service metrics over 90 days. */
export function supplierAnalytics(db, supplierId, { now = new Date() } = {}) {
  const today = supplierToday(db, supplierId, now);
  const firstMonth = addMonths(`${today.slice(0, 8)}01`, -5);
  const rows = earningRows(db, supplierId, firstMonth, `${today.slice(0, 8)}31`);
  const revenueTrend = Array.from({ length: 6 }, (_, index) => {
    const month = addMonths(firstMonth, index).slice(0, 7);
    const inMonth = rows.filter((row) => row.activity_date.startsWith(month));
    const [year, monthIndex] = month.split("-").map(Number);
    return {
      month: new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
      key: month,
      revenue_inr: inMonth.reduce((sum, row) => sum + money(row.supplier_payout_amount), 0),
      bookings: inMonth.length,
    };
  });

  const topProducts = db.prepare(`SELECT p.id, p.title, p.price_inr, p.rating,
      COUNT(b.id) AS booking_count, COALESCE(SUM(b.supplier_payout_amount), 0) AS total_earnings
    FROM products p
    LEFT JOIN bookings b ON b.product_id = p.id AND LOWER(b.status) NOT IN ('cancelled', 'pending_payment') AND b.payment_status IN ('PAID', 'OFFLINE')
    WHERE p.supplier_id = ?
    GROUP BY p.id, p.title, p.price_inr, p.rating
    ORDER BY total_earnings DESC, booking_count DESC
    LIMIT 5`).all(supplierId).map((row) => ({ ...row, booking_count: Number(row.booking_count || 0), total_earnings: money(row.total_earnings) }));

  const since = addDays(today, -METRIC_DAYS);
  const nowMs = now.getTime();

  // Marketplace requests that needed an answer: they carry a response deadline.
  const requests = db.prepare(`SELECT supplier_assigned_at, created_at, supplier_responded_at, supplier_response_deadline FROM bookings
    WHERE supplier_id = ? AND supplier_response_deadline IS NOT NULL AND COALESCE(source, 'B2C') NOT IN ('WALK_IN', 'PHONE', 'MANUAL')
      AND activity_date >= ?`).all(supplierId, since);
  const answered = requests.filter((row) => row.supplier_responded_at);
  const responseMinutes = answered
    .map((row) => (instant(row.supplier_responded_at) - instant(row.supplier_assigned_at || row.created_at)) / 60000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);
  // A request whose deadline passed unanswered counts as late.
  const decided = requests.filter((row) => row.supplier_responded_at || instant(row.supplier_response_deadline) < nowMs);
  const onTime = decided.filter((row) => row.supplier_responded_at && instant(row.supplier_responded_at) <= instant(row.supplier_response_deadline));

  const attendance = db.prepare(`SELECT attendance_status, COALESCE(adults, 0) + COALESCE(children, 0) AS guests FROM bookings
    WHERE supplier_id = ? AND activity_date BETWEEN ? AND ? AND attendance_status IN ('CHECKED_IN', 'NO_SHOW')`).all(supplierId, since, today);
  const noShowGuests = attendance.filter((row) => row.attendance_status === "NO_SHOW").reduce((sum, row) => sum + Number(row.guests), 0);
  const attendedGuests = attendance.reduce((sum, row) => sum + Number(row.guests), 0);

  const otp = db.prepare(`SELECT otp_verified_at FROM bookings
    WHERE supplier_id = ? AND activity_date BETWEEN ? AND ? AND LOWER(status) = 'completed' AND otp_hash IS NOT NULL`).all(supplierId, since, today);

  const median_minutes = responseMinutes.length >= MIN_SAMPLE ? Math.round(median(responseMinutes)) : null;
  return {
    as_of: today,
    revenueTrend,
    topProducts,
    operationalMetrics: {
      days: METRIC_DAYS,
      minSample: MIN_SAMPLE,
      medianResponseMins: median_minutes,
      responseSample: responseMinutes.length,
      onTimeResponsePct: pct(onTime.length, decided.length),
      onTimeSample: decided.length,
      // A booking with attendance counts once toward the sample, weighted by guests.
      noShowPct: attendance.length >= MIN_SAMPLE && attendedGuests ? Number(((noShowGuests / attendedGuests) * 100).toFixed(1)) : null,
      noShowSample: attendance.length,
      otpVerifiedPct: pct(otp.filter((row) => row.otp_verified_at).length, otp.length),
      otpSample: otp.length,
    },
  };
}
