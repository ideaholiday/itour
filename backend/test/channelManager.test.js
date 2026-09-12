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

test("Channel Manager: connects supplier to Bókun, fetches products, and imports catalog", async () => {
  const db = setupChannelTestDb();

  // 1. Connect Bókun channel
  const connection = await connectSupplierChannel(db, {
    supplierId: "sup_channel_01",
    channelName: "BOKUN",
    channelTitle: "Primary Bókun Account",
    credentials: { accessKey: "bk_test_access_key_123", secretKey: "bk_secret_456" },
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
