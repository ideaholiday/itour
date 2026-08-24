import React from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BarChart3, Bell, CalendarCheck, ChevronDown, ExternalLink, FileCheck, LayoutDashboard, LogOut, Map, PlusCircle, Store, Users } from "lucide-react";
import IdeaHolidayLogo from "../IdeaHolidayLogo.jsx";
import { useAuth } from "../../lib/auth.jsx";
import SupplierNotificationBell from "./SupplierNotificationBell.jsx";

export default function SupplierHeaderNav({ supplierData, activeTab }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const supplier = supplierData?.supplier || {};
  const requestedPanel = searchParams.get("panel");
  const pendingCount = supplierData?.bookings?.filter((booking) => booking.status === "pending_confirmation")?.length || 0;
  const isKybPending = supplier.kyb_status && supplier.kyb_status !== "APPROVED";

  const navLinks = [
    ["DASHBOARD", "Overview", "/supplier/dashboard", LayoutDashboard],
    ["BOOKINGS", "Bookings", "/supplier/bookings", CalendarCheck, pendingCount || null],
    ["BUILDER", "Listings", "/supplier/dashboard?panel=listings", PlusCircle, supplierData?.products?.length || null],
    ["FLEET", "Fleet", "/supplier/dashboard?panel=fleet", Users, supplierData?.drivers?.length || null],
    ["ANALYTICS", "Analytics", "/supplier/dashboard?panel=analytics", BarChart3],
    ["KYB", "Compliance", "/supplier/dashboard?panel=compliance", FileCheck, isKybPending ? (supplier.kyb_status === "REJECTED" ? "Rejected" : "Action") : null]
  ];

  const isCurrent = (id, path) => {
    if (id === "FLEET" || id === "KYB" || id === "BUILDER" || id === "ANALYTICS") return requestedPanel === (id === "BUILDER" ? "listings" : id.toLowerCase());
    if (id === "DASHBOARD") return location.pathname === "/supplier" || (location.pathname === "/supplier/dashboard" && !requestedPanel);
    return location.pathname === path;
  };

  return (
    <div className="sticky top-0 z-40 -mx-4 -mt-8 mb-7 border-b border-stone-200 bg-white/95 px-4 shadow-sm backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex h-[72px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/supplier/dashboard" className="shrink-0"><IdeaHolidayLogo className="text-[1.35rem]" /></Link>
            <span className="hidden h-7 w-px bg-stone-200 sm:block" />
            <div className="hidden min-w-0 sm:block">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="truncate text-sm font-bold text-stone-900">{supplier.company_name || "Partner workspace"}</span>
                {supplier.id && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-600 border border-stone-200" title="Your Unique Supplier ID">
                    ID: {supplier.id}
                  </span>
                )}
              </div>
              <span className="block text-[10px] font-bold uppercase tracking-[.14em] text-emerald-700">{supplier.kyb_status || "Approved"} partner</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 hover:text-stone-900 md:flex">View marketplace <ExternalLink className="h-3.5 w-3.5" /></Link>
            {supplier.id && <SupplierNotificationBell supplierId={supplier.id} />}
            <button onClick={() => navigate("/supplier/bookings")} className="relative rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-stone-600 hover:text-stone-900" aria-label="Open booking notifications"><Bell className="h-4 w-4" />{pendingCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">{pendingCount}</span>}</button>
            <div className="group relative"><button className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-left" aria-label="Open partner account menu"><span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500 text-xs font-black text-stone-950">{(user?.name || supplier.contact_name || "P")[0]}</span><span className="hidden max-w-28 truncate text-xs font-bold text-stone-800 lg:block">{user?.name || supplier.contact_name || "Partner"}</span><ChevronDown className="h-3.5 w-3.5 text-stone-400" /></button><div className="invisible absolute right-0 top-full mt-2 w-48 rounded-xl border border-stone-200 bg-white p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"><button onClick={() => { logout(); navigate("/login"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"><LogOut className="h-4 w-4" />Sign out</button></div></div>
          </div>
        </div>
        <nav className="hide-scrollbar flex gap-1 overflow-x-auto pb-2" aria-label="Supplier workspace">
          {navLinks.map(([id, label, path, Icon, badge]) => {
            const selected = activeTab === id || isCurrent(id, path);
            return <Link key={id} to={path} aria-current={selected ? "page" : undefined} className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${selected ? "bg-amber-500 text-stone-950 shadow-sm" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-stone-200 bg-white"}`}><Icon className="h-4 w-4" />{label}{badge ? <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${selected ? "bg-stone-950/15" : "bg-stone-100 text-stone-700"}`}>{badge}</span> : null}</Link>;
          })}
        </nav>
      </div>
    </div>
  );
}
