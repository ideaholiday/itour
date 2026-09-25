import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import Database from "better-sqlite3";
import { BOKUN_OCTO_ENDPOINTS, getChannelAdapter } from "../src/services/channels/channelRegistry.js";
import { getReservationProvider } from "../src/services/reservationProviders.js";

// Bókun through its OCTo API (ADR 046), against a local server that follows the
// published OCTo standard: POST /availability, POST /bookings with unitIds,
// POST /bookings/{uuid}/confirm and /cancel. Not yet run against real Bókun.

const KEY = "bk_octo_key/vendor_7";
const PRODUCT = {
  id: "bk_p1", title: "Old Goa heritage walk", shortDescription: "Churches and convents", defaultCurrency: "INR",
  options: [{
    id: "bk_o1", title: "Morning", default: true, availabilityLocalStartTimes: ["09:00", "14:00"], restrictions: { maxUnits: 10 },
    units: [
      { id: "u_adult", type: "ADULT", pricingFrom: [{ retail: 180000, currency: "INR", currencyPrecision: 2 }] },
      { id: "u_child", type: "CHILD", pricingFrom: [{ retail: 90000, currency: "INR", currencyPrecision: 2 }] },
    ],
  }],
};
const EURO_PRODUCT = { id: "bk_p2", title: "Lisbon tram", options: [{ id: "bk_o2", units: [{ id: "u2", type: "ADULT", pricingFrom: [{ retail: 2500, currency: "EUR", currencyPrecision: 2 }] }] }] };

async function mockBokun(t) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ method: req.method, path: req.url, headers: req.headers, body });
      const send = (status, payload) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(payload)); };
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: "UNAUTHORIZED", errorMessage: "Invalid API key" });
      if (req.method === "GET" && req.url === "/products") return send(200, [PRODUCT, EURO_PRODUCT]);
      if (req.method === "GET" && req.url === "/products/bk_p1") return send(200, PRODUCT);
      if (req.method === "POST" && req.url === "/availability") {
        const day = body.localDateStart;
        return send(200, [
          { id: `${day}T09:00:00+05:30`, localDateTimeStart: `${day}T09:00:00+05:30`, status: "AVAILABLE", available: true, vacancies: 8, capacity: 10, utcCutoffAt: `${day}T02:30:00Z` },
          { id: `${day}T14:00:00+05:30`, localDateTimeStart: `${day}T14:00:00+05:30`, status: "SOLD_OUT", available: false, vacancies: 0, capacity: 10 },
        ]);
      }
      if (req.method === "POST" && req.url === "/bookings") return send(200, { uuid: body.uuid, status: "ON_HOLD", utcExpiresAt: "2099-05-12T03:00:00Z" });
      const action = req.url.match(/^\/bookings\/([^/]+)\/(confirm|cancel)$/);
      if (req.method === "POST" && action?.[2] === "confirm") return send(200, { uuid: action[1], status: "CONFIRMED" });
      if (req.method === "POST" && action?.[2] === "cancel") {
        return action[1] === "refused" ? send(400, { error: "BAD_REQUEST", errorMessage: "Booking can not be cancelled" }) : send(200, { uuid: action[1], status: "CANCELLED" });
      }
      return send(404, { error: "NOT_FOUND" });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return { endpoint: `http://127.0.0.1:${server.address().port}`, requests };
}

function providerDb(endpoint) {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE supplier_channel_connections (id TEXT PRIMARY KEY, supplier_id TEXT, channel_name TEXT, channel_title TEXT, endpoint_url TEXT,
      credentials_json TEXT, status TEXT, last_sync_at TEXT, last_sync_status TEXT, last_error TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE reservation_external_references (supplier_id TEXT, provider TEXT, resource_type TEXT, internal_id TEXT, external_id TEXT,
      UNIQUE(supplier_id, provider, resource_type, internal_id));
  `);
  db.prepare(`INSERT INTO supplier_channel_connections (id, supplier_id, channel_name, endpoint_url, credentials_json, status)
    VALUES ('ch_bk', 'sup_1', 'BOKUN', ?, ?, 'ACTIVE')`).run(endpoint, JSON.stringify({ apiKey: "bk_octo_key", vendorId: "vendor_7" }));
  const ref = db.prepare("INSERT INTO reservation_external_references (supplier_id, provider, resource_type, internal_id, external_id) VALUES ('sup_1', 'BOKUN', ?, ?, ?)");
  ref.run("PRODUCT", "prod_local", "bk_p1");
  ref.run("OPTION", "opt_local", "bk_o1");
  return db;
}

test("Bókun connects with a real call, sends the standard and Bókun auth headers, and refuses a bad key", async t => {
  const { endpoint, requests } = await mockBokun(t);
  const adapter = getChannelAdapter("BOKUN");
  const connected = await adapter.testConnection({ apiKey: "bk_octo_key", vendorId: "vendor_7", endpointUrl: endpoint });
  assert.deepEqual(connected, { success: true, status: "CONNECTED", provider: "BOKUN", products: 2 });
  assert.equal(requests[0].headers.authentication, `Bearer ${KEY}`);
  assert.equal(requests[0].headers["octo-capabilities"], "octo/pricing");
  await assert.rejects(() => adapter.testConnection({ apiKey: "wrong", endpointUrl: endpoint }),
    (error) => error.code === "PROVIDER_AUTH_FAILED" && /Invalid API key/.test(error.message));
});

test("Bókun uses its own live or test endpoint, needs a key, and refuses plain http off this machine", () => {
  const adapter = getChannelAdapter("BOKUN");
  assert.equal(adapter._config({ apiKey: "k" }).endpoint, BOKUN_OCTO_ENDPOINTS.LIVE);
  assert.equal(adapter._config({ apiKey: "k", environment: "test" }).endpoint, BOKUN_OCTO_ENDPOINTS.TEST);
  assert.equal(adapter._config({ apiKey: "k", vendorId: "v1" }).token, "k/v1");
  assert.throws(() => adapter._config({}), (error) => error.code === "BOKUN_KEY_REQUIRED");
  assert.throws(() => adapter._config({ apiKey: "k", endpointUrl: "http://bokun.example/octo/v1" }), (error) => error.code === "BOKUN_ENDPOINT_INVALID");
});

test("Bókun products import what Bókun sends and invent nothing: no rupee price for a euro product", async t => {
  const { endpoint } = await mockBokun(t);
  const [goa, lisbon] = await getChannelAdapter("BOKUN").fetchProducts({ apiKey: "bk_octo_key", vendorId: "vendor_7", endpointUrl: endpoint });
  assert.deepEqual(goa.options[0], { externalId: "bk_o1", name: "Morning", departureTimes: ["09:00", "14:00"], capacity: 10, adultPrice: 1800, childPrice: 900 });
  assert.deepEqual([goa.priceInr, goa.currency, goa.heroImage, goa.city], [1800, "INR", null, undefined]);
  assert.deepEqual([lisbon.priceInr, lisbon.options[0].adultPrice, lisbon.options[0].departureTimes, lisbon.options[0].capacity], [null, null, [], null]);
});

test("Bókun availability, reservation, confirmation and cancellation follow the OCTo standard end to end", async t => {
  const { endpoint, requests } = await mockBokun(t);
  const db = providerDb(endpoint);
  t.after(() => db.close());
  const provider = getReservationProvider("BOKUN");

  const slots = await provider.availability(db, { productId: "prod_local", optionId: "opt_local", localDate: "2099-05-12", supplierId: "sup_1" });
  assert.deepEqual(slots.map((slot) => [slot.localTime, slot.available, slot.vacancies, slot.provider]), [["09:00", true, 8, "BOKUN"], ["14:00", false, 0, "BOKUN"]]);
  assert.deepEqual(requests.at(-1).body, { productId: "bk_p1", optionId: "bk_o1", localDateStart: "2099-05-12", localDateEnd: "2099-05-12" });

  // Reserve: Bókun's own availability id and unit ids, a UUID from our idempotency key.
  const reserve = (overrides = {}) => provider.reserve(db, {
    productId: "prod_local", optionId: "opt_local", localDate: "2099-05-12", localTime: "09:00",
    unitItems: [{ unitType: "ADULT", quantity: 2 }, { unitType: "CHILD", quantity: 1 }],
    supplierId: "sup_1", ownerId: "owner_1", requestKey: "hold-abc", ...overrides,
  });
  const hold = await reserve();
  const booking = requests.find((request) => request.method === "POST" && request.path === "/bookings");
  assert.equal(booking.body.availabilityId, "2099-05-12T09:00:00+05:30");
  assert.deepEqual(booking.body.unitItems, [{ unitId: "u_adult" }, { unitId: "u_adult" }, { unitId: "u_child" }]);
  assert.match(booking.body.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual([hold.id, hold.status, hold.provider], [booking.body.uuid, "ON_HOLD", "BOKUN"]);
  await reserve();
  const retries = requests.filter((request) => request.path === "/bookings");
  assert.equal(retries[1].body.uuid, retries[0].body.uuid, "a retry reaches Bókun as the same reservation");

  await assert.rejects(() => reserve({ localTime: "14:00", requestKey: "hold-late" }), (error) => error.code === "SLOT_UNAVAILABLE" && error.status === 409);
  await assert.rejects(() => reserve({ unitItems: [{ unitType: "INFANT", quantity: 1 }], requestKey: "hold-infant" }), (error) => error.code === "UNIT_NOT_OFFERED");

  // Confirm with the traveller's contact; cancel; a refused cancellation reaches the caller.
  await provider.confirm(db, { supplier_id: "sup_1", id: "hold-abc", traveler_name: "Meera Iyer", traveler_email: "meera@example.com", traveler_phone: "+919812345678" });
  const confirm = requests.at(-1);
  assert.equal(confirm.path, `/bookings/${hold.id}/confirm`);
  assert.deepEqual(confirm.body.contact, { fullName: "Meera Iyer", emailAddress: "meera@example.com", phoneNumber: "+919812345678" });
  await provider.release(db, "hold-abc", { supplierId: "sup_1" });
  assert.equal(requests.at(-1).path, `/bookings/${hold.id}/cancel`);
  db.prepare("INSERT INTO reservation_external_references (supplier_id, provider, resource_type, internal_id, external_id) VALUES ('sup_1', 'BOKUN', 'BOOKING', 'hold-old', 'refused')").run();
  await assert.rejects(() => provider.release(db, "hold-old", { supplierId: "sup_1" }), (error) => /can not be cancelled/.test(error.message));
});
