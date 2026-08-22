import React, { useState } from "react";
import { authHeaders } from "../../lib/api.js";
import {
  Radio,
  MapPin,
  AlertTriangle,
  Send,
  X,
  CheckCircle2,
  Building2,
  Car,
  Phone,
  Compass,
  Zap
} from "lucide-react";

export default function EmergencyReallocationModal({ booking, onClose, onSuccess }) {
  const [radiusKm, setRadiusKm] = useState(15);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleBroadcastPing = async () => {
    if (!booking) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ops/emergency-reallocate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          bookingId: booking.id || booking.ref,
          radiusKm
        })
      });
      const data = await res.json();
      if (data.success) {
        setResults(data);
        if (onSuccess) onSuccess(data);
      } else {
        alert(data.error || "Failed to trigger emergency re-allocation");
      }
    } catch (err) {
      console.error("Broadcast Ping Error:", err);
      alert("Network error triggering supplier broadcast ping");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white border border-stone-200 rounded-3xl p-6 space-y-6 shadow-2xl relative overflow-hidden">
        {/* Top gold accent border */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200">
          <div>
            <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300 font-bold flex items-center gap-1.5 w-fit">
              <Zap className="w-3 h-3 text-amber-700 animate-bounce" /> 15 KM RADIUS EMERGENCY DISPATCH
            </span>
            <h3 className="text-lg font-serif font-bold text-stone-900 mt-1">
              Trigger Emergency Supplier Re-allocation
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-600 hover:text-stone-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Booking Summary */}
        <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-4 space-y-2 font-mono text-xs">
          <div className="flex justify-between items-center text-stone-600">
            <span>Target Booking Ref:</span>
            <span className="text-amber-800 font-bold">{booking?.ref || booking?.id}</span>
          </div>
          <div className="flex justify-between items-center text-stone-600">
            <span>Traveler:</span>
            <span className="text-stone-900 font-bold">{booking?.traveler_name} ({booking?.traveler_phone})</span>
          </div>
          <div className="flex items-center gap-2 text-stone-700 pt-1 border-t border-stone-200">
            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate">Pickup Location: {booking?.pickup_location || "Airport Terminal"}</span>
          </div>
        </div>

        {/* Radius Selector */}
        {!results && (
          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-stone-700 font-bold">
              <span>Auto-Ping Radius Boundary:</span>
              <span className="text-amber-800 font-bold text-sm">{radiusKm} KM Radius</span>
            </div>
            <input
              type="range"
              min={5}
              max={35}
              step={5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full accent-amber-500 bg-stone-200 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-stone-500">
              <span>5 KM (Strict Local)</span>
              <span>15 KM (Standard City Zone)</span>
              <span>35 KM (Extended Airport Belt)</span>
            </div>
          </div>
        )}

        {/* Ping Results Panel */}
        {results && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-2xl text-xs font-mono text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Emergency Broadcast Ping Dispatched!
              </div>
              <p>Auto-pinged {results.totalSuppliersPinged} verified fleet suppliers within {results.radiusKm} km radius of pickup point.</p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-mono text-stone-600 font-bold block">Nearby Pinged Suppliers ({results.nearbySuppliers?.length || 0}):</span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {results.nearbySuppliers?.map((s) => (
                  <div key={s.id} className="bg-[#FAF9F6] border border-stone-200 p-3 rounded-xl flex items-center justify-between font-mono text-xs">
                    <div>
                      <span className="text-stone-900 font-bold font-sans block">{s.companyName}</span>
                      <span className="text-[10px] text-stone-500">{s.city} &bull; Contact: {s.phone}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-amber-800 font-bold block">{s.distanceKm} km away</span>
                      <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[9px] px-2 py-0.5 rounded font-bold">
                        {s.pingStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex justify-end gap-3 border-t border-stone-200">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 rounded-xl text-xs font-mono font-bold"
          >
            {results ? "Close Modal" : "Cancel"}
          </button>

          {!results && (
            <button
              disabled={loading}
              onClick={handleBroadcastPing}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-xs font-mono flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Radio className={`w-4 h-4 ${loading ? "animate-spin" : "animate-pulse"}`} />
              <span>Broadcast 15km Emergency Ping</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
