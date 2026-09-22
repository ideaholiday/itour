import React, { useState } from "react";
import { MessageCircle } from "lucide-react";
import { analytics } from "../lib/analytics.js";
import { useCreatorCode } from "../lib/creatorCode.js";
import { shareMessage, whatsappShareUrl } from "../../../shared/shareMessage.js";

const LABEL = { en: "Share on WhatsApp", hi: "WhatsApp पर शेयर करें" };

/**
 * A WhatsApp share button with the message in English or Hindi (ADR 029).
 * `urls` gives the page to link per language (a Hindi city page links to /hi/…).
 * A signed-in active creator's code is added to the link (ADR 030).
 */
export default function WhatsAppShare({ kind, data, urls, defaultLang = "en", itemId, className = "" }) {
  const [lang, setLang] = useState(defaultLang);
  const creatorCode = useCreatorCode();
  const message = shareMessage(kind, { ...data, url: urls[lang] || urls.en, creatorCode }, lang);

  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <a
        href={whatsappShareUrl(message)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => analytics.pushEvent("share", { method: "whatsapp", content_type: kind, item_id: itemId, language: lang, creator_link: Boolean(creatorCode) })}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 py-1.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1ebe5b]"
      >
        <MessageCircle className="h-4 w-4" /> <span lang={lang}>{LABEL[lang]}</span>
      </a>
      <div role="group" aria-label="Message language" className="inline-flex overflow-hidden rounded-full border border-stone-300 bg-white text-xs font-bold">
        {[["en", "EN"], ["hi", "हिं"]].map(([code, short]) => (
          <button
            key={code}
            type="button"
            aria-pressed={lang === code}
            title={code === "en" ? "Message in English" : "हिन्दी में संदेश"}
            onClick={() => setLang(code)}
            className={`px-2.5 py-1.5 ${lang === code ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
          >
            {short}
          </button>
        ))}
      </div>
      {creatorCode && (
        <span className="text-xs font-semibold text-emerald-800" title="Bookings from this link count toward your creator earnings">
          {lang === "hi" ? `आपका कोड ${creatorCode} लिंक में है` : `Your code ${creatorCode} is in the link`}
        </span>
      )}
    </div>
  );
}
