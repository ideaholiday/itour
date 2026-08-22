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
