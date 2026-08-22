import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  Headphones,
  HelpCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  ShieldAlert,
  Sparkles,
  Ticket,
} from "lucide-react";
import ContentPageLayout from "../components/ContentPageLayout.jsx";

const channels = [
  {
    icon: Phone,
    title: "24/7 Operations Room",
    subtitle: "Active trip & emergency assistance",
    contact: "+91 1800-IDEA (Toll Free)",
    action: "tel:+911800433200",
    actionLabel: "Call 24/7 Operations",
    sla: "Immediate / < 5 mins",
    highlight: true,
  },
  {
    icon: Mail,
    title: "Traveler & Booking Desk",
    subtitle: "Reservations, changes & vouchers",
    contact: "info@ideaholiday.in",
    action: "mailto:info@ideaholiday.in",
    actionLabel: "Email Support Desk",
    sla: "Response within 2 hours",
    highlight: false,
  },
  {
    icon: Building2,
    title: "Corporate & B2B Alliances",
    subtitle: "Enterprise travel & supplier partnerships",
    contact: "partners@ideaholiday.in",
    action: "mailto:partners@ideaholiday.in",
    actionLabel: "Contact B2B Team",
    sla: "Response within 4 business hours",
    highlight: false,
  },
  {
    icon: ShieldAlert,
    title: "Grievance & Compliance",
    subtitle: "Statutory Consumer & Legal Officer",
    contact: "grievance@ideaholiday.in",
    action: "mailto:grievance@ideaholiday.in",
    actionLabel: "Reach Grievance Officer",
    sla: "Acknowledgment within 24 hours",
    highlight: false,
  },
];

const faqs = [
  {
    question: "Where can I find my driver details or meeting point?",
    answer:
      "Assigned driver details (name, vehicle registration number, and contact number) are updated in your 'My Bookings' portal 2 to 4 hours prior to scheduled departure. We also send automated alerts via WhatsApp and SMS to the lead traveler.",
  },
  {
    question: "My flight is delayed. How do I adjust my airport transfer pickup?",
    answer:
      "If you provided your flight number during booking, our operations desk monitors flight statuses in real time and automatically adjusts your chauffeur's arrival. For sudden route changes, please call our 24/7 Operations Room immediately.",
  },
  {
    question: "How do I download an official GST invoice for corporate reimbursement?",
    answer:
      "GST-compliant tax invoices are automatically generated upon confirmed payment and can be downloaded instantly from your 'My Bookings' dashboard or requested directly from our billing team with your company GSTIN.",
  },
  {
    question: "What is the procedure to reschedule or cancel an experience?",
    answer:
      "Open your 'My Bookings' portal, select the relevant trip, and choose 'Request Cancellation' or 'Get Help'. Eligible cancellations within the stated free-cancellation deadline are processed automatically with zero processing fees.",
  },
  {
    question: "How do I make a corporate or bulk group reservation?",
    answer:
      "For customized corporate offsites, MICE transfers, or group tours exceeding 10 guests, reach out to our corporate desk at partners@ideaholiday.in or submit the inquiry form below for dedicated account management.",
  },
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    bookingRef: "",
    category: "ACTIVE_TRIP",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <ContentPageLayout
      eyebrow="Corporate Concierge · Help & Support"
      title="We're Here for Every Step of Your Journey"
      intro="Whether you require real-time dispatch assistance on an active trip, have booking questions, or need corporate travel solutions, our dedicated operations team is at your service 24/7."
      badgeText="24/7 Real-Time Desk"
      badgeIcon={Headphones}
    >
      {/* Communication Channels Grid */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {channels.map((ch) => {
          const Icon = ch.icon;
          return (
            <div
              key={ch.title}
              className={`flex flex-col justify-between rounded-3xl border p-6 shadow-sm transition hover:shadow-md ${
                ch.highlight
                  ? "border-amber-300 bg-amber-50/40 ring-1 ring-amber-200"
                  : "border-slate-200/80 bg-white"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div
                    className={`grid h-11 w-11 place-items-center rounded-2xl ${
                      ch.highlight
                        ? "bg-amber-500 text-stone-950 shadow-sm"
                        : "bg-[#FAF9F6] text-amber-800 border border-stone-200"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-600">
                    SLA: {ch.sla}
                  </span>
                </div>
                <h2 className="mt-4 font-display text-lg font-bold text-stone-900">
                  {ch.title}
                </h2>
                <p className="mt-1 text-xs text-stone-500">{ch.subtitle}</p>
                <div className="mt-3 font-mono text-sm font-bold text-stone-900">
                  {ch.contact}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100">
                <a
                  href={ch.action}
                  className={`inline-flex w-full items-center justify-center rounded-xl py-2.5 text-xs font-bold transition shadow-sm ${
                    ch.highlight
                      ? "bg-amber-500 hover:bg-amber-400 text-stone-950"
                      : "bg-stone-100 text-stone-800 hover:bg-stone-200"
                  }`}
                >
                  {ch.actionLabel}
                </a>
              </div>
            </div>
          );
        })}
      </section>

      {/* Main Support & Form Section */}
      <section className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Support Request Form */}
        <div className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
            <Sparkles className="h-4 w-4 text-amber-600" /> Priority Support Desk
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold text-stone-900 sm:text-3xl">
            Submit a Support Request
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            For existing bookings, please provide your booking reference for priority queue routing.
          </p>

          {submitted ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-emerald-900">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <h3 className="font-display text-lg font-bold">Request Received</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-emerald-800">
                Thank you. Your support inquiry has been logged in our dispatch desk with high priority. A confirmation and reference ticket have been dispatched to your email.
              </p>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="mt-5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
              >
                Submit another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Your Name *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-sm text-slate-900 focus:border-neel focus:bg-white focus:outline-none focus:ring-1 focus:ring-neel"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Email Address *
                  </label>
                  <input
                    required
                    type="email"
                    placeholder="rahul@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-sm text-slate-900 focus:border-neel focus:bg-white focus:outline-none focus:ring-1 focus:ring-neel"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Phone Number (with country code)
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-sm text-slate-900 focus:border-neel focus:bg-white focus:outline-none focus:ring-1 focus:ring-neel"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Booking Reference (if applicable)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. IH-BKG-8492"
                    value={formData.bookingRef}
                    onChange={(e) => setFormData({ ...formData, bookingRef: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 font-mono text-sm uppercase text-slate-900 focus:border-neel focus:bg-white focus:outline-none focus:ring-1 focus:ring-neel"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Inquiry Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-sm text-slate-900 focus:border-neel focus:bg-white focus:outline-none focus:ring-1 focus:ring-neel"
                >
                  <option value="ACTIVE_TRIP">🚨 Urgent: Active Trip or Pickup Support</option>
                  <option value="BOOKING_INQUIRY">Existing Booking & Itinerary Modification</option>
                  <option value="CANCELLATION_REFUND">Cancellation & Refund Assistance</option>
                  <option value="CORPORATE_B2B">Corporate Travel & B2B Partnership</option>
                  <option value="FEEDBACK_GENERAL">General Feedback or Platform Query</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Message Details *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Please describe your query in detail, including relevant dates, locations, or traveler requirements..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-sm text-slate-900 focus:border-neel focus:bg-white focus:outline-none focus:ring-1 focus:ring-neel"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neel-deep py-3.5 text-sm font-extrabold text-white shadow-md transition hover:bg-neel disabled:opacity-50"
              >
                {submitting ? (
                  "Transmitting to Dispatch Desk..."
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Send Message to Operations Desk
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Quick Self-Service & Office Info */}
        <div className="space-y-6">
          {/* Quick Trips Link Card */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-genda-deep">
                <Ticket className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-stone-900">
                  Looking for your bookings?
                </h3>
                <p className="text-xs text-stone-500">
                  Access tickets, voucher QR codes, and driver details instantly.
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-stone-600">
              You can track your upcoming trip status, download GST receipts, or request immediate cancellation directly through the traveler portal.
            </p>
            <Link
              to="/bookings"
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-bold text-stone-950 shadow-sm"
            >
              Open My Bookings Portal
            </Link>
          </div>

          {/* Registered Office Details */}
          <div className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-8">
            <h3 className="font-display text-lg font-bold text-stone-900">
              Corporate Headquarters & Hub
            </h3>
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <div className="flex items-start gap-3">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <strong className="text-stone-900 font-bold">Idea Holiday Private Limited</strong>
                  <p className="text-xs text-stone-500">
                    Corporate Hub, New Delhi / Pan-India Network
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-xs text-stone-500">
                  Corporate Office Hours: 09:00 - 19:00 IST (Mon–Sat)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Headphones className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-800">
                  Traveler Operations Room: 24 Hours / 7 Days a Week
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="mt-16 rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-10">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
          <HelpCircle className="h-4 w-4 text-amber-600" /> Quick Answers
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold text-stone-900 sm:text-3xl">
          Frequently Asked Questions
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Find immediate answers to common questions regarding bookings, mobility coordination, and policy handling.
        </p>

        <div className="mt-8 divide-y divide-stone-100">
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
