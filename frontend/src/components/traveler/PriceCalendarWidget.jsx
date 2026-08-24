import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Check, Zap } from "lucide-react";

export function PriceCalendarWidget({
  basePrice = 1499,
  availability = {},
  selectedDate,
  onSelectDate,
}) {
  const [currentDate, setCurrentDate] = useState(new Date());

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

  const days = [];
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(<div key={`empty-${i}`} className="h-12" />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateData = availability[dateStr] || {};
    const price = dateData.price_override_inr || basePrice;
    const isSelected = selectedDate === dateStr;
    const isBlocked = dateData.status === "BLOCKED";

    days.push(
      <button
        key={d}
        type="button"
        disabled={isBlocked}
        onClick={() => onSelectDate && onSelectDate(dateStr, price)}
        className={`h-12 rounded-2xl flex flex-col items-center justify-center p-1 border text-xs transition-all ${
          isSelected
            ? "border-amber-500 bg-amber-500 text-white font-bold shadow-md scale-105 z-10"
            : isBlocked
            ? "border-transparent bg-stone-100 dark:bg-stone-800/40 text-stone-300 dark:text-stone-600 line-through cursor-not-allowed"
            : "border-stone-100 dark:border-stone-800 hover:border-amber-400 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200"
        }`}
      >
        <span className="text-[11px] leading-tight">{d}</span>
        {!isBlocked && (
          <span
            className={`text-[9px] font-mono font-bold leading-tight ${
              isSelected ? "text-white" : "text-amber-600 dark:text-amber-400"
            }`}
          >
            ₹{price}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="p-4 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm space-y-3">
      {/* Month Navigation */}
      <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <CalIcon className="w-4 h-4 text-amber-600" />
          <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 font-display">
            {monthNames[month]} {year}
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-stone-400 uppercase">
        <span>Sun</span>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">{days}</div>

      <div className="flex items-center justify-between text-[11px] text-stone-500 pt-2 border-t border-stone-100 dark:border-stone-800">
        <span className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-500" /> Instant confirmation
        </span>
        <span className="font-semibold text-stone-700 dark:text-stone-300">Best price guaranteed</span>
      </div>
    </div>
  );
}

export default PriceCalendarWidget;
