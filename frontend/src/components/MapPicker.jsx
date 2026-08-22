import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, LocateFixed, MapPin, Navigation, Route } from "lucide-react";

const LOCATIONS = [
  { name: "Lucknow Airport (LKO) - Terminal 1", lat: 26.7606, lng: 80.8893, city: "Lucknow" },
  { name: "Hazratganj Market & Heritage Zone", lat: 26.8467, lng: 80.9462, city: "Lucknow" },
  { name: "Gomti Nagar Railway Station / IT Hub", lat: 26.8524, lng: 81.0024, city: "Lucknow" },
  { name: "Indira Gandhi Int Airport (DEL) T3", lat: 28.5562, lng: 77.1, city: "Delhi" },
  { name: "Connaught Place City Centre Delhi", lat: 28.6315, lng: 77.2167, city: "Delhi" },
  { name: "Goa Mopa Int Airport (GOX)", lat: 15.7483, lng: 73.8644, city: "Goa" },
  { name: "Baga & Calangute Beach Strip", lat: 15.5494, lng: 73.7535, city: "Goa" }
];

const pinIcon = (label, color) => L.divIcon({ className: "", html: `<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:999px;background:${color};color:#0f172a;font:900 13px Manrope;border:3px solid white;box-shadow:0 4px 16px rgba(15,23,42,.45)">${label}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });

export default function MapPicker({ originName = "Lucknow Airport (LKO)", originLat = 26.7606, originLng = 80.8893, destName = "Hazratganj Lucknow City Centre", destLat = 26.8467, destLng = 80.9462, onLocationChange, interactive = true }) {
  const [pickup, setPickup] = useState({ name: originName, lat: originLat, lng: originLng });
  const [drop, setDrop] = useState({ name: destName, lat: destLat, lng: destLng });
  const [active, setActive] = useState("pickup");
  const [geoError, setGeoError] = useState("");
  const mapContainer = useRef(null); const mapRef = useRef(null); const markersRef = useRef({}); const routeRef = useRef(null); const stateRef = useRef({ pickup, drop, active });
  stateRef.current = { pickup, drop, active };

  const update = (kind, location) => {
    if (kind === "pickup") { setPickup(location); onLocationChange?.({ pickup: location, drop: stateRef.current.drop }); }
    else { setDrop(location); onLocationChange?.({ pickup: stateRef.current.pickup, drop: location }); }
  };

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = L.map(mapContainer.current).setView([originLat, originLng], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    const addMarker = (kind, point, label, color) => {
      const marker = L.marker([point.lat, point.lng], { draggable: interactive, icon: pinIcon(label, color), keyboard: true }).addTo(map);
      marker.bindTooltip(`${kind === "pickup" ? "Pickup" : "Drop-off"} — drag to adjust`);
      marker.on("click", () => setActive(kind));
      marker.on("dragend", () => { const next = marker.getLatLng(); update(kind, { ...stateRef.current[kind], lat: next.lat, lng: next.lng }); });
      markersRef.current[kind] = marker;
    };
    addMarker("pickup", stateRef.current.pickup, "A", "#fbbf24"); addMarker("drop", stateRef.current.drop, "B", "#34d399");
    routeRef.current = L.polyline([[originLat, originLng], [destLat, destLng]], { color: "#f59e0b", weight: 4, dashArray: "10 8" }).addTo(map);
    map.fitBounds([[originLat, originLng], [destLat, destLng]], { padding: [45, 45], maxZoom: 14 });
    map.on("click", ({ latlng }) => { if (!interactive) return; const kind = stateRef.current.active; update(kind, { ...stateRef.current[kind], lat: latlng.lat, lng: latlng.lng, name: `${kind === "pickup" ? "Pickup" : "Drop-off"} pin (${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)})` }); });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    markersRef.current.pickup?.setLatLng([pickup.lat, pickup.lng]); markersRef.current.drop?.setLatLng([drop.lat, drop.lng]); routeRef.current?.setLatLngs([[pickup.lat, pickup.lng], [drop.lat, drop.lng]]);
  }, [pickup.lat, pickup.lng, drop.lat, drop.lng]);

  const useCurrentLocation = () => {
    setGeoError("");
    if (!navigator.geolocation) return setGeoError("Location detection is unavailable on this device.");
    navigator.geolocation.getCurrentPosition(({ coords }) => { const next = { name: "My current location", lat: coords.latitude, lng: coords.longitude }; setActive("pickup"); update("pickup", next); mapRef.current?.flyTo([coords.latitude, coords.longitude], 15); }, () => setGeoError("Location permission was not granted. You can still click the map to set your pickup."), { enableHighAccuracy: true, timeout: 10000 });
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white text-stone-900 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-stone-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="flex items-center gap-2 font-display text-xl font-bold text-stone-900"><Route className="h-5 w-5 text-amber-600" />Pin your exact route</h3><p className="mt-1 text-xs text-stone-500">Choose A or B, then click the map or drag its marker. Real map data by OpenStreetMap.</p></div>{interactive && <button onClick={useCurrentLocation} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 shadow-sm"><LocateFixed className="h-4 w-4 text-amber-600" />Use my location</button>}</div>
      {interactive && <div className="grid gap-3 p-4 sm:grid-cols-2">{[["pickup", "A", pickup, "Pickup / airport", "#fbbf24"], ["drop", "B", drop, "Drop-off / hotel", "#34d399"]].map(([kind, label, value, title]) => <div key={kind} className={`rounded-2xl border p-4 ${active === kind ? "border-amber-500 bg-amber-50/50" : "border-stone-200 bg-[#FAF9F6]"}`}><button onClick={() => setActive(kind)} className="flex w-full items-center justify-between text-left"><span className="flex items-center gap-2 text-sm font-bold text-stone-900"><span className={`grid h-7 w-7 place-items-center rounded-full font-bold text-stone-950 ${kind === "pickup" ? "bg-amber-400" : "bg-emerald-400"}`}>{label}</span>{title}</span>{active === kind && <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-800"><Crosshair className="h-3 w-3" />Editing</span>}</button><select value={LOCATIONS.some((location) => location.name === value.name) ? value.name : ""} onChange={(event) => { const location = LOCATIONS.find((item) => item.name === event.target.value); if (location) update(kind, location); }} className="mt-3 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500"><option value="">Custom map pin</option>{LOCATIONS.map((location) => <option key={location.name} value={location.name}>{location.city}: {location.name}</option>)}</select><p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-stone-500"><Navigation className="h-3 w-3" />{value.lat.toFixed(6)}, {value.lng.toFixed(6)}</p></div>)}</div>}
      <div className="relative h-[380px] border-t border-stone-200"><div ref={mapContainer} className="absolute inset-0 z-0" aria-label="Interactive pickup and drop-off route map" /><span className="pointer-events-none absolute left-3 top-3 z-[400] flex items-center gap-2 rounded-xl bg-white/95 border border-stone-200 px-3 py-2 text-xs font-bold text-stone-900 shadow-md"><MapPin className="h-4 w-4 text-amber-600" />Click to move {active}</span></div>
      {geoError && <p className="border-t border-rose-300 bg-rose-50 px-5 py-3 text-sm text-rose-800">{geoError}</p>}
    </div>
  );
}
