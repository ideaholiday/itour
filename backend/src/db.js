import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { INDIA_CITIES } from "./data/indiaCities.js";
import { ADMIN_LOGIN, hashPassword } from "./lib/passwords.js";
import logger from "./config/logger.js";
import { observeMetricsDatabase } from "./config/metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.join(__dirname, "..", ".env.local"), path.join(__dirname, "..", ".env")],
  quiet: true,
});

const usePostgres = String(process.env.DATABASE_ENGINE || "sqlite").toLowerCase() === "postgres";
let db;
let databaseInfo;

if (usePostgres) {
  const { default: createPostgresDatabase } = await import("./postgresSyncDb.js");
  db = createPostgresDatabase(process.env.DATABASE_URL);
  databaseInfo = Object.freeze({
    engine: "postgres",
    path: null,
    journalMode: "postgres",
    persistent: true,
    schema: process.env.POSTGRES_SCHEMA || "marketplace",
  });
} else {

const defaultDbPath = path.join(__dirname, "..", "wanderindia.db");
const configuredDbPath = String(process.env.SQLITE_DB_PATH || "").trim();
const targetDbPath = configuredDbPath ? path.resolve(configuredDbPath) : defaultDbPath;
const isCloudRun = Boolean(process.env.K_SERVICE);
const hasPersistentCloudRunVolume = process.env.SQLITE_PERSISTENT_VOLUME === "true";
const allowEphemeralDatabase = process.env.ALLOW_EPHEMERAL_DB === "true";

// Cloud Run's container filesystem (including /tmp and the application folder)
// is disposable. Refuse to accept live writes unless deployment explicitly
// confirms that SQLITE_DB_PATH points at a mounted persistent volume.
if (isCloudRun && !hasPersistentCloudRunVolume && !allowEphemeralDatabase) {
  throw new Error(
    "Persistent database storage is not configured. Mount durable storage, set SQLITE_DB_PATH, and set SQLITE_PERSISTENT_VOLUME=true."
  );
}

fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
fs.accessSync(path.dirname(targetDbPath), fs.constants.R_OK | fs.constants.W_OK);

// A brand-new mounted volume starts empty. Bootstrap it once from the demo
// database baked into the image, then keep using the mounted copy forever.
if (configuredDbPath && targetDbPath !== defaultDbPath && !fs.existsSync(targetDbPath) && fs.existsSync(defaultDbPath)) {
  fs.copyFileSync(defaultDbPath, targetDbPath, fs.constants.COPYFILE_EXCL);
  logger.info("Persistent SQLite database initialized", { databasePath: targetDbPath });
}

db = new Database(targetDbPath);
const requestedJournalMode = String(process.env.SQLITE_JOURNAL_MODE || "WAL").trim().toUpperCase();
const journalMode = ["WAL", "DELETE", "TRUNCATE", "PERSIST"].includes(requestedJournalMode)
  ? requestedJournalMode
  : "WAL";

try {
  db.pragma(`journal_mode = ${journalMode}`);
} catch (error) {
  logger.warn("SQLite journal mode unavailable; using DELETE mode", { journalMode, error });
  db.pragma("journal_mode = DELETE");
}
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

databaseInfo = Object.freeze({
  engine: "sqlite",
  path: targetDbPath,
  journalMode: db.pragma("journal_mode", { simple: true }),
  persistent: !isCloudRun || hasPersistentCloudRunVolume,
});

db.exec(`
-- 1. DESTINATIONS
CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  tagline TEXT,
  hero_image TEXT
);

-- 2. SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  supplier_code TEXT UNIQUE,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  gstin TEXT,
  pan_number TEXT,
  kyb_status TEXT DEFAULT 'APPROVED',
  commission_rate REAL DEFAULT 18.0,
  payout_bank_details TEXT DEFAULT '{}',
  rating REAL DEFAULT 4.8,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 3. KYB DOCUMENTS
CREATE TABLE IF NOT EXISTS kyb_documents (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  doc_type TEXT NOT NULL,
  doc_number TEXT,
  doc_url TEXT,
  status TEXT DEFAULT 'APPROVED',
  rejection_reason TEXT,
  verified_at TEXT DEFAULT (datetime('now'))
);

-- 4. GEO FENCES
CREATE TABLE IF NOT EXISTS geo_fences (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  zone_name TEXT NOT NULL,
  city TEXT NOT NULL,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  radius_km REAL DEFAULT 30.0,
  polygon_coordinates TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  approval_status TEXT DEFAULT 'APPROVED',
  review_note TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  submitted_at TEXT DEFAULT (datetime('now'))
);

-- 5. PRODUCTS MASTER
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  product_code TEXT UNIQUE,
  supplier_id TEXT REFERENCES suppliers(id),
  product_type TEXT NOT NULL,
  title TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  category TEXT NOT NULL,
  short_desc TEXT,
  full_desc TEXT,
  duration_hours REAL,
  price_inr INTEGER NOT NULL,
  strike_price_inr INTEGER,
  rating REAL DEFAULT 4.8,
  review_count INTEGER DEFAULT 12,
  bestseller INTEGER DEFAULT 0,
  free_cancellation INTEGER DEFAULT 1,
  cancellation_policy TEXT DEFAULT 'FLEXIBLE_24H',
  is_instant_booking INTEGER DEFAULT 1,
  group_type TEXT DEFAULT 'PRIVATE',
  status TEXT DEFAULT 'PUBLISHED',
  is_published INTEGER DEFAULT 1,
  hero_image TEXT,
  images TEXT,
  inclusions TEXT,
  exclusions TEXT,
  itinerary TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 6. TRANSFER ROUTES METADATA
CREATE TABLE IF NOT EXISTS transfer_routes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  route_type TEXT DEFAULT 'AIRPORT_PICKUP',
  origin_name TEXT NOT NULL,
  origin_lat REAL NOT NULL,
  origin_lng REAL NOT NULL,
  dest_name TEXT NOT NULL,
  dest_lat REAL NOT NULL,
  dest_lng REAL NOT NULL,
  distance_km REAL DEFAULT 30.0,
  duration_mins INTEGER DEFAULT 45,
  vehicle_category TEXT NOT NULL,
  max_passengers INTEGER NOT NULL,
  max_luggage INTEGER NOT NULL,
  free_waiting_mins INTEGER DEFAULT 60,
  toll_included INTEGER DEFAULT 1,
  state_tax_included INTEGER DEFAULT 1
);

-- 7. PACKAGE ITINERARIES
CREATE TABLE IF NOT EXISTS package_itineraries (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  total_days INTEGER NOT NULL,
  total_nights INTEGER NOT NULL,
  day_wise_details TEXT NOT NULL,
  has_hotel_option INTEGER DEFAULT 1,
  hotel_categories TEXT DEFAULT '["3_STAR", "4_STAR"]',
  start_city TEXT NOT NULL,
  end_city TEXT NOT NULL,
  vehicle_category TEXT NOT NULL
);

-- 8. PRODUCT PRICING VARIANTS
CREATE TABLE IF NOT EXISTS product_pricing (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  variant_name TEXT NOT NULL,
  pricing_model TEXT DEFAULT 'FIXED',
  base_price REAL NOT NULL,
  strike_price REAL,
  per_km_rate REAL DEFAULT 0.0,
  estimated_fastag_tolls REAL DEFAULT 0.0,
  estimated_state_tax REAL DEFAULT 0.0,
  tax_percentage REAL DEFAULT 5.0
);

-- 9. USERS
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'TRAVELER'
);

-- 10. BOOKINGS
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  product_id TEXT REFERENCES products(id),
  supplier_id TEXT REFERENCES suppliers(id),
  product_code TEXT,
  supplier_code TEXT,
  product_type TEXT NOT NULL,
  variant_name TEXT,
  activity_date TEXT NOT NULL,
  pickup_time TEXT,
  pickup_type TEXT DEFAULT 'HOTEL',
  pickup_location TEXT NOT NULL,
  pickup_instructions TEXT,
  drop_location TEXT,
  drop_instructions TEXT,
  pickup_lat REAL,
  pickup_lng REAL,
  drop_lat REAL,
  drop_lng REAL,
  flight_number TEXT,
  flight_arrival_time TEXT,
  terminal_gate TEXT,
  special_requests TEXT,
  promo_code TEXT,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  luggage_bags INTEGER DEFAULT 0,
  vehicle_category TEXT,
  traveler_name TEXT,
  traveler_phone TEXT,
  traveler_email TEXT,
  amount_inr INTEGER NOT NULL,
  tolls_and_tax_amount REAL DEFAULT 0.0,
  commission_amount REAL DEFAULT 0.0,
  supplier_payout_amount REAL DEFAULT 0.0,
  payment_method TEXT DEFAULT 'UPI',
  payment_status TEXT DEFAULT 'PENDING',
  status TEXT NOT NULL DEFAULT 'pending_payment',
  supplier_assignment_status TEXT DEFAULT 'UNASSIGNED',
  supplier_assignment_method TEXT,
  supplier_assignment_score REAL,
  supplier_assignment_reason TEXT,
  assigned_supplier_product_id TEXT,
  supplier_assigned_at TEXT,
  supplier_response_status TEXT DEFAULT 'NOT_STARTED',
  supplier_response_deadline TEXT,
  supplier_responded_at TEXT,
  supplier_response_note TEXT,
  assignment_round INTEGER DEFAULT 1,
  client_request_id TEXT,
  otp_code TEXT,
  otp_hash TEXT,
  otp_encrypted TEXT,
  otp_expires_at TEXT,
  otp_attempts INTEGER DEFAULT 0,
  otp_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. DRIVER ASSIGNMENTS
CREATE TABLE IF NOT EXISTS driver_assignments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  assignment_status TEXT DEFAULT 'ASSIGNED',
  supplier_driver_id TEXT REFERENCES supplier_drivers(id),
  assignment_source TEXT DEFAULT 'FLEET',
  assigned_by TEXT,
  notes TEXT,
  last_status_at TEXT DEFAULT (datetime('now')),
  en_route_at TEXT,
  arrived_at TEXT,
  trip_started_at TEXT,
  completed_at TEXT,
  assigned_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS driver_assignment_events (
  id TEXT PRIMARY KEY,
  assignment_id TEXT,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  supplier_driver_id TEXT,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  note TEXT,
  actor_id TEXT,
  details TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 12. PAYOUTS
CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  gross_amount REAL NOT NULL,
  commission_amount REAL NOT NULL,
  net_payout REAL NOT NULL,
  payout_status TEXT DEFAULT 'PROCESSED',
  processed_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- 13. STAFF TASKS
CREATE TABLE IF NOT EXISTS staff_tasks (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  booking_id TEXT REFERENCES bookings(id),
  product_id TEXT REFERENCES products(id),
  assigned_staff_name TEXT,
  priority TEXT DEFAULT 'MEDIUM',
  status TEXT DEFAULT 'OPEN',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 14. SUPPLIER DRIVERS FLEET
CREATE TABLE IF NOT EXISTS supplier_drivers (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  license_number TEXT,
  rating REAL DEFAULT 4.9,
  status TEXT DEFAULT 'AVAILABLE',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 15. BLOCKED DATES CALENDAR
CREATE TABLE IF NOT EXISTS blocked_dates (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  product_id TEXT,
  scope_type TEXT DEFAULT 'ALL',
  vehicle_id TEXT,
  vehicle_category TEXT,
  availability_type TEXT DEFAULT 'FULL_DAY',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  capacity_limit INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 16. SUPPLIER ASSIGNMENT AUDIT
CREATE TABLE IF NOT EXISTS supplier_assignment_attempts (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  candidate_product_id TEXT,
  coverage_zone_id TEXT,
  decision TEXT NOT NULL,
  score REAL DEFAULT 0,
  candidate_price REAL DEFAULT 0,
  vehicle_category TEXT,
  assignment_round INTEGER DEFAULT 1,
  response_status TEXT DEFAULT 'NOT_STARTED',
  response_at TEXT,
  response_note TEXT,
  rejection_reasons TEXT DEFAULT '[]',
  score_breakdown TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 17. CATEGORY COMMISSIONS OVERRIDES
CREATE TABLE IF NOT EXISTS category_commissions (
  category_code TEXT PRIMARY KEY,
  category_name TEXT NOT NULL,
  default_commission_rate REAL DEFAULT 15.0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 17. AUTOMATED EMAIL LOGS (FOR SUPPLIER APPROVAL / REJECTION)
CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'SENT', -- 'SENT', 'FAILED', 'QUEUED'
  sent_at TEXT DEFAULT (datetime('now'))
);

-- 18. AUTOMATED WHATSAPP VOUCHER LOGS (WHATSAPP BUSINESS API / INTERAKT / MSG91)
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id TEXT PRIMARY KEY,
  booking_ref TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  driver_name TEXT,
  driver_phone TEXT,
  vehicle_number TEXT,
  maps_link TEXT,
  message_body TEXT NOT NULL,
  gateway_status TEXT DEFAULT 'DELIVERED', -- 'QUEUED', 'SENT', 'DELIVERED', 'FAILED'
  sent_at TEXT DEFAULT (datetime('now'))
);

-- 18A. UNIFIED PROVIDER DELIVERY AUDIT
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  event_key TEXT UNIQUE,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_role TEXT NOT NULL,
  recipient_id TEXT,
  recipient_address TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT DEFAULT 'QUEUED',
  subject TEXT,
  body TEXT,
  error_message TEXT,
  metadata TEXT DEFAULT '{}',
  booking_id TEXT REFERENCES bookings(id),
  booking_ref TEXT,
  attempt_count INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  email_enabled INTEGER NOT NULL DEFAULT 1,
  whatsapp_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guest_document_access (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  document_type TEXT NOT NULL,
  accessed_by TEXT,
  access_method TEXT NOT NULL,
  accessed_at TEXT DEFAULT (datetime('now'))
);

-- 19. REFUNDS LOGS TABLE (RAZORPAY REFUND API)
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  booking_ref TEXT NOT NULL,
  refund_amount REAL NOT NULL,
  refund_percentage INTEGER NOT NULL, -- 100, 50, or 0
  policy_tier TEXT NOT NULL, -- '> 24h (100% Refund)', '12-24h (50% Refund)', '< 12h (No Refund)'
  gateway_refund_id TEXT,
  status TEXT DEFAULT 'PROCESSED', -- 'PROCESSED', 'FAILED', 'PENDING'
  reason TEXT,
  processed_at TEXT DEFAULT (datetime('now'))
);

-- 19B. TRAVELER SUPPORT, CANCELLATION AND DISPUTE CASES
CREATE TABLE IF NOT EXISTS support_cases (
  id TEXT PRIMARY KEY,
  case_ref TEXT UNIQUE NOT NULL,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  supplier_id TEXT REFERENCES suppliers(id),
  opened_by_user_id TEXT REFERENCES users(id),
  case_type TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  status TEXT NOT NULL DEFAULT 'OPEN',
  requested_refund_percentage INTEGER,
  policy_refund_percentage INTEGER,
  policy_refund_amount REAL,
  approved_refund_percentage INTEGER,
  refund_id TEXT REFERENCES refunds(id),
  assigned_to TEXT,
  resolution TEXT,
  first_response_due_at TEXT,
  resolution_due_at TEXT,
  first_responded_at TEXT,
  resolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_case_messages (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES support_cases(id),
  author_id TEXT,
  author_role TEXT NOT NULL,
  author_name TEXT,
  message TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_case_evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES support_cases(id),
  submitted_by TEXT,
  submitted_role TEXT NOT NULL,
  evidence_url TEXT NOT NULL,
  display_name TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_case_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES support_cases(id),
  actor_id TEXT,
  actor_role TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT,
  note TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 19C. VERIFIED TRAVELER REVIEWS AND QUALITY SCORES
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  driver_assignment_id TEXT REFERENCES driver_assignments(id),
  supplier_driver_id TEXT REFERENCES supplier_drivers(id),
  experience_rating INTEGER NOT NULL,
  supplier_rating INTEGER NOT NULL,
  driver_rating INTEGER,
  title TEXT,
  comment TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  would_recommend INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PUBLISHED',
  moderation_reason TEXT,
  moderated_by TEXT,
  moderated_at TEXT,
  supplier_response TEXT,
  supplier_responded_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quality_scores (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  average_rating REAL,
  completion_rate REAL,
  complaint_rate REAL,
  score_100 REAL NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'NEW',
  components TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (entity_type, entity_id)
);

-- 19A. SUPPLIER SETTLEMENT BATCHES
CREATE TABLE IF NOT EXISTS payout_batches (
  id TEXT PRIMARY KEY,
  batch_ref TEXT UNIQUE NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  gross_amount REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  payout_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  provider TEXT,
  provider_batch_id TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,
  reconciled_at TEXT
);

CREATE TABLE IF NOT EXISTS payout_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES payout_batches(id),
  payout_id TEXT NOT NULL REFERENCES payouts(id),
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  amount REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 19B. IMMUTABLE FINANCE EVENT LOG
CREATE TABLE IF NOT EXISTS financial_ledger (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id),
  supplier_id TEXT REFERENCES suppliers(id),
  payout_id TEXT REFERENCES payouts(id),
  refund_id TEXT REFERENCES refunds(id),
  event_type TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL,
  external_reference TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 20. PAYMENT WEBHOOK IDEMPOTENCY LOG
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payment_id TEXT,
  booking_id TEXT REFERENCES bookings(id),
  received_at TEXT DEFAULT (datetime('now'))
);

-- 21. SECURITY AND OPERATIONAL AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_role TEXT,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  outcome TEXT NOT NULL DEFAULT 'SUCCEEDED',
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Add operational codes to databases created before the code fields existed.
for (const statement of [
  "ALTER TABLE suppliers ADD COLUMN supplier_code TEXT",
  "ALTER TABLE products ADD COLUMN product_code TEXT",
  "ALTER TABLE bookings ADD COLUMN product_code TEXT",
  "ALTER TABLE bookings ADD COLUMN supplier_code TEXT",
]) {
  try { db.exec(statement); } catch {}
}
db.exec("UPDATE suppliers SET supplier_code = id WHERE NULLIF(TRIM(supplier_code), '') IS NULL");
db.exec("UPDATE products SET product_code = id WHERE NULLIF(TRIM(product_code), '') IS NULL");
db.exec(`
  UPDATE bookings
  SET product_code = COALESCE(NULLIF(TRIM(product_code), ''), product_id),
      supplier_code = COALESCE(NULLIF(TRIM(supplier_code), ''), supplier_id)
  WHERE NULLIF(TRIM(product_code), '') IS NULL OR NULLIF(TRIM(supplier_code), '') IS NULL
`);

// Safe migrations if table existed previously with older columns
const safeAlter = (table, colDef) => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
  } catch (e) {}
};

safeAlter("users", "role TEXT DEFAULT 'TRAVELER'");
safeAlter("suppliers", "commission_override_rate REAL");
safeAlter("destinations", "category TEXT DEFAULT 'TOURISM'");
safeAlter("destinations", "is_active INTEGER DEFAULT 1");
safeAlter("suppliers", "is_verified INTEGER DEFAULT 0");
safeAlter("geo_fences", "approval_status TEXT DEFAULT 'APPROVED'");
safeAlter("geo_fences", "review_note TEXT");
safeAlter("geo_fences", "reviewed_at TEXT");
safeAlter("geo_fences", "reviewed_by TEXT");
safeAlter("geo_fences", "submitted_at TEXT");
safeAlter("products", "is_published INTEGER DEFAULT 1");
safeAlter("products", "group_type TEXT DEFAULT 'PRIVATE'");
safeAlter("products", "created_at TEXT");
safeAlter("products", "cancellation_policy TEXT DEFAULT 'FLEXIBLE_24H'");
safeAlter("bookings", "product_id TEXT");
safeAlter("bookings", "supplier_id TEXT");
safeAlter("bookings", "product_type TEXT DEFAULT 'DAY_TOUR'");
safeAlter("bookings", "variant_name TEXT");
safeAlter("bookings", "pickup_time TEXT");
safeAlter("bookings", "pickup_type TEXT DEFAULT 'HOTEL'");
safeAlter("bookings", "pickup_location TEXT DEFAULT 'Hotel Pickup'");
safeAlter("bookings", "pickup_instructions TEXT");
safeAlter("bookings", "drop_location TEXT");
safeAlter("bookings", "drop_instructions TEXT");
safeAlter("bookings", "pickup_lat REAL");
safeAlter("bookings", "pickup_lng REAL");
safeAlter("bookings", "drop_lat REAL");
safeAlter("bookings", "drop_lng REAL");
safeAlter("bookings", "flight_number TEXT");
safeAlter("bookings", "flight_arrival_time TEXT");
safeAlter("bookings", "terminal_gate TEXT");
safeAlter("bookings", "special_requests TEXT");
safeAlter("bookings", "promo_code TEXT");
safeAlter("bookings", "luggage_bags INTEGER DEFAULT 0");
safeAlter("bookings", "vehicle_category TEXT");
safeAlter("bookings", "traveler_email TEXT");
safeAlter("bookings", "tolls_and_tax_amount REAL DEFAULT 0.0");
safeAlter("bookings", "commission_amount REAL DEFAULT 0.0");
safeAlter("bookings", "supplier_payout_amount REAL DEFAULT 0.0");
safeAlter("bookings", "payment_method TEXT DEFAULT 'UPI'");
safeAlter("bookings", "payment_status TEXT DEFAULT 'PAID'");
safeAlter("bookings", "supplier_assignment_status TEXT DEFAULT 'UNASSIGNED'");
safeAlter("bookings", "supplier_assignment_method TEXT");
safeAlter("bookings", "supplier_assignment_score REAL");
safeAlter("bookings", "supplier_assignment_reason TEXT");
safeAlter("bookings", "assigned_supplier_product_id TEXT");
safeAlter("bookings", "supplier_assigned_at TEXT");
safeAlter("bookings", "supplier_response_status TEXT DEFAULT 'NOT_STARTED'");
safeAlter("bookings", "supplier_response_deadline TEXT");
safeAlter("bookings", "supplier_responded_at TEXT");
safeAlter("bookings", "supplier_response_note TEXT");
safeAlter("bookings", "assignment_round INTEGER DEFAULT 1");
safeAlter("bookings", "client_request_id TEXT");
safeAlter("bookings", "otp_code TEXT");
safeAlter("bookings", "otp_hash TEXT");
safeAlter("bookings", "otp_encrypted TEXT");
safeAlter("bookings", "otp_expires_at TEXT");
safeAlter("bookings", "otp_attempts INTEGER DEFAULT 0");
safeAlter("bookings", "otp_verified_at TEXT");
safeAlter("bookings", "razorpay_order_id TEXT");
safeAlter("bookings", "razorpay_payment_id TEXT");
safeAlter("bookings", "razorpay_signature TEXT");
safeAlter("bookings", "cashfree_order_id TEXT");
safeAlter("bookings", "cashfree_payment_id TEXT");
safeAlter("bookings", "payment_session_id TEXT");
safeAlter("payouts", "transfer_id TEXT");
safeAlter("payouts", "created_at TEXT");
safeAlter("supplier_assignment_attempts", "assignment_round INTEGER DEFAULT 1");
safeAlter("supplier_assignment_attempts", "response_status TEXT DEFAULT 'NOT_STARTED'");
safeAlter("supplier_assignment_attempts", "response_at TEXT");
safeAlter("supplier_assignment_attempts", "response_note TEXT");
safeAlter("blocked_dates", "scope_type TEXT DEFAULT 'ALL'");
safeAlter("blocked_dates", "vehicle_id TEXT");
safeAlter("blocked_dates", "vehicle_category TEXT");
safeAlter("blocked_dates", "availability_type TEXT DEFAULT 'FULL_DAY'");
safeAlter("blocked_dates", "start_time TEXT");
safeAlter("blocked_dates", "end_time TEXT");
safeAlter("blocked_dates", "capacity_limit INTEGER DEFAULT 0");
safeAlter("blocked_dates", "is_active INTEGER DEFAULT 1");
safeAlter("email_logs", "provider TEXT DEFAULT 'LEGACY'");
safeAlter("email_logs", "provider_message_id TEXT");
safeAlter("email_logs", "error_message TEXT");
safeAlter("email_logs", "event_type TEXT");
safeAlter("email_logs", "recipient_role TEXT");
safeAlter("whatsapp_logs", "provider TEXT DEFAULT 'LEGACY'");
safeAlter("whatsapp_logs", "provider_message_id TEXT");
safeAlter("whatsapp_logs", "error_message TEXT");
safeAlter("whatsapp_logs", "event_type TEXT");
safeAlter("whatsapp_logs", "recipient_role TEXT");
safeAlter("driver_assignments", "supplier_driver_id TEXT");
safeAlter("driver_assignments", "assignment_source TEXT DEFAULT 'FLEET'");
safeAlter("driver_assignments", "assigned_by TEXT");
safeAlter("driver_assignments", "notes TEXT");
safeAlter("driver_assignments", "last_status_at TEXT");
safeAlter("driver_assignments", "en_route_at TEXT");
safeAlter("driver_assignments", "arrived_at TEXT");
safeAlter("driver_assignments", "trip_started_at TEXT");
safeAlter("driver_assignments", "completed_at TEXT");
safeAlter("bookings", "refunded_amount REAL DEFAULT 0");
safeAlter("bookings", "commission_rate_snapshot REAL");
safeAlter("refunds", "currency TEXT DEFAULT 'INR'");
safeAlter("refunds", "requested_by TEXT");
safeAlter("refunds", "requested_at TEXT");
safeAlter("refunds", "provider_status TEXT");
safeAlter("refunds", "error_message TEXT");
safeAlter("refunds", "reconciled_at TEXT");
safeAlter("refunds", "idempotency_key TEXT");
safeAlter("payouts", "settlement_batch_id TEXT");
safeAlter("payouts", "provider TEXT");
safeAlter("payouts", "provider_status TEXT");
safeAlter("payouts", "failure_reason TEXT");
safeAlter("payouts", "reconciled_at TEXT");
safeAlter("payouts", "reconciliation_note TEXT");
safeAlter("payouts", "idempotency_key TEXT");
safeAlter("notification_deliveries", "booking_id TEXT");
safeAlter("notification_deliveries", "booking_ref TEXT");

try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_client_request_id ON bookings(client_request_id) WHERE client_request_id IS NOT NULL");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_ref ON bookings(ref)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_assignments_booking ON driver_assignments(booking_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_driver_assignments_fleet_driver ON driver_assignments(supplier_driver_id, assignment_status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_driver_assignment_events_booking ON driver_assignment_events(booking_id, created_at)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_idempotency ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_batch_item_payout ON payout_batch_items(payout_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON payout_batches(status, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_financial_ledger_booking ON financial_ledger(booking_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id, created_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_assignment_attempts_booking ON supplier_assignment_attempts(booking_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_assignment_supplier_date ON bookings(supplier_id, activity_date, supplier_assignment_status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_availability_supplier_date ON blocked_dates(supplier_id, start_date, end_date, is_active)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_notification_status_created ON notification_deliveries(status, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_notification_recipient ON notification_deliveries(recipient_role, recipient_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_notification_booking ON notification_deliveries(booking_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_guest_document_booking ON guest_document_access(booking_id, accessed_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_support_cases_booking ON support_cases(booking_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_support_cases_status ON support_cases(status, priority, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_support_messages_case ON support_case_messages(case_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_reviews_supplier_status ON reviews(supplier_id, status, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_reviews_driver_status ON reviews(supplier_driver_id, status, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_products_search ON products(status, is_published, product_type, price_inr)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_products_city_state ON products(city, state)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_product_pricing_product ON product_pricing(product_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_transfer_routes_product ON transfer_routes(product_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_package_itineraries_product ON package_itineraries(product_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_destinations_active_name ON destinations(is_active, name)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quality_scores_entity ON quality_scores(entity_type, entity_id)");
} catch (e) {}

// Backfill timestamps required by the admin moderation and payout queues for
// databases created before these audit fields existed.
try {
  db.prepare("UPDATE products SET created_at = datetime('now') WHERE created_at IS NULL").run();
  db.prepare("UPDATE payouts SET created_at = COALESCE(processed_at, datetime('now')) WHERE created_at IS NULL").run();
  db.prepare("UPDATE geo_fences SET approval_status = COALESCE(approval_status, CASE WHEN is_active = 1 THEN 'APPROVED' ELSE 'SUSPENDED' END), submitted_at = COALESCE(submitted_at, datetime('now'))").run();
  db.prepare("UPDATE bookings SET supplier_assignment_status = 'LEGACY_ASSIGNED', supplier_assignment_method = 'LEGACY', supplier_assigned_at = COALESCE(supplier_assigned_at, created_at) WHERE supplier_id IS NOT NULL AND (supplier_assignment_status IS NULL OR supplier_assignment_status = 'UNASSIGNED')").run();
  db.prepare("UPDATE bookings SET commission_rate_snapshot = CASE WHEN amount_inr > 0 AND commission_amount IS NOT NULL THEN ROUND(commission_amount * 100.0 / amount_inr, 4) ELSE (SELECT commission_rate FROM suppliers WHERE suppliers.id = bookings.supplier_id) END WHERE commission_rate_snapshot IS NULL").run();
  db.prepare("UPDATE blocked_dates SET scope_type = CASE WHEN product_id IS NOT NULL THEN 'PRODUCT' ELSE 'ALL' END WHERE scope_type IS NULL OR scope_type = '' OR (scope_type = 'ALL' AND product_id IS NOT NULL)").run();
  db.prepare("UPDATE blocked_dates SET availability_type = 'FULL_DAY' WHERE availability_type IS NULL OR availability_type = ''").run();
  db.prepare("UPDATE blocked_dates SET capacity_limit = 0 WHERE capacity_limit IS NULL").run();
  db.prepare("UPDATE blocked_dates SET is_active = 1 WHERE is_active IS NULL").run();
} catch (e) {}

// Backfill the immutable finance event log without changing transaction state.
try {
  db.prepare(`INSERT OR IGNORE INTO financial_ledger (id, booking_id, supplier_id, event_type, amount, status, external_reference, idempotency_key, metadata, created_at)
    SELECT 'fin_payment_' || id, id, supplier_id, 'PAYMENT_CAPTURED', amount_inr, 'PROCESSED', razorpay_payment_id, 'payment:' || id, '{"source":"migration"}', created_at
    FROM bookings WHERE payment_status IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')`).run();
  db.prepare(`INSERT OR IGNORE INTO financial_ledger (id, booking_id, supplier_id, refund_id, event_type, amount, status, external_reference, idempotency_key, metadata, created_at)
    SELECT 'fin_refund_' || r.id, r.booking_id, b.supplier_id, r.id, 'REFUND_PROCESSED', r.refund_amount, r.status, r.gateway_refund_id, 'refund-final:' || r.id, '{"source":"migration"}', COALESCE(r.processed_at, b.created_at)
    FROM refunds r JOIN bookings b ON b.id = r.booking_id WHERE r.status IN ('PROCESSED', 'NO_REFUND')`).run();
  db.prepare(`INSERT OR IGNORE INTO financial_ledger (id, booking_id, supplier_id, payout_id, event_type, amount, status, external_reference, idempotency_key, metadata, created_at)
    SELECT 'fin_payout_' || p.id, p.booking_id, p.supplier_id, p.id, 'SUPPLIER_PAYOUT_PROCESSED', p.net_payout, 'PROCESSED', p.transfer_id, 'payout:' || p.id, '{"source":"migration"}', COALESCE(p.processed_at, p.created_at)
    FROM payouts p WHERE p.payout_status = 'PROCESSED'`).run();
} catch (e) {}

// Keep the approved supplier-city catalog available in fresh and upgraded
// databases without requiring the destructive development seed script.
try {
  const upsertCity = db.prepare(`
    INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      state = excluded.state,
      category = excluded.category,
      is_active = 1
  `);
  const addIndiaCities = db.transaction(() => {
    for (const [id, name, state, category] of INDIA_CITIES) {
      upsertCity.run(
        id,
        name,
        state,
        category === "METRO" ? "Major Indian metro and business hub" : "Popular Indian tourism destination",
        "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80",
        category
      );
    }
  });
  addIndiaCities();
} catch (e) {
  logger.warn("India city catalog refresh failed", { error: e });
}

// Migrate only the original seeded marketplace accounts to the Idea Holiday domain.
try {
  db.prepare("UPDATE users SET email = 'traveler@ideaholiday.in' WHERE id = 'user_traveler' AND email = 'traveler@wanderindia.com'").run();
  if (ADMIN_LOGIN.password) {
    db.prepare(
      "UPDATE users SET email = ?, password = ?, role = 'ADMIN' WHERE id = 'user_admin' OR email = ? OR email = ?"
    ).run(ADMIN_LOGIN.email, hashPassword(ADMIN_LOGIN.password), ADMIN_LOGIN.email, "admin@wanderindia.com");
  }
  db.prepare("UPDATE users SET email = 'ops@ideaholiday.in' WHERE id = 'user_ops' AND email = 'ops@wanderindia.com'").run();
} catch (e) {}

// Initialize default category commissions if empty
try {
  const count = db.prepare("SELECT COUNT(*) as count FROM category_commissions").get().count;
  if (count === 0) {
    db.prepare("INSERT INTO category_commissions (category_code, category_name, default_commission_rate) VALUES ('TRANSFER', 'Airport & Intercity Transfers', 15.0)").run();
    db.prepare("INSERT INTO category_commissions (category_code, category_name, default_commission_rate) VALUES ('DAY_TOUR', 'Day Tours & Sightseeing', 18.0)").run();
    db.prepare("INSERT INTO category_commissions (category_code, category_name, default_commission_rate) VALUES ('MULTI_DAY_PACKAGE', 'Multi-Day Holiday Packages', 12.0)").run();
  }
} catch (e) {}

}

// Keep the production admin credential in sync across both database engines.
// PostgreSQL skips the SQLite-only schema/bootstrap block above, so this must
// run after the engine selection for existing live databases as well.
try {
  if (!ADMIN_LOGIN.password) {
    if (process.env.NODE_ENV === "production") {
      logger.warn("Admin credential was not synchronized because ADMIN_INITIAL_PASSWORD is not configured");
    }
  } else {
    const adminMigration = db.prepare(`
      UPDATE users
      SET email = ?, password = ?, role = 'ADMIN'
      WHERE id = ? OR LOWER(email) IN (?, ?)
    `);
    const result = adminMigration.run(
      ADMIN_LOGIN.email,
      hashPassword(ADMIN_LOGIN.password),
      "user_admin",
      ADMIN_LOGIN.email,
      "admin@wanderindia.com"
    );
    if (result.changes > 0) logger.info("Admin credential synchronized", { adminId: ADMIN_LOGIN.id });
  }
} catch (error) {
  logger.warn("Admin credential synchronization failed", { error });
}

observeMetricsDatabase(db, databaseInfo.engine);

export { databaseInfo };
export default db;
