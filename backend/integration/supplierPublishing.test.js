import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { activityPath } from "../../shared/activityUrl.js";

test("v2 publication creates bookable inventory atomically and redirects legacy activity URLs", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const user = db.prepare("SELECT * FROM users WHERE role = 'SUPPLIER' LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers WHERE LOWER(email) = ?").get(user.email.toLowerCase());
  assert.ok(supplier?.id);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, "integration-jwt-secret-with-at-least-32-characters");
  const base = `/api/suppliers/${supplier.id}/products`;
  const input = { productType: "EXPERIENCE", productSubType: "TICKET_SIC", title: "Lucknow City with Zoo", city: "Lucknow", state: "Uttar Pradesh", priceInr: 1299, status: "PUBLISHED" };
  const created = await requestJson(api.baseUrl, `${base}/v2`, { token, body: input });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const id = created.data.productId;
  assert.equal(created.data.url, activityPath(id, input.title));
  const inventory = await requestJson(api.baseUrl, `${base}/${id}/inventory`, { token });
  assert.equal(inventory.response.status, 200);
  assert.equal(inventory.data.options.length, 1);
  const optionId = inventory.data.options[0].id;
  const rules = { operatingDays: [1,2,3,4,5,6], departureTimes: ["09:00"], capacity: 20, adultPrice: 1000, childPrice: 500, cutoffMinutes: 120, cancellationHours: 24, blackoutDates: [] };
  const saved = await requestJson(api.baseUrl, `${base}/${id}/inventory/${optionId}`, { token, method: "PUT", body: rules });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
  const reloaded = await requestJson(api.baseUrl, `${base}/${id}/inventory`, { token });
  assert.equal(reloaded.data.options[0].inventory.capacity, 20);
  for (const path of [`/activity/${id}`, `/activity/outdated-title/${id}`]) {
    const response = await fetch(`${api.baseUrl}${path}?adults=2`, { redirect: "manual" });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), `${activityPath(id, input.title)}?adults=2`);
  }
  db.exec("CREATE TRIGGER reject_test_option BEFORE INSERT ON product_options BEGIN SELECT RAISE(ABORT, 'simulated required option failure'); END");
  const failed = await requestJson(api.baseUrl, `${base}/v2`, { token, body: { ...input, title: "Atomic failure diagnostic" } });
  assert.equal(failed.response.status, 500);
  assert.equal(db.prepare("SELECT count(*) AS n FROM products WHERE title = 'Atomic failure diagnostic'").get().n, 0);
});
