import assert from "node:assert/strict";
import test from "node:test";
import { formatLegs, parseLegs, routeDays } from "./routeLibrary.js";

test("a route's cities and nights are typed as text", () => {
  assert.deepEqual(parseLegs("Lucknow 2, Ayodhya 2N → Varanasi 2"), [{ city: "Lucknow", nights: 2 }, { city: "Ayodhya", nights: 2 }, { city: "Varanasi", nights: 2 }]);
  assert.deepEqual(parseLegs("Bodh Gaya"), [{ city: "Bodh Gaya", nights: 1 }]);
  assert.equal(formatLegs([{ city: "Lucknow", nights: 2 }, { city: "Ayodhya", nights: 1 }]), "Lucknow 2, Ayodhya 1");
});

test("a route has a row per day and keeps what was written", () => {
  const rows = routeDays([{ city: "Lucknow", nights: 2 }], [{ dayNumber: 2, title: "Lucknow", itemIds: ["plib_up_02"] }, { dayNumber: 9, title: "Gone" }]);
  assert.deepEqual(rows.map((row) => [row.dayNumber, row.title, row.itemIds]), [[1, "", []], [2, "Lucknow", ["plib_up_02"]], [3, "", []]]);
});
