import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * Suppliers and travelers in Thailand and the UAE sign up with their own country
 * code, and the number is stored as E.164 so WhatsApp reaches them (ADR 022).
 */
test("signup stores Thai and UAE numbers as E.164 and refuses a local number with no country code", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());
  const city = db.prepare("SELECT name, state FROM destinations WHERE COALESCE(is_active, 1) = 1 ORDER BY name LIMIT 1").get();
  const supplier = (email, phone) => requestJson(api.baseUrl, "/api/auth/supplier-signup", {
    body: { companyName: "Andaman Sea Tours", contactName: "Somchai Suk", email, phone, city: city.name, state: city.state, password: "Thai@Supplier2026" },
  });

  const thai = await supplier("ops@andamansea.example", "+66 081 234 5678");
  assert.equal(thai.response.status, 201, JSON.stringify(thai.data));
  assert.equal(db.prepare("SELECT phone FROM suppliers WHERE email = ?").get("ops@andamansea.example").phone, "+66812345678");
  assert.equal(db.prepare("SELECT phone FROM users WHERE email = ?").get("ops@andamansea.example").phone, "+66812345678");

  const local = await supplier("local@andamansea.example", "081 234 5678");
  assert.equal(local.response.status, 400, "would otherwise be stored and messaged as +91");

  const traveler = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Fatima Ali", email: "fatima@example.com", password: "Dubai@Trip2026", phone: "+971 50 123 4567" },
  });
  assert.equal(traveler.response.status, 200, JSON.stringify(traveler.data));
  assert.equal(db.prepare("SELECT phone FROM users WHERE email = ?").get("fatima@example.com").phone, "+971501234567");
});
