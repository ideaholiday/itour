import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import SeoHead from "../components/SeoHead.jsx";
import EnquiryInbox from "../components/EnquiryInbox.jsx";

/** A traveler's enquiries to operators, sent from operator profiles. */
export function TravelerMessages() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SeoHead title="Messages | Idea Holiday" noindex />
      <h1 className="font-display text-3xl font-bold text-stone-900">Messages</h1>
      <p className="mt-2 text-sm text-stone-600">
        Your questions to operators and their replies. <Link to="/suppliers" className="font-bold text-amber-800 underline underline-offset-2">Find an operator</Link>
      </p>
      <div className="mt-6">
        {user ? (
          <EnquiryInbox viewer="TRAVELER" />
        ) : (
          <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-stone-600">Sign in to see your messages.</p>
            <Link to={`/login?from=${encodeURIComponent(location.pathname + location.search)}`} className="mt-4 inline-flex rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950">Sign in</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default TravelerMessages;
