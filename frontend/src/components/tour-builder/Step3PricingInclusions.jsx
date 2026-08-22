import React, { useState } from "react";
import {
  DollarSign,
  Car,
  UserCheck,
  Building,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Info,
  ShieldCheck,
  Sliders
} from "lucide-react";
import { COMMON_INCLUSIONS, COMMON_EXCLUSIONS } from "../../lib/tourBuilderSchema";

export default function Step3PricingInclusions({ formData, category, onChange, errors }) {
  const {
    groupType = "PRIVATE",
    vehiclePrices = { sedan: 0, suv: 0, tempo: 0 },
    seatPrice = 0,
    hotelVariants = [],
    inclusions = [],
    exclusions = [],
  } = formData;

  const [customInclusion, setCustomInclusion] = useState("");
  const [customExclusion, setCustomExclusion] = useState("");

  const handleGroupTypeChange = (type) => {
    onChange({ groupType: type });
  };

  const handleVehiclePriceChange = (categoryKey, value) => {
    onChange({
      vehiclePrices: {
        ...vehiclePrices,
        [categoryKey]: Number(value),
      },
    });
  };

  // Hotel Variant toggle handler
  const handleToggleHotelVariant = (variantId) => {
    const updated = hotelVariants.map((v) =>
      v.id === variantId ? { ...v, active: !v.active } : v
    );
    onChange({ hotelVariants: updated });
  };

  const handleHotelPriceModifierChange = (variantId, newModifier) => {
    const updated = hotelVariants.map((v) =>
      v.id === variantId ? { ...v, priceModifier: Number(newModifier) } : v
    );
    onChange({ hotelVariants: updated });
  };

  // Inclusions & Exclusions toggles
  const handleToggleInclusion = (item) => {
    if (inclusions.includes(item)) {
      onChange({ inclusions: inclusions.filter((i) => i !== item) });
    } else {
      onChange({ inclusions: [...inclusions, item] });
    }
  };

  const handleToggleExclusion = (item) => {
    if (exclusions.includes(item)) {
      onChange({ exclusions: exclusions.filter((e) => e !== item) });
    } else {
      onChange({ exclusions: [...exclusions, item] });
    }
  };

  const handleAddCustomInclusion = () => {
    const val = customInclusion.trim();
    if (!val || inclusions.includes(val)) return;
    onChange({ inclusions: [...inclusions, val] });
    setCustomInclusion("");
  };

  const handleAddCustomExclusion = () => {
    const val = customExclusion.trim();
    if (!val || exclusions.includes(val)) return;
    onChange({ exclusions: [...exclusions, val] });
    setCustomExclusion("");
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="border-b border-stone-200 pb-4">
        <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-amber-600" />
          Step 3: Vehicle Variants, Hotel Options & Inclusions
        </h2>
        <p className="text-sm text-stone-600 mt-1">
          Configure transparent pricing by vehicle type or seat, hotel upgrade options, and clear inclusion checklists.
        </p>
      </div>

      {/* 1. Group Type & Base Pricing Matrix */}
      <div className="space-y-4">
        <label className="block text-sm font-semibold text-stone-900">
          Tour Operating Mode / Group Type <span className="text-rose-500">*</span>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => handleGroupTypeChange("PRIVATE")}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
              groupType === "PRIVATE"
                ? "bg-amber-50 border-amber-500 text-stone-950 ring-2 ring-amber-400 shadow-sm"
                : "bg-[#FAF9F6] border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-white"
            }`}
          >
            <div className={`p-2.5 rounded-xl ${groupType === "PRIVATE" ? "bg-amber-500 text-stone-950 font-bold" : "bg-stone-100 text-stone-600"}`}>
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-base text-stone-900">Private Tour</div>
              <div className="text-xs text-stone-600 mt-1 leading-relaxed">
                Dedicated private vehicle for the booking party. Price per vehicle category (Sedan, SUV, Tempo).
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleGroupTypeChange("SHARED")}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
              groupType === "SHARED"
                ? "bg-amber-50 border-amber-500 text-stone-950 ring-2 ring-amber-400 shadow-sm"
                : "bg-[#FAF9F6] border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-white"
            }`}
          >
            <div className={`p-2.5 rounded-xl ${groupType === "SHARED" ? "bg-amber-500 text-stone-950 font-bold" : "bg-stone-100 text-stone-600"}`}>
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-base text-stone-900">Shared Tour (Per Seat)</div>
              <div className="text-xs text-stone-600 mt-1 leading-relaxed">
                Join-in group tour. Price per seat / traveler. Ideal for fixed departure sightseeing buses or vans.
              </div>
            </div>
          </button>
        </div>

        {/* Pricing Inputs according to Group Type */}
        {groupType === "PRIVATE" ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Car className="w-4 h-4 text-amber-600" />
              Private Tour Pricing Matrix (Per Vehicle Category in INR ₹)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Sedan */}
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-stone-900">
                  <span>AC Sedan (Swift Dzire / Etios)</span>
                  <span className="text-stone-500">1 - 4 Pax</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-stone-400 text-xs font-mono">₹</span>
                  <input
                    type="number"
                    value={vehiclePrices.sedan || ""}
                    onChange={(e) => handleVehiclePriceChange("sedan", e.target.value)}
                    placeholder="2499"
                    className="w-full bg-white border border-stone-300 rounded-lg pl-7 pr-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* SUV */}
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-stone-900">
                  <span>AC SUV (Ertiga / Innova)</span>
                  <span className="text-stone-500">1 - 6 Pax</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-stone-400 text-xs font-mono">₹</span>
                  <input
                    type="number"
                    value={vehiclePrices.suv || ""}
                    onChange={(e) => handleVehiclePriceChange("suv", e.target.value)}
                    placeholder="3499"
                    className="w-full bg-white border border-stone-300 rounded-lg pl-7 pr-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Tempo Traveller */}
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-stone-900">
                  <span>Tempo Traveller</span>
                  <span className="text-stone-500">1 - 12 Pax</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-stone-400 text-xs font-mono">₹</span>
                  <input
                    type="number"
                    value={vehiclePrices.tempo || ""}
                    onChange={(e) => handleVehiclePriceChange("tempo", e.target.value)}
                    placeholder="6999"
                    className="w-full bg-white border border-stone-300 rounded-lg pl-7 pr-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>
            </div>
            {errors?.vehiclePrices?.sedan && (
              <p className="text-xs text-rose-600 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> {errors.vehiclePrices.sedan}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-600" />
              Shared Join-In Tour Pricing (Per Seat in INR ₹)
            </h3>
            <div className="max-w-md">
              <label className="block text-xs text-stone-600 font-bold mb-1">Price per Adult Seat</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-stone-400 text-xs font-mono">₹</span>
                <input
                  type="number"
                  value={seatPrice || ""}
                  onChange={(e) => onChange({ seatPrice: Number(e.target.value) })}
                  placeholder="899"
                  className="w-full bg-white border border-stone-300 rounded-xl pl-7 pr-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
              {errors?.seatPrice && (
                <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" /> {errors.seatPrice}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Hotel Variants Toggle (For Multi-Day Tours) */}
      {category === "MULTI_DAY" && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-4 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Building className="w-4 h-4 text-amber-600" />
              Hotel Stay Variants & Price Modifiers
            </h3>
            <p className="text-xs text-stone-600 mt-0.5">
              Allow travelers to choose between cab-only or packages bundled with 3-Star, 4-Star or 5-Star stays.
            </p>
          </div>

          <div className="space-y-3">
            {hotelVariants.map((variant) => (
              <div
                key={variant.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  variant.active
                    ? "bg-[#FAF9F6] border-amber-500 ring-1 ring-amber-400"
                    : "bg-stone-50 border-stone-200 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={variant.active}
                    onChange={() => handleToggleHotelVariant(variant.id)}
                    className="w-4 h-4 text-amber-500 bg-white border-stone-300 rounded focus:ring-amber-400 accent-amber-500 cursor-pointer"
                  />
                  <div>
                    <div className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      {variant.name}
                      {variant.priceModifier === 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-mono font-bold">
                          Base Option
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500">{variant.description}</div>
                  </div>
                </div>

                {variant.active && variant.id !== "cab_only" && (
                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <span className="text-xs text-stone-600 font-medium whitespace-nowrap">Modifier (+ ₹ / pax):</span>
                    <div className="relative w-32">
                      <span className="absolute left-2.5 top-1.5 text-stone-400 text-xs font-mono">₹</span>
                      <input
                        type="number"
                        value={variant.priceModifier}
                        onChange={(e) => handleHotelPriceModifierChange(variant.id, e.target.value)}
                        className="w-full bg-white border border-stone-300 rounded-lg pl-6 pr-2 py-1 text-stone-900 text-xs font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Inclusions & Exclusions Checklist with Quick Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Inclusions */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Inclusions Checklist ({inclusions.length} Selected) <span className="text-rose-500">*</span>
            </h3>
          </div>

          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
            {COMMON_INCLUSIONS.map((item) => {
              const isSelected = inclusions.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleToggleInclusion(item)}
                  className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 text-left ${
                    isSelected
                      ? "bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold shadow-sm"
                      : "bg-[#FAF9F6] text-stone-600 border-stone-200 hover:border-stone-300 hover:bg-white"
                  }`}
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 ${isSelected ? "text-emerald-600" : "text-stone-400"}`} />
                  {item}
                </button>
              );
            })}
          </div>

          {/* Custom Inclusion Input */}
          <div className="flex gap-2 pt-2 border-t border-stone-200">
            <input
              type="text"
              value={customInclusion}
              onChange={(e) => setCustomInclusion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomInclusion();
                }
              }}
              placeholder="Custom inclusion (e.g. Free SIM Card)..."
              className="bg-[#FAF9F6] border border-stone-300 rounded-xl px-3 py-1.5 text-stone-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white flex-1"
            />
            <button
              type="button"
              onClick={handleAddCustomInclusion}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-sm"
            >
              + Add
            </button>
          </div>
          {errors?.inclusions && (
            <p className="text-xs text-rose-600 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> {errors.inclusions}
            </p>
          )}
        </div>

        {/* Exclusions */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-rose-800 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-rose-600" />
              Exclusions Checklist ({exclusions.length} Selected)
            </h3>
          </div>

          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
            {COMMON_EXCLUSIONS.map((item) => {
              const isSelected = exclusions.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleToggleExclusion(item)}
                  className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 text-left ${
                    isSelected
                      ? "bg-rose-100 text-rose-900 border-rose-300 font-semibold shadow-sm"
                      : "bg-[#FAF9F6] text-stone-600 border-stone-200 hover:border-stone-300 hover:bg-white"
                  }`}
                >
                  <XCircle className={`w-3.5 h-3.5 ${isSelected ? "text-rose-600" : "text-stone-400"}`} />
                  {item}
                </button>
              );
            })}
          </div>

          {/* Custom Exclusion Input */}
          <div className="flex gap-2 pt-2 border-t border-stone-200">
            <input
              type="text"
              value={customExclusion}
              onChange={(e) => setCustomExclusion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomExclusion();
                }
              }}
              placeholder="Custom exclusion (e.g. Alcohol, Laundry)..."
              className="bg-[#FAF9F6] border border-stone-300 rounded-xl px-3 py-1.5 text-stone-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white flex-1"
            />
            <button
              type="button"
              onClick={handleAddCustomExclusion}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-sm"
            >
              + Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
