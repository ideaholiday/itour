import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { addBaseTiles } from "../lib/mapTiles.js";
import { authHeaders } from "../lib/api.js";
import IdeaHolidayLogo from "../components/IdeaHolidayLogo.jsx";

// The traveler's live trip page (ADR 012): opened from the WhatsApp/email link or My Trips.
const POLL_MS = 15000;
const FINAL_STATUSES = ["COMPLETED", "CANCELLED"];

function pin(emoji, className) {
  return L.divIcon({
    className: "trip-tracking-pin",
    html: `<div class="grid h-9 w-9 place-items-center rounded-2xl border-2 text-base shadow-md ${className}">${emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function ago(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return minutes < 1 ? "just now" : `${minutes} min ago`;
}

function etaText(eta) {
  if (!eta) return null;
  if (eta.minutes === 0) return "Nearly there";
  const km = eta.distanceM >= 1000 ? `${(eta.distanceM / 1000).toFixed(1)} km` : `${eta.distanceM} m`;
  return `About ${eta.minutes} min · ${km}${eta.source === "ESTIMATE" ? " (estimated)" : ""}`;
}

function headline(trip) {
  const driver = trip.driver?.name || "Your driver";
  switch (trip.status) {
    case "DRIVER_PENDING": return { title: "Your driver is being confirmed", detail: "We'll show your driver here as soon as they accept." };
    case "ASSIGNED": return { title: `${driver} is confirmed`, detail: "Their live location appears here when they start driving to you." };
    case "EN_ROUTE": return { title: `${driver} is on the way`, detail: trip.eta ? `${etaText(trip.eta)} to your pickup` : `Heading to ${trip.pickupLocation}` };
    case "ARRIVED": return { title: `${driver} has arrived`, detail: `Check number plate ${trip.driver?.vehicleNumber} before you share your pickup OTP.` };
    case "TRIP_STARTED": return { title: "Your trip is under way", detail: trip.eta ? `${etaText(trip.eta)} to ${trip.dropLocation || "your drop-off"}` : "Have a wonderful trip." };
    case "COMPLETED": return { title: "Trip complete", detail: "Thank you for travelling with Idea Holiday." };
    case "CANCELLED": return { title: "This booking is cancelled", detail: "Live tracking is not available." };
    default: return { title: "Your trip", detail: "" };
  }
}

export default function TripTracking() {
  const { ref } = useParams();
  const storageKey = `tripTracking:${String(ref || "").toUpperCase()}`;
  const [token] = useState(() => {
    const fromLink = window.location.hash.slice(1);
    try {
      if (fromLink) sessionStorage.setItem(storageKey, fromLink);
      return fromLink || sessionStorage.getItem(storageKey) || "";
    } catch {
      return fromLink;
    }
  });
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState("");
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedRef = useRef(false);

  // Keep the token out of the address bar once read.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    let active = true;
    let timer = null;
    const load = async () => {
      try {
        const res = await fetch(`/api/tracking/${encodeURIComponent(ref)}`, {
          headers: { ...authHeaders(), ...(token ? { "X-Tracking-Token": token } : {}) },
        });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) throw new Error(data.error || "Live tracking is unavailable right now.");
        setTrip(data.trip);
        setError("");
        if (FINAL_STATUSES.includes(data.trip.status)) return;
      } catch (err) {
        if (active) setError(err.message);
      }
      if (active) timer = window.setTimeout(load, document.visibilityState === "visible" ? POLL_MS : POLL_MS * 4);
    };
    load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [ref, token]);

  useEffect(() => {
    if (!trip || !mapElement.current) return;
    const points = [trip.location, trip.pickup, trip.status === "TRIP_STARTED" ? trip.drop : null].filter(Boolean);
    if (!points.length) return;
    if (!mapRef.current) {
      mapRef.current = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: false }).setView([points[0].lat, points[0].lng], 14);
      addBaseTiles(mapRef.current);
      layerRef.current = L.featureGroup().addTo(mapRef.current);
    }
    const layer = layerRef.current;
    layer.clearLayers();
    if (trip.pickup && trip.status !== "TRIP_STARTED") layer.addLayer(L.marker([trip.pickup.lat, trip.pickup.lng], { icon: pin("📍", "border-emerald-800 bg-emerald-600 text-white") }).bindTooltip("Pickup"));
    if (trip.drop && trip.status === "TRIP_STARTED") layer.addLayer(L.marker([trip.drop.lat, trip.drop.lng], { icon: pin("🏁", "border-rose-800 bg-rose-600 text-white") }).bindTooltip("Drop-off"));
    if (trip.location) {
      if (trip.location.accuracy_m) layer.addLayer(L.circle([trip.location.lat, trip.location.lng], { radius: trip.location.accuracy_m, color: "#0284c7", weight: 1, fillOpacity: 0.08 }));
      const stale = trip.location.freshness === "LOST";
      layer.addLayer(L.marker([trip.location.lat, trip.location.lng], { icon: pin("🚗", stale ? "border-stone-500 bg-stone-200 opacity-80" : "border-amber-900 bg-amber-400") }).bindTooltip(trip.driver?.name || "Driver"));
    }
    // Fit once; after that the traveler can pan and zoom without the map jumping back.
    if (!fittedRef.current) {
      if (points.length > 1) mapRef.current.fitBounds(points.map((point) => [point.lat, point.lng]), { padding: [48, 48], maxZoom: 16 });
      else mapRef.current.setView([points[0].lat, points[0].lng], 15);
      fittedRef.current = true;
    }
  }, [trip]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  const recenter = () => {
    const points = [trip?.location, trip?.pickup, trip?.status === "TRIP_STARTED" ? trip?.drop : null].filter(Boolean);
    if (mapRef.current && points.length) mapRef.current.fitBounds(points.map((point) => [point.lat, point.lng]), { padding: [48, 48], maxZoom: 16 });
  };

  const text = trip ? headline(trip) : null;
  const hasMap = Boolean(trip && (trip.location || trip.pickup));

  return (
    <main className="min-h-screen bg-[#FAF9F6] px-4 py-5 text-stone-900">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="flex items-center justify-between">
          <Link to="/"><IdeaHolidayLogo className="text-xl" /></Link>
          <span className="font-mono text-xs font-bold text-stone-500">{String(ref || "").toUpperCase()}</span>
        </header>

        {error && !trip && (
          <section role="alert" className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
            <p className="font-bold">{error}</p>
            <Link to="/bookings" className="mt-3 inline-block font-bold underline">Open My Trips</Link>
          </section>
        )}
        {!trip && !error && <p className="text-sm text-stone-500">Loading your trip…</p>}

        {trip && (
          <>
            <section role="status" className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">{trip.title}</p>
              <h1 className="mt-1 font-serif text-2xl font-bold">{text.title}</h1>
              {text.detail && <p className="mt-1 text-sm text-stone-700">{text.detail}</p>}
              {trip.location && (
                trip.location.freshness === "LOST"
                  ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">The driver's live location paused {ago(trip.location.updated_at)}. They may be in a low-signal area. Call them if you're unsure.</p>
                  : <p className="mt-2 text-xs text-stone-500">● Location updated {ago(trip.location.updated_at)}</p>
              )}
              {error && <p className="mt-2 text-xs text-amber-800">Couldn't refresh just now. Retrying…</p>}
            </section>

            {hasMap && (
              <section className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
                <div ref={mapElement} className="h-80 w-full sm:h-96" aria-label="Map of your driver and pickup" />
                <button type="button" onClick={recenter} className="absolute right-3 top-3 z-[500] rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold shadow">Recenter</button>
              </section>
            )}

            {trip.driver && !FINAL_STATUSES.includes(trip.status) && (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                <div>
                  <p className="text-sm font-bold">{trip.driver.name}</p>
                  <p className="text-xs text-stone-600">{trip.driver.vehicleModel}</p>
                  <p className="mt-1 inline-block rounded-lg border-2 border-stone-900 bg-yellow-50 px-2 py-0.5 font-mono text-sm font-black tracking-wider">{trip.driver.vehicleNumber}</p>
                </div>
                {trip.driver.phone && <a href={`tel:${trip.driver.phone}`} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700">Call driver</a>}
              </section>
            )}

            <section className="rounded-3xl border border-stone-200 bg-white p-5 text-sm shadow-sm">
              <p><span className="text-stone-500">Pickup:</span> <strong>{trip.pickupLocation}</strong> · {trip.activityDate} {trip.pickupTime} {trip.timeLabel || 'IST'}</p>
              {trip.dropLocation && <p className="mt-1"><span className="text-stone-500">Drop-off:</span> <strong>{trip.dropLocation}</strong></p>}
              <p className="mt-3 text-xs text-stone-500">Share your pickup OTP only with this driver, after checking the number plate. This link is private to your booking.</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
