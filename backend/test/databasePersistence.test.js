import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const backendDirectory = path.resolve(import.meta.dirname, "..");
const databaseModuleUrl = pathToFileURL(path.join(backendDirectory, "src", "db.js")).href;

function runDatabaseProcess(source, environment) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: backendDirectory,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}

test("supplier and product records survive a backend process restart", () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "idea-holiday-db-test-"));
  const databasePath = path.join(temporaryDirectory, "marketplace.db");
  const environment = {
    SQLITE_DB_PATH: databasePath,
    SQLITE_JOURNAL_MODE: "WAL",
    K_SERVICE: "",
  };

  try {
    const writer = runDatabaseProcess(`
      const { default: db } = await import(${JSON.stringify(databaseModuleUrl)});
      db.prepare(\`INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state) VALUES (?, ?, ?, ?, ?, ?, ?)\`)
        .run("sup_persistence_test", "Persistent Tours", "Test Owner", "persist@example.com", "+919999999999", "Goa", "Goa");
      db.prepare(\`INSERT INTO products (id, supplier_id, product_type, title, city, state, category, price_inr) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`)
        .run("prod_persistence_test", "sup_persistence_test", "DAY_TOUR", "Persistent Product", "Goa", "Goa", "Day Sightseeing", 1500);
      db.close();
    `, environment);
    assert.equal(writer.status, 0, writer.stderr);

    const reader = runDatabaseProcess(`
      const { default: db } = await import(${JSON.stringify(databaseModuleUrl)});
      const supplier = db.prepare("SELECT company_name FROM suppliers WHERE id = ?").get("sup_persistence_test");
      const product = db.prepare("SELECT title FROM products WHERE id = ?").get("prod_persistence_test");
      console.log(JSON.stringify({ supplier, product }));
      db.close();
    `, environment);
    assert.equal(reader.status, 0, reader.stderr);
    const result = JSON.parse(reader.stdout.trim().split("\n").at(-1));
    assert.equal(result.supplier.company_name, "Persistent Tours");
    assert.equal(result.product.title, "Persistent Product");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("Cloud Run refuses disposable database storage", () => {
  const result = runDatabaseProcess(
    `await import(${JSON.stringify(databaseModuleUrl)});`,
    {
      K_SERVICE: "idea-holiday-test",
      SQLITE_DB_PATH: "",
      SQLITE_PERSISTENT_VOLUME: "false",
      ALLOW_EPHEMERAL_DB: "false",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Persistent database storage is not configured/);
});
