import React, { useEffect, useState } from 'react';

export default function DriverTrip() {
  const [session, setSession] = useState(() => sessionStorage.getItem('driverTripSession') || '');
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [note, setNote] = useState('');
  async function request(path, body, token = session) {
    const res = await fetch(`/api/driver-trips${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load trip');
    return data;
  }
  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) return;
    window.history.replaceState(null, '', window.location.pathname);
    setBusy(true);
    request('/session', { token }, '').then(data => {
      sessionStorage.setItem('driverTripSession', data.token);
      setSession(data.token);
    }).catch(err => setError(err.message)).finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    if (!session) return;
    request('').then(data => setTrip(data.trip)).catch(err => setError(err.message));
  }, [session]);
  async function act(action) {
    setBusy(true); setError('');
    try {
      await request('/action', { action, ...(action === 'START' ? { otp } : {}), ...(note ? { note } : {}) });
      setOtp('');
      if (action === 'DECLINE') { setTrip(null); setError('Assignment declined. Your supplier has been notified.'); sessionStorage.removeItem('driverTripSession'); setSession(''); }
      else setTrip((await request('')).trip);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const button = (label, action) => <button type="button" disabled={busy} onClick={() => act(action)} className="rounded-xl bg-stone-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{label}</button>;
  return <section className="mx-auto max-w-lg p-5 py-10">
    <p className="text-sm font-semibold text-amber-700">Idea Holiday · Driver service</p>
    <h1 className="my-4 text-2xl font-bold">Your assigned trip</h1>
    {error && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-900">{error}</p>}
    {!trip && !error && <p>{busy || session ? 'Loading trip…' : 'Open the private trip link from your email or WhatsApp.'}</p>}
    {trip && <div className="space-y-5 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-bold">{trip.bookingRef}</h2>
      <p>{trip.date} · {trip.pickupTime} IST</p>
      <p><strong>Pickup:</strong> {trip.pickupLocation}</p>
      {trip.dropLocation && <p><strong>Drop:</strong> {trip.dropLocation}</p>}
      <p><strong>Traveler:</strong> {trip.travelerName} · {trip.passengers} passengers</p>
      {trip.travelerPhone && <a className="block underline" href={`tel:${trip.travelerPhone}`}>Call traveler</a>}
      <p><strong>Vehicle:</strong> {trip.vehicleModel} · {trip.vehicleNumber}</p>
      <p role="status"><strong>Status:</strong> {trip.status.replaceAll('_',' ')} · {trip.acknowledgement}</p>
      {trip.acknowledgement === 'PENDING' && <p>Respond by {new Date(trip.responseDeadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.</p>}
      {trip.status !== 'COMPLETED' && <label className="block">Service note (optional)<textarea className="mt-2 w-full rounded border p-3" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>}
      <div className="flex flex-wrap gap-3">
        {trip.acknowledgement === 'PENDING' && <>{button('Accept trip', 'ACCEPT')}{button('Decline trip', 'DECLINE')}</>}
        {trip.acknowledgement === 'ACCEPTED' && <>
          {trip.status === 'ASSIGNED' && button('On the way', 'EN_ROUTE')}
          {trip.status === 'EN_ROUTE' && button('Arrived at pickup', 'ARRIVED')}
          {trip.status === 'ARRIVED' && <div className="space-y-3"><label className="block">Traveler pickup OTP<input autoComplete="off" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} className="mt-2 w-full rounded border p-3" /></label>{button('Verify OTP and start service', 'START')}</div>}
          {trip.status === 'TRIP_STARTED' && <div className="space-y-3"><p>Confirm that the booked service has finished before completing it.</p>{button('Complete service', 'COMPLETE')}</div>}
        </>}
      </div>
      {trip.status === 'COMPLETED' && <p>Completion recorded. Your supplier and Idea Holiday can see the service history.</p>}
      <p className="text-sm text-stone-500">For a changed vehicle, expired code, or service problem, contact your supplier or support@ideaholiday.in.</p>
    </div>}
  </section>;
}
