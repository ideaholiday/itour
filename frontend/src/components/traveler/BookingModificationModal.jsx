import React, { useState, useEffect } from "react";
import { Calendar, Clock, AlertCircle, CheckCircle, ShieldAlert, ArrowRight, RefreshCw, XCircle } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import DatePicker from "../ui/DatePicker";
import api from "../../lib/api";
import { useCurrency } from "../../lib/currency";

export function BookingModificationModal({
  isOpen,
  onClose,
  booking,
  onModificationSuccess,
  initialTab = "RESCHEDULE",
}) {
  const { formatPrice } = useCurrency();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [eligibility, setEligibility] = useState(null);
  const [cancellationPreview, setCancellationPreview] = useState(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);

  // Form states
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState(booking?.pickup_time || "09:00");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (isOpen && booking?.id) {
      setFetchingInfo(true);
      setError("");
      setSuccessMessage("");
      setNewDate("");
      setReason("");

      Promise.all([
        api.getRescheduleEligibility(booking.id).catch((err) => ({ eligible: false, reason: err.message })),
        api.getCancellationPreview(booking.id).catch((err) => null),
      ])
        .then(([eligRes, cancelRes]) => {
          setEligibility(eligRes);
          setCancellationPreview(cancelRes);
        })
        .finally(() => setFetchingInfo(false));
    }
  }, [isOpen, booking?.id]);

  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!newDate) {
      setError("Please select a new departure date");
      return;
    }
    setLoading(true);
    setError("");

    try {
      await api.rescheduleBooking(booking.id, {
        newDate,
        newTime,
        reason,
      });

      setSuccessMessage(`Trip rescheduled successfully to ${newDate} at ${newTime}!`);
      if (onModificationSuccess) onModificationSuccess();
      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err) {
      setError(err.message || "Failed to reschedule booking");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await api.selfCancelBooking(booking.id, { reason });
      setSuccessMessage(
        res.refundAmountInr > 0
          ? `Booking cancelled. A refund of ${formatPrice(res.refundAmountInr)} has been initiated!`
          : "Booking cancelled successfully."
      );
      if (onModificationSuccess) onModificationSuccess();
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err) {
      setError(err.message || "Failed to cancel booking");
    } finally {
      setLoading(false);
    }
  };

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split("T")[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Modify Trip #${booking?.ref || ""}`}
      size="md"
    >
      {successMessage ? (
        <div className="py-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h4 className="text-base font-bold text-stone-900 dark:text-stone-100">
            Request Completed
          </h4>
          <p className="text-xs text-stone-600 dark:text-stone-300 max-w-xs mx-auto font-medium">
            {successMessage}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tab navigation */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-2xl">
            <button
              type="button"
              onClick={() => { setActiveTab("RESCHEDULE"); setError(""); }}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "RESCHEDULE"
                  ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs"
                  : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reschedule Date/Time
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("CANCEL"); setError(""); }}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "CANCEL"
                  ? "bg-white dark:bg-stone-900 text-rose-600 dark:text-rose-400 shadow-xs"
                  : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
              }`}
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel & Refund
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {fetchingInfo ? (
            <div className="py-12 text-center text-xs text-stone-500">
              Loading booking policy & eligibility details…
            </div>
          ) : activeTab === "RESCHEDULE" ? (
            /* Reschedule Tab */
            <form onSubmit={handleReschedule} className="space-y-4">
              {eligibility && !eligibility.eligible ? (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    Reschedule Window Passed
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    {eligibility.reason || "This booking is too close to departure to be rescheduled online."}
                  </p>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    For emergency assistance, please contact our 24/7 operations concierge.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-xs space-y-1.5">
                    <div className="flex justify-between text-stone-600 dark:text-stone-300">
                      <span>Current Schedule:</span>
                      <strong className="text-stone-900 dark:text-stone-100 font-mono">
                        {booking?.activity_date} at {booking?.pickup_time || "09:00"}
                      </strong>
                    </div>
                    <div className="flex justify-between text-stone-600 dark:text-stone-300">
                      <span>Modification Fee:</span>
                      <span className="font-bold text-emerald-600">FREE (Self-Service)</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-stone-700 dark:text-stone-300 block mb-1.5">
                        New Departure Date
                      </label>
                      <DatePicker
                        value={newDate}
                        onChange={setNewDate}
                        min={minDateStr}
                        theme="light"
                        buttonClassName="w-full py-3 border-stone-300 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-stone-700 dark:text-stone-300 block mb-1.5">
                        Preferred Pickup / Start Time
                      </label>
                      <input
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-2.5 text-xs font-mono font-bold text-stone-900 dark:text-stone-100 outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-stone-700 dark:text-stone-300 block mb-1.5">
                        Reason for Change <span className="font-normal text-stone-400">(optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Flight schedule change, weather, hotel shift"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full text-xs rounded-xl border border-stone-300 dark:border-stone-700 px-3.5 py-2.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
                    <Button variant="ghost" size="sm" onClick={onClose} type="button">
                      Keep Current Schedule
                    </Button>
                    <Button variant="primary" size="sm" type="submit" loading={loading} disabled={!newDate}>
                      Confirm Reschedule
                    </Button>
                  </div>
                </>
              )}
            </form>
          ) : (
            /* Cancellation & Refund Tab */
            <form onSubmit={handleCancel} className="space-y-4">
              {cancellationPreview && (
                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-700">
                    <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
                      Policy Tier:
                    </span>
                    <span className="text-xs font-bold uppercase text-amber-700 dark:text-amber-400 font-mono">
                      {cancellationPreview.cancellationPolicy}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-stone-600 dark:text-stone-400">
                      <span>Total Paid:</span>
                      <span className="font-mono">{formatPrice(cancellationPreview.totalAmountInr)}</span>
                    </div>
                    <div className="flex justify-between text-stone-600 dark:text-stone-400">
                      <span>Refund Percentage:</span>
                      <span className="font-bold text-emerald-600 font-mono">
                        {cancellationPreview.refundPercentage}%
                      </span>
                    </div>
                    {cancellationPreview.cancellationFeeInr > 0 && (
                      <div className="flex justify-between text-stone-600 dark:text-stone-400">
                        <span>Cancellation Fee:</span>
                        <span className="font-mono text-rose-600">
                          −{formatPrice(cancellationPreview.cancellationFeeInr)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-stone-200 dark:border-stone-700 text-sm font-bold text-stone-900 dark:text-stone-100">
                      <span>Estimated Refund:</span>
                      <span className="font-mono text-emerald-600">
                        {formatPrice(cancellationPreview.refundAmountInr)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                    Refunds are processed automatically to your {cancellationPreview.refundMethod === "ORIGINAL_PAYMENT_SOURCE" ? "original payment method (UPI / Card)" : "account"}.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-stone-700 dark:text-stone-300 block mb-1.5">
                  Cancellation Reason <span className="font-normal text-stone-400">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Help us improve: tell us why you are cancelling..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs rounded-xl border border-stone-300 dark:border-stone-700 p-3 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
                <Button variant="ghost" size="sm" onClick={onClose} type="button">
                  Keep My Booking
                </Button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {loading ? "Cancelling…" : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}

export default BookingModificationModal;
