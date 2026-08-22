import React, { useEffect, useState, useMemo } from "react";
import {
  Search,
  Filter,
  CalendarCheck,
  Zap,
  MapPin,
  Clock,
  User,
  Users,
  Briefcase,
  Car,
  Phone,
  MessageSquare,
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  X,
  ExternalLink,
  Printer,
  ShieldCheck,
  Check,
  RefreshCw,
  Sparkles,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  DollarSign,
  Calendar,
  Send,
  CornerDownRight,
  Copy
} from "lucide-react";
import IdeaHolidayLogo from "../IdeaHolidayLogo.jsx";
import { api, authHeaders } from "../../lib/api.js";

const money = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const CANCEL_REASONS = [
  "Vehicle breakdown / mechanical failure",
  "Assigned driver emergency / unavailability",
  "Severe weather / road blocked / landslide",
  "Traveler no-show at pickup point",
  "Mutual cancellation request with traveler",
  "Operational overbooking / scheduling conflict",
  "Other operational constraint"
];

export default function SupplierBookingManager({ supplierData, loading, onRefresh }) {
  const [activeFilter, setActiveFilter] = useState("ALL"); // ALL, PENDING, IN_PROGRESS, COMPLETED, CANCELLED
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("NEWEST");
  const [selectedBooking, setSelectedBooking] = useState(null);

  // Driver Assignment State
  const [isAssigningDriver, setIsAssigningDriver] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [customDriverName, setCustomDriverName] = useState("");
  const [customDriverPhone, setCustomDriverPhone] = useState("");
  const [customVehicleNum, setCustomVehicleNum] = useState("");
  const [assignSuccessMsg, setAssignSuccessMsg] = useState("");
  const [fleetOptions, setFleetOptions] = useState([]);
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [isUpdatingDispatch, setIsUpdatingDispatch] = useState(false);

  // Pickup OTP State
  const [pickupOtp, setPickupOtp] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Booking Response State (Accept/Reject Pending)
  const [responseNote, setResponseNote] = useState("");
  const [respondingBookingId, setRespondingBookingId] = useState("");
  const [responseMessage, setResponseMessage] = useState("");
  const [clockNow, setClockNow] = useState(Date.now());
  const [isSendingGuestNotification, setIsSendingGuestNotification] = useState(false);
  const [guestNotificationMessage, setGuestNotificationMessage] = useState("");

  // Cancellation Modal State
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelNotes, setCancelNotes] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState("");

  // Invoice / Manifest Print State
  const [showInvoicePrint, setShowInvoicePrint] = useState(false);
  const [copiedId, setCopiedId] = useState("");

  const handleCopyId = (id) => {
    if (!id) return;
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const bookings = supplierData?.bookings || [];
  const drivers = supplierData?.drivers || [];
  const s = supplierData?.supplier || {};

  // Fetch driver availability for selected booking
  useEffect(() => {
    if (!selectedBooking?.id || !s.id) {
      setFleetOptions([]);
      return;
    }
    let active = true;
    fetch(`/api/suppliers/${s.id}/drivers/availability?bookingId=${encodeURIComponent(selectedBooking.id)}`, { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check fleet availability");
        if (active) setFleetOptions(data.drivers || []);
      })
      .catch((error) => active && setDispatchMessage(error.message));
    return () => { active = false; };
  }, [selectedBooking?.id, s.id]);

  // Tab Counts
  const counts = useMemo(() => ({
    ALL: bookings.length,
    PENDING: bookings.filter((b) => b.supplier_response_status === "PENDING" || b.status === "pending_confirmation").length,
    IN_PROGRESS: bookings.filter((b) => ["in_progress", "driver_assigned", "confirmed"].includes(b.status) && b.supplier_response_status !== "PENDING").length,
    COMPLETED: bookings.filter((b) => b.status === "completed").length,
    CANCELLED: bookings.filter((b) => b.status === "cancelled").length,
  }), [bookings]);

  // Filter and Sort bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Status filter
      if (activeFilter === "PENDING" && (b.supplier_response_status !== "PENDING" && b.status !== "pending_confirmation")) return false;
      if (activeFilter === "IN_PROGRESS" && (!["in_progress", "driver_assigned", "confirmed"].includes(b.status) || b.supplier_response_status === "PENDING")) return false;
      if (activeFilter === "COMPLETED" && b.status !== "completed") return false;
      if (activeFilter === "CANCELLED" && b.status !== "cancelled") return false;

      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesRef = b.ref?.toLowerCase().includes(q);
        const matchesName = b.traveler_name?.toLowerCase().includes(q);
        const matchesPhone = b.traveler_phone?.includes(q);
        const matchesLocation = b.pickup_location?.toLowerCase().includes(q) || b.drop_location?.toLowerCase().includes(q);
        const matchesProduct = b.product_title?.toLowerCase().includes(q);
        const matchesProdId = b.product_id?.toLowerCase().includes(q);
        const matchesSupId = b.supplier_id?.toLowerCase().includes(q);
        return matchesRef || matchesName || matchesPhone || matchesLocation || matchesProduct || matchesProdId || matchesSupId;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === "NEWEST") return new Date(b.created_at || b.activity_date) - new Date(a.created_at || a.activity_date);
      if (sortBy === "OLDEST") return new Date(a.created_at || a.activity_date) - new Date(b.created_at || b.activity_date);
      if (sortBy === "AMOUNT_HIGH") return (b.amount_inr || 0) - (a.amount_inr || 0);
      return 0;
    });
  }, [bookings, activeFilter, searchTerm, sortBy]);

  const getStatusBadge = (b) => {
    const st = (b.status || "confirmed").toLowerCase();
    const isPendingResp = b.supplier_response_status === "PENDING" || st === "pending_confirmation";

    if (isPendingResp) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full animate-pulse">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          Pending Confirmation
        </span>
      );
    }
    if (st === "in_progress") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-900 bg-sky-100 border border-sky-300 px-2.5 py-1 rounded-full animate-pulse">
          <Clock className="w-3 h-3 text-sky-600" />
          Trip in Progress
        </span>
      );
    }
    if (st === "driver_assigned") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-900 bg-indigo-100 border border-indigo-300 px-2.5 py-1 rounded-full">
          <Car className="w-3 h-3 text-indigo-600" />
          Driver Assigned
        </span>
      );
    }
    if (st === "completed") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Completed
        </span>
      );
    }
    if (st === "cancelled") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-900 bg-rose-100 border border-rose-300 px-2.5 py-1 rounded-full">
          <XCircle className="w-3 h-3 text-rose-600" />
          Cancelled
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        Confirmed
      </span>
    );
  };

  const handleAssignDriverSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBooking) return;
    setIsAssigningDriver(true);
    setDispatchMessage("");

    try {
      let payload = { bookingId: selectedBooking.id };
      if (selectedDriverId === "CUSTOM") {
        if (!customDriverName || !customDriverPhone || !customVehicleNum) {
          throw new Error("Please complete the emergency manual assignment fields.");
        }
        payload = {
          ...payload,
          driverName: customDriverName,
          driverPhone: customDriverPhone,
          vehicleNumber: customVehicleNum,
          vehicleModel: selectedBooking.vehicle_category || "Standard Vehicle"
        };
      } else {
        payload.supplierDriverId = selectedDriverId;
      }

      const res = await fetch(`/api/suppliers/${s.id}/assign-driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Driver could not be assigned");
      if (data.success) {
        setAssignSuccessMsg("Driver assigned successfully.");
        setSelectedBooking({
          ...selectedBooking,
          ...data.assignment,
          status: "driver_assigned"
        });
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      setDispatchMessage(err.message || "Failed to assign driver");
    } finally {
      setIsAssigningDriver(false);
    }
  };

  const handleDispatchStatus = async (status) => {
    if (!selectedBooking?.id) return;
    setIsUpdatingDispatch(true);
    setDispatchMessage("");
    try {
      const response = await fetch(`/api/suppliers/${s.id}/bookings/${selectedBooking.id}/dispatch-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Dispatch could not be updated");
      setSelectedBooking((current) => ({
        ...current,
        ...data.assignment,
        status: status === "COMPLETED" ? "completed" : current.status,
      }));
      setDispatchMessage(data.message);
      onRefresh?.();
    } catch (error) {
      setDispatchMessage(error.message || "Dispatch could not be updated");
    } finally {
      setIsUpdatingDispatch(false);
    }
  };

  const handleVerifyPickupOtp = async (event) => {
    event.preventDefault();
    if (!selectedBooking || !/^\d{6}$/.test(pickupOtp)) {
      setOtpMessage("Enter the traveler's six-digit pickup code.");
      return;
    }
    setIsVerifyingOtp(true);
    setOtpMessage("");
    try {
      const result = await api.verifyPickupOtp(selectedBooking.ref || selectedBooking.id, pickupOtp);
      setSelectedBooking({
        ...selectedBooking,
        status: result.status || "in_progress",
        assignment_status: "TRIP_STARTED",
        trip_started_at: new Date().toISOString(),
        otp_verified_at: new Date().toISOString()
      });
      setPickupOtp("");
      setOtpMessage(result.message || "Pickup verified. Trip started.");
      onRefresh?.();
    } catch (error) {
      setOtpMessage(error.message || "Pickup code could not be verified.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const responseTimeLeft = (deadline) => {
    const seconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - clockNow) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };

  const handleSupplierResponse = async (booking, action) => {
    if (action === "REJECT" && responseNote.trim().length < 5) {
      setResponseMessage("Provide a brief reason before declining.");
      return;
    }
    setRespondingBookingId(booking.id);
    setResponseMessage("");
    try {
      const response = await fetch(`/api/suppliers/${s.id}/bookings/${booking.id}/respond-assignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action, note: responseNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record response");
      setResponseMessage(data.message);
      setResponseNote("");
      if (action === "ACCEPT") {
        setSelectedBooking((current) => current ? { ...current, supplier_response_status: "ACCEPTED", supplier_assignment_status: "SUPPLIER_ACCEPTED" } : current);
      }
      onRefresh?.();
    } catch (error) {
      setResponseMessage(error.message || "Response failed");
    } finally {
      setRespondingBookingId("");
    }
  };

  const handleSendGuestConfirmation = async () => {
    if (!selectedBooking?.id || !s.id) return;
    setIsSendingGuestNotification(true);
    setGuestNotificationMessage("");
    try {
      const result = await api.sendSupplierGuestNotification(s.id, selectedBooking.id);
      setGuestNotificationMessage(`Guest confirmation sent through ${result.attempted} enabled channel${result.attempted === 1 ? "" : "s"}.`);
    } catch (error) {
      setGuestNotificationMessage(error.message || "Guest confirmation could not be sent.");
    } finally {
      setIsSendingGuestNotification(false);
    }
  };

  // Open Cancel Modal
  const handleOpenCancelModal = (booking) => {
    setCancelModalBooking(booking);
    setCancelReason(CANCEL_REASONS[0]);
    setCancelNotes("");
    setCancelError("");
    setCancelSuccessMsg("");
  };

  // Execute Supplier Cancellation
  const handleExecuteCancellation = async (e) => {
    e.preventDefault();
    if (!cancelModalBooking || !s.id) return;
    setIsCancelling(true);
    setCancelError("");
    setCancelSuccessMsg("");
    try {
      const res = await api.cancelSupplierBooking(s.id, cancelModalBooking.id, {
        reason: cancelReason,
        notes: cancelNotes
      });
      setCancelSuccessMsg(res.message || "Booking has been cancelled.");
      if (selectedBooking?.id === cancelModalBooking.id) {
        setSelectedBooking({
          ...selectedBooking,
          status: "cancelled",
          cancellation_reason: cancelReason
        });
      }
      setTimeout(() => {
        setCancelModalBooking(null);
        setCancelSuccessMsg("");
      }, 2000);
      await onRefresh?.();
    } catch (err) {
      setCancelError(err.message || "Failed to cancel booking");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Filter Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[.16em] text-amber-800">Booking Management</span>
          <h1 className="mt-1 font-display text-2xl font-bold text-stone-900">Trip dispatch, confirmation & refunds</h1>
          <p className="mt-1 text-xs text-stone-500">Respond to booking requests, assign fleet drivers, verify pickup codes and handle cancellations.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-amber-600" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3" role="tablist">
        {[
          ["ALL", `All Bookings (${counts.ALL})`],
          ["PENDING", `Pending Action (${counts.PENDING})`],
          ["IN_PROGRESS", `Active / In-Progress (${counts.IN_PROGRESS})`],
          ["COMPLETED", `Completed (${counts.COMPLETED})`],
          ["CANCELLED", `Cancelled & Refunds (${counts.CANCELLED})`],
        ].map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setActiveFilter(val)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              activeFilter === val
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 hover:text-stone-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search & Sort Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white rounded-2xl border border-stone-200 p-3.5 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by reference, traveler name, phone, pickup/drop location…"
            className="w-full rounded-xl border border-stone-200 bg-[#FAF9F6] py-2 pl-10 pr-4 text-xs text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-bold text-stone-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-stone-200 bg-[#FAF9F6] px-3 py-2 text-xs font-bold text-stone-700 focus:border-amber-500 focus:bg-white focus:outline-none"
          >
            <option value="NEWEST">Newest First</option>
            <option value="OLDEST">Oldest First</option>
            <option value="AMOUNT_HIGH">Highest Amount</option>
          </select>
        </div>
      </div>

      {/* Responsive Bookings Table / Grid */}
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 bg-[#FAF9F6] text-[10px] font-black uppercase tracking-wider text-stone-400">
              <tr>
                <th className="px-5 py-4">Booking Ref</th>
                <th className="px-5 py-4">Travel Date & Product</th>
                <th className="px-5 py-4">Traveler</th>
                <th className="px-5 py-4">Status & Dispatch</th>
                <th className="px-5 py-4">Payout</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredBookings.map((b) => {
                const isPendingResp = b.supplier_response_status === "PENDING" || b.status === "pending_confirmation";
                const isCancelled = b.status === "cancelled";
                const hasDriver = Boolean(b.driver_name);

                return (
                  <tr
                    key={b.id}
                    className={`transition hover:bg-amber-50/40 cursor-pointer ${
                      selectedBooking?.id === b.id ? "bg-amber-50/70" : ""
                    }`}
                    onClick={() => setSelectedBooking(b)}
                  >
                    {/* Booking Ref */}
                    <td className="px-5 py-4">
                      <strong className="block text-sm font-bold text-amber-800 font-mono">{b.ref}</strong>
                      <span className="text-[10px] text-stone-400 font-mono">
                        {new Date(b.created_at || Date.now()).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </span>
                    </td>

                    {/* Travel Date & Product */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 font-bold text-stone-900">
                        <Calendar className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                        <span>{b.activity_date || "Upcoming"}</span>
                        {b.pickup_time && <span className="text-stone-500">· {b.pickup_time}</span>}
                      </div>
                      <p className="mt-0.5 truncate max-w-xs text-xs text-stone-600 font-medium">
                        {b.product_title || "Transfer Route"}
                      </p>
                      {b.product_id && (
                        <div className="mt-1 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleCopyId(b.product_id); }}
                            className="inline-flex items-center gap-1 font-mono text-[10px] text-stone-500 hover:text-amber-800"
                            title="Click to copy Product ID"
                          >
                            {copiedId === b.product_id ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Copy className="h-2.5 w-2.5 text-stone-400" />}
                            <span>PID: {b.product_id}</span>
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Traveler */}
                    <td className="px-5 py-4">
                      <div className="font-bold text-stone-900">{b.traveler_name || "Traveler"}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-500 font-mono">
                        {b.traveler_phone && <span>{b.traveler_phone}</span>}
                      </div>
                    </td>

                    {/* Status & Driver */}
                    <td className="px-5 py-4">
                      <div>{getStatusBadge(b)}</div>
                      <div className="mt-1 text-[11px]">
                        {isCancelled ? (
                          <span className="text-rose-700 text-[10px] font-bold">
                            {b.cancellation_reason || "Refunded / Cancelled"}
                          </span>
                        ) : hasDriver ? (
                          <span className="text-stone-700 font-medium flex items-center gap-1">
                            <Car className="h-3 w-3 text-stone-400" /> {b.driver_name} ({b.vehicle_number || "Assigned"})
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold text-[10px]">⚠️ Driver unassigned</span>
                        )}
                      </div>
                    </td>

                    {/* Payout */}
                    <td className="px-5 py-4">
                      <strong className="block text-sm font-bold text-stone-900 font-mono">
                        {money(b.supplier_payout_amount || b.amount_inr)}
                      </strong>
                      <span className="text-[10px] text-stone-400">
                        Gross: {money(b.amount_inr)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {isPendingResp && (
                          <button
                            onClick={() => setSelectedBooking(b)}
                            className="rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-bold text-stone-950 shadow-sm"
                          >
                            Respond
                          </button>
                        )}
                        {!isCancelled && (
                          <button
                            onClick={() => handleOpenCancelModal(b)}
                            className="rounded-xl border border-stone-200 bg-white hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 px-2.5 py-1.5 text-xs font-bold text-stone-600 transition shadow-sm"
                            title="Cancel booking"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedBooking(b)}
                          className="rounded-xl border border-stone-200 bg-white hover:bg-stone-100 p-2 text-stone-700 shadow-sm"
                          title="View booking details"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!filteredBookings.length && (
            <div className="p-12 text-center">
              <CalendarCheck className="mx-auto h-10 w-10 text-stone-300" />
              <h3 className="mt-3 font-display text-base font-bold text-stone-900">No bookings in this view</h3>
              <p className="mt-1 text-xs text-stone-500">Try choosing another status filter or clearing your search term.</p>
            </div>
          )}
        </div>
      </div>

      {/* Booking Details Drawer / Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-stone-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-black text-amber-800">{selectedBooking.ref}</span>
                  {getStatusBadge(selectedBooking)}
                </div>
                <h3 className="mt-1 text-sm font-bold text-stone-900">{selectedBooking.product_title}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                  {selectedBooking.product_id && (
                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedBooking.product_id)}
                      className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-0.5 font-bold text-stone-700 hover:bg-amber-100 hover:text-amber-900 border border-stone-200 transition"
                      title="Copy Product ID"
                    >
                      {copiedId === selectedBooking.product_id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-stone-400" />}
                      Product ID: {selectedBooking.product_id}
                    </button>
                  )}
                  {(selectedBooking.supplier_id || s.id) && (
                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedBooking.supplier_id || s.id)}
                      className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-0.5 font-bold text-stone-700 hover:bg-amber-100 hover:text-amber-900 border border-stone-200 transition"
                      title="Copy Supplier ID"
                    >
                      {copiedId === (selectedBooking.supplier_id || s.id) ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-stone-400" />}
                      Supplier ID: {selectedBooking.supplier_id || s.id}
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="rounded-xl p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Pending Response Alert with Countdown */}
            {(selectedBooking.supplier_response_status === "PENDING" || selectedBooking.status === "pending_confirmation") && (
              <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-900">
                    <Clock className="h-4 w-4 text-amber-600 animate-spin" /> Confirmation Request
                  </span>
                  {selectedBooking.response_deadline && (
                    <span className="font-mono text-xs font-black text-amber-900 bg-amber-200 px-2 py-0.5 rounded">
                      SLA: {responseTimeLeft(selectedBooking.response_deadline)}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-amber-950">
                  Please review trip requirements and fleet availability. Confirming accepts responsibility for this trip.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={respondingBookingId === selectedBooking.id}
                    onClick={() => handleSupplierResponse(selectedBooking, "ACCEPT")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-stone-950 shadow-sm"
                  >
                    <Check className="h-3.5 w-3.5" /> Accept & Confirm Trip
                  </button>
                  <button
                    disabled={respondingBookingId === selectedBooking.id}
                    onClick={() => handleSupplierResponse(selectedBooking, "REJECT")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-100 hover:bg-rose-200 px-4 py-2 text-xs font-bold text-rose-900 shadow-sm"
                  >
                    <X className="h-3.5 w-3.5" /> Decline Trip
                  </button>
                </div>
                {responseMessage && <p className="mt-2 text-xs font-bold text-amber-900">{responseMessage}</p>}
              </div>
            )}

            {/* Traveler & Route Details */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">Traveler Details</span>
                <strong className="mt-1 block text-sm font-bold text-stone-900">{selectedBooking.traveler_name || "Traveler"}</strong>
                <div className="mt-3 space-y-1.5 text-xs text-stone-600">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-amber-600" />
                    <a href={`tel:${selectedBooking.traveler_phone}`} className="hover:underline font-mono">
                      {selectedBooking.traveler_phone || "Phone not provided"}
                    </a>
                  </div>
                  {selectedBooking.traveler_email && (
                    <div className="flex items-center gap-2 truncate">
                      <User className="h-3.5 w-3.5 text-stone-400" />
                      <span className="truncate">{selectedBooking.traveler_email}</span>
                    </div>
                  )}
                  {selectedBooking.pax_count && (
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-stone-400" />
                      <span>{selectedBooking.pax_count} Passengers</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-2 border-t border-stone-200 pt-3">
                  {selectedBooking.traveler_phone && (
                    <>
                      <a
                        href={`tel:${selectedBooking.traveler_phone}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-50"
                      >
                        <Phone className="h-3 w-3" /> Call
                      </a>
                      <a
                        href={`https://wa.me/${selectedBooking.traveler_phone.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                      >
                        <MessageSquare className="h-3 w-3" /> WhatsApp
                      </a>
                    </>
                  )}
                </div>
                {selectedBooking.payment_status === "PAID" && selectedBooking.supplier_response_status === "ACCEPTED" && (
                  <div className="mt-3 border-t border-stone-200 pt-3">
                    <button
                      type="button"
                      disabled={isSendingGuestNotification}
                      onClick={handleSendGuestConfirmation}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Send className={`h-3 w-3 ${isSendingGuestNotification ? "animate-pulse" : ""}`} /> Send guest confirmation
                    </button>
                    {guestNotificationMessage && <p className="mt-2 text-[11px] font-medium text-stone-600">{guestNotificationMessage}</p>}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">Route & Pickup</span>
                <div className="mt-2 space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-stone-400">Pickup Location</span>
                    <p className="font-bold text-stone-900">{selectedBooking.pickup_location || "To be confirmed"}</p>
                  </div>
                  {selectedBooking.drop_location && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-stone-400">Drop Location</span>
                      <p className="font-bold text-stone-900">{selectedBooking.drop_location}</p>
                    </div>
                  )}
                  {selectedBooking.flight_number && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-stone-400">Flight / Train</span>
                      <p className="font-mono font-bold text-stone-900">{selectedBooking.flight_number}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Payout Breakdown</span>
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-stone-100 pt-3 text-center">
                <div>
                  <span className="text-[10px] text-stone-400 uppercase">Gross Booking</span>
                  <strong className="block text-sm font-bold text-stone-900 font-mono">{money(selectedBooking.amount_inr)}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 uppercase">Commission</span>
                  <strong className="block text-sm font-bold text-stone-500 font-mono">
                    {money(selectedBooking.commission_amount || (selectedBooking.amount_inr * (s.commission_rate || 18) / 100))}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-800 uppercase font-bold">Net Payout</span>
                  <strong className="block text-sm font-bold text-emerald-800 font-mono">
                    {money(selectedBooking.supplier_payout_amount || (selectedBooking.amount_inr - (selectedBooking.commission_amount || 0)))}
                  </strong>
                </div>
              </div>

              {selectedBooking.refunded_amount > 0 && (
                <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-900 flex items-center justify-between">
                  <span>Traveler Refund Processed:</span>
                  <strong className="font-mono font-bold">{money(selectedBooking.refunded_amount)}</strong>
                </div>
              )}
            </div>

            {/* OTP Verification Section (For In-Progress / Pickup Verification) */}
            {selectedBooking.status !== "cancelled" && selectedBooking.status !== "completed" && (
              <div className="mt-4 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">Trip Security & OTP</span>
                <p className="mt-1 text-xs text-stone-500">Ask traveler for their 6-digit pickup code to start trip.</p>
                <form onSubmit={handleVerifyPickupOtp} className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={pickupOtp}
                    onChange={(e) => setPickupOtp(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Enter 6-digit OTP"
                    className="w-44 rounded-xl border border-stone-300 bg-white px-3 py-2 text-center text-sm font-mono font-black tracking-widest text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isVerifyingOtp || pickupOtp.length !== 6}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-stone-950 hover:bg-stone-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {isVerifyingOtp ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Verify & Start Trip
                  </button>
                </form>
                {otpMessage && <p className="mt-2 text-xs font-bold text-amber-900">{otpMessage}</p>}
              </div>
            )}

            {/* Driver Assignment & Dispatch Controls */}
            {selectedBooking.status !== "cancelled" && (
              <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-700">Driver & Fleet Dispatch</span>
                  {selectedBooking.driver_name && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900 border border-emerald-300">
                      Assigned: {selectedBooking.driver_name}
                    </span>
                  )}
                </div>

                <form onSubmit={handleAssignDriverSubmit} className="mt-3 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-500">Select Fleet Driver</label>
                      <select
                        value={selectedDriverId}
                        onChange={(e) => setSelectedDriverId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-stone-200 bg-[#FAF9F6] p-2 text-xs font-bold text-stone-800 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">-- Choose available driver --</option>
                        {fleetOptions.map((dr) => (
                          <option key={dr.id} value={dr.id}>
                            {dr.driver_name} · {dr.vehicle_number} ({dr.vehicle_category || "Standard"})
                          </option>
                        ))}
                        <option value="CUSTOM">⚡ Emergency Manual Assignment</option>
                      </select>
                    </div>

                    {selectedDriverId === "CUSTOM" && (
                      <div className="space-y-2 sm:col-span-2 border-t border-stone-100 pt-2">
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input
                            type="text"
                            placeholder="Driver Name"
                            value={customDriverName}
                            onChange={(e) => setCustomDriverName(e.target.value)}
                            className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-2 text-xs text-stone-900"
                          />
                          <input
                            type="text"
                            placeholder="Driver Phone"
                            value={customDriverPhone}
                            onChange={(e) => setCustomDriverPhone(e.target.value)}
                            className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-2 text-xs text-stone-900"
                          />
                          <input
                            type="text"
                            placeholder="Vehicle Number (e.g. UP32AB1234)"
                            value={customVehicleNum}
                            onChange={(e) => setCustomVehicleNum(e.target.value)}
                            className="rounded-xl border border-stone-200 bg-[#FAF9F6] p-2 text-xs text-stone-900 uppercase font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="submit"
                      disabled={isAssigningDriver || !selectedDriverId}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-stone-950 disabled:opacity-50 shadow-sm"
                    >
                      {isAssigningDriver ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Car className="h-3.5 w-3.5" />}
                      Confirm Driver Assignment
                    </button>

                    {selectedBooking.driver_name && selectedBooking.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => handleDispatchStatus("COMPLETED")}
                        disabled={isUpdatingDispatch}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-sm"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark Trip Completed
                      </button>
                    )}
                  </div>
                </form>

                {dispatchMessage && <p className="mt-2 text-xs font-bold text-amber-900">{dispatchMessage}</p>}
                {assignSuccessMsg && <p className="mt-2 text-xs font-bold text-emerald-900">{assignSuccessMsg}</p>}
              </div>
            )}

            {/* Action Footer */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-4">
              {selectedBooking.status !== "cancelled" ? (
                <button
                  type="button"
                  onClick={() => handleOpenCancelModal(selectedBooking)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 px-4 py-2 text-xs font-bold text-rose-800 transition"
                >
                  <XCircle className="h-3.5 w-3.5" /> Cancel Booking / Refund
                </button>
              ) : (
                <span className="text-xs font-bold text-rose-700">Booking Cancelled</span>
              )}

              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-xl border border-stone-300 bg-stone-100 hover:bg-stone-200 px-5 py-2 text-xs font-bold text-stone-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Cancellation & Refund Modal */}
      {cancelModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-700">Cancellation & Refund Request</span>
                <h3 className="text-base font-bold text-stone-900">
                  Cancel Booking {cancelModalBooking.ref}
                </h3>
              </div>
              <button
                onClick={() => setCancelModalBooking(null)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteCancellation} className="mt-5 space-y-4">
              {/* Financial Impact Box */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
                <div className="flex items-center justify-between">
                  <span className="font-bold">Gross Booking Fare:</span>
                  <span className="font-mono font-bold">{money(cancelModalBooking.amount_inr)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-amber-800">
                  <span>Cancellation Policy:</span>
                  <span className="font-bold">{cancelModalBooking.cancellation_policy || "FLEXIBLE_24H"}</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-amber-900 border-t border-amber-200 pt-2">
                  When cancelled by operator, a full refund of {money(cancelModalBooking.amount_inr)} will be credited back to the traveler's payment source.
                </p>
              </div>

              {/* Reason Selector */}
              <div>
                <label className="block text-xs font-bold text-stone-700">Reason for Cancellation *</label>
                <select
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 text-xs font-bold text-stone-800 focus:border-amber-500 focus:outline-none"
                >
                  {CANCEL_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-700">Additional Operations Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={cancelNotes}
                  onChange={(e) => setCancelNotes(e.target.value)}
                  placeholder="Provide context for traveler and operations team…"
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {cancelError && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" /> {cancelError}
                </div>
              )}
              {cancelSuccessMsg && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> {cancelSuccessMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-4">
                <button
                  type="button"
                  onClick={() => setCancelModalBooking(null)}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100"
                >
                  Keep Booking
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50"
                >
                  {isCancelling ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  Confirm Cancellation & Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
