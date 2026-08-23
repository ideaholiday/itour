import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import {
  ensureMigrationTable,
  loadMigrationFiles,
  getMigrationStatus,
  runPendingMigrations,
  rollbackLastBatch
} from "../src/services/migrationRunner.js";

test("migration runner tracks, executes and rolls back batches", () => {
  const db = new Database(":memory:");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "idea-holiday-migrations-"));

  try {
    // Create 2 sample migration files
    fs.writeFileSync(
      path.join(tempDir, "001_test_create_table.sql"),
      `CREATE TABLE test_items (id TEXT PRIMARY KEY, title TEXT);
-- @down
DROP TABLE IF EXISTS test_items;`
    );

    fs.writeFileSync(
      path.join(tempDir, "002_test_add_index.sql"),
      `CREATE INDEX idx_test_items_title ON test_items(title);
-- @down
DROP INDEX IF EXISTS idx_test_items_title;`
    );

    // Initial status
    const initialStatus = getMigrationStatus(db, tempDir);
    assert.equal(initialStatus.total, 2);
    assert.equal(initialStatus.appliedCount, 0);
    assert.equal(initialStatus.pendingCount, 2);
    assert.equal(initialStatus.currentBatch, 0);

    // Run migrations
    const upResult = runPendingMigrations(db, tempDir);
    assert.equal(upResult.batch, 1);
    assert.equal(upResult.applied.length, 2);

    // Check table was actually created
    db.prepare("INSERT INTO test_items (id, title) VALUES ('1', 'Test Item')").run();
    const row = db.prepare("SELECT * FROM test_items WHERE id = '1'").get();
    assert.equal(row.title, "Test Item");

    // Status after migration
    const postStatus = getMigrationStatus(db, tempDir);
    assert.equal(postStatus.appliedCount, 2);
    assert.equal(postStatus.pendingCount, 0);
    assert.equal(postStatus.currentBatch, 1);

    // Rollback batch
    const rollbackResult = rollbackLastBatch(db, tempDir);
    assert.equal(rollbackResult.batch, 1);
    assert.equal(rollbackResult.rolledBack.length, 2);

    // Status after rollback
    const rollbackStatus = getMigrationStatus(db, tempDir);
    assert.equal(rollbackStatus.appliedCount, 0);
    assert.equal(rollbackStatus.pendingCount, 2);
    assert.equal(rollbackStatus.currentBatch, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
