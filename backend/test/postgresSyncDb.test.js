import assert from "node:assert/strict";
import test from "node:test";
import { PostgresSyncDatabase, translateSqliteSql } from "../src/postgresSyncDb.js";

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

/** Adapter with a fake worker: each answer is a result or an Error; records SQL and worker restarts. */
function fakeDatabase(answers) {
  const database = Object.create(PostgresSyncDatabase.prototype);
  const log = { sql: [], restarts: 0 };
  database.worker = { postMessage: ({ sql }) => log.sql.push(sql), terminate() {} };
  database._initWorker = () => { log.restarts += 1; };
  database._waitForResponse = () => {
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer || { rows: [], rowCount: 0 };
  };
  return { database, log };
}

const notQueryable = () => new Error("Client has encountered a connection error and is not queryable");

test("a dropped PostgreSQL connection reconnects and retries a statement that was never sent", () => {
  const { database, log } = fakeDatabase([notQueryable(), { rows: [{ id: "p1" }], rowCount: 1 }]);
  assert.deepEqual(database.prepare("SELECT id FROM products WHERE id = ?").get("p1"), { id: "p1" });
  assert.equal(log.restarts, 1);
  assert.equal(log.sql.length, 2, "retried once on the new connection");
});

test("a connection lost mid-statement reconnects without re-running the statement", () => {
  const { database, log } = fakeDatabase([new Error("Connection terminated unexpectedly")]);
  assert.throws(() => database.prepare("INSERT INTO bookings (id) VALUES (?)").run("b1"), /Connection terminated/);
  assert.equal(log.restarts, 1);
  assert.equal(log.sql.length, 1, "a write that may have reached the server is not repeated");
});

test("a connection lost inside a transaction fails the transaction and reconnects afterwards", () => {
  const { database, log } = fakeDatabase([{ rows: [] }, notQueryable(), notQueryable(), notQueryable(), { rows: [] }]);
  const book = database.transaction(() => database.prepare("UPDATE availability SET seats = seats - 1").run());
  assert.throws(() => book(), /not queryable/);
  assert.equal(log.restarts, 0, "no new connection while the transaction is open");
  assert.deepEqual(log.sql, ["BEGIN", "UPDATE availability SET seats = seats - 1", "ROLLBACK"]);

  database.prepare("SELECT 1").get();
  assert.equal(log.restarts, 1, "the next statement outside the transaction reconnects");
});
