import React, { useEffect, useRef, useState } from 'react';

// Live location is required from "On the way" until the trip is completed (ADR 012).
const SHARING_STATUSES = ['EN_ROUTE', 'ARRIVED', 'TRIP_STARTED'];
const SEND_EVERY_MS = 15000;
const MAX_QUEUED_POINTS = 20;
// Phones only report when the position changes; a waiting driver still sends one a minute.
const HEARTBEAT_MS = 60000;
// Inside the Idea Holiday Driver Android app a native service shares location,
// and keeps doing so while the driver uses Maps or locks the phone (ADR 014).
const driverApp = () => (typeof window !== 'undefined' ? window.IdeaHolidayDriverApp : null);
const DRIVER_APP_URL = import.meta.env.VITE_DRIVER_APP_URL || '';

export default function DriverTrip() {
  const [session, setSession] = useState(() => sessionStorage.getItem('driverTripSession') || '');
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [note, setNote] = useState('');
  // off | starting | on | blocked | unsupported
  const [sharing, setSharingState] = useState('off');
  const sharingRef = useRef('off');
  const setSharing = (value) => { sharingRef.current = value; setSharingState(value); };
  const [lastSent, setLastSent] = useState(null);
  const [locationMessage, setLocationMessage] = useState('');
  const [distanceToPickupM, setDistanceToPickupM] = useState(null);
  const watchRef = useRef(null);
  const queueRef = useRef([]);
  const lastSentAtRef = useRef(0);
  const firstFixRef = useRef(null);
  const wakeLockRef = useRef(null);
  const heartbeatRef = useRef(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  async function request(path, body, token = sessionRef.current) {
    const res = await fetch(`/api/driver-trips${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Unable to load trip'), { code: data.code, status: res.status });
    return data;
  }

  async function keepScreenOn() {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null; });
      }
    } catch { /* not supported or refused; the reminder text still asks to keep the page open */ }
  }

  /** `leavingPage`: closing the page must not stop the app's service mid-trip. */
  function stopSharing({ leavingPage = false } = {}) {
    if (driverApp() && !leavingPage) driverApp().stopSharing();
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    queueRef.current = [];
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    setSharing('off');
  }

  async function flush() {
    if (!queueRef.current.length) return;
    const points = queueRef.current.splice(0, MAX_QUEUED_POINTS);
    try {
      const data = await request('/location', { points });
      lastSentAtRef.current = Date.now();
      setLastSent({ at: new Date(), accuracy: data.location?.accuracy_m ?? null });
      setDistanceToPickupM(Number.isFinite(data.distanceToPickupM) ? data.distanceToPickupM : null);
      setLocationMessage('');
    } catch (err) {
      if (err.code === 'TRIP_NOT_TRACKABLE') { stopSharing(); return; }
      if (err.status === 422) { setLocationMessage(err.message); return; }
      // Network gap: keep the newest points and try again with the next position.
      queueRef.current = [...points, ...queueRef.current].slice(-MAX_QUEUED_POINTS);
      setLocationMessage('No network. Your location will be sent when the connection returns.');
      throw err;
    }
  }

  // Status pushed by the app's location service.
  useEffect(() => {
    if (!driverApp()) return undefined;
    window.__ideaHolidayDriverAppStatus = (status) => {
      if (!status) return;
      if (status.state === 'ON') {
        setSharing('on');
        if (status.lastSentAtMs) { lastSentAtRef.current = status.lastSentAtMs; setLastSent({ at: new Date(status.lastSentAtMs), accuracy: status.accuracyM ?? null }); }
        if (Number.isFinite(status.distanceToPickupM)) setDistanceToPickupM(status.distanceToPickupM);
        setLocationMessage(status.message || '');
        if (firstFixRef.current) { firstFixRef.current.resolve(); firstFixRef.current = null; }
      } else if (status.state === 'STARTING') {
        setSharing('starting');
      } else if (status.state === 'OFFLINE') {
        setSharing('on');
        setLocationMessage(status.message || 'No network. Your location will be sent when the connection returns.');
      } else if (status.state === 'STOPPED') {
        setSharing(status.message ? 'blocked' : 'off');
        setLocationMessage(status.message || '');
        if (firstFixRef.current) { firstFixRef.current.reject(new Error(status.message || 'Location sharing stopped.')); firstFixRef.current = null; }
      }
    };
    return () => { delete window.__ideaHolidayDriverAppStatus; };
  }, []);

  function startSharingInApp() {
    if (sharingRef.current === 'on') return Promise.resolve();
    setSharing('starting');
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (!firstFixRef.current) return;
        firstFixRef.current = null;
        setSharing('off');
        reject(new Error('Could not get your GPS position. Move to an open area and tap Share location.'));
      }, 60000);
      firstFixRef.current = { resolve: () => { window.clearTimeout(timer); resolve(); }, reject: (err) => { window.clearTimeout(timer); reject(err); } };
      driverApp().startSharing(sessionRef.current, trip?.bookingRef || null);
    });
  }

  /** Starts sharing and resolves once the first position has reached the server. */
  function startSharing() {
    if (driverApp()) return startSharingInApp();
    if (!navigator.geolocation) {
      setSharing('unsupported');
      return Promise.reject(new Error('This browser cannot share location. Open the trip link in Chrome or Safari.'));
    }
    if (watchRef.current !== null && sharingRef.current === 'on') return Promise.resolve();
    setSharing('starting');
    keepScreenOn();
    return new Promise((resolve, reject) => {
      firstFixRef.current = { resolve, reject };
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      const onPosition = async (position, { heartbeat = false } = {}) => {
        const { latitude, longitude, accuracy, speed, heading } = position.coords;
        queueRef.current = [...queueRef.current, {
          lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null,
          speed: Number.isFinite(speed) ? speed : null, heading: Number.isFinite(heading) ? heading : null,
          recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
        }].slice(-MAX_QUEUED_POINTS);
        const waiting = firstFixRef.current;
        if (!waiting && !heartbeat && Date.now() - lastSentAtRef.current < SEND_EVERY_MS) return;
        try {
          await flush();
          setSharing('on');
          if (waiting) { firstFixRef.current = null; waiting.resolve(); }
        } catch (err) {
          if (waiting) { firstFixRef.current = null; waiting.reject(err); }
        }
      };
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (Date.now() - lastSentAtRef.current < HEARTBEAT_MS) return;
        navigator.geolocation.getCurrentPosition((position) => onPosition(position, { heartbeat: true }), () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 });
      }, HEARTBEAT_MS / 2);
      watchRef.current = navigator.geolocation.watchPosition(onPosition, (geoError) => {
        const blocked = geoError.code === 1;
        setSharing(blocked ? 'blocked' : 'off');
        const message = blocked
          ? 'Location is blocked for this page. Allow location for ideaholiday.in in your browser settings, then tap Share location.'
          : 'Could not get your GPS position. Move to an open area and tap Share location.';
        setLocationMessage(message);
        if (firstFixRef.current) { firstFixRef.current.reject(new Error(message)); firstFixRef.current = null; }
        if (blocked && watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
      }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    });
  }

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) return;
    // The app keeps the link so its service can renew the 12-hour session on long trips.
    driverApp()?.rememberLink(token);
    window.history.replaceState(null, '', window.location.pathname);
    setBusy(true);
    request('/session', { token }, '').then(data => {
      sessionStorage.setItem('driverTripSession', data.token);
      setSession(data.token);
    }).catch(err => setError(err.message)).finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    if (!session) return;
    request('').then(data => { setTrip(data.trip); setDistanceToPickupM(Number.isFinite(data.trip?.distanceToPickupM) ? data.trip.distanceToPickupM : null); }).catch(err => setError(err.message));
  }, [session]);

  // A reopened or reloaded page resumes sharing for a trip that is under way.
  const tripStatus = trip?.status;
  useEffect(() => {
    if (SHARING_STATUSES.includes(tripStatus) && trip?.acknowledgement === 'ACCEPTED' && watchRef.current === null && sharingRef.current !== 'on') startSharing().catch(() => {});
    if (tripStatus && !SHARING_STATUSES.includes(tripStatus) && tripStatus !== 'ASSIGNED') stopSharing();
  }, [tripStatus]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || watchRef.current === null) return;
      keepScreenOn();
      flush().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); stopSharing({ leavingPage: true }); };
  }, []);

  async function act(action) {
    setBusy(true); setError('');
    try {
      // Going on the way, arriving and starting all need live location first.
      if (['EN_ROUTE', 'ARRIVED', 'START'].includes(action)) await startSharing();
      const send = () => request('/action', { action, ...(action === 'START' ? { otp } : {}), ...(note ? { note } : {}) });
      try { await send(); }
      catch (err) {
        if (err.code !== 'LOCATION_SHARING_REQUIRED') throw err;
        setSharing('off'); // the server has no recent fix: get and send a fresh one
        await startSharing();
        await send();
      }
      setOtp('');
      if (action === 'DECLINE') { stopSharing(); setTrip(null); setError('Assignment declined. Your supplier has been notified.'); sessionStorage.removeItem('driverTripSession'); setSession(''); }
      else {
        if (action === 'COMPLETE') stopSharing();
        setTrip((await request('')).trip);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const button = (label, action) => <button type="button" disabled={busy} onClick={() => act(action)} className="rounded-xl bg-stone-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{label}</button>;
  const tripUnderWay = trip && SHARING_STATUSES.includes(trip.status);
  return <section className="mx-auto max-w-lg p-5 py-10">
    <p className="text-sm font-semibold text-amber-700">Idea Holiday · Driver service</p>
    <h1 className="my-4 text-2xl font-bold">Your assigned trip</h1>
    {error && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-900">{error}</p>}
    {!trip && !error && <p>{busy || session ? 'Loading trip…' : 'Open the private trip link from your email or WhatsApp.'}</p>}
    {trip && <div className="space-y-5 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-bold">{trip.bookingRef}</h2>
      <p>{trip.date} · {trip.pickupTime} {trip.timeLabel || 'IST'}</p>
      <p><strong>Pickup:</strong> {trip.pickupLocation}</p>
      {trip.dropLocation && <p><strong>Drop:</strong> {trip.dropLocation}</p>}
      <p><strong>Traveler:</strong> {trip.travelerName} · {trip.passengers} passengers</p>
      {trip.travelerPhone && <a className="block underline" href={`tel:${trip.travelerPhone}`}>Call traveler</a>}
      <p><strong>Vehicle:</strong> {trip.vehicleModel} · {trip.vehicleNumber}</p>
      <p role="status"><strong>Status:</strong> {trip.status.replaceAll('_',' ')} · {trip.acknowledgement}</p>
      {trip.acknowledgement === 'PENDING' && <p>Respond by {new Date(trip.responseDeadline).toLocaleString('en-IN', { timeZone: trip.timeZone || 'Asia/Kolkata' })} {trip.timeLabel || 'IST'}.</p>}

      {trip.acknowledgement === 'ACCEPTED' && trip.status === 'ASSIGNED' && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <strong>Live location is required for this trip.</strong> When you tap On the way, this page shares your location with Idea Holiday, your supplier and the traveler until you complete the trip. Positions are deleted after 30 days.
        </p>
      )}
      {trip.acknowledgement === 'ACCEPTED' && (tripUnderWay || sharing !== 'off') && (
        <div role="status" className={`rounded-xl border p-4 text-sm ${sharing === 'on' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
          {sharing === 'on' && <p><strong>● Sharing live location</strong>{lastSent && <> · last sent {lastSent.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{lastSent.accuracy !== null && ` · ±${lastSent.accuracy} m`}</>}</p>}
          {sharing === 'starting' && <p><strong>Getting your GPS position…</strong> Allow location if your phone asks.</p>}
          {['off', 'blocked', 'unsupported'].includes(sharing) && tripUnderWay && <p><strong>Location sharing is off.</strong> The traveler and your supplier can't see you.</p>}
          {locationMessage && <p className="mt-1">{locationMessage}</p>}
          {sharing === 'on' && (driverApp()
            ? <p className="mt-1">You can use Maps or lock your phone. Sharing continues until you complete the trip.</p>
            : <p className="mt-1">Keep this page open on screen. If you switch to another app or lock the phone, your location stops updating.{DRIVER_APP_URL && /android/i.test(navigator.userAgent) && <> <a className="font-semibold underline" href={DRIVER_APP_URL}>Get the Idea Holiday Driver app</a> to keep sharing while you navigate.</>}</p>)}
          {sharing !== 'on' && sharing !== 'starting' && tripUnderWay && <button type="button" onClick={() => startSharing().catch((err) => setLocationMessage(err.message))} className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white">Share location</button>}
        </div>
      )}

      {trip.acknowledgement === 'ACCEPTED' && trip.status === 'EN_ROUTE' && distanceToPickupM !== null && distanceToPickupM <= (trip.arrivalRadiusM || 150) && (
        <div role="status" className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 text-emerald-950">
          <p className="font-bold">You're at the pickup point.</p>
          <p className="text-sm">Tap Arrived so the traveler knows you're here.</p>
          <button type="button" disabled={busy} onClick={() => act('ARRIVED')} className="mt-3 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">Arrived at pickup</button>
        </div>
      )}
      {trip.status !== 'COMPLETED' && <label className="block">Service note (optional)<textarea className="mt-2 w-full rounded border p-3" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>}
      <div className="flex flex-wrap gap-3">
        {trip.acknowledgement === 'PENDING' && <>{button('Accept trip', 'ACCEPT')}{button('Decline trip', 'DECLINE')}</>}
        {trip.acknowledgement === 'ACCEPTED' && <>
          {trip.status === 'ASSIGNED' && button('Share location and go on the way', 'EN_ROUTE')}
          {trip.status === 'EN_ROUTE' && button('Arrived at pickup', 'ARRIVED')}
          {trip.status === 'ARRIVED' && <div className="space-y-3"><label className="block">Traveler pickup OTP<input autoComplete="off" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} className="mt-2 w-full rounded border p-3" /></label>{button('Verify OTP and start service', 'START')}</div>}
          {trip.status === 'TRIP_STARTED' && <div className="space-y-3"><p>Confirm that the booked service has finished before completing it.</p>{button('Complete service', 'COMPLETE')}</div>}
        </>}
      </div>
      {trip.status === 'COMPLETED' && <p>Completion recorded. Location sharing has stopped. Your supplier and Idea Holiday can see the service history.</p>}
      <p className="text-sm text-stone-500">For a changed vehicle, expired code, or service problem, contact your supplier or support@ideaholiday.in.</p>
    </div>}
  </section>;
}
