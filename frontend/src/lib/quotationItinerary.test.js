import assert from "node:assert/strict";
import test from "node:test";
import { dayRange, hotelRateGap, insertDayAfter, mealPlansFor, minTripLength, quotationPayload, removeDay, setTripLength, setupSteps } from "./quotationItinerary.js";

const trip = {
  lines: [
    { kind: "HOTEL", dayNumber: 1, date: "2026-10-01", checkIn: "2026-10-01" },
    { kind: "ACTIVITY", dayNumber: 2, date: "2026-10-02" },
    { kind: "TRANSPORT", dayNumber: 3, date: "2026-10-03" },
  ],
  days: [{ dayNumber: 2, title: "Agra" }, { dayNumber: 3, title: "Jaipur" }],
};

test("every day up to the last one shows, even with nothing booked", () => {
  assert.deepEqual(dayRange([], []), [1]);
  assert.deepEqual(dayRange([{ dayNumber: 3 }], []), [1, 2, 3]);
  assert.deepEqual(dayRange([], [{ dayNumber: 4 }]), [1, 2, 3, 4]);
});

test("the trip length can't drop a booked item or a day's text", () => {
  assert.equal(minTripLength(trip.lines, [...trip.days, { dayNumber: 5, title: "" }]), 3);
  assert.deepEqual(setTripLength([{ dayNumber: 2, title: "Agra" }], 5).map((day) => day.dayNumber), [2, 5]);
  assert.deepEqual(setTripLength([{ dayNumber: 2, title: "Agra" }, { dayNumber: 6, title: "" }], 4).map((day) => day.dayNumber), [2, 4]);
});

test("removing a day drops its items and moves later days and dates one day earlier", () => {
  const next = removeDay(trip, 2);
  assert.deepEqual(next.lines.map((line) => [line.kind, line.dayNumber, line.date]), [["HOTEL", 1, "2026-10-01"], ["TRANSPORT", 2, "2026-10-02"]]);
  assert.deepEqual(next.days, [{ dayNumber: 2, title: "Jaipur" }]);
});

test("inserting a day moves later days, dates and check-ins one day later", () => {
  const next = insertDayAfter(trip, 1);
  assert.deepEqual(next.lines.map((line) => [line.dayNumber, line.date, line.checkIn]), [[1, "2026-10-01", "2026-10-01"], [3, "2026-10-03", undefined], [4, "2026-10-04", undefined]]);
  assert.deepEqual(next.days.map((day) => day.dayNumber), [3, 4]);
});

test("only meal plans the room has a rate for are offered", () => {
  const all = ["EP", "CP", "MAP", "AP"];
  const hotel = { rates: [{ roomType: "Deluxe", mealPlan: "CP" }, { roomType: "Deluxe", mealPlan: "MAP" }, { roomType: "Suite", mealPlan: "AP" }] };
  assert.deepEqual(mealPlansFor(hotel, "Deluxe", "CP", all), ["CP", "MAP"]);
  assert.deepEqual(mealPlansFor(hotel, "Deluxe", "EP", all), ["EP", "CP", "MAP"]);
  assert.deepEqual(mealPlansFor(hotel, "", "CP", all), all);
});

test("setup steps are done once each rate sheet has a price", () => {
  const empty = setupSteps({});
  assert.deepEqual(empty.map((step) => step.done), [false, false, false, false]);
  const ready = setupSteps({ hotels: [{ rates: [{}] }], cabTypes: [{}], services: [{ rates: [{}] }], quotationCount: 1 });
  assert.deepEqual(ready.map((step) => step.done), [true, true, true, true]);
  assert.equal(setupSteps({ hotels: [{ rates: [] }] })[0].done, false);
});

test("saving a loaded quotation sends only what the server takes", () => {
  // A quotation as the server returns it, with read-only fields such as trip and totals.
  const loaded = {
    id: "qtn_1", ref: "Q-1", status: "DRAFT", trip: null, totals: { totalInr: 1 }, warnings: [], payments: [], selectedOption: null, sentAt: null,
    title: "Lucknow Tour", destination: "", customerName: "Ajay", customerEmail: "", customerPhone: "9336757106", agentId: "", startDate: "2026-09-26",
    adults: "1", children: "0", markupPct: "15", notes: "", validUntil: "2026-09-30", options: [], days: [{ dayNumber: 1, title: "Arrive", description: "" }, { dayNumber: 2, title: "", description: "" }],
    lines: [{ id: "qln_1", priceInr: 900, arrangementStatus: null, kind: "HOTEL", dayNumber: 1, title: "Stay", hotelId: "h1", roomType: "Deluxe", mealPlan: "CP", checkIn: "2026-09-26", nights: 1, rooms: 1 }],
  };
  const body = quotationPayload(loaded);
  assert.deepEqual(Object.keys(body).sort(), ["adults", "agentId", "children", "customerEmail", "customerName", "customerPhone", "days", "destination", "lines", "markupPct", "notes", "options", "startDate", "title", "validUntil"]);
  assert.deepEqual([body.adults, body.markupPct, body.customerEmail, body.destination], [1, 15, null, null]);
  assert.deepEqual(body.days, [{ dayNumber: 1, title: "Arrive", description: null }]);
  assert.deepEqual(body.lines[0], { kind: "HOTEL", dayNumber: 1, title: "Stay", description: null, option: 1, hotelId: "h1", roomType: "Deluxe", mealPlan: "CP", checkIn: "2026-09-26", nights: 1, rooms: 1, extraAdults: 0, children: 0 });
});

test("hotelRateGap flags the first night with no matching rate, and passes when every night is covered", () => {
  const hotel = { rates: [
    { roomType: "Deluxe", mealPlan: "CP", validFrom: "2026-10-01", validTo: "2026-10-05" },
    { roomType: "Deluxe", mealPlan: "CP", validFrom: "2026-10-06", validTo: "2026-10-31" },
  ] };
  const line = (patch) => ({ kind: "HOTEL", hotelId: "h1", roomType: "Deluxe", mealPlan: "CP", checkIn: "2026-10-04", nights: 2, ...patch });
  // Two seasons back to back cover both nights.
  assert.equal(hotelRateGap(hotel, line()), null);
  // A stay that runs off the end of the last season is flagged on the first uncovered night.
  assert.equal(hotelRateGap(hotel, line({ checkIn: "2026-10-31", nights: 2 })), "2026-11-01");
  // No rate for the chosen meal plan at all.
  assert.equal(hotelRateGap(hotel, line({ mealPlan: "MAP" })), "2026-10-04");
  // Room type match is case-insensitive, like the server's lookup.
  assert.equal(hotelRateGap(hotel, line({ roomType: "deluxe" })), null);
  // Nothing to check until the line is complete.
  assert.equal(hotelRateGap(hotel, line({ roomType: "" })), null);
  assert.equal(hotelRateGap(null, line()), null);
});
