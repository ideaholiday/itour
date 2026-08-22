import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { normalizePolygon } from "../../lib/geo.js";

const markerIcon = (label, color) => L.divIcon({
  className: "",
  html: `<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:${color};color:#0f172a;font:800 11px Manrope,sans-serif;border:3px solid white;box-shadow:0 3px 12px rgba(15,23,42,.35)">${label}</span>`,
  iconSize: [28, 28], iconAnchor: [14, 14]
});

export default function GeoFenceMap({ center = [26.7606, 80.8893], radiusKm = 35, polygon = [], zones = [], mode = "view", testPoint, onCenterChange, onPolygonChange, onTestPointChange, className = "h-[480px]" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [mapError, setMapError] = useState("");
  const callbacksRef = useRef({ mode, onCenterChange, onPolygonChange, onTestPointChange, polygon });
  callbacksRef.current = { mode, onCenterChange, onPolygonChange, onTestPointChange, polygon };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map;
    try {
      map = L.map(containerRef.current, { zoomControl: true }).setView(center, 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      map.on("click", ({ latlng }) => {
        const callbacks = callbacksRef.current;
        const point = [Number(latlng.lat.toFixed(6)), Number(latlng.lng.toFixed(6))];
        if (callbacks.mode === "draw") callbacks.onPolygonChange?.([...callbacks.polygon.filter((_, index, list) => index !== list.length - 1 || list[0][0] !== list[index][0] || list[0][1] !== list[index][1]), point]);
        if (callbacks.mode === "center") callbacks.onCenterChange?.(point);
        if (callbacks.mode === "test") callbacks.onTestPointChange?.(point);
      });
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 0);
    } catch (error) {
      console.error("Coverage map initialization failed", error);
      map?.remove();
      setMapError("The interactive map is temporarily unavailable. The coverage review data is still available below.");
    }
    return () => { map?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      layerRef.current?.remove();
      const group = L.layerGroup().addTo(map);
      layerRef.current = group;
      const bounds = [];

    zones.forEach((zone, index) => {
      let raw = zone.polygon_coordinates || [];
      try { if (typeof raw === "string") raw = JSON.parse(raw || "[]"); } catch { raw = []; }
      const ring = normalizePolygon(raw);
      const color = ["#f59e0b", "#34d399", "#818cf8", "#fb7185", "#38bdf8"][index % 5];
      if (ring.length >= 4) {
        L.polygon(ring, { color, weight: 2, fillColor: color, fillOpacity: 0.13 }).bindTooltip(`${zone.zone_name || "Service zone"} · ${zone.city || ""}`).addTo(group);
        bounds.push(...ring);
      } else if (zone.center_lat && zone.center_lng) {
        L.circle([zone.center_lat, zone.center_lng], { radius: Number(zone.radius_km) * 1000, color, fillOpacity: 0.1 }).bindTooltip(zone.zone_name || "Service zone").addTo(group);
        bounds.push([zone.center_lat, zone.center_lng]);
      }
    });

    const cleanPolygon = normalizePolygon(polygon);
    if (cleanPolygon.length >= 3) {
      L.polygon(cleanPolygon, { color: "#f59e0b", weight: 3, dashArray: "8 6", fillColor: "#f59e0b", fillOpacity: 0.16 }).addTo(group);
      bounds.push(...cleanPolygon);
    } else {
      L.circle(center, { radius: Number(radiusKm) * 1000, color: "#f59e0b", weight: 2, dashArray: "7 6", fillOpacity: 0.08 }).addTo(group);
    }

    if (!zones.length || onCenterChange) {
      const centerMarker = L.marker(center, { icon: markerIcon("C", "#fbbf24"), draggable: mode === "center" }).bindTooltip("Zone center").addTo(group);
      if (mode === "center") centerMarker.on("dragend", (event) => onCenterChange?.([Number(event.target.getLatLng().lat.toFixed(6)), Number(event.target.getLatLng().lng.toFixed(6))]));
      bounds.push(center);
    }

    if (mode === "draw") polygon.filter((_, index) => index < normalizePolygon(polygon).length - 1).forEach((point, index) => {
      const marker = L.marker(point, { icon: markerIcon(index + 1, "#f59e0b"), draggable: true }).addTo(group);
      marker.on("dragend", (event) => {
        const next = [...polygon];
        const nextPoint = [Number(event.target.getLatLng().lat.toFixed(6)), Number(event.target.getLatLng().lng.toFixed(6))];
        next[index] = nextPoint;
        onPolygonChange?.(next);
      });
    });

    if (testPoint) {
      L.marker(testPoint, { icon: markerIcon("T", "#34d399"), draggable: mode === "test" }).bindTooltip("Coverage test point").addTo(group).on("dragend", (event) => onTestPointChange?.([Number(event.target.getLatLng().lat.toFixed(6)), Number(event.target.getLatLng().lng.toFixed(6))]));
      bounds.push(testPoint);
    }

      if (bounds.length && !map.getBounds().contains(bounds[0])) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 12 });
    } catch (error) {
      console.error("Coverage map rendering failed", error);
      layerRef.current?.remove();
      setMapError("The interactive map is temporarily unavailable. The coverage review data is still available below.");
    }
  }, [center[0], center[1], radiusKm, polygon, zones, mode, testPoint]);

  return (
    <div ref={containerRef} className={`relative z-0 overflow-hidden rounded-2xl bg-[#FAF9F6] border border-stone-200 ${className}`} aria-label="Interactive service coverage map">
      {mapError && <div className="absolute inset-0 z-10 grid place-items-center bg-white p-6 text-center"><div><p className="text-sm font-bold uppercase tracking-wider text-amber-800">Map</p><p className="mt-3 text-sm font-bold text-stone-900">Map preview unavailable</p><p className="mt-1 text-xs text-stone-500">Review the coverage records below or refresh this page.</p></div></div>}
    </div>
  );
}
