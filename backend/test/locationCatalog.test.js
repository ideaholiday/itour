import test from "node:test";
import assert from "node:assert/strict";
import { resolveIndiaCatalogLocation } from "../src/lib/locationCatalog.js";

const catalog = [
  { id: "goa", name: "Goa", state: "Goa" },
  { id: "bengaluru", name: "Bengaluru", state: "Karnataka" },
];

test("normalizes a supplier city to its canonical state and country", () => {
  assert.deepEqual(resolveIndiaCatalogLocation(catalog, "bengaluru").value, {
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
  });
});

test("rejects misspelled cities and non-India countries", () => {
  assert.match(resolveIndiaCatalogLocation(catalog, "Banglore").error, /city catalogue/i);
  assert.match(resolveIndiaCatalogLocation(catalog, "Goa", "Portugal").error, /India only/i);
});
