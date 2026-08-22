import React, { useState } from "react";
import {
  Calendar,
  Zap,
  Clock,
  TrendingUp,
  Ban,
  ShieldCheck,
  CheckCircle,
  Plus,
  Trash2,
  Info,
  Sparkles
} from "lucide-react";
import DatePicker, { toLocalISO } from "../ui/DatePicker.jsx";

export default function Step4InventoryBooking({ formData, onChange, errors }) {
  const {
    blackoutDates = [],
    seasonalMultiplier = 1.0,
    seasonalLabel = "Standard Rate (No Multiplier)",
    bookingMode = "INSTANT",
    approvalTimeLimitHours = 2,
    cancellationPolicy = "FLEXIBLE_24H",
    termsAgreed = false,
  } = formData;

  const [dateInput, setDateInput] = useState("");

  const handleAddBlackoutDate = () => {
    if (!dateInput) return;
    if (!blackoutDates.includes(dateInput)) {
      onChange({ blackoutDates: [...blackoutDates, dateInput] });
    }
    setDateInput("");
  };

  const handleRemoveBlackoutDate = (dateStr) => {
    onChange({ blackoutDates: blackoutDates.filter((d) => d !== dateStr) });
  };

  const handleSeasonalChange = (multiplier, label) => {
    onChange({
      seasonalMultiplier: multiplier,
      seasonalLabel: label,
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="border-b border-stone-200 pb-4">
        <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-600" />
          Step 4: Inventory, Blackout Dates & Instant Booking
        </h2>
        <p className="text-sm text-stone-600 mt-1">
          Manage calendar availability, blackout dates, seasonal pricing surges, and instant booking SLA settings.
        </p>
      </div>

      {/* 1. Blackout Dates & Seasonal Multipliers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Blackout Dates Blockout Picker */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
            <Ban className="w-4 h-4 text-rose-600" />
            Calendar Blackout Dates ({blackoutDates.length} Blocked)
          </div>
          <p className="text-xs text-stone-600">
            Select dates when your cab/tour guide service is un-available or fully booked.
          </p>

          <div className="flex gap-2">
            <DatePicker value={dateInput} min={toLocalISO(new Date())} disabledDates={blackoutDates} onChange={setDateInput} theme="light" placeholder="Choose a date" ariaLabel="Choose blackout date" popoverTitle="Choose date to block" className="min-w-0 flex-1" buttonClassName="rounded-xl py-2" />
            <button
              type="button"
              onClick={handleAddBlackoutDate}
              className="bg-rose-100 border border-rose-300 hover:bg-rose-200 text-rose-900 text-xs font-bold px-3 py-2 rounded-xl transition shadow-sm"
            >
              + Block Date
            </button>
          </div>

          {/* Blocked Dates List */}
          <div className="flex flex-wrap gap-2 pt-2 max-h-36 overflow-y-auto">
            {blackoutDates.length === 0 ? (
              <span className="text-xs text-stone-400 italic">No blackout dates added. Tour is available daily.</span>
            ) : (
              blackoutDates.map((dateStr) => (
                <span
                  key={dateStr}
                  className="bg-rose-50 text-rose-900 border border-rose-200 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-mono font-bold"
                >
                  {dateStr}
                  <button
                    type="button"
                    onClick={() => handleRemoveBlackoutDate(dateStr)}
                    className="hover:text-rose-600 transition"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Seasonal Peak-Pricing Multiplier */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <TrendingUp className="w-4 h-4 text-amber-600" />
            Seasonal Peak-Pricing Multiplier
          </div>
          <p className="text-xs text-stone-600">
            Automatically scale pricing during high demand festival or peak holiday periods.
          </p>

          <div className="space-y-2">
            {[
              { multiplier: 1.0, label: "Standard Regular Rate (1.0x)" },
              { multiplier: 1.15, label: "Summer / Long Weekend Surge (+15%)" },
              { multiplier: 1.2, label: "Peak Festive / Diwali & Dec Season (+20%)" },
              { multiplier: 1.35, label: "Ultra Peak New Year / Kumbh Mela (+35%)" },
            ].map((opt) => {
              const isSelected = seasonalMultiplier === opt.multiplier;
              return (
                <button
                  key={opt.multiplier}
                  type="button"
                  onClick={() => handleSeasonalChange(opt.multiplier, opt.label)}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between ${
                    isSelected
                      ? "bg-amber-100 border-amber-400 text-amber-950 font-bold shadow-sm"
                      : "bg-[#FAF9F6] border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-white"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Sparkles className="w-3.5 h-3.5 text-amber-600" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Instant Booking Toggle vs Request Booking */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <label className="block text-sm font-semibold text-stone-900">
          Booking Confirmation Mode <span className="text-rose-500">*</span>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Instant Booking */}
          <button
            type="button"
            onClick={() => onChange({ bookingMode: "INSTANT" })}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
              bookingMode === "INSTANT"
                ? "bg-emerald-50 border-emerald-500 text-stone-950 ring-2 ring-emerald-400 shadow-sm"
                : "bg-[#FAF9F6] border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-white"
            }`}
          >
            <div className={`p-2.5 rounded-xl ${bookingMode === "INSTANT" ? "bg-emerald-600 text-white font-bold" : "bg-stone-100 text-stone-600"}`}>
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-base text-stone-900 flex items-center gap-2">
                Instant Booking
                <span className="text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded font-mono font-bold uppercase">
                  Recommended
                </span>
              </div>
              <div className="text-xs text-stone-600 mt-1 leading-relaxed">
                Tour is instantly confirmed upon traveler payment. Yields 3.5x higher conversion on Idea Holiday.
              </div>
            </div>
          </button>

          {/* Request Booking */}
          <button
            type="button"
            onClick={() => onChange({ bookingMode: "REQUEST_APPROVAL" })}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
              bookingMode === "REQUEST_APPROVAL"
                ? "bg-amber-50 border-amber-500 text-stone-950 ring-2 ring-amber-400 shadow-sm"
                : "bg-[#FAF9F6] border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-white"
            }`}
          >
            <div className={`p-2.5 rounded-xl ${bookingMode === "REQUEST_APPROVAL" ? "bg-amber-500 text-stone-950 font-bold" : "bg-stone-100 text-stone-600"}`}>
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-base text-stone-900">Require Supplier Approval</div>
              <div className="text-xs text-stone-600 mt-1 leading-relaxed">
                Traveler places a booking request. Supplier must accept/reject within the strict SLA time window.
              </div>
            </div>
          </button>
        </div>

        {bookingMode === "REQUEST_APPROVAL" && (
          <div className="bg-[#FAF9F6] border border-amber-300 rounded-xl p-3 text-xs flex items-center justify-between text-amber-900 font-medium">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700" />
              Supplier SLA Approval Time Window:
            </span>
            <select
              value={approvalTimeLimitHours}
              onChange={(e) => onChange({ approvalTimeLimitHours: Number(e.target.value) })}
              className="bg-white border border-stone-300 rounded-lg px-3 py-1 text-stone-900 focus:outline-none focus:border-amber-500 font-mono"
            >
              <option value="1">1 Hour Approval SLA</option>
              <option value="2">2 Hours Approval SLA (Standard)</option>
              <option value="4">4 Hours Approval SLA</option>
              <option value="12">12 Hours Approval SLA</option>
            </select>
          </div>
        )}
      </div>

      {/* 3. Cancellation Policy & Terms */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          Cancellation Policy & Supplier Terms Agreement
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Standard Cancellation Policy</label>
            <select
              value={cancellationPolicy}
              onChange={(e) => onChange({ cancellationPolicy: e.target.value })}
              className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl px-3 py-2 text-stone-900 text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
            >
              <option value="FLEXIBLE_24H">Flexible: Full refund up to 24 hours before tour start</option>
              <option value="MODERATE_48H">Moderate: Full refund up to 48 hours before tour start</option>
              <option value="STRICT_7D">Strict: 50% refund up to 7 days before tour start</option>
              <option value="NON_REFUNDABLE">Non-Refundable: No cancellation refunds</option>
            </select>
          </div>

          <div className="flex items-center">
            <label className="flex items-start gap-3 cursor-pointer select-none bg-[#FAF9F6] border border-stone-200 p-3 rounded-xl w-full hover:bg-white transition">
              <input
                type="checkbox"
                checked={termsAgreed}
                onChange={(e) => onChange({ termsAgreed: e.target.checked })}
                className="w-4 h-4 mt-0.5 text-amber-500 bg-white border-stone-300 rounded focus:ring-amber-400 accent-amber-500"
              />
              <span className="text-xs text-stone-700 leading-relaxed">
                I certify that I am an authorized tour operator/cab supplier. I agree to honor all confirmed bookings as per Idea Holiday SLA guidelines. <span className="text-rose-500 font-bold">*</span>
              </span>
            </label>
          </div>
        </div>

        {errors?.termsAgreed && (
          <p className="text-xs text-rose-600 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" /> {errors.termsAgreed}
          </p>
        )}
      </div>
    </div>
  );
}
