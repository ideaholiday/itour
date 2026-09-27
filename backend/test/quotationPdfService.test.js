import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { hotelStays, renderQuotationPdf, renderQuotationText } from "../src/services/quotationPdfService.js";

// The text pdfkit wrote: inflate each content stream and decode its hex strings.
function pdfText(buffer) {
  const raw = buffer.toString("latin1");
  let text = "";
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content;
    try { content = zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"); } catch { continue; }
    for (const line of content.split("\n")) {
      const hex = [...line.matchAll(/<([0-9a-fA-F]+)>/g)].map((part) => Buffer.from(part[1], "hex").toString("latin1")).join("");
      if (hex) text += `${hex}\n`;
    }
  }
  return text;
}

const hotel = (dayNumber, date, extra = {}) => ({ kind: "HOTEL", dayNumber, date, hotelId: "h1", title: "Stay", roomType: "Deluxe Room", mealPlan: "CP", nights: 1, rooms: 1, extraAdults: 0, option: 1, ...extra });

test("back-to-back nights in the same hotel and room read as one stay", () => {
  const stays = hotelStays([hotel(2, "2026-09-27"), hotel(1, "2026-09-26"), hotel(4, "2026-09-29", { roomType: "Suite" })]);
  assert.deepEqual(stays.map((stay) => [stay.roomType, stay.checkIn, stay.checkOut, stay.nights]), [
    ["Deluxe Room", "2026-09-26", "2026-09-28", 2],
    ["Suite", "2026-09-29", "2026-09-30", 1],
  ]);
});

test("the PDF opens with travel dates, travellers, hotel, room type and meals", async () => {
  const quotation = {
    ref: "Q-TEST01", title: "Lucknow Tour", customerName: "Ajay", startDate: "2026-09-26", adults: 1, children: 0, validUntil: null, notes: null,
    options: [], selectedOption: null, days: [{ dayNumber: 3, title: "Departure", description: null }],
    lines: [
      hotel(1, "2026-09-26"), hotel(2, "2026-09-27"),
      { kind: "TRANSPORT", dayNumber: 1, date: "2026-09-26", title: "Lucknow Airport Pickup", cabTypeId: "c1", vehicles: 1 },
    ],
    totals: { subtotalInr: 6325, gstPct: 5, gstInr: 316, totalInr: 6641, perPersonInr: 6641 },
  };
  const buffer = await renderQuotationPdf({
    quotation, supplier: { company_name: "Multi Tours" },
    hotels: [{ id: "h1", name: "Hotel Bloom", city: "Lucknow", starRating: 3 }], cabTypes: [{ id: "c1", name: "Sedan" }],
  });
  const text = pdfText(buffer);
  assert.match(text, /TRAVEL DATES\n26 Sept 2026 to 28\s+Sept 2026/);
  assert.match(text, /DURATION\n3 days \/ 2 nights/);
  assert.match(text, /TRAVELLERS\n1 adult/);
  // The hotel card: name, city, room and meals, dates.
  assert.match(text, /Where you'll stay\nHotel Bloom\nLucknow\nDeluxe Room, 1 room · Breakfast\n26 Sept 2026 to 28 Sept 2026 · 2 nights/);
  assert.match(text, /Travel by private Sedan\./);
  assert.match(text, /Day by day/);
  assert.match(text, /Departure/);
});

test("the route chain prints in the PDF font and every page carries the operator's footer and page number", async () => {
  const quotation = {
    ref: "Q-TEST02", title: "Lucknow Tour", customerName: "Ajay", startDate: "2026-09-26", adults: 2, children: 0, validUntil: null, notes: null,
    options: [], selectedOption: null, days: [], legs: [{ city: "Lucknow", nights: 2 }, { city: "Ayodhya", nights: 2 }],
    lines: [hotel(1, "2026-09-26", { nights: 2 })],
    totals: { subtotalInr: 6000, gstPct: 5, gstInr: 300, totalInr: 6300, perPersonInr: 3150 },
  };
  const buffer = await renderQuotationPdf({ quotation, supplier: { company_name: "Multi Tours", phone: "+910000000000" }, hotels: [{ id: "h1", name: "Hotel Bloom", city: "Lucknow" }] });
  const text = pdfText(buffer);
  assert.match(text, /Lucknow · 2N  »  Ayodhya · 2N/);
  const pages = buffer.toString("latin1").match(/\/Type \/Page\b/g).length;
  assert.equal(pages, 2);
  assert.equal(text.match(/Multi Tours {2}· {2}\+910000000000/g).length, pages);
  assert.match(text, /Q-TEST02 {2}· {2}1\/2/);
  assert.match(text, /Q-TEST02 {2}· {2}2\/2/);
  assert.match(text, /Your route\n1\nLucknow\n2 nights\n2\nAyodhya\n2 nights/);
});

test("the PDF lists what's included and not included", async () => {
  const quotation = {
    ref: "Q-TEST03", title: "Lucknow Tour", customerName: "Ajay", startDate: "2026-09-26", adults: 2, children: 0, validUntil: null, notes: null,
    options: [], selectedOption: null, days: [], lines: [], inclusions: ["Daily breakfast"], exclusions: ["Airfare"],
    totals: { subtotalInr: 1000, gstPct: 5, gstInr: 50, totalInr: 1050, perPersonInr: 525 },
  };
  const text = pdfText(await renderQuotationPdf({ quotation, supplier: { company_name: "Multi Tours" } }));
  assert.match(text, /What's included\nDaily breakfast\nNot included\nAirfare/);
});

test("the agent PDF shows one net price and no supplier brand", async () => {
  const quotation = {
    ref: "Q-TEST04", title: "Lucknow Tour", customerName: "Awadh Travels", agentId: "agt_1", startDate: "2026-09-26", adults: 2, children: 0, validUntil: null, notes: null,
    options: [], selectedOption: null, days: [], lines: [], inclusions: [], exclusions: [],
    totals: { subtotalInr: 11500, gstPct: 5, gstInr: 575, totalInr: 12075, perPersonInr: 6038 },
  };
  const text = pdfText(await renderQuotationPdf({ quotation, supplier: { company_name: "Multi Tours" }, variant: "AGENT", agent: { name: "Awadh Travels" } }));
  assert.match(text, /Net package price/);
  assert.match(text, /INR 12,075/);
  assert.doesNotMatch(text, /margin|Retail|Multi Tours/i);
});

test("the quotation copies as plain text with no branding", () => {
  const quotation = {
    ref: "Q-TEST05", title: "Lucknow Tour", agentId: "agt_1", startDate: "2026-09-26", adults: 2, children: 0, validUntil: "2026-10-01", notes: "Pay 30% to confirm.",
    options: [], selectedOption: null, legs: [{ city: "Lucknow", nights: 2 }],
    days: [{ dayNumber: 1, title: "Arrive in Lucknow", description: "Pickup and check-in." }],
    lines: [hotel(1, "2026-09-26", { nights: 2 }), { kind: "TRANSPORT", dayNumber: 1, date: "2026-09-26", title: "Lucknow Airport Pickup", cabTypeId: "c1", vehicles: 1 }],
    inclusions: ["Daily breakfast"], exclusions: ["Airfare"],
    totals: { subtotalInr: 11500, gstPct: 5, gstInr: 575, totalInr: 12075, perPersonInr: 6038 },
  };
  const text = renderQuotationText({ quotation, hotels: [{ id: "h1", name: "Hotel Bloom", city: "Lucknow", starRating: 3 }], cabTypes: [{ id: "c1", name: "Sedan" }] });
  assert.match(text, /^Lucknow Tour \(Q-TEST05\)\nLucknow · 2N\nTravel dates: 26 Sept 2026 to 28 Sept 2026 \(3 days \/ 2 nights\)\nTravellers: 2 adults/);
  assert.match(text, /- Hotel Bloom, Lucknow \(3 star\): Deluxe Room, 1 room, Breakfast, 26 Sept 2026 to 28 Sept 2026 \(2N\)/);
  assert.match(text, /Day 1 - Sat, 26 Sept, 2026: Arrive in Lucknow\nPickup and check-in.\n- Hotel Bloom · Deluxe Room · Breakfast · 2 nights\n- Lucknow Airport Pickup · Sedan/);
  assert.match(text, /PRICE\nNet price: INR 12,075 for the group \(includes GST 5%\)\nAbout INR 6,038 per person/);
  assert.match(text, /INCLUDED\n- Daily breakfast\n\nNOT INCLUDED\n- Airfare\n\nNOTES\nPay 30% to confirm.\n\nValid until 1 Oct 2026./);
  assert.doesNotMatch(text, /Multi Tours|Idea ?Holiday/i);
});

test("the theme sets the cover colour, and a photo that loads is drawn on the cover", async () => {
  // A 1×1 PNG stands in for the destination photo.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const quotation = {
    ref: "Q-TEST06", title: "Varanasi Tour", customerName: "Ajay", startDate: "2026-09-26", adults: 2, children: 0, validUntil: null, notes: null,
    options: [], selectedOption: null, days: [], lines: [], legs: [{ city: "Varanasi", nights: 2 }],
    totals: { subtotalInr: 1000, gstPct: 0, gstInr: 0, totalInr: 1000, perPersonInr: 500 },
  };
  const photoUrl = "https://images.example/varanasi.jpg";
  const render = (extra) => renderQuotationPdf({ quotation, supplier: { company_name: "Multi Tours" }, ...extra }).then((buffer) => buffer.toString("latin1"));
  const classic = await render({ theme: "CLASSIC" });
  const withPhoto = await render({ theme: "CLASSIC", cityPhotos: new Map([["varanasi", photoUrl]]), images: new Map([[photoUrl, png]]) });
  const heritage = await render({ theme: "HERITAGE" });
  assert.doesNotMatch(classic, /\/Subtype \/Image/);
  assert.match(withPhoto, /\/Subtype \/Image/);
  assert.notEqual(classic, heritage);
});
