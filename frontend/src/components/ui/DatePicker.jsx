import React from "react";
import { Calendar } from "lucide-react";

export function toLocalISO(date = new Date()) {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DatePicker({
  label,
  value,
  onChange,
  min,
  max,
  error,
  helperText,
  required = false,
  className = "",
  id,
}) {
  const inputId = id || (label ? `date-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1.5"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
          <Calendar className="w-4 h-4" />
        </div>
        <input
          id={inputId}
          type="date"
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          required={required}
          className={`w-full rounded-2xl border transition-all duration-200 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
            error
              ? "border-red-400 focus:ring-red-400/30 focus:border-red-500"
              : "border-stone-200 dark:border-stone-700 focus:ring-amber-500/30 focus:border-amber-500"
          }`}
        />
      </div>
      {error ? (
        <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
}

export default DatePicker;
