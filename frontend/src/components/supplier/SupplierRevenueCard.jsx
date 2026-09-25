import React from "react";
import { TrendingUp, IndianRupee, ArrowUpRight } from "lucide-react";
import Card, { CardHeader, CardTitle, CardContent } from "../ui/Card";

export function SupplierRevenueCard({ stats }) {
  // Real numbers only (ADR 038): no growth badge or trend until there is data.
  const todayRevenue = stats?.today?.earnings_inr || 0;
  const monthRevenue = stats?.month?.earnings_inr || 0;
  const growthPct = stats?.month?.growth_pct ?? null;
  const trend = stats?.week?.trend?.length ? stats.week.trend : [0, 0, 0, 0, 0, 0, 0];
  const month = stats?.month || {};

  // SVG Sparkline
  const maxVal = Math.max(...trend, 10);
  const minVal = Math.min(...trend, 0);
  const width = 120;
  const height = 36;
  const points = trend
    .map((val, idx) => {
      const x = (idx / (trend.length - 1)) * width;
      const y = height - ((val - minVal) / (maxVal - minVal || 1)) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Card elevation="sm" className="bg-gradient-to-br from-stone-900 via-stone-900 to-stone-950 text-white border-stone-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <IndianRupee className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Earnings Overview</span>
            <h4 className="text-base font-bold font-display text-stone-100">Revenue Snapshot</h4>
          </div>
        </div>
        {growthPct !== null && (
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${growthPct >= 0 ? "text-emerald-400 bg-emerald-950/60 border-emerald-800" : "text-rose-300 bg-rose-950/60 border-rose-800"}`} title="From the 1st to today, against the same days last month">
            <TrendingUp className="w-3 h-3" />
            {growthPct >= 0 ? "+" : ""}{growthPct}% vs last month
          </span>
        )}
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-4 my-2">
          <div>
            <span className="text-xs text-stone-400">Today's earnings</span>
            <div className="text-2xl font-extrabold font-mono text-white mt-0.5">
              ₹{todayRevenue.toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] text-stone-400">{stats?.today?.bookings || 0} trips scheduled</span>
          </div>

          <div>
            <span className="text-xs text-stone-400">This Month</span>
            <div className="text-2xl font-extrabold font-mono text-amber-400 mt-0.5">
              ₹{monthRevenue.toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] text-stone-400">{month.bookings || 0} bookings to date</span>
            {month.direct_inr > 0 && (
              <span className="block text-[11px] text-stone-400">
                Marketplace ₹{(month.marketplace_inr || 0).toLocaleString("en-IN")} · Direct ₹{month.direct_inr.toLocaleString("en-IN")}
                {month.direct_due_inr > 0 ? ` (₹${month.direct_due_inr.toLocaleString("en-IN")} still to collect)` : ""}
              </span>
            )}
          </div>
        </div>

        {/* Weekly Trend Sparkline */}
        <div className="mt-4 pt-4 border-t border-stone-800 flex items-center justify-between">
          <span className="text-xs text-stone-400">Earnings, last 7 days</span>
          <svg width={width} height={height} className="overflow-visible">
            <polyline
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

export default SupplierRevenueCard;
