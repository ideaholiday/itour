import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Heart,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Search,
  ShieldCheck,
  Store,
  Ticket,
  User,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import IdeaHolidayLogo from "./IdeaHolidayLogo.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import CurrencySelector from "./CurrencySelector.jsx";

const NAV_ITEMS = [
  { label: "Experiences", path: "/search?type=DAY_TOUR" },
  { label: "Plan Circuit 🗺️", path: "/circuit-planner" },
  { label: "Travel & Earn ✨", path: "/travel-and-earn" },
];

const CATEGORY_BAR = [
  { emoji: "🏰", label: "Heritage", q: "Heritage" },
  { emoji: "🏖️", label: "Beaches", q: "Beaches" },
  { emoji: "🐅", label: "Wildlife", q: "Wildlife" },
  { emoji: "🍛", label: "Food Walks", q: "Food" },
  { emoji: "🛶", label: "Backwaters", q: "Backwaters" },
  { emoji: "🏔️", label: "Adventure", q: "Adventure" },
  { emoji: "🕌", label: "Spiritual", q: "Spiritual" },
  { emoji: "🎭", label: "Events", q: "Shows" },
  { emoji: "🚗", label: "Day Trips", q: "Day Tours" },
];

// Only claims that are true on the live site: a banner advertising a sale or
// destinations that don't exist is a misleading ad under the e-commerce rules.
const PROMO_MESSAGES = [
  { text: "🎉 Invite friends and earn on every trip they take", to: "/travel-and-earn", cta: "Invite friends →" },
  { text: "📸 Creators: share your code and earn on every completed trip", to: "/affiliate", cta: "Join →" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [promoIdx, setPromoIdx] = useState(0);
  const isHome = location.pathname === "/";
  const userRole = String(user?.role || user?.user_metadata?.role || "").toUpperCase();

  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  // Shadow + transparency on scroll
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Promo message ticker
  useEffect(() => {
    const id = setInterval(() => setPromoIdx((i) => (i + 1) % PROMO_MESSAGES.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass-navbar shadow-navbar"
          : "bg-white/95 border-b border-stone-100 dark:bg-stone-900/95 dark:border-stone-800"
      }`}
    >
      {/* ── Announcement bar ── */}
      <div className="announcement-bar">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 overflow-hidden">
          <Zap className="h-3.5 w-3.5 shrink-0 text-amber-400 animate-pulse" />
          <p
            key={promoIdx}
            className="text-[11px] font-semibold text-stone-300 animate-fade-in truncate"
          >
            {PROMO_MESSAGES[promoIdx].text}
          </p>
          <Link
            to={PROMO_MESSAGES[promoIdx].to}
            className="ml-2 shrink-0 rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400 hover:bg-amber-500/30 transition-colors"
          >
            {PROMO_MESSAGES[promoIdx].cta}
          </Link>
        </div>
      </div>

      {/* ── Main nav row ── */}
      <div className="mx-auto flex h-[62px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">

        {/* Logo */}
        <Link
          to="/"
          className="shrink-0 transition-transform duration-200 hover:scale-[1.02]"
          aria-label="Idea Holiday home"
        >
          <IdeaHolidayLogo className="text-[1.55rem] sm:text-[1.75rem]" dark={false} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary navigation">
          {NAV_ITEMS.map(({ label, path }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `relative rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-bold shadow-glow-sm"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Currency Selector */}
          <CurrencySelector />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Search icon on mobile */}
          <Link
            to="/search"
            aria-label="Search experiences"
            className="grid h-9 w-9 place-items-center rounded-full text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors lg:hidden"
          >
            <Search className="h-5 w-5" />
          </Link>

          {/* Wishlist */}
          <Link
            to="/wishlist"
            aria-label="Saved Wishlist"
            title="Wishlist"
            className="hidden items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-700 px-3 py-2 text-sm font-bold text-stone-700 dark:text-stone-200 hover:border-rose-400 hover:text-rose-500 transition-all duration-200 sm:inline-flex"
          >
            <Heart className="h-4 w-4 text-rose-400" />
            <span className="hidden xl:inline">Saved</span>
          </Link>

          {/* Role-based portal link */}
          {userRole === "SUPPLIER" ? (
            <Link
              to="/supplier"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-3.5 py-2 text-xs shadow-sm transition-all duration-200 hover:shadow-glow-sm"
            >
              <Store className="h-4 w-4" />
              <span>Supplier Portal</span>
            </Link>
          ) : userRole === "ADMIN" ? (
            <Link
              to="/admin"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-extrabold px-3.5 py-2 text-xs shadow-xs transition"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Admin Console</span>
            </Link>
          ) : userRole === "OPS" || userRole === "STAFF" || userRole === "DRIVER" ? (
            <Link
              to="/ops"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold px-3.5 py-2 text-xs shadow-xs transition"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Ops Panel</span>
            </Link>
          ) : null}

          {/* My trips */}
          <Link
            to="/my-bookings"
            aria-label="My trips"
            className="hidden items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-700 px-3 py-2 text-sm font-bold text-stone-700 dark:text-stone-200 hover:border-amber-400 hover:text-amber-700 transition-all duration-200 sm:inline-flex"
          >
            <Ticket className="h-4 w-4 text-amber-500" />
            {user ? "My trips" : "Trips"}
          </Link>

          {/* Auth */}
          {user ? (
            <div className="flex items-center gap-1.5">
              <Link
                to="/profile"
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs font-bold text-stone-800 dark:text-stone-100 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-stone-700 transition-all duration-200"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-[10px] font-black text-stone-950">
                  {(user.name || user.email || "U")[0].toUpperCase()}
                </span>
                <span className="max-w-[80px] truncate">{user.name?.split(" ")[0] || "Profile"}</span>
              </Link>
              <button
                onClick={() => { logout(); navigate("/"); }}
                className="hidden sm:inline-flex items-center gap-1 rounded-full border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs font-bold text-stone-500 hover:text-red-600 hover:border-red-300 transition-all duration-200"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-sm font-extrabold text-stone-950 transition-all duration-200 hover:from-amber-400 hover:to-amber-500 shadow-sm hover:shadow-glow-sm"
            >
              <UserRound className="h-4 w-4" />
              <span className="hidden sm:inline">Log in</span>
            </Link>
          )}

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="rounded-full p-2.5 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── Category bar (desktop only) ── */}
      <div className="hidden border-t border-stone-100 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm lg:block">
        <div className="mx-auto max-w-7xl px-8">
          <div className="hide-scrollbar flex items-center gap-0.5 overflow-x-auto py-1.5">
            {CATEGORY_BAR.map(({ emoji, label, q, type }) => (
              <Link
                key={label}
                to={q ? `/search?q=${encodeURIComponent(q)}` : `/search?type=${type}`}
                className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-stone-600 dark:text-stone-400 transition-all duration-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-800 dark:hover:text-amber-400"
              >
                <span className="text-sm leading-none">{emoji}</span>
                {label}
              </Link>
            ))}
            <div className="ml-auto flex-shrink-0 border-l border-stone-200 dark:border-stone-700 pl-3">
              <Link
                to="/search"
                className="flex items-center gap-1.5 text-[12px] font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 transition-colors"
              >
                All categories <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile menu ── */}
      {menuOpen && (
        <div
          id="mobile-navigation"
          className="absolute inset-x-0 top-full z-50 h-[calc(100vh-100px)] overflow-y-auto border-t border-stone-100 dark:border-stone-800 bg-white/98 dark:bg-stone-950/98 backdrop-blur-xl px-5 py-6 shadow-2xl lg:hidden animate-reveal-in"
        >
          <nav className="mx-auto flex max-w-lg flex-col" aria-label="Mobile navigation">
            {/* Role portal quick access */}
            {userRole === "SUPPLIER" ? (
              <Link to="/supplier" className="mb-5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 p-4 text-stone-950 font-bold shadow-glow-sm flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-base font-extrabold">
                  <Store className="h-5 w-5" /> Open Supplier Portal
                </span>
                <ArrowRight className="h-5 w-5" />
              </Link>
            ) : userRole === "ADMIN" ? (
              <Link to="/admin" className="mb-5 rounded-2xl bg-purple-600 p-4 text-white font-bold shadow-md flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-base font-extrabold">
                  <LayoutDashboard className="h-5 w-5" /> Open Admin Console
                </span>
                <ArrowRight className="h-5 w-5" />
              </Link>
            ) : userRole === "OPS" || userRole === "STAFF" || userRole === "DRIVER" ? (
              <Link to="/ops" className="mb-5 rounded-2xl bg-blue-600 p-4 text-white font-bold shadow-md flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-base font-extrabold">
                  <ShieldCheck className="h-5 w-5" /> Open Operations Hub
                </span>
                <ArrowRight className="h-5 w-5" />
              </Link>
            ) : null}

            {/* Primary nav */}
            {NAV_ITEMS.map(({ label, path }, i) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex items-center justify-between border-b border-stone-100 dark:border-stone-800 py-4 text-lg font-bold transition-colors ${
                    isActive ? "text-amber-600" : "text-stone-800 dark:text-stone-100"
                  }`
                }
              >
                <span>
                  <span className="mr-3 font-mono text-[10px] text-stone-400">0{i + 1}</span>
                  {label}
                </span>
                <ArrowRight className="h-4 w-4 text-stone-400" />
              </NavLink>
            ))}

            {/* Category grid */}
            <div className="mt-6 mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
              Browse by category
            </div>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {CATEGORY_BAR.map(({ emoji, label, q, type }) => (
                <Link
                  key={label}
                  to={q ? `/search?q=${encodeURIComponent(q)}` : `/search?type=${type}`}
                  className="flex items-center gap-2 rounded-xl border border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 px-3 py-3 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-800 dark:hover:text-amber-400 transition-colors"
                >
                  <span className="text-lg">{emoji}</span> {label}
                </Link>
              ))}
            </div>


          </nav>
        </div>
      )}
    </header>
  );
}
