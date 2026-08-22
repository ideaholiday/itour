'use client';

import { CalendarDays, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
const DISPLAY_FORMATTER = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function toLocalISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseISO(value?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addDays = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

function calendarDays(month: Date) {
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabledDates?: string[];
  theme?: 'light' | 'dark';
  placeholder?: string;
  ariaLabel?: string;
  popoverTitle?: string;
  className?: string;
  buttonClassName?: string;
  clearable?: boolean;
  showIcon?: boolean;
};

export default function DatePicker({ value, onChange, min, max, disabledDates = [], theme = 'light', placeholder = 'Select date', ariaLabel = 'Choose date', popoverTitle = 'Choose your date', className = '', buttonClassName = '', clearable = false, showIcon = true }: DatePickerProps) {
  const today = useMemo(() => toLocalISO(new Date()), []);
  const minimum = min || '0000-01-01';
  const maximum = max || '9999-12-31';
  const disabledSet = useMemo(() => new Set(disabledDates), [disabledDates]);
  const selectedDate = parseISO(value);
  const initialDate = selectedDate || parseISO(min) || new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(initialDate));
  const [activeDate, setActiveDate] = useState(value || toLocalISO(initialDate));
  const [position, setPosition] = useState({ top: 0, left: 0, width: 328 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);
  const dark = theme === 'dark';
  const isDisabled = (iso: string) => iso < minimum || iso > maximum || disabledSet.has(iso);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(344, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const estimatedHeight = Math.min(430, window.innerHeight - 24);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const top = spaceBelow >= estimatedHeight ? rect.bottom + 8 : spaceAbove >= estimatedHeight ? rect.top - estimatedHeight - 8 : 12;
    setPosition({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    const next = selectedDate || parseISO(min) || new Date();
    setVisibleMonth(startOfMonth(next));
    setActiveDate(toLocalISO(next));
    updatePosition();
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', keydown);
    };
  }, [open]);

  const selectDate = (iso: string) => {
    if (isDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const moveActive = (amount: number, unit: 'day' | 'month' = 'day') => {
    const current = parseISO(activeDate) || selectedDate || new Date();
    const candidate = unit === 'month' ? new Date(current.getFullYear(), current.getMonth() + amount, current.getDate()) : addDays(current, amount);
    const iso = toLocalISO(candidate);
    if (iso < minimum || iso > maximum) return;
    setActiveDate(iso);
    setVisibleMonth(startOfMonth(candidate));
    window.requestAnimationFrame(() => dayRefs.current[iso]?.focus());
  };

  const handleGridKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[event.key]) { event.preventDefault(); moveActive(moves[event.key]); }
    else if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); moveActive(event.key === 'PageUp' ? -1 : 1, 'month'); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectDate(activeDate); }
  };

  const canPrevious = toLocalISO(addMonths(visibleMonth, -1)) >= toLocalISO(startOfMonth(parseISO(minimum) || new Date(0)));
  const canNext = toLocalISO(addMonths(visibleMonth, 1)) <= toLocalISO(startOfMonth(parseISO(maximum) || new Date(8640000000000000)));
  const displayValue = selectedDate ? DISPLAY_FORMATTER.format(selectedDate) : placeholder;

  const calendar = open && typeof document !== 'undefined' ? createPortal(
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={popoverTitle} style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: 'calc(100vh - 24px)' }} className={`z-[120] overflow-y-auto rounded-2xl border shadow-2xl ${dark ? 'border-slate-700 bg-slate-900 text-white shadow-black/50' : 'border-slate-200 bg-white text-slate-950 shadow-slate-900/20'}`}>
      <div className={`flex items-center justify-between border-b px-3 py-3 ${dark ? 'border-slate-800' : 'border-slate-100'}`}>
        <button type="button" aria-label="Previous month" disabled={!canPrevious} onClick={() => setVisibleMonth((month) => addMonths(month, -1))} className={`grid h-10 w-10 place-items-center rounded-xl border transition disabled:opacity-30 ${dark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}><ChevronLeft className="h-4 w-4" /></button>
        <div className="text-center"><strong aria-live="polite" className="block text-sm">{MONTH_FORMATTER.format(visibleMonth)}</strong><span className={`text-[10px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Select a travel date</span></div>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setVisibleMonth((month) => addMonths(month, 1))} className={`grid h-10 w-10 place-items-center rounded-xl border transition disabled:opacity-30 ${dark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7">{WEEKDAYS.map((day) => <span key={day} className={`py-2 text-center text-[10px] font-black uppercase ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{day.slice(0, 2)}</span>)}</div>
        <div role="grid" aria-label={MONTH_FORMATTER.format(visibleMonth)} onKeyDown={handleGridKeyDown} className="grid grid-cols-7 gap-1">
          {days.map((date) => {
            const iso = toLocalISO(date);
            const outside = date.getMonth() !== visibleMonth.getMonth();
            const disabled = outside || isDisabled(iso);
            const selected = iso === value;
            const isToday = iso === today;
            return <button key={iso} ref={(node) => { dayRefs.current[iso] = node; }} type="button" role="gridcell" tabIndex={iso === activeDate && !disabled ? 0 : -1} disabled={disabled} aria-selected={selected} aria-label={`${DISPLAY_FORMATTER.format(date)}${selected ? ', selected' : ''}${disabled ? ', unavailable' : ''}`} onFocus={() => setActiveDate(iso)} onClick={() => selectDate(iso)} className={`relative grid h-10 place-items-center rounded-xl text-xs font-bold transition ${outside ? 'invisible' : selected ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : disabled ? dark ? 'cursor-not-allowed text-slate-700' : 'cursor-not-allowed text-slate-300' : dark ? 'text-slate-200 hover:bg-slate-800 hover:text-amber-300' : 'text-slate-700 hover:bg-amber-50 hover:text-amber-800'} ${isToday && !selected ? dark ? 'ring-1 ring-inset ring-cyan-500 text-cyan-300' : 'ring-1 ring-inset ring-cyan-500 text-cyan-700' : ''}`}>{date.getDate()}{selected && <Check className="absolute right-0.5 top-0.5 h-2.5 w-2.5" />}</button>;
          })}
        </div>
        <div className={`mt-3 flex items-center justify-between border-t pt-3 ${dark ? 'border-slate-800' : 'border-slate-100'}`}><span className={`text-[10px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}><span className="mr-1 inline-block h-2 w-2 rounded-full bg-cyan-500" />Today</span><div className="flex gap-2">{clearable && value && <button type="button" onClick={() => { onChange(''); setOpen(false); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${dark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>Clear</button>}{!isDisabled(today) && <button type="button" onClick={() => selectDate(today)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-slate-950">Today</button>}</div></div>
      </div>
    </div>, document.body
  ) : null;

  return <div className={className}><button ref={triggerRef} type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${dark ? 'border-slate-700 bg-slate-950 text-white hover:border-slate-500' : 'border-slate-200 bg-white text-slate-900 hover:border-slate-400'} ${buttonClassName}`}><span className="flex min-w-0 items-center gap-3">{showIcon && <CalendarDays className={`h-4 w-4 shrink-0 ${dark ? 'text-amber-400' : 'text-amber-600'}`} />}<span className={`truncate text-sm font-semibold ${!value ? dark ? 'text-slate-500' : 'text-slate-400' : ''}`}>{displayValue}</span></span><ChevronRight className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-90 text-amber-500' : dark ? 'text-slate-600' : 'text-slate-400'}`} /></button>{calendar}</div>;
}
