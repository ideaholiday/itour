import { activityPath } from "./activityUrl.js";
import { absoluteImage, DEFAULT_SOCIAL_IMAGE } from "./activitySeo.js";

// "Things to do in <city>" pages. The server writes these tags into the HTML and
// DestinationPage sets the same values in the browser. Every sentence is built
// from live listings, so nothing here can claim what the catalogue doesn't hold.

const SITE = "https://ideaholiday.in";

/** "Navi Mumbai" → "navi-mumbai"; accents are dropped, other scripts kept. */
export function destinationSlug(name) {
  return String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

/** Languages a city page is published in; English is the default (ADR 028). */
export const DESTINATION_LANGS = ["en", "hi"];

export function destinationPath(name, lang = "en") {
  return `${lang === "hi" ? "/hi" : ""}/things-to-do/${encodeURIComponent(destinationSlug(name))}`;
}

/** hreflang links for a city page: each language points at every version. */
export function destinationAlternates(name, baseUrl = SITE) {
  return [
    { hreflang: "en-IN", href: `${baseUrl}${destinationPath(name, "en")}` },
    { hreflang: "hi-IN", href: `${baseUrl}${destinationPath(name, "hi")}` },
    { hreflang: "x-default", href: `${baseUrl}${destinationPath(name, "en")}` },
  ];
}

const rupees = (value) => `₹${Math.round(Number(value)).toLocaleString("en-IN")}`;

function listOf(items, and = "and") {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

// Hindi copy. City and listing names stay as written: suppliers write them in
// English, and a guessed transliteration could name the wrong place.
const HI = {
  best: (name) => `${name} में करने लायक सबसे अच्छी चीज़ें कौन-सी हैं?`,
  bestAnswer: (name, titles, count) => `Idea Holiday पर ${name} के लोकप्रिय विकल्प हैं: ${listOf(titles, "और")}। कुल ${count} अनुभव बुक किए जा सकते हैं।`,
  price: (name) => `${name} में टूर और एक्टिविटी की कीमत कितनी है?`,
  priceAnswer: (name, from) => `${name} में लिस्टिंग ${from} से शुरू होती हैं। अपनी तारीख और ग्रुप की कीमत देखने के लिए लिस्टिंग खोलें।`,
  cab: (name) => `क्या ${name} में कैब या एयरपोर्ट ट्रांसफ़र बुक हो सकता है?`,
  cabAnswer: (name, count) => `हाँ। Idea Holiday पर ${name} में ${count} ट्रांसफ़र बुक किए जा सकते हैं।`,
  pageName: (name) => `${name} में करने लायक चीज़ें`,
  title: (name) => `${name} में करने लायक चीज़ें: टूर, एक्टिविटी और कैब | Idea Holiday`,
  description: (place, count, from) => `${place} में ${count} अनुभव।${from ? ` ${from} से शुरू।` : ""} स्थानीय ऑपरेटरों से लाइव उपलब्धता के साथ Idea Holiday पर बुक करें।`,
  emptyDescription: (place) => `${place} में टूर, एक्टिविटी और कैब, Idea Holiday पर।`,
  home: "होम",
};

function excerpt(text, max = 155) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * Questions answered from the listings themselves. The page shows them, which
 * is what lets FAQPage structured data describe them.
 * @param view  name, products [{ title, product_type }], productCount, fromPriceInr
 */
export function destinationFaqs(view, lang = "en") {
  const hi = lang === "hi";
  const faqs = [];
  const titles = (view.products || []).slice(0, 3).map((product) => String(product.title || "").trim()).filter(Boolean);
  if (titles.length) {
    if (hi) faqs.push({ question: HI.best(view.name), answer: HI.bestAnswer(view.name, titles, view.productCount) });
    else faqs.push({
      question: `What are the best things to do in ${view.name}?`,
      answer: `Popular picks on Idea Holiday in ${view.name} include ${listOf(titles)}. There ${view.productCount === 1 ? "is 1 experience" : `are ${view.productCount} experiences`} to book in all.`,
    });
  }
  if (Number(view.fromPriceInr) > 0) {
    if (hi) faqs.push({ question: HI.price(view.name), answer: HI.priceAnswer(view.name, rupees(view.fromPriceInr)) });
    else faqs.push({
      question: `How much do tours and activities in ${view.name} cost?`,
      answer: `Listings in ${view.name} start from ${rupees(view.fromPriceInr)}. Open a listing to see the price for your date and group.`,
    });
  }
  const transfers = (view.products || []).filter((product) => String(product.product_type || "").toUpperCase() === "TRANSFER").length;
  if (transfers) {
    if (hi) faqs.push({ question: HI.cab(view.name), answer: HI.cabAnswer(view.name, transfers) });
    else faqs.push({
      question: `Can I book a cab or airport transfer in ${view.name}?`,
      answer: `Yes. There ${transfers === 1 ? "is 1 transfer" : `are ${transfers} transfers`} in ${view.name} you can book on Idea Holiday.`,
    });
  }
  return faqs;
}

/**
 * @param view  name, state, country, tagline, heroImage, products[], productCount, fromPriceInr, categories [{ name }]
 */
export function destinationSeo(view, { baseUrl = SITE, lang = "en" } = {}) {
  const hi = lang === "hi";
  const canonical = `${baseUrl}${destinationPath(view.name, lang)}`;
  const products = view.products || [];
  const place = [view.name, view.state].filter(Boolean).join(", ");
  const kinds = (view.categories || []).slice(0, 3).map((category) => category.name.toLowerCase());
  const from = Number(view.fromPriceInr) > 0 ? rupees(view.fromPriceInr) : null;
  const description = hi
    ? (view.productCount > 0 ? excerpt(HI.description(place, view.productCount, from)) : HI.emptyDescription(place))
    : view.productCount > 0
    ? excerpt(`${view.productCount} thing${view.productCount === 1 ? "" : "s"} to do in ${place}${kinds.length ? `: ${listOf(kinds)}` : ""}.${Number(view.fromPriceInr) > 0 ? ` From ${rupees(view.fromPriceInr)}.` : ""} Book from local operators with live availability on Idea Holiday.`)
    : `Tours, activities and cabs in ${place} on Idea Holiday.`;
  const image = absoluteImage(view.heroImage, baseUrl)
    || products.map((product) => absoluteImage(product.hero_image, baseUrl)).find(Boolean)
    || DEFAULT_SOCIAL_IMAGE;
  const faqs = destinationFaqs(view, lang);

  const graph = [
    {
      "@type": "CollectionPage",
      "@id": `${canonical}#page`,
      name: hi ? HI.pageName(view.name) : `Things to do in ${view.name}`,
      url: canonical,
      inLanguage: hi ? "hi-IN" : "en-IN",
      description,
      about: { "@type": "Place", name: view.name, ...(view.state ? { containedInPlace: { "@type": "Place", name: view.state } } : {}) },
      ...(products.length ? {
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: Math.min(products.length, 30),
          itemListElement: products.slice(0, 30).map((product, index) => ({
            "@type": "ListItem", position: index + 1, name: product.title, url: `${baseUrl}${activityPath(product)}`,
          })),
        },
      } : {}),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: hi ? HI.home : "Home", item: `${baseUrl}/` },
        { "@type": "ListItem", position: 2, name: view.name, item: canonical },
      ],
    },
    ...(faqs.length ? [{
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
    }] : []),
  ];

  return {
    title: hi ? HI.title(view.name) : `Things to Do in ${view.name}: Tours, Activities & Cabs | Idea Holiday`,
    description,
    canonical,
    image,
    robots: view.productCount > 0 ? "index, follow" : "noindex, follow",
    lang: hi ? "hi" : "en",
    alternates: destinationAlternates(view.name, baseUrl),
    jsonLd: { "@context": "https://schema.org", "@graph": graph },
  };
}
