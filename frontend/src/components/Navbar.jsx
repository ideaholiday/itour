import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Heart, Menu, MessageSquare, Search, Ticket, User, UserRound, X } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import IdeaHolidayLogo from "./IdeaHolidayLogo.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import CurrencySelector from "./CurrencySelector.jsx";

const NAV_ITEMS = [
  { label: "Experiences", path: "/search?type=DAY_TOUR" },
  { label: "Transfers", path: "/transfers" },
  { label: "Multi-day Tours", path: "/search?type=MULTI_DAY_PACKAGE" },
  { label: "Travel & Earn ✨", path: "/travel-and-earn" },
  { label: "How it works", path: "/how-it-works" },
];

const CATEGORY_BAR = [
  { emoji: "🏰", label: "Heritage", q: "Heritage" },
  { emoji: "🏖️", label: "Beaches", q: "Beaches" },
  { emoji: "🐅", label: "Wildlife", q: "Wildlife" },
  { emoji: "🍛", label: "Food Walks", q: "Food" },
  { emoji: "🛶", label: "Backwaters", q: "Backwaters" },
  { emoji: "✈️", label: "Transfers", type: "TRANSFER" },
  { emoji: "🏔️", label: "Adventure", q: "Adventure" },
  { emoji: "🕌", label: "Spiritual", q: "Spiritual" },
  { emoji: "🎭", label: "Events", q: "Shows" },
  { emoji: "🚗", label: "Day Trips", q: "Day Tours" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isHome = location.pathname === "/";

  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  // Shadow on scroll
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header className={`sticky top-0 z-50 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md transition-shadow ${scrolled ? "shadow-md" : "border-b border-stone-200 dark:border-stone-800"}`}>
      {/* ── Main nav row ── */}
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">

        {/* Logo */}
        <Link to="/" className="shrink-0" aria-label="Idea Holiday home">
          <IdeaHolidayLogo className="text-[1.55rem] sm:text-[1.8rem]" dark={false} />
        </Link>

        {/* Desktop nav pills */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {NAV_ITEMS.map(({ label, path }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive ? "bg-amber-500 text-stone-950 font-bold shadow-sm shadow-amber-500/20" : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Currency Selector */}
          <CurrencySelector />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Search icon on mobile */}
          <Link
            to="/search"
            aria-label="Search experiences"
            className="grid h-9 w-9 place-items-center rounded-full text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 lg:hidden"
          >
            <Search className="h-5 w-5" />
          </Link>

          {/* Wishlist Link */}
          <Link
            to="/wishlist"
            aria-label="Saved Wishlist"
            title="Wishlist"
            className="hidden items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-700 px-3 py-2 text-sm font-bold text-stone-700 dark:text-stone-200 hover:border-rose-400 hover:text-rose-500 sm:inline-flex"
          >
            <Heart className="h-4 w-4 text-rose-500" />
            <span className="hidden xl:inline">Saved</span>
          </Link>

          <Link
            to="/supplier/signup"
            className="hidden text-sm font-semibold text-stone-600 dark:text-stone-300 hover:text-amber-600 xl:block"
          >
            Become a partner
          </Link>

          <Link
            to="/my-bookings"
            aria-label="My trips"
            className="hidden items-center gap-2 rounded-full border border-stone-200 dark:border-stone-700 px-3 py-2 text-sm font-bold text-stone-700 dark:text-stone-200 hover:border-amber-500 hover:text-amber-700 sm:inline-flex"
          >
            <Ticket className="h-4 w-4 text-amber-500" />
            {user ? "My trips" : "Trips"}
          </Link>

          {user ? (
            <div className="flex items-center gap-1.5">
              <Link
                to="/profile"
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs font-bold text-stone-800 dark:text-stone-100 hover:border-amber-500"
              >
                <User className="h-3.5 w-3.5 text-amber-500" />
                <span className="max-w-[100px] truncate">{user.name?.split(" ")[0] || "Profile"}</span>
              </Link>
              <button
                onClick={() => { logout(); navigate("/"); }}
                className="hidden sm:inline-flex items-center gap-1 rounded-full border border-stone-200 dark:border-stone-700 px-3 py-2 text-xs font-bold text-stone-500 hover:text-red-600 hover:border-red-300"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-extrabold text-stone-950 transition hover:bg-amber-400 shadow-sm"
            >
              <UserRound className="h-4 w-4" /> Log in
            </Link>
          )}

          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="rounded-full p-2.5 hover:bg-stone-100 dark:hover:bg-stone-800 lg:hidden text-stone-700 dark:text-stone-300"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ── Category bar (desktop) ── */}
      <div className="hidden border-t border-stone-100 bg-white lg:block">
        <div className="mx-auto max-w-7xl px-8">
          <div className="hide-scrollbar flex items-center gap-1 overflow-x-auto py-2">
            {CATEGORY_BAR.map(({ emoji, label, q, type }) => (
              <Link
                key={label}
                to={q ? `/search?q=${encodeURIComponent(q)}` : `/search?type=${type}`}
                className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold text-stone-600 transition hover:bg-amber-50 hover:text-amber-800"
              >
                <span className="text-base leading-none">{emoji}</span>
                {label}
              </Link>
            ))}
            <div className="ml-auto flex-shrink-0 border-l border-stone-200 pl-3">
              <Link
                to="/search"
                className="flex items-center gap-1.5 text-[12px] font-bold text-amber-700 hover:text-amber-800"
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
          className="absolute inset-x-0 top-full z-50 h-[calc(100vh-68px)] overflow-y-auto border-t border-stone-200 bg-white px-5 py-6 shadow-2xl lg:hidden"
        >
          <nav className="mx-auto flex max-w-lg flex-col" aria-label="Mobile navigation">
            {NAV_ITEMS.map(({ label, path }, i) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex items-center justify-between border-b border-stone-100 py-5 text-xl font-bold ${
                    isActive ? "text-amber-600" : "text-stone-800"
                  }`
                }
              >
                <span>
                  <span className="mr-3 font-mono text-[10px] text-stone-400">0{i + 1}</span>
                  {label}
                </span>
                <ArrowRight className="h-5 w-5" />
              </NavLink>
            ))}

            {/* Category grid on mobile */}
            <div className="mt-6 mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">Browse by category</div>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {CATEGORY_BAR.map(({ emoji, label, q, type }) => (
                <Link
                  key={label}
                  to={q ? `/search?q=${encodeURIComponent(q)}` : `/search?type=${type}`}
                  className="flex items-center gap-2 rounded-xl border border-stone-100 px-3 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <span className="text-lg">{emoji}</span> {label}
                </Link>
              ))}
            </div>

            <Link to="/supplier/signup" className="rounded-2xl bg-amber-500 p-5 text-stone-950 font-bold shadow-md">
              <span className="text-xs font-extrabold uppercase tracking-[.16em] text-stone-800">For local operators</span>
              <span className="mt-2 flex items-center justify-between text-lg font-extrabold">
                Grow with Idea Holiday <ArrowRight className="h-5 w-5" />
              </span>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
