import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { getReservationProvider, EXTERNAL_PROVIDERS } from "../src/services/reservationProviders.js";
import { getChannelAdapter, ResTechAdapter } from "../src/services/channels/channelRegistry.js";

function providerDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE supplier_channel_connections (
      id TEXT PRIMARY KEY, supplier_id TEXT, channel_name TEXT, channel_title TEXT,
      endpoint_url TEXT, credentials_json TEXT, status TEXT, last_sync_at TEXT,
      last_sync_status TEXT, last_error TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE reservation_external_references (
      supplier_id TEXT, provider TEXT, resource_type TEXT, internal_id TEXT, external_id TEXT,
      UNIQUE(supplier_id, provider, resource_type, internal_id)
    );
  `);
  return db;
}

function connect(db, { supplierId = "sup_1", channel = "OCTO_GENERIC", endpoint = "https://remote.example/octo" } = {}) {
  db.prepare(`INSERT INTO supplier_channel_connections
    (id, supplier_id, channel_name, endpoint_url, credentials_json, status)
    VALUES ('ch_1', ?, ?, ?, '{"apiKey":"remote_key"}', 'ACTIVE')`).run(supplierId, channel, endpoint);
}

function stubFetch(t, handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options, body: options?.body ? JSON.parse(options.body) : null });
    return handler(String(url), options);
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test("an external provider name no longer silently returns the native engine", () => {
  // Serving native seats for an externally sourced product would advertise
  // capacity the platform does not own.
  for (const name of EXTERNAL_PROVIDERS) {
    const provider = getReservationProvider(name);
    assert.equal(provider.id, name);
    assert.equal(provider.isExternal, true, `${name} must resolve to an external provider`);
  }
  assert.equal(getReservationProvider("NATIVE").id, "NATIVE");
  assert.equal(getReservationProvider("NATIVE").isExternal, undefined);
  assert.equal(getReservationProvider("external_bokun").id, "BOKUN", "the EXTERNAL_ prefix is accepted");
  assert.throws(() => getReservationProvider("WHATEVER"), (e) => e.code === "PROVIDER_NOT_CONNECTED");
});

test("an external provider refuses to act without an active connection", async t => {
  const db = providerDb();
  t.after(() => db.close());
  const provider = getReservationProvider("OCTO_GENERIC");

  await assert.rejects(
    () => provider.availability(db, { productId: "p", localDate: "2099-05-12", supplierId: "sup_1" }),
    (error) => error.code === "PROVIDER_NOT_CONNECTED" && error.status === 409
  );

  // A disconnected (non-ACTIVE) row must not count as connected.
  connect(db);
  db.prepare("UPDATE supplier_channel_connections SET status = 'DISABLED'").run();
  await assert.rejects(
    () => provider.availability(db, { productId: "p", localDate: "2099-05-12", supplierId: "sup_1" }),
    (error) => error.code === "PROVIDER_NOT_CONNECTED"
  );
});

test("a provider that cannot do an operation yet says so instead of failing obscurely", async t => {
  const db = providerDb();
  t.after(() => db.close());
  connect(db, { channel: "BOKUN" });

  // Bókun implements testConnection and fetchProducts, but not availability.
  const adapter = getChannelAdapter("BOKUN");
  assert.equal(adapter.fetchAvailability, ResTechAdapter.prototype.fetchAvailability,
    "this test is meaningless if Bókun has since implemented availability");

  await assert.rejects(
    () => getReservationProvider("BOKUN").availability(db, { productId: "p", localDate: "2099-05-12", supplierId: "sup_1" }),
    (error) => error.code === "PROVIDER_CAPABILITY_MISSING" && error.status === 501 && /cannot fetchAvailability yet/.test(error.message)
  );
});

test("external availability is normalised onto the shape the marketplace renders", async t => {
  const db = providerDb();
  t.after(() => db.close());
  connect(db);
  const calls = stubFetch(t, () => ok({
    availability: [
      { id: "ext_slot_1", optionId: "ext_opt", localDateTimeStart: "2099-05-12T09:00:00+05:30", utcCutoffAt: "2099-05-12T01:30:00Z", capacity: 20, vacancies: 4, available: true, status: "AVAILABLE" },
      { id: "ext_slot_2", localDateTimeStart: "2099-05-12T14:00:00+05:30", capacity: 20, vacancies: 0, available: false },
    ],
  }));

  const slots = await getReservationProvider("OCTO_GENERIC").availability(db, {
    productId: "prd_local", optionId: "opt_local", localDate: "2099-05-12", supplierId: "sup_1",
  });

  assert.equal(calls[0].url, "https://remote.example/octo/availability");
  assert.equal(calls[0].options.headers.Authorization, "Bearer remote_key");
  assert.deepEqual(calls[0].body, { productId: "prd_local", optionId: "opt_local", localDateStart: "2099-05-12", localDateEnd: "2099-05-12" });

  assert.equal(slots.length, 2);
  assert.equal(slots[0].localDate, "2099-05-12");
  assert.equal(slots[0].localTime, "09:00", "the local time is derived from the OCTo start timestamp");
  assert.equal(slots[0].vacancies, 4);
  assert.equal(slots[0].available, true);
  assert.equal(slots[0].provider, "OCTO_GENERIC");
  assert.equal(slots[0].external, true);
  assert.equal(slots[1].available, false);
  assert.equal(slots[1].status, "SOLD_OUT", "a missing status is derived from vacancies");
});

test("external availability translates local ids to the provider's own ids", async t => {
  const db = providerDb();
  t.after(() => db.close());
  connect(db);
  db.prepare(`INSERT INTO reservation_external_references VALUES ('sup_1','OCTO_GENERIC','PRODUCT','prd_local','REMOTE-PRD-9')`).run();
  db.prepare(`INSERT INTO reservation_external_references VALUES ('sup_1','OCTO_GENERIC','OPTION','opt_local','REMOTE-OPT-3')`).run();
  const calls = stubFetch(t, () => ok({ availability: [] }));

  await getReservationProvider("OCTO_GENERIC").availability(db, {
    productId: "prd_local", optionId: "opt_local", localDate: "2099-05-12", supplierId: "sup_1",
  });
  assert.equal(calls[0].body.productId, "REMOTE-PRD-9", "the imported product's remote id is used");
  assert.equal(calls[0].body.optionId, "REMOTE-OPT-3");
});

test("an external reservation passes the idempotency key through and records the mapping", async t => {
  const db = providerDb();
  t.after(() => db.close());
  connect(db);
  const calls = stubFetch(t, () => ok({ uuid: "REMOTE-RES-77", status: "ON_HOLD", utcExpiresAt: "2099-05-12T03:40:00Z" }));

  const hold = await getReservationProvider("OCTO_GENERIC").reserve(db, {
    productId: "prd_local", optionId: "opt_local", localDate: "2099-05-12", localTime: "09:00",
    unitItems: [{ unitType: "ADULT", quantity: 2 }, { unitType: "CHILD", quantity: 1 }],
    supplierId: "sup_1", ownerId: "user_1", requestKey: "req_abc",
  });

  // A retry must reach the provider as the same reservation, not a second one.
  assert.equal(calls[0].body.uuid, "req_abc");
  assert.deepEqual(calls[0].body.unitItems.map(u => u.unitType), ["ADULT", "ADULT", "CHILD"],
    "quantities are expanded into one OCTo unit item per traveler");
  assert.equal(calls[0].body.availabilityId, "opt_local:2099-05-12:09:00");

  assert.equal(hold.id, "REMOTE-RES-77");
  assert.equal(hold.provider, "OCTO_GENERIC");
  assert.equal(hold.external, true);
  assert.equal(hold.utc_expires_at, "2099-05-12T03:40:00Z");

  const mapped = db.prepare("SELECT * FROM reservation_external_references WHERE resource_type = 'BOOKING'").get();
  assert.equal(mapped.internal_id, "req_abc");
  assert.equal(mapped.external_id, "REMOTE-RES-77");
});

test("an external reservation without a remote reference is treated as a provider failure", async t => {
  const db = providerDb();
  t.after(() => db.close());
  connect(db);
  stubFetch(t, () => ok({ status: "ON_HOLD" }));

  // No uuid means we cannot confirm or cancel later, so accepting it would
  // leave an unreachable reservation.
  await assert.rejects(
    () => getReservationProvider("OCTO_GENERIC").reserve(db, {
      productId: "p", optionId: "o", localDate: "2099-05-12", localTime: "09:00",
      adults: 1, supplierId: "sup_1", ownerId: "u", requestKey: "req_1",
    }),
    (error) => error.code === "PROVIDER_BAD_RESPONSE" && error.status === 502
  );
});

test("external confirm and release address the remote reservation, not the local id", async t => {
  const db = providerDb();
  t.after(() => db.close());
  connect(db);
  db.prepare(`INSERT INTO reservation_external_references VALUES ('sup_1','OCTO_GENERIC','BOOKING','bk_local','REMOTE-RES-5')`).run();
  const provider = getReservationProvider("OCTO_GENERIC");

  let calls = stubFetch(t, () => ok({ status: "CONFIRMED" }));
  await provider.confirm(db, { id: "bk_local", supplier_id: "sup_1" });
  assert.equal(calls[0].url, "https://remote.example/octo/bookings/confirmation");
  assert.equal(calls[0].body.uuid, "REMOTE-RES-5");

  calls = stubFetch(t, () => ok({ status: "CANCELLED" }));
  await provider.release(db, "bk_local", { supplierId: "sup_1" });
  assert.equal(calls[0].url, "https://remote.example/octo/bookings/cancellation");
  assert.equal(calls[0].body.uuid, "REMOTE-RES-5");
  assert.match(calls[0].body.reason, /Released by marketplace/);
});

test("a remote error message reaches the caller rather than being swallowed", async t => {
  const db = providerDb();
  t.after(() => db.close());
  connect(db);
  stubFetch(t, () => ({ ok: false, status: 409, json: async () => ({ error: "Departure sold out upstream", code: "SOLD_OUT" }) }));

  await assert.rejects(
    () => getReservationProvider("OCTO_GENERIC").reserve(db, {
      productId: "p", optionId: "o", localDate: "2099-05-12", localTime: "09:00",
      adults: 2, supplierId: "sup_1", ownerId: "u", requestKey: "req_2",
    }),
    (error) => /Departure sold out upstream/.test(error.message) && error.code === "SOLD_OUT"
  );
});
