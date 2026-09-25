import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { applySupplierSubscriptionMigration } from "./fixtures/supplierSubscriptions.js";
import {
  getOctoCapabilities,
  getOctoSuppliers,
  getOctoProducts,
  getOctoProduct,
  getOctoAvailability,
  countOctoUnits,
  createOctoReservation,
  confirmOctoReservation,
  cancelOctoReservation,
  getOctoBooking,
} from "../src/services/octoService.js";
import { requireApiPartner, generateApiKey } from "../src/middleware/apiPartner.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";

function setupOctoTestDb() {
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
      kyb_status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY, name TEXT, email TEXT, password TEXT, phone TEXT, role TEXT
    );

    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      sell_marketplace INTEGER DEFAULT 1, sell_ideaholiday_api INTEGER DEFAULT 1, sell_own_resellers INTEGER DEFAULT 1,
      product_code TEXT,
      supplier_id TEXT,
      product_type TEXT DEFAULT 'EXPERIENCE',
      title TEXT NOT NULL,
      city TEXT,
      price_inr REAL,
      status TEXT DEFAULT 'PUBLISHED',
      is_published INTEGER DEFAULT 1,
      is_instant_booking INTEGER DEFAULT 1,
      duration_hours REAL DEFAULT 4,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE product_options (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT,
      variant_name TEXT,
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
      min_party_size INTEGER NOT NULL DEFAULT 1,
      max_party_size INTEGER NOT NULL DEFAULT 0,
      unit_prices TEXT NOT NULL DEFAULT '{}',
      seatless_units TEXT NOT NULL DEFAULT '[]',
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
      unit_items TEXT NOT NULL DEFAULT '[]',
      promotion_id TEXT,
      api_partner_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      product_id TEXT,
      activity_date TEXT,
      pickup_time TEXT,
      adults INTEGER,
      children INTEGER,
      amount_inr INTEGER NOT NULL,
      ref TEXT NOT NULL,
      product_option_id TEXT,
      supplier_id TEXT,
      product_type TEXT NOT NULL,
      pickup_location TEXT NOT NULL,
      status TEXT,
      payment_status TEXT,
      traveler_name TEXT,
      traveler_email TEXT,
      traveler_phone TEXT,
      source TEXT NOT NULL DEFAULT 'B2C',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.prepare(`
    INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, is_verified, kyb_status, created_at)
    VALUES ('sup_test_01', 'Goa Adventure Club', 'Rahul Verma', 'rahul@goaadventure.com', '+919876543210', 'Goa', 'Goa', 1, 'APPROVED', '2026-01-01 00:00:00')
  `).run();

  db.prepare(`
    INSERT INTO products (id, product_code, supplier_id, title, city, price_inr, status, is_published)
    VALUES ('prod_test_01', 'GOA-ADV-01', 'sup_test_01', 'Sunset Sailing & Dolphin Cruise', 'Goa', 1800, 'PUBLISHED', 1)
  `).run();

  db.prepare(`
    INSERT INTO product_options (id, product_id, name, is_default, available_start_times, capacity)
    VALUES ('opt_test_01', 'prod_test_01', 'Evening Cruise', 1, '["16:00"]', 15)
  `).run();

  saveInventoryRules(db, "prod_test_01", "opt_test_01", {
    operatingDays: [0, 1, 2, 3, 4, 5, 6],
    departureTimes: ["16:00"],
    capacity: 15,
    adultPrice: 1800,
    childPrice: 1200,
    cutoffMinutes: 60,
    cancellationHours: 24,
    blackoutDates: [],
  });

  applySupplierSubscriptionMigration(db);
  return db;
}

test("OCTo Service: getOctoCapabilities returns core and pricing", () => {
  const caps = getOctoCapabilities();
  assert.ok(Array.isArray(caps));
  assert.ok(caps.some((c) => c.id === "octo/core" && c.required === true));
  assert.ok(caps.some((c) => c.id === "octo/pricing"));
});

test("OCTo Service: getOctoSuppliers returns verified suppliers", () => {
  const db = setupOctoTestDb();
  const suppliers = getOctoSuppliers(db);
  assert.equal(suppliers.length, 1);
  assert.equal(suppliers[0].id, "sup_test_01");
  assert.equal(suppliers[0].name, "Goa Adventure Club");
  assert.equal(suppliers[0].contact.email, "rahul@goaadventure.com");
});

test("OCTo Service: getOctoProducts returns products in OCTo schema", () => {
  const db = setupOctoTestDb();
  const products = getOctoProducts(db);
  assert.equal(products.length, 1);
  const p = products[0];
  assert.equal(p.id, "prod_test_01");
  assert.equal(p.internalName, "Sunset Sailing & Dolphin Cruise");
  assert.equal(p.timeZone, "Asia/Kolkata");
  assert.equal(p.options.length, 1);
  assert.equal(p.options[0].id, "opt_test_01");
  assert.deepEqual(p.options[0].availabilityLocalStartTimes, ["16:00"]);
  assert.equal(p.options[0].units.length, 2);
  assert.equal(p.options[0].units[0].type, "ADULT");
  assert.equal(p.options[0].units[0].pricingFrom[0].retail, 180000);
});

test("OCTo Service: getOctoAvailability checks real-time slot vacancies", () => {
  const db = setupOctoTestDb();
  const futureDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  const slots = getOctoAvailability(db, {
    productId: "prod_test_01",
    optionId: "opt_test_01",
    localDateStart: futureDate,
    localDateEnd: futureDate,
  });

  assert.equal(slots.length, 1);
  assert.equal(slots[0].capacity, 15);
  assert.equal(slots[0].vacancies, 15);
  assert.equal(slots[0].status, "AVAILABLE");
  assert.equal(slots[0].unitPricing[0].pricing.retail, 180000);
});

test("OCTo Service: full reservation lifecycle (reserve -> confirm -> cancel)", () => {
  const db = setupOctoTestDb();
  const futureDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  const availabilityId = `opt_test_01:${futureDate}:16:00`;

  // 1. Create 10-min reservation
  const reservation = createOctoReservation(db, {
    productId: "prod_test_01",
    optionId: "opt_test_01",
    availabilityId,
    unitItems: [{ unitId: "opt_test_01:adult" }, { unitId: "opt_test_01:child" }],
    contact: { fullName: "Aarav Sharma", email: "aarav@example.com" },
  });

  assert.ok(reservation.id);
  assert.equal(reservation.status, "ON_HOLD");
  assert.equal(reservation.unitItems.length, 2);
  assert.ok(reservation.utcExpiresAt);

  // Verify capacity deducted by 2
  const checkSlots = getOctoAvailability(db, {
    productId: "prod_test_01",
    optionId: "opt_test_01",
    localDateStart: futureDate,
  });
  assert.equal(checkSlots[0].vacancies, 13);

  // 2. Confirm reservation
  const confirmed = confirmOctoReservation(db, {
    uuid: reservation.id,
    contact: { fullName: "Aarav Sharma", email: "aarav@example.com", phoneNumber: "+919876543210" },
  });

  assert.equal(confirmed.status, "CONFIRMED");
  assert.ok(confirmed.voucher);
  assert.equal(confirmed.voucher.deliveryOptions[0].deliveryFormat, "QRCODE");

  // 3. Cancel reservation
  const cancelled = cancelOctoReservation(db, {
    uuid: reservation.id,
    reason: "Trip rescheduled",
  });

  assert.equal(cancelled.status, "CANCELLED");

  // Verify seats restored
  const restoredSlots = getOctoAvailability(db, {
    productId: "prod_test_01",
    optionId: "opt_test_01",
    localDateStart: futureDate,
  });
  assert.equal(restoredSlots[0].vacancies, 15);
});


test("OCTo Service: unit items are counted by declared type, not by unit id text", () => {
  // SENIOR and YOUTH bill as adults; CHILD and INFANT bill as children.
  assert.deepEqual(countOctoUnits([{ unitType: "SENIOR" }, { unitType: "YOUTH" }]), { adults: 2, children: 0 });
  assert.deepEqual(countOctoUnits([{ unitType: "INFANT" }, { unitType: "CHILD" }]), { adults: 0, children: 2 });

  // A unit id containing "child" must not override an explicit ADULT type.
  assert.deepEqual(countOctoUnits([{ unitId: "child_ticket_v2", unitType: "ADULT" }]), { adults: 1, children: 0 });

  // Callers that omit unitType still fall back to matching the id.
  assert.deepEqual(countOctoUnits([{ unitId: "child_ticket" }, { unitId: "adult_ticket" }]), { adults: 1, children: 1 });

  // An empty request still reserves a single adult seat.
  assert.deepEqual(countOctoUnits([]), { adults: 1, children: 0 });
});

test("OCTo Service: a supplier without approved KYB is neither listed nor bookable", () => {
  const db = setupOctoTestDb();
  db.prepare("UPDATE suppliers SET kyb_status = 'PENDING' WHERE id = 'sup_test_01'").run();
  const futureDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);

  assert.equal(getOctoSuppliers(db).length, 0);
  assert.equal(getOctoProducts(db).length, 0);
  assert.equal(getOctoProduct(db, "prod_test_01"), null);
  assert.deepEqual(getOctoAvailability(db, { productId: "prod_test_01", optionId: "opt_test_01", localDateStart: futureDate }), []);
  assert.throws(
    () => createOctoReservation(db, {
      productId: "prod_test_01",
      optionId: "opt_test_01",
      availabilityId: `opt_test_01:${futureDate}:16:00`,
      unitItems: [{ unitId: "opt_test_01:adult" }],
    }),
    (error) => error.status === 409 && error.code === "PRODUCT_NOT_BOOKABLE"
  );
});

test("OCTo Service: a hold cannot be confirmed once the supplier is suspended", () => {
  const db = setupOctoTestDb();
  const futureDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  const reservation = createOctoReservation(db, {
    productId: "prod_test_01",
    optionId: "opt_test_01",
    availabilityId: `opt_test_01:${futureDate}:16:00`,
    unitItems: [{ unitId: "opt_test_01:adult" }],
  });

  db.prepare("UPDATE suppliers SET kyb_status = 'SUSPENDED' WHERE id = 'sup_test_01'").run();

  assert.throws(
    () => confirmOctoReservation(db, { uuid: reservation.id, contact: { fullName: "Aarav Sharma", email: "aarav@example.com" } }),
    (error) => error.status === 409 && error.code === "PRODUCT_NOT_BOOKABLE"
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n, 0);
});

const partnerA = { id: "apip_a", supplier_id: null, prepaid: 0 };
const partnerB = { id: "apip_b", supplier_id: null, prepaid: 0 };

function holdFor(db, partner, extra = {}) {
  const futureDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  return createOctoReservation(db, {
    productId: "prod_test_01",
    optionId: "opt_test_01",
    availabilityId: `opt_test_01:${futureDate}:16:00`,
    unitItems: [{ unitId: "opt_test_01:adult" }],
    ...extra,
  }, partner);
}

test("OCTo Service: a partner cannot read, confirm or cancel another partner's reservation", () => {
  const db = setupOctoTestDb();
  const reservation = holdFor(db, partnerA);

  assert.equal(getOctoBooking(db, reservation.id, partnerB), null);
  assert.throws(() => confirmOctoReservation(db, { uuid: reservation.id }, partnerB), (error) => error.status === 404);
  assert.throws(() => cancelOctoReservation(db, { uuid: reservation.id }, partnerB), (error) => error.status === 404);
  assert.equal(db.prepare("SELECT status FROM native_reservations WHERE id = ?").get(reservation.id).status, "ON_HOLD");

  assert.equal(getOctoBooking(db, reservation.id, partnerA).id, reservation.id);
});

test("OCTo Service: a marketplace hold is out of reach of the OCTo API", () => {
  const db = setupOctoTestDb();
  db.prepare("INSERT INTO native_reservations (id, availability_slot, owner_id, request_key, adults, children, status, utc_expires_at) VALUES ('hold_web', 'x', 'user_traveler', 'k', 1, 0, 'CONFIRMED', '2099-01-01')").run();

  assert.throws(() => cancelOctoReservation(db, { uuid: "hold_web" }), (error) => error.status === 404);
  assert.equal(db.prepare("SELECT status FROM native_reservations WHERE id = 'hold_web'").get().status, "CONFIRMED");
});

test("OCTo Service: only a prepaid partner's confirmation is recorded as paid", () => {
  const db = setupOctoTestDb();
  const owed = holdFor(db, partnerA);
  confirmOctoReservation(db, { uuid: owed.id, contact: { fullName: "Aarav Sharma", email: "aarav@example.com" } }, partnerA);
  const prepaidPartner = { id: "apip_pre", supplier_id: null, prepaid: 1 };
  const paid = holdFor(db, prepaidPartner, { uuid: "prepaid-uuid-0001" });
  confirmOctoReservation(db, { uuid: paid.id, contact: { fullName: "Diya Rao", email: "diya@example.com" } }, prepaidPartner);

  const statuses = db.prepare("SELECT payment_status FROM bookings ORDER BY payment_status").all().map((row) => row.payment_status);
  assert.deepEqual(statuses, ["PAID", "PENDING"]);
  assert.deepEqual(db.prepare("SELECT DISTINCT source FROM bookings").all().map((row) => row.source), ["API"]);
});

test("OCTo Service: a supplier's own reseller key books only that supplier's products", () => {
  const db = setupOctoTestDb();
  const otherSupplierKey = { id: "apip_other", supplier_id: "sup_elsewhere", prepaid: 0 };
  assert.throws(() => holdFor(db, otherSupplierKey), (error) => error.code === "PRODUCT_NOT_BOOKABLE");
  const ownKey = { id: "apip_own", supplier_id: "sup_test_01", prepaid: 0 };
  assert.equal(holdFor(db, ownKey).status, "ON_HOLD");
});

test("OCTo partner keys: missing, wrong and revoked keys are refused", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE api_partners (id TEXT PRIMARY KEY, name TEXT, supplier_id TEXT, key_hash TEXT UNIQUE, key_prefix TEXT, prepaid INTEGER DEFAULT 0, status TEXT DEFAULT 'ACTIVE', last_used_at TEXT)");
  const active = generateApiKey();
  const revoked = generateApiKey();
  db.prepare("INSERT INTO api_partners (id, name, key_hash, key_prefix) VALUES ('apip_ok', 'Reseller', ?, ?)").run(active.keyHash, active.keyPrefix);
  db.prepare("INSERT INTO api_partners (id, name, key_hash, key_prefix, status) VALUES ('apip_old', 'Old', ?, ?, 'REVOKED')").run(revoked.keyHash, revoked.keyPrefix);
  const guard = requireApiPartner(db);

  const run = (authorization) => {
    const req = { headers: authorization ? { authorization } : {}, path: "/bookings/reservation" };
    const outcome = { status: 200, next: false };
    const res = { status(code) { outcome.status = code; return this; }, json() { return this; } };
    guard(req, res, () => { outcome.next = true; });
    return { ...outcome, partner: req.apiPartner };
  };

  assert.equal(run(null).status, 401);
  assert.equal(run("Bearer ihp_not_a_key").status, 401);
  assert.equal(run(`Bearer ${revoked.key}`).status, 401);
  const ok = run(`Bearer ${active.key}`);
  assert.equal(ok.next, true);
  assert.equal(ok.partner.id, "apip_ok");
  assert.ok(db.prepare("SELECT last_used_at FROM api_partners WHERE id = 'apip_ok'").get().last_used_at);
});
