import React, { useState, useEffect } from "react";
import { authHeaders } from "../../lib/api.js";
import {
  Activity,
  AlertTriangle,
  Radio,
  Clock,
  Car,
  UserCheck,
  Zap,
  MessageSquare,
  MapPin,
  ChevronRight,
  Phone,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  Plus
} from "lucide-react";
import EmergencyReallocationModal from "../../components/ops/EmergencyReallocationModal.jsx";

export default function LiveTripBoardView() {
  const [boardData, setBoardData] = useState({
    unassigned: [],
    assigned: [],
    enRoute: [],
    started: [],
    completed: []
  });
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reallocateBooking, setReallocateBooking] = useState(null);
  const [fallbackModalBooking, setFallbackModalBooking] = useState(null);
  const [message, setMessage] = useState(null);

  // Fallback Dispatch Modal State
  const [fallbackDriverName, setFallbackDriverName] = useState("Vikram Singh (On-Call Ground Ops)");
  const [fallbackDriverPhone, setFallbackDriverPhone] = useState("+919811009988");
  const [fallbackVehicleModel, setFallbackVehicleModel] = useState("Toyota Innova Crysta");
  const [fallbackVehicleNumber, setFallbackVehicleNumber] = useState("UP-32-T-9999");
  const [dispatchLoading, setDispatchLoading] = useState(false);

  const fetchLiveBoard = async () => {
    try {
      const res = await fetch("/api/ops/live-trips", { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setBoardData(data.liveBoard);
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error("Fetch Live Board Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveBoard();
    // Realtime subscriptions / 5s auto-polling loop
    const interval = setInterval(fetchLiveBoard, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleExecuteFallback = async () => {
    if (!fallbackModalBooking) return;
    setDispatchLoading(true);
    try {
      const res = await fetch("/api/ops/fallback-override", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          bookingId: fallbackModalBooking.id || fallbackModalBooking.ref,
          fallbackDriverName,
          fallbackDriverPhone,
          fallbackVehicleModel,
          fallbackVehicleNumber,
          notes: `Emergency fallback driver ${fallbackDriverName} dispatched for booking ${fallbackModalBooking.ref}`
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message });
        setFallbackModalBooking(null);
        fetchLiveBoard();
      } else {
        alert(data.error || "Failed to dispatch fallback");
      }
    } catch (err) {
      alert("Network error executing fallback dispatch");
    } finally {
      setDispatchLoading(false);
    }
  };

  const handleSendWhatsApp = async (booking) => {
    try {
      const res = await fetch("/api/ops/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ bookingId: booking.id || booking.ref })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: `💬 WhatsApp voucher dispatched to ${data.recipientPhone}!` });
      } else {
        alert(data.error || "Failed to send WhatsApp voucher");
      }
    } catch (err) {
      alert("Network error sending WhatsApp voucher");
    }
  };

  const columns = [
    {
      id: "unassigned",
      title: "1. Unassigned Driver",
      count: boardData.unassigned.length,
      color: "border-amber-300 bg-amber-50/50",
      headerColor: "text-amber-900 bg-amber-100 border-amber-300",
      items: boardData.unassigned
    },
    {
      id: "assigned",
      title: "2. Driver Assigned",
      count: boardData.assigned.length,
      color: "border-stone-200 bg-stone-50/50",
      headerColor: "text-stone-900 bg-stone-100 border-stone-300",
      items: boardData.assigned
    },
    {
      id: "enRoute",
      title: "3. En Route to Pickup",
      count: boardData.enRoute.length,
      color: "border-amber-300 bg-amber-50/30",
      headerColor: "text-amber-900 bg-amber-100 border-amber-300",
      items: boardData.enRoute
    },
    {
      id: "started",
      title: "4. Trip Started",
      count: boardData.started.length,
      color: "border-emerald-300 bg-emerald-50/30",
      headerColor: "text-emerald-900 bg-emerald-100 border-emerald-300",
      items: boardData.started
    },
    {
      id: "completed",
      title: "5. Completed",
      count: boardData.completed.length,
      color: "border-emerald-300 bg-emerald-50/50",
      headerColor: "text-emerald-900 bg-emerald-100 border-emerald-300",
      items: boardData.completed
    }
  ];

  return (
    <div className="space-y-6">
      {/* View Title Header */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-100 text-amber-900 text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-amber-300 font-bold">
              LIVE MONITORING
            </span>
            <span className="text-stone-500 text-xs font-mono">/ops/live</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-stone-900 flex items-center gap-3">
            <Activity className="w-7 h-7 text-amber-600 animate-pulse" />
            Live 24-Hour Trip Fulfillment Monitoring Board
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Realtime Kanban dispatch board tracking ground fulfillment stages across India. SLA breach alerts highlight imminent unassigned trips in red for immediate fallback override.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300 px-4 py-2 rounded-2xl text-xs font-mono text-emerald-900 font-bold">
          <Radio className="w-4 h-4 text-emerald-600 animate-ping" />
          <span>REALTIME FEED ACTIVE</span>
        </div>
      </div>

      {message && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-mono flex items-center justify-between shadow-sm">
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="underline hover:text-stone-900">Dismiss</button>
        </div>
      )}

      {/* 5-COLUMN KANBAN BOARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {columns.map((col) => (
          <div
            key={col.id}
            className={`bg-white border ${col.color} rounded-3xl p-4 flex flex-col h-[78vh] shadow-sm`}
          >
            {/* Column Header */}
            <div className={`p-3 rounded-2xl border ${col.headerColor} flex items-center justify-between mb-4 font-mono text-xs font-bold`}>
              <span>{col.title}</span>
              <span className="px-2 py-0.5 rounded-full bg-white text-stone-900 text-[10px] shadow-sm border border-stone-200">
                {col.count}
              </span>
            </div>

            {/* Column Cards Container */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loading ? (
                <div className="text-center py-8 text-xs font-mono text-stone-400">Loading trips...</div>
              ) : col.items.length === 0 ? (
                <div className="text-center py-12 text-xs font-mono text-stone-400 border border-dashed border-stone-300 rounded-2xl p-4">
                  No trips in this stage
                </div>
              ) : (
                col.items.map((trip) => (
                  <div
                    key={trip.id}
                    className={`bg-[#FAF9F6] border rounded-2xl p-4 space-y-3 shadow-sm transition-all ${
                      trip.slaAlert
                        ? "border-rose-400 bg-rose-50/50 shadow-rose-200 animate-pulse"
                        : "border-stone-200 hover:border-amber-400 hover:bg-white"
                    }`}
                  >
                    {/* SLA ALERT BADGE */}
                    {trip.slaAlert && (
                      <div className="bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-mono font-bold px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>SLA BREACH: Trip in {trip.minutesToPickup}m - No Driver!</span>
                      </div>
                    )}

                    {/* Header Ref & Time */}
                    <div className="flex items-center justify-between font-mono text-xs">
                      <span className="text-amber-800 font-bold">{trip.ref || trip.id}</span>
                      <span className="text-stone-500 text-[10px]">{trip.pickup_time || "09:00 AM"}</span>
                    </div>

                    {/* Product & Traveler */}
                    <div className="space-y-1">
                      <div className="font-bold text-xs text-stone-900 font-sans line-clamp-1">{trip.product_title || trip.product_type}</div>
                      <div className="text-[10px] text-stone-500 font-mono">
                        👤 {trip.traveler_name} &bull; {trip.traveler_phone}
                      </div>
                    </div>

                    {/* Location & Navigation */}
                    <div className="bg-white border border-stone-200 p-2.5 rounded-xl text-[10px] font-mono text-stone-700 space-y-1.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                        <span className="truncate font-semibold text-stone-900">{trip.pickup_location || "Airport Pickup"}</span>
                      </div>
                      {trip.drop_location && (
                        <div className="flex items-center gap-1.5 truncate text-emerald-800 font-semibold border-t border-stone-100 pt-1">
                          <span className="text-[11px]">🏨</span>
                          <span className="truncate">Drop: {trip.drop_location}</span>
                        </div>
                      )}
                      {trip.flight_number && (
                        <div className="text-[9px] text-stone-500 font-bold">
                          ✈️ Flight/Train: <span className="text-stone-800">{trip.flight_number}</span>
                        </div>
                      )}
                      <a
                        href={trip.mapsLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-800 hover:underline flex items-center gap-1 mt-1 text-[9px] font-bold"
                      >
                        <span>Open Google Maps Navigation</span> &rarr;
                      </a>
                    </div>

                    {/* Driver Status Info */}
                    <div className="text-[10px] font-mono">
                      {trip.hasDriver ? (
                        <div className="text-emerald-700 font-bold flex items-center gap-1">
                          <Car className="w-3 h-3 text-emerald-600" /> {trip.driver_name} ({trip.vehicle_number || "Cab"})
                        </div>
                      ) : (
                        <div className="text-rose-700 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" /> Supplier Driver Missing
                        </div>
                      )}
                    </div>

                    {/* Action Toolbar on Card */}
                    <div className="pt-2 border-t border-stone-200 space-y-1.5">
                      {!trip.hasDriver && (
                        <button
                          onClick={() => setFallbackModalBooking(trip)}
                          className="w-full bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-bold py-1.5 px-3 rounded-xl text-[10px] font-mono transition-all flex items-center justify-center gap-1"
                        >
                          <Car className="w-3 h-3 text-rose-600" /> Dispatch Backup Driver
                        </button>
                      )}

                      <button
                        onClick={() => setReallocateBooking(trip)}
                        className="w-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold py-1.5 px-3 rounded-xl text-[10px] font-mono transition-all flex items-center justify-center gap-1"
                      >
                        <Zap className="w-3 h-3 text-amber-700" /> Trigger 15km Emergency Ping
                      </button>

                      <button
                        onClick={() => handleSendWhatsApp(trip)}
                        className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-bold py-1.5 px-3 rounded-xl text-[10px] font-mono transition-all flex items-center justify-center gap-1"
                      >
                        <MessageSquare className="w-3 h-3 text-emerald-700" /> Send WhatsApp Voucher
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* EMERGENCY RE-ALLOCATION MODAL */}
      {reallocateBooking && (
        <EmergencyReallocationModal
          booking={reallocateBooking}
          onClose={() => setReallocateBooking(null)}
          onSuccess={(res) => {
            setMessage({ type: "success", text: res.message });
            fetchLiveBoard();
          }}
        />
      )}

      {/* FALLBACK DISPATCH MODAL */}
      {fallbackModalBooking && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2">
                <Car className="w-5 h-5 text-rose-600" /> Ground Ops Fallback Dispatcher
              </h3>
              <button
                onClick={() => setFallbackModalBooking(null)}
                className="p-1.5 bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200 rounded-xl"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-stone-700 block mb-1 font-bold">Backup Driver Name</label>
                <input
                  type="text"
                  value={fallbackDriverName}
                  onChange={(e) => setFallbackDriverName(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-stone-700 block mb-1 font-bold">Backup Driver Phone</label>
                <input
                  type="text"
                  value={fallbackDriverPhone}
                  onChange={(e) => setFallbackDriverPhone(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-stone-700 block mb-1 font-bold">Backup Vehicle Model & Number</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={fallbackVehicleModel}
                    onChange={(e) => setFallbackVehicleModel(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                  <input
                    type="text"
                    value={fallbackVehicleNumber}
                    onChange={(e) => setFallbackVehicleNumber(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 uppercase focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-3 border-t border-stone-200">
              <button
                onClick={() => setFallbackModalBooking(null)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                disabled={dispatchLoading}
                onClick={handleExecuteFallback}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-sm"
              >
                Dispatch Backup Vehicle Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
