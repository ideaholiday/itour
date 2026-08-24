import React, { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

export const Select = forwardRef(function Select(
  {
    label,
    options = [],
    error,
    helperText,
    className = "",
    id,
    required = false,
    children,
    ...props
  },
  ref
) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1.5"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          required={required}
          className={`w-full appearance-none rounded-2xl border transition-all duration-200 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 ${
            error
              ? "border-red-400 focus:ring-red-400/30 focus:border-red-500"
              : "border-stone-200 dark:border-stone-700 focus:ring-amber-500/30 focus:border-amber-500"
          } ${className}`}
          {...props}
        >
          {children ||
            options.map((opt) => (
              <option key={opt.value ?? opt} value={opt.value ?? opt}>
                {opt.label ?? opt}
              </option>
            ))}
        </select>
        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-stone-400">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
      {error ? (
        <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Select;
