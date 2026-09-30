import React, { useEffect, useState } from 'react';
import { enableAppPush, unregisterAppPush } from '../lib/appPush.js';

// Driver sign-in by email code and the driver's trips from every supplier (ADR 053).
// Opening a trip hands its link to the existing trip page, so accepting, GPS
// sharing and the pickup OTP work exactly as from a WhatsApp or email link.
const SESSION_KEY = 'driverAccountSession';
const readSession = () => { try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } };
const writeSession = (token) => { try { if (token) localStorage.setItem(SESSION_KEY, token); else localStorage.removeItem(SESSION_KEY); } catch { /* private mode: signed in for this page only */ } };

async function request(path, { body, token } = {}) {
  const res = await fetch(`/api/driver-account${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status });
  return data;
}

const STATUS = { ASSIGNED: 'Assigned', EN_ROUTE: 'On the way', ARRIVED: 'At pickup', TRIP_STARTED: 'Trip started', COMPLETED: 'Completed' };
const deadline = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function DriverHome() {
  const [session, setSession] = useState(readSession);
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [trips, setTrips] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function signOut(reason = '') {
    unregisterAppPush('IdeaHolidayDriverApp');
    writeSession('');
    setSession('');
    setTrips(null);
    setCodeSent(false);
    setCode('');
    setError(reason);
  }

  async function load(token = session) {
    setBusy(true);
    try { setTrips(await request('/trips', { token })); setError(''); }
    catch (err) { if (err.status === 401) signOut('Please sign in again.'); else setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (session) load(); }, [session]);
  // In the driver app, new trip requests arrive as notifications (ADR 053).
  useEffect(() => (session ? enableAppPush((token) => request('/push-token', { body: { token }, token: session }), 'IdeaHolidayDriverApp') : undefined), [session]);

  async function sendCode(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { const data = await request('/code', { body: { login } }); setMessage(data.message); setCodeSent(true); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function verify(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { const data = await request('/session', { body: { login, code } }); writeSession(data.token); setMessage(''); setSession(data.token); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function openTrip(assignmentId) {
    setBusy(true); setError('');
    try {
      const { linkToken } = await request(`/trips/${encodeURIComponent(assignmentId)}/link`, { body: {}, token: session });
      window.location.assign(`/driver/trip#${linkToken}`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  const input = 'mt-2 w-full rounded-xl border p-3';
  const primary = 'rounded-xl bg-stone-900 px-5 py-3 font-semibold text-white disabled:opacity-50';
  const card = (trip, action) => <li key={trip.assignmentId} className="space-y-1 rounded-2xl border bg-white p-4">
    <p className="font-bold">{trip.bookingRef} · {trip.tour || 'Trip'}</p>
    <p>{trip.date} · {trip.pickupTime} · {trip.passengers} passengers</p>
    {trip.pickupLocation && <p className="text-sm"><strong>Pickup:</strong> {trip.pickupLocation}</p>}
    <p className="text-sm text-stone-600">{trip.supplierName}{trip.vehicle && ` · ${trip.vehicle}`}</p>
    {trip.acknowledgement === 'PENDING'
      ? <p className="text-sm font-semibold text-amber-800">Answer by {deadline(trip.responseDeadline)} IST</p>
      : <p className="text-sm"><strong>Status:</strong> {STATUS[trip.status] || trip.status}</p>}
    {trip.status === 'COMPLETED' && <p className="text-sm"><strong>Traveler:</strong> {trip.travelerName}</p>}
    {action && <button type="button" disabled={busy} onClick={() => openTrip(trip.assignmentId)} className={`${primary} mt-2`}>{action}</button>}
  </li>;
  const section = (title, list, action, empty) => <section className="space-y-3">
    <h2 className="text-lg font-bold">{title} {list.length > 0 && <span className="text-stone-500">({list.length})</span>}</h2>
    {list.length ? <ul className="space-y-3">{list.map((trip) => card(trip, action))}</ul> : <p className="text-sm text-stone-500">{empty}</p>}
  </section>;

  return <section className="mx-auto max-w-lg space-y-6 p-5 py-10">
    <div>
      <p className="text-sm font-semibold text-amber-700">Idea Holiday · Driver service</p>
      <h1 className="mt-4 text-2xl font-bold">{session ? 'My trips' : 'Driver sign-in'}</h1>
    </div>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">{error}</p>}

    {!session && !codeSent && <form onSubmit={sendCode} className="space-y-4">
      <label className="block">Mobile number or email
        <input className={input} autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required minLength={5} maxLength={254} placeholder="98765 43210 or you@example.com" />
      </label>
      <p className="text-sm text-stone-600">Use the number or email your supplier added for you. We send a sign-in code to that email.</p>
      <button type="submit" disabled={busy} className={primary}>Send code</button>
    </form>}

    {!session && codeSent && <form onSubmit={verify} className="space-y-4">
      {message && <p role="status" className="rounded-xl bg-sky-50 p-4 text-sky-950">{message}</p>}
      <label className="block">6-digit code
        <input className={input} autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required minLength={6} maxLength={6} />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || code.length !== 6} className={primary}>Sign in</button>
        <button type="button" disabled={busy} onClick={() => { setCodeSent(false); setCode(''); setError(''); }} className="rounded-xl border px-5 py-3 font-semibold">Change number or email</button>
      </div>
    </form>}

    {session && !trips && <p>{busy ? 'Loading your trips…' : ''}</p>}
    {session && trips && <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
        <span>Signed in as {trips.email}</span>
        <span className="flex gap-4">
          <button type="button" disabled={busy} onClick={() => load()} className="font-semibold underline">Refresh</button>
          <button type="button" onClick={() => signOut()} className="font-semibold underline">Sign out</button>
        </span>
      </div>
      {section('Waiting for you', trips.waiting, 'Accept or decline', 'No new trip requests.')}
      {section('Upcoming', trips.upcoming, 'Open trip', 'No upcoming trips.')}
      {section('Past trips', trips.past, null, 'No completed trips yet.')}
    </>}
  </section>;
}
