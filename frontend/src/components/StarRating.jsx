import React from "react";

/**
 * A rating is shown only when travelers have actually left one. `rating` of
 * null/undefined means no verified review yet, which reads as a NEW chip —
 * never as a placeholder star count.
 */
export default function StarRating({ rating, count, size = "sm", newLabel = "New" }) {
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  const value = Number(rating);
  const hasRating = Number.isFinite(value) && value > 0 && count !== 0;

  if (!hasRating) {
    return (
      <span className={`inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 font-semibold text-stone-500 ${textSize}`}>
        {newLabel}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${textSize}`}>
      <span className="text-genda-deep">★</span>
      <span className="font-semibold text-ink">{value.toFixed(1)}</span>
      {count != null && <span className="text-ink/40">({count.toLocaleString("en-IN")})</span>}
    </span>
  );
}
