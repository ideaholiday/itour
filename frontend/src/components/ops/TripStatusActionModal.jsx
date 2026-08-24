import React, { useState } from "react";
import {
  X,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  Navigation,
  MapPin,
  Car,
  Phone,
  Clock,
  Zap,
  AlertCircle
} from "lucide-react";
import { api } from "../../lib/api.js";

export default function TripStatusActionModal({
  trip,
  onClose,
  onStatusUpdated
}) {
  const [otp, setOtp] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  if (!trip) return null;

  const currentStatus = (trip.assignment_status || "ASSIGNED").toUpperCase();
  const bookingId = trip.booking_id || trip.id;

  const handleUpdateStatus = async (nextStatus, requireOtp = false) => {
    setLoading(true);
    setError(null);
    try {
      if (requireOtp) {
        if (!otp || otp.trim().length < 4) {
          setError("Please enter the 4-digit pickup OTP provided by traveler");
          setLoading(false);
          return;
        }
        const res = await api.verifyPickupOtp({
          bookingId,
          otp: otp.trim(),
          note: note.trim() || undefined
        });
        if (res.success) {
          setSuccessMessage("Traveler OTP verified! Trip marked IN PROGRESS.");
          setTimeout(() => {
            if (onStatusUpdated) onStatusUpdated();
            onClose();
          }, 1200);
        }
      } else {
        const res = await api.updateTripStatus({
          bookingId,
          nextStatus,
          note: note.trim() || undefined
        });
        if (res.success) {
          setSuccessMessage(`Trip status advanced to ${nextStatus.replace("_", " ")}!`);
          setTimeout(() => {
            if (onStatusUpdated) onStatusUpdated();
            onClose();
          }, 1200);
        }
      }
    } catch (err) {
      setError(err.message || "Failed to update trip status");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateGps = async () => {
    if (!trip.assignment_id) {
      setError("No active driver assignment ID to update GPS");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const currentLat = trip.driver_telemetry?.lat || trip.pickup_lat || 27.1751;
      const currentLng = trip.driver_telemetry?.lng || trip.pickup_lng || 78.0421;
      const newLat = currentLat + (Math.random() - 0.5) * 0.005;
      const newLng = currentLng + (Math.random() - 0.5) * 0.005;

      const res = await api.updateDriverLocation({
        assignmentId: trip.assignment_id,
        lat: newLat,
        lng: newLng,
        speed_kmh: Math.floor(Math.random() * 20) + 30,
        heading: Math.floor(Math.random() * 360),
        battery_pct: 90
      });

      if (res.success) {
        setSuccessMessage("Simulated live GPS ping broadcasted!");
        setTimeout(() => {
          if (onStatusUpdated) onStatusUpdated();
        }, 800);
      }
    } catch (err) {
      setError(err.message || "Failed to simulate GPS update");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 grid place-items-center text-amber-700 dark:text-amber-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
              Trip Dispatch & Status Console
            </h3>
            <span className="text-xs font-mono text-stone-500">
              Booking Ref: <strong className="text-amber-800 dark:text-amber-400">{trip.booking_reference || trip.ref || bookingId}</strong>
            </span>
          </div>
        </div>

        {/* Summary Pill Box */}
        <div className="p-4 rounded-2xl bg-[#FAF9F6] dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-2 mb-5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Traveler:</span>
            <strong className="text-stone-900 dark:text-stone-100">{trip.guest_name || trip.traveler_name || "Guest"} ({trip.guest_phone || trip.traveler_phone || "N/A"})</strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Driver:</span>
            <strong className="text-stone-900 dark:text-stone-100">{trip.driver_name || "Unassigned"} ({trip.vehicle_number || "No Plate"})</strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Pickup:</span>
            <span className="text-stone-700 dark:text-stone-300 truncate max-w-[240px]">{trip.pickup_location}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-stone-200 dark:border-stone-700">
            <span className="text-stone-500">Current Status:</span>
            <span className="px-2.5 py-0.5 rounded-full font-mono font-black text-[11px] bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
              {currentStatus}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Action Controls by Status */}
        <div className="space-y-4">
          {/* Step 1: EN_ROUTE */}
          {currentStatus === "ASSIGNED" && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleUpdateStatus("EN_ROUTE")}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-stone-950 text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
            >
              <Navigation className="w-4 h-4" />
              1. Mark Driver En Route to Pickup
            </button>
          )}

          {/* Step 2: ARRIVED */}
          {currentStatus === "EN_ROUTE" && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleUpdateStatus("ARRIVED")}
              className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
            >
              <MapPin className="w-4 h-4" />
              2. Mark Driver Arrived at Pickup Point
            </button>
          )}

          {/* Step 3: TRIP_STARTED via OTP */}
          {["ASSIGNED", "EN_ROUTE", "ARRIVED"].includes(currentStatus) && (
            <div className="p-4 rounded-2xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
                <KeyRound className="w-4 h-4 text-amber-700" />
                Traveler Pickup OTP Verification
              </div>
              <p className="text-[11px] text-stone-600 dark:text-stone-400">
                Ask traveler for their 4-digit booking OTP to initiate trip and unlock insurance coverage:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="e.g. 7821"
                  className="w-32 px-3 py-2 text-center text-base font-mono font-bold tracking-widest rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  disabled={loading || otp.length < 4}
                  onClick={() => handleUpdateStatus("TRIP_STARTED", true)}
                  className="flex-1 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Verify OTP & Start Trip
                </button>
              </div>
            </div>
          )}

          {/* Step 4: COMPLETED */}
          {currentStatus === "TRIP_STARTED" && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleUpdateStatus("COMPLETED")}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              4. Mark Trip Completed & Release Payout
            </button>
          )}

          {/* Quick GPS Telemetry Simulator */}
          <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
            <button
              type="button"
              disabled={loading}
              onClick={handleSimulateGps}
              className="text-[11px] font-mono text-stone-500 hover:text-amber-800 dark:hover:text-amber-400 flex items-center gap-1.5 transition"
            >
              <Navigation className="w-3.5 h-3.5 text-amber-600" />
              Simulate Live GPS Ping
            </button>
            <span className="text-[10px] text-stone-400 font-mono">
              Last Ping: {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
