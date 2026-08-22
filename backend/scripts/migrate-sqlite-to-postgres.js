import Database from "better-sqlite3";
import dotenv from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, "..");
dotenv.config({ path: path.join(backendDirectory, ".env"), quiet: true });

const schema = String(process.env.POSTGRES_SCHEMA || "marketplace").replace(/[^a-zA-Z0-9_]/g, "");
const reset = process.argv.includes("--reset");
const sqlitePath = path.resolve(process.env.SQLITE_MIGRATION_SOURCE || path.join(backendDirectory, "wanderindia.db"));

function postgresConnection(rawValue) {
  const raw = String(rawValue || "").trim();
  const schemeEnd = raw.indexOf("://");
  const connection = raw.slice(schemeEnd + 3);
  const at = connection.lastIndexOf("@");
  const userInfo = connection.slice(0, at);
  const server = connection.slice(at + 1);
  const colon = userInfo.indexOf(":");
  const slash = server.indexOf("/");
  const hostPort = server.slice(0, slash);
  const portSeparator = hostPort.lastIndexOf(":");
  const queryStart = server.indexOf("?", slash);
  if (schemeEnd === -1 || at === -1 || colon === -1 || slash === -1) throw new Error("DATABASE_URL is invalid");
  return {
    user: decodeURIComponent(userInfo.slice(0, colon)),
    password: decodeURIComponent(userInfo.slice(colon + 1).replace(/%(?![0-9A-Fa-f]{2})/g, "%25")),
    host: portSeparator === -1 ? hostPort : hostPort.slice(0, portSeparator),
    port: portSeparator === -1 ? 5432 : Number(hostPort.slice(portSeparator + 1)),
    database: decodeURIComponent(server.slice(slash + 1, queryStart === -1 ? server.length : queryStart)) || "postgres",
    ssl: { rejectUnauthorized: false },
    application_name: "idea-holiday-sqlite-migration",
  };
}

const quote = (identifier) => `"${String(identifier).replaceAll('"', '""')}"`;
const mapType = (declaredType) => {
  const type = String(declaredType || "TEXT").toUpperCase();
  if (type.includes("INT")) return "INTEGER";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) return "DOUBLE PRECISION";
  if (type.includes("BLOB")) return "BYTEA";
  return "TEXT";
};
const mapDefault = (defaultValue) => {
  if (defaultValue === null || defaultValue === undefined) return "";
  const value = String(defaultValue).trim();
  if (/^\(?datetime\('now'\)\)?$/i.test(value)) return " DEFAULT CURRENT_TIMESTAMP";
  if (/^\(?date\('now'\)\)?$/i.test(value)) return " DEFAULT CURRENT_DATE";
  return ` DEFAULT ${value}`;
};

const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
const postgres = new pg.Client(postgresConnection(process.env.DATABASE_URL));

try {
  await postgres.connect();
  const tables = sqlite.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);

  const existing = await postgres.query(
    "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = $1",
    [schema],
  );
  if (existing.rows[0].count > 0 && !reset) {
    throw new Error(`PostgreSQL schema ${schema} already contains tables. Re-run with --reset only for an intentional replacement.`);
  }

  await postgres.query("BEGIN");
  if (reset) await postgres.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
  await postgres.query(`CREATE SCHEMA IF NOT EXISTS ${quote(schema)}`);
  await postgres.query(`SET LOCAL search_path TO ${quote(schema)}, public`);

  for (const table of tables) {
    const columns = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all();
    const primaryColumns = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk);
    const definitions = columns.map((column) => {
      const required = column.notnull ? " NOT NULL" : "";
      return `${quote(column.name)} ${mapType(column.type)}${required}${mapDefault(column.dflt_value)}`;
    });
    if (primaryColumns.length) definitions.push(`PRIMARY KEY (${primaryColumns.map((column) => quote(column.name)).join(", ")})`);
    await postgres.query(`CREATE TABLE ${quote(table)} (${definitions.join(", ")})`);

    const rows = sqlite.prepare(`SELECT * FROM ${quote(table)}`).all();
    if (rows.length) {
      const names = columns.map((column) => column.name);
      const placeholders = names.map((_, index) => `$${index + 1}`).join(", ");
      const insertSql = `INSERT INTO ${quote(table)} (${names.map(quote).join(", ")}) VALUES (${placeholders})`;
      for (const row of rows) await postgres.query(insertSql, names.map((name) => row[name]));
    }
    console.log(`${table}: ${rows.length} rows`);
  }

  for (const table of tables) {
    const indexes = sqlite.prepare(`PRAGMA index_list(${quote(table)})`).all();
    for (const index of indexes) {
      if (index.origin === "pk") continue;
      const columns = sqlite.prepare(`PRAGMA index_info(${quote(index.name)})`).all().map((column) => column.name).filter(Boolean);
      if (!columns.length) continue;
      const generatedName = `idx_${table}_${columns.join("_")}_${index.unique ? "uniq" : "lookup"}`.slice(0, 60);
      let where = "";
      if (index.partial) {
        const definition = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(index.name)?.sql || "";
        const match = definition.match(/\sWHERE\s(.+)$/i);
        if (match) where = ` WHERE ${match[1]}`;
      }
      await postgres.query(
        `CREATE ${index.unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${quote(generatedName)} ON ${quote(table)} (${columns.map(quote).join(", ")})${where}`,
      );
    }
  }

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await postgres.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", ["2026-08-18-sqlite-baseline"]);
  await postgres.query("COMMIT");
  console.log(`Migration complete: ${tables.length} tables copied to PostgreSQL schema ${schema}.`);
} catch (error) {
  try { await postgres.query("ROLLBACK"); } catch {}
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  sqlite.close();
  await postgres.end().catch(() => {});
}
