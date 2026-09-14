import assert from "node:assert/strict";
import test from "node:test";
import { translateSqliteSql } from "../src/postgresSyncDb.js";

test("translates SQLite placeholders without changing question marks in strings", () => {
  assert.equal(
    translateSqliteSql("SELECT * FROM products WHERE id = ? AND title = 'Ready?' AND city = ?"),
    "SELECT * FROM products WHERE id = $1 AND title = 'Ready?' AND city = $2",
  );
});

test("translates SQLite timestamps and insert-or-ignore semantics", () => {
  assert.equal(
    translateSqliteSql("INSERT OR IGNORE INTO financial_ledger (id, created_at) VALUES (?, datetime('now'))"),
    "INSERT INTO financial_ledger (id, created_at) VALUES ($1, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING",
  );
});

test("translates legacy row ordering and datetime comparisons", () => {
  assert.equal(
    translateSqliteSql("SELECT * FROM products p WHERE datetime(p.created_at) < datetime('now') ORDER BY p.rowid"),
    "SELECT * FROM products p WHERE CAST(p.created_at AS TIMESTAMPTZ) < CURRENT_TIMESTAMP ORDER BY p.id",
  );
});

test("no SQL tests a bare placeholder for NULL, which PostgreSQL cannot type", async () => {
  // `? IS NOT NULL` fails on PostgreSQL with "could not determine data type of
  // parameter $n" (SQLite accepts it). Inside a booking transaction that error
  // aborted checkout. Cast the placeholder instead: CAST(? AS TEXT) IS NULL.
  const { readdir, readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const root = new URL("../src/", import.meta.url).pathname;
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".js")) {
        const source = await readFile(full, "utf8");
        source.split("\n").forEach((line, index) => {
          if (/(^|[^\w)])\?\s+IS\s+(NOT\s+)?NULL/i.test(line)) offenders.push(`${path.relative(root, full)}:${index + 1}`);
        });
      }
    }
  };
  await walk(root);
  assert.deepEqual(offenders, []);
});
