import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Phone,
  User,
  Car,
  Clock,
  MapPin,
  CheckCheck,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Copy,
  Check
} from "lucide-react";
import { authHeaders } from "../../lib/api.js";

export default function WhatsAppNotificationView() {
  const [logs, setLogs] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dispatchForm, setDispatchForm] = useState({
    bookingRef: "IH-9A82B1",
    customerName: "Amit Kumar",
    customerPhone: "+919876500001",
    driverName: "Ramesh Kumar Yadav",
    driverPhone: "+919839011223",
    vehicleModel: "Swift Dzire VXI",
    vehicleNumber: "UP-32-DN-4821",
    pickupLocation: "Chaudhary Charan Singh Lucknow Airport (LKO) T1",
    pickupTime: "09:30 AM",
    pickupLat: 26.7606,
    pickupLng: 80.8893
  });
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [copied, setCopied] = useState(false);
  const [providers, setProviders] = useState(null);
  const [resendEvent, setResendEvent] = useState("DOCUMENTS");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/notifications", { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setLogs(data.whatsappLogs);
        setDeliveries(data.deliveries || []);
      }
      const healthRes = await fetch("/api/ops/notification-health", { headers: authHeaders() });
      const health = await healthRes.json();
      if (health.success) setProviders(health.providers);
    } catch (err) {
      console.error("Fetch WhatsApp logs error:", err);
    } finally {
      setLoading(false);
    }
  };

  const resendGuestUpdate = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/ops/notifications/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ bookingRef: dispatchForm.bookingRef, eventType: resendEvent })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Guest update could not be sent");
      setMessage({ type: "success", text: `${resendEvent.replaceAll("_", " ")} sent through ${data.attempted} enabled channel${data.attempted === 1 ? "" : "s"}.` });
      fetchLogs();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleDispatchWhatsApp = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/ops/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(dispatchForm)
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: "success",
          text: `💬 WhatsApp Voucher dispatched via ${data.gateway} to ${data.recipientPhone}!`
        });
        fetchLogs();
      } else {
        alert(data.error || "Failed to dispatch WhatsApp voucher");
      }
    } catch (err) {
      alert("Network error sending WhatsApp voucher");
    } finally {
      setSending(false);
    }
  };

  const mapsLink = dispatchForm.pickupLat && dispatchForm.pickupLng
    ? `https://maps.google.com/?q=${dispatchForm.pickupLat},${dispatchForm.pickupLng}`
    : `https://maps.google.com/?q=${encodeURIComponent(dispatchForm.pickupLocation)}`;

  const previewMessage = `🚗 *Idea Holiday Confirmed Booking Voucher*

Hello *${dispatchForm.customerName || "Valued Traveler"}*,

Your trip ref *${dispatchForm.bookingRef}* is confirmed! Here are your chauffeur and vehicle details:

👤 *Driver Name:* ${dispatchForm.driverName}
📞 *Driver Phone:* ${dispatchForm.driverPhone}
🚘 *Vehicle:* ${dispatchForm.vehicleModel} (${dispatchForm.vehicleNumber})
⏰ *Pickup Time:* ${dispatchForm.pickupTime}
📍 *Pickup Location:* ${dispatchForm.pickupLocation}
🗺️ *Google Maps Link:* ${mapsLink}

*Pickup verification:* Traveler holds a private 6-digit code. Ask for it only after meeting.`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(previewMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* View Title Header */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-100 text-amber-900 text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-amber-300 font-bold">
              AUTOMATED VOUCHERS
            </span>
            <span className="text-stone-500 text-xs font-mono">/ops/notifications</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-stone-900 flex items-center gap-3">
            <MessageSquare className="w-7 h-7 text-emerald-600" />
            Guest Communications & Delivery Control
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Send approved email/WhatsApp booking updates and monitor every attempted delivery from one audit trail.
          </p>
        </div>
        <div className="flex gap-2 text-[10px] font-bold uppercase"><span className={`rounded-full border px-3 py-1.5 ${providers?.whatsapp?.enabled && providers?.whatsapp?.configured ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-amber-300 bg-amber-100 text-amber-900"}`}>WhatsApp {providers?.whatsapp?.enabled && providers?.whatsapp?.configured ? "ready" : "setup required"}</span><span className={`rounded-full border px-3 py-1.5 ${providers?.email?.enabled && providers?.email?.configured ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-amber-300 bg-amber-100 text-amber-900"}`}>SES {providers?.email?.enabled && providers?.email?.configured ? "ready" : "setup required"}</span></div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between shadow-sm ${message.type === "error" ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-emerald-50 border-emerald-300 text-emerald-900"}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="underline hover:text-stone-900">Dismiss</button>
        </div>
      )}

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-bold uppercase text-stone-500">Saved booking reference</label>
            <input value={dispatchForm.bookingRef} onChange={(e) => setDispatchForm({ ...dispatchForm, bookingRef: e.target.value })} className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-xs font-bold text-amber-900 focus:bg-white focus:border-amber-500 outline-none" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-bold uppercase text-stone-500">Approved guest update</label>
            <select value={resendEvent} onChange={(e) => setResendEvent(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-xs text-stone-900 focus:bg-white focus:border-amber-500 outline-none">
              <option value="DOCUMENTS">Voucher and invoice</option>
              <option value="BOOKING_CONFIRMED">Booking confirmation</option>
              <option value="DRIVER_ASSIGNED">Driver details</option>
            </select>
          </div>
          <button type="button" disabled={sending} onClick={resendGuestUpdate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-3 text-xs font-black text-stone-950 disabled:opacity-50 shadow-sm">
            <Send className="h-4 w-4" /> Send enabled channels
          </button>
        </div>
        <p className="mt-3 text-[10px] text-stone-500">Recipient details come from the saved booking. Guest channel preferences are respected; arbitrary contact details cannot be substituted here.</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif font-bold text-stone-900">Unified email and WhatsApp delivery audit</h3>
          <span className="text-[10px] text-stone-500">{deliveries.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 text-[10px] uppercase text-stone-500 bg-stone-50">
              <tr>
                <th className="p-3">Booking</th>
                <th className="p-3">Event</th>
                <th className="p-3">Channel</th>
                <th className="p-3">Status</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {deliveries.slice(0, 50).map((item) => (
                <tr key={item.id} className="text-stone-700 hover:bg-stone-50">
                  <td className="p-3 font-bold text-amber-800">{item.booking_ref || "—"}</td>
                  <td className="p-3">{String(item.event_type || "").replaceAll("_", " ")}</td>
                  <td className="p-3">{item.channel}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${
                      item.status === "SENT"
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        : item.status === "FAILED"
                        ? "bg-rose-100 text-rose-900 border border-rose-300"
                        : "bg-amber-100 text-amber-900 border border-amber-300"
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3">{item.attempt_count}</td>
                  <td className="p-3 text-stone-500">{item.sent_at || item.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!deliveries.length && <p className="p-6 text-center text-xs text-stone-500">No delivery attempts recorded yet.</p>}
        </div>
      </div>

      {/* DISPATCH FORM & CHAT PREVIEW GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Inputs (7 Cols) */}
        <form onSubmit={handleDispatchWhatsApp} className="lg:col-span-7 bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="border-b border-stone-200 pb-3">
            <h2 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600" /> WhatsApp Template Variable Console
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Fill or edit variables below to trigger instant automated voucher dispatch to the traveler.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            <div>
              <label className="text-stone-600 font-bold block mb-1">Booking Reference</label>
              <input
                type="text"
                value={dispatchForm.bookingRef}
                onChange={(e) => setDispatchForm({ ...dispatchForm, bookingRef: e.target.value })}
                className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-amber-900 font-bold focus:bg-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="text-stone-600 font-bold block mb-1">Customer Name</label>
              <input
                type="text"
                value={dispatchForm.customerName}
                onChange={(e) => setDispatchForm({ ...dispatchForm, customerName: e.target.value })}
                className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:bg-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="text-stone-600 font-bold block mb-1">Customer Phone Number</label>
              <input
                type="text"
                value={dispatchForm.customerPhone}
                onChange={(e) => setDispatchForm({ ...dispatchForm, customerPhone: e.target.value })}
                className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:bg-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="text-stone-600 font-bold block mb-1">Driver Name</label>
              <input
                type="text"
                value={dispatchForm.driverName}
                onChange={(e) => setDispatchForm({ ...dispatchForm, driverName: e.target.value })}
                className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:bg-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="text-stone-600 font-bold block mb-1">Driver Phone Number</label>
              <input
                type="text"
                value={dispatchForm.driverPhone}
                onChange={(e) => setDispatchForm({ ...dispatchForm, driverPhone: e.target.value })}
                className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:bg-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="text-stone-600 font-bold block mb-1">Vehicle Model & License Number</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={dispatchForm.vehicleModel}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, vehicleModel: e.target.value })}
                  className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:bg-white focus:border-amber-500 outline-none"
                />
                <input
                  type="text"
                  value={dispatchForm.vehicleNumber}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, vehicleNumber: e.target.value })}
                  className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 uppercase focus:bg-white focus:border-amber-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            <div>
              <label className="text-stone-600 font-bold block mb-1">Pickup Time</label>
              <input
                type="text"
                value={dispatchForm.pickupTime}
                onChange={(e) => setDispatchForm({ ...dispatchForm, pickupTime: e.target.value })}
                className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:bg-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="text-stone-600 font-bold block mb-1">Pickup Location Name</label>
              <input
                type="text"
                value={dispatchForm.pickupLocation}
                onChange={(e) => setDispatchForm({ ...dispatchForm, pickupLocation: e.target.value })}
                className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:bg-white focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs font-mono disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Dispatch via Meta WhatsApp Cloud API
          </button>
        </form>

        {/* WhatsApp Chat Bubble Preview (5 Cols) */}
        <div className="lg:col-span-5 bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <span className="text-xs font-mono font-bold text-emerald-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" /> Live WhatsApp Chat Preview
              </span>

              <button
                onClick={copyToClipboard}
                className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 rounded-lg text-[10px] font-mono flex items-center gap-1 font-bold"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy Payload"}
              </button>
            </div>

            {/* WhatsApp Phone Mockup Bubble */}
            <div className="bg-[#EFEAE2] border border-stone-300 rounded-2xl p-4 space-y-3 font-sans shadow-inner">
              <div className="bg-white text-stone-900 text-xs p-3.5 rounded-2xl rounded-tl-none space-y-2 border border-emerald-200 shadow-sm">
                <pre className="whitespace-pre-wrap font-sans text-xs text-stone-800 leading-relaxed">
                  {previewMessage}
                </pre>
                <div className="flex justify-end items-center gap-1 text-[9px] text-stone-500 font-mono">
                  <span>19:49 PM</span>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-3 text-[10px] font-mono text-stone-600 space-y-1">
            <div className="text-emerald-800 font-bold">API Gateway Details:</div>
            <div>Provider: Meta WhatsApp Cloud API</div>
            <div>Templates: configured through environment variables</div>
          </div>
        </div>
      </div>

      {/* DISPATCH LOG HISTORY TABLE */}
      <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm space-y-4 p-6">
        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
          <h3 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" /> WhatsApp Dispatch Audit Logs
          </h3>
          <button
            onClick={fetchLogs}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 text-xs font-mono flex items-center gap-1.5 font-bold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-600" : ""}`} /> Refresh Logs
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 uppercase">
                <th className="py-3 px-4">Log ID & Date</th>
                <th className="py-3 px-4">Booking Ref</th>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Chauffeur & Vehicle</th>
                <th className="py-3 px-4">Navigation Link</th>
                <th className="py-3 px-4">Gateway Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-stone-500">Loading WhatsApp dispatch logs...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-stone-500">No WhatsApp vouchers sent yet. Trigger dispatch above.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-50">
                    <td className="py-3 px-4 text-stone-500">{log.id} &bull; {log.sent_at}</td>
                    <td className="py-3 px-4 font-bold text-amber-800">{log.booking_ref}</td>
                    <td className="py-3 px-4 font-bold text-stone-900">{log.customer_name} ({log.recipient_phone})</td>
                    <td className="py-3 px-4 text-stone-700">{log.driver_name} ({log.vehicle_number})</td>
                    <td className="py-3 px-4">
                      <a
                        href={log.maps_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-800 hover:underline flex items-center gap-1 text-[10px] font-bold"
                      >
                        <span>Open Maps</span> <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`border px-2 py-0.5 rounded font-bold text-[10px] ${["FAILED", "SKIPPED"].includes(log.gateway_status) ? "border-rose-300 bg-rose-100 text-rose-900" : "border-emerald-300 bg-emerald-100 text-emerald-900"}`}>
                        {log.gateway_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
