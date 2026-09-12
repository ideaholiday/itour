import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { getReservationProvider } from "../src/services/reservationProviders.js";

// The repo both serves OCTo (/octo) and now speaks it as a client. Pointing the
// client at our own server round-trips the contract end to end: if the client
// and server ever disagree on shapes, this fails without needing a third party.
test("the OCTo provider round-trips availability and reservations against a live OCTo server", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());

  const supplierUser = db.prepare("SELECT * FROM users WHERE role = 'SUPPLIER' LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers WHERE LOWER(email) = ?").get(supplierUser.email.toLowerCase());
  const token = jwt.sign({ id: supplierUser.id, email: supplierUser.email, role: supplierUser.role }, "integration-jwt-secret-with-at-least-32-characters");
  const base = `/api/suppliers/${supplier.id}/products`;

  // A real bookable product, so the OCTo server has something to serve.
  const created = await requestJson(api.baseUrl, `${base}/v2`, { token, body: {
    productType: "EXPERIENCE", productSubType: "TICKET_SIC", title: "OCTo round trip check", city: "Goa", state: "Goa",
    priceInr: 1500, shortDesc: "OCTo provider round trip", status: "PUBLISHED" } });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const productId = created.data.productId;
  const optionId = (await requestJson(api.baseUrl, `${base}/${productId}/inventory`, { token })).data.options[0].id;

  const saved = await requestJson(api.baseUrl, `${base}/${productId}/inventory/${optionId}`, { token, method: "PUT", body: {
    operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00"], capacity: 9, adultPrice: 1500, childPrice: 700,
    cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [] } });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));

  // Treat our own /octo surface as the supplier's connected external channel.
  db.prepare(`INSERT INTO supplier_channel_connections
    (id, supplier_id, channel_name, channel_title, endpoint_url, credentials_json, status, last_sync_status)
    VALUES ('ch_roundtrip', ?, 'OCTO_GENERIC', 'Self OCTo', ?, '{}', 'ACTIVE', 'CONNECTED')`)
    .run(supplier.id, `${api.baseUrl}/octo`);

  const provider = getReservationProvider("OCTO_GENERIC");
  assert.equal(provider.isExternal, true);

  // 1. Availability over the wire, parsed by our own client.
  const slots = await provider.availability(db, {
    productId, optionId, localDate: "2099-09-20", supplierId: supplier.id,
  });
  assert.ok(slots.length >= 1, `expected availability, got ${JSON.stringify(slots)}`);
  const morning = slots.find(slot => slot.localTime === "09:00");
  assert.ok(morning, `expected an 09:00 departure in ${JSON.stringify(slots.map(s => s.localTime))}`);
  assert.equal(morning.capacity, 9);
  assert.equal(morning.vacancies, 9);
  assert.equal(morning.available, true);
  assert.equal(morning.provider, "OCTO_GENERIC");
  assert.equal(morning.external, true);

  // 2. Reserve through the provider boundary.
  const hold = await provider.reserve(db, {
    productId, optionId, localDate: "2099-09-20", localTime: "09:00",
    unitItems: [{ unitType: "ADULT", quantity: 2 }],
    supplierId: supplier.id, ownerId: "octo-owner", requestKey: `rt-${Date.now()}`,
  });
  assert.ok(hold.id, "the remote reservation reference must come back");
  assert.equal(hold.provider, "OCTO_GENERIC");
  assert.equal(hold.external, true);

  // The identity mapping is what makes confirm and cancel addressable later.
  const mapped = db.prepare(
    "SELECT * FROM reservation_external_references WHERE provider = 'OCTO_GENERIC' AND resource_type = 'BOOKING'"
  ).get();
  assert.equal(mapped.external_id, hold.id);

  // 3. Those two seats are really gone upstream.
  const after = await provider.availability(db, {
    productId, optionId, localDate: "2099-09-20", supplierId: supplier.id,
  });
  assert.equal(after.find(slot => slot.localTime === "09:00").vacancies, 7,
    "a reservation placed through the provider must reduce the remote vacancies");

  // 4. Confirming addresses the remote reservation by its own id.
  const confirmed = await provider.confirm(db, { id: mapped.internal_id, supplier_id: supplier.id });
  assert.ok(confirmed, "confirmation must return the provider's response");
});

test("an unconnected external provider fails loudly instead of serving native seats", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const supplier = db.prepare("SELECT id FROM suppliers LIMIT 1").get();

  await assert.rejects(
    () => getReservationProvider("OCTO_GENERIC").availability(db, {
      productId: "anything", localDate: "2099-09-20", supplierId: supplier.id,
    }),
    (error) => error.code === "PROVIDER_NOT_CONNECTED" && error.status === 409,
    "without a connection the platform must not fall back to its own inventory"
  );
});
