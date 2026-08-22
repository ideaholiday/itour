import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const DISPLAY_FORMATTER = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function toLocalISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseISO(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calendarDays(month) {
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export default function DatePicker({
  value,
  onChange,
  min,
  max,
  disabledDates = [],
  theme = "light",
  placeholder = "Select date",
  ariaLabel = "Choose date",
  popoverTitle = "Choose your date",
  className = "",
  buttonClassName = "",
  clearable = false,
  showIcon = true
}) {
  const today = useMemo(() => toLocalISO(new Date()), []);
  const minimum = min || "0000-01-01";
  const maximum = max || "9999-12-31";
  const disabledSet = useMemo(() => new Set(disabledDates), [disabledDates]);
  const selectedDate = parseISO(value);
  const initialDate = selectedDate || parseISO(min) || new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(initialDate));
  const [activeDate, setActiveDate] = useState(value || toLocalISO(initialDate));
  const [position, setPosition] = useState({ top: 0, left: 0, width: 328 });
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const dayRefs = useRef({});
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);

  const isDisabled = (iso) => iso < minimum || iso > maximum || disabledSet.has(iso);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(344, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const estimatedHeight = Math.min(430, window.innerHeight - 24);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const top = spaceBelow >= estimatedHeight
      ? rect.bottom + 8
      : spaceAbove >= estimatedHeight
        ? rect.top - estimatedHeight - 8
        : 12;
    setPosition({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    const next = selectedDate || parseISO(min) || new Date();
    setVisibleMonth(startOfMonth(next));
    setActiveDate(toLocalISO(next));
    updatePosition();
    const close = (event) => {
      if (!triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
    };
    const keydown = (event) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keydown);
    };
  }, [open]);

  const selectDate = (iso) => {
    if (isDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const moveActive = (amount, unit = "day") => {
    const current = parseISO(activeDate) || selectedDate || new Date();
    const candidate = unit === "month" ? new Date(current.getFullYear(), current.getMonth() + amount, current.getDate()) : addDays(current, amount);
    const iso = toLocalISO(candidate);
    if (iso < minimum || iso > maximum) return;
    setActiveDate(iso);
    setVisibleMonth(startOfMonth(candidate));
    window.requestAnimationFrame(() => dayRefs.current[iso]?.focus());
  };

  const handleGridKeyDown = (event) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[event.key]) { event.preventDefault(); moveActive(moves[event.key]); }
    else if (event.key === "PageUp" || event.key === "PageDown") { event.preventDefault(); moveActive(event.key === "PageUp" ? -1 : 1, "month"); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectDate(activeDate); }
  };

  const canPrevious = toLocalISO(addMonths(visibleMonth, -1)) >= toLocalISO(startOfMonth(parseISO(minimum) || new Date(0)));
  const canNext = toLocalISO(addMonths(visibleMonth, 1)) <= toLocalISO(startOfMonth(parseISO(maximum) || new Date(8640000000000000)));
  const displayValue = selectedDate ? DISPLAY_FORMATTER.format(selectedDate) : placeholder;

  const calendar = open && typeof document !== "undefined" ? createPortal(
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={popoverTitle} style={{ position: "fixed", top: position.top, left: position.left, width: position.width, maxHeight: "calc(100vh - 24px)" }} className="z-[120] overflow-y-auto rounded-3xl border border-stone-200 bg-white text-stone-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-3">
        <button type="button" aria-label="Previous month" disabled={!canPrevious} onClick={() => setVisibleMonth((month) => addMonths(month, -1))} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 transition disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
        <div className="text-center"><strong aria-live="polite" className="block text-sm font-bold text-stone-900">{MONTH_FORMATTER.format(visibleMonth)}</strong><span className="text-[10px] text-stone-500">Select a travel date</span></div>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setVisibleMonth((month) => addMonths(month, 1))} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 transition disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7">{WEEKDAYS.map((day) => <span key={day} className="py-2 text-center text-[10px] font-black uppercase text-stone-400">{day.slice(0, 2)}</span>)}</div>
        <div role="grid" aria-label={MONTH_FORMATTER.format(visibleMonth)} onKeyDown={handleGridKeyDown} className="grid grid-cols-7 gap-1">
          {days.map((date) => {
            const iso = toLocalISO(date);
            const outside = date.getMonth() !== visibleMonth.getMonth();
            const disabled = outside || isDisabled(iso);
            const selected = iso === value;
            const isToday = iso === today;
            return <button key={iso} ref={(node) => { dayRefs.current[iso] = node; }} type="button" role="gridcell" tabIndex={iso === activeDate && !disabled ? 0 : -1} disabled={disabled} aria-selected={selected} aria-label={`${DISPLAY_FORMATTER.format(date)}${selected ? ", selected" : ""}${disabled ? ", unavailable" : ""}`} onFocus={() => setActiveDate(iso)} onClick={() => selectDate(iso)} className={`relative grid h-10 place-items-center rounded-xl text-xs font-bold transition ${outside ? "invisible" : selected ? "bg-amber-500 text-stone-950 shadow-sm" : disabled ? "cursor-not-allowed text-stone-300" : "text-stone-700 hover:bg-amber-50 hover:text-amber-900"} ${isToday && !selected ? "ring-1 ring-inset ring-amber-500 text-amber-900" : ""}`}>{date.getDate()}{selected && <Check className="absolute right-0.5 top-0.5 h-2.5 w-2.5" />}</button>;
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
          <span className="text-[10px] text-stone-500"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Today</span>
          <div className="flex gap-2">{clearable && value && <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100">Clear</button>}{!isDisabled(today) && <button type="button" onClick={() => selectDate(today)} className="rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-bold text-stone-950 shadow-sm">Today</button>}</div>
        </div>
      </div>
    </div>, document.body
  ) : null;

  return (
    <div className={className}>
      <button ref={triggerRef} type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-stone-300 bg-white px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-stone-900 hover:border-amber-400 shadow-sm ${buttonClassName}`}>
        <span className="flex min-w-0 items-center gap-3">{showIcon && <CalendarDays className="h-4 w-4 shrink-0 text-amber-600" />}<span className={`truncate text-sm font-semibold ${!value ? "text-stone-400" : "text-stone-900"}`}>{displayValue}</span></span>
        <ChevronRight className={`h-4 w-4 shrink-0 transition ${open ? "rotate-90 text-amber-500" : "text-stone-400"}`} />
      </button>
      {calendar}
    </div>
  );
}
