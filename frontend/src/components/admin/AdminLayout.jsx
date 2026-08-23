import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth.jsx";
import { authHeaders } from "../../lib/api.js";
import IdeaHolidayLogo from "../IdeaHolidayLogo.jsx";
import {
  Users,
  Package,
  DollarSign,
  Shield,
  Activity,
  LogOut,
  Bell,
  RefreshCw,
  Sparkles,
  Search,
  CheckCircle,
  Clock,
  AlertTriangle,
  LayoutDashboard,
  MapPinned,
  Star
} from "lucide-react";

export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const fetchGlobalMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const res = await fetch("/api/admin/metrics", { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Metrics unavailable");
      setMetrics(data.metrics);
    } catch (err) {
      console.error("Failed to fetch global admin metrics", err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    fetchGlobalMetrics();
  }, [location.pathname]);

  const navItems = [
    {
      path: "/admin",
      exact: true,
      label: "Overview",
      icon: LayoutDashboard,
      badge: null,
      badgeColor: ""
    },
    {
      path: "/admin/analytics",
      label: "Analytics",
      icon: Activity,
      badge: null,
      badgeColor: ""
    },
    {
      path: "/admin/suppliers",
      label: "Suppliers",
      icon: Users,
      badge: metrics?.pendingKyb > 0 ? `${metrics.pendingKyb} Pending` : null,
      badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30"
    },
    {
      path: "/admin/products",
      label: "Listings",
      icon: Package,
      badge: metrics?.pendingProducts > 0 ? `${metrics.pendingProducts} Review` : null,
      badgeColor: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
    },
    {
      path: "/admin/finance",
      label: "Finance",
      icon: DollarSign,
      badge: metrics?.pendingPayouts > 0 ? `₹${metrics.pendingPayouts.toLocaleString()}` : null,
      badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    },
    {
      path: "/admin/quality",
      label: "Quality & Reviews",
      icon: Star,
      badge: metrics?.pendingReviews > 0 ? `${metrics.pendingReviews} New` : null,
      badgeColor: "bg-amber-500/20 text-amber-600 border-amber-500/30"
    }
  ];

  return (
    <div className="dashboard-grid flex min-h-screen flex-col bg-[#FAF9F6] font-sans text-stone-900">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* Brand & Title */}
          <div className="flex items-center gap-4">
            <Link to="/admin" className="flex items-center gap-3">
              <div>
                <IdeaHolidayLogo className="text-xl" />
                <span className="block font-mono text-[9px] uppercase tracking-[.16em] text-stone-500">
                  Marketplace control
                </span>
              </div>
            </Link>
          </div>

          {/* Quick Platform Metrics Overview Pill Bar */}
          <div className="hidden lg:flex items-center gap-4 bg-[#FAF9F6] border border-stone-200 rounded-2xl px-4 py-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-stone-500">GMV:</span>
              <span className="text-emerald-700 font-bold">
                ₹{loadingMetrics ? "..." : (metrics?.grossRevenue || 0).toLocaleString()}
              </span>
            </div>
            <div className="h-4 w-px bg-stone-200" />
            <div className="flex items-center gap-2">
              <span className="text-stone-500">Net Commission:</span>
              <span className="text-amber-800 font-bold">
                ₹{loadingMetrics ? "..." : (metrics?.totalCommission || 0).toLocaleString()}
              </span>
            </div>
            <div className="h-4 w-px bg-stone-200" />
            <div className="flex items-center gap-2">
              <span className="text-stone-500">Pending KYB:</span>
              <span className={`font-bold ${metrics?.pendingKyb > 0 ? "text-amber-700" : "text-stone-700"}`}>
                {metrics?.pendingKyb || 0}
              </span>
            </div>
          </div>

          {/* Admin User Profile & Controls */}
          <div className="flex items-center gap-3">
            <Link to="/" className="hidden rounded-xl px-3 py-2 text-xs font-bold text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 md:block">View site</Link>
            <button
              onClick={fetchGlobalMetrics}
              title="Refresh Metrics"
              className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition-all border border-stone-200"
            >
              <RefreshCw className={`w-4 h-4 ${loadingMetrics ? "animate-spin text-amber-600" : ""}`} />
            </button>

            <div className="flex items-center gap-3 bg-[#FAF9F6] border border-stone-200 rounded-2xl px-3 py-1.5">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-800 font-bold text-xs">
                {user?.name?.[0] || "A"}
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-xs font-bold text-stone-800 block leading-tight">{user?.name || "Admin User"}</span>
                <span className="block font-mono text-[9px] uppercase tracking-wider text-emerald-700">Administrator</span>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub Navigation Bar Tabs */}
        <div className="bg-[#FAF9F6] border-t border-stone-200 px-4 sm:px-6 lg:px-8">
          <div className="hide-scrollbar mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 py-4 px-6 text-center text-xs font-mono text-stone-500">
        Idea Holiday Admin Operations &bull; Secure administrator access
      </footer>
    </div>
  );
}
