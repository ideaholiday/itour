import React from "react";
import {
  Compass,
  MapPin,
  Clock,
  Calendar,
  Zap,
  Building,
  CheckCircle2,
  Eye,
  ShieldCheck,
  Tag,
  Sparkles
} from "lucide-react";

export default function TourPreviewSidebar({ formData, activeStep }) {
  const { step1, step2, step3, step4 } = formData;

  const isDayTour = step1?.category === "DAY_TOUR";

  // Calculate starting display price
  let basePrice = 0;
  if (step3?.groupType === "PRIVATE") {
    basePrice = step3?.vehiclePrices?.sedan || step3?.vehiclePrices?.suv || 0;
  } else {
    basePrice = step3?.seatPrice || 0;
  }

  const multiplier = step4?.seasonalMultiplier || 1.0;
  const finalPrice = Math.round(basePrice * multiplier);

  return (
    <div className="sticky top-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-amber-600" /> Live Marketplace Card Preview
        </h3>
        <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-mono font-bold">
          Step {activeStep} of 4 Active
        </span>
      </div>

      {/* Ticket Card Component */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-xl space-y-4 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl pointer-events-none"></div>

        {/* Category & City Badges */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          <span className="bg-amber-500 text-stone-950 text-[11px] font-bold px-2.5 py-1 rounded-xl uppercase tracking-wide flex items-center gap-1 shadow-sm">
            <Compass className="w-3.5 h-3.5 text-stone-950" />
            {isDayTour ? "Day Sightseeing" : "Multi-Day Package"}
          </span>
          <span className="bg-[#FAF9F6] text-stone-700 border border-stone-200 px-2.5 py-1 rounded-xl flex items-center gap-1 font-medium">
            <MapPin className="w-3.5 h-3.5 text-amber-600" />
            {step1?.city || "Primary City"}
          </span>
        </div>

        {/* Title */}
        <div>
          <h4 className="text-base font-bold text-stone-900 line-clamp-2 leading-snug">
            {step1?.title || "Untitled Sightseeing Tour Package"}
          </h4>
          <p className="text-xs text-stone-600 mt-1 line-clamp-2 leading-relaxed">
            {step1?.shortDescription || "Add short summary in Step 1 to preview here..."}
          </p>
        </div>

        {/* Duration & Group Mode */}
        <div className="grid grid-cols-2 gap-2 bg-[#FAF9F6] p-2.5 rounded-2xl border border-stone-200 text-xs">
          <div>
            <span className="text-[10px] text-stone-500 block uppercase font-bold">Duration</span>
            <span className="font-bold text-stone-900 flex items-center gap-1 mt-0.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              {isDayTour
                ? `${step1?.durationHours || 8} Hours`
                : `${step1?.durationNights || 2}N / ${step1?.durationDays || 3}D`}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-stone-500 block uppercase font-bold">Operating Mode</span>
            <span className="font-bold text-stone-900 flex items-center gap-1 mt-0.5">
              <Tag className="w-3.5 h-3.5 text-amber-600" />
              {step3?.groupType === "PRIVATE" ? "Private Cab" : "Shared / Seat"}
            </span>
          </div>
        </div>

        {/* Itinerary Preview */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block mb-1.5">
            {isDayTour ? "Sightseeing Highlights" : "Day-by-Day Itinerary"}
          </span>
          {isDayTour ? (
            <div className="space-y-1">
              {(step2?.dayStops || []).slice(0, 3).map((stop, idx) => (
                <div key={idx} className="text-xs text-stone-700 flex items-center gap-1.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  <span className="truncate">{stop.name || `Stop ${idx + 1}`}</span>
                </div>
              ))}
              {(step2?.dayStops || []).length > 3 && (
                <div className="text-[10px] text-amber-700 font-bold">
                  + {step2.dayStops.length - 3} more attraction stops
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {(step2?.itinerary || []).slice(0, 3).map((day, idx) => (
                <div key={idx} className="text-xs text-stone-700 flex items-center gap-1.5 truncate">
                  <span className="font-mono font-bold text-amber-700 text-[11px]">D{day.day}:</span>
                  <span className="truncate">{day.title || `Day ${day.day} Plan`}</span>
                </div>
              ))}
              {(step2?.itinerary || []).length > 3 && (
                <div className="text-[10px] text-amber-700 font-bold">
                  + {step2.itinerary.length - 3} more day plans
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hotel Upgrade Badge for Multi-Day */}
        {!isDayTour && (step3?.hotelVariants || []).some((h) => h.active && h.id !== "cab_only") && (
          <div className="bg-amber-50 border border-amber-200 p-2 rounded-xl text-xs text-amber-950 flex items-center gap-2 font-medium">
            <Building className="w-4 h-4 text-amber-600" />
            <span>Includes 3-Star & 4-Star Stay Upgrades</span>
          </div>
        )}

        {/* Inclusions count */}
        <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{(step3?.inclusions || []).length} Verified Inclusions Attached</span>
        </div>

        {/* Booking Confirmation Mode */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-200 text-xs">
          <span className="text-stone-500 font-medium">Booking SLA:</span>
          {step4?.bookingMode === "INSTANT" ? (
            <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-700" /> Instant Confirmation
            </span>
          ) : (
            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-700" /> {step4?.approvalTimeLimitHours || 2}h Approval SLA
            </span>
          )}
        </div>

        {/* Pricing Box */}
        <div className="bg-[#FAF9F6] p-3 rounded-2xl border border-stone-200 flex items-center justify-between shadow-inner">
          <div>
            <span className="text-[10px] text-stone-500 uppercase font-bold block">Starting Price</span>
            {multiplier > 1.0 && (
              <span className="text-[10px] text-amber-700 font-bold flex items-center gap-0.5">
                <Sparkles className="w-3 h-3" /> Peak Multiplier {multiplier}x
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-xs text-stone-500">From </span>
            <span className="text-lg font-black text-amber-800 font-mono">₹{finalPrice.toLocaleString("en-IN")}</span>
            <span className="text-[10px] text-stone-500 block">
              {step3?.groupType === "PRIVATE" ? "per vehicle" : "per seat"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
