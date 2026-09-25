import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { getChannelAdapter, channelAdapters } from "../src/services/channels/channelRegistry.js";
import {
  connectSupplierChannel,
  listSupplierChannels,
  fetchRemoteChannelProducts,
  importRemoteProducts,
  disconnectSupplierChannel,
} from "../src/services/channelManagerService.js";

function setupChannelTestDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      city TEXT,
      state TEXT,
      is_verified INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      product_code TEXT,
      supplier_id TEXT,
      product_type TEXT,
      group_type TEXT,
      title TEXT NOT NULL,
      city TEXT,
      category TEXT,
      short_desc TEXT,
      full_desc TEXT,
      duration_hours REAL,
      price_inr REAL,
      hero_image TEXT,
      status TEXT DEFAULT 'DRAFT',
      is_published INTEGER DEFAULT 0,
      is_instant_booking INTEGER DEFAULT 1,
      cancellation_policy TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE product_options (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT,
      is_default INTEGER DEFAULT 1,
      confirmation_type TEXT DEFAULT 'INSTANT',
      available_start_times TEXT,
      capacity INTEGER DEFAULT 10,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE native_inventory_rules (
      option_id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      operating_days TEXT NOT NULL,
      departure_times TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      adult_price INTEGER NOT NULL,
      child_price INTEGER NOT NULL,
      cutoff_minutes INTEGER NOT NULL DEFAULT 0,
      cancellation_hours INTEGER NOT NULL DEFAULT 24,
      blackout_dates TEXT NOT NULL DEFAULT '[]',
      time_zone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE native_availability_slots (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      option_id TEXT NOT NULL,
      local_date TEXT NOT NULL,
      local_time TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      closed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE native_reservations (
      id TEXT PRIMARY KEY,
      availability_slot TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      booking_id TEXT,
      request_key TEXT NOT NULL,
      adults INTEGER NOT NULL,
      children INTEGER NOT NULL,
      status TEXT NOT NULL,
      utc_expires_at TEXT NOT NULL,
      pricing_snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      product_id TEXT,
      activity_date TEXT,
      pickup_time TEXT,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE supplier_channel_connections (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      channel_title TEXT,
      endpoint_url TEXT,
      credentials_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_sync_at TEXT,
      last_sync_status TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE reservation_external_references (
      provider TEXT NOT NULL,
      resource_type TEXT NOT NULL CHECK (resource_type IN ('PRODUCT', 'OPTION', 'AVAILABILITY', 'BOOKING', 'UNIT')),
      internal_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      PRIMARY KEY(provider, supplier_id, resource_type, internal_id),
      UNIQUE(provider, supplier_id, resource_type, external_id)
    );
  `);

  db.prepare(`
    INSERT INTO suppliers (id, company_name, email, city, state)
    VALUES ('sup_channel_01', 'Himalayan Trails Ltd', 'trails@himalayas.com', 'Manali', 'Himachal Pradesh')
  `).run();

  return db;
}

test("Channel Registry: retrieves all supported ResTech adapters", () => {
  const channels = ["BOKUN", "FAREHARBOR", "BOOKINGKIT", "TOURCMS", "ACTIVITAR", "ANCHOR", "OCTO_GENERIC"];
  for (const ch of channels) {
    const adapter = getChannelAdapter(ch);
    assert.ok(adapter);
    assert.equal(adapter.name, ch);
  }
});

test("Channel Manager: connects supplier to Bókun, fetches products, and imports catalog", async t => {
  const db = setupChannelTestDb();
  // Bókun's OCTo API answers with one product (ADR 046).
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [{
    id: "bk_prod_1", title: "Old Goa heritage walk", shortDescription: "Churches and convents", defaultCurrency: "INR",
    options: [{ id: "bk_opt_1", title: "Morning", availabilityLocalStartTimes: ["08:30"], restrictions: { maxUnits: 12 },
      units: [{ id: "u_adult", type: "ADULT", pricingFrom: [{ retail: 180000, currency: "INR", currencyPrecision: 2 }] }] }],
  }] });
  t.after(() => { globalThis.fetch = original; });

  // 1. Connect Bókun channel
  const connection = await connectSupplierChannel(db, {
    supplierId: "sup_channel_01",
    channelName: "BOKUN",
    channelTitle: "Primary Bókun Account",
    credentials: { apiKey: "bk_octo_test_key" },
  });

  assert.ok(connection.id);
  assert.equal(connection.channelName, "BOKUN");

  // 2. List channels
  const channels = listSupplierChannels(db, "sup_channel_01");
  assert.equal(channels.length, 1);
  assert.equal(channels[0].channel_name, "BOKUN");
  assert.equal(channels[0].status, "ACTIVE");

  // 3. Fetch remote products
  const products = await fetchRemoteChannelProducts(db, {
    supplierId: "sup_channel_01",
    connectionId: connection.id,
  });

  assert.ok(products.length > 0);
  assert.equal(products[0].isImported, false);

  // 4. Import products into Idea Holiday
  const importResult = await importRemoteProducts(db, {
    supplierId: "sup_channel_01",
    connectionId: connection.id,
    productsToImport: products,
  });

  assert.equal(importResult.success, true);
  assert.equal(importResult.importedCount, products.length);

  // Verify product created in products table
  const createdProd = db.prepare("SELECT * FROM products WHERE supplier_id = ?").get("sup_channel_01");
  assert.ok(createdProd);
  assert.equal(createdProd.status, "DRAFT");
  assert.equal(createdProd.is_published, 0);

  // Verify external reference mapped
  const extRef = db.prepare("SELECT * FROM reservation_external_references WHERE internal_id = ?").get(createdProd.id);
  assert.ok(extRef);
  assert.equal(extRef.provider, "BOKUN");
  assert.equal(extRef.supplier_id, "sup_channel_01");

  // 5. Fetch again - should now report isImported = true
  const refetched = await fetchRemoteChannelProducts(db, {
    supplierId: "sup_channel_01",
    connectionId: connection.id,
  });
  assert.equal(refetched[0].isImported, true);
  assert.equal(refetched[0].internalProductId, createdProd.id);

  // 6. Disconnect channel
  const disconnectResult = disconnectSupplierChannel(db, {
    supplierId: "sup_channel_01",
    connectionId: connection.id,
  });
  assert.equal(disconnectResult.success, true);
  assert.equal(listSupplierChannels(db, "sup_channel_01").length, 0);
});

// --- Error paths on the channel boundary ---
// Every connector reaches a third party we do not control, so these cover what
// happens when that party refuses, breaks, or returns nothing.

/** Swaps one adapter's methods for the duration of a test. */
function stubAdapter(t, channelName, overrides) {
  const adapter = getChannelAdapter(channelName);
  const originals = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = adapter[key];
    adapter[key] = value;
  }
  t.after(() => { for (const [key, value] of Object.entries(originals)) adapter[key] = value; });
  return adapter;
}

test("Channel Manager: an unsupported channel is refused before any database write", async t => {
  const db = setupChannelTestDb();
  t.after(() => db.close());

  await assert.rejects(
    () => connectSupplierChannel(db, { supplierId: "sup_test_1", channelName: "NOT_A_CHANNEL", credentials: {} }),
    (error) => error.code === "UNSUPPORTED_CHANNEL" && error.status === 400
  );
  assert.equal(listSupplierChannels(db, "sup_test_1").length, 0, "nothing may be stored for a channel we cannot talk to");
});

test("Channel Manager: a refused or broken remote connection stores nothing", async t => {
  const db = setupChannelTestDb();
  t.after(() => db.close());

  // The provider answers, but rejects the credentials.
  stubAdapter(t, "BOKUN", { testConnection: async () => ({ success: false, error: "Invalid API key" }) });
  await assert.rejects(
    () => connectSupplierChannel(db, { supplierId: "sup_test_1", channelName: "BOKUN", credentials: { accessKey: "bad" } }),
    /Invalid API key/,
    "the provider's own reason must reach the supplier"
  );
  assert.equal(listSupplierChannels(db, "sup_test_1").length, 0);

  // The provider returns something unusable rather than a clear failure.
  stubAdapter(t, "BOKUN", { testConnection: async () => null });
  await assert.rejects(
    () => connectSupplierChannel(db, { supplierId: "sup_test_1", channelName: "BOKUN", credentials: {} }),
    /Remote connection failed/
  );

  // The provider is simply down.
  stubAdapter(t, "BOKUN", { testConnection: async () => { throw new Error("ECONNREFUSED"); } });
  await assert.rejects(
    () => connectSupplierChannel(db, { supplierId: "sup_test_1", channelName: "BOKUN", credentials: {} }),
    /ECONNREFUSED/
  );
  assert.equal(listSupplierChannels(db, "sup_test_1").length, 0, "a failed handshake must never leave a connection behind");
});

test("Channel Manager: reconnecting the same channel updates instead of duplicating", async t => {
  const db = setupChannelTestDb();
  t.after(() => db.close());
  stubAdapter(t, "BOKUN", { testConnection: async () => ({ success: true }) });

  const first = await connectSupplierChannel(db, {
    supplierId: "sup_test_1", channelName: "bokun", channelTitle: "Bókun", endpointUrl: "https://a.example", credentials: { accessKey: "k1" },
  });
  const second = await connectSupplierChannel(db, {
    supplierId: "sup_test_1", channelName: "BOKUN", channelTitle: "Bókun Live", endpointUrl: "https://b.example", credentials: { accessKey: "k2" },
  });

  assert.equal(first.id, second.id, "the same channel reuses its connection id");
  const channels = listSupplierChannels(db, "sup_test_1");
  assert.equal(channels.length, 1, "a supplier must not accumulate duplicate rows for one channel");
  assert.equal(channels[0].channel_title, "Bókun Live", "the newest details win");
  assert.equal(channels[0].endpoint_url, "https://b.example");
  assert.equal(channels[0].channel_name, "BOKUN", "the channel name is normalised to upper case");
});

test("Channel Manager: stored credentials are never returned to the client", async t => {
  const db = setupChannelTestDb();
  t.after(() => db.close());
  stubAdapter(t, "BOKUN", { testConnection: async () => ({ success: true }) });

  await connectSupplierChannel(db, {
    supplierId: "sup_test_1", channelName: "BOKUN", credentials: { accessKey: "SUPER_SECRET", secretKey: "ALSO_SECRET" },
  });

  // This list feeds GET /api/supplier-channels directly, so a future SELECT *
  // here would leak every supplier's provider API keys.
  const serialized = JSON.stringify(listSupplierChannels(db, "sup_test_1"));
  assert.doesNotMatch(serialized, /SUPER_SECRET/);
  assert.doesNotMatch(serialized, /ALSO_SECRET/);
  assert.doesNotMatch(serialized, /credentials/i);
});

test("Channel Manager: a failed product fetch is recorded against the connection and rethrown", async t => {
  const db = setupChannelTestDb();
  t.after(() => db.close());
  stubAdapter(t, "BOKUN", { testConnection: async () => ({ success: true }) });
  const connection = await connectSupplierChannel(db, { supplierId: "sup_test_1", channelName: "BOKUN", credentials: {} });

  stubAdapter(t, "BOKUN", { fetchProducts: async () => { throw new Error("Rate limit exceeded"); } });
  await assert.rejects(
    () => fetchRemoteChannelProducts(db, { supplierId: "sup_test_1", connectionId: connection.id }),
    /Rate limit exceeded/
  );

  const [stored] = listSupplierChannels(db, "sup_test_1");
  assert.equal(stored.last_sync_status, "ERROR", "the supplier can see the channel is unhealthy");
  assert.equal(stored.last_error, "Rate limit exceeded");
});

test("Channel Manager: another supplier cannot reach or delete a connection", async t => {
  const db = setupChannelTestDb();
  t.after(() => db.close());
  db.prepare("INSERT INTO suppliers (id, company_name) VALUES ('sup_other', 'Other Co')").run();
  stubAdapter(t, "BOKUN", { testConnection: async () => ({ success: true }) });
  const connection = await connectSupplierChannel(db, { supplierId: "sup_test_1", channelName: "BOKUN", credentials: {} });

  await assert.rejects(
    () => fetchRemoteChannelProducts(db, { supplierId: "sup_other", connectionId: connection.id }),
    (error) => error.status === 404,
    "a connection must be invisible to any other supplier"
  );
  assert.throws(
    () => disconnectSupplierChannel(db, { supplierId: "sup_other", connectionId: connection.id }),
    (error) => error.status === 404
  );
  assert.equal(listSupplierChannels(db, "sup_test_1").length, 1, "the owner still has their connection");

  // Unknown ids are 404s, not silent successes.
  assert.throws(() => disconnectSupplierChannel(db, { supplierId: "sup_test_1", connectionId: "ch_missing" }),
    (error) => error.status === 404);
  assert.deepEqual(disconnectSupplierChannel(db, { supplierId: "sup_test_1", connectionId: connection.id }),
    { success: true, message: "Channel disconnected" });
});

test("Channel Manager: an empty remote catalog is not an error", async t => {
  const db = setupChannelTestDb();
  t.after(() => db.close());
  stubAdapter(t, "BOKUN", { testConnection: async () => ({ success: true }), fetchProducts: async () => [] });
  const connection = await connectSupplierChannel(db, { supplierId: "sup_test_1", channelName: "BOKUN", credentials: {} });

  const products = await fetchRemoteChannelProducts(db, { supplierId: "sup_test_1", connectionId: connection.id });
  assert.deepEqual(products, [], "a supplier with no remote products sees an empty list, not a failure");
  assert.notEqual(listSupplierChannels(db, "sup_test_1")[0].last_sync_status, "ERROR");
});
