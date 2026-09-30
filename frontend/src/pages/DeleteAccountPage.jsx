import React from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import ContentPageLayout, { ArticleSection } from "../components/ContentPageLayout.jsx";
import SeoHead from "../components/SeoHead.jsx";

// The "Delete account" link Google Play asks for; requests are handled by the Grievance Officer (Privacy Policy §8).
const GRIEVANCE_EMAIL = "grievance@ideaholiday.in";
const MAILTO = `mailto:${GRIEVANCE_EMAIL}?subject=${encodeURIComponent("Delete my Idea Holiday account")}&body=${encodeURIComponent(
  "Please delete my Idea Holiday account.\n\nAccount email or mobile number:\nI use Idea Holiday as a (traveler / supplier / driver / creator):\n",
)}`;

function Bullets({ items }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export default function DeleteAccountPage() {
  return (
    <ContentPageLayout
      eyebrow="Legal & Compliance"
      title="Delete your account"
      intro="How to ask Idea Holiday Private Limited to delete your account and personal data, for the website, the supplier portal and the Idea Holiday, Idea Holiday Supplier and Idea Holiday Driver apps."
      badgeText="Your Data, Your Rights"
      badgeIcon={Trash2}
    >
      <SeoHead
        title="Delete your account | Idea Holiday"
        description="How to ask Idea Holiday to delete your account and personal data, what is deleted and what the law requires us to keep."
        canonical="https://ideaholiday.in/delete-account"
      />
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-10 lg:p-12">
        <ArticleSection number={1} title="How to ask">
          <p>
            Email <a href={MAILTO} className="font-bold text-neel underline">{GRIEVANCE_EMAIL}</a> from the email address
            on your account, with the subject “Delete my Idea Holiday account”. Tell us the mobile number or email you
            sign in with and whether you use Idea Holiday as a traveler, supplier, driver or creator. The same request
            covers the website and all our apps.
          </p>
          <a href={MAILTO} className="inline-block rounded-full bg-neel px-5 py-2 font-bold text-white">Email a deletion request</a>
          <p>
            We acknowledge your request within 24 hours and complete it within 15 business days. We may ask you to confirm
            the request from your account's email address or mobile number, so no one else can delete your account.
          </p>
          <p>
            If you have an upcoming booking, wallet or referral credit, or a payout still due to you, say so in your email
            and we will tell you what happens to it before we delete anything.
          </p>
        </ArticleSection>
        <ArticleSection number={2} title="What we delete">
          <Bullets items={[
            "Your account: name, email address, mobile number and password.",
            "Your profile, wishlist, saved details and marketing preferences.",
            "Business documents, bank details and staff logins, for supplier accounts, unless the law requires us to keep them (see below).",
          ]} />
          <p>You can also ask us to delete only some of your data, such as a review or photo, instead of the whole account.</p>
        </ArticleSection>
        <ArticleSection number={3} title="What we keep, and for how long">
          <Bullets items={[
            "Bookings, invoices and payment records: for as long as tax and accounting laws require.",
            "Records we must keep to meet a legal obligation, resolve a dispute or prevent fraud, only for as long as that need lasts.",
            "Driver location recorded during trips is deleted 30 days after it is recorded, whether or not you ask.",
          ]} />
          <p>
            Full details are in our <Link to="/privacy-policy" className="font-bold text-neel underline">Privacy Policy</Link>.
          </p>
        </ArticleSection>
      </div>
    </ContentPageLayout>
  );
}
