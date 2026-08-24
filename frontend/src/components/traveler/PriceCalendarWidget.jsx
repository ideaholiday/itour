import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Zap, Sparkles, TrendingUp, Tag } from "lucide-react";
import api from "../../lib/api";
import { useCurrency } from "../../lib/currency";

export function PriceCalendarWidget({
  productId,
  basePrice = 1499,
  availability = {},
  selectedDate,
  onSelectDate,
}) {
  const { formatPrice } = useCurrency();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState(null);
  const [loading, setLoading] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const yearMonth = `${year}-${String(month + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (productId) {
      setLoading(true);
      api.getProductPriceCalendar(productId, yearMonth)
        .then((res) => setCalendarData(res))
        .catch(() => setCalendarData(null))
        .finally(() => setLoading(false));
    }
  }, [productId, yearMonth]);

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

  const dynamicDaysMap = {};
  if (calendarData?.days) {
    for (const d of calendarData.days) {
      dynamicDaysMap[d.date] = d;
    }
  }

  const days = [];
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(<div key={`empty-${i}`} className="h-14" />);
  }

  const todayStr = new Date().toISOString().split("T")[0];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateData = availability[dateStr] || {};
    const dynamicDay = dynamicDaysMap[dateStr];
    const price = dynamicDay?.priceInr || dateData.price_override_inr || basePrice;
    const isSelected = selectedDate === dateStr;
    const isBlocked = dateData.status === "BLOCKED" || dateStr < todayStr;
    const tier = dynamicDay?.tier || "STANDARD";

    days.push(
      <button
        key={d}
        type="button"
        disabled={isBlocked}
        onClick={() => onSelectDate && onSelectDate(dateStr, price)}
        title={dynamicDay?.rulesSummary || ""}
        className={`h-14 rounded-2xl flex flex-col items-center justify-between p-1.5 border text-xs transition-all ${
          isSelected
            ? "border-amber-500 bg-amber-500 text-white font-bold shadow-md scale-105 z-10"
            : isBlocked
            ? "border-transparent bg-stone-100 dark:bg-stone-800/40 text-stone-300 dark:text-stone-600 line-through cursor-not-allowed"
            : "border-stone-100 dark:border-stone-800 hover:border-amber-400 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 shadow-2xs hover:shadow-sm"
        }`}
      >
        <div className="w-full flex items-center justify-between">
          <span className={`text-[11px] leading-tight font-semibold ${isSelected ? "text-white" : ""}`}>{d}</span>
          {!isBlocked && tier === "PEAK" && !isSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Peak Demand" />
          )}
          {!isBlocked && tier === "SAVER" && !isSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Saver Deal" />
          )}
        </div>
        {!isBlocked && (
          <span
            className={`text-[10px] font-mono font-bold leading-tight ${
              isSelected
                ? "text-white"
                : tier === "PEAK"
                ? "text-amber-600 dark:text-amber-400"
                : tier === "SAVER"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-stone-600 dark:text-stone-300"
            }`}
          >
            {formatPrice(price)}
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

      {/* Pricing Legend */}
      <div className="flex items-center justify-between text-[11px] text-stone-500 pt-2 border-t border-stone-100 dark:border-stone-800">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] font-medium text-stone-600 dark:text-stone-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Saver
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-stone-600 dark:text-stone-400">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Weekend / Peak
          </span>
        </div>
        <span className="font-semibold text-[11px] text-stone-700 dark:text-stone-300">Instant Booking</span>
      </div>
    </div>
  );
}

export default PriceCalendarWidget;
