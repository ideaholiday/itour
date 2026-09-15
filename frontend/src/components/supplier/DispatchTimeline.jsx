import React, { useEffect, useState } from 'react';
import { authHeaders } from '../../lib/api.js';

const STATUS_LABELS = { EN_ROUTE: 'Driver on the way', ARRIVED: 'Driver arrived at pickup', TRIP_STARTED: 'Trip started', COMPLETED: 'Trip completed' };
const EVENT_LABELS = {
  ASSIGNED: 'Driver requested',
  REASSIGNED: 'Driver changed',
  ACCEPT: 'Driver accepted from trip link',
  ACCEPT_BY_PHONE: 'Driver confirmed by phone',
  DECLINE: 'Driver declined',
  TIMED_OUT: 'Driver did not respond in time',
  REVOKED: 'Driver removed',
};
const TONES = { DECLINE: 'bg-rose-500', TIMED_OUT: 'bg-rose-500', REVOKED: 'bg-stone-400', ACCEPT: 'bg-emerald-600', ACCEPT_BY_PHONE: 'bg-emerald-600', COMPLETED: 'bg-emerald-700' };

// Stored as UTC "YYYY-MM-DD HH:MM:SS" (SQLite) or "YYYY-MM-DD HH:MM:SS.ffffff+00" (Postgres).
function parseStamp(value) {
  const iso = String(value || '').trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  const time = Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(time) ? null : new Date(time);
}

function actorLabel(actor) {
  if (!actor) return '';
  if (actor === 'dispatch-worker') return 'Automatic';
  if (actor.startsWith('driver:')) return 'Driver';
  return 'Staff';
}

function describe(event) {
  if (event.event_type === 'STATUS_CHANGED') return STATUS_LABELS[event.new_status] || `Status: ${String(event.new_status || '').replaceAll('_', ' ').toLowerCase()}`;
  return EVENT_LABELS[event.event_type] || String(event.event_type).replaceAll('_', ' ').toLowerCase();
}

function details(event) {
  try {
    const parsed = JSON.parse(event.details || '{}');
    const parts = [];
    if (parsed.previousDriver) parts.push(`replaced ${parsed.previousDriver}`);
    if (parsed.automatic && parsed.score !== undefined) parts.push(`score ${parsed.score}/100 of ${parsed.candidates} eligible`);
    return parts.join(' · ');
  } catch { return ''; }
}

export default function DispatchTimeline({ url }) {
  const [events, setEvents] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch(url, { headers: authHeaders() })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Timeline unavailable'); if (active) setEvents(d.timeline || []); })
      .catch(err => active && setError(err.message));
    return () => { active = false; };
  }, [url]);
  if (error) return <p role="alert" className="text-xs text-rose-700">{error}</p>;
  if (!events) return <p className="text-xs text-stone-500">Loading timeline…</p>;
  if (!events.length) return <p className="text-xs text-stone-500">No driver activity yet.</p>;
  return <ol className="relative ml-2 space-y-3 border-l border-stone-200 pl-4">
    {events.map(event => {
      const at = parseStamp(event.created_at);
      const key = event.event_type === 'STATUS_CHANGED' ? event.new_status : event.event_type;
      const extra = details(event);
      return <li key={event.id} className="relative text-xs">
        <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${TONES[key] || 'bg-amber-500'}`} aria-hidden="true" />
        <p className="font-bold text-stone-900">{describe(event)}</p>
        <p className="text-stone-500">{at ? at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' IST' : event.created_at}{actorLabel(event.actor_id) && ` · ${actorLabel(event.actor_id)}`}{extra && ` · ${extra}`}</p>
        {event.note && <p className="mt-0.5 text-stone-700">{event.note}</p>}
      </li>;
    })}
  </ol>;
}
