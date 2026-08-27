import React, { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Check, ChevronDown, Crosshair, LoaderCircle, LocateFixed, MapPin,
  Navigation, Search, X
} from "lucide-react";

const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 };

function displayAddress(place) {
  if (!place.description || place.description.toLowerCase().includes(place.label.toLowerCase())) return place.label;
  return `${place.label}, ${place.description}`;
}

function locationIcon(markerLabel) {
  return L.divIcon({
    className: "",
    html: `<span style="display:grid;place-items:center;width:38px;height:38px;border-radius:999px 999px 999px 2px;background:#fbbf24;color:#0f172a;font:900 13px system-ui;border:3px solid white;box-shadow:0 8px 24px rgba(15,23,42,.45);transform:rotate(-45deg)"><b style="transform:rotate(45deg)">${markerLabel}</b></span>`,
    iconSize: [38, 44],
    iconAnchor: [19, 40],
  });
}

export default function PickupPointPicker({
  value,
  onChange,
  placeholder,
  label = "Pickup address or meeting point",
  kind = "pickup",
  markerLabel = "A",
  nearbyLocation = null,
  searchContext = "",
  productId = null,
  validationSide = kind === "dropoff" ? "DROP" : "PICKUP",
}) {
  const inputId = useId();
  const wrapperRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const inputRef = useRef(null);
  const searchBiasRef = useRef({
    address: value.address || "",
    lat: Number.isFinite(value.lat) ? value.lat : null,
    lng: Number.isFinite(value.lng) ? value.lng : null,
  });
  const [input, setInput] = useState(value.address || "");
  const [open, setOpen] = useState(false);
  const [showMap, setShowMap] = useState(Boolean(value.confirmed));
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [message, setMessage] = useState("");
  const pointLabel = kind === "dropoff" ? "drop-off" : "pickup";

  useEffect(() => {
    if (value.address && value.address !== input) setInput(value.address);
  }, [value.address]);

  useEffect(() => {
    if (value.confirmed && Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
      searchBiasRef.current = { address: value.address || "", lat: value.lat, lng: value.lng };
      return;
    }
    if (!Number.isFinite(searchBiasRef.current.lat) && nearbyLocation?.confirmed
      && Number.isFinite(nearbyLocation.lat) && Number.isFinite(nearbyLocation.lng)) {
      searchBiasRef.current = { address: nearbyLocation.address || "", lat: nearbyLocation.lat, lng: nearbyLocation.lng };
    }
  }, [value.address, value.confirmed, value.lat, value.lng, nearbyLocation?.address, nearbyLocation?.confirmed, nearbyLocation?.lat, nearbyLocation?.lng]);

  useEffect(() => {
    const close = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    const query = input.trim();
    if (!open || value.confirmed || query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setMessage("");
      try {
        if (productId) {
          const scopedResponse = await fetch(`/api/activities/${encodeURIComponent(productId)}/pickup-suggestions?side=${encodeURIComponent(validationSide)}&q=${encodeURIComponent(query)}`, { signal: controller.signal });
          const scopedData = await scopedResponse.json().catch(() => ({}));
          if (scopedResponse.ok) {
            setSuggestions((scopedData.suggestions || []).map((place) => ({
              id: place.id,
              label: place.name,
              description: place.displayHint || `${place.city}, ${place.state}`,
              category: String(place.type || "Location").replaceAll("_", " "),
              lat: Number(place.lat),
              lng: Number(place.lng),
            })));
            setActiveIndex(-1);
            return;
          }
        }
        const params = new URLSearchParams({ query });
        const bias = searchBiasRef.current;
        if (Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
          params.set("lat", String(bias.lat));
          params.set("lng", String(bias.lng));
        }
        // A new booking has no selected pickup/drop-off to bias the first
        // search. Fall back to the booked product's destination so matching
        // hotels and places in that city are ranked ahead of other cities.
        const context = bias.address || searchContext;
        if (context) params.set("context", context);
        const response = await fetch(`/api/places?${params}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Location search is unavailable.");
        setSuggestions(data.suggestions || []);
        setActiveIndex(-1);
      } catch (error) {
        if (error.name !== "AbortError") {
          setSuggestions([]);
          setMessage(error.message);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [input, open, value.confirmed, searchContext, productId, validationSide]);

  const commitLocation = async (location) => {
    const lat = location.lat === null || location.lat === undefined ? null : Number(location.lat);
    const lng = location.lng === null || location.lng === undefined ? null : Number(location.lng);
    const confirmed = Number.isFinite(lat) && Number.isFinite(lng);
    if (productId && confirmed) {
      const response = await fetch(`/api/activities/${encodeURIComponent(productId)}/validate-pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: validationSide, lat, lng, address: location.address }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.valid === false) {
        setMessage([data.error, data.detail?.suggestion].filter(Boolean).join(" ") || `This ${pointLabel} is outside the service area.`);
        return false;
      }
    }
    setInput(location.address);
    onChange({
      address: location.address,
      lat,
      lng,
      mapplsPin: location.mapplsPin || "",
      confirmed,
    });
    setOpen(false);
    setSuggestions([]);
    setMessage("");
    return true;
  };

  const chooseSuggestion = async (place) => {
    setResolving(true);
    setMessage("");
    try {
      let lat = place.lat === null || place.lat === undefined ? null : Number(place.lat);
      let lng = place.lng === null || place.lng === undefined ? null : Number(place.lng);
      const address = displayAddress(place);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const params = new URLSearchParams({ placeId: place.id, address });
        const response = await fetch(`/api/places/resolve?${params}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "This place could not be confirmed.");
        lat = Number(data.location.lat);
        lng = Number(data.location.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || data.location.requiresPin) {
          const resolvedAddress = data.location.address || address;
          setInput(resolvedAddress);
          onChange({ address: resolvedAddress, lat: null, lng: null, mapplsPin: place.id, confirmed: false });
          setOpen(false);
          setSuggestions([]);
          setShowMap(true);
          setMessage(`Place found. Click the map to confirm the exact ${pointLabel} point.`);
          return;
        }
      }
      if (await commitLocation({ address, lat, lng, mapplsPin: place.id })) setShowMap(true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setResolving(false);
    }
  };

  const reverseGeocode = async (lat, lng, fallbackAddress = "") => {
    setPinning(true);
    try {
      const response = await fetch(`/api/places/reverse?lat=${lat}&lng=${lng}`);
      const data = await response.json().catch(() => ({}));
      const address = response.ok
        ? data.location.address
        : fallbackAddress.trim() || `Pinned location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
      await commitLocation({ address, lat, lng });
      if (!response.ok) setMessage(data.error || "The pin is confirmed; please add a landmark below.");
    } catch {
      await commitLocation({ address: fallbackAddress.trim() || `Pinned location (${lat.toFixed(6)}, ${lng.toFixed(6)})`, lat, lng });
      setMessage("The pin is confirmed; please add a nearby landmark below.");
    } finally {
      setPinning(false);
    }
  };

  const useCurrentLocation = () => {
    setMessage("");
    if (!navigator.geolocation) {
      setMessage("Location access is not available on this device. Search or set the pin manually.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setShowMap(true);
        await reverseGeocode(coords.latitude, coords.longitude, "My current location");
        setLocating(false);
      },
      () => {
        setMessage("We could not access your location. Check browser permission, or set the pin manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  useEffect(() => {
    if (!showMap || !mapContainerRef.current || mapRef.current) return;
    const hasPoint = Number.isFinite(value.lat) && Number.isFinite(value.lng);
    const center = hasPoint ? { lat: value.lat, lng: value.lng } : INDIA_CENTER;
    const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([center.lat, center.lng], hasPoint ? 16 : 5);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    if (hasPoint) {
      markerRef.current = L.marker([value.lat, value.lng], { draggable: true, icon: locationIcon(markerLabel) }).addTo(map);
      markerRef.current.on("dragend", () => {
        const point = markerRef.current.getLatLng();
        reverseGeocode(point.lat, point.lng, input);
      });
    }
    map.on("click", ({ latlng }) => reverseGeocode(latlng.lat, latlng.lng, input));
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [showMap]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng)) {
      if (markerRef.current) {
        mapRef.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([value.lat, value.lng], { draggable: true, icon: locationIcon(markerLabel) }).addTo(mapRef.current);
      markerRef.current.on("dragend", () => {
        const point = markerRef.current.getLatLng();
        reverseGeocode(point.lat, point.lng, input);
      });
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
    mapRef.current.flyTo([value.lat, value.lng], Math.max(mapRef.current.getZoom(), 16), { duration: 0.6 });
  }, [value.lat, value.lng]);

  const editAddress = (next) => {
    setInput(next);
    onChange({ address: next, lat: null, lng: null, mapplsPin: "", confirmed: false });
    setOpen(true);
    setMessage("");
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") return setOpen(false);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!suggestions.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + suggestions.length) % suggestions.length);
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeIndex]);
    }
  };

  return (
    <div ref={wrapperRef} className="space-y-3">
      <div className="relative">
        <label htmlFor={inputId} className="block text-xs font-bold text-stone-700">{label}</label>
        <div className={`mt-2 flex min-h-14 items-center gap-3 rounded-2xl border bg-white px-4 transition shadow-sm ${value.confirmed ? "border-emerald-300 ring-2 ring-emerald-50" : "border-stone-300 focus-within:border-amber-500"}`}>
          {value.confirmed ? <Check className="h-5 w-5 shrink-0 text-emerald-600" /> : <Search className="h-5 w-5 shrink-0 text-stone-400" />}
          <input
            ref={inputRef}
            id={inputId}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${inputId}-results`}
            aria-activedescendant={activeIndex >= 0 ? `${inputId}-result-${activeIndex}` : undefined}
            value={input}
            onFocus={() => { if (!value.confirmed) setOpen(true); }}
            onChange={(event) => editAddress(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm font-medium text-stone-900 outline-none placeholder:text-stone-400"
          />
          {(searching || resolving) && <LoaderCircle aria-label="Searching locations" className="h-4 w-4 shrink-0 animate-spin text-amber-600" />}
          {input && !searching && !resolving && (
            <button type="button" aria-label={`Clear ${pointLabel}`} onClick={() => { editAddress(""); inputRef.current?.focus(); }} className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="h-4 w-4" /></button>
          )}
        </div>

        {open && input.trim().length >= 2 && (
          <div id={`${inputId}-results`} role="listbox" className="absolute inset-x-0 top-full z-[1000] mt-2 max-h-80 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-2 shadow-2xl">
            {suggestions.map((place, index) => (
              <button
                key={place.id}
                id={`${inputId}-result-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseSuggestion(place)}
                className={`flex min-h-14 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${activeIndex === index ? "bg-amber-50" : "hover:bg-stone-50"}`}
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><MapPin className="h-4 w-4 text-amber-600" /></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-bold text-stone-900">{place.label}</strong><span className="mt-0.5 block text-xs leading-relaxed text-stone-500">{place.description}</span></span>
              </button>
            ))}
            {!searching && !suggestions.length && !message && <p className="px-4 py-5 text-center text-xs text-stone-500">No matching {pointLabel} points. Try a hotel, landmark, airport or full address.</p>}
            <p className="border-t border-stone-100 px-3 pb-1 pt-2 text-right text-[10px] font-semibold text-stone-400">Powered by Mappls</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={useCurrentLocation} disabled={locating} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 hover:border-amber-500 hover:bg-stone-50 disabled:opacity-50 shadow-sm"><LocateFixed className={`h-4 w-4 text-amber-600 ${locating ? "animate-pulse" : ""}`} />{locating ? "Locating…" : "Use my location"}</button>
        <button type="button" onClick={() => setShowMap((current) => !current)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 hover:border-amber-500 hover:bg-stone-50 shadow-sm"><Crosshair className="h-4 w-4 text-amber-600" />{showMap ? "Hide map" : "Set pin on map"}<ChevronDown className={`h-3.5 w-3.5 transition ${showMap ? "rotate-180" : ""}`} /></button>
      </div>

      {value.confirmed && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span><strong className="block font-bold text-emerald-900">{kind === "dropoff" ? "Drop-off" : "Pickup"} point confirmed</strong>{value.mapplsPin ? `Mappls Pin ${value.mapplsPin} · ` : ""}{Number(value.lat).toFixed(5)}, {Number(value.lng).toFixed(5)}</span>
        </div>
      )}

      {showMap && (
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-[#FAF9F6] px-4 py-2.5 text-[11px] text-stone-500"><span className="flex items-center gap-1.5 font-bold"><Navigation className="h-3.5 w-3.5 text-amber-600" />Click the map or drag {markerLabel} to refine {pointLabel}</span>{pinning && <span className="flex items-center gap-1 text-amber-800 font-bold"><LoaderCircle className="h-3 w-3 animate-spin" />Updating address</span>}</div>
          <div ref={mapContainerRef} className="h-64 w-full" aria-label={`Set exact ${pointLabel} point on map`} />
        </div>
      )}

      {message && <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">{message}</p>}
    </div>
  );
}
