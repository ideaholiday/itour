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

/**
 * Applies one migration's SQL, translating `ADD COLUMN IF NOT EXISTS` for SQLite.
 * Exported so tests can build fixtures through the same path production uses.
 */
function withoutLeadingComments(statement) {
  let sql = statement;
  for (;;) {
    const trimmed = sql.replace(/^\s+/, "");
    if (trimmed.startsWith("--")) sql = trimmed.includes("\n") ? trimmed.slice(trimmed.indexOf("\n") + 1) : "";
    else if (trimmed.startsWith("/*") && trimmed.includes("*/")) sql = trimmed.slice(trimmed.indexOf("*/") + 2);
    else return trimmed;
  }
}

/**
 * SQLite has no `ALTER COLUMN ... DROP NOT NULL`. Removing a NOT NULL
 * constraint does not change the on-disk format, so SQLite's documented
 * procedure is to edit the stored CREATE TABLE text in place — which, unlike a
 * table rebuild, works inside the migration transaction and leaves foreign keys
 * from other tables untouched. A column that is already nullable is a no-op.
 */
function sqliteDropNotNull(db, tableName, columnName) {
  const column = db.prepare(`PRAGMA table_info("${tableName}")`).all()
    .find((item) => item.name.toLowerCase() === columnName.toLowerCase());
  if (!column) throw new Error(`Cannot drop NOT NULL: ${tableName}.${columnName} does not exist`);
  if (!column.notnull) return;

  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  const definition = new RegExp(`([(,]\\s*["\`]?${column.name}["\`]?\\s[^,]*?)\\s+NOT\\s+NULL`, "i");
  const rewritten = sql.replace(definition, "$1");
  if (rewritten === sql) throw new Error(`Cannot drop NOT NULL: ${tableName}.${columnName} definition not recognised`);
  rewriteSqliteTableSql(db, tableName, rewritten);
}

/**
 * SQLite has no `ALTER TABLE ... DROP CONSTRAINT`. A column CHECK written inline
 * gets PostgreSQL's default name `<table>_<column>_check`, so that name is
 * mapped back to the column and its CHECK (...) is cut from the stored CREATE
 * TABLE text. Like dropping NOT NULL, removing a CHECK does not change the
 * on-disk format. A column without a CHECK is a no-op, as `IF EXISTS` implies.
 */
function sqliteDropColumnCheck(db, tableName, constraintName) {
  const prefix = `${tableName}_`.toLowerCase();
  const name = constraintName.toLowerCase();
  if (!name.startsWith(prefix) || !name.endsWith("_check")) throw new Error(`Cannot drop constraint ${constraintName}: only <table>_<column>_check is supported on SQLite`);
  const columnName = name.slice(prefix.length, -"_check".length);
  const column = db.prepare(`PRAGMA table_info("${tableName}")`).all().find((item) => item.name.toLowerCase() === columnName);
  if (!column) throw new Error(`Cannot drop constraint ${constraintName}: ${tableName}.${columnName} does not exist`);

  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  const start = sql.search(new RegExp(`[(,]\\s*["\`]?${column.name}["\`]?\\s`, "i"));
  if (start < 0) throw new Error(`Cannot drop constraint ${constraintName}: column definition not recognised`);

  // Walk the column definition to its closing comma or parenthesis, noting a top-level CHECK.
  let depth = 0;
  let checkAt = -1;
  for (let index = start + 1; index < sql.length; index += 1) {
    const char = sql[index];
    if (depth === 0 && (char === "," || char === ")")) break;
    if (depth === 0 && checkAt < 0 && /\s/.test(sql[index - 1]) && /^CHECK\s*\(/i.test(sql.slice(index))) checkAt = index;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
  }
  if (checkAt < 0) return;
  let end = sql.indexOf("(", checkAt);
  for (depth = 0; end < sql.length; end += 1) {
    if (sql[end] === "(") depth += 1;
    if (sql[end] === ")" && --depth === 0) break;
  }
  rewriteSqliteTableSql(db, tableName, sql.slice(0, checkAt).replace(/\s+$/, "") + sql.slice(end + 1));
}

function rewriteSqliteTableSql(db, tableName, rewritten) {
  const schemaVersion = db.pragma("schema_version", { simple: true });
  db.unsafeMode(true);
  try {
    db.pragma("writable_schema = ON");
    db.prepare("UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = ?").run(rewritten, tableName);
    db.pragma(`schema_version = ${schemaVersion + 1}`);
    db.pragma("writable_schema = OFF");
  } finally {
    db.unsafeMode(false);
  }
}

export function executeMigrationSql(db, sql) {
  if (databaseDialect(db) !== "sqlite") {
    // The Postgres adapter translates SQLite syntax (INSERT OR IGNORE, datetime('now'))
    // only at the start of a statement, so a whole file must be sent one statement at a time.
    for (const statement of splitSqlStatements(sql)) {
      const executable = withoutLeadingComments(statement);
      if (executable) db.exec(executable);
    }
    return;
  }

  for (const statement of splitSqlStatements(sql)) {
    const dropNotNull = withoutLeadingComments(statement).match(
      /^ALTER\s+TABLE\s+["`]?([a-zA-Z_][\w]*)["`]?\s+ALTER\s+COLUMN\s+["`]?([a-zA-Z_][\w]*)["`]?\s+DROP\s+NOT\s+NULL\s*;?\s*$/i,
    );
    if (dropNotNull) {
      sqliteDropNotNull(db, dropNotNull[1], dropNotNull[2]);
      continue;
    }
    const dropCheck = withoutLeadingComments(statement).match(
      /^ALTER\s+TABLE\s+["`]?([a-zA-Z_][\w]*)["`]?\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?["`]?([a-zA-Z_][\w]*)["`]?\s*;?\s*$/i,
    );
    if (dropCheck) {
      sqliteDropColumnCheck(db, dropCheck[1], dropCheck[2]);
      continue;
    }

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
 * Finds migration files that share the same numeric prefix.
 *
 * Migrations are applied in lexicographic filename order and tracked by full
 * filename, so duplicates are not fatal — but they make the apply order depend
 * on the description text rather than the number, which is easy to get wrong.
 * Reported by `npm run migrate:status` so the next author picks a free number.
 *
 * @param {Array<{ name: string }>} files
 * @returns {Array<{ prefix: string, names: string[] }>}
 */
export function findDuplicateMigrationPrefixes(files) {
  const byPrefix = new Map();

  for (const file of files) {
    const prefix = String(file.name).match(/^(\d+)/)?.[1];
    if (!prefix) continue;
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(file.name);
  }

  return [...byPrefix.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([prefix, names]) => ({ prefix, names }));
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
