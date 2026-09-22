import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

// ADR 023 step L1: products can be listed in Thai cities; ADR 024 opens Dubai.
test("a supplier lists in Bangkok and Dubai, and the city decides the country", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const user = db.prepare("SELECT * FROM users WHERE role = 'SUPPLIER' LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers WHERE LOWER(email) = ?").get(user.email.toLowerCase());
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, "integration-jwt-secret-with-at-least-32-characters");
  const base = `/api/suppliers/${supplier.id}/products`;

  const cities = await requestJson(api.baseUrl, "/api/cities");
  assert.equal(cities.response.status, 200);
  const byName = Object.fromEntries(cities.data.map(city => [city.name, city]));
  assert.equal(byName.Bangkok.country, "Thailand");
  assert.equal(byName.Bangkok.listing_open, true);
  assert.equal(byName.Dubai.listing_open, true);
  assert.deepEqual([byName.Singapore.country, byName.Singapore.listing_open], ["Singapore", true]);

  const tour = { productType: "DAY_TOUR", title: "Bangkok Temples Day Tour", city: "bangkok", state: "Bangkok", priceInr: 2499, shortDesc: "Grand Palace, Wat Pho and Wat Arun with hotel pickup.", itinerary: [] };
  const created = await requestJson(api.baseUrl, base, { token, body: tour });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const stored = db.prepare("SELECT p.city, d.country FROM products p JOIN destinations d ON LOWER(d.name) = LOWER(p.city) WHERE p.title = ?").get(tour.title);
  assert.deepEqual({ ...stored }, { city: "Bangkok", country: "Thailand" });

  const withCountry = await requestJson(api.baseUrl, base, { token, body: { ...tour, title: "Bangkok Night Food Tour", country: "Thailand" } });
  assert.equal(withCountry.response.status, 201, JSON.stringify(withCountry.data));

  const mismatch = await requestJson(api.baseUrl, base, { token, body: { ...tour, title: "Wrong country", country: "India" } });
  assert.equal(mismatch.response.status, 400);
  assert.match(mismatch.data.error, /Bangkok is in Thailand/);

  const dubai = await requestJson(api.baseUrl, base, { token, body: { ...tour, title: "Dubai Desert Safari", city: "Dubai", state: "Dubai" } });
  assert.equal(dubai.response.status, 201, JSON.stringify(dubai.data));

  const v2 = { productType: "TOUR", productSubType: "PRIVATE", title: "Phuket Island Hopping", city: "Phuket", state: "Phuket", priceInr: 3999, status: "PUBLISHED" };
  const createdV2 = await requestJson(api.baseUrl, `${base}/v2`, { token, body: v2 });
  assert.equal(createdV2.response.status, 201, JSON.stringify(createdV2.data));
  const dubaiV2 = await requestJson(api.baseUrl, `${base}/v2`, { token, body: { ...v2, title: "Dubai City Tour", city: "Dubai", state: "Dubai" } });
  assert.equal(dubaiV2.response.status, 201, JSON.stringify(dubaiV2.data));
  assert.equal(db.prepare("SELECT count(*) AS n FROM products WHERE city = 'Dubai'").get().n, 2);
});
