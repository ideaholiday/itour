import React, { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Search,
  Heart,
  User,
  Calendar,
  Store,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";

export function MobileBottomNav({ user }) {
  const location = useLocation();
  const currentPath = location.pathname;
  const userRole = String(user?.role || user?.user_metadata?.role || "").toUpperCase();

  const roleItem =
    userRole === "SUPPLIER"
      ? { label: "Portal", to: "/supplier", icon: Store }
      : userRole === "ADMIN"
      ? { label: "Admin", to: "/admin", icon: LayoutDashboard }
      : userRole === "OPS" || userRole === "STAFF" || userRole === "DRIVER"
      ? { label: "Ops", to: "/ops", icon: ShieldCheck }
      : { label: "Saved", to: "/wishlist", icon: Heart };

  const navItems = [
    { label: "Home", to: "/", icon: Home },
    { label: "Search", to: "/search", icon: Search },
    roleItem,
    { label: "My Trips", to: "/my-bookings", icon: Calendar },
    { label: user ? "Profile" : "Login", to: user ? "/profile" : "/login", icon: User },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-950/95 backdrop-blur-xl border-t border-stone-150 dark:border-stone-800 safe-area-inset-bottom shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-center justify-around px-1 py-1.5">
        {navItems.map((item) => {
          const isActive =
            item.to === "/"
              ? currentPath === "/"
              : currentPath.startsWith(item.to);
          const Icon = item.icon;

          return (
            <Link
              key={item.to}
              to={item.to}
              className="relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all duration-200"
            >
              {/* Active background pill */}
              {isActive && (
                <span className="absolute inset-0 rounded-xl bg-amber-50 dark:bg-amber-900/20" />
              )}

              <span className="relative z-10">
                <Icon
                  className={`w-5 h-5 transition-all duration-200 ${
                    isActive
                      ? "text-amber-600 dark:text-amber-400 scale-110"
                      : "text-stone-400 dark:text-stone-500"
                  }`}
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
              </span>

              <span
                className={`relative z-10 text-[10px] font-semibold transition-colors duration-200 ${
                  isActive
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-stone-400 dark:text-stone-500"
                }`}
              >
                {item.label}
              </span>

              {/* Active dot indicator */}
              {isActive && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-1 w-4 rounded-full bg-amber-500" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileBottomNav;
