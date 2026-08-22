import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Compass,
  FileCheck2,
  Globe2,
  Headphones,
  Layers,
  MapPin,
  QrCode,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  Truck,
  Users2,
} from "lucide-react";
import ContentPageLayout, { ArticleSection } from "../components/ContentPageLayout.jsx";

const journeySteps = [
  {
    step: "01",
    icon: Search,
    title: "Curated Discovery",
    desc: "Browse handpicked experiences, day tours, and airport transfers. Every listing features verified pricing, exact inclusions, and real traveler feedback.",
  },
  {
    step: "02",
    icon: CalendarCheck2,
    title: "Instant Digital Booking",
    desc: "Lock in your dates with real-time inventory. Receive immediate confirmation along with an official digital voucher and QR access ticket.",
  },
  {
    step: "03",
    icon: Radio,
    title: "Proactive Dispatch & Alerts",
    desc: "Our 24/7 Operations Desk monitors flight schedules and dispatches driver details, vehicle registration, and meeting coordinates via WhatsApp and SMS.",
  },
  {
    step: "04",
    icon: ShieldCheck,
    title: "On-Ground Excellence & Support",
    desc: "Enjoy your experience with full peace of mind. Our operations room remains on standby 24/7 to assist with any live coordination needs.",
  },
];

const auditPoints = [
  {
    title: "Commercial Licensing & Permits",
    desc: "Valid commercial tourist permits, interstate tax clearance, and legal operating licenses are verified prior to onboarding.",
  },
  {
    title: "Driver Verification & Safety Records",
    desc: "Chauffeurs must possess valid commercial driving licenses, background checks, and clean track records.",
  },
  {
    title: "Vehicle Fitness & Amenities",
    desc: "Air-conditioned, modern fleet vehicles inspected for mechanical safety, cleanliness, GPS tracking, and seatbelt compliance.",
  },
  {
    title: "Certified Multilingual Guides",
    desc: "Cultural and heritage tours are led by certified regional guides with extensive historical knowledge and communication skills.",
  },
];

const rankingFactors = [
  "Verified Traveler Ratings & Qualitative Review Scores",
  "Historical On-Time Dispatch & Operator Reliability Rate",
  "Real-Time Live Inventory Availability & Instant Confirmation",
  "Price Competitiveness and Transparency (No hidden fees)",
  "Relevance to Traveler Search Query & Travel Date Suitability",
];

export default function HowItWorks() {
  return (
    <ContentPageLayout
      eyebrow="Operations & Governance · How It Works"
      title="How Idea Holiday Works"
      intro="A comprehensive guide to our curation standards, verified operator ecosystem, algorithmic ranking, pricing transparency, and 24/7 on-ground operations."
      badgeText="Enterprise Operational Model"
      badgeIcon={Layers}
    >
      {/* 4-Stage Operational Journey */}
      <section className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700">
            <Sparkles className="h-4 w-4 text-amber-600" /> End-to-End Excellence
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold text-stone-900 sm:text-4xl">
            The Traveler Experience Lifecycle
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            From the moment you discover an itinerary to the completion of your journey, our integrated platform coordinates every detail.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {journeySteps.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="relative rounded-2xl border border-stone-200 bg-stone-50/70 p-6 transition hover:bg-white hover:shadow-md hover:border-amber-300"
              >
                <div className="flex items-center justify-between">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500 text-stone-950">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xl font-bold text-stone-400">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-stone-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 28-Point Supplier Accreditation Audit */}
      <section className="mt-14 rounded-3xl border border-stone-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3.5 py-1.5 text-xs font-bold text-emerald-900 border border-emerald-300">
              <ShieldCheck className="h-4 w-4 text-emerald-700" /> 100% Vetted Operators
            </span>
            <h2 className="mt-4 font-display text-2xl font-bold text-stone-900 sm:text-3xl">
              Our 28-Point Quality & Compliance Audit
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              We do not accept unverified open listings. Every operator, fleet owner, and excursion provider must meet strict regulatory and quality benchmarks before listing on Idea Holiday.
            </p>

            <div className="mt-6">
              <Link
                to="/supplier/signup"
                className="inline-flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-bold text-stone-950 shadow-sm"
              >
                Partner with us as an operator <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {auditPoints.map((pt, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-5"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <strong className="text-xs font-bold text-stone-900">
                    {pt.title}
                  </strong>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">
                  {pt.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ranking & Marketplace Transparency */}
      <section className="mt-14 rounded-3xl border border-stone-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">
            Marketplace Transparency
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold text-stone-900 sm:text-3xl">
            How Search, Ranking & Pricing Work
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Our platform operates with algorithmic fairness. We prioritize safety, guest reviews, and reliability above all else.
          </p>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <h3 className="font-display text-lg font-bold text-stone-900">
              Key Ranking Signals:
            </h3>
            <div className="space-y-2.5">
              {rankingFactors.map((factor, idx) => (
                <div key={idx} className="flex items-center gap-3 text-xs text-stone-700">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-900 font-mono font-bold text-[10px]">
                    {idx + 1}
                  </div>
                  <span>{factor}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-stone-50 p-6 border border-stone-200 text-xs leading-relaxed text-stone-600 space-y-3">
            <h4 className="font-display text-sm font-bold text-stone-900">
              Sponsored & Featured Listings
            </h4>
            <p>
              When an experience is part of a promotional partnership, it is clearly tagged with a <strong>'Promoted'</strong> or <strong>'Featured'</strong> badge. Commercial agreements never override our minimum quality and safety thresholds.
            </p>
            <p>
              Reviews are authenticated: only travelers with confirmed completed bookings are invited to submit verified ratings and feedback.
            </p>
          </div>
        </div>
      </section>

      {/* Detailed Operations Articles */}
      <section className="mt-14 rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-10">
        <ArticleSection number={1} title="Platform Role & Commercial Model" badge="Corporate Architecture">
          <p>
            <strong>Idea Holiday Private Limited</strong> provides the technology platform, distribution infrastructure, multi-channel payment processing, customer service desk, and logistics coordination.
          </p>
          <p>
            Depending on the product, services are delivered either directly by Idea Holiday or by vetted third-party operators under strict contractual SLAs. Our commercial model includes negotiated net supplier rates or standard commissions, ensuring that travelers receive competitive wholesale pricing with zero hidden surcharges.
          </p>
        </ArticleSection>

        <ArticleSection number={2} title="24/7 Operations Control Room">
          <p>
            Unlike static directories, Idea Holiday runs an active 24/7 Operations Control Room. Our team tracks flight delays, confirms vehicle assignments with local fleet coordinators, and dispatches automated chauffeur details to travelers hours prior to pickup.
          </p>
        </ArticleSection>

        <ArticleSection number={3} title="Traveler Protection & Contingency Protocols">
          <p>
            In the rare event of unforeseen roadblocks, vehicle breakdowns, or extreme weather warnings, our operations desk immediately activates backup contingency protocols: either dispatching a replacement vehicle, arranging an alternative itinerary, or processing an immediate 100% refund.
          </p>
        </ArticleSection>
      </section>

      {/* Bottom CTA Banner */}
      <section className="mt-12 overflow-hidden rounded-3xl bg-amber-400 p-8 text-stone-950 shadow-md sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-2xl font-bold text-stone-950">
              Ready to Explore Curated Experiences?
            </h3>
            <p className="mt-1 text-sm text-stone-800 font-medium">
              Discover verified day tours, cultural excursions, and private airport transfers across India.
            </p>
          </div>
          <Link
            to="/search"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-stone-950 px-6 py-3.5 text-xs font-extrabold text-white hover:bg-stone-800 shadow-md"
          >
            Explore All Experiences <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </ContentPageLayout>
  );
}
