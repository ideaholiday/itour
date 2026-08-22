import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Headphones,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";
import ContentPageLayout, { ArticleSection } from "../components/ContentPageLayout.jsx";

const tiers = [
  {
    tier: "Tier 1: Standard Experiences",
    scope: "Day tours, city sightseeing, cultural activities & workshops",
    window: "Free cancellation up to 24 hours prior to experience start time",
    refund: "100% Full Refund",
    badge: "Most Common",
    badgeColor: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  {
    tier: "Tier 2: Transfers & Mobility",
    scope: "Airport pickups, intercity private chauffeur drives",
    window: "Free cancellation up to 12 hours prior to scheduled pickup",
    refund: "100% Full Refund",
    badge: "Fast Refund",
    badgeColor: "bg-blue-50 text-blue-800 border-blue-200",
  },
  {
    tier: "Tier 3: Special Access & Multi-Day",
    scope: "Restricted monument entries, chartered safaris, multi-day tours",
    window: "As disclosed on the specific experience listing & voucher",
    refund: "Per Supplier Terms",
    badge: "Disclosed Upfront",
    badgeColor: "bg-amber-50 text-amber-800 border-amber-200",
  },
];

const refundSteps = [
  {
    step: "01",
    title: "Initiate Online",
    desc: "Navigate to 'My Bookings', select your upcoming itinerary, and click 'Request Cancellation'.",
    icon: RotateCcw,
  },
  {
    step: "02",
    title: "Instant Verification",
    desc: "Our automated system checks the cancellation window timestamp and logs the approval instantly.",
    icon: ShieldCheck,
  },
  {
    step: "03",
    title: "Automated Gateway Payout",
    desc: "Refunds are dispatched to your original source of payment (Bank/UPI/Card) within 3–7 business days.",
    icon: CreditCard,
  },
];

const faqs = [
  {
    question: "Where will my refund money be sent?",
    answer:
      "All refunds are returned strictly to the original payment source (same Credit/Debit Card, UPI handle, or Net Banking account) used during checkout. Cash or third-party payouts are not permitted for security and anti-fraud compliance.",
  },
  {
    question: "What happens if a tour is cancelled due to adverse weather or road closures?",
    answer:
      "If an experience is cancelled by the operator or local authorities due to safety reasons, severe weather, or monument closures, you are entitled to a guaranteed 100% full refund or a complimentary date reschedule.",
  },
  {
    question: "How do I check the exact cancellation deadline for my trip?",
    answer:
      "The exact date and time deadline is clearly printed on your digital voucher, confirmation email, and inside your 'My Bookings' itinerary card under 'Cancellation Policy'.",
  },
  {
    question: "Can I reschedule my trip date instead of cancelling?",
    answer:
      "Yes. In most cases, dates can be amended without penalty if requested before the free-cancellation deadline. Contact our 24/7 Operations Desk or use the 'Get Help' button in your booking card.",
  },
];

export default function CancellationPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <ContentPageLayout
      eyebrow="Consumer Protection · Policy Guidelines"
      title="Cancellation & Refund Policy"
      intro="We believe in fair, predictable, and transparent policies. You will always know the exact cancellation deadline before confirming your reservation, with zero hidden processing deductions on eligible refunds."
      badgeText="Guaranteed Full Refund on Eligible Bookings"
      badgeIcon={ShieldCheck}
    >
      {/* Policy Tier Cards */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
          <Sparkles className="h-4 w-4 text-amber-600" /> Clear Policy Schedules
        </div>
        <h2 className="font-display text-2xl font-bold text-stone-900 sm:text-3xl">
          Cancellation Tiers at a Glance
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.tier}
              className="flex flex-col justify-between rounded-3xl border border-stone-200 bg-white p-7 shadow-sm transition hover:shadow-md"
            >
              <div>
                <span
                  className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold border ${tier.badgeColor}`}
                >
                  {tier.badge}
                </span>
                <h3 className="mt-4 font-display text-lg font-bold text-stone-900">
                  {tier.tier}
                </h3>
                <p className="mt-1 text-xs text-stone-500">{tier.scope}</p>

                <div className="mt-5 rounded-2xl bg-[#FAF9F6] p-4 border border-stone-200">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Cancellation Window
                  </span>
                  <strong className="mt-1 block text-sm font-semibold text-stone-800">
                    {tier.window}
                  </strong>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100">
                <span className="text-xs text-stone-500">Eligible Refund:</span>
                <strong className="mt-0.5 block font-display text-xl font-bold text-emerald-800">
                  {tier.refund}
                </strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3-Step Automated Refund Lifecycle */}
      <section className="mt-14 rounded-3xl border border-stone-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-widest text-amber-800">
            Automated & Seamless
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold text-stone-900 sm:text-3xl">
            How Your Refund is Processed
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            We eliminate tedious paperwork. All eligible cancellations are handled digitally through our automated payout rails.
          </p>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {refundSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.step} className="relative space-y-3">
                <div className="flex items-center justify-between">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-800">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="font-mono text-2xl font-bold text-stone-300">
                    {step.step}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold text-stone-900">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-stone-600">
                  {step.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Operator Disruption Guarantee Banner */}
      <section className="mt-12 overflow-hidden rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-500 to-amber-600 p-8 text-stone-950 shadow-md sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-stone-950/15 px-3 py-1 text-xs font-bold text-stone-950">
              <ShieldCheck className="h-4 w-4" /> 100% Unforeseen Disruption Guarantee
            </span>
            <h3 className="font-display text-2xl font-bold">
              Full Protection Against Weather & Admin Closures
            </h3>
            <p className="max-w-2xl text-sm font-medium text-stone-950/90">
              If an experience cannot proceed due to monument closures, government safety advisories, or operator technical issues, you receive an immediate 100% refund or free date amendment.
            </p>
          </div>
          <Link
            to="/bookings"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-stone-950 px-6 py-3.5 text-xs font-extrabold text-white hover:bg-stone-800 shadow-sm"
          >
            Manage My Trips <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Detailed Policy Articles */}
      <section className="mt-14 rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-10">
        <ArticleSection number={1} title="Self-Service Digital Cancellation">
          <p>
            Travelers can initiate a cancellation at any time directly through their <strong>'My Bookings'</strong> portal without needing to wait in phone queues. The exact system timestamp of the cancellation submission is used to evaluate eligibility against the disclosed deadline.
          </p>
        </ArticleSection>

        <ArticleSection number={2} title="Settlement Timeline & Bank Rails">
          <p>
            Once a cancellation is authorized, Idea Holiday releases the refund immediately to our banking and payment gateway partners (e.g. Razorpay / Stripe). The final credit to your card or account typically reflects within <strong>3 to 7 business days</strong>, subject to your issuing bank’s standard settlement cycles.
          </p>
        </ArticleSection>

        <ArticleSection number={3} title="No-Shows and Late Departures">
          <p>
            Travelers must be present at the confirmed pickup point or attraction entry at least 15 minutes before the scheduled start time. Failure to arrive without prior notification or failure to produce mandatory government identification may result in the booking being classified as a no-show, which is non-refundable.
          </p>
        </ArticleSection>

        <ArticleSection number={4} title="Dispute Escalation & Assistance">
          <p>
            If you encounter any discrepancy in your refund settlement or have special compassionate circumstances (e.g. verified medical emergencies), our 24/7 Operations Desk is available to review your case at{" "}
            <a href="mailto:info@ideaholiday.in" className="font-bold text-amber-800 underline">
              info@ideaholiday.in
            </a>
            .
          </p>
        </ArticleSection>
      </section>

      {/* Frequently Asked Questions */}
      <section className="mt-12 rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-10">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
          <HelpCircle className="h-4 w-4 text-amber-600" /> Refund FAQs
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold text-stone-900 sm:text-3xl">
          Common Questions on Cancellations
        </h2>

        <div className="mt-6 divide-y divide-stone-100">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div key={index} className="py-4 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  className="flex w-full items-center justify-between text-left text-base font-bold text-stone-900 transition hover:text-amber-800"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-stone-400 transition-transform ${
                      isOpen ? "rotate-180 text-amber-600" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="mt-3 text-sm leading-relaxed text-stone-600 animate-fadeIn">
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </ContentPageLayout>
  );
}
