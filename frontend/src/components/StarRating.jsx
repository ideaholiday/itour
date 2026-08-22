import React from "react";

export default function StarRating({ rating, count, size = "sm" }) {
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  return (
    <span className={`inline-flex items-center gap-1 ${textSize}`}>
      <span className="text-genda-deep">★</span>
      <span className="font-semibold text-ink">{rating?.toFixed(1)}</span>
      {count != null && <span className="text-ink/40">({count.toLocaleString("en-IN")})</span>}
    </span>
  );
}
