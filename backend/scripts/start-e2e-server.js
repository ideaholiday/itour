import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const workspace = mkdtempSync(path.join(tmpdir(), "idea-holiday-browser-e2e-"));
const databasePath = path.join(workspace, "browser-e2e.sqlite");
writeFileSync(databasePath, "");

Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: process.env.PORT || "4000",
  DATABASE_ENGINE: "sqlite",
  SQLITE_DB_PATH: databasePath,
  SQLITE_JOURNAL_MODE: "DELETE",
  K_SERVICE: "",
  JWT_SECRET: "browser-e2e-jwt-secret-with-at-least-32-characters",
  OTP_SECRET: "browser-e2e-otp-secret-with-at-least-32-characters",
  DEMO_PAYMENT_ONLY: "true",
  ENABLE_DEMO_PAYMENT: "true",
  EMAIL_NOTIFICATIONS_ENABLED: "false",
  WHATSAPP_CLOUD_API_ENABLED: "false",
  NOTIFICATIONS_ENABLED: "false",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  CASHFREE_CLIENT_ID: "",
  CASHFREE_CLIENT_SECRET: "",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  LOG_LEVEL: "error",
  LOG_FORMAT: "json",
});

const [{ default: db }, { hashPassword }] = await Promise.all([
  import("../src/db.js"),
  import("../src/lib/passwords.js"),
]);

db.prepare(`
  INSERT INTO users (id, name, email, password, phone, role)
  VALUES (?, ?, ?, ?, ?, 'STAFF')
`).run(
  "user_browser_e2e_ops",
  "Browser E2E Operations",
  "browser.e2e.ops@example.test",
  hashPassword("BrowserOps@2026"),
  "+919876543211",
);

db.prepare(`
  INSERT INTO staff_tasks (id, task_type, assigned_staff_name, priority, status, notes)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  "task_browser_e2e_review",
  "BROWSER_E2E_REVIEW",
  "Browser E2E Operations",
  "HIGH",
  "OPEN",
  "Deterministic browser test task",
);

process.once("exit", () => {
  rmSync(workspace, { recursive: true, force: true });
});

await import("../src/server.js");
