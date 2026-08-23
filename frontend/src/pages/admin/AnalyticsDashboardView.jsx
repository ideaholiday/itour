import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  CircleDollarSign,
  ShoppingBag,
  Users,
  Percent,
  RotateCcw,
  ShieldCheck,
  Award,
  Layers,
  MapPin,
  Calendar,
  Activity,
  AlertCircle
} from "lucide-react";
import { authHeaders } from "../../lib/api.js";

function TrendBadge({ change }) {
  if (change === undefined || change === null) return null;
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
        <TrendingUp className="w-3 h-3" /> +{change}%
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
        <TrendingDown className="w-3 h-3" /> {change}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
      <Minus className="w-3 h-3" /> 0%
    </span>
  );
}

// Custom SVG Time-Series Chart Component
function TrendChart({ points = [] }) {
  if (!points || points.length === 0) {
    return <div className="h-48 flex items-center justify-center text-sm text-stone-400">No trend data available</div>;
  }

  const maxRevenue = Math.max(...points.map((p) => p.revenue || 0), 1000);
  const maxBookings = Math.max(...points.map((p) => p.bookings || 0), 5);
  const chartHeight = 160;
  const chartWidth = 600;
  const padding = 20;

  const getX = (index) => padding + (index / (points.length - 1 || 1)) * (chartWidth - padding * 2);
  const getYRev = (val) => chartHeight - padding - ((val || 0) / maxRevenue) * (chartHeight - padding * 2);
  const getYBook = (val) => chartHeight - padding - ((val || 0) / maxBookings) * (chartHeight - padding * 2);

  const revenuePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getYRev(p.revenue)}`).join(" ");
  const bookingsPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getYBook(p.bookings)}`).join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[500px]">
        <div className="flex items-center justify-between text-xs text-stone-500 mb-2 px-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium text-amber-700">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> Revenue (₹)
            </span>
            <span className="flex items-center gap-1.5 font-medium text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Bookings
            </span>
          </div>
          <span>Max: ₹{maxRevenue.toLocaleString("en-IN")} / {maxBookings} bookings</span>
        </div>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-44 overflow-visible">
          {/* Background Grid Lines */}
          <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="#E7E5E4" strokeDasharray="3 3" />
          <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="#E7E5E4" strokeDasharray="3 3" />
          <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#E7E5E4" />

          {/* Revenue Line */}
          <path d={revenuePath} fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Bookings Line */}
          <path d={bookingsPath} fill="none" stroke="#059669" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />

          {/* Data Points */}
          {points.map((p, i) => (
            <g key={i} className="group cursor-pointer">
              <circle cx={getX(i)} cy={getYRev(p.revenue)} r="3.5" fill="#D97706" className="transition-all group-hover:r-5" />
              <title>{`${p.period}: ₹${Number(p.revenue).toLocaleString("en-IN")} (${p.bookings} bookings)`}</title>
            </g>
          ))}
        </svg>
        <div className="flex justify-between text-[11px] text-stone-400 mt-1 px-4">
          <span>{points[0]?.period}</span>
          <span>{points[Math.floor(points.length / 2)]?.period}</span>
          <span>{points[points.length - 1]?.period}</span>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsDashboardView() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, trendsRes, suppliersRes, revenueRes, funnelRes, alertsRes] = await Promise.all([
        fetch(`/api/analytics/overview?days=${days}`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(`/api/analytics/trends?days=${days}&groupBy=day`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(`/api/analytics/suppliers?days=${days}&limit=10`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(`/api/analytics/revenue?days=${days}`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(`/api/analytics/funnel?days=${days}`, { headers: authHeaders() }).then((r) => r.json()),
        fetch("/api/analytics/alerts", { headers: authHeaders() }).then((r) => r.json()),
      ]);

      if (overviewRes.success) setOverview(overviewRes.data);
      if (trendsRes.success) setTrends(trendsRes.data.points || []);
      if (suppliersRes.success) setSuppliers(suppliersRes.data.suppliers || []);
      if (revenueRes.success) setRevenueBreakdown(revenueRes.data);
      if (funnelRes.success) setFunnel(funnelRes.data);
      if (alertsRes.success) setAlerts(alertsRes.data.alerts || []);
    } catch (err) {
      setError(err.message || "Failed to load analytics platform data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [days]);

  const kpiCards = overview?.kpis ? [
    {
      title: "Total Bookings",
      value: overview.kpis.totalBookings.value.toLocaleString("en-IN"),
      change: overview.kpis.totalBookings.change,
      icon: ShoppingBag,
      color: "text-indigo-600 bg-indigo-50 border-indigo-100",
    },
    {
      title: "Gross Revenue",
      value: `₹${Number(overview.kpis.revenue.value).toLocaleString("en-IN")}`,
      change: overview.kpis.revenue.change,
      icon: CircleDollarSign,
      color: "text-emerald-700 bg-emerald-50 border-emerald-100",
    },
    {
      title: "Avg Order Value",
      value: `₹${Number(overview.kpis.avgOrderValue.value).toLocaleString("en-IN")}`,
      change: overview.kpis.avgOrderValue.change,
      icon: Percent,
      color: "text-amber-700 bg-amber-50 border-amber-100",
    },
    {
      title: "Cancellation Rate",
      value: `${overview.kpis.cancellationRate.value}%`,
      change: overview.kpis.cancellationRate.change,
      icon: RotateCcw,
      color: "text-rose-700 bg-rose-50 border-rose-100",
    },
    {
      title: "Refund Rate",
      value: `${overview.kpis.refundRate.value}%`,
      change: overview.kpis.refundRate.change,
      icon: AlertCircle,
      color: "text-orange-700 bg-orange-50 border-orange-100",
    },
    {
      title: "Active Suppliers",
      value: overview.kpis.activeSuppliers.value.toString(),
      change: overview.kpis.activeSuppliers.change,
      icon: Users,
      color: "text-blue-700 bg-blue-50 border-blue-100",
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-700">Business Intelligence</span>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold text-stone-900">Analytics & KPI Command Center</h1>
          <p className="mt-1 text-xs sm:text-sm text-stone-600">Track real-time conversion, booking trends, supplier economics and performance health.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-stone-200 bg-stone-50 p-1 text-xs font-semibold text-stone-700">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-lg px-3 py-1.5 transition-colors ${days === d ? "bg-white text-stone-900 shadow-sm" : "hover:text-stone-900"}`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-amber-600" : ""}`} /> Refresh
          </button>
        </div>
      </header>

      {/* Error alert */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" /> {error}
        </div>
      )}

      {/* Anomaly Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
                alert.severity === "critical"
                  ? "border-rose-300 bg-rose-50 text-rose-900"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-700" />
              <div>
                <span className="font-bold">{alert.type}:</span> {alert.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <article key={idx} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-xl border ${card.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <TrendBadge change={card.change} />
              </div>
              <div className="mt-3">
                <span className="text-xl font-bold text-stone-900 block">{loading ? "…" : card.value}</span>
                <span className="text-[11px] text-stone-500 font-medium">{card.title}</span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Booking & Revenue Trend Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-serif text-lg font-bold text-stone-900">Revenue & Booking Velocity</h2>
              <p className="text-xs text-stone-500">Daily trajectory over the selected {days}-day window</p>
            </div>
            <Activity className="h-4 w-4 text-stone-400" />
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-sm text-stone-400">Loading trend trajectory…</div>
          ) : (
            <TrendChart points={trends} />
          )}
        </div>

        {/* Conversion Funnel */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-serif text-lg font-bold text-stone-900">Conversion Funnel</h2>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                {funnel?.overallConversion ?? 0}% Overall
              </span>
            </div>
            <p className="text-xs text-stone-500 mb-4">Stage-by-stage progression efficiency</p>

            <div className="space-y-3">
              {funnel?.stages?.map((stage, idx) => {
                const maxCount = Math.max(...(funnel?.stages?.map((s) => s.count) || [1]), 1);
                const widthPct = Math.max(Math.round((stage.count / maxCount) * 100), 8);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-stone-700">{stage.name}</span>
                      <span className="text-stone-900">{stage.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-emerald-600 rounded-full transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    {idx > 0 && (
                      <div className="text-[10px] text-stone-400 text-right">
                        {stage.conversionFromPrev}% from prev stage
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Breakdown Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Product Type Breakdown */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg font-bold text-stone-900">Revenue by Experience Type</h2>
            <Layers className="h-4 w-4 text-stone-400" />
          </div>
          <div className="space-y-3">
            {revenueBreakdown?.byProductType?.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-stone-700 uppercase tracking-wider text-[11px] font-semibold">{item.type}</span>
                  <span className="text-stone-900 font-bold">₹{Number(item.revenue).toLocaleString("en-IN")} ({item.share}%)</span>
                </div>
                <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                  <div className="h-full bg-amber-600 rounded-full" style={{ width: `${item.share}%` }} />
                </div>
              </div>
            ))}
            {(!revenueBreakdown?.byProductType || revenueBreakdown.byProductType.length === 0) && (
              <div className="text-xs text-stone-400 py-4 text-center">No experience breakdown data yet</div>
            )}
          </div>
        </div>

        {/* Destination Breakdown */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg font-bold text-stone-900">Top Destinations by GMV</h2>
            <MapPin className="h-4 w-4 text-stone-400" />
          </div>
          <div className="space-y-3">
            {revenueBreakdown?.byDestination?.slice(0, 5).map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-stone-700 font-semibold">{item.destination}</span>
                  <span className="text-stone-900 font-bold">₹{Number(item.revenue).toLocaleString("en-IN")} ({item.share}%)</span>
                </div>
                <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${item.share}%` }} />
                </div>
              </div>
            ))}
            {(!revenueBreakdown?.byDestination || revenueBreakdown.byDestination.length === 0) && (
              <div className="text-xs text-stone-400 py-4 text-center">No destination breakdown data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Supplier Performance Table */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-stone-900">Supplier Performance Scorecard</h2>
            <p className="text-xs text-stone-500">Ranked by gross revenue and fulfillment completion rate</p>
          </div>
          <Award className="h-5 w-5 text-amber-600" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                <th className="pb-3">Rank</th>
                <th className="pb-3">Supplier Name</th>
                <th className="pb-3">City</th>
                <th className="pb-3 text-right">Bookings</th>
                <th className="pb-3 text-right">Revenue</th>
                <th className="pb-3 text-right">Payout</th>
                <th className="pb-3 text-right">Completion</th>
                <th className="pb-3 text-right">Quality Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {suppliers.map((s) => (
                <tr key={s.supplierId} className="hover:bg-stone-50 transition-colors">
                  <td className="py-3 font-bold text-stone-400">#{s.rank}</td>
                  <td className="py-3 font-semibold text-stone-900">{s.name}</td>
                  <td className="py-3 text-stone-600">{s.city}</td>
                  <td className="py-3 text-right font-medium text-stone-700">{s.bookings}</td>
                  <td className="py-3 text-right font-bold text-stone-900">₹{Number(s.revenue).toLocaleString("en-IN")}</td>
                  <td className="py-3 text-right text-stone-600">₹{Number(s.payout).toLocaleString("en-IN")}</td>
                  <td className="py-3 text-right">
                    <span className={`font-semibold ${s.completionRate >= 90 ? "text-emerald-700" : s.completionRate >= 70 ? "text-amber-700" : "text-rose-700"}`}>
                      {s.completionRate}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    {s.qualityScore ? (
                      <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                        ⭐ {s.qualityScore}/100
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-stone-400">
                    No supplier performance data available for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
