import React from "react";
import { Link } from "react-router-dom";
import { Mail, MapPin, Phone } from "lucide-react";
import IdeaHolidayLogo from "./IdeaHolidayLogo.jsx";

const footerGroups = [
  { title: "Discover", links: [["Things to do", "/search"], ["Airport transfers", "/transfers"], ["How it works", "/how-it-works"], ["List your experience", "/supplier/signup"]] },
  { title: "Company", links: [["About us", "/about-us"], ["Contact us", "/contact-us"], ["My bookings", "/bookings"], ["Help & support", "/contact-us"]] },
  { title: "Legal", links: [["Terms & Conditions", "/terms"], ["Cancellation & Refund", "/cancellation"], ["How Idea Holiday works", "/how-it-works"]] },
];

export default function Footer() {
  return (
    <footer className="mt-auto bg-[#F5F3ED] border-t border-stone-200 text-stone-700">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div>
          <IdeaHolidayLogo className="text-3xl" showTagline dark={false} />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-stone-600">Travel More with idea Holiday. Discover thoughtfully curated experiences and trusted local experts across India.</p>
          <div className="mt-6 space-y-2 text-sm text-stone-600">
            <a href="mailto:info@ideaholiday.in" className="flex items-center gap-2 hover:text-amber-700"><Mail className="h-4 w-4 text-amber-600" /> info@ideaholiday.in</a>
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
