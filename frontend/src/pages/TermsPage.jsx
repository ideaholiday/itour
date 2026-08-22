import React, { useState } from "react";
import {
  FileText,
  HelpCircle,
  Mail,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import ContentPageLayout, { ArticleSection } from "../components/ContentPageLayout.jsx";

const sections = [
  { id: 1, title: "Preamble & Acceptance of Terms" },
  { id: 2, title: "Scope of Services & Dual Operating Model" },
  { id: 3, title: "Account Registration & Corporate Profiles" },
  { id: 4, title: "Pricing Architecture, Taxes (GST) & Payments" },
  { id: 5, title: "Booking Confirmation & Digital Vouchers" },
  { id: 6, title: "Traveler Obligations, Punctuality & Safety" },
  { id: 7, title: "Operator Accreditation & Performance Standards" },
  { id: 8, title: "Operational Adjustments & Force Majeure" },
  { id: 9, title: "Cancellations, Modifications & Refunds" },
  { id: 10, title: "Intellectual Property & Authentic Reviews" },
  { id: 11, title: "Limitation of Liability & Consumer Protection" },
  { id: 12, title: "Governing Law, Dispute Resolution & Grievance Officer" },
];

export default function TermsPage() {
  const [activeSection, setActiveSection] = useState(1);

  const scrollToSection = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <ContentPageLayout
      eyebrow="Legal & Compliance · Last Updated: 13 August 2026"
      title="Terms & Conditions of Service"
      intro="These Terms and Conditions constitute a legally binding agreement between you ('Traveler', 'User', or 'Corporate Client') and Idea Holiday Private Limited, governing your access to and utilization of our travel booking ecosystem."
      badgeText="Statutory Compliance"
      badgeIcon={Scale}
    >
      <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
        {/* Sticky Table of Contents */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3 text-xs font-extrabold uppercase tracking-wider text-stone-900">
              <FileText className="h-4 w-4 text-amber-600" /> Table of Contents
            </div>
            <nav className="mt-3 space-y-1 text-xs">
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => scrollToSection(sec.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold transition ${
                    activeSection === sec.id
                      ? "bg-amber-500 text-stone-950 font-bold shadow-sm"
                      : "text-stone-600 hover:bg-stone-50 hover:text-amber-800"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-70">
                    {String(sec.id).padStart(2, "0")}
                  </span>
                  <span className="truncate">{sec.title}</span>
                </button>
              ))}
            </nav>

            <div className="mt-6 rounded-2xl bg-stone-50 p-3 text-[11px] text-stone-500 border border-stone-200">
              <span className="font-bold text-stone-700">Need legal assistance?</span>
              <p className="mt-1">
                Reach our corporate compliance desk at{" "}
                <a href="mailto:grievance@ideaholiday.in" className="font-bold text-neel underline">
                  grievance@ideaholiday.in
                </a>
              </p>
            </div>
          </div>
        </aside>

        {/* Content Body */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10 lg:p-12">
          <ArticleSection number={1} title="Preamble & Acceptance of Terms" badge="Binding Contract">
            <p>
              Welcome to <strong>Idea Holiday</strong>, owned and operated by <strong>Idea Holiday Private Limited</strong> (referred to herein as <strong>“Idea Holiday”</strong>, <strong>“Company”</strong>, <strong>“we”</strong>, <strong>“us”</strong>, or <strong>“our”</strong>), a private limited company incorporated under the laws of the Republic of India.
            </p>
            <p>
              By accessing, browsing, registering on, or utilizing our website (<strong>ideaholiday.in</strong>), mobile applications, booking APIs, or customer support channels, you irrevocably acknowledge that you have read, understood, and agreed to be legally bound by these Terms and Conditions, together with our Privacy Policy, Cancellation & Refund Policy, and any experience-specific terms disclosed during checkout.
            </p>
            <p>
              If you do not unconditionally agree to these Terms, you must discontinue your use of our platform and services immediately.
            </p>
          </ArticleSection>

          <ArticleSection number={2} title="Scope of Services & Dual Operating Model">
            <p>
              Idea Holiday operates an integrated technology and logistics travel platform offering curated destination tours, attraction admissions, cultural activities, airport transfers, intercity mobility, and bespoke itineraries (collectively, <strong>“Experiences”</strong>).
            </p>
            <p>
              Our platform operates under a transparent dual-structure model:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Direct Proprietary Experiences:</strong> Where Idea Holiday manages and executes the trip directly, clearly denoted as "Operated by Idea Holiday".
              </li>
              <li>
                <strong>Curated Marketplace Experiences:</strong> Where independent, accredited third-party operators, destination management companies (DMCs), or transport providers (<strong>“Suppliers”</strong>) operate the service under strict Service Level Agreements (SLAs) enforced by our operations desk.
              </li>
            </ul>
          </ArticleSection>

          <ArticleSection number={3} title="Account Registration & Corporate Profiles">
            <p>
              To complete certain reservations, manage booking histories, or download official tax vouchers, users may be required to maintain an authenticated account. You agree to provide accurate, current, and complete information during registration.
            </p>
            <p>
              Corporate accounts and travel managers booking on behalf of organizations represent and warrant that they possess full legal authority to bind their entity to these terms and are responsible for all traveler details submitted under their profile.
            </p>
          </ArticleSection>

          <ArticleSection number={4} title="Pricing Architecture, Taxes (GST) & Payments">
            <p>
              All prices displayed on Idea Holiday are quoted in Indian Rupees (INR) unless otherwise selected via our multi-currency converter. We maintain strict pricing integrity: the total amount presented before final checkout is inclusive of all mandatory charges and applicable Goods and Services Tax (GST).
            </p>
            <p>
              Payments are securely collected via PCI-DSS compliant payment gateways, supporting major credit/debit cards, UPI, net banking, and verified corporate payment lines. You authorize Idea Holiday or its authorized merchant partners to charge the confirmed payable amount.
            </p>
          </ArticleSection>

          <ArticleSection number={5} title="Booking Confirmation & Digital Vouchers">
            <p>
              Upon successful payment authorization, Idea Holiday issues a confirmation notification and an official digital voucher containing a unique Booking Reference, traveler name, pickup details, inclusions, emergency numbers, and a scannable QR ticket.
            </p>
            <p>
              Travelers must present this digital voucher along with a recognized government photo ID (such as Aadhaar, Passport, or Voter ID) at the meeting point or upon chauffeur arrival.
            </p>
          </ArticleSection>

          <ArticleSection number={6} title="Traveler Obligations, Punctuality & Safety">
            <p>
              Travelers are responsible for:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Arriving at designated meeting points or pickup lobbies at least 15 minutes prior to the scheduled departure time.</li>
              <li>Complying with all safety instructions, dress codes (for heritage/religious sites), age limitations, and physical fitness guidelines disclosed on the listing.</li>
              <li>Ensuring valid visa, passport, or domestic permits are carried where mandated by local authorities.</li>
            </ul>
            <p>
              Failure to arrive at the confirmed time or location without prior notice may result in the booking being classified as a no-show, forfeiting eligibility for refund.
            </p>
          </ArticleSection>

          <ArticleSection number={7} title="Operator Accreditation & Performance Standards">
            <p>
              All independent Suppliers featured on Idea Holiday must undergo our 28-point accreditation audit, verifying valid commercial carrier permits, comprehensive vehicle insurance, driver background checks, and adherence to safety guidelines.
            </p>
            <p>
              Idea Holiday continuously monitors customer satisfaction ratings and reserves the right to immediately suspend or terminate any Supplier failing to meet our strict quality and punctuality metrics.
            </p>
          </ArticleSection>

          <ArticleSection number={8} title="Operational Adjustments & Force Majeure">
            <p>
              Unforeseen circumstances, including severe weather advisories, sudden road closures, administrative orders, natural disasters, or unexpected monument closures (<strong>“Force Majeure Events”</strong>), may necessitate itinerary adjustments or rescheduling.
            </p>
            <p>
              In such circumstances, Idea Holiday’s operations room will proactively coordinate an alternative itinerary, a rescheduled time slot, or an appropriate credit/refund in accordance with our Cancellation & Refund Policy.
            </p>
          </ArticleSection>

          <ArticleSection number={9} title="Cancellations, Modifications & Refunds">
            <p>
              Cancellation and rescheduling terms are experience-specific and prominently displayed on each product page and confirmation voucher. For detailed timelines and step-by-step procedures, please consult our official{" "}
              <a href="/cancellation" className="font-bold text-neel underline">
                Cancellation & Refund Policy
              </a>
              .
            </p>
            <p>
              Approved refunds are credited back to the original source of payment within 3 to 7 business days, depending on your issuing bank or payment provider.
            </p>
          </ArticleSection>

          <ArticleSection number={10} title="Intellectual Property & Authentic Reviews">
            <p>
              All content on the Idea Holiday platform—including brand assets, logos, design architecture, copy, imagery, and software—is the exclusive intellectual property of Idea Holiday Private Limited or its licensors and is protected by Indian and international copyright laws.
            </p>
            <p>
              Only verified travelers who have completed a booking are permitted to submit ratings and reviews. Idea Holiday maintains a strict anti-manipulation policy; commercial endorsements or paid reviews are prohibited and promptly removed.
            </p>
          </ArticleSection>

          <ArticleSection number={11} title="Limitation of Liability & Consumer Protection">
            <p>
              Nothing in these Terms shall limit or exclude any statutory consumer rights that cannot be legally excluded under the Consumer Protection Act, 2019.
            </p>
            <p>
              To the maximum extent permitted by applicable law, Idea Holiday shall not be liable for indirect, incidental, punitive, or consequential damages resulting from third-party Supplier delays, personal property loss, or unauthorized traveler deviations from confirmed itineraries.
            </p>
          </ArticleSection>

          <ArticleSection number={12} title="Governing Law, Dispute Resolution & Grievance Officer">
            <p>
              These Terms shall be governed by, construed, and enforced in accordance with the substantive laws of the Republic of India. Any dispute, controversy, or claim arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the competent courts in New Delhi, India.
            </p>
            <p>
              In accordance with the Information Technology Act, 2000 and the Consumer Protection (E-Commerce) Rules, 2020, the designated Grievance Redressal Officer for Idea Holiday Private Limited is:
            </p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-5 border border-slate-200">
              <strong className="text-neel-deep">Nodal Grievance Redressal Officer</strong>
              <p className="mt-1 text-sm text-slate-700">Idea Holiday Private Limited</p>
              <p className="text-sm text-slate-600">Email: <a href="mailto:grievance@ideaholiday.in" className="font-bold text-neel">grievance@ideaholiday.in</a></p>
              <p className="text-xs text-slate-500 mt-1">Official Response Window: Acknowledgment within 24 hours; Resolution within 15 business days.</p>
            </div>
          </ArticleSection>
        </div>
      </div>
    </ContentPageLayout>
  );
}
