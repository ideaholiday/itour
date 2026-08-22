import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  Clock3,
  MapPinned,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import GeoFenceMap from "../../components/geo/GeoFenceMap.jsx";
import { authHeaders } from "../../lib/api.js";
import { isPointCovered } from "../../lib/geo.js";

const zoneStatus = (zone) => zone.approval_status || (zone.is_active ? "APPROVED" : "SUSPENDED");

const STATUS_STYLES = {
  APPROVED: "border-emerald-300 bg-emerald-100 text-emerald-900",
  PENDING_REVIEW: "border-amber-300 bg-amber-100 text-amber-900",
  REJECTED: "border-rose-300 bg-rose-100 text-rose-900",
  SUSPENDED: "border-stone-300 bg-stone-100 text-stone-700",
};

const STATUS_LABELS = {
  APPROVED: "Approved",
  PENDING_REVIEW: "Pending review",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[status] || STATUS_STYLES.SUSPENDED}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function CoverageControlView() {
  const [zones, setZones] = useState([]);
  const [cityCoverage, setCityCoverage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [city, setCity] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [testPoint, setTestPoint] = useState([15.2993, 74.124]);
  const [notes, setNotes] = useState({});
  const [updatingZone, setUpdatingZone] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/coverage", { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Coverage data is unavailable");
      setZones(data.zones || []);
      setCityCoverage(data.cityCoverage || []);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cities = [...new Set(zones.map((zone) => zone.city).filter(Boolean))].sort();
  const approvedZones = zones.filter((zone) => zoneStatus(zone) === "APPROVED" && Number(zone.is_active) === 1);
  const pendingZones = zones.filter((zone) => zoneStatus(zone) === "PENDING_REVIEW");
  const gapCities = cityCoverage.filter((item) => Number(item.active_zones) === 0);
  const coveredCities = cityCoverage.filter((item) => Number(item.active_zones) > 0);
  const mapZones = zones.filter((zone) => {
    const cityMatches = city === "ALL" || zone.city === city;
    const statusMatches = status === "ALL" || zoneStatus(zone) === status;
    return cityMatches && statusMatches;
  });
  const eligibleZones = city === "ALL" ? approvedZones : approvedZones.filter((zone) => zone.city === city);
  const matches = useMemo(
    () => eligibleZones.filter((zone) => isPointCovered(testPoint, zone)),
    [eligibleZones, testPoint],
  );

  const reviewZone = async (zone, action) => {
    const note = String(notes[zone.id] || "").trim();
    if (action !== "APPROVED" && note.length < 5) {
      setMessage("Add a short reason before rejecting or suspending a zone.");
      return;
    }
    setUpdatingZone(zone.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/coverage/${zone.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Coverage review could not be saved");
      setNotes((current) => ({ ...current, [zone.id]: "" }));
      setMessage(data.message);
      await load();
    } catch (requestError) {
      setMessage(requestError.message);
    } finally {
      setUpdatingZone("");
    }
  };

  const renderZoneActions = (zone) => {
    const currentStatus = zoneStatus(zone);
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {currentStatus !== "APPROVED" && (
          <button type="button" disabled={updatingZone === zone.id} onClick={() => reviewZone(zone, "APPROVED")} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-60 shadow-sm">
            <CheckCircle2 className="h-4 w-4" />Approve & activate
          </button>
        )}
        {currentStatus === "PENDING_REVIEW" && (
          <button type="button" disabled={updatingZone === zone.id} onClick={() => reviewZone(zone, "REJECTED")} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900 hover:bg-rose-100 disabled:opacity-60">
            <XCircle className="h-4 w-4" />Reject
          </button>
        )}
        {currentStatus === "APPROVED" && (
          <button type="button" disabled={updatingZone === zone.id} onClick={() => reviewZone(zone, "SUSPENDED")} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-100 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-200 disabled:opacity-60">
            <Ban className="h-4 w-4" />Suspend
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:flex sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-amber-700"><ShieldCheck className="h-4 w-4 text-amber-600" />Marketplace governance</span>
          <h1 className="mt-2 font-serif text-3xl font-bold text-stone-900">Coverage review & control</h1>
          <p className="mt-2 max-w-3xl text-sm text-stone-600">Approve supplier service boundaries before they affect matching, test real pickup coverage, and prioritise cities that still need partners.</p>
        </div>
        <button type="button" onClick={load} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-100 border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-200 sm:mt-0"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-600" : ""}`} />Refresh network</button>
      </header>

      {error && <div className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900"><AlertTriangle className="h-4 w-4 text-rose-600" />{error}</div>}
      {message && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{message}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><MapPinned className="h-5 w-5 text-emerald-700" /><span className="mt-4 block text-3xl font-bold text-stone-900">{approvedZones.length}</span><span className="text-xs text-stone-500">Approved active zones</span></div>
        <div className={`rounded-2xl border p-5 shadow-sm ${pendingZones.length ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}><Clock3 className="h-5 w-5 text-amber-700" /><span className="mt-4 block text-3xl font-bold text-stone-900">{pendingZones.length}</span><span className="text-xs text-stone-500">Waiting for admin review</span></div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><Building2 className="h-5 w-5 text-amber-800" /><span className="mt-4 block text-3xl font-bold text-stone-900">{coveredCities.length}</span><span className="text-xs text-stone-500">Catalog cities covered</span></div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><AlertTriangle className="h-5 w-5 text-rose-600" /><span className="mt-4 block text-3xl font-bold text-stone-900">{gapCities.length}</span><span className="text-xs text-stone-500">Catalog cities without coverage</span></div>
      </div>

      <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><span className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-700">Action required</span><h2 className="mt-1 font-serif text-2xl font-bold text-stone-900">Supplier review queue</h2><p className="mt-1 text-xs text-stone-600">Confirm that the city and drawn operating area are credible before activation.</p></div>
          <span className="rounded-full bg-amber-100 border border-amber-300 px-3 py-1 text-xs font-bold text-amber-900">{pendingZones.length} pending</span>
        </div>
        {pendingZones.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {pendingZones.map((zone) => (
              <article key={zone.id} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-stone-900">{zone.zone_name}</h3><p className="mt-1 text-xs text-stone-600">{zone.company_name} · {zone.city} · {zone.radius_km} km fallback</p></div><StatusBadge status={zoneStatus(zone)} /></div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-stone-500"><span>Supplier KYB: {zone.kyb_status}</span>{zone.submitted_at && <span>· Submitted {new Date(zone.submitted_at).toLocaleDateString("en-IN")}</span>}</div>
                <textarea value={notes[zone.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [zone.id]: event.target.value }))} rows="2" placeholder="Review note (required when rejecting)" className="mt-4 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500" />
                {renderZoneActions(zone)}
              </article>
            ))}
          </div>
        ) : <div className="mt-5 rounded-2xl border border-dashed border-stone-300 p-7 text-center text-sm text-stone-500">No supplier coverage is waiting for review.</div>}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.65fr_.75fr]">
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-xl font-bold text-stone-900">Network map & pickup test</h2><p className="text-xs text-stone-500">Click anywhere on the map. Eligibility uses approved zones only.</p></div><div className="flex gap-2"><select value={city} onChange={(event) => setCity(event.target.value)} className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-amber-500"><option value="ALL">All cities</option>{cities.map((name) => <option key={name}>{name}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-amber-500"><option value="ALL">All statuses</option><option value="APPROVED">Approved</option><option value="PENDING_REVIEW">Pending</option><option value="SUSPENDED">Suspended</option><option value="REJECTED">Rejected</option></select></div></div>
          <GeoFenceMap zones={mapZones} mode="test" testPoint={testPoint} onTestPointChange={setTestPoint} className="h-[540px]" />
        </div>
        <aside className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Search className="h-5 w-5 text-amber-600" /><h2 className="font-serif text-xl font-bold text-stone-900">Eligible partners</h2></div><p className="mt-2 text-xs leading-relaxed text-stone-500">Test point: {testPoint.map((value) => value.toFixed(5)).join(", ")}</p><div className="mt-5 space-y-3">{matches.length ? matches.map((zone) => <article key={zone.id} className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4"><span className="text-[10px] font-bold uppercase tracking-wider text-emerald-900">Approved & covered</span><h3 className="mt-1 font-bold text-stone-900">{zone.company_name}</h3><p className="mt-1 text-xs text-stone-600">{zone.zone_name} · {zone.city}</p></article>) : <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">No approved supplier covers this point. Treat it as a network expansion opportunity.</div>}</div></aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm"><div className="flex items-center justify-between"><div><span className="text-[10px] font-bold uppercase tracking-[.16em] text-rose-700">Supply gaps</span><h2 className="mt-1 font-serif text-xl font-bold text-stone-900">Cities needing partners</h2></div><span className="text-xs text-stone-500">From destination catalog</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{gapCities.length ? gapCities.slice(0, 12).map((item) => <div key={item.id || `${item.name}-${item.state}`} className="rounded-xl border border-stone-200 bg-[#FAF9F6] px-3 py-3"><strong className="text-sm text-stone-900">{item.name}</strong><span className="ml-2 text-xs text-stone-500">{item.state}</span></div>) : <p className="text-sm text-stone-600">Every active destination has at least one approved coverage zone.</p>}</div></section>
        <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm"><div><span className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-800">Zone controls</span><h2 className="mt-1 font-serif text-xl font-bold text-stone-900">Approved, rejected & suspended</h2></div><div className="mt-4 max-h-[390px] space-y-3 overflow-y-auto pr-1">{zones.filter((zone) => zoneStatus(zone) !== "PENDING_REVIEW").map((zone) => <article key={zone.id} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-stone-900">{zone.zone_name}</h3><p className="mt-1 text-xs text-stone-600">{zone.company_name} · {zone.city}</p></div><StatusBadge status={zoneStatus(zone)} /></div><textarea value={notes[zone.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [zone.id]: event.target.value }))} rows="1" placeholder={zoneStatus(zone) === "APPROVED" ? "Reason required to suspend" : "Optional approval note"} className="mt-3 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500" />{renderZoneActions(zone)}</article>)}</div></section>
      </div>
    </div>
  );
}
