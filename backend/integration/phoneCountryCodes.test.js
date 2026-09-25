import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * Suppliers and travelers in Thailand and the UAE sign up with their own country
 * code, and the number is stored as E.164 so WhatsApp reaches them (ADR 022).
 */
test("a Bangkok supplier signs up, numbers are stored as E.164, and a local number with no country code is refused", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());
  // Thai and UAE suppliers choose their base city from the catalogue (migration 049).
  const cities = (await requestJson(api.baseUrl, "/api/cities", { method: "GET" })).data;
  const city = cities.find((item) => item.name === "Bangkok");
  assert.equal(city?.country, "Thailand");
  assert.equal(cities.find((item) => item.name === "Dubai")?.country, "United Arab Emirates");
  assert.equal(cities.find((item) => item.name === "Agra")?.country, "India");
  const supplier = (email, phone) => requestJson(api.baseUrl, "/api/auth/supplier-signup", {
    body: { companyName: "Andaman Sea Tours", contactName: "Somchai Suk", email, phone, city: city.name, state: city.state, password: "Thai@Supplier2026" },
  });

  const thai = await supplier("ops@andamansea.example", "+66 081 234 5678");
  assert.equal(thai.response.status, 201, JSON.stringify(thai.data));
  assert.deepEqual({ ...db.prepare("SELECT phone, city FROM suppliers WHERE email = ?").get("ops@andamansea.example") }, { phone: "+66812345678", city: "Bangkok" });
  assert.equal(db.prepare("SELECT phone FROM users WHERE email = ?").get("ops@andamansea.example").phone, "+66812345678");

  const local = await supplier("local@andamansea.example", "081 234 5678");
  assert.equal(local.response.status, 400, "would otherwise be stored and messaged as +91");

  const traveler = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Fatima Ali", email: "fatima@example.com", password: "Dubai@Trip2026", phone: "+971 50 123 4567" },
  });
  assert.equal(traveler.response.status, 200, JSON.stringify(traveler.data));
  assert.equal(db.prepare("SELECT phone FROM users WHERE email = ?").get("fatima@example.com").phone, "+971501234567");
});
