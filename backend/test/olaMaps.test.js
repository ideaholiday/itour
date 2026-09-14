import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { autocompletePlaces, drivingDistance, resetOlaMapsToken } from "../src/services/olaMapsService.js";
import mapsRouter from "../src/routes/maps.js";
import placesRouter from "../src/routes/places.js";
import { tripEta } from "../src/services/etaService.js";

const TOKEN_URL = "https://account.olamaps.io/realms/olamaps/protocol/openid-connect/token";

function json(body, status = 200) {
  return { ok: status < 400, status, json: async () => body, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer };
}

/** Fake Ola: issues tokens and answers API paths from `routes`; records every call. */
function fakeOla(routes) {
  const calls = [];
  let issued = 0;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.href === TOKEN_URL) {
      issued += 1;
      return json({ access_token: `token-${issued}`, expires_in: 3600 });
    }
    const handler = routes[url.pathname];
    return handler ? handler(url, options) : json({ message: "not found" }, 404);
  };
  return { fetchImpl, calls, tokens: () => issued };
}

function withOlaEnv(t, extra = {}) {
  const previous = { ...process.env };
  t.after(() => { process.env = previous; resetOlaMapsToken(); });
  resetOlaMapsToken();
  Object.assign(process.env, { OLA_MAPS_CLIENT_ID: "test-client", OLA_MAPS_CLIENT_SECRET: "test-secret" }, extra);
}

async function serve(t, router, fetchImpl) {
  const realFetch = globalThis.fetch;
  if (fetchImpl) {
    t.mock.method(globalThis, "fetch", (input, options) => (String(input).startsWith("http://127.0.0.1") ? realFetch(input, options) : fetchImpl(input, options)));
  }
  const app = express();
  app.use("/api", router);
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path, options) => realFetch(`${base}${path}`, { redirect: "manual", ...options });
}

test("Ola client reuses one bearer token and refreshes it once after a 401", async (t) => {
  withOlaEnv(t);
  let rejectNext = false;
  const ola = fakeOla({
    "/places/v1/autocomplete": (url, options) => {
      if (rejectNext) { rejectNext = false; return json({}, 401); }
      assert.match(options.headers.Authorization, /^Bearer token-\d$/);
      assert.ok(options.headers["X-Request-Id"]);
      assert.equal(url.searchParams.get("location"), "26.85,80.95");
      return json({ predictions: [{
        place_id: "ola-platform:1",
        types: ["airport"],
        structured_formatting: { main_text: "Lucknow Airport", secondary_text: "Amausi, Lucknow" },
        geometry: { location: { lat: 26.7647, lng: 80.8785 } },
      }] });
    },
  });

  const places = await autocompletePlaces("lucknow airport", { lat: 26.85, lng: 80.95, fetchImpl: ola.fetchImpl });
  assert.deepEqual(places, [{ id: "ola-platform:1", label: "Lucknow Airport", description: "Amausi, Lucknow", types: ["airport"], lat: 26.7647, lng: 80.8785 }]);
  await autocompletePlaces("lucknow", { lat: 26.85, lng: 80.95, fetchImpl: ola.fetchImpl });
  assert.equal(ola.tokens(), 1, "token cached between calls");

  rejectNext = true;
  await autocompletePlaces("lucknow", { lat: 26.85, lng: 80.95, fetchImpl: ola.fetchImpl });
  assert.equal(ola.tokens(), 2, "401 fetches a fresh token and retries");
});

test("Ola driving distance reads the basic distance matrix and rejects routeless answers", async (t) => {
  withOlaEnv(t);
  const ola = fakeOla({
    "/routing/v1/distanceMatrix/basic": (url) => (url.searchParams.get("destinations") === "0,0"
      ? json({ rows: [{ elements: [{ status: "NO_ROUTE" }] }] })
      : json({ rows: [{ elements: [{ distance: 19004, duration: 3032, status: "OK" }] }] })),
  });
  const from = { lat: 26.7606, lng: 80.8893 };
  assert.deepEqual(await drivingDistance(from, { lat: 26.8467, lng: 80.9462 }, { fetchImpl: ola.fetchImpl }), { distanceM: 19004, durationS: 3032 });
  await assert.rejects(drivingDistance(from, { lat: 0, lng: 0 }, { fetchImpl: ola.fetchImpl }), /no route/);
});

test("ETA uses Ola driving time when ETA_PROVIDER=ola", async (t) => {
  withOlaEnv(t, { ETA_PROVIDER: "ola" });
  const ola = fakeOla({ "/routing/v1/distanceMatrix/basic": () => json({ rows: [{ elements: [{ distance: 15817.7, duration: 1844.4, status: "OK" }] }] }) });
  assert.deepEqual(
    await tripEta({ lat: 26.1100, lng: 80.1200 }, { lat: 26.2100, lng: 80.2200 }, { now: 1_000, fetchImpl: ola.fetchImpl }),
    { minutes: 31, distanceM: 15_818, source: "OLA" },
  );
});

test("map tile proxy serves Ola tiles, validates coordinates and falls back to OpenStreetMap", async (t) => {
  withOlaEnv(t);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const ola = fakeOla({
    "/tiles/v1/styles/default-light-standard/12/2968/1715.png": () => ({ ok: true, status: 200, arrayBuffer: async () => png.buffer }),
  });
  const request = await serve(t, mapsRouter, ola.fetchImpl);

  const tile = await request("/api/tiles/12/2968/1715.png");
  assert.equal(tile.status, 200);
  assert.equal(tile.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await tile.arrayBuffer()), png);
  assert.equal((await request("/api/tiles/3/8/0.png")).status, 400, "x outside the zoom level");
  assert.equal((await request("/api/tiles/20/0/0.png")).status, 400, "zoom above the maximum");
  assert.equal((await request("/api/tiles/12/1/1.png")).status, 404, "upstream 404 passes through");

  delete process.env.OLA_MAPS_CLIENT_SECRET;
  const fallback = await request("/api/tiles/5/22/13.png");
  assert.equal(fallback.status, 302);
  assert.equal(fallback.headers.get("location"), "https://tile.openstreetmap.org/5/22/13.png");
});

test("places routes answer from Ola when its credentials are configured", async (t) => {
  withOlaEnv(t, { PLACES_PROVIDER: "" });
  const location = { lat: 26.764725, lng: 80.878551 };
  const ola = fakeOla({
    "/places/v1/autocomplete": () => json({ predictions: [{ place_id: "ola-platform:5000328387055", types: ["airport"], structured_formatting: { main_text: "Chaudhary Charan Singh International Airport", secondary_text: "Amausi, Lucknow" }, geometry: { location } }] }),
    "/places/v1/details": (url) => {
      assert.equal(url.searchParams.get("place_id"), "ola-platform:5000328387055");
      return json({ result: { place_id: "ola-platform:5000328387055", name: "CCS Airport", formatted_address: "Amausi, Lucknow, Uttar Pradesh 226008", types: ["airport"], geometry: { location } } });
    },
    "/places/v1/reverse-geocode": () => json({ results: [{ formatted_address: "Chillawan, Amausi, Lucknow, Uttar Pradesh, 226008, India" }] }),
  });
  const request = await serve(t, placesRouter, ola.fetchImpl);

  const search = await (await request("/api/places?query=lucknow%20airport")).json();
  assert.equal(search.provider, "ola");
  assert.equal(search.suggestions[0].id, "ola-platform:5000328387055");
  assert.equal(search.suggestions[0].category, "Airports");

  const resolved = await (await request("/api/places/resolve?placeId=ola-platform:5000328387055")).json();
  assert.deepEqual([resolved.location.lat, resolved.location.lng, resolved.location.address], [26.764725, 80.878551, "Amausi, Lucknow, Uttar Pradesh 226008"]);

  const reverse = await (await request("/api/places/reverse?lat=26.7606&lng=80.8893")).json();
  assert.equal(reverse.location.address, "Chillawan, Amausi, Lucknow, Uttar Pradesh, 226008, India");
});
