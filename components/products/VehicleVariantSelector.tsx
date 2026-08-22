'use client';

import {
  BadgeCheck,
  BusFront,
  CalendarDays,
  CarFront,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Info,
  Luggage,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

export type VehicleAvailability = 'available' | 'full' | 'unavailable';

export type VehicleVariant = {
  id: string;
  name: string;
  examples: string;
  basePrice: number;
  maxPassengers: number;
  maxBags: number;
  description: string;
  features: string[];
  badge?: string;
  kind?: 'car' | 'premium' | 'luxury' | 'group';
};

export type InventoryDay = {
  status?: VehicleAvailability;
  rate?: number;
  holiday?: boolean;
  label?: string;
  vehicles?: Record<string, { status?: VehicleAvailability; rate?: number }>;
};

export type VehicleSelection = {
  vehicle: VehicleVariant;
  date: string;
  price: number;
  availability: VehicleAvailability;
};

export type VehicleVariantSelectorProps = {
  vehicles?: VehicleVariant[];
  inventory?: Record<string, InventoryDay>;
  initialVehicleId?: string;
  initialDate?: string;
  referenceVehicleId?: string;
  weekendMultiplier?: number;
  minDate?: string;
  maxDate?: string;
  currency?: string;
  onChange?: (selection: VehicleSelection) => void;
  className?: string;
};

export const DEFAULT_VEHICLES: VehicleVariant[] = [
  {
    id: 'hatchback',
    name: 'Hatchback',
    examples: 'WagonR / Similar',
    basePrice: 1200,
    maxPassengers: 3,
    maxBags: 2,
    description: 'Compact and value-friendly for short city rides.',
    features: ['Air conditioned', 'Best for light luggage'],
    kind: 'car',
  },
  {
    id: 'sedan',
    name: 'Sedan',
    examples: 'Dzire / Etios',
    basePrice: 1500,
    maxPassengers: 4,
    maxBags: 2,
    description: 'Comfortable everyday choice for couples and families.',
    features: ['Air conditioned', 'Separate boot'],
    badge: 'Most booked',
    kind: 'car',
  },
  {
    id: 'suv-muv',
    name: 'SUV / MUV',
    examples: 'Ertiga / Carens',
    basePrice: 1700,
    maxPassengers: 6,
    maxBags: 4,
    description: 'Extra room for larger groups and their luggage.',
    features: ['Three-row seating', 'Rear AC vents'],
    kind: 'car',
  },
  {
    id: 'premium-suv',
    name: 'Premium SUV',
    examples: 'Innova Crysta',
    basePrice: 1900,
    maxPassengers: 6,
    maxBags: 5,
    description: 'A refined, spacious ride for longer journeys.',
    features: ['Powerful AC', 'Pushback seats'],
    badge: 'Recommended',
    kind: 'premium',
  },
  {
    id: 'luxury',
    name: 'Luxury Sedan / SUV',
    examples: 'BMW / Mercedes / Fortuner',
    basePrice: 4200,
    maxPassengers: 4,
    maxBags: 3,
    description: 'Executive vehicles with elevated chauffeur service.',
    features: ['VIP experience', 'Premium chauffeur'],
    badge: 'VIP',
    kind: 'luxury',
  },
  {
    id: 'tempo-traveller',
    name: 'Tempo Traveller',
    examples: '12 / 17 Seater',
    basePrice: 3600,
    maxPassengers: 17,
    maxBags: 12,
    description: 'One comfortable vehicle for family and group travel.',
    features: ['12 or 17 seats', 'Dedicated luggage area'],
    kind: 'group',
  },
];

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

function localISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseISO(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getCalendarDays(month: Date) {
  const first = startOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function VehicleIcon({ kind, className = '' }: { kind: VehicleVariant['kind']; className?: string }) {
  if (kind === 'group') return <BusFront className={className} />;
  if (kind === 'luxury') return <Crown className={className} />;
  if (kind === 'premium') return <Sparkles className={className} />;
  return <CarFront className={className} />;
}

export default function VehicleVariantSelector({
  vehicles = DEFAULT_VEHICLES,
  inventory = {},
  initialVehicleId = 'sedan',
  initialDate,
  referenceVehicleId = 'sedan',
  weekendMultiplier = 1.25,
  minDate,
  maxDate,
  currency = 'INR',
  onChange,
  className = '',
}: VehicleVariantSelectorProps) {
  const titleId = useId();
  const today = useMemo(() => localISO(new Date()), []);
  const minimumDate = minDate || today;
  const firstVehicle = vehicles.find((vehicle) => vehicle.id === initialVehicleId) ?? vehicles[0];
  const [selectedVehicleId, setSelectedVehicleId] = useState(firstVehicle?.id ?? '');
  const [selectedDate, setSelectedDate] = useState(initialDate || minimumDate);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseISO(initialDate || minimumDate)));
  const [detailsOpen, setDetailsOpen] = useState(false);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? vehicles[0];
  const referenceVehicle = vehicles.find((vehicle) => vehicle.id === referenceVehicleId) ?? vehicles[0];
  const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);

  const getAvailability = (date: string, vehicleId = selectedVehicleId): VehicleAvailability => {
    const day = inventory[date];
    return day?.vehicles?.[vehicleId]?.status ?? day?.status ?? 'available';
  };

  const getRate = (date: string, vehicle = selectedVehicle) => {
    if (!vehicle) return 0;
    const day = inventory[date];
    const vehicleRate = day?.vehicles?.[vehicle.id]?.rate;
    if (vehicleRate != null) return vehicleRate;
    if (day?.rate != null) return day.rate;
    const parsed = parseISO(date);
    const weekend = parsed.getDay() === 0 || parsed.getDay() === 6;
    return Math.round(vehicle.basePrice * (weekend || day?.holiday ? weekendMultiplier : 1));
  };

  const selectedPrice = getRate(selectedDate);
  const selectedAvailability = getAvailability(selectedDate);
  const formatter = useMemo(
    () => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }),
    [currency],
  );
  const compactPrice = (price: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(price)}`;

  useEffect(() => {
    if (!selectedVehicle) return;
    onChange?.({
      vehicle: selectedVehicle,
      date: selectedDate,
      price: selectedPrice,
      availability: selectedAvailability,
    });
  }, [selectedVehicle, selectedDate, selectedPrice, selectedAvailability, onChange]);

  const selectVehicle = (vehicle: VehicleVariant) => {
    if (getAvailability(selectedDate, vehicle.id) !== 'available') return;
    setSelectedVehicleId(vehicle.id);
  };

  const selectDate = (date: string) => {
    if (date < minimumDate || (maxDate && date > maxDate) || getAvailability(date) !== 'available') return;
    setSelectedDate(date);
  };

  const canGoPrevious = localISO(addMonths(visibleMonth, -1)) >= localISO(startOfMonth(parseISO(minimumDate)));
  const canGoNext = !maxDate || localISO(addMonths(visibleMonth, 1)) <= localISO(startOfMonth(parseISO(maxDate)));

  if (!selectedVehicle || vehicles.length === 0) return null;

  return (
    <section aria-labelledby={titleId} className={`overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_-35px_rgba(15,23,42,0.35)] ${className}`}>
      <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-6 text-white sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-400"><CarFront size={15} /> Choose your ride</p>
            <h2 id={titleId} className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Compare vehicle options</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">The vehicle shown is indicative. Your supplier may provide an equivalent model with the same capacity.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
            <ShieldCheck size={19} className="text-emerald-400" />
            <span className="text-xs"><strong className="block text-white">All-inclusive pricing</strong><span className="text-slate-400">No vehicle upgrade surprises</span></span>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div role="radiogroup" aria-label="Available vehicles" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((vehicle) => {
            const selected = selectedVehicle.id === vehicle.id;
            const availability = getAvailability(selectedDate, vehicle.id);
            const unavailable = availability !== 'available';
            const datePrice = getRate(selectedDate, vehicle);
            const referenceDatePrice = getRate(selectedDate, referenceVehicle);
            const difference = datePrice - referenceDatePrice;

            return (
              <button
                key={vehicle.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={unavailable}
                onClick={() => selectVehicle(vehicle)}
                className={`group relative min-h-[220px] overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 ${
                  selected
                    ? 'border-amber-500 bg-amber-50 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500'
                    : unavailable
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-55 grayscale'
                      : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid size-11 place-items-center rounded-xl transition-colors ${selected ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white'}`}>
                    <VehicleIcon kind={vehicle.kind} className="size-5" />
                  </span>
                  <span className="flex min-h-6 items-center gap-2">
                    {unavailable && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">{availability}</span>}
                    {!unavailable && vehicle.badge && <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${vehicle.kind === 'luxury' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>{vehicle.badge}</span>}
                    <span className={`grid size-6 place-items-center rounded-full border transition-all ${selected ? 'scale-100 border-amber-500 bg-amber-500 text-slate-950' : 'scale-90 border-slate-300 text-transparent'}`}><Check size={14} strokeWidth={3} /></span>
                  </span>
                </div>

                <h3 className="mt-4 text-base font-black text-slate-950">{vehicle.name}</h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{vehicle.examples}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700"><Users size={13} /> Up to {vehicle.maxPassengers}</span>
                  <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700"><Luggage size={13} /> {vehicle.maxBags} bags</span>
                </div>
                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500">{vehicle.description}</p>

                <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-3">
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">From</span>
                    <span className="text-lg font-black text-slate-950">{formatter.format(datePrice)}</span>
                  </span>
                  <span className={`rounded-lg px-2 py-1 text-[11px] font-extrabold ${difference > 0 ? 'bg-slate-100 text-slate-600' : difference < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                    {difference === 0 ? 'Standard fare' : `${difference > 0 ? '+' : '−'} ${formatter.format(Math.abs(difference))}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-4 flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
        >
          <span className="flex items-center gap-2"><Info size={16} /> Compare included features</span>
          <ChevronRight size={17} className={`transition-transform duration-300 ${detailsOpen ? 'rotate-90' : ''}`} />
        </button>
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${detailsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="bg-slate-950 text-white">
                  <tr><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Capacity</th><th className="px-4 py-3">Luggage</th><th className="px-4 py-3">Included comfort</th><th className="px-4 py-3 text-right">Selected-date fare</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vehicles.map((vehicle) => (
                    <tr key={vehicle.id} className={vehicle.id === selectedVehicle.id ? 'bg-amber-50' : 'bg-white'}>
                      <td className="px-4 py-3"><strong className="text-slate-900">{vehicle.name}</strong><span className="block text-slate-500">{vehicle.examples}</span></td>
                      <td className="px-4 py-3 text-slate-600">Up to {vehicle.maxPassengers} pax</td>
                      <td className="px-4 py-3 text-slate-600">{vehicle.maxBags} bags</td>
                      <td className="px-4 py-3 text-slate-600">{vehicle.features.join(' · ')}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{formatter.format(getRate(selectedDate, vehicle))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3 sm:px-5">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-950"><CalendarDays size={17} className="text-amber-600" /> Select travel date</h3>
                <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">Daily price shown for {selectedVehicle.name}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous month" disabled={!canGoPrevious} onClick={() => setVisibleMonth((month) => addMonths(month, -1))} className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft size={18} /></button>
                <p aria-live="polite" className="w-32 text-center text-sm font-black text-slate-900 sm:w-40">{monthFormatter.format(visibleMonth)}</p>
                <button type="button" aria-label="Next month" disabled={!canGoNext} onClick={() => setVisibleMonth((month) => addMonths(month, 1))} className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight size={18} /></button>
              </div>
            </div>

            <div className="p-2 sm:p-4">
              <div className="grid grid-cols-7" aria-hidden="true">
                {weekDays.map((day) => <div key={day} className="py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400">{day.slice(0, 2)}</div>)}
              </div>
              <div role="grid" aria-label={`Availability for ${monthFormatter.format(visibleMonth)}`} className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {calendarDays.map((date) => {
                  const iso = localISO(date);
                  const outsideMonth = date.getMonth() !== visibleMonth.getMonth();
                  const beforeMin = iso < minimumDate;
                  const afterMax = Boolean(maxDate && iso > maxDate);
                  const availability = getAvailability(iso);
                  const disabled = outsideMonth || beforeMin || afterMax || availability !== 'available';
                  const selected = iso === selectedDate;
                  const dayInventory = inventory[iso];
                  const holiday = dayInventory?.holiday;
                  const weekend = date.getDay() === 0 || date.getDay() === 6;
                  const rate = getRate(iso);
                  const statusText = availability === 'full' ? 'Full' : availability === 'unavailable' ? 'Unavailable' : '';

                  return (
                    <button
                      key={iso}
                      type="button"
                      role="gridcell"
                      disabled={disabled}
                      aria-selected={selected}
                      aria-label={`${date.toLocaleDateString('en-IN', { dateStyle: 'full' })}, ${disabled ? statusText || 'not selectable' : formatter.format(rate)}`}
                      onClick={() => selectDate(iso)}
                      className={`relative flex min-h-[62px] flex-col items-center justify-center rounded-xl border px-0.5 py-1 transition-all sm:min-h-[72px] ${
                        outsideMonth
                          ? 'invisible'
                          : selected
                            ? 'z-10 scale-[1.03] border-slate-950 bg-slate-950 text-white shadow-lg'
                            : disabled
                              ? 'cursor-not-allowed border-transparent bg-slate-100 text-slate-300'
                              : 'border-slate-100 bg-white text-slate-800 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-50'
                      }`}
                    >
                      <span className={`text-xs font-black sm:text-sm ${!selected && !disabled && (weekend || holiday) ? 'text-amber-700' : ''}`}>{date.getDate()}</span>
                      {disabled ? (
                        <span className="mt-1 max-w-full truncate text-[8px] font-black uppercase tracking-tight text-slate-400 sm:text-[9px]">{statusText || '—'}</span>
                      ) : (
                        <span className={`mt-1 max-w-full truncate text-[9px] font-extrabold sm:text-[10px] ${selected ? 'text-amber-300' : 'text-slate-500'}`}>{compactPrice(rate)}</span>
                      )}
                      {!disabled && (holiday || weekend) && <span className={`absolute right-1 top-1 size-1 rounded-full ${selected ? 'bg-amber-300' : 'bg-amber-500'}`} />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 px-1 text-[10px] font-semibold text-slate-500">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" /> Weekend / holiday rate</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-slate-300" /> Full or unavailable</span>
              </div>
            </div>
          </div>

          <aside className="flex flex-col justify-between rounded-2xl bg-slate-950 p-5 text-white shadow-xl">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400">Your selection</p>
              <div className="mt-4 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-amber-500 text-slate-950"><VehicleIcon kind={selectedVehicle.kind} className="size-5" /></span>
                <div><p className="font-black">{selectedVehicle.name}</p><p className="text-xs text-slate-400">{selectedVehicle.examples}</p></div>
              </div>
              <div className="mt-5 space-y-3 border-y border-white/10 py-4 text-xs">
                <p className="flex justify-between gap-3"><span className="text-slate-400">Travel date</span><strong>{parseISO(selectedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></p>
                <p className="flex justify-between gap-3"><span className="text-slate-400">Capacity</span><strong>{selectedVehicle.maxPassengers} pax · {selectedVehicle.maxBags} bags</strong></p>
              </div>
            </div>
            <div className="mt-6">
              <p className="text-xs text-slate-400">Price for selected date</p>
              <p className="mt-1 text-3xl font-black text-amber-400">{formatter.format(selectedPrice)}</p>
              <p className="mt-1 text-[10px] text-slate-500">Taxes may be calculated at checkout</p>
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-100">
                <BadgeCheck size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                <span><strong className="block text-white">Available to book</strong>Instant confirmation from a verified supplier.</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
