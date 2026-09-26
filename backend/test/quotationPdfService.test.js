import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { hotelStays, renderQuotationPdf } from "../src/services/quotationPdfService.js";

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
  assert.match(text, /Travel dates/);
  assert.match(text, /26 Sept 2026 to 28 Sept 2026 · 3 days \/ 2 nights/);
  assert.match(text, /Travellers\n1 adult/);
  assert.match(text, /Hotel Bloom, Lucknow \(3 star\)/);
  assert.match(text, /Room type\nDeluxe Room, 1 room/);
  assert.match(text, /Meals\nBreakfast/);
  assert.match(text, /Check-in 26 Sept 2026 · check-out 28 Sept 2026 · 2 nights/);
  assert.match(text, /Car\nSedan/);
});
