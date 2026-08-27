import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";

const CITY_COORDINATES = {
  delhi: [28.6139, 77.2090],
  "old delhi": [28.6562, 77.2410],
  "new delhi": [28.6139, 77.2090],
  agra: [27.1767, 78.0081],
  "delhi to agra": [27.8974, 77.6766],
  jaipur: [26.9124, 75.7873],
  "agra to jaipur": [27.0945, 76.8967],
  kochi: [9.9312, 76.2673],
  cochin: [9.9312, 76.2673],
  "fort kochi": [9.9658, 76.2421],
  munnar: [10.0889, 77.0595],
  "kochi to munnar": [10.0100, 76.6634],
  alleppey: [9.4981, 76.3388],
  alappuzha: [9.4981, 76.3388],
  "munnar to alleppey": [9.7935, 76.7011],
  goa: [15.2993, 74.1240],
  "panaji / old goa": [15.4909, 73.8278],
  panaji: [15.4909, 73.8278],
  "old goa": [15.5009, 73.9116],
  "grand island": [15.3524, 73.7667],
  "north goa": [15.5800, 73.7400],
  "south goa": [15.1800, 74.0100],
  "mollem national park": [15.3542, 74.2443],
  varanasi: [25.3176, 82.9739],
  "varanasi ghats": [25.3050, 83.0100],
  "old city varanasi": [25.3100, 83.0100],
  sarnath: [25.3716, 83.0252],
  mumbai: [19.0760, 72.8777],
  bengaluru: [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946],
  udaipur: [24.5854, 73.7125],
  jodhpur: [26.2389, 73.0243],
  jaisalmer: [26.9157, 70.9083],
  rishikesh: [30.0869, 78.2676],
  haridwar: [29.9457, 78.1642],
  shimla: [31.1048, 77.1734],
  manali: [32.2432, 77.1892],
  amritsar: [31.6340, 74.8723],
  kolkata: [22.5726, 88.3639],
  chennai: [13.0827, 80.2707],
  hyderabad: [17.3850, 78.4867],
  ooty: [11.4102, 76.6950],
  mysore: [12.2958, 76.6394],
  hampi: [15.3350, 76.4600],
};

const DAY_COLORS = [
  "#b45309", // Day 1 Amber-700
  "#0284c7", // Day 2 Sky-600
  "#059669", // Day 3 Emerald-600
  "#7c3aed", // Day 4 Violet-600
  "#e11d48", // Day 5 Rose-600
  "#d97706", // Day 6 Amber-600
  "#2563eb", // Day 7 Blue-600
  "#16a34a", // Day 8 Green-600
];

function getCoordinates(item, defaultDest = "") {
  if (item.product?.latitude && item.product?.longitude) {
    return [Number(item.product.latitude), Number(item.product.longitude)];
  }
  const loc = (item.location || item.title || defaultDest).toLowerCase().trim();
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (loc.includes(key)) {
      return coords;
    }
  }
  const destClean = defaultDest.toLowerCase().split(",")[0].trim();
  if (CITY_COORDINATES[destClean]) {
    return CITY_COORDINATES[destClean];
  }
  return [20.5937, 78.9629]; // India center
}

export default function CircuitRouteMapView({
  items = [],
  daysCount = 4,
  destination = "India",
  activeDay = 1,
  className = "",
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [20.5937, 78.9629],
        zoom: 5,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 18,
          subdomains: "abcd",
        }
      ).addTo(map);

      layerGroupRef.current = L.featureGroup().addTo(map);
      mapRef.current = map;
    }

    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    const sortedItems = [...items].sort((a, b) => {
      if ((a.dayNumber || 1) !== (b.dayNumber || 1)) {
        return (a.dayNumber || 1) - (b.dayNumber || 1);
      }
      const slotOrder = { MORNING: 1, AFTERNOON: 2, EVENING: 3, NIGHT: 4 };
      return (slotOrder[a.timeSlot] || 1) - (slotOrder[b.timeSlot] || 1);
    });

    const routeCoords = [];
    const bounds = [];

    // Map each day with slight offset if duplicate coordinates
    const coordUsageCount = {};

    sortedItems.forEach((item) => {
      const dayNum = item.dayNumber || 1;
      const color = DAY_COLORS[(dayNum - 1) % DAY_COLORS.length];
      const rawCoords = getCoordinates(item, destination);

      const coordKey = `${rawCoords[0].toFixed(2)},${rawCoords[1].toFixed(2)}`;
      const offsetIndex = coordUsageCount[coordKey] || 0;
      coordUsageCount[coordKey] = offsetIndex + 1;

      // Jitter overlapping pins slightly so all stops are clickable
      const lat = rawCoords[0] + (offsetIndex > 0 ? (offsetIndex * 0.015 * (offsetIndex % 2 === 0 ? 1 : -1)) : 0);
      const lng = rawCoords[1] + (offsetIndex > 0 ? (offsetIndex * 0.015 * (offsetIndex % 3 === 0 ? 1 : -1)) : 0);

      const latLng = [lat, lng];
      routeCoords.push(latLng);
      bounds.push(latLng);

      const iconHtml = `
        <div style="
          background-color: ${color};
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 11px;
          border: 2.5px solid white;
          box-shadow: 0 4px 8px rgba(0,0,0,0.3);
          transform: translate(-14px, -14px);
        ">
          ${dayNum}.${offsetIndex + 1}
        </div>
      `;

      const customIcon = L.divIcon({
        className: "circuit-pin",
        html: iconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const popupContent = `
        <div style="font-family: inherit; font-size: 12px; min-width: 180px; padding: 2px;">
          <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: ${color}; margin-bottom: 2px;">
            Day ${dayNum} • ${item.timeSlot || "Activity"}
          </div>
          <div style="font-weight: bold; font-size: 13px; color: #1c1917; line-height: 1.2; margin-bottom: 4px;">
            ${item.title}
          </div>
          <div style="color: #78716c; font-size: 11px; margin-bottom: 4px;">
            📍 ${item.location || destination}
          </div>
          ${item.durationHours ? `<div style="color: #44403c; font-size: 11px;">⏳ ~${item.durationHours} Hours</div>` : ""}
          ${item.notes ? `<div style="font-style: italic; color: #78716c; font-size: 10px; margin-top: 4px;">"${item.notes}"</div>` : ""}
        </div>
      `;

      const marker = L.marker(latLng, { icon: customIcon }).bindPopup(popupContent);
      layerGroup.addLayer(marker);
    });

    // Draw connected path between route coordinates
    if (routeCoords.length > 1) {
      const polyline = L.polyline(routeCoords, {
        color: "#b45309",
        weight: 3.5,
        opacity: 0.8,
        dashArray: "6, 8",
        lineCap: "round",
      });
      layerGroup.addLayer(polyline);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [items, daysCount, destination]);

  return (
    <div className={`relative rounded-3xl overflow-hidden border border-stone-200 shadow-sm bg-stone-100 ${className}`}>
      <div ref={mapContainerRef} className="h-full w-full min-h-[420px]" />
      
      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-md px-3 py-2 rounded-2xl border border-stone-200 shadow-md text-xs space-y-1">
        <div className="font-bold text-stone-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-amber-800" />
          <span>Circuit Day Route</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap max-w-xs">
          {Array.from({ length: Math.min(daysCount, 6) }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-1 text-[10px] font-bold text-stone-700">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: DAY_COLORS[idx % DAY_COLORS.length] }}
              />
              <span>Day {idx + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
