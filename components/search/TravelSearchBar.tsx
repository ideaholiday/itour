'use client';

import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  BusFront,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  History,
  Hotel,
  Landmark,
  LoaderCircle,
  Luggage,
  MapPin,
  Minus,
  MoonStar,
  Plane,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import DatePicker from '@/components/ui/DatePicker';

type SearchTab = 'transfers' | 'day-tours' | 'packages';
type LocationCategory = 'Airports' | 'Hotels & Resorts' | 'Popular Landmarks' | 'Cities';

export type LocationSuggestion = {
  id: string;
  label: string;
  description: string;
  category: LocationCategory;
  lat?: number | null;
  lng?: number | null;
};

type RecentLocation = LocationSuggestion & { usedAt: number };

const RECENTS_KEY = 'wanderindia:recent-locations';

const tabs: Array<{ id: SearchTab; label: string; shortLabel: string; icon: typeof Plane }> = [
  { id: 'transfers', label: 'Airport & City Transfers', shortLabel: 'Transfers', icon: BusFront },
  { id: 'day-tours', label: 'Day Tours & Sightseeing', shortLabel: 'Day Tours', icon: Landmark },
  { id: 'packages', label: 'Multi-Day Packages', shortLabel: 'Packages', icon: BriefcaseBusiness },
];

const categoryOrder: LocationCategory[] = [
  'Airports',
  'Hotels & Resorts',
  'Popular Landmarks',
  'Cities',
];

const categoryIcons: Record<LocationCategory, typeof Plane> = {
  Airports: Plane,
  'Hotels & Resorts': Hotel,
  'Popular Landmarks': MapPin,
  Cities: Building2,
};

const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

function readRecents(): RecentLocation[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent(suggestion: LocationSuggestion) {
  const next = [
    { ...suggestion, usedAt: Date.now() },
    ...readRecents().filter((item) => item.id !== suggestion.id),
  ].slice(0, 6);
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

function FieldShell({
  icon,
  label,
  children,
  className = '',
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-100 ${className}`}>
      <span className="shrink-0 text-slate-500 group-focus-within:text-amber-600">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>
        {children}
      </div>
    </div>
  );
}

function LocationAutocomplete({
  label,
  placeholder,
  value,
  onChange,
  bias = null,
  required = true,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string, suggestion?: LocationSuggestion) => void;
  bias?: LocationSuggestion | null;
  required?: boolean;
}) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [recents, setRecents] = useState<RecentLocation[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [provider, setProvider] = useState<'google' | 'mappls' | null>(null);
  const selectedBiasRef = useRef<LocationSuggestion | null>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  useEffect(() => {
    if (!open) return;
    setRecents(readRecents());
  }, [open]);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setProvider(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ query });
        const locationBias = bias ?? selectedBiasRef.current;
        if (locationBias?.lat != null && locationBias?.lng != null) {
          params.set('lat', String(locationBias.lat));
          params.set('lng', String(locationBias.lng));
        }
        if (locationBias) params.set('context', [locationBias.label, locationBias.description].filter(Boolean).join(', '));
        const response = await fetch(`/api/places?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Location search failed');
        const data = (await response.json()) as {
          suggestions?: LocationSuggestion[];
          provider?: 'google' | 'mappls';
        };
        setSuggestions(data.suggestions ?? []);
        setProvider(data.provider ?? null);
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, bias?.id, bias?.lat, bias?.lng]);

  const visibleItems: LocationSuggestion[] = value.trim().length < 2 ? recents : suggestions;
  const grouped = useMemo(
    () => categoryOrder.map((category) => ({
      category,
      items: visibleItems.filter((item) => item.category === category),
    })).filter((group) => group.items.length),
    [visibleItems],
  );

  const choose = async (item: LocationSuggestion) => {
    let selected = item;
    if (item.lat == null || item.lng == null) {
      setLoading(true);
      try {
        const query = new URLSearchParams({ mode: 'resolve', placeId: item.id, address: `${item.label}, ${item.description}` });
        const response = await fetch(`/api/places?${query}`);
        const data = await response.json();
        if (response.ok && data.location) selected = { ...item, lat: data.location.lat, lng: data.location.lng };
      } catch {
        // Checkout will ask the traveler to confirm the map pin if resolution fails here.
      } finally {
        setLoading(false);
      }
    }
    selectedBiasRef.current = selected;
    onChange(selected.label, selected);
    saveRecent(selected);
    setRecents(readRecents());
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (!visibleItems.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + direction + visibleItems.length) % visibleItems.length);
    }
    if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      choose(visibleItems[activeIndex]);
    }
  };

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <FieldShell icon={<MapPin size={20} strokeWidth={1.8} />} label={label}>
        <div className="flex items-center gap-2">
          <input
            id={id}
            required={required}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={`${id}-listbox`}
            aria-expanded={open}
            aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
            value={value}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            className="mt-0.5 w-full truncate bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
          />
          {loading ? (
            <LoaderCircle size={16} className="shrink-0 animate-spin text-amber-600" aria-label="Searching" />
          ) : value ? (
            <button
              type="button"
              aria-label={`Clear ${label}`}
              onClick={() => onChange('')}
              className="-m-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      </FieldShell>

      {open && (visibleItems.length > 0 || value.trim().length >= 2) && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-[0_24px_70px_-20px_rgba(15,23,42,0.38)] sm:min-w-[340px]"
        >
          {value.trim().length < 2 && recents.length > 0 && (
            <div className="flex items-center gap-2 px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <History size={13} /> Recent searches
            </div>
          )}

          {grouped.map(({ category, items }) => {
            const CategoryIcon = categoryIcons[category];
            return (
              <div key={category} className="mb-1 last:mb-0">
                {value.trim().length >= 2 && (
                  <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <CategoryIcon size={13} /> {category}
                  </div>
                )}
                {items.map((item) => {
                  const index = visibleItems.findIndex((entry) => entry.id === item.id);
                  return (
                    <button
                      type="button"
                      role="option"
                      id={`${id}-option-${index}`}
                      aria-selected={activeIndex === index}
                      key={item.id}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(item)}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${activeIndex === index ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                        <CategoryIcon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span className="block truncate text-xs text-slate-500">{item.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {!loading && value.trim().length >= 2 && !suggestions.length && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              No matching places found. You can still use the entered location.
            </div>
          )}
          {provider && suggestions.length > 0 && (
            <div className="px-3 pb-1 pt-2 text-right text-[10px] font-semibold text-slate-400">
              Powered by {provider === 'google' ? 'Google' : 'Mappls'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CounterRow({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5 py-3">
      <div>
        <p className="text-sm font-bold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="flex items-center gap-3" aria-label={`${label}: ${value}`}>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="grid size-9 place-items-center rounded-full border border-slate-200 text-slate-700 transition hover:border-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Minus size={15} />
        </button>
        <span className="w-5 text-center text-sm font-bold text-slate-900" aria-live="polite">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="grid size-9 place-items-center rounded-full border border-slate-200 text-slate-700 transition hover:border-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function TravellersPicker({
  adults,
  childrenCount,
  bags,
  onAdults,
  onChildren,
  onBags,
}: {
  adults: number;
  childrenCount: number;
  bags: number;
  onAdults: (value: number) => void;
  onChildren: (value: number) => void;
  onBags: (value: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const vehicle = adults + childrenCount >= 7
    ? 'Tempo Traveller'
    : adults >= 4 || bags >= 4
      ? 'MUV / Innova'
      : adults + childrenCount >= 3 || bags >= 3
        ? 'SUV'
        : 'Sedan';

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-[66px] w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100"
      >
        <Users size={20} className="shrink-0 text-slate-500" strokeWidth={1.8} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Travellers & luggage</span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-slate-900">
            {adults + childrenCount} traveller{adults + childrenCount === 1 ? '' : 's'}, {bags} bag{bags === 1 ? '' : 's'}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="dialog" aria-label="Choose travellers and luggage" className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_70px_-20px_rgba(15,23,42,0.38)]">
          <CounterRow label="Adults" description="Age 13+" value={adults} min={1} max={12} onChange={onAdults} />
          <div className="h-px bg-slate-100" />
          <CounterRow label="Children" description="Age 2–12" value={childrenCount} min={0} max={8} onChange={onChildren} />
          <div className="h-px bg-slate-100" />
          <CounterRow label="Luggage" description="Check-in bags" value={bags} min={0} max={12} onChange={onBags} />

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <span><strong>Recommended: {vehicle}</strong><br />Based on your group and luggage.</span>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="mt-3 min-h-11 w-full rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export default function TravelSearchBar({ className = '' }: { className?: string }) {
  const router = useRouter();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeTab, setActiveTab] = useState<SearchTab>('transfers');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [pickupPlace, setPickupPlace] = useState<LocationSuggestion | null>(null);
  const [dropoffPlace, setDropoffPlace] = useState<LocationSuggestion | null>(null);
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('full-day');
  const [nights, setNights] = useState('3');
  const [groupType, setGroupType] = useState('couple');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [bags, setBags] = useState(2);

  const changeTab = (tab: SearchTab) => {
    setActiveTab(tab);
    setDestination('');
    setDate(today());
    setDuration(tab === 'day-tours' ? 'full-day' : duration);
  };

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    changeTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams({ type: activeTab });

    if (activeTab === 'transfers') {
      params.set('pickup', pickup);
      params.set('dropoff', dropoff);
      if (pickupPlace?.lat != null && pickupPlace?.lng != null) {
        params.set('pickupLat', String(pickupPlace.lat));
        params.set('pickupLng', String(pickupPlace.lng));
      }
      if (dropoffPlace?.lat != null && dropoffPlace?.lng != null) {
        params.set('dropLat', String(dropoffPlace.lat));
        params.set('dropLng', String(dropoffPlace.lng));
      }
      params.set('date', date);
      params.set('time', time);
      params.set('adults', String(adults));
      params.set('children', String(children));
      params.set('luggage', String(bags));
    } else if (activeTab === 'day-tours') {
      params.set('destination', destination);
      params.set('date', date);
      params.set('duration', duration);
    } else {
      params.set('destination', destination);
      params.set('startDate', date);
      params.set('nights', nights);
      params.set('groupType', groupType);
    }

    router.push(`/search?${params.toString()}`);
  };

  return (
    <section aria-label="Travel search" className={`w-full max-w-7xl ${className}`}>
      <div className="overflow-hidden rounded-[28px] border border-white/70 bg-slate-50/95 shadow-[0_30px_90px_-35px_rgba(15,23,42,0.55)] backdrop-blur-xl">
        <div role="tablist" aria-label="Search type" className="flex overflow-x-auto border-b border-slate-200 bg-white px-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4 sm:pt-3">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                ref={(element) => { tabRefs.current[index] = element; }}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => changeTab(tab.id)}
                onKeyDown={(event) => moveTabFocus(event, index)}
                className={`relative flex min-h-14 shrink-0 items-center gap-2 px-3 text-sm font-bold transition focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:px-5 ${active ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Icon size={18} className={active ? 'text-amber-600' : ''} />
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-amber-500 sm:inset-x-5" />}
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="p-3 sm:p-5">
          {activeTab === 'transfers' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.25fr_1.25fr_.8fr_.7fr_1.1fr_auto]">
              <LocationAutocomplete label="Pickup point" placeholder="Airport, hotel or address" value={pickup} bias={dropoffPlace} onChange={(value, place) => { setPickup(value); setPickupPlace(place ?? null); }} />
              <LocationAutocomplete label="Dropoff point" placeholder="Where are you going?" value={dropoff} bias={pickupPlace} onChange={(value, place) => { setDropoff(value); setDropoffPlace(place ?? null); }} />
              <FieldShell icon={<CalendarDays size={20} />} label="Pickup date">
                <DatePicker value={date} min={today()} onChange={setDate} theme="light" showIcon={false} ariaLabel="Choose pickup date" popoverTitle="Choose pickup date" buttonClassName="mt-0.5 border-0 bg-transparent px-0 py-0.5 hover:border-transparent" />
              </FieldShell>
              <FieldShell icon={<Clock3 size={20} />} label="Pickup time">
                <input required type="time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-0.5 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none [color-scheme:light]" />
              </FieldShell>
              <TravellersPicker adults={adults} childrenCount={children} bags={bags} onAdults={setAdults} onChildren={setChildren} onBags={setBags} />
              <SearchButton label="Find a ride" />
            </div>
          )}

          {activeTab === 'day-tours' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_.8fr_.9fr_auto]">
              <LocationAutocomplete label="Destination city" placeholder="Try Delhi, Lucknow or Jaipur" value={destination} onChange={setDestination} />
              <FieldShell icon={<CalendarDays size={20} />} label="Tour date">
                <DatePicker value={date} min={today()} onChange={setDate} theme="light" showIcon={false} ariaLabel="Choose tour date" popoverTitle="Choose tour date" buttonClassName="mt-0.5 border-0 bg-transparent px-0 py-0.5 hover:border-transparent" />
              </FieldShell>
              <FieldShell icon={<Clock3 size={20} />} label="Duration">
                <select value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-0.5 w-full cursor-pointer bg-transparent text-sm font-semibold text-slate-900 outline-none">
                  <option value="half-day">Half-Day</option>
                  <option value="full-day">Full-Day</option>
                </select>
              </FieldShell>
              <SearchButton label="Explore tours" />
            </div>
          )}

          {activeTab === 'packages' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_.8fr_.7fr_.9fr_auto]">
              <LocationAutocomplete label="Destination" placeholder="Try Goa, Kerala or Kashmir" value={destination} onChange={setDestination} />
              <FieldShell icon={<CalendarDays size={20} />} label="Start date">
                <DatePicker value={date} min={today()} onChange={setDate} theme="light" showIcon={false} ariaLabel="Choose package start date" popoverTitle="Choose package start date" buttonClassName="mt-0.5 border-0 bg-transparent px-0 py-0.5 hover:border-transparent" />
              </FieldShell>
              <FieldShell icon={<MoonStar size={20} />} label="Duration">
                <select value={nights} onChange={(event) => setNights(event.target.value)} className="mt-0.5 w-full cursor-pointer bg-transparent text-sm font-semibold text-slate-900 outline-none">
                  {[2, 3, 4, 5, 6, 7, 10, 14].map((night) => <option key={night} value={night}>{night} nights</option>)}
                </select>
              </FieldShell>
              <FieldShell icon={<Users size={20} />} label="Group type">
                <select value={groupType} onChange={(event) => setGroupType(event.target.value)} className="mt-0.5 w-full cursor-pointer bg-transparent text-sm font-semibold text-slate-900 outline-none">
                  <option value="solo">Solo</option>
                  <option value="couple">Couple</option>
                  <option value="family">Family</option>
                  <option value="friends">Friends</option>
                  <option value="corporate">Corporate</option>
                </select>
              </FieldShell>
              <SearchButton label="View packages" />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-600" /> Free cancellation options</span>
            <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-600" /> Local verified partners</span>
            {activeTab === 'transfers' && <span className="flex items-center gap-1.5"><Luggage size={14} className="text-amber-600" /> Vehicle matched to your luggage</span>}
          </div>
        </form>
      </div>
    </section>
  );
}

function SearchButton({ label }: { label: string }) {
  return (
    <button type="submit" className="group flex min-h-[66px] items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-200 active:scale-[0.99] xl:min-w-16 xl:px-4">
      <Search size={19} strokeWidth={2.5} />
      <span className="xl:sr-only">{label}</span>
      <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5 xl:hidden" />
    </button>
  );
}
