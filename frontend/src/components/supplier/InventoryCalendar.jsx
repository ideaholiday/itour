import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Check, X, ShieldAlert } from "lucide-react";
import Button from "../ui/Button";

export function InventoryCalendar({ availability = {}, onSaveAvailability }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [capacity, setCapacity] = useState(10);
  const [priceOverride, setPriceOverride] = useState("");
  const [status, setStatus] = useState("AVAILABLE");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (day) => {
    const formatted = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(formatted);
    const existing = availability[formatted] || {};
    setCapacity(existing.capacity || 10);
    setPriceOverride(existing.price_override_inr || "");
    setStatus(existing.status || "AVAILABLE");
  };

  const handleSave = () => {
    if (!selectedDate) return;
    onSaveAvailability({
      date: selectedDate,
      capacity: parseInt(capacity, 10) || 10,
      priceOverrideInr: priceOverride ? parseInt(priceOverride, 10) : null,
      status,
    });
    setSelectedDate(null);
  };

  const days = [];
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(<div key={`empty-${i}`} className="h-10 sm:h-12" />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateData = availability[dateStr] || {};
    const isSelected = selectedDate === dateStr;
    const isBlocked = dateData.status === "BLOCKED";

    days.push(
      <button
        key={d}
        type="button"
        onClick={() => handleDateClick(d)}
        className={`h-10 sm:h-12 rounded-xl flex flex-col items-center justify-center p-1 border text-xs transition-all ${
          isSelected
            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold ring-2 ring-amber-500/20"
            : isBlocked
            ? "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
            : "border-stone-100 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200"
        }`}
      >
        <span>{d}</span>
        {dateData.price_override_inr ? (
          <span className="text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400">
            ₹{dateData.price_override_inr}
          </span>
        ) : (
          <span className="text-[9px] text-stone-400 font-mono">Cap:{dateData.capacity ?? 10}</span>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <CalIcon className="w-5 h-5 text-amber-600" />
          <h4 className="text-base font-bold text-stone-900 dark:text-stone-100 font-display">
            {monthNames[month]} {year}
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-stone-400 uppercase">
        <span>Sun</span>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">{days}</div>

      {/* Date settings editor modal/drawer */}
      {selectedDate && (
        <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
              Configure {selectedDate}
            </span>
            <button onClick={() => setSelectedDate(null)} className="text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 block mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900"
              >
                <option value="AVAILABLE">Available</option>
                <option value="LIMITED">Limited</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 block mb-1">Capacity</label>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 block mb-1">Price Override (₹)</label>
              <input
                type="number"
                placeholder="Default"
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
                className="w-full text-xs rounded-xl border border-stone-200 dark:border-stone-700 p-2 bg-white dark:bg-stone-900 font-mono"
              />
            </div>
          </div>

          <Button size="sm" variant="primary" icon={Check} onClick={handleSave} className="w-full">
            Apply to {selectedDate}
          </Button>
        </div>
      )}
    </div>
  );
}

export default InventoryCalendar;
