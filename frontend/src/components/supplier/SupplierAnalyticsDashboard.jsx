import React, { useState, useEffect } from "react";
import { BarChart3, TrendingUp, IndianRupee, Star, Car, Users, CheckCircle, ArrowLeft } from "lucide-react";
import Card, { CardHeader, CardTitle, CardContent } from "../ui/Card";
import Button from "../ui/Button";
import api from "../../lib/api";

export function SupplierAnalyticsDashboard({ supplierId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      if (!supplierId) return;
      try {
        const res = await api.get(`/suppliers/${supplierId}/analytics/overview`);
        setData(res);
      } catch (err) {
        console.error("Failed to load supplier analytics", err);
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, [supplierId]);

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-stone-500">
        Loading analytics engine...
      </div>
    );
  }

  // Real numbers only (ADR 038): an empty chart and "Not enough data", never sample values.
  const revenueTrend = data?.revenueTrend || [];
  const metrics = data?.operationalMetrics || {};
  const maxRevenue = Math.max(...revenueTrend.map((r) => r.revenue_inr), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-2xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-stone-700 dark:text-stone-300" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 font-display">
              Supplier Performance & Revenue Analytics
            </h2>
            <p className="text-xs text-stone-500">
              Track business growth, product leaderboards, and service levels.
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Revenue Bar Chart */}
      <Card elevation="sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase">Growth Velocity</span>
              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">
                Monthly Payout & Volume Trend
              </h4>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end justify-between gap-3 pt-6 px-2">
            {revenueTrend.map((item, idx) => {
              const heightPct = Math.round((item.revenue_inr / maxRevenue) * 100);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className="text-[10px] font-mono font-bold text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    ₹{(item.revenue_inr / 1000).toFixed(0)}k
                  </span>
                  <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-t-xl h-36 flex items-end overflow-hidden">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-xl transition-all duration-500 group-hover:from-amber-500 group-hover:to-amber-300"
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-stone-500 text-center whitespace-nowrap">
                    {item.month.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Operational metrics, last 90 days (ADR 038) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Median response time", metrics.medianResponseMins == null ? null : `${metrics.medianResponseMins} min`, `${metrics.responseSample || 0} answered requests`],
          ["Answered before deadline", metrics.onTimeResponsePct == null ? null : `${metrics.onTimeResponsePct}%`, `${metrics.onTimeSample || 0} requests`],
          ["No-shows", metrics.noShowPct == null ? null : `${metrics.noShowPct}%`, `${metrics.noShowSample || 0} bookings checked`],
          ["Pickup OTP verified", metrics.otpVerifiedPct == null ? null : `${metrics.otpVerifiedPct}%`, `${metrics.otpSample || 0} completed trips`],
        ].map(([label, value, sample]) => (
          <div key={label} className="p-4 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
            <span className="text-[11px] text-stone-500 font-medium">{label}</span>
            <div className={`mt-1 font-extrabold font-mono ${value ? "text-xl text-stone-900 dark:text-stone-100" : "text-sm text-stone-400"}`}>{value || "Not enough data"}</div>
            <span className="text-[10px] text-stone-400">{sample} · last {metrics.days || 90} days</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SupplierAnalyticsDashboard;
