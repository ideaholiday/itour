import React, { useState, useEffect } from "react";
import { authHeaders } from "../../lib/api.js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth.jsx";
import IdeaHolidayLogo from "../IdeaHolidayLogo.jsx";
import {
  Activity,
  Radio,
  Bell,
  AlertTriangle,
  RefreshCw,
  Send,
  CheckCircle2,
  PhoneCall,
  Clock,
  Shield,
  Layers,
  MessageSquare,
  Headphones,
  Route,
  LogOut,
  LayoutDashboard
} from "lucide-react";

export default function OpsLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";
  const displayName = user?.name || user?.email || "Operations";
  const initials = displayName.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const signOut = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [isRealtimeActive, setIsRealtimeActive] = useState(true);
  const [openCriticalTaskCount, setOpenCriticalTaskCount] = useState(0);

  const fetchOpsMetrics = async () => {
    try {
      const res = await fetch("/api/ops/live-trips", { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error("Failed to fetch ops metrics", err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchOpenCriticalTasks = async () => {
    try {
      const res = await fetch("/api/ops/tasks", { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setOpenCriticalTaskCount((data.tasks || []).filter((t) => t.status === "OPEN" && t.priority === "CRITICAL").length);
      }
    } catch (err) {
      console.error("Failed to fetch ops task escalations", err);
    }
  };

  useEffect(() => {
    fetchOpsMetrics();
    fetchOpenCriticalTasks();
    // Realtime auto-poll interval every 5s
    const interval = setInterval(() => { fetchOpsMetrics(); fetchOpenCriticalTasks(); }, 5000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const navItems = [
    {
      path: "/ops/live",
      label: "Live 24h Trip Board",
      icon: Activity,
      badge: metrics?.totalSlaBreaches > 0 ? `${metrics.totalSlaBreaches} SLA ALERT` : null,
      badgeColor: "bg-rose-100 text-rose-800 border-rose-300 animate-pulse font-bold"
    },
    {
      path: "/ops/circuits",
      label: "Circuit Changes & Refunds",
      icon: Route,
      badge: null,
      badgeColor: ""
    },
    {
      path: "/ops/support",
      label: "Support & Disputes",
      icon: Headphones,
      badge: null,
      badgeColor: ""
    },
    {
      path: "/ops/notifications",
      label: "WhatsApp Vouchers & Dispatches",
      icon: MessageSquare,
      badge: "WhatsApp API",
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300"
    },
    {
      path: "/ops/tasks",
      label: "Staff Resolution Queue",
      icon: Layers,
      badge: openCriticalTaskCount > 0 ? `${openCriticalTaskCount} CRITICAL` : null,
      badgeColor: "bg-rose-100 text-rose-800 border-rose-300 animate-pulse font-bold"
    }
  ];

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900 font-sans flex flex-col">
      {/* Top Navigation Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-stone-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Brand & Subtitle */}
          <div className="flex items-center gap-4">
            <Link to="/ops/live" className="flex items-center gap-3">
              <div>
                <span className="flex items-center gap-2 leading-tight">
                  <IdeaHolidayLogo className="text-xl" />
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                </span>
                <span className="text-[10px] font-mono text-stone-500 block tracking-wider uppercase">
                  Operations · Ground Fulfillment Engine
                </span>
              </div>
            </Link>
          </div>

          {/* Quick Metrics Bar */}
          <div className="hidden lg:flex items-center gap-4 bg-[#FAF9F6] border border-stone-200 rounded-2xl px-4 py-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-stone-500">Total Active Trips:</span>
              <span className="text-stone-900 font-bold">{loadingMetrics ? "..." : metrics?.totalTrips || 0}</span>
            </div>
            <div className="h-4 w-px bg-stone-200" />
            <div className="flex items-center gap-2">
              <span className="text-stone-500">SLA Alerts:</span>
              <span className={`font-bold ${metrics?.totalSlaBreaches > 0 ? "text-rose-600 animate-pulse" : "text-emerald-700"}`}>
                {loadingMetrics ? "..." : metrics?.totalSlaBreaches || 0} BREACHES
              </span>
            </div>
            <div className="h-4 w-px bg-stone-200" />
            <div className="flex items-center gap-2">
              <span className="text-stone-500">Open Escalations:</span>
              <span className={`font-bold ${openCriticalTaskCount > 0 ? "text-rose-600 animate-pulse" : "text-emerald-700"}`}>
                {openCriticalTaskCount}
              </span>
            </div>
            <div className="h-4 w-px bg-stone-200" />
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-bold">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>REALTIME AUTO-SYNC</span>
            </div>
          </div>

          {/* User & Refresh Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={fetchOpsMetrics}
              title="Refresh Live Feed"
              className="p-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition-all border border-stone-200"
            >
              <RefreshCw className={`w-4 h-4 ${loadingMetrics ? "animate-spin text-amber-600" : ""}`} />
            </button>

            {isAdmin && (
              <Link to="/admin" className="hidden md:flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 hover:text-stone-900">
                <LayoutDashboard className="w-3.5 h-3.5" /> Admin panel
              </Link>
            )}

            <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl px-3 py-1.5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-800 font-bold flex items-center justify-center text-xs">
                {initials || "OP"}
              </div>
              <div className="hidden sm:block text-left text-xs">
                <span className="text-stone-800 block leading-tight font-bold max-w-[160px] truncate">{displayName}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 block">{isAdmin ? "Administrator" : "Operations staff"}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex items-center gap-1.5 p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all text-xs font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Sign out</span>
            </button>
          </div>
        </div>

        {/* Sub Navigation Bar Tabs */}
        <div className="bg-[#FAF9F6] border-t border-stone-200 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || (item.path === "/ops/live" && location.pathname === "/ops");

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-amber-500 text-stone-950 shadow-sm"
                      : "bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-stone-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] border ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 py-4 px-6 text-center text-xs font-mono text-stone-500">
        Idea Holiday Ground Operations Engine &bull; Realtime Subscriptions & SLA Breach Monitoring Active
      </footer>
    </div>
  );
}
