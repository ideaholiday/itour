import React, { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Mail, MapPin, Phone, Send } from "lucide-react";
import IdeaHolidayLogo from "./IdeaHolidayLogo.jsx";
import { api } from "../lib/api.js";

const footerGroups = [
  { title: "Discover", links: [["Things to do", "/search"], ["Airport transfers", "/transfers"], ["Travel & Earn ✨", "/travel-and-earn"], ["How it works", "/how-it-works"], ["List your experience", "/supplier/signup"]] },
  { title: "Company", links: [["About us", "/about-us"], ["Contact us", "/contact-us"], ["My bookings", "/bookings"], ["Rewards & Referrals", "/travel-and-earn"], ["Help & support", "/contact-us"]] },
  { title: "Legal", links: [["Terms & Conditions", "/terms"], ["Cancellation & Refund", "/cancellation"], ["How Idea Holiday works", "/how-it-works"]] },
];

export default function Footer() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [message, setMessage] = useState("");

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await api.subscribeNewsletter({
        email: email.trim(),
        source: "FOOTER",
      });

      if (res && res.success) {
        setStatus("success");
        setMessage(res.message || "Thank you for subscribing!");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(res?.error || "Failed to subscribe. Please check your email.");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Something went wrong. Please try again.");
    }
  };

  return (
    <footer className="mt-auto bg-[#F5F3ED] border-t border-stone-200 text-stone-700">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div>
          <IdeaHolidayLogo className="text-3xl" showTagline dark={false} />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-stone-600">Travel More with idea Holiday. Discover thoughtfully curated experiences and trusted local experts across India.</p>
          
          {/* Newsletter Subscription */}
          <div className="mt-6 max-w-sm">
            <h3 className="text-xs font-extrabold uppercase tracking-[0.18em] text-stone-900 mb-2">Subscribe to Updates</h3>
            <p className="text-xs text-stone-500 mb-3">Get secret travel deals, seasonal vouchers & insider tips.</p>
            {status === "success" ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 font-medium animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
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
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (status === "error") setStatus("idle");
                    }}
                    className="flex-1 min-w-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 placeholder-stone-400 shadow-sm focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    {status === "loading" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <span>Join</span>
                        <Send className="h-3 w-3" />
                      </>
                    )}
                  </button>
                </div>
                {status === "error" && (
                  <p className="text-[11px] text-red-600 font-medium">{message}</p>
                )}
              </form>
            )}
          </div>

          <div className="mt-6 space-y-2 text-sm text-stone-600 border-t border-stone-200/80 pt-5">
            <a href="mailto:info@ideaholiday.com" className="flex items-center gap-2 hover:text-amber-700"><Mail className="h-4 w-4 text-amber-600" /> info@ideaholiday.com</a>
            <a href="tel:+911800433200" className="flex items-center gap-2 hover:text-amber-700"><Phone className="h-4 w-4 text-amber-600" /> +91 1800-IDEA</a>
            <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-amber-600" /> India</span>
          </div>
        </div>
        {footerGroups.map((group) => (
          <div key={group.title}>
            <h2 className="mb-5 text-xs font-extrabold uppercase tracking-[0.18em] text-stone-900">{group.title}</h2>
            <ul className="space-y-3 text-sm font-medium text-stone-600">
              {group.links.map(([label, path]) => <li key={label}><Link to={path} className="transition hover:text-amber-700">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-stone-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© 2026 Idea Holiday Private Limited. All rights reserved.</span>
          <span className="font-semibold text-amber-800">Travel More with idea Holiday.</span>
        </div>
      </div>
    </footer>
  );
}
