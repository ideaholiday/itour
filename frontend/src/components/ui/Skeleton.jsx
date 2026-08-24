import React from "react";

export function Skeleton({
  variant = "rect",
  className = "",
  width,
  height,
}) {
  const variants = {
    text: "h-4 rounded-lg",
    circle: "rounded-full aspect-square",
    rect: "rounded-2xl",
    card: "h-64 rounded-3xl",
  };

  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div
      style={style}
      className={`animate-pulse bg-stone-200 dark:bg-stone-800 ${variants[variant] || variants.rect} ${className}`}
    />
  );
}

export function TicketCardSkeleton() {
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-5 shadow-sm space-y-4">
      <Skeleton variant="rect" className="h-44 w-full" />
      <div className="space-y-2">
        <Skeleton variant="text" className="w-3/4 h-5" />
        <Skeleton variant="text" className="w-1/2 h-4" />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
        <Skeleton variant="text" className="w-20 h-6" />
        <Skeleton variant="rect" className="w-24 h-9" />
      </div>
    </div>
  );
}

export default Skeleton;
