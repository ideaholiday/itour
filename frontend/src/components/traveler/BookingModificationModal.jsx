import React, { useState } from "react";
import { Calendar, Users, MapPin, AlertCircle, CheckCircle, Clock } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import DatePicker from "../ui/DatePicker";
import Input from "../ui/Input";
import api from "../../lib/api";

export function BookingModificationModal({
  isOpen,
  onClose,
  booking,
  onModificationSuccess,
}) {
  const [requestType, setRequestType] = useState("DATE_CHANGE");
  const [newDate, setNewDate] = useState("");
  const [newGuests, setNewGuests] = useState(booking?.guest_count || 1);
  const [newPickupPoint, setNewPickupPoint] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!booking?.id) return;
    setLoading(true);
    setError("");

    try {
      await api.post(`/bookings/${booking.id}/modify`, {
        requestType,
        details: {
          newDate: requestType === "DATE_CHANGE" ? newDate : undefined,
          newGuests: requestType === "GUEST_COUNT" ? newGuests : undefined,
          newPickupPoint: requestType === "PICKUP_POINT" ? newPickupPoint : undefined,
        },
        reason,
      });

      setSuccess(true);
      if (onModificationSuccess) onModificationSuccess();
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1800);
    } catch (err) {
      setError(err.message || "Failed to submit modification request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Booking Change"
      size="md"
    >
      {success ? (
        <div className="py-6 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">
            Modification Request Submitted
          </h4>
          <p className="text-xs text-stone-500 max-w-xs mx-auto">
            Your host has been notified. You will receive an update once the change is confirmed.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Modification Type Selector */}
          <div>
            <label className="text-xs font-semibold text-stone-600 dark:text-stone-300 block mb-1.5">
              What would you like to change?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "DATE_CHANGE", label: "Date", icon: Calendar },
                { id: "GUEST_COUNT", label: "Guests", icon: Users },
                { id: "PICKUP_POINT", label: "Pickup", icon: MapPin },
              ].map((item) => {
                const Icon = item.icon;
                const active = requestType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRequestType(item.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                      active
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20"
                        : "border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50"
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form fields depending on selected type */}
          {requestType === "DATE_CHANGE" && (
            <DatePicker
              label="New Activity Date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              required
            />
          )}

          {requestType === "GUEST_COUNT" && (
            <Input
              label="Total Guests"
              type="number"
              min="1"
              max="20"
              value={newGuests}
              onChange={(e) => setNewGuests(parseInt(e.target.value, 10))}
              required
            />
          )}

          {requestType === "PICKUP_POINT" && (
            <Input
              label="New Pickup Location Address / Hotel"
              placeholder="e.g. Taj Mahal Hotel Gate 2"
              value={newPickupPoint}
              onChange={(e) => setNewPickupPoint(e.target.value)}
              required
            />
          )}

          <div>
            <label className="text-xs font-semibold text-stone-600 dark:text-stone-300 block mb-1">
              Reason for modification
            </label>
            <textarea
              rows={2}
              placeholder="Provide a brief explanation for the host..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-xs rounded-2xl border border-stone-200 dark:border-stone-700 p-2.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
            <Button variant="ghost" size="sm" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={loading}>
              Submit Request
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default BookingModificationModal;
