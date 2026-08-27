/**
 * Migration Runner — Dual-engine SQL schema migration manager for SQLite and PostgreSQL.
 *
 * Tracks executed migrations in `_schema_migrations` and provides status,
 * pending execution (up), and batch rollback capabilities.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
      checksum TEXT,
      batch INTEGER NOT NULL,
      executed_at TEXT NOT NULL DEFAULT (datetime('now')),
      execution_time_ms INTEGER NOT NULL
    );
  `);

  if (databaseDialect(db) === "sqlite") {
    const columns = db.prepare("PRAGMA table_info('_schema_migrations')").all();
    if (!columns.some((column) => column.name === "checksum")) {
      db.exec("ALTER TABLE _schema_migrations ADD COLUMN checksum TEXT");
    }
  } else {
    db.exec("ALTER TABLE _schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT");
  }
}

function databaseDialect(db) {
  try {
    return db.pragma("journal_mode", { simple: true }) === "postgres" ? "postgres" : "sqlite";
  } catch {
    return "postgres";
  }
}

function migrationChecksum(sql) {
  return crypto.createHash("sha256").update(String(sql || "")).digest("hex");
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      current += char;
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (!quote && char === "-" && next === "-") {
      current += `${char}${next}`;
      index += 1;
      lineComment = true;
      continue;
    }
    if (!quote && char === "/" && next === "*") {
      current += `${char}${next}`;
      index += 1;
      blockComment = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (["'", '"', "`"].includes(char)) {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

function executeMigrationSql(db, sql) {
  if (databaseDialect(db) !== "sqlite") {
    db.exec(sql);
    return;
  }

  for (const statement of splitSqlStatements(sql)) {
    const conditionalAdd = statement.match(
      /ALTER\s+TABLE\s+["`]?([a-zA-Z_][\w]*)["`]?\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+["`]?([a-zA-Z_][\w]*)["`]?\s+([\s\S]+)$/i,
    );
    if (!conditionalAdd) {
      db.exec(statement);
      continue;
    }

    const [, tableName, columnName, definition] = conditionalAdd;
    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all();
    if (!columns.some((column) => column.name.toLowerCase() === columnName.toLowerCase())) {
      db.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definition}`);
    }
  }
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
      checksum: migrationChecksum(upSql),
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

  for (const file of files) {
    const applied = appliedMap.get(file.name);
    if (applied && !applied.checksum) {
      db.prepare("UPDATE _schema_migrations SET checksum = ? WHERE name = ?").run(file.checksum, file.name);
      applied.checksum = file.checksum;
    }
  }

  const currentBatch = rows.reduce((max, r) => Math.max(max, r.batch || 0), 0);

  const migrations = files.map((f) => {
    const applied = appliedMap.get(f.name);
    return {
      name: f.name,
      applied: Boolean(applied),
      batch: applied?.batch || null,
      executedAt: applied?.executed_at || null,
      executionTimeMs: applied?.execution_time_ms || null,
      checksum: f.checksum,
      checksumMatches: applied ? applied.checksum === f.checksum : null,
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

  const drifted = status.migrations.filter((migration) => migration.applied && !migration.checksumMatches);
  if (drifted.length) {
    const error = new Error(`Applied migration checksum mismatch: ${drifted.map((item) => item.name).join(", ")}`);
    error.code = "MIGRATION_CHECKSUM_MISMATCH";
    throw error;
  }

  const applyBatch = db.transaction(() => {
    for (const migration of pending) {
      const startTime = Date.now();
      executeMigrationSql(db, migration.upSql);

      const duration = Date.now() - startTime;
      const migrationId = `mig_${migration.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      db.prepare(`
        INSERT INTO _schema_migrations (id, name, checksum, batch, executed_at, execution_time_ms)
        VALUES (?, ?, ?, ?, datetime('now'), ?)
      `).run(migrationId, migration.name, migration.checksum, newBatch, duration);

      applied.push({ name: migration.name, timeMs: duration });
    }
  });
  applyBatch();

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

  const missingDown = migrationsToRevert
    .filter((record) => !filesMap.get(record.name)?.downSql)
    .map((record) => record.name);
  if (missingDown.length) {
    const error = new Error(`Cannot rollback migrations without a down section: ${missingDown.join(", ")}`);
    error.code = "MIGRATION_DOWN_MISSING";
    throw error;
  }

  const rollbackBatch = db.transaction(() => {
    for (const record of migrationsToRevert) {
      const file = filesMap.get(record.name);
      executeMigrationSql(db, file.downSql);
      db.prepare("DELETE FROM _schema_migrations WHERE id = ?").run(record.id);
      rolledBack.push(record.name);
    }
  });
  rollbackBatch();

  return { rolledBack, batch: lastBatch };
}
