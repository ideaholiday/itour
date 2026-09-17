import React from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import ContentPageLayout, { ArticleSection } from "../components/ContentPageLayout.jsx";
import SeoHead from "../components/SeoHead.jsx";

const GRIEVANCE_EMAIL = "grievance@ideaholiday.in";

function Bullets({ items }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <ContentPageLayout
      eyebrow="Legal & Compliance · Last Updated: 17 September 2026"
      title="Privacy Policy"
      intro="How Idea Holiday Private Limited collects, uses, shares and protects personal data when you book, list a business, drive a trip or browse ideaholiday.in, and the rights you have under the Digital Personal Data Protection Act, 2023."
      badgeText="Your Data, Your Rights"
      badgeIcon={Lock}
    >
      <SeoHead
        title="Privacy Policy | Idea Holiday"
        description="What personal data Idea Holiday collects, why, who it is shared with, how long it is kept and how to exercise your rights."
        canonical="https://ideaholiday.in/privacy-policy"
      />
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10 lg:p-12">
        <ArticleSection number={1} title="Who we are">
          <p>
            <strong>Idea Holiday Private Limited</strong> (“Idea Holiday”, “we”, “us”) runs the travel marketplace at ideaholiday.in
            and the supplier portal at supply.ideaholiday.in. We are the data fiduciary for the personal data described here.
            Tour operators you book with receive the details they need to run your trip and handle them as independent businesses.
          </p>
        </ArticleSection>

        <ArticleSection number={2} title="What we collect">
          <p><strong>Travelers</strong></p>
          <Bullets items={[
            "Account details: name, email address, mobile number and password (stored only as a hash).",
            "Booking details: the experience, date, number of travelers, names of travelers where the operator needs them, pickup and drop locations, answers to booking questions and special requests.",
            "Payments: amounts, order and payment references. Card, UPI and bank details are entered on our payment gateway's page; we do not see or store them.",
            "Reviews and photos you choose to post, messages to operators and support, wishlist and wallet or referral credit.",
          ]} />
          <p><strong>Suppliers, drivers and creators</strong></p>
          <Bullets items={[
            "Business and contact details, GSTIN, PAN, bank account for payouts and business documents such as licences, used to verify the business and pay it.",
            "Drivers: name, mobile number and, only during an accepted, active trip after you are told who will see it, your phone's location.",
            "Creators and affiliates: PAN and payout details, required for tax deduction and payment.",
          ]} />
          <p><strong>Everyone who visits</strong></p>
          <Bullets items={[
            "Device and usage data: pages viewed, searches, approximate location from IP address, browser and device type, and page-speed measurements that carry no identifiers.",
            "Cookies and browser storage that keep you signed in, remember a referral or creator link for 30 days, and measure visits and marketing campaigns (see section 6).",
          ]} />
        </ArticleSection>

        <ArticleSection number={3} title="Why we use it">
          <Bullets items={[
            "To create your account, hold seats, take payment, confirm bookings, issue vouchers and process cancellations and refunds.",
            "To send booking confirmations, reminders, trip updates and driver details by email, SMS and WhatsApp.",
            "To verify suppliers and creators, pay them and meet tax and accounting obligations (including GST and TDS).",
            "To show a traveler where their driver is during a trip, and to alert our operations team to missed pickups.",
            "To prevent fraud and abuse, keep the platform secure and resolve disputes.",
            "To understand how the site is used, improve it and measure our advertising.",
            "To send offers or newsletters, only where you have agreed; every such email has an unsubscribe link.",
          ]} />
          <p>
            We process personal data with your consent, which you give when you sign up, book or submit a form, or for
            legitimate uses the law allows, such as meeting legal obligations and responding to emergencies.
          </p>
        </ArticleSection>

        <ArticleSection number={4} title="Who we share it with">
          <Bullets items={[
            "The operator (and its driver or guide) running your booking: the traveler names, contact number, pickup details and requests they need to deliver it.",
            "Payment gateways (Cashfree Payments) to take payments and refunds, and to verify PAN, GSTIN and bank accounts.",
            "Service providers that host or deliver our services on our instructions: cloud hosting and database (Google Cloud, Supabase), email (Brevo, Amazon Web Services), SMS (Twilio), WhatsApp (Meta), and maps and location search (Ola Maps, MapmyIndia).",
            "Analytics and advertising measurement (Google Analytics and Google Tag Manager, and advertising tags from Google and Meta where enabled).",
            "Government authorities, courts or law enforcement when the law requires it.",
          ]} />
          <p>We do not sell personal data. Service providers may process data outside India where the law permits.</p>
        </ArticleSection>

        <ArticleSection number={5} title="How long we keep it">
          <Bullets items={[
            "Account data: while your account is open. When you ask us to delete it, we erase it unless the law requires us to keep part of it.",
            "Bookings, invoices and payment records: for as long as tax and accounting laws require.",
            "Driver location during trips: deleted 30 days after it is recorded.",
            "Review invitation links expire after 30 days.",
          ]} />
        </ArticleSection>

        <ArticleSection number={6} title="Cookies and similar technologies">
          <p>
            Essential storage keeps you signed in, protects checkout and remembers a referral link. Analytics and advertising
            cookies, loaded through Google Tag Manager, tell us which pages and campaigns lead to bookings. You can block or
            delete cookies in your browser settings; essential features such as sign-in may then stop working.
          </p>
        </ArticleSection>

        <ArticleSection number={7} title="How we protect it">
          <p>
            All traffic is encrypted with HTTPS. Passwords are hashed, pickup codes are stored encrypted, verification documents
            are never publicly reachable, access to personal data is limited by role, and our logs mask contact details and
            remove secrets. No system is perfectly secure; if a breach affects you, we will notify you and the Data Protection
            Board of India as the law requires.
          </p>
        </ArticleSection>

        <ArticleSection number={8} title="Your rights">
          <Bullets items={[
            "Access the personal data we hold about you and how it is used.",
            "Correct, complete or update it.",
            "Erase it, where we are not required by law to keep it.",
            "Withdraw consent at any time. This does not affect processing already done, and some services may stop.",
            "Nominate someone to exercise these rights if you die or become unable to.",
            "Raise a grievance with us, and then with the Data Protection Board of India if you are not satisfied.",
          ]} />
          <p>
            Write to <a href={`mailto:${GRIEVANCE_EMAIL}`} className="font-bold text-neel underline">{GRIEVANCE_EMAIL}</a> from
            the email address on your account.
          </p>
        </ArticleSection>

        <ArticleSection number={9} title="Grievance Officer and changes">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <strong className="text-neel-deep">Grievance Officer</strong>
            <p className="mt-1 text-sm text-slate-700">Idea Holiday Private Limited</p>
            <p className="text-sm text-slate-600">Email: <a href={`mailto:${GRIEVANCE_EMAIL}`} className="font-bold text-neel">{GRIEVANCE_EMAIL}</a></p>
            <p className="mt-1 text-xs text-slate-500">Acknowledgment within 24 hours; resolution within 15 business days.</p>
          </div>
          <p>
            We will post any change to this policy on this page and update the date above. See also our <Link to="/terms" className="font-bold text-neel underline">Terms &amp; Conditions</Link> and{" "}
            <Link to="/cancellation" className="font-bold text-neel underline">Cancellation &amp; Refund Policy</Link>.
          </p>
        </ArticleSection>
      </div>
    </ContentPageLayout>
  );
}
