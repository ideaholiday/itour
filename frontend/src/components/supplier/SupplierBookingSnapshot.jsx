import React from "react";
import { Car, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import Card, { CardHeader, CardTitle, CardContent } from "../ui/Card";
import Badge from "../ui/Badge";

export function SupplierBookingSnapshot({ stats }) {
  const today = stats?.today || {};
  const alerts = stats?.alerts || [];

  return (
    <Card elevation="sm" className="border-stone-200 dark:border-stone-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Car className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Operations</span>
            <h4 className="text-base font-bold font-display text-stone-900 dark:text-stone-100">Today's Trip Snapshot</h4>
          </div>
        </div>
        <Badge variant={today.trips_in_progress > 0 ? "success" : "neutral"}>
          {today.bookings || 0} Total Today
        </Badge>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-3 gap-2 text-center py-1">
          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-2xl">
            <div className="flex items-center justify-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
              <Clock className="w-3.5 h-3.5" />
              <span>In Progress</span>
            </div>
            <div className="text-xl font-bold text-amber-900 dark:text-amber-100 mt-1 font-mono">
              {today.trips_in_progress || 0}
            </div>
          </div>

          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 rounded-2xl">
            <div className="flex items-center justify-center gap-1 text-xs font-semibold text-blue-800 dark:text-blue-300">
              <Car className="w-3.5 h-3.5" />
              <span>Upcoming</span>
            </div>
            <div className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1 font-mono">
              {today.trips_upcoming || 0}
            </div>
          </div>

          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-2xl">
            <div className="flex items-center justify-center gap-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Completed</span>
            </div>
            <div className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mt-1 font-mono">
              {today.trips_completed || 0}
            </div>
          </div>
        </div>

        {alerts.length > 0 && (
          <div className="mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-red-800 dark:text-red-300">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{alerts.length} Pending Assignment Action</span>
            </div>
            <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
              {alerts[0].deadline}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SupplierBookingSnapshot;
