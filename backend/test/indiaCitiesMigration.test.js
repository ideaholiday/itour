import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { INDIA_CITIES } from "../src/data/indiaCities.js";

const [up, down] = fs.readFileSync(new URL("../migrations/060_more_india_cities.sql", import.meta.url), "utf8").split("-- @down");

// Production as it was: the seeded catalogue, including the old dest_goa duplicate.
function productionCatalogue() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE destinations (id TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, tagline TEXT, hero_image TEXT, category TEXT, is_active INTEGER, country TEXT NOT NULL DEFAULT 'India')");
  const insert = db.prepare("INSERT INTO destinations (id, name, state, category, is_active) VALUES (?, ?, ?, ?, 1)");
  insert.run("dest_goa", "Goa", "Goa", "BEACH");
  for (const [id, name, state, category] of INDIA_CITIES) {
    if (!up.includes(`SELECT '${id}'`)) insert.run(id, name, state, category);
  }
  return db;
}

const active = (db) => db.prepare("SELECT id, name, state FROM destinations WHERE COALESCE(is_active, 1) = 1").all();

test("060 brings Postgres every Indian city the code lists, with Goa shown once", () => {
  const db = productionCatalogue();
  assert.equal(active(db).some((c) => c.name === "Gorakhpur"), false);
  executeMigrationSql(db, up);

  const byName = Object.fromEntries(active(db).map((c) => [c.name, c]));
  assert.equal(byName.Gorakhpur.state, "Uttar Pradesh");
  assert.equal(byName.Prayagraj.state, "Uttar Pradesh");
  assert.deepEqual(INDIA_CITIES.map(([, name]) => name).filter((name) => !byName[name]), []);
  assert.deepEqual(active(db).filter((c) => c.name === "Goa").map((c) => c.id), ["goa"]);
  assert.equal(new Set(active(db).map((c) => c.name)).size, active(db).length);

  executeMigrationSql(db, up);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM destinations WHERE name = 'Prayagraj'").get().n, 1);

  executeMigrationSql(db, down);
  assert.equal(active(db).some((c) => c.name === "Prayagraj"), false);
  assert.equal(active(db).filter((c) => c.name === "Goa").length, 2);
});
