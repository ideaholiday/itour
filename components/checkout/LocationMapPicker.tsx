'use client';

import 'leaflet/dist/leaflet.css';

import { Check, Crosshair, LoaderCircle, LocateFixed, MapPin, Navigation, Route, Search } from 'lucide-react';
import { KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import type { DivIcon, Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';

export type PinLocation = {
  address: string;
  instructions: string;
  lat: number;
  lng: number;
  confirmed?: boolean;
  mapplsPin?: string;
};

type PinKind = 'pickup' | 'drop';

const pinLabel: Record<PinKind, string> = { pickup: 'Pickup', drop: 'Drop-off' };

type PlaceSuggestion = {
  id: string;
  label: string;
  description: string;
  lat: number | null;
  lng: number | null;
};

export default function LocationMapPicker({
  pickup,
  drop,
  onPickupChange,
  onDropChange,
  productId,
  validationSide,
}: {
  pickup: PinLocation;
  drop: PinLocation;
  onPickupChange: (location: PinLocation) => void;
  onDropChange: (location: PinLocation) => void;
  productId?: string;
  validationSide?: PinKind;
}) {
  const autocompleteId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRefs = useRef<Partial<Record<PinKind, LeafletMarker>>>({});
  const handlersRef = useRef({ onPickupChange, onDropChange });
  const locationRef = useRef({ pickup, drop });
  const searchBiasRef = useRef({
    pickup: { address: pickup.address, lat: pickup.lat, lng: pickup.lng },
    drop: { address: drop.address, lat: drop.lat, lng: drop.lng },
  });
  const activePinRef = useRef<PinKind>('pickup');
  const [activePin, setActivePin] = useState<PinKind>('pickup');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [searchKind, setSearchKind] = useState<PinKind | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState('');

  handlersRef.current = { onPickupChange, onDropChange };
  locationRef.current = { pickup, drop };

  useEffect(() => {
    if (pickup.confirmed) searchBiasRef.current.pickup = { address: pickup.address, lat: pickup.lat, lng: pickup.lng };
    if (drop.confirmed) searchBiasRef.current.drop = { address: drop.address, lat: drop.lat, lng: drop.lng };
  }, [pickup.address, pickup.confirmed, pickup.lat, pickup.lng, drop.address, drop.confirmed, drop.lat, drop.lng]);

  const selectPin = (kind: PinKind) => {
    activePinRef.current = kind;
    setActivePin(kind);
    markerRefs.current[kind]?.openTooltip();
  };

  const commit = (kind: PinKind, location: PinLocation) => {
    if (kind === 'pickup') handlersRef.current.onPickupChange(location);
    else handlersRef.current.onDropChange(location);
  };

  const validateLocation = async (kind: PinKind, location: PinLocation) => {
    if (!productId) return;
    const response = await fetch(`/api/activities/${encodeURIComponent(productId)}/validate-pickup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side: (validationSide || kind).toUpperCase(), address: location.address, lat: location.lat, lng: location.lng }),
    });
    const data = await response.json().catch(() => ({}));
    // Static/demo checkout links may not map to a published backend product;
    // the booking endpoint remains the authoritative validation boundary.
    if (response.status === 404) return;
    if (!response.ok || data.valid === false) {
      const suggestion = data.suggestion || data.detail?.suggestion;
      throw new Error(suggestion ? `${data.error || 'This location is outside the service area.'} ${suggestion}` : (data.error || 'This location is outside the service area.'));
    }
  };

  const reversePin = async (kind: PinKind, lat: number, lng: number) => {
    const current = locationRef.current[kind];
    let address = current.address.trim() || `Pinned location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    try {
      const response = await fetch(`/api/places?mode=reverse&lat=${lat}&lng=${lng}`);
      const data = await response.json();
      if (response.ok && data.location?.address) address = data.location.address;
    } catch {
      // The coordinate remains usable if reverse geocoding is unavailable.
    }
    const next = { ...current, address, lat, lng, confirmed: true, mapplsPin: '' };
    try {
      await validateLocation(kind, next);
      commit(kind, next);
      setSearchError('');
    } catch (error) {
      setSearchError((error as Error).message);
    }
  };

  useEffect(() => {
    if (!searchKind) return;
    const location = searchKind === 'pickup' ? pickup : drop;
    const query = location.address.trim();
    if (query.length < 2 || location.confirmed) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const bias = searchBiasRef.current[searchKind];
        const params = new URLSearchParams({ query, lat: String(bias.lat), lng: String(bias.lng) });
        if (bias.address) params.set('context', bias.address);
        const endpoint = productId
          ? `/api/activities/${encodeURIComponent(productId)}/pickup-suggestions?side=${encodeURIComponent((validationSide || searchKind).toUpperCase())}&q=${encodeURIComponent(query)}`
          : `/api/places?${params}`;
        const response = await fetch(endpoint, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok && productId) {
          const fallback = await fetch(`/api/places?${params}`, { signal: controller.signal });
          const fallbackData = await fallback.json();
          if (!fallback.ok) throw new Error(fallbackData.error || data.error || 'Location search is unavailable.');
          setSuggestions(fallbackData.suggestions ?? []);
          setActiveIndex(-1);
          return;
        }
        if (!response.ok) throw new Error(data.error || 'Location search is unavailable.');
        setSuggestions(data.suggestions ?? []);
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSuggestions([]);
          setSearchError((error as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [searchKind, pickup.address, pickup.confirmed, drop.address, drop.confirmed]);

  const chooseSuggestion = async (kind: PinKind, suggestion: PlaceSuggestion) => {
    setResolving(true);
    setSearchError('');
    try {
      let lat = suggestion.lat;
      let lng = suggestion.lng;
      const address = suggestion.description && !suggestion.description.toLowerCase().includes(suggestion.label.toLowerCase())
        ? `${suggestion.label}, ${suggestion.description}`
        : suggestion.label;
      if (lat === null || lng === null) {
        const query = new URLSearchParams({ mode: 'resolve', placeId: suggestion.id, address });
        const response = await fetch(`/api/places?${query}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'This place could not be confirmed.');
        lat = Number(data.location.lat);
        lng = Number(data.location.lng);
      }
      const current = locationRef.current[kind];
      const next = { ...current, address, lat, lng, confirmed: true, mapplsPin: suggestion.id };
      await validateLocation(kind, next);
      commit(kind, next);
      markerRefs.current[kind]?.setLatLng([lat, lng]);
      mapRef.current?.flyTo([lat, lng], 16, { duration: 0.7 });
      setSearchKind(null);
      setSuggestions([]);
    } catch (error) {
      setSearchError((error as Error).message);
    } finally {
      setResolving(false);
    }
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>, kind: PinKind) => {
    if (event.key === 'Escape') return setSearchKind(null);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!suggestions.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + direction + suggestions.length) % suggestions.length);
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(kind, suggestions[activeIndex]);
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;

    import('leaflet').then((L) => {
      if (disposed || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([pickup.lat, pickup.lng], 13);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const makeIcon = (kind: PinKind): DivIcon => L.divIcon({
        className: 'wanderindia-map-pin',
        html: `<span class="${kind === 'pickup' ? 'bg-amber-500' : 'bg-emerald-500'}"><b>${kind === 'pickup' ? 'A' : 'B'}</b></span>`,
        iconSize: [38, 46],
        iconAnchor: [19, 42],
      });

      const addMarker = (kind: PinKind, location: PinLocation) => {
        const marker = L.marker([location.lat, location.lng], {
          draggable: true,
          icon: makeIcon(kind),
          keyboard: true,
          title: `${pinLabel[kind]} pin`,
        }).addTo(map);
        marker.bindTooltip(`${pinLabel[kind]} — drag to adjust`, { direction: 'top', offset: [0, -36] });
        marker.on('click', () => selectPin(kind));
        marker.on('dragend', () => {
          const point = marker.getLatLng();
          reversePin(kind, point.lat, point.lng);
        });
        markerRefs.current[kind] = marker;
      };

      addMarker('pickup', locationRef.current.pickup);
      addMarker('drop', locationRef.current.drop);
      map.fitBounds([
        [locationRef.current.pickup.lat, locationRef.current.pickup.lng],
        [locationRef.current.drop.lat, locationRef.current.drop.lng],
      ], { padding: [48, 48], maxZoom: 14 });

      map.on('click', (event) => {
        const kind = activePinRef.current;
        setSearchKind(null);
        markerRefs.current[kind]?.setLatLng(event.latlng);
        reversePin(kind, event.latlng.lat, event.latlng.lng);
      });
      mapRef.current = map;
    });

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerRefs.current.pickup?.setLatLng([pickup.lat, pickup.lng]);
  }, [pickup.lat, pickup.lng]);

  useEffect(() => {
    markerRefs.current.drop?.setLatLng([drop.lat, drop.lng]);
  }, [drop.lat, drop.lng]);

  const detectLocation = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Location detection is not supported on this device.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        selectPin('pickup');
        mapRef.current?.flyTo([coords.latitude, coords.longitude], 16, { duration: 0.8 });
        reversePin('pickup', coords.latitude, coords.longitude).finally(() => setLocating(false));
      },
      () => {
        setGeoError('We could not access your location. Check browser permission and try again.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-xl">
      <div className="flex flex-col gap-4 border-b border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-lg font-bold text-white"><Route size={20} className="text-amber-400" /> Pin exact trip locations</p>
          <p className="mt-1 text-sm text-slate-400">Select a point, then click the map or drag its marker.</p>
        </div>
        <button
          type="button"
          onClick={detectLocation}
          disabled={locating}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 text-sm font-bold text-amber-300 transition hover:bg-amber-400/20 disabled:opacity-60"
        >
          <LocateFixed size={17} className={locating ? 'animate-pulse' : ''} />
          {locating ? 'Detecting…' : 'Detect my current location'}
        </button>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {(['pickup', 'drop'] as PinKind[]).map((kind) => {
          const location = kind === 'pickup' ? pickup : drop;
          const change = kind === 'pickup' ? onPickupChange : onDropChange;
          const selected = activePin === kind;
          return (
            <div key={kind} className={`rounded-2xl border p-4 transition ${selected ? 'border-amber-400 bg-amber-400/5' : 'border-slate-700 bg-slate-950/50'}`}>
              <button type="button" onClick={() => selectPin(kind)} className="mb-3 flex w-full items-center justify-between text-left">
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <span className={`grid size-7 place-items-center rounded-full text-xs font-black text-slate-950 ${kind === 'pickup' ? 'bg-amber-400' : 'bg-emerald-400'}`}>{kind === 'pickup' ? 'A' : 'B'}</span>
                  {pinLabel[kind]}
                </span>
                {selected && <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300"><Crosshair size={13} /> Editing</span>}
              </button>
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-400" htmlFor={`${autocompleteId}-${kind}-address`}>Search address</label>
                <div className={`mt-1 flex items-center gap-2 rounded-xl border bg-slate-950 px-3 ${location.confirmed ? 'border-emerald-500/40' : 'border-slate-700 focus-within:border-amber-400'}`}>
                  {location.confirmed ? <Check size={15} className="shrink-0 text-emerald-400" /> : <Search size={15} className="shrink-0 text-slate-500" />}
                  <input
                    id={`${autocompleteId}-${kind}-address`}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={searchKind === kind}
                    aria-controls={`${autocompleteId}-${kind}-results`}
                    aria-activedescendant={activeIndex >= 0 ? `${autocompleteId}-${kind}-result-${activeIndex}` : undefined}
                    autoComplete="off"
                    value={location.address}
                    onFocus={() => { selectPin(kind); setSearchKind(kind); }}
                    onBlur={() => {
                      if (location.confirmed) {
                        validateLocation(kind, location).then(() => setSearchError('')).catch((error) => setSearchError((error as Error).message));
                      }
                    }}
                    onChange={(event) => {
                      change({ ...location, address: event.target.value, confirmed: false, mapplsPin: '' });
                      setSearchKind(kind);
                    }}
                    onKeyDown={(event) => onSearchKeyDown(event, kind)}
                    placeholder={kind === 'pickup' ? 'Hotel, airport, landmark or address' : 'Hotel or destination address'}
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  />
                  {(searching || resolving) && searchKind === kind && <LoaderCircle size={15} className="shrink-0 animate-spin text-amber-400" />}
                </div>
                {searchKind === kind && location.address.trim().length >= 2 && (
                  <div id={`${autocompleteId}-${kind}-results`} role="listbox" className="absolute inset-x-0 z-[1000] mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={suggestion.id}
                        id={`${autocompleteId}-${kind}-result-${index}`}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => chooseSuggestion(kind, suggestion)}
                        className={`flex min-h-12 w-full items-start gap-2 rounded-xl px-3 py-2 text-left ${activeIndex === index ? 'bg-amber-500/10' : 'hover:bg-slate-900'}`}
                      >
                        <MapPin size={16} className="mt-0.5 shrink-0 text-amber-400" />
                        <span className="min-w-0"><strong className="block truncate text-xs text-white">{suggestion.label}</strong><span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{suggestion.description}</span></span>
                      </button>
                    ))}
                    {!searching && !suggestions.length && !searchError && <p className="px-3 py-4 text-center text-xs text-slate-400">No matching places. Try a hotel, landmark or full address.</p>}
                    <p className="border-t border-slate-800 px-2 pb-0.5 pt-2 text-right text-[10px] font-semibold text-slate-500">Powered by Mappls</p>
                  </div>
                )}
              </div>
              <label className="mt-3 block text-xs font-semibold text-slate-400" htmlFor={`${kind}-instructions`}>Exact meeting point</label>
              <input
                id={`${kind}-instructions`}
                value={location.instructions}
                onFocus={() => setSearchKind(null)}
                onChange={(event) => change({ ...location, instructions: event.target.value })}
                placeholder={kind === 'pickup' ? 'Hotel lobby, Gate No. 2…' : 'Main entrance, reception…'}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-400"
              />
              <p className={`mt-2 flex items-center gap-1.5 font-mono text-[10px] ${location.confirmed ? 'text-emerald-400' : 'text-slate-500'}`}><Navigation size={11} /> {location.confirmed ? 'Confirmed · ' : 'Pin · '}{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</p>
            </div>
          );
        })}
      </div>

      <div className="relative h-[320px] border-t border-slate-800 sm:h-[390px]">
        <div ref={containerRef} aria-label="Interactive pickup and drop-off map" className="absolute inset-0 z-0" />
        <div className="pointer-events-none absolute left-3 top-3 z-[400] flex items-center gap-2 rounded-xl bg-slate-950/90 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur">
          <MapPin size={14} className="text-amber-400" /> Click map to move {activePin.toLowerCase()}
        </div>
      </div>
      {searchError && <p role="alert" className="border-t border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-200">{searchError} You can still click the map to confirm the pin.</p>}
      {geoError && <p role="alert" className="border-t border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-300">{geoError}</p>}
    </div>
  );
}
