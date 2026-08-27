const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

function dateLabel(value) {
  if (!value) return "Date pending";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function openPrintPreview({ title, body }) {
  const preview = window.open("", "_blank", "width=1024,height=820");
  if (!preview) throw new Error("Allow pop-ups to preview and save this PDF.");
  preview.opener = null;
  preview.document.open();
  preview.document.write(`<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root{color-scheme:light;--ink:#1c1917;--muted:#6b625b;--line:#ded8d2;--amber:#a64808;--gold:#f59e0b;--green:#047857;--paper:#fff}
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:#eeeae5;color:var(--ink);font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.42}
      .toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:center;gap:10px;padding:12px;background:#1c1917;color:#fff;box-shadow:0 4px 16px #0003}
      .toolbar button{border:0;border-radius:9px;padding:10px 17px;font-weight:800;cursor:pointer}.toolbar .primary{background:var(--gold);color:#1c1917}.toolbar .secondary{background:#44403c;color:#fff}
      .sheet{width:210mm;min-height:297mm;margin:18px auto;background:var(--paper);padding:13mm 14mm;box-shadow:0 14px 45px #29252422}
      .top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:start;border-bottom:3px solid var(--ink);padding-bottom:14px}
      .brand{font-weight:900;font-size:23px;letter-spacing:-.04em;color:var(--amber)}.brand span{color:var(--green)}
      .eyebrow{margin-top:3px;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
      h1{margin:12px 0 2px;font-size:24px;line-height:1.13;letter-spacing:-.025em}h2{margin:0;font-size:15px}p{margin:0}
      .status{text-align:right}.status-badge{display:inline-block;border:1px solid #b7e4d2;border-radius:999px;background:#ecfdf5;color:var(--green);padding:5px 9px;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .ref{margin-top:8px;color:var(--amber);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:900}.muted{color:var(--muted)}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.summary-card{border:1px solid var(--line);border-radius:10px;padding:9px}.label{display:block;margin-bottom:3px;color:var(--muted);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.summary-card strong{font-size:11px}
      .notice{margin:13px 0;border:1px solid #f5d58c;border-radius:10px;background:#fff9e9;padding:10px 12px;color:#5c3510}.notice strong{color:#7c2d12}
      .days{display:grid;gap:10px}.day{break-inside:avoid;border:1px solid var(--line);border-radius:12px;padding:11px 13px}.day-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ebe7e3;padding-bottom:7px;margin-bottom:5px}.day-count{font-size:9px;color:var(--muted);font-weight:700}
      .stop{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;padding:7px 0;border-bottom:1px solid #f1eeeb;align-items:start}.stop:last-child{border-bottom:0}.number{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#fff2d5;color:#8a3b07;font-size:9px;font-weight:900}.stop-title{font-weight:800;font-size:10.5px}.stop-meta{margin-top:2px;color:var(--muted);font-size:9px}.stop-note{margin-top:2px;color:#5f574f;font-size:9px;font-style:italic}.stop-price{text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;font-weight:800;white-space:nowrap}
      .totals{margin-top:14px;margin-left:auto;width:270px;border-radius:11px;background:#f5f3f0;padding:10px 12px}.total-row{display:flex;justify-content:space-between;gap:20px;padding:3px 0}.total-row.grand{margin-top:5px;border-top:1px solid #d6d0ca;padding-top:7px;font-size:14px;font-weight:900;color:var(--amber)}
      .footer{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px;border-top:1px solid var(--line);padding-top:9px;color:var(--muted);font-size:8.5px}.footer a{color:inherit;overflow-wrap:anywhere}.page-number{text-align:right}
      @page{size:A4 portrait;margin:10mm}
      @media print{html,body{background:#fff}.toolbar{display:none!important}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.day,.summary-card,.notice,.totals{break-inside:avoid}.footer{break-inside:avoid}}
      @media(max-width:850px){.sheet{width:calc(100% - 20px);margin:10px;padding:20px}.top{grid-template-columns:1fr}.status{text-align:left}.summary{grid-template-columns:1fr 1fr}.footer{grid-template-columns:1fr}}
    </style></head><body>
      <div class="toolbar"><button class="primary" onclick="window.print()">Print / Save as PDF</button><button class="secondary" onclick="window.close()">Close preview</button></div>
      ${body}
    </body></html>`);
  preview.document.close();
  preview.focus();
}

function header({ documentLabel, title, destination, status, reference }) {
  return `<header class="top"><div><div class="brand">idea<span>holiday.</span></div><div class="eyebrow">${escapeHtml(documentLabel)}</div><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(destination || "India")}</p></div><div class="status"><span class="status-badge">${escapeHtml(status)}</span>${reference ? `<div class="ref">${escapeHtml(reference)}</div>` : ""}</div></header>`;
}

function footer(link) {
  return `<footer class="footer"><p><strong>Idea Holiday traveler support</strong><br>support@ideaholiday.com · Available 24/7</p><p class="page-number">Generated ${escapeHtml(new Date().toLocaleString("en-IN"))}${link ? `<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a>` : ""}</p></footer>`;
}

export function printCircuitPlan({
  title, destination, startDate, endDate, daysCount, adults, childrenCount,
  itemsByDay, estimatedTotal, quote, shareableUrl,
}) {
  const readyQuote = quote?.status === "READY" && new Date(quote.expiresAt).getTime() > Date.now();
  const verifiedByItem = new Map((quote?.lineItems || []).map((item) => [item.itemId, item]));
  const total = readyQuote ? quote.breakdown.totalAmount : estimatedTotal;
  const days = Array.from({ length: daysCount }, (_, index) => {
    const day = index + 1;
    const date = new Date(`${startDate}T00:00:00`);
    date.setDate(date.getDate() + index);
    const items = itemsByDay[day] || [];
    const rows = items.length ? items.map((item, itemIndex) => {
      const verified = verifiedByItem.get(item.id);
      return `<div class="stop"><span class="number">${itemIndex + 1}</span><div><div class="stop-title">${escapeHtml(item.title)}</div><div class="stop-meta">${escapeHtml(item.timeSlot || "Activity")} · ${escapeHtml(item.location || destination)} · ${escapeHtml(item.durationHours || 2)} hrs${verified?.supplierName ? ` · ${escapeHtml(verified.supplierName)}` : ""}</div>${item.notes ? `<div class="stop-note">${escapeHtml(item.notes)}</div>` : ""}</div><div class="stop-price">${verified ? money(verified.breakdown.totalAmount) : "Plan item"}</div></div>`;
    }).join("") : `<p class="muted" style="padding:8px 0">Leisure day - no scheduled marketplace activity.</p>`;
    return `<section class="day"><div class="day-head"><h2>Day ${day} · ${escapeHtml(dateLabel(date.toISOString()))}</h2><span class="day-count">${items.length} ${items.length === 1 ? "ACTIVITY" : "ACTIVITIES"}</span></div>${rows}</section>`;
  }).join("");
  const label = readyQuote ? "Live Circuit Quote Summary" : "Multi-Day Circuit Trip Plan";
  const status = readyQuote ? "Verified quote - ready to reserve" : "Planning estimate - not booked";
  const reference = readyQuote ? quote.quoteId : null;
  const notice = readyQuote
    ? `This quote is valid until <strong>${escapeHtml(new Date(quote.expiresAt).toLocaleString("en-IN"))}</strong>. It does not reserve inventory until you select Reserve circuit and continue to checkout.`
    : `<strong>This is a trip plan, not a booking voucher.</strong> Prices are estimates. Request a live circuit quote and complete grouped payment before treating any activity as confirmed.`;
  const body = `<main class="sheet">${header({ documentLabel: label, title, destination, status, reference })}
    <section class="summary"><div class="summary-card"><span class="label">Travel dates</span><strong>${escapeHtml(dateLabel(startDate))}<br>to ${escapeHtml(dateLabel(endDate))}</strong></div><div class="summary-card"><span class="label">Duration</span><strong>${daysCount} days</strong></div><div class="summary-card"><span class="label">Travelers</span><strong>${adults} adult${adults === 1 ? "" : "s"}${childrenCount ? `<br>${childrenCount} child${childrenCount === 1 ? "" : "ren"}` : ""}</strong></div><div class="summary-card"><span class="label">${readyQuote ? "Verified total" : "Estimated budget"}</span><strong>${money(total)}</strong></div></section>
    <div class="notice">${notice}</div><div class="days">${days}</div>
    ${readyQuote ? `<section class="totals"><div class="total-row"><span>Activities and transfers</span><strong>${money(quote.breakdown.baseAmount)}</strong></div><div class="total-row"><span>Taxes, tolls and permits</span><strong>${money(quote.breakdown.taxesAmount)}</strong></div><div class="total-row grand"><span>Verified total</span><span>${money(quote.breakdown.totalAmount)}</span></div></section>` : ""}
    ${footer(shareableUrl)}</main>`;
  openPrintPreview({ title: `${title} - ${label}`, body });
}

export function printConfirmedCircuitVoucher(order) {
  const items = order.items || [];
  const firstDate = items[0]?.activityDate;
  const lastDate = items[items.length - 1]?.activityDate;
  const rows = items.map((item) => `<section class="day"><div class="day-head"><h2>Circuit stop ${item.sequenceNumber}</h2><span class="status-badge">Confirmed</span></div><div class="stop"><span class="number">${item.sequenceNumber}</span><div><div class="stop-title">${escapeHtml(item.productTitle)}</div><div class="stop-meta">${escapeHtml(dateLabel(item.activityDate))} · ${escapeHtml(item.pickupTime || "Time TBC")} · ${escapeHtml(item.supplierName || "Verified Idea Holiday supplier")}</div><div class="stop-note">Booking reference: ${escapeHtml(item.bookingRef)}</div></div><div class="stop-price">${money(item.breakdown?.totalAmount)}</div></div></section>`).join("");
  const body = `<main class="sheet">${header({ documentLabel: "Official Grouped Circuit Voucher", title: "Your Idea Holiday Multi-Day Circuit", destination: `${items.length} confirmed bookings`, status: "Paid - all stops confirmed", reference: order.orderRef })}
    <section class="summary"><div class="summary-card"><span class="label">Travel dates</span><strong>${escapeHtml(dateLabel(firstDate))}<br>to ${escapeHtml(dateLabel(lastDate))}</strong></div><div class="summary-card"><span class="label">Traveler</span><strong>${escapeHtml(order.traveler?.name)}<br>${escapeHtml(order.traveler?.phone)}</strong></div><div class="summary-card"><span class="label">Payment</span><strong>${escapeHtml(order.payment?.provider || "Recorded")}<br>${escapeHtml(order.payment?.paymentId || "Verified")}</strong></div><div class="summary-card"><span class="label">Total paid</span><strong>${money(order.breakdown?.totalAmount)}</strong></div></section>
    <div class="notice"><strong>Present the matching child booking reference at each stop.</strong> Pickup OTPs remain private in My Trips and are intentionally excluded from this shareable document.</div>
    <div class="days">${rows}</div>${footer(`${window.location.origin}/circuit-confirmed/${encodeURIComponent(order.orderRef)}`)}</main>`;
  openPrintPreview({ title: `${order.orderRef} - Official Circuit Voucher`, body });
}
