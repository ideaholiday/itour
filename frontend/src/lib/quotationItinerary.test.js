import assert from "node:assert/strict";
import test from "node:test";
import { dayRange, insertDayAfter, mealPlansFor, minTripLength, removeDay, setTripLength, setupSteps } from "./quotationItinerary.js";

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
