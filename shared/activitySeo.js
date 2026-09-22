import { activityPath } from "./activityUrl.js";
import { destinationPath } from "./destinationSeo.js";

// Search and link-preview tags for an activity page. The server writes them into
// the HTML (WhatsApp, Instagram and Facebook previews never run JavaScript) and
// ActivityDetail sets the same values in the browser, so the two never disagree.

const SITE = "https://ideaholiday.in";
export const DEFAULT_SOCIAL_IMAGE = `${SITE}/idea-holiday-social.png`;

function excerpt(text, max = 155) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/** "LUCKNOW" or "kanpur" as typed by a supplier reads as "Lucknow" / "Kanpur"; mixed case is kept. */
export function displayCity(value) {
  const city = String(value || "").replace(/\s+/g, " ").trim();
  if (city !== city.toUpperCase() && city !== city.toLowerCase()) return city;
  return city.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, gap, letter) => `${gap}${letter.toUpperCase()}`);
}

export function absoluteImage(url, baseUrl) {
  const value = String(url || "").trim();
  if (/^https:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${baseUrl}${value}`;
  return null;
}

/**
 * @param product  title, city, category, shortDesc, priceInr, images[], rating, reviewCount
 * @param options  baseUrl, isPackage, categoryLabel
 */
export function activitySeo(product, { baseUrl = SITE, isPackage = false, categoryLabel = "" } = {}) {
  const canonical = `${baseUrl}${activityPath(product)}`;
  const city = displayCity(product.city);
  const title = String(product.title || "Experience").trim();
  const inCity = city && !title.toLowerCase().includes(city.toLowerCase()) ? ` in ${city}` : "";
  const images = (product.images || []).map((url) => absoluteImage(url, baseUrl)).filter(Boolean);
  const image = images[0] || DEFAULT_SOCIAL_IMAGE;
  const price = Number(product.priceInr);
  const reviewCount = Number(product.reviewCount || 0);

  const node = {
    "@type": isPackage ? "TouristTrip" : "Product",
    "@id": `${canonical}#product`,
    name: title,
    description: excerpt(product.shortDesc, 500) || title,
    image: images.length ? images : [DEFAULT_SOCIAL_IMAGE],
    ...(product.category || categoryLabel ? { category: product.category || categoryLabel } : {}),
    // No price, no offer: a made-up price in structured data misleads search results.
    ...(price > 0 ? {
      offers: {
        "@type": "Offer", priceCurrency: "INR", price,
        availability: "https://schema.org/InStock",
        url: canonical,
        seller: { "@type": "Organization", name: "Idea Holiday" },
      },
    } : {}),
    // Emitted only when verified reviews exist. A rating in structured data
    // that no traveler gave is a search-engine policy breach, not a default.
    ...(reviewCount > 0 && product.rating ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: Number(product.rating),
        reviewCount,
        bestRating: "5", worstRating: "1",
      },
    } : {}),
  };
  const crumbs = [
    { name: "Home", item: `${baseUrl}/` },
    ...(city ? [{ name: city, item: `${baseUrl}${destinationPath(city)}` }] : []),
    { name: title, item: canonical },
  ];

  return {
    title: `${title}${inCity} - Book on Idea Holiday`,
    description: excerpt(product.shortDesc) || `Book ${title}${inCity} on Idea Holiday. See live availability and prices.`,
    canonical,
    image,
    type: "product",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        node,
        { "@type": "BreadcrumbList", itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.item })) },
      ],
    },
  };
}
