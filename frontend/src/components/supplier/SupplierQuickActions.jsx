import React from "react";
import { PlusCircle, Calendar, Users, IndianRupee, Sparkles, BarChart3 } from "lucide-react";
import Card, { CardHeader, CardTitle, CardContent } from "../ui/Card";

export function SupplierQuickActions({
  onNewListing,
  onManageFleet,
  onBlockDates,
  onViewAnalytics,
  onViewPayouts,
}) {
  const actions = [
    { label: "New Listing", icon: PlusCircle, onClick: onNewListing, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
    { label: "Fleet & Drivers", icon: Users, onClick: onManageFleet, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40" },
    { label: "Block Dates", icon: Calendar, onClick: onBlockDates, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40" },
    { label: "Analytics", icon: BarChart3, onClick: onViewAnalytics, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
    { label: "Payouts & Bank", icon: IndianRupee, onClick: onViewPayouts, color: "text-stone-700 bg-stone-100 dark:bg-stone-800" },
  ];

  return (
    <Card elevation="sm" className="border-stone-200 dark:border-stone-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Shortcuts</span>
            <h4 className="text-base font-bold font-display text-stone-900 dark:text-stone-100">Quick Actions</h4>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {actions.map((act, idx) => {
            const Icon = act.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={act.onClick}
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-stone-200/70 dark:border-stone-800 hover:border-amber-400/80 bg-stone-50/50 dark:bg-stone-900/50 hover:bg-white dark:hover:bg-stone-800 transition-all text-left group shadow-xs"
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${act.color}`}>
                  <Icon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </div>
                <span className="text-xs font-bold text-stone-800 dark:text-stone-200 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                  {act.label}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default SupplierQuickActions;
