// Isolated local PostgreSQL verification. Never points at the application's database.
import assert from "node:assert/strict";
import pg from "pg";
import fs from "node:fs";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { saveInventoryRules, listNativeAvailability } from "../src/services/nativeInventoryService.js";
const connectionString = "postgresql://native_test:test@127.0.0.1:55439/postgres";
const schema = `native_test_${Date.now()}`;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
  CREATE TABLE suppliers(id TEXT PRIMARY KEY, supplier_code TEXT);
  CREATE TABLE products(id TEXT PRIMARY KEY, product_code TEXT);
  CREATE TABLE bookings(id TEXT PRIMARY KEY, product_id TEXT, supplier_id TEXT, status TEXT, product_code TEXT, supplier_code TEXT);
  CREATE TABLE payouts(id TEXT PRIMARY KEY);
  CREATE TABLE product_options(id TEXT PRIMARY KEY, product_id TEXT, name TEXT DEFAULT 'Standard', is_active INTEGER DEFAULT 1, confirmation_type TEXT, available_start_times TEXT, capacity INTEGER);
  INSERT INTO products(id) VALUES ('p'); INSERT INTO product_options(id, product_id) VALUES ('o','p');`);
process.env.POSTGRES_SCHEMA = schema;
const { default: createDb } = await import("../src/postgresSyncDb.js");
const db = createDb(connectionString);
try {
  db.exec(fs.readFileSync(new URL("../migrations/017_native_reservations.sql", import.meta.url), "utf8").split("-- @down")[0]);
  for (const migration of ["018_native_reservation_delivery.sql", "019_native_hold_pricing.sql"]) db.exec(fs.readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8").split("-- @down")[0]);
  saveInventoryRules(db, "p", "o", { operatingDays: [0,1,2,3,4,5,6], departureTimes: ["09:00"], capacity: 3, adultPrice: 1000, childPrice: 500, cutoffMinutes: 120, cancellationHours: 24, blackoutDates: [] });
  db.transaction(() => {
    db.prepare("UPDATE products SET product_code = 'outer' WHERE id = 'p'").run();
    try { db.transaction(() => { db.prepare("UPDATE products SET product_code = 'inner' WHERE id = 'p'").run(); throw new Error("rollback"); })(); } catch {}
    assert.equal(db.prepare("SELECT product_code FROM products WHERE id = 'p'").get().product_code, "outer");
  })();
  const adapterPath = fileURLToPath(new URL("../src/postgresSyncDb.js", import.meta.url));
  const servicePath = fileURLToPath(new URL("../src/services/nativeInventoryService.js", import.meta.url));
  const compete = key => new Promise((resolve, reject) => {
    const worker = new Worker(`const { parentPort, workerData } = require('node:worker_threads'); (async () => {
      process.env.POSTGRES_SCHEMA = workerData.schema;
      const { default: create } = await import(workerData.adapterPath);
      const { reserveNativeInventory } = await import(workerData.servicePath);
      const db = create(workerData.connectionString);
      try { const hold = reserveNativeInventory(db, { productId:'p', optionId:'o', localDate:'2099-05-12', localTime:'09:00', adults:2, children:1, ownerId:workerData.key, requestKey:workerData.key }); parentPort.postMessage({status:'held', id:hold.id}); }
      catch (error) { parentPort.postMessage({status:error.code || 'error', message:error.message}); }
      finally { db.close(); }
    })().catch(e => { throw e; });`, { eval:true, workerData: { schema, adapterPath, servicePath, connectionString, key } });
    worker.once("message", resolve); worker.once("error", reject);
  });
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => compete(`user${index}`)));
  assert.equal(results.filter(r => r.status === "held").length, 1, JSON.stringify(results));
  assert.equal(results.filter(r => r.status === "INVENTORY_UNAVAILABLE").length, 5, JSON.stringify(results));
  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-12")[0].vacancies, 0);
  console.log("PostgreSQL migration, nested rollback and six-connection last-seat race passed");
} finally { db.close(); await client.query(`DROP SCHEMA ${schema} CASCADE`); await client.end(); }
