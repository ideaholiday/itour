import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Bus, CalendarDays, Package, Plus, RefreshCw, User, Users, X } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const KIND_ICONS = { GUIDE: User, VEHICLE: Bus, EQUIPMENT: Package, GENERAL: Package };
const KIND_LABELS = { GUIDE: "Guide", VEHICLE: "Vehicle", EQUIPMENT: "Equipment" };
const inputClass = "rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm";

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

const dayLabel = (date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/**
 * Departures board (ADR 037): every departure for a day or week with seats,
 * guests, check-in progress and crew. Owners and managers (canAssign) put
 * guides, vehicles and equipment on a departure; a guide linked to a login
 * sees only their own departures.
 */
export default function SupplierDeparturesBoard({ supplierId, canAssign = false }) {
  const base = `/api/suppliers/${supplierId}`;
  const [from, setFrom] = useState(indiaToday());
  const [days, setDays] = useState(1);
  const [board, setBoard] = useState(null);
  const [crew, setCrew] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(null);
  const [crewOpen, setCrewOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", kind: "GUIDE", capacity: "", userId: "" });

  const load = useCallback(() => {
    if (!supplierId) return;
    setLoading(true);
    setError("");
    Promise.all([
      request(`${base}/departures?from=${from}&days=${days}`),
      canAssign ? request(`${base}/resources`) : Promise.resolve(null),
    ])
      .then(([departures, resources]) => {
        setBoard(departures);
        if (resources) { setCrew(resources.resources || []); setStaff(resources.staff || []); }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [base, from, days, canAssign, supplierId]);

  useEffect(() => { load(); }, [load]);

  const run = async (action) => {
    setError("");
    try { await action(); load(); } catch (err) { setError(err.message); }
  };

  const assign = (departure, resourceId) => run(async () => {
    await request(`${base}/departures/assignments`, { method: "POST", body: JSON.stringify({ productId: departure.productId, date: departure.date, time: departure.time, resourceId }) });
    setPicking(null);
  });
  const unassign = (assignment) => run(() => request(`${base}/departures/assignments/${assignment.id}`, { method: "DELETE" }));
  const addCrew = (event) => {
    event.preventDefault();
    run(async () => {
      // Crew has no option links, so it never limits seats (vehicles that do are set per option).
      await request(`${base}/resources`, { method: "POST", body: JSON.stringify({ name: draft.name, kind: draft.kind, capacity: Number(draft.capacity || 0), optionIds: [], userId: draft.kind === "GUIDE" && draft.userId ? draft.userId : null }) });
      setDraft({ name: "", kind: draft.kind, capacity: "", userId: "" });
    });
  };

  const departures = board?.departures || [];
  const dates = [...new Set(departures.map((row) => row.date))];

  return (
    <section className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Departures board</span>
          <h2 className="mt-1 flex items-center gap-2 font-serif text-xl font-bold text-stone-900"><CalendarDays className="h-5 w-5 text-amber-600" /> Who's going, and who's taking them</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="From date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} />
          <select aria-label="Days to show" value={days} onChange={(event) => setDays(Number(event.target.value))} className={inputClass}>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
          </select>
          <button type="button" onClick={load} className="rounded-xl border border-stone-300 p-2.5 text-stone-500 hover:text-stone-900" aria-label="Refresh departures"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          {canAssign && <button type="button" onClick={() => setCrewOpen((open) => !open)} className="flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"><Users className="h-4 w-4" /> Crew</button>}
        </div>
      </div>

      {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}

      {canAssign && crewOpen && (
        <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
          <h3 className="text-sm font-bold text-stone-900">Crew</h3>
          <p className="mt-0.5 text-xs text-stone-500">Guides, vehicles and equipment you put on departures. Link a guide to their staff login so they see only their own trips.</p>
          <form onSubmit={addCrew} className="mt-3 flex flex-wrap items-end gap-2">
            <input required maxLength={120} placeholder="Name, e.g. Ravi or Van KA-01" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={`${inputClass} min-w-48 flex-1`} aria-label="Crew name" />
            <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })} className={inputClass} aria-label="Crew type">
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {draft.kind === "VEHICLE" && <input type="number" min="0" placeholder="Seats" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} className={`${inputClass} w-24`} aria-label="Vehicle seats" />}
            {draft.kind === "GUIDE" && (
              <select value={draft.userId} onChange={(event) => setDraft({ ...draft, userId: event.target.value })} className={inputClass} aria-label="Staff login">
                <option value="">No login</option>
                {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            )}
            <button type="submit" className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400"><Plus className="h-4 w-4" /> Add</button>
          </form>
          <ul className="mt-3 flex flex-wrap gap-2">
            {crew.map((resource) => {
              const Icon = KIND_ICONS[resource.kind] || Package;
              const login = staff.find((member) => member.id === resource.user_id);
              return <li key={resource.id} className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700"><Icon className="h-3.5 w-3.5 text-stone-500" />{resource.name}{login ? <span className="text-stone-400">· {login.name}'s login</span> : null}</li>;
            })}
            {!crew.length && <li className="text-xs text-stone-500">No crew yet.</li>}
          </ul>
        </div>
      )}

      {!loading && !departures.length && <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">No departures in these dates.</p>}

      {dates.map((date) => (
        <div key={date}>
          {days > 1 && <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-stone-500">{dayLabel(date)}</h3>}
          <div className="grid gap-3 md:grid-cols-2">
            {departures.filter((row) => row.date === date).map((departure) => {
              const free = crew.filter((resource) => !departure.assignments.some((assignment) => assignment.resourceId === resource.id));
              return (
                <article key={departure.key} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-stone-900">{departure.title}</p>
                      <p className="text-xs text-stone-500">{departure.time || "Any time"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-stone-900">{departure.guests}{departure.capacity ? <span className="text-xs font-bold text-stone-400"> / {departure.capacity}</span> : null}</p>
                      <p className="text-[10px] font-bold uppercase text-stone-500">{departure.capacity ? `${departure.freeSeats} free` : "guests"}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    {departure.bookings} booking{departure.bookings === 1 ? "" : "s"} · {departure.checkedIn} checked in{departure.noShow ? ` · ${departure.noShow} no-show` : ""}
                    {departure.balanceDueInr > 0 ? <span className="font-bold text-amber-700"> · collect ₹{departure.balanceDueInr.toLocaleString("en-IN")}</span> : null}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {departure.assignments.map((assignment) => {
                      const Icon = KIND_ICONS[assignment.kind] || Package;
                      return (
                        <span key={assignment.id} className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                          <Icon className="h-3.5 w-3.5" />{assignment.name}
                          {canAssign && <button type="button" onClick={() => unassign(assignment)} aria-label={`Remove ${assignment.name}`} className="rounded-full p-0.5 hover:bg-emerald-100"><X className="h-3 w-3" /></button>}
                        </span>
                      );
                    })}
                    {!departure.assignments.length && <span className="text-xs text-stone-400">No crew assigned</span>}
                    {canAssign && (picking === departure.key ? (
                      <select autoFocus aria-label="Assign crew" defaultValue="" onChange={(event) => event.target.value && assign(departure, event.target.value)} onBlur={() => setPicking(null)} className="rounded-full border border-stone-300 bg-white px-2 py-1 text-xs">
                        <option value="" disabled>Choose…</option>
                        {free.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}{KIND_LABELS[resource.kind] ? ` (${KIND_LABELS[resource.kind].toLowerCase()})` : ""}</option>)}
                      </select>
                    ) : (
                      <button type="button" onClick={() => setPicking(departure.key)} disabled={!crew.length} title={crew.length ? "Assign crew" : "Add crew first"} className="flex items-center gap-1 rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-xs font-bold text-stone-600 hover:bg-white disabled:opacity-40"><Plus className="h-3 w-3" /> Assign</button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
