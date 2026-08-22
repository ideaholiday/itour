import React, { useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, Clock3, Download, LocateFixed, MapPin, MousePointer2, Pentagon, RotateCcw, Save, ShieldCheck, TestTube2, Trash2, Upload } from "lucide-react";
import GeoFenceMap from "./GeoFenceMap.jsx";
import { authHeaders } from "../../lib/api.js";
import { createRadiusPolygon, isPointCovered, normalizePolygon, polygonAreaKm2 } from "../../lib/geo.js";

const PRESETS = {
  Lucknow: [26.8467, 80.9462], Delhi: [28.6139, 77.209], Jaipur: [26.9124, 75.7873], Goa: [15.2993, 74.124], Mumbai: [19.076, 72.8777], Bengaluru: [12.9716, 77.5946]
};

const parseZone = (zone) => {
  let points = zone?.polygon_coordinates || [];
  try { if (typeof points === "string") points = JSON.parse(points); } catch { points = []; }
  return { ...zone, polygon_coordinates: points };
};

const zoneStatus = (zone) => zone.approval_status || (zone.is_active ? "APPROVED" : "SUSPENDED");

export default function GeoCoverageWorkbench({ supplierId, initialZones = [], onSaved }) {
  const [zones, setZones] = useState(initialZones.map(parseZone));
  const [zoneName, setZoneName] = useState("Lucknow Priority Service Zone");
  const [city, setCity] = useState("Lucknow");
  const [center, setCenter] = useState(PRESETS.Lucknow);
  const [radiusKm, setRadiusKm] = useState(35);
  const [polygon, setPolygon] = useState(createRadiusPolygon(PRESETS.Lucknow, 35, 12));
  const [mode, setMode] = useState("view");
  const [testPoint, setTestPoint] = useState([26.8467, 80.9462]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const closedPolygon = useMemo(() => normalizePolygon(polygon), [polygon]);
  const area = polygonAreaKm2(closedPolygon);
  const localZone = { center_lat: center[0], center_lng: center[1], radius_km: radiusKm, polygon_coordinates: closedPolygon };
  const covered = testPoint ? isPointCovered(testPoint, localZone) : false;

  const changePreset = (nextCity) => {
    const nextCenter = PRESETS[nextCity];
    setCity(nextCity); setCenter(nextCenter); setPolygon(createRadiusPolygon(nextCenter, radiusKm, 12));
  };

  const saveZone = async () => {
    if (!zoneName.trim() || closedPolygon.length < 4) return setMessage("Add a zone name and at least three boundary points.");
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/geofences`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ zoneName, city, centerLat: center[0], centerLng: center[1], radiusKm: Number(radiusKm), polygonCoordinates: closedPolygon }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save zone");
      const zone = { id: data.fenceId, supplier_id: supplierId, zone_name: zoneName, city, center_lat: center[0], center_lng: center[1], radius_km: radiusKm, polygon_coordinates: closedPolygon, is_active: 0, approval_status: data.approvalStatus || "PENDING_REVIEW" };
      setZones((current) => [...current, zone]); setMessage("Coverage zone submitted for admin review. It will be used for matching after approval."); onSaved?.();
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  };

  const deleteZone = async (zoneId) => {
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/geofences/${zoneId}`, { method: "DELETE", headers: authHeaders() });
      if (!response.ok) throw new Error("Could not remove zone");
      setZones((current) => current.filter((zone) => zone.id !== zoneId));
    } catch (error) { setMessage(error.message); }
  };

  const exportGeoJson = () => {
    const blob = new Blob([JSON.stringify({ type: "Feature", properties: { name: zoneName, city, radiusKm }, geometry: { type: "Polygon", coordinates: [closedPolygon.map(([lat, lng]) => [lng, lat])] } }, null, 2)], { type: "application/geo+json" });
    const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = `${zoneName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.geojson`; link.click(); URL.revokeObjectURL(href);
  };

  const importGeoJson = async (event) => {
    try {
      const data = JSON.parse(await event.target.files[0].text());
      const coordinates = data.type === "FeatureCollection" ? data.features?.[0]?.geometry?.coordinates?.[0] : data.geometry?.coordinates?.[0];
      if (!coordinates?.length) throw new Error();
      const points = coordinates.map(([lng, lat]) => [lat, lng]); setPolygon(points); setCenter(points[0]); setMode("draw"); setMessage("GeoJSON boundary imported. Review it on the map before saving.");
    } catch { setMessage("That file does not contain a valid GeoJSON polygon."); }
    event.target.value = "";
  };

  const tools = [
    ["view", MousePointer2, "Inspect"], ["center", LocateFixed, "Set center"], ["draw", Pentagon, "Draw boundary"], ["test", TestTube2, "Test address"]
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.6fr_.9fr]">
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-display text-xl font-bold text-stone-900">Live service-area map</h2><p className="mt-1 text-xs text-stone-500">Click to draw, drag boundary points, and test whether a pickup is covered.</p></div>
            <div className="flex flex-wrap gap-1.5 rounded-2xl bg-[#FAF9F6] border border-stone-200 p-1.5">
              {tools.map(([id, Icon, label]) => <button key={id} type="button" onClick={() => setMode(id)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition ${mode === id ? "bg-amber-500 text-stone-950 shadow-sm" : "text-stone-600 hover:bg-stone-100"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
            </div>
          </div>
          <GeoFenceMap center={center} radiusKm={radiusKm} polygon={polygon} zones={zones} mode={mode} testPoint={testPoint} onCenterChange={(point) => { setCenter(point); setMode("view"); }} onPolygonChange={setPolygon} onTestPointChange={setTestPoint} />
          <div className="grid grid-cols-3 divide-x divide-stone-200 border-t border-stone-200 bg-[#FAF9F6] text-center">
            <div className="p-3"><span className="block text-[10px] uppercase font-bold text-stone-400">Boundary</span><strong className="text-sm text-stone-900 font-bold">{Math.max(0, closedPolygon.length - 1)} points</strong></div>
            <div className="p-3"><span className="block text-[10px] uppercase font-bold text-stone-400">Area</span><strong className="text-sm text-stone-900 font-bold">{area.toFixed(1)} km²</strong></div>
            <div className="p-3"><span className="block text-[10px] uppercase font-bold text-stone-400">Test point</span><strong className={`text-sm font-bold ${covered ? "text-emerald-800" : "text-rose-800"}`}>{covered ? "Covered" : "Outside"}</strong></div>
          </div>
        </div>

        <aside className="space-y-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div><span className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-800">Zone setup</span><h2 className="mt-1 font-display text-xl font-bold text-stone-900">Coverage rules</h2></div>
          <label className="block text-xs font-bold text-stone-700">Zone name<input value={zoneName} onChange={(event) => setZoneName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-3 py-2.5 text-sm text-stone-900 font-normal outline-none focus:border-amber-500 focus:bg-white" /></label>
          <label className="block text-xs font-bold text-stone-700">City<select value={city} onChange={(event) => changePreset(event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] px-3 py-2.5 text-sm text-stone-900 font-normal outline-none focus:border-amber-500 focus:bg-white">{Object.keys(PRESETS).map((name) => <option key={name}>{name}</option>)}</select></label>
          <label className="block text-xs font-bold text-stone-700">Fallback radius: {radiusKm} km<input type="range" min="2" max="100" step="1" value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} className="mt-2 w-full accent-amber-500" /></label>
          <div className="grid grid-cols-2 gap-2"><button onClick={() => setPolygon(createRadiusPolygon(center, radiusKm, 16))} className="flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-stone-100 px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-200"><Circle className="h-4 w-4 text-amber-600" />Make radius zone</button><button onClick={() => setPolygon([])} className="flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-stone-100 px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-200"><RotateCcw className="h-4 w-4 text-stone-500" />Start over</button></div>
          <div className={`rounded-2xl border p-4 ${covered ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}><div className="flex items-center gap-2"><CheckCircle2 className={`h-5 w-5 ${covered ? "text-emerald-600" : "text-rose-600"}`} /><strong className={covered ? "text-emerald-900" : "text-rose-900"}>{covered ? "Pickup can be accepted" : "Pickup is outside this zone"}</strong></div><p className="mt-2 text-[11px] leading-relaxed text-stone-600">Select “Test address” and click or drag T on the map. Coordinates: {testPoint?.map((value) => value.toFixed(5)).join(", ")}</p></div>
          <div className="flex gap-2"><button onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-[#FAF9F6] px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100"><Upload className="h-4 w-4" />Import</button><button onClick={exportGeoJson} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-[#FAF9F6] px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100"><Download className="h-4 w-4" />Export</button><input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json" onChange={importGeoJson} className="hidden" /></div>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4"><div className="flex items-center gap-2 text-sm font-bold text-amber-900"><ShieldCheck className="h-4 w-4 text-amber-600" />Admin verification</div><p className="mt-2 text-[11px] leading-relaxed text-stone-600">New boundaries stay offline until Idea Holiday verifies the city and operating area.</p></div>
          <button onClick={saveZone} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-60 shadow-sm"><Save className="h-4 w-4" />{saving ? "Submitting zone…" : "Submit zone for review"}</button>
          {message && <p className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-3 text-xs leading-relaxed text-stone-700">{message}</p>}
        </aside>
      </div>

      <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-xl font-bold text-stone-900">Service zones</h2><p className="text-xs text-stone-500">Only approved boundaries qualify transfer and pickup requests.</p></div><div className="flex gap-2"><span className="rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1 text-xs font-bold text-emerald-900">{zones.filter((zone) => zoneStatus(zone) === "APPROVED" && Number(zone.is_active) === 1).length} active</span><span className="rounded-full bg-amber-100 border border-amber-300 px-3 py-1 text-xs font-bold text-amber-900">{zones.filter((zone) => zoneStatus(zone) === "PENDING_REVIEW").length} pending</span></div></div>
        {zones.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{zones.map((zone) => { const status = zoneStatus(zone); return <article key={zone.id} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4"><div className="flex items-start justify-between gap-3"><div><MapPin className="mb-3 h-5 w-5 text-amber-600" /><h3 className="font-bold text-stone-900">{zone.zone_name}</h3><p className="mt-1 text-xs text-stone-500">{zone.city} · {zone.radius_km} km fallback</p><span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${status === "APPROVED" ? "bg-emerald-100 border border-emerald-300 text-emerald-900" : status === "PENDING_REVIEW" ? "bg-amber-100 border border-amber-300 text-amber-900" : "bg-rose-100 border border-rose-300 text-rose-900"}`}>{status === "PENDING_REVIEW" ? <Clock3 className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}{status === "PENDING_REVIEW" ? "Admin review pending" : status.toLowerCase()}</span></div><button onClick={() => deleteZone(zone.id)} aria-label={`Delete ${zone.zone_name}`} className="rounded-lg p-2 text-stone-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div></article>; })}</div> : <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">No coverage submitted yet. Draw your first service zone above.</div>}
      </section>
    </div>
  );
}
