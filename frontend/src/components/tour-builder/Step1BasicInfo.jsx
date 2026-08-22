import React, { useState } from "react";
import { Compass, Clock, CalendarDays, FileText, Info, Sparkles, Wand2, Check, X, MapPin } from "lucide-react";
import CityStateCountrySelect from "../supplier/CityStateCountrySelect.jsx";
import { INDIA_TOUR_PRESETS } from "../../lib/indiaTourPresets.js";

export default function Step1BasicInfo({ formData, onChange, onApplyPreset, errors }) {
  const { title, city, state, category, durationHours, durationNights, durationDays, shortDescription } = formData;
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [selectedCityFilter, setSelectedCityFilter] = useState("ALL");

  const handleCategoryChange = (newCategory) => {
    onChange({
      category: newCategory,
      durationHours: newCategory === "DAY_TOUR" ? 8 : undefined,
      durationDays: newCategory === "MULTI_DAY" ? 3 : undefined,
      durationNights: newCategory === "MULTI_DAY" ? 2 : undefined,
    });
  };

  const filteredPresets = selectedCityFilter === "ALL"
    ? INDIA_TOUR_PRESETS
    : INDIA_TOUR_PRESETS.filter((p) => p.city.toLowerCase() === selectedCityFilter.toLowerCase());

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header with Quick Template Loader */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-amber-600" />
            Step 1: Basic Information & Tour Archetype
          </h2>
          <p className="text-xs text-stone-600 mt-1">
            Provide details or pick from ready-made Indian tourist presets to launch in under 2 minutes.
          </p>
        </div>

        {onApplyPreset && (
          <button
            type="button"
            onClick={() => setShowPresetModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-950 hover:bg-amber-100 transition shadow-sm"
          >
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span>Load Indian Tour Template</span>
          </button>
        )}
      </div>

      {/* Preset Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-3xl w-full bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                  INDIA MARKETPLACE PRESETS
                </span>
                <h3 className="text-lg font-serif font-bold text-stone-900 mt-1">
                  Choose a Ready-to-Sell Indian Experience
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* City Filter Pills */}
            <div className="flex flex-wrap gap-2">
              {["ALL", "Goa", "Agra", "Jaipur", "Rishikesh", "Delhi"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCityFilter(c)}
                  className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                    selectedCityFilter === c
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-[#FAF9F6] border border-stone-200 text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {c === "ALL" ? "All Indian Cities" : c}
                </button>
              ))}
            </div>

            {/* Preset Cards Grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 flex flex-col justify-between hover:border-amber-400 hover:bg-white transition"
                >
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-stone-500 font-mono">
                      <span className="font-bold text-amber-800 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {preset.city}, {preset.state}
                      </span>
                      <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
                        {preset.category === "MULTI_DAY" ? `${preset.durationDays}D / ${preset.durationNights}N` : `${preset.durationHours} Hours`}
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-stone-900 leading-snug">
                      {preset.title}
                    </h4>
                    <p className="mt-1.5 text-xs text-stone-600 line-clamp-2 leading-relaxed">
                      {preset.shortDescription}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3">
                    <span className="font-mono text-xs font-bold text-emerald-800">
                      From ₹{Number(preset.priceInr).toLocaleString("en-IN")}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyPreset(preset);
                        setShowPresetModal(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-bold text-stone-950 shadow-sm transition"
                    >
                      <Check className="h-3 w-3" /> Auto-Fill Template
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Product Category Selector */}
      <div>
        <label className="block text-sm font-semibold text-stone-900 mb-2">
          Product Category <span className="text-rose-500">*</span>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => handleCategoryChange("DAY_TOUR")}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
              category === "DAY_TOUR"
                ? "bg-amber-50 border-amber-500 text-stone-950 ring-2 ring-amber-400 shadow-sm"
                : "bg-[#FAF9F6] border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-white"
            }`}
          >
            <div className={`p-2.5 rounded-xl ${category === "DAY_TOUR" ? "bg-amber-500 text-stone-950 font-bold" : "bg-stone-100 text-stone-600"}`}>
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-base text-stone-900">Sightseeing & Day Excursions</div>
              <div className="text-xs text-stone-600 mt-1 leading-relaxed">
                City monument tours, heritage walks, scuba/water sports, or river boat rides completed within 1 to 24 hours.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleCategoryChange("MULTI_DAY")}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
              category === "MULTI_DAY"
                ? "bg-amber-50 border-amber-500 text-stone-950 ring-2 ring-amber-400 shadow-sm"
                : "bg-[#FAF9F6] border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-white"
            }`}
          >
            <div className={`p-2.5 rounded-xl ${category === "MULTI_DAY" ? "bg-amber-500 text-stone-950 font-bold" : "bg-stone-100 text-stone-600"}`}>
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-base text-stone-900">Multi-Day Holiday Package</div>
              <div className="text-xs text-stone-600 mt-1 leading-relaxed">
                Multi-day holiday circuits with day-wise itineraries, private transport, and optional hotel tiers.
              </div>
            </div>
          </button>
        </div>
        {errors?.category && (
          <p className="text-xs text-rose-600 mt-1.5 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> {errors.category}
          </p>
        )}
      </div>

      {/* Product Title */}
      <div>
        <label className="block text-sm font-semibold text-stone-900 mb-1.5">
          Product Title <span className="text-rose-500">*</span>
        </label>
        <input
          type="text"
          value={title || ""}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="e.g. Goa Grand Island Scuba Diving with 5 Water Sports Combo"
          className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl px-4 py-3 text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition"
        />
        <div className="flex justify-between items-center mt-1">
          {errors?.title ? (
            <p className="text-xs text-rose-600 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> {errors.title}
            </p>
          ) : (
            <p className="text-xs text-stone-500">Make it clear, catchy, and include key highlight locations.</p>
          )}
          <span className="text-xs text-stone-500">{(title || "").length}/100</span>
        </div>
      </div>

      <CityStateCountrySelect city={city} state={state} errors={errors} onChange={onChange} />

      {/* Dynamic Duration Inputs */}
      <div>
        {category === "DAY_TOUR" ? (
          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" /> Sightseeing / Activity Duration (Hours) <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="24"
                value={durationHours || ""}
                onChange={(e) => onChange({ durationHours: Number(e.target.value) })}
                placeholder="8"
                className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl px-4 py-3 text-stone-900 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
              <span className="text-sm font-semibold text-stone-600 whitespace-nowrap">Hours</span>
            </div>
            {errors?.durationHours && (
              <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> {errors.durationHours}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-1.5 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-amber-600" /> Package Duration (Nights / Days) <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-stone-600 mb-1">Nights</div>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={durationNights || ""}
                  onChange={(e) => onChange({ durationNights: Number(e.target.value) })}
                  placeholder="3"
                  className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl px-3 py-2.5 text-stone-900 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition"
                />
              </div>
              <div>
                <div className="text-xs text-stone-600 mb-1">Days</div>
                <input
                  type="number"
                  min="2"
                  max="31"
                  value={durationDays || ""}
                  onChange={(e) => onChange({ durationDays: Number(e.target.value) })}
                  placeholder="4"
                  className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl px-3 py-2.5 text-stone-900 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition"
                />
              </div>
            </div>
            {(errors?.durationDays || errors?.durationNights) && (
              <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> {errors.durationDays || errors.durationNights}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Short Summary Description */}
      <div>
        <label className="block text-sm font-semibold text-stone-900 mb-1.5 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-amber-600" /> Short Experience Summary <span className="text-rose-500">*</span>
        </label>
        <textarea
          rows={5}
          value={shortDescription || ""}
          onChange={(e) => onChange({ shortDescription: e.target.value })}
          maxLength={1500}
          placeholder="Briefly describe what travelers will experience, see, and enjoy during this tour."
          className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-3.5 text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition resize-none"
        />
        <div className="flex justify-between items-center mt-1">
          {errors?.shortDescription ? (
            <p className="text-xs text-rose-600 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> {errors.shortDescription}
            </p>
          ) : (
          <p className="text-xs text-stone-500">Keep it between 15 and 1,500 characters. The marketplace card will show a short preview.</p>
          )}
          <span className="text-xs text-stone-500">{(shortDescription || "").length}/1500</span>
        </div>
      </div>
    </div>
  );
}
