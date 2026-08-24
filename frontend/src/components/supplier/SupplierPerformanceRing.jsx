import React from "react";
import { Star, ShieldCheck, Award } from "lucide-react";
import Card, { CardHeader, CardTitle, CardContent } from "../ui/Card";

export function SupplierPerformanceRing({ stats }) {
  const rating = stats?.ratings?.avg || 4.8;
  const completionRate = stats?.ratings?.completion_rate || 98;
  const cancellationRate = stats?.ratings?.cancellation_rate || 1.2;

  // SVG Circular Gauge
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completionRate / 100) * circumference;

  return (
    <Card elevation="sm" className="border-stone-200 dark:border-stone-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Quality Score</span>
            <h4 className="text-base font-bold font-display text-stone-900 dark:text-stone-100">Performance</h4>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-around gap-4 py-1">
          {/* Circular Ring Gauge */}
          <div className="relative flex items-center justify-center">
            <svg width="84" height="84" className="transform -rotate-90">
              <circle
                cx="42"
                cy="42"
                r={radius}
                stroke="currentColor"
                strokeWidth="7"
                fill="transparent"
                className="text-stone-100 dark:text-stone-800"
              />
              <circle
                cx="42"
                cy="42"
                r={radius}
                stroke="#10B981"
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100 font-mono">
                {completionRate}%
              </span>
              <span className="text-[9px] text-stone-400 font-medium uppercase">Fulfillment</span>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-amber-500">
                <Star className="w-4 h-4 fill-amber-500" />
                <span className="text-base font-bold text-stone-900 dark:text-stone-100 font-mono">{rating}</span>
              </div>
              <span className="text-xs text-stone-500">Avg Rating</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-700 dark:text-stone-300 font-mono">
                {cancellationRate}%
              </span>
              <span className="text-xs text-stone-500">Cancellation Rate</span>
            </div>

            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified Tier 1 Supplier
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default SupplierPerformanceRing;
