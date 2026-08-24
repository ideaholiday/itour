import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

function createDriverIcon(trip, isSelected) {
  const status = (trip.assignment_status || "ASSIGNED").toUpperCase();
  const speed = trip.driver_telemetry?.speed_kmh || 0;

  let bgClass = "bg-stone-900 border-white text-white";
  let pulseClass = "";

  if (status === "EN_ROUTE") {
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
        🚗
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

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> & Idea Holiday Ops',
          maxZoom: 19,
        }
      ).addTo(map);

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
      const driverLat = trip.driver_telemetry?.lat || trip.pickup_lat;
      const driverLng = trip.driver_telemetry?.lng || trip.pickup_lng;
      const isSelected = selectedTrip?.booking_id === trip.booking_id;

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

        // If selected or active, render pickup, drop, and path
        if (isSelected && trip.pickup_lat && trip.pickup_lng) {
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

    if (bounds.length > 0 && !selectedTrip) {
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      } catch {
        // Safe fallback
      }
    }
  }, [filteredTrips, selectedTrip]);

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

        <div className="flex items-center gap-2 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-lg pointer-events-auto">
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
      {selectedTrip && (
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
              {selectedTrip.assignment_status || "ASSIGNED"}
            </span>
            <span className="text-xs font-mono font-bold text-stone-500">
              {selectedTrip.booking_reference || selectedTrip.ref}
            </span>
          </div>

          <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100 line-clamp-1">
            {selectedTrip.product_title || "Experience Tour"}
          </h4>

          {/* Telemetry Metrics Bar */}
          <div className="mt-3 grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-[#FAF9F6] dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-center font-mono">
            <div>
              <span className="block text-[9px] text-stone-400 uppercase">Speed</span>
              <strong className="text-xs text-stone-900 dark:text-stone-100 flex items-center justify-center gap-0.5">
                <Gauge className="w-3 h-3 text-amber-600" />
                {selectedTrip.driver_telemetry?.speed_kmh || 0} km/h
              </strong>
            </div>
            <div>
              <span className="block text-[9px] text-stone-400 uppercase">Battery</span>
              <strong className="text-xs text-stone-900 dark:text-stone-100 flex items-center justify-center gap-0.5">
                <BatteryCharging className="w-3 h-3 text-emerald-600" />
                {selectedTrip.driver_telemetry?.battery_pct || 90}%
              </strong>
            </div>
            <div>
              <span className="block text-[9px] text-stone-400 uppercase">Heading</span>
              <strong className="text-xs text-stone-900 dark:text-stone-100 flex items-center justify-center gap-0.5">
                <Compass className="w-3 h-3 text-sky-600" />
                {selectedTrip.driver_telemetry?.heading || 0}°
              </strong>
            </div>
          </div>

          {/* Driver & Traveler Details */}
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
              <span className="text-stone-400">Driver:</span>
              <span className="font-bold text-stone-900 dark:text-stone-100">
                {selectedTrip.driver_name || "Pending"} ({selectedTrip.vehicle_number || "No Plate"})
              </span>
            </div>
            <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
              <span className="text-stone-400">Vehicle:</span>
              <span className="font-medium text-stone-800 dark:text-stone-200 truncate max-w-[180px]">
                {selectedTrip.vehicle_model || "Commercial Vehicle"}
              </span>
            </div>
            <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
              <span className="text-stone-400">Traveler:</span>
              <span className="font-medium text-stone-800 dark:text-stone-200">
                {selectedTrip.guest_name || selectedTrip.traveler_name} ({selectedTrip.guest_phone || selectedTrip.traveler_phone})
              </span>
            </div>
            <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
              <span className="text-stone-400">Pickup:</span>
              <span className="font-medium text-stone-800 dark:text-stone-200 truncate max-w-[200px]" title={selectedTrip.pickup_location}>
                {selectedTrip.pickup_location}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-800 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (onOpenStatusModal) onOpenStatusModal(selectedTrip);
              }}
              className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-stone-950 text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <Zap className="w-3.5 h-3.5" />
              Update / OTP
            </button>
            <button
              type="button"
              onClick={() => {
                if (onOpenReallocateModal) onOpenReallocateModal(selectedTrip);
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
