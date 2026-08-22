import React, { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  Building2,
  CheckCircle2,
  Calendar,
  Phone,
  Mail,
  X,
  Send,
  Sparkles,
  ShieldAlert,
  ArrowUpRight
} from "lucide-react";
import { authHeaders } from "../../lib/api.js";

export default function FinanceOverviewView() {
  const [finance, setFinance] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideAction, setOverrideAction] = useState(""); // 'FORCE_CANCEL' | 'REFUND' | 'REASSIGN_SUPPLIER' | 'REASSIGN_DRIVER'
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [settlements, setSettlements] = useState({ payouts: [], batches: [] });
  const [settlementInputs, setSettlementInputs] = useState({});
  const [settlementLoading, setSettlementLoading] = useState("");

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      const [fRes, bRes, rRes, sRes] = await Promise.all([
        fetch("/api/admin/finance/overview", { headers }),
        fetch(`/api/admin/bookings?search=${encodeURIComponent(searchTerm)}&status=${statusFilter}&paymentStatus=${paymentFilter}`, { headers }),
        fetch("/api/admin/finance/reconciliation", { headers }),
        fetch("/api/admin/finance/settlements", { headers }),
      ]);

      const fData = await fRes.json();
      const bData = await bRes.json();
      const rData = await rRes.json();
      const sData = await sRes.json();

      if (fData.success) setFinance(fData.finance);
      if (bData.success) {
        setBookings(bData.bookings);
        setSuppliers(bData.availableSuppliers || []);
      }
      if (rData.success) setReconciliation(rData.reconciliation);
      if (sData.success) setSettlements({ payouts: sData.payouts || [], batches: sData.batches || [] });
    } catch (err) {
      console.error("Error fetching finance data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
  }, [statusFilter, paymentFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchFinanceData();
  };

  const handleExecuteOverride = async () => {
    if (!selectedBooking || !overrideAction) return;
    setActionLoading(true);

    try {
      const isRefund = overrideAction === "REFUND";
      const res = await fetch(isRefund ? `/api/admin/finance/refunds/${selectedBooking.id}` : `/api/admin/bookings/${selectedBooking.id}/override-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(isRefund ? { refundPercentage: 100, reason: refundReason } : {
          action: overrideAction,
          newSupplierId: selectedSupplierId,
          driverName,
          driverPhone,
          vehicleNumber,
          refundReason
        })
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message });
        setOverrideModalOpen(false);
        setSelectedBooking(null);
        setOverrideAction("");
        fetchFinanceData();
      } else {
        alert(data.error || "Failed to execute override");
      }
    } catch (err) {
      console.error("Override Error:", err);
      alert("Network error executing status override");
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcessPayout = async (payoutId) => {
    try {
      const res = await fetch("/api/admin/payouts/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ payoutId, provider: "MANUAL_BANK", providerReference: settlementInputs[payoutId] })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "💸 Automated Payout dispatched via RazorpayX / Cashfree!" });
        fetchFinanceData();
      }
    } catch (err) {
      alert("Failed to process payout");
    }
  };

  const createSettlement = async (supplierId) => {
    setSettlementLoading(`create:${supplierId}`);
    try {
      const response = await fetch("/api/admin/finance/settlements", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ supplierId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create settlement");
      setMessage({ type: "success", text: data.message });
      await fetchFinanceData();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally { setSettlementLoading(""); }
  };

  const processSettlement = async (batchId) => {
    const providerReference = String(settlementInputs[batchId] || "").trim();
    if (!providerReference) return setMessage({ type: "error", text: "Enter the bank UTR or payout-provider reference first." });
    setSettlementLoading(`process:${batchId}`);
    try {
      const response = await fetch(`/api/admin/finance/settlements/${batchId}/process`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ provider: "MANUAL_BANK", providerReference }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not process settlement");
      setMessage({ type: "success", text: data.message });
      await fetchFinanceData();
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setSettlementLoading(""); }
  };

  const reconcileSettlement = async (batchId) => {
    const note = String(settlementInputs[`note:${batchId}`] || "").trim();
    if (!note) return setMessage({ type: "error", text: "Add the bank-statement reconciliation note first." });
    setSettlementLoading(`reconcile:${batchId}`);
    try {
      const response = await fetch(`/api/admin/finance/settlements/${batchId}/reconcile`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reconcile settlement");
      setMessage({ type: "success", text: data.message });
      await fetchFinanceData();
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setSettlementLoading(""); }
  };

  const scheduledSuppliers = Object.values(settlements.payouts.filter((payout) => payout.payout_status === "SCHEDULED").reduce((groups, payout) => {
    groups[payout.supplier_id] ||= { supplierId: payout.supplier_id, companyName: payout.company_name, count: 0, amount: 0 };
    groups[payout.supplier_id].count += 1;
    groups[payout.supplier_id].amount += Number(payout.net_payout || 0);
    return groups;
  }, {}));

  return (
    <div className="space-y-6">
      {/* View Title Header */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-100 text-amber-900 text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-amber-300 font-bold">
              MODULE 3
            </span>
            <span className="text-stone-500 text-xs font-mono">/admin/finance</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-stone-900 flex items-center gap-3">
            <DollarSign className="w-7 h-7 text-emerald-600" />
            Global Bookings & Financial Overview
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Real-time Gross Merchandise Value (GMV), net commission earnings, supplier payout pools, and searchable master bookings table with force cancel, refund, and driver re-assignment overrides.
          </p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between shadow-sm ${message.type === "error" ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-emerald-50 border-emerald-300 text-emerald-900"}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="underline hover:text-stone-900">Dismiss</button>
        </div>
      )}

      {/* HIGH LEVEL METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* GMV */}
        <div className="bg-white border border-stone-200 p-5 rounded-3xl space-y-2 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-stone-500 text-xs font-mono">
            <span>GROSS MERCHANDISE VALUE</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700">
            ₹{loading ? "..." : (finance?.gmv || 0).toLocaleString()}
          </div>
          <p className="text-[10px] text-stone-500 font-mono">Total gross booking volume across India</p>
        </div>

        {/* Net Commission */}
        <div className="bg-white border border-stone-200 p-5 rounded-3xl space-y-2 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-stone-500 text-xs font-mono">
            <span>NET COMMISSION EARNED</span>
            <DollarSign className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-700">
            ₹{loading ? "..." : (finance?.totalCommission || 0).toLocaleString()}
          </div>
          <p className="text-[10px] text-stone-500 font-mono">Platform revenue earned from vendor commission</p>
        </div>

        {/* Pending Payouts */}
        <div className="bg-white border border-stone-200 p-5 rounded-3xl space-y-2 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-stone-500 text-xs font-mono">
            <span>PENDING SUPPLIER PAYOUTS</span>
            <CreditCard className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-800">
            ₹{loading ? "..." : (finance?.pendingPayouts || 0).toLocaleString()}
          </div>
          <p className="text-[10px] text-stone-500 font-mono">Net vendor payout pool scheduled for transfer</p>
        </div>

        {/* Processed Payouts */}
        <div className="bg-white border border-stone-200 p-5 rounded-3xl space-y-2 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-stone-500 text-xs font-mono">
            <span>PROCESSED PAYOUTS</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900">
            ₹{loading ? "..." : (finance?.processedPayouts || 0).toLocaleString()}
          </div>
          <p className="text-[10px] text-stone-500 font-mono">Settlements with recorded provider references</p>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-3xl space-y-2 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-stone-500 text-xs font-mono"><span>REFUNDS ISSUED</span><RotateCcw className="w-4 h-4 text-amber-700" /></div>
          <div className="text-2xl font-bold font-mono text-amber-900">₹{loading ? "..." : Number(finance?.refundedAmount || 0).toLocaleString()}</div>
          <p className="text-[10px] text-stone-500 font-mono">Returned to original payment sources</p>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-3xl space-y-2 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-stone-500 text-xs font-mono"><span>RECONCILIATION</span><ShieldAlert className="w-4 h-4 text-rose-600" /></div>
          <div className="text-2xl font-bold font-mono text-rose-700">{loading ? "..." : finance?.reconciliationExceptions || 0}</div>
          <p className="text-[10px] text-stone-500 font-mono">Transactions requiring finance review</p>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Supplier settlement queue</span><h2 className="mt-1 font-serif text-xl font-bold text-stone-900">Build controlled payout batches</h2><p className="mt-1 text-xs text-stone-600">Only completed or retained cancellation payables appear here. A provider reference is mandatory before marking paid.</p></div><CreditCard className="h-6 w-6 text-amber-600" /></div>
          <div className="mt-5 space-y-3">
            {scheduledSuppliers.map((group) => <div key={group.supplierId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4"><div><strong className="block text-sm text-stone-900">{group.companyName}</strong><span className="text-[10px] text-stone-500">{group.count} payable{group.count === 1 ? "" : "s"} · ₹{group.amount.toLocaleString("en-IN")}</span></div><button disabled={Boolean(settlementLoading)} onClick={() => createSettlement(group.supplierId)} className="rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-bold text-stone-950 disabled:opacity-50 shadow-sm">Create batch</button></div>)}
            {!scheduledSuppliers.length && <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">No scheduled supplier payables.</p>}
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div><span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Settlement register</span><h2 className="mt-1 font-serif text-xl font-bold text-stone-900">Process and reconcile</h2></div>
          <div className="mt-5 max-h-80 space-y-3 overflow-y-auto pr-1">
            {settlements.batches.map((batch) => <div key={batch.id} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-stone-900">{batch.batch_ref}</strong><p className="text-[10px] text-stone-500">{batch.company_name} · {batch.payout_count} payouts · ₹{Number(batch.net_amount).toLocaleString("en-IN")}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${batch.status === "RECONCILED" ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : batch.status === "PROCESSED" ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-stone-100 text-stone-700 border border-stone-300"}`}>{batch.status}</span></div>
              {batch.status === "READY" && <div className="mt-3 flex gap-2"><input value={settlementInputs[batch.id] || ""} onChange={(event) => setSettlementInputs((current) => ({ ...current, [batch.id]: event.target.value }))} placeholder="Bank UTR / provider reference" className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500" /><button disabled={Boolean(settlementLoading)} onClick={() => processSettlement(batch.id)} className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50 shadow-sm">Mark paid</button></div>}
              {batch.status === "PROCESSED" && <div className="mt-3 flex gap-2"><input value={settlementInputs[`note:${batch.id}`] || ""} onChange={(event) => setSettlementInputs((current) => ({ ...current, [`note:${batch.id}`]: event.target.value }))} placeholder="Bank statement match note" className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500" /><button disabled={Boolean(settlementLoading)} onClick={() => reconcileSettlement(batch.id)} className="rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-2 text-xs font-bold text-stone-950 disabled:opacity-50 shadow-sm">Reconcile</button></div>}
              {batch.provider_batch_id && <p className="mt-2 text-[10px] text-stone-500">Reference: <span className="font-mono text-stone-800 font-bold">{batch.provider_batch_id}</span></p>}
            </div>)}
            {!settlements.batches.length && <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500">No settlement batches created yet.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between"><div><span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Reconciliation exceptions</span><h2 className="mt-1 font-serif text-xl font-bold text-stone-900">Collections = refunds + commission + supplier payable</h2></div><button onClick={fetchFinanceData} className="rounded-xl border border-stone-200 bg-stone-50 p-2 text-stone-600 hover:text-stone-900"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-600" : ""}`} /></button></div>
        <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[10px] uppercase text-stone-500"><tr><th className="pb-3">Booking</th><th className="pb-3">Net collected</th><th className="pb-3">Allocated</th><th className="pb-3">Difference</th><th className="pb-3">Review reason</th></tr></thead><tbody className="divide-y divide-stone-100">{(reconciliation?.rows || []).filter((row) => row.issues.length).slice(0, 10).map((row) => <tr key={row.id}><td className="py-3 font-bold text-amber-800">{row.ref}</td><td className="py-3 text-stone-900">₹{row.netCollected.toLocaleString("en-IN")}</td><td className="py-3 text-stone-900">₹{row.allocated.toLocaleString("en-IN")}</td><td className={`py-3 font-bold ${row.discrepancy ? "text-rose-700" : "text-emerald-700"}`}>₹{row.discrepancy.toLocaleString("en-IN")}</td><td className="py-3"><div className="flex flex-wrap gap-1">{row.issues.map((issue) => <span key={issue} className="rounded bg-rose-100 text-rose-900 border border-rose-300 px-2 py-1 text-[9px] font-bold">{issue.replaceAll("_", " ")}</span>)}</div></td></tr>)}</tbody></table>{!(reconciliation?.rows || []).some((row) => row.issues.length) && <p className="rounded-2xl border border-dashed border-emerald-300 p-6 text-center text-xs text-emerald-800">All finance records are balanced and reconciled.</p>}</div>
      </section>

      {/* SEARCHABLE MASTER BOOKINGS TOOLBAR */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs font-mono">
          <span className="text-stone-500 mr-1">Status Filter:</span>
          {["ALL", "CONFIRMED", "CANCELLED", "COMPLETED"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                statusFilter === s
                  ? "bg-amber-500 text-stone-950 shadow-sm"
                  : "bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search ref, traveler, supplier code, product code, supplier name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:bg-white"
          />
        </form>
      </div>

      {/* MASTER BOOKINGS TABLE */}
      <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 uppercase tracking-wider">
                <th className="py-4 px-6">Booking Ref & Traveler</th>
                <th className="py-4 px-4">Product & Type</th>
                <th className="py-4 px-4">Supplier & Driver</th>
                <th className="py-4 px-4">Gross Amount & Net Payout</th>
                <th className="py-4 px-4">Payment & Booking Status</th>
                <th className="py-4 px-6 text-right">Admin Overrides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-stone-500">
                    Loading master platform bookings database...
                  </td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-stone-500">
                    No bookings found matching query.
                  </td>
                </tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-stone-50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-bold text-amber-800 text-sm">{b.ref || b.id}</div>
                      <div className="text-stone-900 font-sans text-xs mt-0.5">{b.traveler_name}</div>
                      <div className="text-[10px] text-stone-500">{b.traveler_phone} &bull; {b.traveler_email}</div>
                    </td>

                    <td className="py-4 px-4">
                      <div className="font-bold text-stone-900 font-sans line-clamp-1">{b.product_title || b.product_type}</div>
                      <div className="text-[10px] text-stone-500 mt-0.5">
                        Date: {b.activity_date || b.travel_date || "2026-08-15"}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div className="font-bold text-stone-900 font-sans">{b.supplier_name || "Awadh Express Airport Cabs"}</div>
                      {b.supplier_assignment_status && (
                        <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${b.supplier_assignment_status === "SUPPLIER_ACCEPTED" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : b.supplier_assignment_status === "AWAITING_ACCEPTANCE" ? "border-amber-300 bg-amber-100 text-amber-900" : b.supplier_assignment_status === "MANUAL_REVIEW_REQUIRED" ? "border-rose-300 bg-rose-100 text-rose-900" : "border-stone-300 bg-stone-100 text-stone-700"}`} title={b.supplier_assignment_reason || "Supplier assignment"}>
                          {b.supplier_assignment_status === "AWAITING_ACCEPTANCE" ? `Awaiting supplier · round ${b.assignment_round || 1}` : b.supplier_assignment_status === "SUPPLIER_ACCEPTED" ? `Accepted${b.supplier_assignment_score != null ? ` · ${b.supplier_assignment_score}/100` : ""}` : b.supplier_assignment_status.replaceAll("_", " ")}
                        </div>
                      )}
                      <div className="text-[10px] text-amber-800 mt-0.5">
                        Driver: {b.driver_name || "Assigned"} ({b.vehicle_number || "Cab"})
                      </div>
                    </td>

                    <td className="py-4 px-4 font-mono">
                      <div className="text-emerald-700 font-bold">₹{(b.amount_inr || b.total_amount || 0).toLocaleString()}</div>
                      <div className="text-[10px] text-stone-500">
                        Comm: ₹{(b.commission_amount || 0).toLocaleString()} | Payout: ₹{(b.supplier_payout_amount || 0).toLocaleString()}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] border font-bold ${
                          b.status === "confirmed" || b.status === "CONFIRMED"
                            ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                            : b.status === "CANCELLED" || b.status === "cancelled"
                            ? "bg-rose-100 text-rose-900 border-rose-300"
                            : "bg-stone-100 text-stone-700 border-stone-300"
                        }`}>
                          {b.status}
                        </span>

                        <span className={`inline-block ml-1 px-2 py-0.5 rounded text-[10px] border font-bold ${
                          b.payment_status === "PAID"
                            ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                            : b.payment_status === "REFUNDED"
                            ? "bg-amber-100 text-amber-900 border-amber-300"
                            : "bg-stone-100 text-stone-700 border-stone-300"
                        }`}>
                          {b.payment_status}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedBooking(b);
                          setOverrideModalOpen(true);
                        }}
                        className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl font-bold transition-all text-xs shadow-sm"
                      >
                        Override Controls
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OVERRIDE ACTIONS MODAL */}
      {overrideModalOpen && selectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-white border border-stone-200 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div>
                <span className="text-[10px] font-mono bg-rose-100 text-rose-900 border border-rose-300 px-2 py-0.5 rounded uppercase font-bold">
                  ADMIN STATUS OVERRIDE
                </span>
                <h3 className="text-lg font-serif font-bold text-stone-900 mt-1">
                  Booking #{selectedBooking.ref || selectedBooking.id}
                </h3>
              </div>
              <button
                onClick={() => setOverrideModalOpen(false)}
                className="p-2 bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <span className="text-stone-700 block font-bold">Select Admin Override Action:</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "FORCE_CANCEL", label: "Force Cancel Booking", color: "hover:border-rose-300" },
                  { id: "REFUND", label: "Issue Full Refund", color: "hover:border-amber-300" },
                  { id: "REASSIGN_SUPPLIER", label: "Re-assign Vendor", color: "hover:border-amber-300" },
                  { id: "REASSIGN_DRIVER", label: "Manual Driver Dispatch", color: "hover:border-emerald-300" }
                ].map((act) => (
                  <button
                    key={act.id}
                    onClick={() => setOverrideAction(act.id)}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      overrideAction === act.id
                        ? "bg-amber-500 text-stone-950 border-amber-500 font-bold shadow-sm"
                        : `bg-[#FAF9F6] text-stone-800 border-stone-200 ${act.color}`
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Override Form Fields */}
            {overrideAction === "REFUND" && (
              <div className="space-y-2 text-xs font-mono">
                <label className="text-stone-700 block">Refund Justification / Notes:</label>
                <input
                  type="text"
                  placeholder="e.g. Flight cancelled / Supplier vehicle breakdown."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-3 text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>
            )}

            {overrideAction === "REASSIGN_SUPPLIER" && (
              <div className="space-y-2 text-xs font-mono">
                <label className="text-stone-700 block">Select Approved Vendor for Re-assignment:</label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-3 text-stone-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                >
                  <option value="">-- Choose Vendor --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.company_name} ({s.city})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {overrideAction === "REASSIGN_DRIVER" && (
              <div className="space-y-3 text-xs font-mono">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-stone-700 block">Driver Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Vikram Sharma"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-stone-700 block">Driver Phone</label>
                    <input
                      type="text"
                      placeholder="+919876543210"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-stone-700 block">Vehicle Number</label>
                  <input
                    type="text"
                    placeholder="e.g. UP-32-DN-9988"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-2.5 text-stone-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>
            )}

            <div className="pt-3 flex justify-end gap-3 border-t border-stone-200">
              <button
                onClick={() => setOverrideModalOpen(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>

              <button
                disabled={actionLoading || !overrideAction}
                onClick={handleExecuteOverride}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-xs flex items-center gap-2 disabled:opacity-50 shadow-sm"
              >
                <Send className="w-3 h-3" /> Execute Override Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
