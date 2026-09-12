import React from "react";

/**
 * Skeleton — shimmer-wave loading placeholder.
 *
 * Usage:
 *   <Skeleton className="h-52 w-full rounded-2xl" />
 *   <Skeleton variant="text" lines={3} />
 *   <Skeleton variant="card" />
 *   <Skeleton variant="hero" />
 *   <Skeleton variant="avatar" size="md" />
 */

function Skeleton({ className = "", dark = false }) {
  return (
    <div
      className={`${dark ? "shimmer-dark" : "shimmer"} rounded-xl ${className}`}
      aria-hidden="true"
    />
  );
}

function SkeletonText({ lines = 1, dark = false, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-3.5 rounded-lg ${dark ? "shimmer-dark" : "shimmer"} ${
            i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"
          }`}
        />
      ))}
    </div>
  );
}

function SkeletonAvatar({ size = "md", dark = false, className = "" }) {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-20 w-20",
  };
  return (
    <div
      className={`${sizes[size] || sizes.md} rounded-full flex-shrink-0 ${dark ? "shimmer-dark" : "shimmer"} ${className}`}
      aria-hidden="true"
    />
  );
}

/** Full experience/ticket card skeleton */
function SkeletonCard({ dark = false, className = "" }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border ${dark ? "border-stone-800 bg-stone-900" : "border-stone-100 bg-white"} shadow-sm ${className}`}
      aria-hidden="true"
    >
      {/* Image */}
      <div className={`aspect-[4/3] ${dark ? "shimmer-dark" : "shimmer"}`} />
      {/* Body */}
      <div className="p-4 space-y-3">
        <SkeletonText lines={2} dark={dark} />
        <div className="flex items-center gap-2">
          <div className={`h-3 w-12 rounded-full ${dark ? "shimmer-dark" : "shimmer"}`} />
          <div className={`h-3 w-16 rounded-full ${dark ? "shimmer-dark" : "shimmer"}`} />
        </div>
        <div className={`h-px w-full ${dark ? "bg-stone-800" : "bg-stone-100"}`} />
        <div className="flex items-center justify-between">
          <div className={`h-3 w-10 rounded-full ${dark ? "shimmer-dark" : "shimmer"}`} />
          <div className={`h-6 w-20 rounded-lg ${dark ? "shimmer-dark" : "shimmer"}`} />
        </div>
      </div>
    </div>
  );
}

/** Hero banner skeleton */
function SkeletonHero({ dark = false }) {
  return (
    <div className={`w-full h-[92vh] ${dark ? "shimmer-dark" : "shimmer"}`} aria-hidden="true" />
  );
}

/** Destination mosaic tile skeleton */
function SkeletonDestination({ large = false, dark = false, className = "" }) {
  return (
    <div
      className={`overflow-hidden rounded-3xl ${dark ? "shimmer-dark" : "shimmer"} ${
        large ? "col-span-2 row-span-2" : ""
      } ${className}`}
      aria-hidden="true"
    />
  );
}

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonHero,
  SkeletonDestination,
};
export default Skeleton;
