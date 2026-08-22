import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Headphones,
  Link2,
  RotateCcw,
  ShieldCheck,
  X,
  CheckCircle2,
  CreditCard,
  Clock,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { api, authHeaders } from "../../lib/api.js";

const categories = {
  CANCELLATION: [
    "CHANGE_OF_PLANS",
    "TRAVEL_RESCHEDULED",
    "FLIGHT_DISRUPTION",
    "BOOKING_ERROR",
    "MEDICAL_EMERGENCY",
    "OTHER"
  ],
  COMPLAINT: ["SERVICE_QUALITY", "DRIVER_CONDUCT", "VEHICLE_ISSUE", "ITINERARY_MISMATCH", "CHARGES", "OTHER"],
  REFUND_DISPUTE: ["REFUND_AMOUNT", "REFUND_DELAY", "POLICY_DISPUTE", "DUPLICATE_CHARGE", "OTHER"],
  SAFETY: ["DRIVER_SAFETY", "VEHICLE_SAFETY", "HARASSMENT", "EMERGENCY", "OTHER"],
  OTHER: ["GENERAL"]
};

const categoryLabels = {
  CHANGE_OF_PLANS: "Change of travel plans",
  TRAVEL_RESCHEDULED: "Travel rescheduled to different date",
  FLIGHT_DISRUPTION: "Flight delayed or cancelled",
  BOOKING_ERROR: "Booked by mistake / duplicate",
  MEDICAL_EMERGENCY: "Medical emergency or illness",
  OTHER: "Other reason",
  SERVICE_QUALITY: "Service quality issue",
  DRIVER_CONDUCT: "Driver conduct",
  VEHICLE_ISSUE: "Vehicle condition",
  ITINERARY_MISMATCH: "Itinerary mismatch",
  CHARGES: "Billing or charge discrepancy",
  REFUND_AMOUNT: "Dispute refund amount",
  REFUND_DELAY: "Refund settlement delay",
  POLICY_DISPUTE: "Cancellation policy dispute",
  DUPLICATE_CHARGE: "Duplicate charge on payment card/UPI",
  DRIVER_SAFETY: "Driver safety issue",
  VEHICLE_SAFETY: "Vehicle safety concern",
  HARASSMENT: "Harassment or inappropriate behavior",
  EMERGENCY: "Emergency situation",
  GENERAL: "General inquiry"
};

export default function CancellationRefundModal({ booking, initialType = "CANCELLATION", onClose, onSuccess }) {
  const [caseType, setCaseType] = useState(initialType);
  const [category, setCategory] = useState(categories[initialType]?.[0] || "CHANGE_OF_PLANS");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [calculation, setCalculation] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [autoCancelSuccess, setAutoCancelSuccess] = useState(null);

  useEffect(() => {
    setCategory(categories[caseType]?.[0] || "GENERAL");
    if (!["CANCELLATION", "REFUND_DISPUTE"].includes(caseType)) {
      setCalculation(null);
      return;
    }
    setLoadingQuote(true);
    fetch("/api/checkout/calculate-refund", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ bookingId: booking.id || booking.ref, bookingRef: booking.ref })
    })
      .then((res) => res.json())
      .then((data) => setCalculation(data.success ? data : null))
      .catch(() => setCalculation(null))
      .finally(() => setLoadingQuote(false));
  }, [booking, caseType]);

  // Automated Instant Cancellation & Cashfree Refund
  async function handleAutoCancel() {
    setProcessing(true);
    setError("");
    try {
      const res = await api.cancelTravelerBooking({
        bookingRef: booking.ref,
        reason: `${categoryLabels[category] || category}${description ? ": " + description : ""}`,
      });
      setAutoCancelSuccess(res);
      setTimeout(() => {
        onSuccess?.({
          ...res,
          message: res.message || `Booking ${booking.ref} successfully cancelled.`
        });
        onClose();
      }, 2500);
    } catch (err) {
      setError(err.message || "Failed to process automatic cancellation");
    } finally {
      setProcessing(false);
    }
  }

  // Submit Ops Support Case (for manual disputes or special circumstances)
  async function submitSupportCase() {
    setProcessing(true);
    setError("");
    try {
      const data = await api.createSupportCase({
        bookingId: booking.id || booking.ref,
        caseType,
        category,
        subject: subject || `${caseType.replaceAll("_", " ")} for ${booking.ref}`,
        description: description || "Support request for booking cancellation/dispute",
        requestedRefundPercentage: ["CANCELLATION", "REFUND_DISPUTE"].includes(caseType) ? calculation?.refundPercentage : undefined,
      });
      if (evidenceUrl.trim()) {
        await api.addSupportEvidence(data.case.case_ref, {
          evidenceUrl,
          displayName: "Traveler evidence",
          note: "Added when opening case"
        });
      }
      onSuccess?.({
        ...data,
        message: `${data.case.case_ref} submitted. Operations team will review your case.`
      });
      onClose();
    } catch (err) {
      setError(err.message || "Support request could not be submitted");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-xl space-y-5 overflow-y-auto rounded-3xl border border-stone-200 bg-white p-6 text-stone-900 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                {caseType === "CANCELLATION" ? "Automatic Refund & Cancellation" : "Support Request"}
              </span>
              <span className="font-mono text-xs font-bold text-amber-800">{booking?.ref}</span>
            </div>
            <h3 className="mt-1 font-display text-xl font-bold text-stone-900">
              {caseType === "CANCELLATION" ? "Cancel Booking & Process Refund" : `Help with booking ${booking?.ref}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-stone-100 hover:bg-stone-200 p-2 text-stone-500 hover:text-stone-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success Banner */}
        {autoCancelSuccess && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Cancellation & Refund Confirmed!
            </div>
            <p className="mt-2 text-xs leading-relaxed text-emerald-900">
              {autoCancelSuccess.message}
            </p>
            {autoCancelSuccess.gatewayRefundId && autoCancelSuccess.gatewayRefundId !== "rfnd_none" && (
              <div className="mt-3 rounded-xl bg-white/80 p-3 text-xs font-mono border border-emerald-200">
                <span className="text-stone-500 block text-[10px] uppercase">Cashfree Refund Reference</span>
                <strong className="text-emerald-900 font-bold">{autoCancelSuccess.gatewayRefundId}</strong>
              </div>
            )}
          </div>
        )}

        {!autoCancelSuccess && (
          <>
            {/* Request Type Selector */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-stone-700">
                Action type
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 text-xs text-stone-900 font-normal focus:border-amber-500 focus:bg-white outline-none"
                >
                  <option value="CANCELLATION">Instant Cancellation & Refund</option>
                  <option value="REFUND_DISPUTE">Dispute / Special Exception Request</option>
                  <option value="COMPLAINT">Service Complaint</option>
                  <option value="SAFETY">Safety Concern</option>
                  <option value="OTHER">Other Assistance</option>
                </select>
              </label>

              <label className="text-xs font-bold text-stone-700">
                Reason
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 text-xs text-stone-900 font-normal focus:border-amber-500 focus:bg-white outline-none"
                >
                  {categories[caseType]?.map((item) => (
                    <option key={item} value={item}>
                      {categoryLabels[item] || item.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Real-time Policy Calculation Display */}
            {["CANCELLATION", "REFUND_DISPUTE"].includes(caseType) && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                    <ShieldCheck className="h-4 w-4 text-amber-600" /> Cancellation Policy Evaluation
                  </span>
                  {calculation && (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-900">
                      {calculation.cancellationPolicy}
                    </span>
                  )}
                </div>

                {loadingQuote ? (
                  <p className="mt-3 text-xs text-stone-500">Evaluating product cancellation policy…</p>
                ) : calculation ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center rounded-xl bg-white border border-amber-200 p-3">
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-stone-400">Total Paid</span>
                        <strong className="text-sm font-bold text-stone-900 font-mono">
                          ₹{Number(calculation.totalAmount).toLocaleString("en-IN")}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-stone-400">Refund Eligible</span>
                        <strong className="text-sm font-bold text-emerald-800 font-mono">
                          ₹{Number(calculation.refundAmount).toLocaleString("en-IN")}
                        </strong>
                        <span className="block text-[10px] text-emerald-700 font-bold">
                          ({calculation.refundPercentage}%)
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-stone-400">Fee Retained</span>
                        <strong className="text-sm font-bold text-stone-700 font-mono">
                          ₹{Number(calculation.cancellationFee).toLocaleString("en-IN")}
                        </strong>
                      </div>
                    </div>

                    <div className="text-[11px] text-amber-950 font-medium space-y-1">
                      <p>
                        <strong>Applicable Policy:</strong> {calculation.policyTier}
                      </p>
                      {calculation.refundAmount > 0 && (
                        <p className="text-stone-600 text-[10px]">
                          Refunds are credited back to your original payment method (Cashfree UPI / Card / Netbanking) within standard bank settlement turnaround.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-rose-800 font-bold">Could not fetch policy calculation.</p>
                )}
              </div>
            )}

            {/* Additional Notes */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-stone-700">
                Additional details / message (optional)
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide any additional context regarding your cancellation..."
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-xs text-stone-900 focus:border-amber-500 focus:bg-white outline-none"
                />
              </label>

              {caseType === "REFUND_DISPUTE" && (
                <label className="block text-xs font-bold text-stone-700">
                  <span className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 text-stone-500" /> Evidence URL / Supporting document
                  </span>
                  <input
                    value={evidenceUrl}
                    onChange={(e) => setEvidenceUrl(e.target.value)}
                    placeholder="https://drive.google.com/... (e.g. flight cancellation / medical proof)"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 text-xs text-stone-900 focus:border-amber-500 focus:bg-white outline-none"
                  />
                </label>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                {error}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-stone-200 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-stone-300 bg-stone-100 hover:bg-stone-200 px-4 py-2.5 text-xs font-bold text-stone-700"
              >
                Keep Booking
              </button>

              {caseType === "CANCELLATION" ? (
                <button
                  type="button"
                  disabled={processing || loadingQuote}
                  onClick={handleAutoCancel}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition"
                >
                  <RotateCcw className="h-4 w-4" />
                  {processing
                    ? "Processing Refund…"
                    : calculation?.refundAmount > 0
                    ? `Confirm & Refund ₹${calculation.refundAmount.toLocaleString("en-IN")}`
                    : "Confirm Cancellation"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={processing || description.trim().length < 5}
                  onClick={submitSupportCase}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-bold text-stone-950 shadow-sm disabled:opacity-40"
                >
                  <Headphones className="h-4 w-4" /> Submit for Review
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
