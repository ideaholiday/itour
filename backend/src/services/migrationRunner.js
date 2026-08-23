/**
 * Migration Runner — Dual-engine SQL schema migration manager for SQLite and PostgreSQL.
 *
 * Tracks executed migrations in `_schema_migrations` and provides status,
 * pending execution (up), and batch rollback capabilities.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, "..", "..", "migrations");

/**
 * Ensures the migration tracking table exists.
 * @param {object} db - SQLite or Postgres adapter
 */
export function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      batch INTEGER NOT NULL,
      executed_at TEXT NOT NULL DEFAULT (datetime('now')),
      execution_time_ms INTEGER NOT NULL
    );
  `);
}

/**
 * Discovers and parses SQL migration files from the migrations directory.
 * @param {string} [dir]
 * @returns {Array<{ name: string, path: string, upSql: string, downSql: string }>}
 */
export function loadMigrationFiles(dir = DEFAULT_MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return files.map((file) => {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Support -- +migrate Down or -- @down separator for down migrations
    const downSeparator = /--\s*(?:\+migrate\s+Down|@down)/i;
    let upSql = content;
    let downSql = "";

    const match = content.match(downSeparator);
    if (match && match.index !== undefined) {
      upSql = content.slice(0, match.index).trim();
      downSql = content.slice(match.index + match[0].length).trim();
    }

    return {
      name: file,
      path: filePath,
      upSql,
      downSql,
    };
  });
}

/**
 * Retrieves the applied migrations and pending status.
 * @param {object} db
 * @param {string} [dir]
 */
export function getMigrationStatus(db, dir = DEFAULT_MIGRATIONS_DIR) {
  ensureMigrationTable(db);
  const files = loadMigrationFiles(dir);

  const rows = db.prepare("SELECT * FROM _schema_migrations ORDER BY batch ASC, name ASC").all();
  const appliedMap = new Map(rows.map((r) => [r.name, r]));

  const currentBatch = rows.reduce((max, r) => Math.max(max, r.batch || 0), 0);

  const migrations = files.map((f) => {
    const applied = appliedMap.get(f.name);
    return {
      name: f.name,
      applied: Boolean(applied),
      batch: applied?.batch || null,
      executedAt: applied?.executed_at || null,
      executionTimeMs: applied?.execution_time_ms || null,
    };
  });

  return {
    currentBatch,
    total: migrations.length,
    appliedCount: rows.length,
    pendingCount: migrations.length - rows.length,
    migrations,
  };
}

/**
 * Runs all pending migrations in a new batch.
 * @param {object} db
 * @param {string} [dir]
 * @returns {{ applied: Array<{ name: string, timeMs: number }>, batch: number }}
 */
export function runPendingMigrations(db, dir = DEFAULT_MIGRATIONS_DIR) {
  ensureMigrationTable(db);
  const status = getMigrationStatus(db, dir);
  const newBatch = status.currentBatch + 1;
  const files = loadMigrationFiles(dir);

  const appliedMap = new Set(
    db.prepare("SELECT name FROM _schema_migrations").all().map((r) => r.name)
  );

  const pending = files.filter((f) => !appliedMap.has(f.name));
  const applied = [];

  for (const migration of pending) {
    const startTime = Date.now();

    // Execute the UP migration SQL
    db.exec(migration.upSql);

    const duration = Date.now() - startTime;
    const migrationId = `mig_${migration.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    db.prepare(`
      INSERT INTO _schema_migrations (id, name, batch, executed_at, execution_time_ms)
      VALUES (?, ?, ?, datetime('now'), ?)
    `).run(migrationId, migration.name, newBatch, duration);

    applied.push({ name: migration.name, timeMs: duration });
  }

  return { applied, batch: newBatch };
}

/**
 * Rolls back the most recent migration batch.
 * @param {object} db
 * @param {string} [dir]
 * @returns {{ rolledBack: string[], batch: number }}
 */
export function rollbackLastBatch(db, dir = DEFAULT_MIGRATIONS_DIR) {
  ensureMigrationTable(db);
  const status = getMigrationStatus(db, dir);
  if (status.currentBatch === 0) {
    return { rolledBack: [], batch: 0, message: "No applied migrations to roll back" };
  }

  const lastBatch = status.currentBatch;
  const migrationsToRevert = db.prepare(
    "SELECT * FROM _schema_migrations WHERE batch = ? ORDER BY name DESC"
  ).all(lastBatch);

  const filesMap = new Map(loadMigrationFiles(dir).map((f) => [f.name, f]));
  const rolledBack = [];

  for (const record of migrationsToRevert) {
    const file = filesMap.get(record.name);
    if (file && file.downSql) {
      db.exec(file.downSql);
    }
    db.prepare("DELETE FROM _schema_migrations WHERE id = ?").run(record.id);
    rolledBack.push(record.name);
  }

  return { rolledBack, batch: lastBatch };
}
