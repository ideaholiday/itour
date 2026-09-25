import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  DownloadCloud,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";
import SupplierHeaderNav from "../../components/supplier/SupplierHeaderNav.jsx";

const CHANNEL_DEFS = [
  {
    id: "BOKUN",
    name: "Bókun",
    company: "Tripadvisor Company",
    desc: "Live availability and bookings through Bókun's OCTo API. Create the key in Bókun: Settings → Connectivity → API keys, with OCTo enabled.",
    logoBg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    // ADR 046: one OCTo API key (bearer token), optionally limited to one vendor.
    fields: [
      { key: "apiKey", label: "OCTo API Key", placeholder: "From Bókun → Settings → Connectivity → API keys", type: "password", required: true },
      { key: "vendorId", label: "Vendor ID (Optional)", placeholder: "Limits the key to one Bókun vendor" },
      { key: "endpointUrl", label: "Endpoint (Optional)", placeholder: "Empty = live. Test: https://api.bokuntest.com/octo/v1" },
    ],
  },
  {
    id: "FAREHARBOR",
    name: "FareHarbor",
    company: "Booking Holdings",
    desc: "Connect FareHarbor items, schedules, and custom pricing variants.",
    logoBg: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    fields: [
      { key: "appKey", label: "Application Key", placeholder: "e.g. fh_app_...", required: true },
      { key: "userKey", label: "User Key", placeholder: "e.g. fh_usr_...", type: "password", required: true },
      { key: "companyShortname", label: "Company Shortname", placeholder: "e.g. goaadventures", required: true },
    ],
  },
  {
    id: "BOOKINGKIT",
    name: "Bookingkit",
    company: "ResTech Europe",
    desc: "Synchronize outdoor activities, guided circuits, and ticketing quotas.",
    logoBg: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "e.g. bkit_...", required: true },
      { key: "apiKey", label: "API Key", placeholder: "••••••••", type: "password", required: true },
      { key: "vendorId", label: "Vendor ID", placeholder: "e.g. vend_1002" },
    ],
  },
  {
    id: "TOURCMS",
    name: "Palisis / TourCMS",
    company: "Palisis Group",
    desc: "Ingest sightseeing, hop-on hop-off buses, and multi-hub day tours.",
    logoBg: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    fields: [
      { key: "marketplaceId", label: "Marketplace ID", placeholder: "e.g. 10293", required: true },
      { key: "apiKey", label: "API Key", placeholder: "••••••••", type: "password", required: true },
      { key: "channelId", label: "Channel ID", placeholder: "e.g. 5" },
    ],
  },
  {
    id: "ACTIVITAR",
    name: "Activitar",
    company: "Adventure & Safari ResTech",
    desc: "Manage safari permits, slot capacities, and high-demand outdoor activities.",
    logoBg: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "••••••••", type: "password", required: true },
      { key: "supplierId", label: "Supplier / Host ID", placeholder: "e.g. act_sup_99", required: true },
    ],
  },
  {
    id: "ANCHOR",
    name: "Anchor",
    company: "Ticketing & Ferry OS",
    desc: "Connect water transit, ferry crossings, and attraction admissions.",
    logoBg: "bg-teal-500/10 text-teal-600 border-teal-500/20",
    fields: [
      { key: "apiKey", label: "API Token", placeholder: "••••••••", type: "password", required: true },
      { key: "orgId", label: "Organization ID", placeholder: "e.g. anc_org_...", required: true },
    ],
  },
  {
    id: "OCTO_GENERIC",
    name: "Standard OCTo Endpoint",
    company: "Open Connectivity for Tourism",
    desc: "Connect ANY reservation system exposing standard OCTo v1 capabilities.",
    logoBg: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    fields: [
      { key: "endpointUrl", label: "OCTo Endpoint Base URL", placeholder: "https://api.yourprovider.com/octo", required: true },
      { key: "token", label: "Bearer API Token", placeholder: "e.g. octo_token_...", type: "password" },
    ],
  },
];

export default function SupplierChannelManagerPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  // Connection Modal
  const [activeChannelDef, setActiveChannelDef] = useState(null);
  const [formData, setFormData] = useState({});
  const [connecting, setConnecting] = useState(false);

  // Fetch Products Modal
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [remoteProducts, setRemoteProducts] = useState([]);
  const [fetchingProducts, setFetchingProducts] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [importing, setImporting] = useState(false);

  const loadConnections = async () => {
    try {
      setLoading(true);
      const res = await api.get("/supplier-channels");
      setConnections(res.channels || []);
    } catch (err) {
      showToast(err.message || "Could not load channel integrations", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const handleOpenConnect = (def) => {
    setActiveChannelDef(def);
    setFormData({});
  };

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    if (!activeChannelDef) return;

    try {
      setConnecting(true);
      await api.post("/supplier-channels", {
        channelName: activeChannelDef.id,
        channelTitle: activeChannelDef.name,
        endpointUrl: formData.endpointUrl || null,
        credentials: formData,
      });

      showToast(`Connected ${activeChannelDef.name} successfully!`, "success");
      setActiveChannelDef(null);
      loadConnections();
    } catch (err) {
      showToast(err.message || "Failed to connect channel", "error");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (conn) => {
    if (!window.confirm(`Disconnect ${conn.channel_title}? External sync will be paused.`)) return;
    try {
      await api.delete(`/supplier-channels/${conn.id}`);
      showToast("Channel disconnected", "info");
      loadConnections();
    } catch (err) {
      showToast(err.message || "Could not disconnect channel", "error");
    }
  };

  const handleFetchProducts = async (conn) => {
    setSelectedConnection(conn);
    setFetchingProducts(true);
    setSelectedProductIds(new Set());

    try {
      const res = await api.get(`/supplier-channels/${conn.id}/fetch-products`);
      setRemoteProducts(res.products || []);
      // Pre-select products that are not yet imported
      const unimported = new Set(res.products.filter((p) => !p.isImported).map((p) => p.externalId));
      setSelectedProductIds(unimported);
    } catch (err) {
      showToast(err.message || "Could not fetch remote products", "error");
      setSelectedConnection(null);
    } finally {
      setFetchingProducts(false);
    }
  };

  const toggleProductSelection = (externalId) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  };

  const handleImportSubmit = async () => {
    if (!selectedConnection || selectedProductIds.size === 0) return;

    const toImport = remoteProducts.filter((p) => selectedProductIds.has(p.externalId));

    try {
      setImporting(true);
      const res = await api.post(`/supplier-channels/${selectedConnection.id}/import`, {
        products: toImport,
      });

      showToast(`Successfully imported ${res.importedCount} product(s) into your catalog!`, "success");
      setSelectedConnection(null);
      loadConnections();
    } catch (err) {
      showToast(err.message || "Failed to import products", "error");
    } finally {
      setImporting(false);
    }
  };

  const connectedMap = new Map(connections.map((c) => [c.channel_name, c]));

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100">
      <SupplierHeaderNav activeTab="channels" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-8 border-b border-stone-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-amber-500 font-semibold mb-1">
              <Zap className="w-4 h-4" />
              <span>Multi-Channel ResTech & OCTo Hub</span>
            </div>
            <h1 className="text-3xl font-display font-bold text-white">
              Booking Channel Integrations
            </h1>
            <p className="mt-1 text-sm text-stone-400 max-w-2xl">
              Import products and synchronize real-time seat availability with external reservation systems including Bókun, FareHarbor, Bookingkit, and OCTo providers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadConnections}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-stone-700 bg-stone-800 text-xs font-semibold text-stone-300 hover:bg-stone-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>

        {/* OCTo Provider Status Banner */}
        <div className="mt-8 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-950/30 via-stone-900 to-stone-900 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Idea Holiday OCTo API Server Active</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  OCTo v1 COMPLIANT
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-1">
                Your listings on <span className="text-amber-300">supply.ideaholiday.in</span> are automatically available via our standard OCTo endpoints for OTAs and partners at <code className="text-stone-300 font-mono">/api/octo/products</code>.
              </p>
            </div>
          </div>
          <a
            href="/api/octo/capabilities"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300"
          >
            <span>View OCTo Capabilities</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Channels Grid */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CHANNEL_DEFS.map((def) => {
            const conn = connectedMap.get(def.id);
            const isConnected = Boolean(conn && conn.status === "ACTIVE");

            return (
              <div
                key={def.id}
                className={`rounded-2xl border ${
                  isConnected ? "border-emerald-500/40 bg-stone-900/90 shadow-lg shadow-emerald-950/20" : "border-stone-800 bg-stone-900/50"
                } p-6 flex flex-col justify-between transition-all hover:border-stone-700`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className={`p-2.5 rounded-xl border ${def.logoBg} font-bold text-xs uppercase tracking-wider`}>
                      {def.name.slice(0, 3)}
                    </div>
                    {isConnected ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Connected</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-800 text-stone-400 border border-stone-700">
                        Available
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-white">{def.name}</h3>
                  <div className="text-xs text-amber-500 font-medium mb-2">{def.company}</div>
                  <p className="text-xs text-stone-400 leading-relaxed mb-4">{def.desc}</p>

                  {isConnected && conn.last_sync_at && (
                    <div className="mb-4 pt-3 border-t border-stone-800 text-[11px] text-stone-400 flex items-center justify-between">
                      <span>Last sync:</span>
                      <span className="font-mono text-stone-300">
                        {new Date(conn.last_sync_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-stone-800/80 flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <button
                        onClick={() => handleFetchProducts(conn)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 text-xs font-semibold hover:from-amber-400 hover:to-amber-500 transition-all cursor-pointer"
                      >
                        <DownloadCloud className="w-4 h-4" />
                        <span>Fetch & Import</span>
                      </button>
                      <button
                        onClick={() => handleDisconnect(conn)}
                        title="Disconnect channel"
                        className="p-2.5 rounded-xl border border-stone-700 bg-stone-800 text-stone-400 hover:text-red-400 hover:border-red-500/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleOpenConnect(def)}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-stone-700 bg-stone-800 hover:bg-stone-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>Connect {def.name}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Connect Channel Modal */}
      {activeChannelDef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-stone-950 border border-stone-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-stone-800 mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">Connect {activeChannelDef.name}</h3>
                <p className="text-xs text-stone-400">{activeChannelDef.company}</p>
              </div>
              <button
                onClick={() => setActiveChannelDef(null)}
                className="text-stone-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConnectSubmit} className="space-y-4">
              {activeChannelDef.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-stone-300 uppercase tracking-wider mb-1">
                    {f.label} {f.required && <span className="text-amber-500">*</span>}
                  </label>
                  <input
                    type={f.type || "text"}
                    required={f.required}
                    value={formData[f.key] || ""}
                    onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full rounded-xl border border-stone-700 bg-stone-900 px-3.5 py-2.5 text-xs text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              ))}

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-800 mt-6">
                <button
                  type="button"
                  onClick={() => setActiveChannelDef(null)}
                  className="px-4 py-2.5 rounded-xl border border-stone-700 text-xs font-semibold text-stone-300 hover:bg-stone-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connecting}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {connecting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Test Connection & Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fetch & Import Products Modal */}
      {selectedConnection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-stone-950 border border-stone-800 rounded-2xl w-full max-w-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-stone-800 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <DownloadCloud className="w-5 h-5 text-amber-500" />
                  <span>Import Products from {selectedConnection.channel_title}</span>
                </h3>
                <p className="text-xs text-stone-400">
                  Select experiences to import into Idea Holiday and publish on ideaholiday.in
                </p>
              </div>
              <button
                onClick={() => setSelectedConnection(null)}
                className="text-stone-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {fetchingProducts ? (
              <div className="py-16 text-center text-stone-400 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
                <p className="text-sm">Connecting to {selectedConnection.channel_title} catalog...</p>
              </div>
            ) : remoteProducts.length === 0 ? (
              <div className="py-12 text-center text-stone-400">
                <AlertCircle className="w-8 h-8 text-stone-500 mx-auto mb-2" />
                <p className="text-sm">No remote products found on this channel account.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 my-2">
                {remoteProducts.map((p) => {
                  const isChecked = selectedProductIds.has(p.externalId);
                  return (
                    <div
                      key={p.externalId}
                      onClick={() => !p.isImported && toggleProductSelection(p.externalId)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-4 ${
                        p.isImported
                          ? "border-stone-800 bg-stone-900/30 opacity-70 cursor-not-allowed"
                          : isChecked
                          ? "border-amber-500/60 bg-amber-500/5 shadow-sm"
                          : "border-stone-800 bg-stone-900/60 hover:border-stone-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked || p.isImported}
                        disabled={p.isImported}
                        onChange={() => {}}
                        className="mt-1 h-4 w-4 rounded border-stone-700 text-amber-500 focus:ring-amber-500"
                      />

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{p.title}</h4>
                          {p.isImported && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-800 text-stone-400 border border-stone-700">
                              Already in Catalog
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-400 mt-1 line-clamp-2">{p.shortDesc}</p>

                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-stone-300">
                          <span className="font-semibold text-amber-400">₹{p.priceInr?.toLocaleString()}</span>
                          <span>•</span>
                          <span>{p.city}</span>
                          <span>•</span>
                          <span>{p.durationHours}h Duration</span>
                          <span>•</span>
                          <span className="text-stone-400">{p.options?.length || 1} Option(s)</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-4 border-t border-stone-800 flex items-center justify-between mt-auto">
              <div className="text-xs text-stone-400">
                {selectedProductIds.size} product(s) selected
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedConnection(null)}
                  className="px-4 py-2 rounded-xl border border-stone-700 text-xs font-semibold text-stone-300 hover:bg-stone-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportSubmit}
                  disabled={importing || selectedProductIds.size === 0}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {importing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Import Selected to Catalog</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
