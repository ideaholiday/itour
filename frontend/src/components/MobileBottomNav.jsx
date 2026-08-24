import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Search, Heart, User, Calendar } from "lucide-react";

export function MobileBottomNav({ user }) {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { label: "Home", to: "/", icon: Home },
    { label: "Search", to: "/search", icon: Search },
    { label: "Saved", to: "/wishlist", icon: Heart },
    { label: "My Trips", to: "/my-bookings", icon: Calendar },
    { label: user ? "Profile" : "Login", to: user ? "/profile" : "/login", icon: User },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-stone-900/90 backdrop-blur-lg border-t border-stone-200 dark:border-stone-800 px-3 py-2 shadow-lg">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = currentPath === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? "text-amber-600 dark:text-amber-400 font-bold"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 font-medium"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default MobileBottomNav;
