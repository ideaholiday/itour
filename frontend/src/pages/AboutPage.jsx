import React from "react";
import { Link } from "react-router-dom";
import {
  Award,
  Building2,
  CheckCircle2,
  Compass,
  FileCheck,
  Globe2,
  Handshake,
  HeartHandshake,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users2,
} from "lucide-react";
import ContentPageLayout from "../components/ContentPageLayout.jsx";

const stats = [
  { label: "Destination Hubs", value: "50+", note: "Pan-India presence" },
  { label: "Verified Experiences", value: "1,200+", note: "Tours & Transfers" },
  { label: "Delighted Travelers", value: "100,000+", note: "Corporate & Leisure" },
  { label: "On-Time Dispatch Rate", value: "99.4%", note: "Verified SLA delivery" },
];

const pillars = [
  {
    icon: ShieldCheck,
    title: "Accredited Operator Network",
    description:
      "Every tour operator, chauffeur, and local guide is subjected to our stringent 28-point compliance audit—covering commercial licensing, safety records, and vehicle fitness.",
    badge: "100% Verified",
  },
  {
    icon: Sparkles,
    title: "Curated, Not Crowded",
    description:
      "We deliberately filter out low-quality listings to present high-value, authentic, and meticulously organized travel itineraries tailored for modern standards.",
    badge: "Quality First",
  },
  {
    icon: TrendingUp,
    title: "Transparent & Fair Commerce",
    description:
      "No hidden surcharges or surprise local add-ons. You receive itemized, GST-compliant invoicing with upfront cancellation windows on every experience.",
    badge: "Zero Hidden Fees",
  },
  {
    icon: PhoneCall,
    title: "24/7 Live Operations Desk",
    description:
      "Unlike passive booking engines, our active operations team actively coordinates driver dispatches, flight delays, and real-time on-ground support.",
    badge: "Live SLA < 15 Min",
  },
];

const governancePoints = [
  "Registered Corporate Entity: Idea Holiday Private Limited (CIN registered in India).",
  "Full compliance with the Consumer Protection Act, 2019 and Information Technology Act rules.",
  "Strict data privacy protocols safeguarding customer contact details and transaction records.",
  "Fair partnership economics empowering independent regional operators and certified local guides.",
];

export default function AboutPage() {
  return (
    <ContentPageLayout
      eyebrow="Corporate Profile · About Idea Holiday"
      title="Building India's Most Trusted Experience & Mobility Infrastructure"
      intro="Idea Holiday Private Limited bridges modern corporate-grade reliability with the rich, authentic diversity of Indian travel. We empower travelers with curated experiences, verified mobility, and 24/7 on-ground assurance."
      badgeText="Registered Corporate Entity"
    >
      {/* Corporate Overview Section */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10 lg:p-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3.5 py-1.5 text-xs font-bold text-amber-900 border border-amber-300">
              <Building2 className="h-4 w-4 text-amber-700" />
              Our Corporate Mission
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-4xl">
              Travel More with Confidence, Clarity, and Local Connection.
            </h2>
            <p className="text-base leading-relaxed text-stone-600">
              India is not a single uniform destination; it is a tapestry of thousands of distinct cultures, landscapes, and heritage wonders. Navigating it, however, has traditionally meant grappling with opaque pricing, unverified transport, and fragmented on-ground coordination.
            </p>
            <p className="text-base leading-relaxed text-stone-600">
              <strong>Idea Holiday</strong> was founded to solve this with enterprise-grade standards. We combine a curated marketplace of top-tier local experiences with dedicated mobility logistics and a round-the-clock operations room. The result is total peace of mind for leisure explorers, corporate travelers, and travel trade partners.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-6 sm:p-8">
            <h3 className="font-display text-lg font-bold text-stone-900">Corporate Highlights</h3>
            <div className="mt-5 space-y-4">
              {governancePoints.map((point, index) => (
                <div key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span className="text-sm leading-relaxed text-stone-700">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats Counter */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-stone-300 hover:shadow-md"
          >
            <span className="font-display text-3xl font-bold text-amber-700 sm:text-4xl">
              {stat.value}
            </span>
            <strong className="mt-2 block text-sm font-bold text-stone-900">{stat.label}</strong>
            <span className="mt-1 block text-xs text-stone-500">{stat.note}</span>
          </div>
        ))}
      </section>

      {/* Core Operating Pillars */}
      <section className="mt-14 space-y-8">
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">
            The Idea Holiday Standard
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold text-stone-900 sm:text-4xl">
            Why Travelers & Organizations Trust Us
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Our operational framework is engineered around reliability, safety, transparency, and authentic regional discovery.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="group relative rounded-3xl border border-stone-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-amber-300 hover:shadow-md sm:p-8"
              >
                <div className="flex items-center justify-between">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-800 ring-1 ring-amber-200 transition group-hover:bg-amber-500 group-hover:text-stone-950">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700">
                    {pillar.badge}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-stone-900 sm:text-2xl">
                  {pillar.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-stone-600">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Corporate & B2B Solutions Banner */}
      <section className="mt-16 overflow-hidden rounded-3xl bg-amber-400 p-8 text-stone-950 shadow-md sm:p-12 lg:p-14">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/50 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-stone-950 backdrop-blur-md">
              <Handshake className="h-3.5 w-3.5" />
              Corporate & Partner Solutions
            </div>
            <h2 className="font-display text-3xl font-bold text-stone-950 sm:text-4xl">
              Partner with Idea Holiday for Enterprise & Trade Mobility
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-stone-800 font-medium sm:text-base">
              From executive airport logistics and offsite retreat activities to custom multi-day corporate itineraries, our B2B desk delivers verified capacity with unified monthly billing and dedicated account managers.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link
              to="/contact-us"
              className="inline-flex items-center justify-center rounded-full bg-stone-950 px-6 py-3.5 text-sm font-extrabold text-white shadow-md transition hover:bg-stone-800"
            >
              Contact Corporate Desk
            </Link>
            <Link
              to="/supplier/signup"
              className="inline-flex items-center justify-center rounded-full border border-stone-950/30 bg-white/40 px-6 py-3.5 text-sm font-bold text-stone-950 transition hover:bg-white"
            >
              Operator Partnership Program
            </Link>
          </div>
        </div>
      </section>

      {/* Corporate Entity Details */}
      <section className="mt-12 rounded-2xl border border-stone-200 bg-white/70 p-6 text-center text-xs text-stone-500 sm:p-8">
        <p className="font-semibold text-slate-700">
          Idea Holiday Private Limited · Registered in India
        </p>
        <p className="mt-1">
          Corporate Office: Idea Holiday Hub, India · Official Domain:{" "}
          <a href="https://ideaholiday.in" className="font-bold text-neel underline">
            ideaholiday.in
          </a>
        </p>
      </section>
    </ContentPageLayout>
  );
}
