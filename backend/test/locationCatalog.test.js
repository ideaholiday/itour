import test from "node:test";
import assert from "node:assert/strict";
import { resolveCatalogLocation } from "../src/lib/locationCatalog.js";

const catalog = [
  { id: "goa", name: "Goa", state: "Goa" },
  { id: "bengaluru", name: "Bengaluru", state: "Karnataka", country: "India" },
  { id: "city_th_bangkok", name: "Bangkok", state: "Bangkok", country: "Thailand" },
  { id: "city_ae_dubai", name: "Dubai", state: "Dubai", country: "United Arab Emirates" },
  { id: "city_sg_singapore", name: "Singapore", state: "Singapore", country: "Singapore" },
  { id: "city_np_kathmandu", name: "Kathmandu", state: "Bagmati", country: "Nepal" },
  { id: "city_cn_beijing", name: "Beijing", state: "Beijing", country: "China" },
];

test("normalizes a supplier city to its canonical state and country", () => {
  assert.deepEqual(resolveCatalogLocation(catalog, "bengaluru").value, { city: "Bengaluru", state: "Karnataka", country: "India" });
  assert.deepEqual(resolveCatalogLocation(catalog, "Goa", "India").value, { city: "Goa", state: "Goa", country: "India" });
});

test("Thai, UAE and Singapore cities list in their country; a country not open yet waits (ADR 023, ADR 024)", () => {
  assert.deepEqual(resolveCatalogLocation(catalog, "Bangkok").value, { city: "Bangkok", state: "Bangkok", country: "Thailand" });
  assert.deepEqual(resolveCatalogLocation(catalog, "bangkok", "Thailand").value.country, "Thailand");
  assert.equal(resolveCatalogLocation(catalog, "Dubai").value.country, "United Arab Emirates");
  assert.equal(resolveCatalogLocation(catalog, "Singapore").value.country, "Singapore");
  assert.equal(resolveCatalogLocation(catalog, "Kathmandu").value.country, "Nepal");
  assert.match(resolveCatalogLocation(catalog, "Beijing").error, /China open soon/);
});

test("rejects misspelled cities and a country that doesn't match the city", () => {
  assert.match(resolveCatalogLocation(catalog, "Banglore").error, /city catalogue/i);
  assert.match(resolveCatalogLocation(catalog, "Goa", "Portugal").error, /Goa is in India/);
  assert.match(resolveCatalogLocation(catalog, "Bangkok", "India").error, /Bangkok is in Thailand/);
});
