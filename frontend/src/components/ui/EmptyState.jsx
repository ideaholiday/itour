import React from "react";
import { Compass } from "lucide-react";
import Button from "./Button";

export function EmptyState({
  icon: Icon = Compass,
  title = "No data found",
  description = "There is nothing to display here yet.",
  actionLabel,
  onAction,
  className = "",
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-3xl border border-dashed border-stone-300 dark:border-stone-700 bg-white/50 dark:bg-stone-900/50 ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 shadow-sm">
        <Icon className="w-7 h-7" />
      </div>
      <h4 className="text-base font-bold text-stone-900 dark:text-stone-100 font-display mb-1">{title}</h4>
      <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 max-w-sm mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
