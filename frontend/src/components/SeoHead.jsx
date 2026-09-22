import React, { useEffect } from "react";

/**
 * Reusable SEO Head component for dynamic Title, Meta, OpenGraph, Canonical, and Schema.org JSON-LD
 */
export default function SeoHead({
  title = "Idea Holiday — India's Premier Travel Experience Marketplace",
  description = "Book curated day tours, heritage sightseeing, scuba & water sports, airport transfers and holiday packages in India and across Asia with verified local operators.",
  keywords = "India tours, airport transfers, Goa water sports, Taj Mahal sunrise tour, Jaipur sightseeing, Kerala backwaters, Rishikesh river rafting, Golden triangle tour",
  canonical = "https://ideaholiday.in/",
  image = "https://ideaholiday.in/idea-holiday-social.png",
  imageAlt = null,
  lang = "en",
  alternates = null,
  type = "website",
  jsonLd = null,
  noindex = false,
}) {
  useEffect(() => {
    // 1. Update Document Title
    document.title = title.includes("Idea Holiday") ? title : `${title} | Idea Holiday`;

    // 2. Helper to set or update meta tag
    const setMetaTag = (attr, key, content) => {
      let element = document.querySelector(`meta[${attr}="${key}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attr, key);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content || "");
    };

    // Helper for link tags (like canonical)
    const setLinkTag = (rel, href) => {
      let element = document.querySelector(`link[rel="${rel}"]`);
      if (!element) {
        element = document.createElement("link");
        element.setAttribute("rel", rel);
        document.head.appendChild(element);
      }
      element.setAttribute("href", href);
    };

    // 3. Set Standard Meta
    setMetaTag("name", "description", description);
    setMetaTag("name", "keywords", keywords);
    setMetaTag("name", "robots", noindex ? "noindex, follow" : "index, follow");
    setLinkTag("canonical", canonical);

    // 4. Set Open Graph Meta
    setMetaTag("property", "og:title", title);
    setMetaTag("property", "og:description", description);
    setMetaTag("property", "og:image", image);
    if (imageAlt) setMetaTag("property", "og:image:alt", imageAlt);
    else document.querySelector('meta[property="og:image:alt"]')?.remove();
    setMetaTag("property", "og:url", canonical);
    setMetaTag("property", "og:type", type);

    // 5. Set Twitter Meta
    setMetaTag("name", "twitter:title", title);
    setMetaTag("name", "twitter:description", description);
    setMetaTag("name", "twitter:image", image);

    // Page language and its translations (hreflang), as the server writes them.
    document.documentElement.lang = lang;
    setMetaTag("property", "og:locale", lang === "hi" ? "hi_IN" : "en_IN");
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((element) => element.remove());
    for (const alternate of alternates || []) {
      const element = document.createElement("link");
      element.setAttribute("rel", "alternate");
      element.setAttribute("hreflang", alternate.hreflang);
      element.setAttribute("href", alternate.href);
      document.head.appendChild(element);
    }

    // 6. Inject / Update Schema.org JSON-LD
    let scriptTag = document.getElementById("structured-data-json-ld");
    if (jsonLd) {
      if (!scriptTag) {
        scriptTag = document.createElement("script");
        scriptTag.id = "structured-data-json-ld";
        scriptTag.type = "application/ld+json";
        document.head.appendChild(scriptTag);
      }
      scriptTag.textContent = JSON.stringify(jsonLd);
    } else if (scriptTag) {
      scriptTag.remove();
    }
    // A Hindi page's language must not stay on the next page, whatever it renders.
    return () => {
      document.documentElement.lang = "en";
      document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((element) => element.remove());
    };
  }, [title, description, keywords, canonical, image, imageAlt, lang, alternates, type, jsonLd, noindex]);

  return null;
}
