import React from "react";

export function Card({
  children,
  className = "",
  elevation = "sm",
  hover = false,
  ...props
}) {
  const elevations = {
    none: "border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900",
    sm: "border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm",
    md: "border border-stone-200/60 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-md",
    lg: "border border-stone-200/50 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xl",
  };

  const hoverStyle = hover ? "hover:-translate-y-1 hover:shadow-xl transition-all duration-300" : "";

  return (
    <div
      className={`rounded-3xl p-6 ${elevations[elevation] || elevations.sm} ${hoverStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }) {
  return <div className={`mb-4 flex items-center justify-between ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }) {
  return <h3 className={`text-lg font-bold text-stone-900 dark:text-stone-100 font-display ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = "" }) {
  return <p className={`text-xs text-stone-500 dark:text-stone-400 mt-0.5 ${className}`}>{children}</p>;
}

export function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = "" }) {
  return <div className={`mt-4 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between ${className}`}>{children}</div>;
}

export default Card;
