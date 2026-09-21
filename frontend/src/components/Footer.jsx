import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Send,
  ArrowRight,
  Sparkles,
  Globe,
} from "lucide-react";
import IdeaHolidayLogo from "./IdeaHolidayLogo.jsx";
import { api } from "../lib/api.js";

/* ── Inline social icon SVGs (lucide-react doesn't export brand icons) ── */
function IconInstagram({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}
function IconFacebook({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
function IconTwitter({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const footerGroups = [
  {
    title: "Discover",
    links: [
      ["Things to do", "/search"],
      ["Find tour operators", "/suppliers"],
      ["List your business", "/supplier/signup"],
      ["Plan Circuit 🗺️", "/circuit-planner"],
      ["Travel & Earn ✨", "/travel-and-earn"],
      ["Influencer Program 🌟", "/affiliate"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About us", "/about-us"],
      ["Contact us", "/contact-us"],
      ["My bookings", "/bookings"],
      ["Rewards & Referrals", "/travel-and-earn"],
      ["Creator & Affiliate Hub", "/affiliate"],
      ["Help & support", "/contact-us"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms & Conditions", "/terms"],
      ["Cancellation & Refund", "/cancellation"],
      ["Privacy Policy", "/privacy-policy"],
      ["How Idea Holiday works", "/how-it-works"],
    ],
  },
];

const SOCIAL_LINKS = [
  { icon: IconInstagram, label: "Instagram", href: "https://instagram.com/ideaholiday", hoverColor: "hover:text-pink-400" },
  { icon: IconFacebook, label: "Facebook", href: "https://facebook.com/ideaholiday", hoverColor: "hover:text-blue-400" },
  { icon: IconTwitter, label: "Twitter / X", href: "https://twitter.com/ideaholiday", hoverColor: "hover:text-sky-400" },
];

const PAYMENT_METHODS = [
  { label: "UPI", bg: "bg-emerald-500/20 text-emerald-300 border-emerald-700" },
  { label: "RuPay", bg: "bg-blue-500/20 text-blue-300 border-blue-700" },
  { label: "Visa", bg: "bg-blue-600/20 text-blue-300 border-blue-700" },
  { label: "MC", bg: "bg-red-500/20 text-red-300 border-red-800" },
  { label: "NetBnk", bg: "bg-stone-500/20 text-stone-300 border-stone-700" },
];

export default function Footer() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await api.subscribeNewsletter({ email: email.trim(), source: "FOOTER" });
      if (res && res.success) { setStatus("success"); setMessage(res.message || "Thank you for subscribing!"); setEmail(""); }
      else { setStatus("error"); setMessage(res?.error || "Failed to subscribe. Please check your email."); }
    } catch (err) { setStatus("error"); setMessage(err.message || "Something went wrong. Please try again."); }
  };

  return (
    <footer className="mt-auto bg-stone-950 text-stone-400 border-t border-stone-800">
      {/* ── Main footer grid ── */}
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.4fr_repeat(3,1fr)]">

        {/* Brand column */}
        <div>
          {/* Logo — force light (white) on dark background */}
          <IdeaHolidayLogo className="text-3xl" showTagline dark={true} />

          <p className="mt-5 max-w-sm text-sm leading-relaxed text-stone-400">
            Travel More with Idea Holiday. Discover thoughtfully curated experiences and trusted local experts across India and Thailand.
          </p>

          {/* Newsletter */}
          <div className="mt-7 max-w-sm">
            <h3 className="text-xs font-extrabold uppercase tracking-[0.18em] text-stone-200 mb-1">Subscribe to Updates</h3>
            <p className="text-xs text-stone-500 mb-3">Secret travel deals, seasonal vouchers & insider tips.</p>
            {status === "success" ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-900/40 border border-emerald-700/40 px-3 py-2.5 text-xs text-emerald-300 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{message}</span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
                    className="flex-1 min-w-0 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2.5 text-xs text-stone-200 placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 px-3.5 py-2.5 text-xs font-bold text-stone-950 transition-all disabled:opacity-50 shrink-0 cursor-pointer hover:shadow-glow-sm"
                  >
                    {status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><span>Join</span><Send className="h-3 w-3" /></>}
                  </button>
                </div>
                {status === "error" && <p className="text-[11px] text-red-400 font-medium">{message}</p>}
              </form>
            )}
          </div>

          {/* Contact */}
          <div className="mt-7 space-y-2 text-xs border-t border-stone-800 pt-6">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Mail className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <a href="mailto:info@ideaholiday.in" className="text-stone-400 hover:text-amber-400 transition-colors">
                info@ideaholiday.in
              </a>
              <span className="text-stone-700">·</span>
              <a href="mailto:support@ideaholiday.in" className="text-stone-400 hover:text-amber-400 transition-colors">
                support@ideaholiday.in
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Phone className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <a href="tel:+919696777391" className="text-stone-400 hover:text-amber-400 transition-colors">
                +91 9696777391
              </a>
              <span className="text-stone-700">·</span>
              <a href="tel:+919336757106" className="text-stone-400 hover:text-amber-400 transition-colors">
                +91 9336757106
              </a>
            </div>
            <div className="flex items-start gap-2 text-stone-400">
              <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>Mumbai · Vapi · Lucknow · Moradabad</span>
            </div>
          </div>
        </div>

        {/* Link columns */}
        {footerGroups.map((group) => (
          <div key={group.title}>
            <h2 className="mb-5 text-xs font-extrabold uppercase tracking-[0.18em] text-stone-200">
              {group.title}
            </h2>
            <ul className="space-y-3.5">
              {group.links.map(([label, path]) => (
                <li key={label}>
                  <Link
                    to={path}
                    className="group relative text-sm font-medium text-stone-400 hover:text-amber-400 transition-colors duration-200 inline-flex items-center gap-1"
                  >
                    <span className="relative">
                      {label}
                      <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-amber-500 group-hover:w-full transition-all duration-300" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* ── Divider ── */}
      <div className="h-px bg-gradient-to-r from-transparent via-stone-700 to-transparent mx-8" />

      {/* ── Bottom bar ── */}
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: copyright */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-stone-500">© 2026 Idea Holiday Private Limited. All rights reserved.</span>
            <span className="text-xs font-semibold text-amber-700/80">
              <Sparkles className="inline h-3 w-3 mr-1 text-amber-600" />
              Curated experiences. Verified operators. Real India.
            </span>
          </div>

          {/* Center: payment methods */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-stone-600 font-semibold uppercase tracking-wider mr-1">Secure payments:</span>
            {PAYMENT_METHODS.map(({ label, bg }) => (
              <span
                key={label}
                className={`rounded-md border px-2.5 py-1 text-[10px] font-bold ${bg}`}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Right: social icons */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-stone-600 font-semibold uppercase tracking-wider">Follow us:</span>
            {SOCIAL_LINKS.map(({ icon: Icon, label, href, hoverColor }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                target="_blank"
                rel="noopener noreferrer"
                className={`grid h-8 w-8 place-items-center rounded-full border border-stone-800 text-stone-500 transition-all duration-200 hover:border-stone-600 hover:-translate-y-0.5 ${hoverColor}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
