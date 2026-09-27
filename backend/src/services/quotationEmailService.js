import { findQuotation, quotationShareUrl, quotationView } from "./quotationService.js";
import { cityImages, presentQuotation, quotationTheme, themeStyle } from "./quotationPresentation.js";
import { listHotels } from "./supplierHotelService.js";
import { listCabTypes } from "./supplierRateSheetService.js";
import { findAgent } from "./supplierAgentService.js";

/**
 * The quotation email (ADR 051): an HTML email in the quotation's theme with the
 * trip at a glance, the first days, the price and a button to the web itinerary,
 * plus a plain-text version. The PDF still goes as an attachment. The customer's
 * email is branded; the agent's is the unbranded trade copy with its net price
 * and no link to the branded page.
 */

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const HIGHLIGHT_DAYS = 4;

/** Renders the email from the presentation (presentQuotation) and its theme style. */
export function renderQuotationEmail(view, style, { greetingName = "", message = "", shareUrl = null } = {}) {
  const s = style;
  const font = "font-family:Helvetica,Arial,sans-serif;";
  const serif = `font-family:${s.webHeading.replace(/"/g, "'")};`;
  const chain = view.route.map((leg) => `${leg.city} ${leg.nights}N`).join(" → ");
  const priceRows = view.options.length
    ? view.options.map((option) => `<tr><td style="${font}padding:8px 0;color:${s.ink};font-size:15px;border-bottom:1px solid ${s.line}">${esc(option.name)}<br><span style="color:${s.muted};font-size:12px">${esc(option.stays.map((stay) => stay.name).join(", "))}</span></td><td align="right" style="${font}padding:8px 0;color:${s.ink};font-size:17px;font-weight:bold;border-bottom:1px solid ${s.line}">${inr(option.totals.totalInr)}</td></tr>`).join("")
    : `<tr><td style="${font}color:${s.onPrimary};font-size:14px">${esc(view.priceLabel)}${view.totals.gstInr > 0 ? ` + GST ${view.totals.gstPct}%` : ""}</td><td align="right" style="${font}color:#ffffff;font-size:26px;font-weight:bold">${inr(view.totals.totalInr)}</td></tr>${view.people > 1 ? `<tr><td></td><td align="right" style="${font}color:${s.onPrimary};font-size:12px">about ${inr(view.totals.perPersonInr)} per person</td></tr>` : ""}`;
  const priceBlock = view.options.length
    ? `<p style="${serif}font-size:20px;color:${s.ink};margin:0 0 8px">${view.isAgent ? "Hotel options (net)" : "Choose your hotels"}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${priceRows}</table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${s.primary};border-radius:12px"><tr><td style="padding:18px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${priceRows}</table></td></tr></table>`;
  const days = view.days.slice(0, HIGHLIGHT_DAYS).map((day) => `<tr><td valign="top" width="54" style="padding:0 0 12px"><div style="${font}width:40px;height:40px;border-radius:20px;background:${s.primary};color:#ffffff;text-align:center;line-height:40px;font-weight:bold;font-size:15px">${day.dayNumber}</div></td><td valign="top" style="padding:0 0 12px"><p style="${font}margin:0;color:${s.accent};font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px">${esc(day.date)}${day.city ? ` · ${esc(day.city)}` : ""}</p><p style="${serif}margin:2px 0 0;color:${s.ink};font-size:17px">${esc(day.title || `Day ${day.dayNumber}`)}</p></td></tr>`).join("");
  const moreDays = view.days.length > HIGHLIGHT_DAYS ? `<p style="${font}color:${s.muted};font-size:13px;margin:0">…and ${view.days.length - HIGHLIGHT_DAYS} more day${view.days.length - HIGHLIGHT_DAYS === 1 ? "" : "s"}. ${shareUrl ? "See the full plan online." : "The full plan is in the PDF."}</p>` : "";
  const phoneDigits = String(view.brand?.phone || "").replace(/\D/g, "");
  const button = (href, label, background) => `<a href="${esc(href)}" style="${font}display:inline-block;background:${background};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 22px;border-radius:10px;margin:4px 6px 4px 0">${label}</a>`;
  const buttons = [
    shareUrl ? button(shareUrl, "View your itinerary", s.primary) : "",
    !view.isAgent && phoneDigits ? button(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hello, about quotation ${view.ref}`)}`, "WhatsApp us", "#059669") : "",
  ].join("");
  const facts = [["Dates", view.dates], ["Duration", view.duration], ["Travellers", view.travellers]]
    .map(([label, value]) => `<td valign="top" style="padding:12px;background:${s.soft};border-radius:8px"><p style="${font}margin:0;color:${s.muted};font-size:11px;text-transform:uppercase;letter-spacing:.5px">${label}</p><p style="${font}margin:4px 0 0;color:${s.ink};font-size:14px;font-weight:bold">${esc(value)}</p></td>`)
    .join(`<td width="8"></td>`);
  const inclusions = view.inclusions.length ? `<p style="${serif}font-size:18px;color:${s.ink};margin:24px 0 8px">What's included</p>${view.inclusions.slice(0, 6).map((item) => `<p style="${font}margin:0 0 4px;color:${s.ink};font-size:14px"><span style="color:${s.accent}">✓</span> ${esc(item)}</p>`).join("")}` : "";
  const greeting = greetingName ? `Hello ${esc(greetingName)},` : "Hello,";
  const intro = view.isAgent ? `Here is the trade quotation for <strong>${esc(view.title)}</strong>. The PDF is attached; its net rates are for your agency only, please do not forward.` : `Here is your quotation for <strong>${esc(view.title)}</strong>. Open your itinerary for the full day-by-day plan; the PDF is attached too.`;
  const note = String(message || "").trim() ? `<p style="${font}margin:0 0 16px;color:${s.ink};font-size:15px;line-height:1.55;padding:12px 16px;border-left:3px solid ${s.accent};background:${s.soft}">${esc(message.trim()).replace(/\n/g, "<br>")}</p>` : "";
  const footer = view.brand
    ? `<strong style="color:${s.ink}">${esc(view.brand.name)}</strong>${view.brand.phone ? ` · ${esc(view.brand.phone)}` : ""}${view.brand.email ? ` · ${esc(view.brand.email)}` : ""}`
    : "Trade quotation for the addressed agent's internal use.";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(view.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ec">
<div style="display:none;max-height:0;overflow:hidden">${esc(`${view.title}: ${view.dates}${view.options.length ? "" : `, ${inr(view.totals.totalInr)}`}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:${s.primary};padding:22px 28px">
<p style="${font}margin:0;color:${s.onPrimary};font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">${esc(view.isAgent ? "Trade quotation" : view.brand.name)} · ${esc(view.ref)}</p>
<h1 style="${serif}margin:10px 0 0;color:#ffffff;font-size:28px;line-height:1.2;font-weight:bold">${esc(view.title)}</h1>
${chain ? `<p style="${font}margin:8px 0 0;color:${s.onPrimary};font-size:14px">${esc(chain)}</p>` : ""}
</td></tr>
${view.heroImage ? `<tr><td><img src="${esc(view.heroImage)}" width="600" alt="${esc(view.route[0]?.city || "")}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>` : ""}
<tr><td style="height:4px;background:${s.accent};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 28px">
<p style="${font}margin:0 0 12px;color:${s.ink};font-size:15px">${greeting}</p>
<p style="${font}margin:0 0 16px;color:${s.ink};font-size:15px;line-height:1.55">${intro}</p>
${note}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr>${facts}</tr></table>
${days ? `<p style="${serif}font-size:20px;color:${s.ink};margin:0 0 12px">Your trip</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${days}</table>${moreDays}` : ""}
<div style="height:22px"></div>
${priceBlock}
<p style="${font}color:${s.muted};font-size:12px;line-height:1.5;margin:10px 0 0">${esc(view.priceNote)}${view.validUntil ? ` Valid until ${esc(view.validUntil)}.` : ""}</p>
${buttons ? `<div style="margin:22px 0 0">${buttons}</div>` : ""}
${inclusions}
</td></tr>
<tr><td style="${font}padding:18px 28px;border-top:1px solid ${s.line};color:${s.muted};font-size:12px">${footer}</td></tr>
</table></td></tr></table></body></html>`;

  const price = view.options.length
    ? `${view.options.length} hotel options:\n${view.options.map((option) => `- ${option.name}: INR ${option.totals.totalInr.toLocaleString("en-IN")}`).join("\n")}\nfor the whole group.`
    : `${view.isAgent ? "Net " : ""}INR ${view.totals.totalInr.toLocaleString("en-IN")} for the whole group.`;
  const text = [
    greetingName ? `Hello ${greetingName},` : "Hello,",
    "",
    view.isAgent ? `Trade quotation ${view.ref} for ${view.title}:` : `Here is your quotation ${view.ref} for ${view.title}:`,
    `${view.dates} (${view.duration}), ${view.travellers}.`,
    chain || null,
    String(message || "").trim() ? `\n${message.trim()}\n` : null,
    price,
    shareUrl ? `\nView your itinerary: ${shareUrl}` : null,
    view.isAgent ? "\nPDF attached. This trade copy carries net rates for your agency only — please do not forward." : "\nThe PDF is attached.",
    view.brand ? `\n${[view.brand.name, view.brand.phone].filter(Boolean).join(" · ")}` : null,
  ].filter((line) => line !== null).join("\n");
  return { html, text };
}

/**
 * The email for a saved quotation: to the customer (branded, with the web
 * itinerary link) or to the agent (trade copy). `to` and `message` come from
 * the builder's preview, where the supplier can change the recipient and add a note.
 */
export function quotationEmail(db, supplierId, quotationId, { audience = "CUSTOMER", to = null, message = "" } = {}) {
  const row = findQuotation(db, supplierId, quotationId);
  const quotation = quotationView(db, row);
  const isAgent = audience === "AGENT";
  let agent = null;
  if (isAgent) {
    if (!row.agent_id) throw Object.assign(new Error("This quotation has no agent set"), { status: 409, code: "AGENT_MISSING" });
    const found = findAgent(db, supplierId, row.agent_id);
    agent = { id: found.id, name: found.name, contactName: found.contact_name || null, email: found.email || null };
  }
  const supplier = db.prepare("SELECT company_name, phone, email FROM suppliers WHERE id = ?").get(supplierId) || {};
  const theme = quotationTheme(db, supplierId, quotation);
  const view = presentQuotation({
    quotation, supplier, hotels: listHotels(db, supplierId), cabTypes: listCabTypes(db, supplierId), variant: isAgent ? "AGENT" : "BRAND", agent, theme,
    images: cityImages(db, (quotation.legs || []).map((leg) => leg.city)),
  });
  const shareUrl = isAgent ? null : quotationShareUrl(row);
  const greetingName = isAgent ? agent.contactName || agent.name : row.customer_name;
  const { html, text } = renderQuotationEmail(view, themeStyle(theme), { greetingName, message, shareUrl });
  return {
    to: (to && String(to).trim()) || (isAgent ? agent.email : row.customer_email) || null,
    recipientName: greetingName, agent, shareUrl,
    subject: isAgent ? `Trade quotation ${row.ref}: ${row.title}` : `Your trip: ${row.title} (${row.ref})`,
    html, text, row,
  };
}
