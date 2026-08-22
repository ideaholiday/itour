import React, { useState } from "react";
import { Users, X, Plus, Phone, Car, Shield, Star, AlertTriangle, Check, Search } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

export default function ManageFleetModal({ isOpen, onClose, supplierId, drivers = [], onRefresh }) {
  const [activeTab, setActiveTab] = useState("LIST"); // 'LIST' or 'ADD'
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehicleModel, setVehicleModel] = useState("Swift Dzire VXI (Sedan)");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingDriverId, setUpdatingDriverId] = useState("");

  if (!isOpen) return null;

  const handleAddDriver = async (e) => {
    e.preventDefault();
    if (!driverName || !driverPhone || !vehicleNumber) {
      setError("Please fill in Driver Name, Phone Number, and Vehicle Plate Number.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/suppliers/${supplierId}/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          driverName,
          driverPhone,
          vehicleModel,
          vehicleNumber,
          licenseNumber
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Driver ${driverName} added to fleet!`);
        setDriverName("");
        setDriverPhone("");
        setVehicleNumber("");
        setLicenseNumber("");
        setActiveTab("LIST");
        if (onRefresh) onRefresh();
      } else {
        setError(data.error || "Failed to add driver");
      }
    } catch (err) {
      setError("Network error adding driver");
    } finally {
      setLoading(false);
    }
  };

  const handleFleetStatus = async (driverId, status) => {
    setUpdatingDriverId(driverId);
    setError("");
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/drivers/${driverId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update fleet status");
      setSuccessMsg(data.message);
      onRefresh?.();
    } catch (err) {
      setError(err.message || "Could not update fleet status");
    } finally {
      setUpdatingDriverId("");
    }
  };

  const filteredDrivers = drivers.filter(
    (d) =>
      d.driver_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.vehicle_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.driver_phone.includes(searchTerm)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white border border-stone-200 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-[#FAF9F6]">
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-100 border border-amber-300 p-2 rounded-2xl text-amber-800">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-stone-900">Supplier Fleet & Driver Roster</h2>
              <p className="text-xs text-stone-500">Manage active chauffeurs, assigned vehicles & trip dispatch availability</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-6 pt-4 flex items-center justify-between border-b border-stone-200 bg-[#FAF9F6]/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("LIST")}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                activeTab === "LIST"
                  ? "border-amber-500 text-amber-900"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              Fleet Drivers List ({drivers.length})
            </button>
            <button
              onClick={() => setActiveTab("ADD")}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === "ADD"
                  ? "border-amber-500 text-amber-900"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add New Driver
            </button>
          </div>

          {activeTab === "LIST" && (
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Search driver / vehicle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white border border-stone-300 text-stone-900 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-amber-500 font-sans"
              />
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-rose-50 border border-rose-300 text-rose-800 text-xs p-3 rounded-2xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs p-3 rounded-2xl flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                {successMsg}
              </span>
              <button onClick={() => setSuccessMsg("")} className="text-[10px] font-bold underline">Dismiss</button>
            </div>
          )}

          {activeTab === "LIST" ? (
            <div className="space-y-3">
              {filteredDrivers.length === 0 ? (
                <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-8 text-center space-y-3">
                  <Car className="w-8 h-8 text-stone-400 mx-auto" />
                  <p className="text-xs font-mono text-stone-500">No fleet drivers found matching your search.</p>
                  <button
                    onClick={() => setActiveTab("ADD")}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs px-4 py-2 rounded-xl"
                  >
                    + Register First Driver
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredDrivers.map((d) => (
                    <div
                      key={d.id}
                      className="bg-[#FAF9F6] border border-stone-200 p-4 rounded-2xl space-y-3 relative hover:border-amber-400 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-white border border-stone-200 flex items-center justify-center text-amber-800 font-bold text-sm font-mono shadow-sm">
                            {d.driver_name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                              {d.driver_name}
                              <span className="flex items-center gap-1 text-[11px] text-amber-700 font-bold">
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                {d.rating || 4.9}
                              </span>
                            </h4>
                            <p className="text-xs text-stone-500 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-amber-600" />
                              {d.driver_phone}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            d.status === "ASSIGNED"
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : "bg-emerald-100 text-emerald-900 border-emerald-300"
                          }`}
                        >
                          {d.status || "AVAILABLE"}
                        </span>
                      </div>

                      <div className="bg-white border border-stone-200 p-2.5 rounded-xl space-y-1 text-xs">
                        <div className="flex justify-between text-stone-700">
                          <span className="text-stone-500">Vehicle:</span>
                          <span className="font-bold text-stone-900">{d.vehicle_model}</span>
                        </div>
                        <div className="flex justify-between text-stone-700">
                          <span className="text-stone-500">Plate Number:</span>
                          <span className="font-mono font-bold text-stone-900">{d.vehicle_number}</span>
                        </div>
                        {d.license_number && (
                          <div className="flex justify-between text-stone-500 text-[11px]">
                            <span>License No:</span>
                            <span className="font-mono">{d.license_number}</span>
                          </div>
                        )}
                      </div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Fleet availability
                        <select value={d.status || "AVAILABLE"} disabled={updatingDriverId === d.id} onChange={(event) => handleFleetStatus(d.id, event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-xs text-stone-900 outline-none focus:border-amber-500 disabled:opacity-50">
                          <option value="AVAILABLE">Available</option>
                          <option value="UNAVAILABLE">Unavailable</option>
                          <option value="MAINTENANCE">Vehicle maintenance</option>
                          <option value="INACTIVE">Inactive</option>
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Add Driver Form */
            <form onSubmit={handleAddDriver} className="space-y-4 bg-[#FAF9F6] p-5 rounded-2xl border border-stone-200">
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                Register New Chauffeur & Commercial Vehicle
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Driver Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mohd. Irfan Khan"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full bg-white border border-stone-300 text-stone-900 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Driver WhatsApp Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +919839033445"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    className="w-full bg-white border border-stone-300 text-stone-900 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Vehicle Category / Model *</label>
                  <select
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    className="w-full bg-white border border-stone-300 text-stone-900 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Swift Dzire VXI (Sedan)">Swift Dzire VXI (Sedan - 4 Pax)</option>
                    <option value="Toyota Etios AC (Sedan)">Toyota Etios AC (Sedan - 4 Pax)</option>
                    <option value="Maruti Ertiga ZXI (SUV)">Maruti Ertiga ZXI (SUV - 6 Pax)</option>
                    <option value="Toyota Innova Crysta VIP (Luxury SUV)">Toyota Innova Crysta VIP (Luxury SUV - 6 Pax)</option>
                    <option value="Force Tempo Traveller 12S">Force Tempo Traveller (12 Seater)</option>
                    <option value="Commercial AC Bus (26S)">Commercial AC Bus (26 Seater)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Vehicle Registration Plate No. *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UP-32-DN-4821"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full bg-white border border-stone-300 text-stone-900 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500 font-mono uppercase"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">Commercial Badge / DL License No. (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. UP3220200012345"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    className="w-full bg-white border border-stone-300 text-stone-900 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("LIST")}
                  className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs px-4 py-2.5 rounded-xl transition border border-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-sm"
                >
                  {loading ? "Adding Driver..." : "Save Fleet Driver"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 bg-[#FAF9F6] flex justify-end">
          <button
            onClick={onClose}
            className="bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs px-4 py-2 rounded-xl transition border border-stone-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
