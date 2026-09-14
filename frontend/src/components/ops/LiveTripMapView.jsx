import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { addBaseTiles } from "../../lib/mapTiles.js";
import { api } from "../../lib/api.js";
import {
  Car,
  Navigation,
  MapPin,
  Phone,
  Radio,
  Clock,
  ShieldCheck,
  Zap,
  ChevronRight,
  BatteryCharging,
  Gauge,
  Compass,
  AlertTriangle,
  RotateCw,
  X
} from "lucide-react";

const INDIA_CENTER = { lat: 22.5937, lng: 78.9629 };

const FRESHNESS = {
  LIVE: { label: "Live", className: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  DELAYED: { label: "Delayed", className: "bg-amber-100 text-amber-900 border-amber-300" },
  LOST: { label: "Signal lost", className: "bg-rose-100 text-rose-900 border-rose-300" },
};

function minutesAgo(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return minutes < 1 ? "just now" : `${minutes} min ago`;
}

function createDriverIcon(trip, isSelected) {
  const status = (trip.assignment_status || "ASSIGNED").toUpperCase();
  const speed = trip.driver_telemetry?.speed_kmh || 0;

  let bgClass = "bg-stone-900 border-white text-white";
  let pulseClass = "";

  if (!trip.driver_telemetry) {
    // No reported position: the pin sits at the pickup point and says so.
    bgClass = "bg-white border-dashed border-stone-400 text-stone-500";
  } else if (trip.driver_telemetry.freshness === "LOST") {
    bgClass = "bg-stone-300 border-rose-600 text-stone-700 opacity-80";
  } else if (status === "EN_ROUTE") {
    bgClass = "bg-amber-500 border-amber-900 text-stone-950 ring-2 ring-amber-400";
    pulseClass = "animate-pulse";
  } else if (status === "ARRIVED") {
    bgClass = "bg-emerald-600 border-emerald-900 text-white ring-2 ring-emerald-400";
  } else if (status === "TRIP_STARTED") {
    bgClass = "bg-sky-600 border-sky-900 text-white ring-2 ring-sky-300";
    pulseClass = "animate-pulse";
  }

  const selectedRing = isSelected ? "scale-125 ring-4 ring-amber-400 shadow-2xl z-50" : "shadow-md";

  const html = `
    <div class="relative transition-all duration-300 transform cursor-pointer ${selectedRing}">
      <div class="w-9 h-9 rounded-2xl border-2 flex items-center justify-center font-bold text-sm ${bgClass} ${pulseClass}">
        ${trip.driver_telemetry ? "🚗" : "📍"}
      </div>
      ${speed > 0 ? `<div class="absolute -bottom-2 -right-2 bg-stone-900 text-amber-300 border border-stone-700 px-1 py-0.2 text-[9px] font-mono font-bold rounded-md shadow-xs">${speed}k</div>` : ""}
    </div>
  `;

  return L.divIcon({
    className: "custom-driver-pin",
    html,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function createLocationIcon(type = "pickup") {
  const isPickup = type === "pickup";
  const bgClass = isPickup ? "bg-emerald-600 border-emerald-900" : "bg-rose-600 border-rose-900";
  const label = isPickup ? "📍" : "🏁";

  const html = `
    <div class="w-7 h-7 rounded-xl border-2 flex items-center justify-center font-bold text-xs ${bgClass} text-white shadow-md">
      ${label}
    </div>
  `;

  return L.divIcon({
    className: `custom-loc-${type}`,
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function LiveTripMapView({
  trips = [],
  onSelectTrip,
  onOpenStatusModal,
  onOpenReallocateModal,
  onRefresh,
  loading = false,
  className = ""
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersGroupRef = useRef(null);
  const polylinesGroupRef = useRef(null);

  const [selectedTrip, setSelectedTrip] = useState(null);
  const [filterStatus, setFilterStatus] = useState("ALL");

  const unmappedCount = trips.filter((t) => !t.driver_telemetry && !(Number.isFinite(t.pickup_lat) && Number.isFinite(t.pickup_lng))).length;
  const liveGpsCount = trips.filter((t) => t.driver_telemetry && t.driver_telemetry.freshness !== "LOST").length;
  // The selected trip is re-read from each poll so its position and freshness stay current.
  const liveSelected = selectedTrip ? trips.find((t) => t.booking_id === selectedTrip.booking_id) || selectedTrip : null;
  const [trail, setTrail] = useState([]);
  const selectedAssignmentId = liveSelected?.driver_telemetry ? liveSelected.assignment_id : null;
  const selectedFixAt = liveSelected?.driver_telemetry?.updated_at;

  useEffect(() => {
    if (!selectedAssignmentId) { setTrail([]); return undefined; }
    let active = true;
    api.getDriverTrail(selectedAssignmentId)
      .then((res) => { if (active) setTrail(res.trail || []); })
      .catch(() => { if (active) setTrail([]); });
    return () => { active = false; };
  }, [selectedAssignmentId, selectedFixAt]);

  const filteredTrips = trips.filter((t) => {
    if (filterStatus === "ALL") return true;
    const status = (t.assignment_status || "ASSIGNED").toUpperCase();
    return status === filterStatus;
  });

  // Initialize Map once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [INDIA_CENTER.lat, INDIA_CENTER.lng],
        zoom: 5,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      addBaseTiles(map);

      markersGroupRef.current = L.featureGroup().addTo(map);
      polylinesGroupRef.current = L.featureGroup().addTo(map);
      mapRef.current = map;
    }

    return () => {
      // Map cleanup
    };
  }, []);

  // Update Markers & Polylines on trips change
  useEffect(() => {
    const map = mapRef.current;
    const markersGroup = markersGroupRef.current;
    const polylinesGroup = polylinesGroupRef.current;
    if (!map || !markersGroup || !polylinesGroup) return;

    markersGroup.clearLayers();
    polylinesGroup.clearLayers();

    const bounds = [];

    filteredTrips.forEach((trip) => {
      const driverLat = trip.driver_telemetry ? trip.driver_telemetry.lat : trip.pickup_lat;
      const driverLng = trip.driver_telemetry ? trip.driver_telemetry.lng : trip.pickup_lng;
      const isSelected = liveSelected?.booking_id === trip.booking_id;

      if (typeof driverLat === "number" && typeof driverLng === "number") {
        // Driver marker
        const driverMarker = L.marker([driverLat, driverLng], {
          icon: createDriverIcon(trip, isSelected),
        });

        driverMarker.on("click", () => {
          setSelectedTrip(trip);
          if (onSelectTrip) onSelectTrip(trip);
        });

        markersGroup.addLayer(driverMarker);
        bounds.push([driverLat, driverLng]);

        if (isSelected && trip.driver_telemetry) {
          if (trip.driver_telemetry.accuracy_m) {
            polylinesGroup.addLayer(L.circle([driverLat, driverLng], { radius: trip.driver_telemetry.accuracy_m, color: "#0284c7", weight: 1, fillOpacity: 0.08 }));
          }
          if (trail.length > 1) {
            polylinesGroup.addLayer(L.polyline(trail.map((point) => [point.lat, point.lng]), { color: "#0284c7", weight: 4, opacity: 0.75 }));
          }
        }

        // If selected or active, render pickup, drop, and path
        if (isSelected && trip.driver_telemetry && trip.pickup_lat && trip.pickup_lng) {
          const pickupMarker = L.marker([trip.pickup_lat, trip.pickup_lng], {
            icon: createLocationIcon("pickup"),
          });
          markersGroup.addLayer(pickupMarker);
          bounds.push([trip.pickup_lat, trip.pickup_lng]);

          if (trip.drop_lat && trip.drop_lng) {
            const dropMarker = L.marker([trip.drop_lat, trip.drop_lng], {
              icon: createLocationIcon("drop"),
            });
            markersGroup.addLayer(dropMarker);
            bounds.push([trip.drop_lat, trip.drop_lng]);

            // Draw route polyline: Driver -> Pickup -> Drop
            const routeLine = L.polyline(
              [
                [driverLat, driverLng],
                [trip.pickup_lat, trip.pickup_lng],
                [trip.drop_lat, trip.drop_lng],
              ],
              {
                color: "#d97706",
                weight: 4,
                opacity: 0.8,
                dashArray: "6, 8",
              }
            );
            polylinesGroup.addLayer(routeLine);
          }
        }
      }
    });

    if (bounds.length > 0 && !liveSelected) {
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      } catch {
        // Safe fallback
      }
    }
  }, [filteredTrips, liveSelected, trail]);

  return (
    <div className={`relative w-full h-[750px] overflow-hidden rounded-3xl border border-stone-200 dark:border-stone-800 shadow-md ${className}`}>
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Filter Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md p-1.5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-lg pointer-events-auto">
          {[
            { id: "ALL", label: `All Active (${trips.length})` },
            { id: "EN_ROUTE", label: "En Route" },
            { id: "ARRIVED", label: "Arrived" },
            { id: "TRIP_STARTED", label: "In Transit" },
            { id: "ASSIGNED", label: "Assigned" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterStatus(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition ${
                filterStatus === f.id
                  ? "bg-amber-500 text-stone-950 shadow-xs"
                  : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-lg pointer-events-auto">
          <span className="text-[11px] font-mono text-stone-600 dark:text-stone-300">
            Live GPS {liveGpsCount}/{trips.length}
            {unmappedCount > 0 && <span className="text-amber-700"> · {unmappedCount} without pickup location</span>}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1 text-xs font-mono font-bold text-stone-700 dark:text-stone-200 hover:text-amber-600"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-600" : ""}`} />
            <span>Sync Fleet</span>
          </button>
        </div>
      </div>

      {/* Selected Trip Details Drawer (Bottom Right) */}
      {liveSelected && (
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-30 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
          <button
            type="button"
            onClick={() => setSelectedTrip(null)}
            className="absolute top-4 right-4 p-1.5 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Status Badge & Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full font-mono font-black text-[10px] bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
              {liveSelected.assignment_status || "ASSIGNED"}
            </span>
            <span className="text-xs font-mono font-bold text-stone-500">
              {liveSelected.booking_reference || liveSelected.ref}
            </span>
          </div>

          <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100 line-clamp-1">
            {liveSelected.product_title || "Experience Tour"}
          </h4>

          {/* Telemetry: only what a driver or operator actually reported */}
          {liveSelected.driver_telemetry ? (
            <div className="mt-3 grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-center font-mono">
              <div>
                <span className="block text-[9px] text-stone-400 uppercase">Speed</span>
                <strong className="text-xs text-stone-900 dark:text-stone-100 flex items-center justify-center gap-0.5">
                  <Gauge className="w-3 h-3 text-amber-600" />
                  {liveSelected.driver_telemetry.speed_kmh || 0} km/h
                </strong>
              </div>
              <div>
                <span className="block text-[9px] text-stone-400 uppercase">Heading</span>
                <strong className="text-xs text-stone-900 dark:text-stone-100 flex items-center justify-center gap-0.5">
                  <Compass className="w-3 h-3 text-sky-600" />
                  {liveSelected.driver_telemetry.heading || 0}°
                </strong>
              </div>
              <div>
                <span className="block text-[9px] text-stone-400 uppercase">Last fix</span>
                <strong className="text-xs text-stone-900 dark:text-stone-100 flex items-center justify-center gap-0.5">
                  <Clock className="w-3 h-3 text-emerald-600" />
                  {minutesAgo(liveSelected.driver_telemetry.updated_at)}
                </strong>
              </div>
            </div>
          ) : null}
          {liveSelected.driver_telemetry && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
              <span className={`rounded-full border px-2 py-0.5 font-mono font-bold ${(FRESHNESS[liveSelected.driver_telemetry.freshness] || FRESHNESS.LOST).className}`}>
                {(FRESHNESS[liveSelected.driver_telemetry.freshness] || FRESHNESS.LOST).label}
              </span>
              {liveSelected.driver_telemetry.accuracy_m ? <span>±{liveSelected.driver_telemetry.accuracy_m} m</span> : null}
              {liveSelected.driver_telemetry.source === "OPS" && <span>Entered by operations</span>}
              {liveSelected.driver_telemetry.freshness === "LOST" && <span className="font-semibold text-rose-700">Phone stopped sharing. Call the driver.</span>}
            </p>
          )}
          {!liveSelected.driver_telemetry && (
            <p className="mt-3 rounded-2xl border border-dashed border-stone-300 bg-[#FAF9F6] p-2.5 text-[11px] text-stone-600">
              No live GPS from this driver yet. The pin shows the pickup point. Call the driver to confirm where they are.
            </p>
          )}

          {/* Driver & Traveler Details */}
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
              <span className="text-stone-400">Driver:</span>
              <span className="font-bold text-stone-900 dark:text-stone-100">
                {liveSelected.driver_name || "Pending"} ({liveSelected.vehicle_number || "No Plate"})
              </span>
            </div>
            <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
              <span className="text-stone-400">Vehicle:</span>
              <span className="font-medium text-stone-800 dark:text-stone-200 truncate max-w-[180px]">
                {liveSelected.vehicle_model || "Commercial Vehicle"}
              </span>
            </div>
            <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
              <span className="text-stone-400">Traveler:</span>
              <span className="font-medium text-stone-800 dark:text-stone-200">
                {liveSelected.guest_name || liveSelected.traveler_name} ({liveSelected.guest_phone || liveSelected.traveler_phone})
              </span>
            </div>
            <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
              <span className="text-stone-400">Pickup:</span>
              <span className="font-medium text-stone-800 dark:text-stone-200 truncate max-w-[200px]" title={liveSelected.pickup_location}>
                {liveSelected.pickup_location}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-800 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (onOpenStatusModal) onOpenStatusModal(liveSelected);
              }}
              className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-stone-950 text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <Zap className="w-3.5 h-3.5" />
              Update / OTP
            </button>
            <button
              type="button"
              onClick={() => {
                if (onOpenReallocateModal) onOpenReallocateModal(liveSelected);
              }}
              className="py-2.5 px-3 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 font-bold text-stone-800 dark:text-stone-200 text-xs flex items-center justify-center gap-1.5 transition"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              Reallocate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
