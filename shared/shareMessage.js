// Ready-made WhatsApp messages for activity, city and blog pages, in English
// or Hindi (ADR 029). Only facts the page already shows go in: a price or
// rating is left out when the listing has none. Names stay as written.

const rupees = (value) => `₹${Math.round(Number(value)).toLocaleString("en-IN")}`;

/** The shared link, tagged so a visit from it shows up as WhatsApp in analytics. */
export function shareUrl(url) {
  const link = new URL(url);
  link.searchParams.set("utm_source", "whatsapp");
  link.searchParams.set("utm_medium", "share");
  return link.toString();
}

function activityFacts(data, lang) {
  const facts = [];
  if (Number(data.priceInr) > 0) facts.push(lang === "hi" ? `${rupees(data.priceInr)} से` : `from ${rupees(data.priceInr)}`);
  const reviews = Number(data.reviewCount) || 0;
  if (reviews > 0 && Number(data.rating) > 0) {
    const rating = Number(data.rating).toFixed(1);
    facts.push(lang === "hi" ? `★ ${rating} (${reviews} समीक्षाएँ)` : `★ ${rating} (${reviews} review${reviews === 1 ? "" : "s"})`);
  }
  return facts.join(", ");
}

/**
 * @param kind  "activity" { title, city, priceInr, rating, reviewCount, url }
 *              "city" { name, productCount, fromPriceInr, url }
 *              "blog" { title, url }
 */
export function shareMessage(kind, data, lang = "en") {
  const hi = lang === "hi";
  const url = shareUrl(data.url);
  if (kind === "activity") {
    const facts = activityFacts(data, lang);
    const where = data.city ? (hi ? `${data.city} में ` : ` in ${data.city}`) : "";
    return hi
      ? `Idea Holiday पर ${where}${data.title} देखें${facts ? ` — ${facts}` : ""}।\n${url}`
      : `Check out ${data.title}${where} on Idea Holiday${facts ? ` — ${facts}` : ""}.\n${url}`;
  }
  if (kind === "city") {
    const count = Number(data.productCount) || 0;
    const from = Number(data.fromPriceInr) > 0 ? rupees(data.fromPriceInr) : null;
    if (hi) return `${data.name} में करने लायक चीज़ें${count ? `: Idea Holiday पर ${count} अनुभव${from ? `, ${from} से` : ""}` : " — Idea Holiday पर"}।\n${url}`;
    return `Things to do in ${data.name}${count ? `: ${count} experience${count === 1 ? "" : "s"}${from ? ` from ${from}` : ""} on Idea Holiday` : " on Idea Holiday"}.\n${url}`;
  }
  return hi ? `${data.title} — Idea Holiday की ट्रैवल गाइड।\n${url}` : `${data.title} — a travel guide from Idea Holiday.\n${url}`;
}

/** Opens WhatsApp (app on phones, WhatsApp Web on computers) with the message ready to send. */
export function whatsappShareUrl(message) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
