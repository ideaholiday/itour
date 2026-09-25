import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarX, Camera, CircleCheck, Download, RefreshCw, ScanLine, Undo2, UserX, X } from "lucide-react";
import { api } from "../../lib/api.js";

const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const canScan = typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Day-of-operations for a supplier (docs/SUPPLIER_OPERATIONS.md): check travelers in by
 * scanning the voucher QR or typing the reference, the guest list for one departure with
 * attendance, and cancelling a whole departure with a preview of the refunds.
 */
export default function SupplierDeparturesPanel({ supplierId, products = [], onChanged }) {
  // --- Check-in -------------------------------------------------------------
  const [code, setCode] = useState("");
  const [checkIn, setCheckIn] = useState(null);
  const [checkInError, setCheckInError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // --- Guest list -----------------------------------------------------------
  const [productId, setProductId] = useState("");
  const [date, setDate] = useState(indiaToday());
  const [time, setTime] = useState("");
  const [manifest, setManifest] = useState(null);
  const [listError, setListError] = useState("");
  const [busyId, setBusyId] = useState("");

  // --- Cancel a departure ---------------------------------------------------
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null);
  const [cancelMessage, setCancelMessage] = useState("");
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    if (!productId && products.length) setProductId(products[0].id);
  }, [products, productId]);

  const loadManifest = useCallback(() => {
    if (!productId || !date) return;
    setListError("");
    api.getSupplierManifest(supplierId, { productId, date, time })
      .then((res) => setManifest(res.manifest))
      .catch((err) => { setManifest(null); setListError(err.message || "The guest list couldn't be loaded"); });
  }, [supplierId, productId, date, time]);

  useEffect(() => { loadManifest(); }, [loadManifest]);
  useEffect(() => { setPreview(null); setCancelMessage(""); setCancelError(""); }, [productId, date, time]);

  const submitCheckIn = async (value, allowOtherDate = false) => {
    const typed = String(value || "").trim();
    if (!typed) return;
    setCheckIn(null);
    setCheckInError(null);
    try {
      const res = await api.supplierCheckIn(supplierId, { code: typed, allowOtherDate });
      setCheckIn(res);
      setCode("");
      loadManifest();
    } catch (err) {
      setCheckInError({ message: err.message || "Check-in failed", code: err.code, value: typed });
    }
  };

  const stopScan = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopScan, [stopScan]);

  const startScan = async () => {
    setCheckInError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
    } catch {
      setCheckInError({ message: "The camera couldn't be opened. Allow camera access, or type the booking reference." });
    }
  };

  useEffect(() => {
    if (!scanning || !videoRef.current || !streamRef.current) return undefined;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    let stopped = false;
    const timer = setInterval(async () => {
      if (stopped || video.readyState < 2) return;
      try {
        const [found] = await detector.detect(video);
        if (found?.rawValue && !stopped) {
          stopped = true;
          stopScan();
          submitCheckIn(found.rawValue);
        }
      } catch { /* the next frame may decode */ }
    }, 400);
    return () => { stopped = true; clearInterval(timer); };
    // submitCheckIn reads fresh state on each call; restarting the loop on every render would drop frames.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, stopScan]);

  const mark = async (bookingId, status) => {
    setBusyId(bookingId);
    setListError("");
    try {
      await api.setSupplierAttendance(supplierId, bookingId, status);
      loadManifest();
    } catch (err) {
      setListError(err.message || "Attendance couldn't be saved");
    } finally {
      setBusyId("");
    }
  };

  const downloadCsv = async () => {
    try {
      const blob = await api.downloadSupplierManifestCsv(supplierId, { productId, date, time });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `guest-list-${date}${time ? `-${time.replace(":", "")}` : ""}.csv`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setListError(err.message || "The guest list couldn't be downloaded");
    }
  };

  const runCancel = async (dryRun) => {
    setCancelError("");
    setCancelMessage("");
    if (reason.trim().length < 3) { setCancelError("Tell travelers why the departure is cancelled."); return; }
    try {
      const res = await api.cancelSupplierDeparture(supplierId, productId, { date, time: time || null, reason: reason.trim(), dryRun });
      if (dryRun) { setPreview(res); return; }
      setPreview(null);
      setReason("");
      setCancelOpen(false);
      setCancelMessage(`Departure cancelled. ${res.cancelled.length} booking(s) cancelled and travelers notified${res.walletRefundInr ? `; ₹${res.walletRefundInr.toLocaleString("en-IN")} refunded to their wallets` : ""}.`);
      loadManifest();
      onChanged?.();
    } catch (err) {
      setPreview(null);
      setCancelError(err.message || "The departure couldn't be cancelled");
    }
  };

  const attendanceBadge = (status) => status === "CHECKED_IN"
    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Checked in</span>
    : status === "NO_SHOW"
      ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">No-show</span>
      : <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-500">Expected</span>;

  const selectedTitle = products.find((product) => product.id === productId)?.title || "";

  return (
    <section className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Departures</span>
          <h2 className="mt-1 font-serif text-xl font-bold text-stone-900">Check-in and guest lists</h2>
          <p className="mt-1 text-xs text-stone-600">Scan a traveler's voucher QR at the meeting point, see who is booked on each departure, or cancel a departure.</p>
        </div>
        <button type="button" onClick={loadManifest} className="rounded-xl border border-stone-300 p-2.5 text-stone-500 hover:text-stone-900" aria-label="Refresh guest list">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Check-in */}
      <div className="space-y-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
        <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); submitCheckIn(code); }}>
          <label htmlFor="checkin-code" className="sr-only">Booking reference</label>
          <input id="checkin-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Booking reference, e.g. IH-AB12CD" autoComplete="off" className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white p-2.5 text-sm uppercase" />
          <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"><CircleCheck className="h-4 w-4" /> Check in</button>
          {canScan && !scanning && <button type="button" onClick={startScan} className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-stone-800 hover:border-amber-500"><Camera className="h-4 w-4" /> Scan QR</button>}
        </form>
        {scanning && (
          <div className="relative max-w-sm overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" />
            <ScanLine className="pointer-events-none absolute inset-0 m-auto h-24 w-24 text-white/70" />
            <button type="button" onClick={stopScan} className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-stone-800" aria-label="Stop scanning"><X className="h-4 w-4" /></button>
          </div>
        )}
        {checkIn && (
          <div role="status" className={`rounded-xl border p-3 text-sm ${checkIn.alreadyCheckedIn ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
            <strong>{checkIn.alreadyCheckedIn ? "Already checked in" : "Checked in"}: {checkIn.booking.travelerName}</strong>
            <span className="block text-xs">
              {checkIn.booking.ref} · {checkIn.booking.adults + checkIn.booking.children} guest(s) · {checkIn.booking.productTitle || ""}{checkIn.booking.pickupTime ? ` · ${checkIn.booking.pickupTime}` : ""}
              {checkIn.alreadyCheckedIn && checkIn.booking.checkedInAt ? ` · first scanned ${new Date(checkIn.booking.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
          </div>
        )}
        {checkInError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {checkInError.message}
            {checkInError.code === "WRONG_DATE" && <button type="button" onClick={() => submitCheckIn(checkInError.value, true)} className="rounded-lg border border-rose-400 bg-white px-2.5 py-1 text-xs font-bold text-rose-700">Check in anyway</button>}
          </div>
        )}
      </div>

      {/* Guest list */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col text-xs font-bold text-stone-600">Listing
          <select value={productId} onChange={(event) => { setProductId(event.target.value); setTime(""); }} className="mt-1 rounded-xl border border-stone-300 bg-white p-2.5 text-sm font-normal text-stone-900">
            {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs font-bold text-stone-600">Date
          <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setTime(""); }} className="mt-1 rounded-xl border border-stone-300 bg-white p-2.5 text-sm font-normal text-stone-900" />
        </label>
        <label className="flex flex-col text-xs font-bold text-stone-600">Departure
          <select value={time} onChange={(event) => setTime(event.target.value)} className="mt-1 rounded-xl border border-stone-300 bg-white p-2.5 text-sm font-normal text-stone-900">
            <option value="">All times</option>
            {(manifest?.departureTimes || []).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
            {time && !(manifest?.departureTimes || []).includes(time) && <option value={time}>{time}</option>}
          </select>
        </label>
        <button type="button" onClick={downloadCsv} disabled={!manifest?.bookings.length} className="flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2.5 text-xs font-bold text-stone-800 hover:border-amber-500 disabled:opacity-40"><Download className="h-3.5 w-3.5" /> Download CSV</button>
      </div>

      {listError && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" /> {listError}</div>}

      {manifest && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[["Bookings", manifest.totals.bookings], ["Guests", manifest.totals.guests], ["Checked in", manifest.totals.checkedIn], ["No-shows", manifest.totals.noShow]].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3"><strong className="block text-xl text-stone-900">{value}</strong><span className="text-[10px] font-bold uppercase text-stone-500">{label}</span></div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead className="border-b border-stone-200 text-[10px] uppercase text-stone-500">
                <tr><th className="py-2 pr-3">Traveler</th><th className="py-2 pr-3">Guests</th><th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Pickup / notes</th><th className="py-2 pr-3">Attendance</th><th className="py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {manifest.bookings.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="py-2 pr-3"><strong className="block text-stone-900">{row.travelerName}</strong><span className="text-stone-500">{row.ref}{row.travelerPhone ? ` · ${row.travelerPhone}` : ""}</span></td>
                    <td className="py-2 pr-3">{row.adults} adult{row.adults === 1 ? "" : "s"}{row.children ? `, ${row.children} child${row.children === 1 ? "" : "ren"}` : ""}</td>
                    <td className="py-2 pr-3">{row.pickupTime || "—"}</td>
                    <td className="py-2 pr-3 text-stone-600">{row.pickupLocation}{row.variantName ? <span className="block">{row.variantName}</span> : null}{row.specialRequests ? <span className="block italic">{row.specialRequests}</span> : null}</td>
                    <td className="py-2 pr-3">{attendanceBadge(row.attendanceStatus)}{row.balanceDueInr > 0 ? <span className="mt-1 block text-[11px] font-bold text-amber-700">Collect ₹{row.balanceDueInr.toLocaleString("en-IN")}</span> : null}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        {row.attendanceStatus !== "CHECKED_IN" && <button type="button" disabled={busyId === row.id} onClick={() => mark(row.id, "CHECKED_IN")} className="rounded-lg border border-emerald-300 p-1.5 text-emerald-700 hover:bg-emerald-50" aria-label={`Check in ${row.travelerName}`} title="Check in"><CircleCheck className="h-3.5 w-3.5" /></button>}
                        {!row.attendanceStatus && date <= indiaToday() && <button type="button" disabled={busyId === row.id} onClick={() => mark(row.id, "NO_SHOW")} className="rounded-lg border border-rose-300 p-1.5 text-rose-600 hover:bg-rose-50" aria-label={`Mark ${row.travelerName} as no-show`} title="No-show"><UserX className="h-3.5 w-3.5" /></button>}
                        {row.attendanceStatus && <button type="button" disabled={busyId === row.id} onClick={() => mark(row.id, "NONE")} className="rounded-lg border border-stone-300 p-1.5 text-stone-600 hover:bg-stone-50" aria-label={`Undo attendance for ${row.travelerName}`} title="Undo"><Undo2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!manifest.bookings.length && <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">No confirmed bookings on this departure.</p>}
        </div>
      )}

      {/* Cancel a departure */}
      <div className="rounded-2xl border border-rose-200 p-4">
        {cancelMessage && <p role="status" className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{cancelMessage}</p>}
        {!cancelOpen ? (
          <button type="button" onClick={() => setCancelOpen(true)} disabled={!productId || date < indiaToday()} className="flex items-center gap-1.5 text-sm font-bold text-rose-700 disabled:opacity-40"><CalendarX className="h-4 w-4" /> Cancel this departure (weather, too few travelers…)</button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-stone-700">
              Cancels every booking on <strong>{selectedTitle}</strong> on <strong>{date}</strong>{time ? <> at <strong>{time}</strong></> : <> (all times)</>} and closes it for sale.
              Paid travelers get a full refund to their wallet and are told by email and WhatsApp.
            </p>
            <input value={reason} onChange={(event) => { setReason(event.target.value); setPreview(null); }} maxLength={280} placeholder="Reason travelers will see, e.g. Cyclone warning, sea closed" className="w-full rounded-xl border border-stone-300 bg-white p-2.5 text-sm" />
            {cancelError && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" /> {cancelError}</div>}
            {preview && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                This cancels <strong>{preview.bookings}</strong> booking(s) for <strong>{preview.guests}</strong> guest(s)
                {preview.paidBookings ? <> and refunds <strong>₹{preview.walletRefundInr.toLocaleString("en-IN")}</strong> to {preview.paidBookings} traveler wallet(s)</> : null}.
                {preview.closesOptions ? " The departure will be closed for new bookings." : ""}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {!preview
                ? <button type="button" onClick={() => runCancel(true)} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white">Preview</button>
                : <button type="button" onClick={() => runCancel(false)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">Cancel {preview.bookings} booking(s)</button>}
              <button type="button" onClick={() => { setCancelOpen(false); setPreview(null); setCancelError(""); }} className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">Keep departure</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
