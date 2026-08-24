import React from "react";
import { Store, ShieldCheck, Award, Star, Clock, CheckCircle2, MessageCircle } from "lucide-react";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";

export function SupplierProfileCard({
  supplier = {},
  onContactHost,
}) {
  return (
    <div className="p-5 sm:p-6 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar
            name={supplier.company_name || supplier.contact_name || "Host"}
            size="lg"
            className="ring-2 ring-amber-500/20"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">
                {supplier.company_name || "Idea Holiday Local Host"}
              </h4>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded-md">
                <ShieldCheck className="w-3 h-3" />
                Verified Partner
              </span>
            </div>
            <span className="text-xs text-stone-500">
              Host since {supplier.joined_year || "2024"} · {supplier.city || "India"}
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center gap-1 text-amber-500 justify-end">
            <Star className="w-4 h-4 fill-amber-500" />
            <span className="text-sm font-bold font-mono text-stone-900 dark:text-stone-100">
              {supplier.rating || 4.9}
            </span>
          </div>
          <span className="text-[10px] text-stone-400">100+ Trips</span>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
        <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/40 text-center">
          <span className="text-[10px] text-stone-400 block">Response Rate</span>
          <span className="text-xs font-bold text-stone-900 dark:text-stone-100">99% (&lt; 15m)</span>
        </div>
        <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/40 text-center">
          <span className="text-[10px] text-stone-400 block">Fulfillment</span>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">99.4% Completed</span>
        </div>
        <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/40 text-center col-span-2 sm:col-span-1">
          <span className="text-[10px] text-stone-400 block">Safety & Insurance</span>
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Insured Fleet</span>
        </div>
      </div>

      {onContactHost && (
        <Button
          size="sm"
          variant="outline"
          icon={MessageCircle}
          onClick={onContactHost}
          className="w-full"
        >
          Message Host
        </Button>
      )}
    </div>
  );
}

export default SupplierProfileCard;
