import React, { useState } from "react";
import { BadgeCheck, CircleDashed } from "lucide-react";

const formatDate = (value) => {
  const date = new Date(String(value || "").replace(" ", "T"));
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
};

/**
 * Verified / Not verified, as the server decided it. `badge` is the object from
 * the public profile API; `verified` alone is enough for compact cards.
 * The detailed variant always explains what the badge means, so it is never
 * just a decoration.
 */
export default function SupplierBadge({ badge, verified, size = "sm", detailed = false }) {
  const [open, setOpen] = useState(false);
  const isVerified = badge ? badge.status === "VERIFIED" : Boolean(verified);
  const text = size === "sm" ? "text-[11px]" : "text-xs";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  const chip = isVerified ? (
    <span className={`inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 ${text}`}>
      <BadgeCheck className={icon} aria-hidden="true" /> Verified
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 font-semibold text-stone-500 ${text}`}>
      <CircleDashed className={icon} aria-hidden="true" /> Not verified
    </span>
  );

  if (!detailed) return chip;

  return (
    <span className="relative inline-flex items-center gap-1.5">
      {chip}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-[11px] font-semibold text-stone-500 underline underline-offset-2 hover:text-stone-800"
        aria-expanded={open}
      >
        What does this mean?
      </button>
      {open && (
        <span role="dialog" className="absolute left-0 top-full z-20 mt-2 w-72 rounded-2xl border border-stone-200 bg-white p-4 text-left text-xs leading-relaxed text-stone-600 shadow-xl">
          {isVerified ? (
            <>
              <strong className="block text-stone-900">Idea Holiday checked this business</strong>
              {badge?.checks?.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4">
                  {badge.checks.map((check) => <li key={check}>{check}</li>)}
                </ul>
              )}
              {badge?.verifiedAt && <span className="mt-2 block">Verified on {formatDate(badge.verifiedAt)}. Checked again every year.</span>}
            </>
          ) : (
            <>
              <strong className="block text-stone-900">Not yet verified</strong>
              This operator is registered on Idea Holiday but hasn't completed our yearly business verification. Book and pay on Idea Holiday so cancellations and support go through us.
            </>
          )}
        </span>
      )}
    </span>
  );
}
