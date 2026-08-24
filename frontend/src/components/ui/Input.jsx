import React, { forwardRef } from "react";

export const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    icon: Icon,
    className = "",
    id,
    type = "text",
    required = false,
    ...props
  },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-1.5"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          required={required}
          className={`w-full rounded-2xl border transition-all duration-200 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 ${
            Icon ? "pl-10" : "pl-4"
          } pr-4 py-2.5 text-sm ${
            error
              ? "border-red-400 focus:ring-red-400/30 focus:border-red-500"
              : "border-stone-200 dark:border-stone-700 focus:ring-amber-500/30 focus:border-amber-500"
          } ${className}`}
          {...props}
        />
      </div>
      {error ? (
        <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Input;
