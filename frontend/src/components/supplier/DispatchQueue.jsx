import React, { useEffect, useState } from 'react';
import { authHeaders } from '../../lib/api.js';
import DispatchTimeline from './DispatchTimeline.jsx';

const inputClass = 'mt-1 w-full rounded-lg border border-stone-300 bg-white p-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none';

function timeLeft(minutes) {
  if (minutes === null || minutes === undefined) return { label: 'Pickup time unknown', tone: 'bg-stone-100 text-stone-700 border-stone-300' };
  if (minutes <= 0) return { label: `Overdue by ${formatDuration(-minutes)}`, tone: 'bg-rose-600 text-white border-rose-700' };
  const tone = minutes <= 360 ? 'bg-rose-100 text-rose-900 border-rose-300' : minutes <= 720 ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-stone-100 text-stone-700 border-stone-300';
  return { label: `${formatDuration(minutes)} to pickup`, tone };
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

const istTime = iso => iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

async function send(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeaders() }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

// Phone confirmation for a driver who was assigned but has not accepted from the link.
export function ConfirmByPhone({ url, onDone }) {
  const [open, setOpen] = useState(false), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!open) return <button type="button" className="rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900" onClick={() => setOpen(true)}>Driver confirmed by phone</button>;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const d = await send(url, 'POST', { note }); onDone(d.message); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-2 w-full space-y-2 rounded-lg border border-emerald-200 bg-white p-3">
    <label className="block text-xs font-bold text-stone-700">Who confirmed, and when?
      <input required minLength={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Called Ravi at 18:05, he accepted" className={inputClass} />
    </label>
    <p className="text-[11px] text-stone-500">This accepts the trip for the driver, notifies the traveler and is saved in the audit log.</p>
    {error && <p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
    <div className="flex gap-2">
      <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Confirm driver'}</button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-3 py-1.5 text-xs">Cancel</button>
    </div>
  </form>;
}

// Operations take over: a driver from the booking supplier's fleet, or an outside driver.
function OpsAssignDriver({ task, onDone }) {
  const [drivers, setDrivers] = useState(null), [choice, setChoice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ fallbackDriverName: '', fallbackDriverPhone: '', fallbackDriverEmail: '', seatCapacity: task.passengers || 4, fallbackVehicleModel: '', fallbackVehicleNumber: '' });
  const [confirmedByPhone, setConfirmedByPhone] = useState(false), [notes, setNotes] = useState('');
  useEffect(() => {
    send(`/api/ops/bookings/${encodeURIComponent(task.booking_id)}/fleet-availability`).then(d => setDrivers(d.drivers)).catch(err => setError(err.message));
  }, [task.booking_id]);
  const field = (key, label, props = {}) => <label className="block text-xs font-bold text-stone-700">{label}<input required value={manual[key]} onChange={e => setManual({ ...manual, [key]: e.target.value })} className={inputClass} {...props} /></label>;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const body = { bookingId: task.booking_id, notes, confirmedByPhone, ...(choice === 'OUTSIDE' ? { ...manual, seatCapacity: Number(manual.seatCapacity) } : { supplierDriverId: choice }) };
      const d = await send('/api/ops/fallback-override', 'POST', body);
      onDone(d.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-3 w-full space-y-3 rounded-lg border border-stone-200 bg-white p-3">
    <label className="block text-xs font-bold text-stone-700">Driver
      <select required value={choice} onChange={e => setChoice(e.target.value)} className={inputClass}>
        <option value="">{drivers ? 'Choose a driver' : 'Loading supplier fleet…'}</option>
        {drivers?.some(d => d.available) && <optgroup label="Available for this trip">
          {drivers.filter(d => d.available).map(d => <option key={d.id} value={d.id}>{d.driver_name} · {d.vehicle_model} · {d.vehicle_number} · {d.seat_capacity} seats</option>)}
        </optgroup>}
        {drivers?.some(d => !d.available) && <optgroup label="Not available">
          {drivers.filter(d => !d.available).map(d => <option key={d.id} value={d.id} disabled>{d.driver_name} · {d.vehicle_number} · {d.reason || (!d.driver_email ? 'No driver email' : 'Unavailable')}</option>)}
        </optgroup>}
        <option value="OUTSIDE">Outside driver (not in supplier fleet)</option>
      </select>
    </label>
    {choice === 'OUTSIDE' && <div className="grid gap-2 sm:grid-cols-2">
      {field('fallbackDriverName', 'Driver name', { maxLength: 120 })}
      {field('fallbackDriverPhone', 'Driver mobile / WhatsApp', { inputMode: 'tel', placeholder: '+91…' })}
      {field('fallbackDriverEmail', 'Driver email (for trip link)', { type: 'email' })}
      {field('seatCapacity', 'Vehicle seats', { type: 'number', min: 1, max: 100 })}
      {field('fallbackVehicleModel', 'Vehicle model', { placeholder: `Must suit ${task.vehicle_category || 'the booked category'}` })}
      {field('fallbackVehicleNumber', 'Registration number', { className: `${inputClass} uppercase font-mono` })}
    </div>}
    <label className="block text-xs font-bold text-stone-700">Reason for taking over
      <input required minLength={3} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} placeholder={confirmedByPhone ? 'e.g. Supplier unreachable; called Ravi at 18:05, he accepted' : 'e.g. Supplier unreachable at T-6h'} className={inputClass} />
    </label>
    <label className="flex items-start gap-2 text-xs text-stone-700">
      <input type="checkbox" checked={confirmedByPhone} onChange={e => setConfirmedByPhone(e.target.checked)} className="mt-0.5" />
      <span>I spoke to the driver and they accepted this trip. The traveler is notified now; otherwise the driver must accept from the trip link.</span>
    </label>
    {error && <p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
    <button disabled={busy || !choice} className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Assigning…' : 'Assign driver'}</button>
  </form>;
}

const timelineUrl = (supplierId, bookingId) => supplierId
  ? `/api/suppliers/${supplierId}/bookings/${encodeURIComponent(bookingId)}/dispatch-timeline`
  : `/api/ops/bookings/${encodeURIComponent(bookingId)}/dispatch-timeline`;

function TimelineToggle({ supplierId, bookingId }) {
  return <details className="mt-2 w-full text-xs">
    <summary className="cursor-pointer font-bold text-stone-700">Timeline</summary>
    <div className="mt-2"><DispatchTimeline url={timelineUrl(supplierId, bookingId)} /></div>
  </details>;
}

// Operations finish a stuck trip: start without the traveler's OTP, or confirm completion.
function TripOverride({ task, onDone }) {
  const action = task.task_type === 'PICKUP_NOT_STARTED' ? 'START' : 'COMPLETE';
  const [open, setOpen] = useState(false), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const label = action === 'START' ? 'Start trip without OTP' : 'Mark trip complete';
  if (!open) return <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => setOpen(true)}>{label}</button>;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const d = await send(`/api/ops/bookings/${encodeURIComponent(task.booking_id)}/trip-override`, 'POST', { action, note }); onDone(d.message); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-2 w-full space-y-2 rounded-lg border border-stone-200 bg-white p-3">
    <label className="block text-xs font-bold text-stone-700">{action === 'START' ? 'Why is the OTP not being used, and how was the traveler verified?' : 'How was completion confirmed?'}
      <input required minLength={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder={action === 'START' ? 'e.g. Traveler phone dead; driver checked ID and booking ref' : 'e.g. Traveler confirmed drop at hotel by phone, 19:40'} className={inputClass} />
    </label>
    <p className="text-[11px] text-stone-500">{action === 'START' ? 'Starts the trip for the driver and notifies the traveler and supplier.' : 'Completes the trip and schedules the supplier payout.'} The reason is saved in the timeline.</p>
    {error && <p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
    <div className="flex gap-2">
      <button disabled={busy} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : label}</button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-3 py-1.5 text-xs">Cancel</button>
    </div>
  </form>;
}

function TripIssueCard({ task, supplierId, onSelect, onChanged }) {
  const late = task.task_type === 'PICKUP_NOT_STARTED';
  return <article className={`mt-3 rounded-xl border p-3 text-sm ${task.priority === 'CRITICAL' ? 'border-rose-300 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
    <div className="flex flex-wrap items-center gap-2">
      <strong className="font-mono">{task.ref}</strong>
      <span className="rounded-full bg-rose-700 px-2 py-0.5 text-[10px] font-black uppercase text-white">{late ? 'Pickup not started' : 'Completion overdue'}</span>
    </div>
    <p className="mt-1 text-xs text-stone-700">{task.product_title || 'Trip'} · pickup {istTime(task.pickup_at)} IST · {task.pickup_location}</p>
    {!supplierId && <p className="text-xs text-stone-600">Supplier: {task.supplier_name || task.supplier_id}{task.supplier_phone && <> · <a className="underline" href={`tel:${task.supplier_phone}`}>{task.supplier_phone}</a></>}</p>}
    <p className="mt-1 text-xs font-semibold text-stone-800">{task.notes}</p>
    {task.driver_name && <p className="text-xs text-stone-700">Driver {task.driver_name} · <a className="underline" href={`tel:${task.driver_phone}`}>{task.driver_phone}</a> · {task.vehicle_number} · status {String(task.assignment_status || '').replaceAll('_', ' ').toLowerCase()}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      {!supplierId && <TripOverride task={task} onDone={onChanged} />}
      {supplierId && onSelect && <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => onSelect(task.booking_id)}>Open booking</button>}
    </div>
    <TimelineToggle supplierId={supplierId} bookingId={task.booking_id} />
  </article>;
}

function TaskCard({ task, supplierId, onSelect, onChanged }) {
  const [assigning, setAssigning] = useState(false);
  const clock = timeLeft(task.minutes_to_pickup);
  const confirmUrl = supplierId
    ? `/api/suppliers/${supplierId}/bookings/${encodeURIComponent(task.booking_id)}/confirm-driver`
    : `/api/ops/bookings/${encodeURIComponent(task.booking_id)}/confirm-driver`;
  return <article className={`mt-3 rounded-xl border p-3 text-sm ${task.priority === 'CRITICAL' ? 'border-rose-300 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
    <div className="flex flex-wrap items-center gap-2">
      <strong className="font-mono">{task.ref}</strong>
      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${clock.tone}`}>{clock.label}</span>
      {task.priority === 'CRITICAL' && <span className="rounded-full bg-rose-700 px-2 py-0.5 text-[10px] font-black uppercase text-white">Critical</span>}
    </div>
    <p className="mt-1 text-xs text-stone-700">{task.product_title || 'Trip'} · {istTime(task.pickup_at) || `${task.activity_date} ${task.pickup_time}`} IST · {task.pickup_location} · {task.passengers} pax · {task.vehicle_category || 'Any vehicle'}</p>
    {!supplierId && <p className="text-xs text-stone-600">Supplier: {task.supplier_name || task.supplier_id}{task.supplier_phone && <> · <a className="underline" href={`tel:${task.supplier_phone}`}>{task.supplier_phone}</a></>}</p>}
    <p className="mt-1 text-xs font-semibold text-stone-800">{task.notes}</p>
    <p className="mt-1 text-xs text-stone-700">
      {task.driver_state === 'AWAITING_DRIVER'
        ? <>Waiting for <strong>{task.driver_name}</strong> (<a className="underline" href={`tel:${task.driver_phone}`}>{task.driver_phone}</a>, {task.vehicle_number}) to accept{task.response_deadline && ` by ${istTime(task.response_deadline)} IST`}.</>
        : 'No driver assigned.'}
    </p>
    <div className="mt-2 flex flex-wrap gap-2">
      {task.driver_state === 'AWAITING_DRIVER' && <ConfirmByPhone url={confirmUrl} onDone={onChanged} />}
      {supplierId && onSelect && <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => onSelect(task.booking_id)}>{task.driver_state === 'AWAITING_DRIVER' ? 'Change driver' : 'Assign a driver'}</button>}
      {!supplierId && <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => setAssigning(!assigning)}>{assigning ? 'Close' : task.driver_state === 'AWAITING_DRIVER' ? 'Assign a different driver' : 'Assign a driver'}</button>}
    </div>
    {assigning && <OpsAssignDriver task={task} onDone={message => { setAssigning(false); onChanged(message); }} />}
    <TimelineToggle supplierId={supplierId} bookingId={task.booking_id} />
  </article>;
}

function FleetReadiness({ readiness }) {
  const blocked = readiness.drivers.filter(d => !d.ready);
  if (!readiness.total) return <p role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">Automatic assignment needs at least one driver in your fleet. Add drivers in Manage Fleet.</p>;
  if (!blocked.length) return <p className="mt-2 text-xs text-emerald-800">All {readiness.total} fleet drivers can be assigned automatically.</p>;
  return <div role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
    <p className="font-bold">{readiness.ready} of {readiness.total} drivers can be assigned automatically. Complete these in Manage Fleet → Update dispatch contact and seats:</p>
    <ul className="mt-1 list-disc pl-5">
      {blocked.map(d => <li key={d.id}>{d.driver_name} ({d.vehicle_number}): {d.missing.length ? `add ${d.missing.join(' and ')}` : `status is ${d.status.toLowerCase()}`}</li>)}
    </ul>
  </div>;
}

export default function DispatchQueue({ supplierId, onSelect }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const base = supplierId ? `/api/suppliers/${supplierId}/dispatch` : '/api/ops/dispatch-queue';
  async function load() {
    try { setData(await send(base)); setError(''); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [base]);
  async function toggle() {
    try { await send(base, 'PUT', { automaticEnabled: !data.settings?.automatic_enabled }); await load(); }
    catch (e) { setError(e.message); }
  }
  const changed = message => { setNotice(message || 'Updated'); load(); };
  const leadHours = data?.settings?.lead_hours || 48;
  return <section className="my-4 rounded-xl border bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-bold">{supplierId ? 'Driver assignment and alerts' : 'Driver assignment queue'}</h2>
      {supplierId && data && <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={toggle}>{data.settings?.automatic_enabled ? 'Disable automatic assignment' : 'Enable automatic assignment'}</button>}
    </div>
    <p className="mt-2 text-sm text-stone-600">
      {supplierId
        ? `Automatic assignment ${data?.settings?.automatic_enabled ? `starts ${leadHours} hours before pickup` : 'is off'}. Without a confirmed driver you are alerted at 24 hours, escalated to Idea Holiday at 12 hours, and Idea Holiday takes over at 6 hours.`
        : 'Most urgent pickup first. Suppliers are alerted at 24 hours; tasks become critical at 12 hours; operations take over at 6 hours.'}
    </p>
    {supplierId && data?.settings?.source === 'DEFAULT' && data.settings.automatic_enabled ? <p className="mt-1 text-xs text-stone-500">On by platform default. Choosing Disable saves your preference.</p> : null}
    {supplierId && data?.readiness && data.settings?.automatic_enabled ? <FleetReadiness readiness={data.readiness} /> : null}
    {error && <p role="alert" className="mt-2 text-sm font-bold text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm font-semibold text-emerald-900">{notice}</p>}
    {!!data?.tripIssues?.length && <>
      <h3 className="mt-4 text-sm font-bold text-rose-900">Trips needing attention ({data.tripIssues.length})</h3>
      {data.tripIssues.map(task => <TripIssueCard key={task.id} task={task} supplierId={supplierId} onSelect={onSelect} onChanged={changed} />)}
    </>}
    {!!data?.tasks?.length && <h3 className="mt-4 text-sm font-bold text-stone-900">Waiting for a driver ({data.tasks.length})</h3>}
    {data?.tasks?.map(task => <TaskCard key={task.id} task={task} supplierId={supplierId} onSelect={onSelect} onChanged={changed} />)}
    {data && !data.tasks?.length && !data.tripIssues?.length && <p className="mt-3 text-sm">No bookings are waiting for a driver and no trips need attention.</p>}
    {!!data?.deliveries?.length && <details className="mt-3 text-sm"><summary>Notification jobs ({data.deliveries.length})</summary>{data.deliveries.map((d, i) => <p className="mt-2" key={i}>{d.event_type.replaceAll('_', ' ')} · {d.status === 'COMPLETE' ? 'Provider accepted / see delivery log for receipt' : d.status}{d.last_error ? ` · ${d.last_error}` : ''}</p>)}</details>}
  </section>;
}
