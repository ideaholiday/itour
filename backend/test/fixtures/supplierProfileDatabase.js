import fs from "node:fs";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../../src/services/migrationRunner.js";

/**
 * The tables supplier profiles read, as db.js creates them, with migration 033
 * applied from the real file so the profile columns and tables match production.
 */
export function supplierProfileDatabase() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY, supplier_code TEXT UNIQUE, company_name TEXT NOT NULL, contact_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL, phone TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, gstin TEXT, pan_number TEXT,
      kyb_status TEXT DEFAULT 'APPROVED', commission_rate REAL DEFAULT 18.0, payout_bank_details TEXT DEFAULT '{}',
      rating REAL, created_at TEXT DEFAULT (datetime('now')), is_verified INTEGER DEFAULT 0, website_url TEXT,
      business_type TEXT, years_in_operation INTEGER, gstin_verified INTEGER DEFAULT 0, bank_verified INTEGER DEFAULT 0
    );
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, phone TEXT, role TEXT DEFAULT 'TRAVELER');
    CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT, title TEXT, sell_marketplace INTEGER DEFAULT 1, sell_ideaholiday_api INTEGER DEFAULT 1, sell_own_resellers INTEGER DEFAULT 1);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, product_id TEXT, supplier_id TEXT, traveler_name TEXT, status TEXT);
    CREATE TABLE reviews (
      id TEXT PRIMARY KEY, booking_id TEXT, user_id TEXT NOT NULL, product_id TEXT NOT NULL, supplier_id TEXT NOT NULL,
      experience_rating INTEGER NOT NULL, supplier_rating INTEGER NOT NULL, title TEXT, comment TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PUBLISHED', supplier_response TEXT, supplier_responded_at TEXT,
      source TEXT NOT NULL DEFAULT 'VERIFIED', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE review_photos (id TEXT PRIMARY KEY, review_id TEXT, photo_url TEXT, caption TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE quality_scores (
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, review_count INTEGER NOT NULL DEFAULT 0,
      average_rating REAL, PRIMARY KEY (entity_type, entity_id)
    );
    CREATE TABLE supplier_notifications (
      id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
      action_url TEXT, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const migration = fs.readFileSync(new URL("../../migrations/033_supplier_profiles.sql", import.meta.url), "utf8");
  executeMigrationSql(db, migration.split("-- @down")[0]);
  return db;
}

export function addSupplier(db, overrides = {}) {
  const row = {
    id: "sup_awadh",
    company_name: "Awadh Express Cabs",
    contact_name: "Rakesh Verma",
    email: "owner@awadh.example",
    phone: "+919876500123",
    city: "Lucknow",
    state: "Uttar Pradesh",
    gstin: "09ABCDE1234F1Z5",
    pan_number: "ABCDE1234F",
    kyb_status: "APPROVED",
    payout_bank_details: JSON.stringify({ account: "123456789012", ifsc: "HDFC0000001" }),
    created_at: "2025-03-01 10:00:00",
    ...overrides,
  };
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO suppliers (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(row));
  return db.prepare("SELECT * FROM suppliers WHERE id = ?").get(row.id);
}

export function addUser(db, { id = "user_amit", name = "Amit Kumar", email = "amit@example.com", role = "TRAVELER" } = {}) {
  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, 'x', ?)").run(id, name, email, role);
  return { id, name, email, role };
}
