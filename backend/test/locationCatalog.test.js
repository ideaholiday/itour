import test from "node:test";
import assert from "node:assert/strict";
import { resolveCatalogLocation } from "../src/lib/locationCatalog.js";

const catalog = [
  { id: "goa", name: "Goa", state: "Goa" },
  { id: "bengaluru", name: "Bengaluru", state: "Karnataka", country: "India" },
  { id: "city_th_bangkok", name: "Bangkok", state: "Bangkok", country: "Thailand" },
  { id: "city_ae_dubai", name: "Dubai", state: "Dubai", country: "United Arab Emirates" },
];

test("normalizes a supplier city to its canonical state and country", () => {
  assert.deepEqual(resolveCatalogLocation(catalog, "bengaluru").value, { city: "Bengaluru", state: "Karnataka", country: "India" });
  assert.deepEqual(resolveCatalogLocation(catalog, "Goa", "India").value, { city: "Goa", state: "Goa", country: "India" });
});

test("a Thai city lists in Thailand; Dubai waits (ADR 023)", () => {
  assert.deepEqual(resolveCatalogLocation(catalog, "Bangkok").value, { city: "Bangkok", state: "Bangkok", country: "Thailand" });
  assert.deepEqual(resolveCatalogLocation(catalog, "bangkok", "Thailand").value.country, "Thailand");
  assert.match(resolveCatalogLocation(catalog, "Dubai").error, /United Arab Emirates open soon/);
});

test("rejects misspelled cities and a country that doesn't match the city", () => {
  assert.match(resolveCatalogLocation(catalog, "Banglore").error, /city catalogue/i);
  assert.match(resolveCatalogLocation(catalog, "Goa", "Portugal").error, /Goa is in India/);
  assert.match(resolveCatalogLocation(catalog, "Bangkok", "India").error, /Bangkok is in Thailand/);
});
