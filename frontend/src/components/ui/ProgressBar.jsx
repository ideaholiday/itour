import React from "react";
import { Check } from "lucide-react";

export function ProgressBar({ steps = [], currentStep = 0, className = "" }) {
  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between relative">
        {/* Background track line */}
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-stone-200 dark:bg-stone-800 -translate-y-1/2 z-0" />
        {/* Active track fill */}
        <div
          className="absolute top-1/2 left-0 h-1 bg-amber-500 -translate-y-1/2 z-0 transition-all duration-300"
          style={{
            width: steps.length > 1 ? `${(currentStep / (steps.length - 1)) * 100}%` : "0%",
          }}
        />

        {steps.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isCurrent = idx === currentStep;

          return (
            <div key={idx} className="relative z-10 flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-200 shadow-sm ${
                  isCompleted
                    ? "bg-amber-500 text-white"
                    : isCurrent
                    ? "bg-stone-900 dark:bg-white text-white dark:text-stone-900 ring-4 ring-amber-500/20"
                    : "bg-stone-100 dark:bg-stone-800 text-stone-400 border border-stone-300 dark:border-stone-700"
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
              </div>
              <span
                className={`text-[11px] font-semibold mt-2 whitespace-nowrap ${
                  isCurrent
                    ? "text-stone-900 dark:text-stone-100"
                    : isCompleted
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-stone-400"
                }`}
              >
                {step.title || step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProgressBar;
