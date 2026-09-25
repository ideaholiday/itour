import React, { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

/**
 * Move a booking to another departure (ADR 037). The price stays the same. A
 * traveler who paid IdeaHoliday is told and may decline for a full wallet
 * refund; a walk-in, phone or manual booking simply moves.
 */
export default function RescheduleBookingPanel({ supplierId, booking, onMoved }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(booking.activity_date || "");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [slots, setSlots] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const party = Number(booking.adults || 0) + Number(booking.children || 0);
  const direct = booking.payment_status === "OFFLINE";

  useEffect(() => {
    if (!open || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let active = true;
    setSlots(null);
    fetch(`/api/suppliers/${supplierId}/availability?date=${date}`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const option = (data.products || []).find((row) => row.optionId === booking.product_option_id)
          || (data.products || []).find((row) => row.productId === booking.product_id);
        setSlots(option ? option.departures : []);
      })
      .catch(() => active && setSlots([]));
    return () => { active = false; };
  }, [open, date, supplierId, booking.product_id, booking.product_option_id]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/bookings/${encodeURIComponent(booking.id)}/reschedule`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ date, time: time || null, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The booking couldn't be moved");
      setMessage(data.travelerMayDecline
        ? `Moved to ${data.to.date}${data.to.time ? ` ${data.to.time}` : ""}. The traveler has been told and can decline for a full refund to their wallet.`
        : `Moved to ${data.to.date}${data.to.time ? ` ${data.to.time}` : ""}. Let the guest know.`);
      setOpen(false);
      onMoved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onSeatInventory = slots && slots.length > 0;

  return (
    <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-stone-700"><CalendarClock className="h-3.5 w-3.5" /> Move to another departure</span>
        {!open && <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-stone-300 px-3 py-1 text-xs font-bold text-stone-700 hover:bg-stone-50">Change date or time</button>}
      </div>
      {message && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{message}</p>}
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-3 text-xs">
          <p className="text-stone-600">The price stays the same.{direct ? " Tell the guest yourself." : " The traveler is told and may decline it for a full refund to their wallet."}</p>
          <div className="flex flex-wrap gap-2">
            <input type="date" required aria-label="New date" value={date} onChange={(event) => { setDate(event.target.value); setTime(""); }} className="rounded-lg border border-stone-300 p-2" />
            {onSeatInventory ? (
              <select required aria-label="New time" value={time} onChange={(event) => setTime(event.target.value)} className="rounded-lg border border-stone-300 p-2">
                <option value="" disabled>Choose a time</option>
                {slots.map((slot) => {
                  const current = date === booking.activity_date && slot.localTime === booking.pickup_time;
                  const fits = slot.status === "AVAILABLE" && Number(slot.vacancies) >= party;
                  return <option key={slot.localTime} value={slot.localTime} disabled={current || !fits}>{slot.localTime} · {current ? "current" : fits ? `${slot.vacancies} free` : "not enough seats"}</option>;
                })}
              </select>
            ) : (
              <input type="time" aria-label="New time" value={time} onChange={(event) => setTime(event.target.value)} className="rounded-lg border border-stone-300 p-2" />
            )}
          </div>
          <input required minLength={3} maxLength={500} placeholder="Reason the traveler will see, e.g. boat engine repair" value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-lg border border-stone-300 p-2" />
          {error && <p role="alert" className="font-semibold text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-60">{busy ? "Moving…" : "Move booking"}</button>
            <button type="button" onClick={() => { setOpen(false); setError(""); }} className="rounded-lg border border-stone-300 px-3 py-2 font-bold text-stone-700">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
