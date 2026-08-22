import { Worker } from "node:worker_threads";

const RESPONSE_BUFFER_BYTES = 16 * 1024 * 1024;
const decoder = new TextDecoder();

function parseConnectionString(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) throw new Error("DATABASE_URL is required when DATABASE_ENGINE=postgres");

  // Split at the last @ so legacy unescaped @ characters in the password do
  // not corrupt the hostname. New deployments store the encoded URL secret.
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
  const databaseEnd = queryStart === -1 ? server.length : queryStart;

  if (schemeEnd === -1 || at === -1 || colon === -1 || slash === -1) {
    throw new Error("DATABASE_URL is not a valid PostgreSQL connection string");
  }

  return {
    user: decodeURIComponent(userInfo.slice(0, colon)),
    password: decodeURIComponent(userInfo.slice(colon + 1).replace(/%(?![0-9A-Fa-f]{2})/g, "%25")),
    host: portSeparator === -1 ? hostPort : hostPort.slice(0, portSeparator),
    port: portSeparator === -1 ? 5432 : Number(hostPort.slice(portSeparator + 1)),
    database: decodeURIComponent(server.slice(slash + 1, databaseEnd)) || "postgres",
    ssl: { rejectUnauthorized: false },
    schema: String(process.env.POSTGRES_SCHEMA || "marketplace").replace(/[^a-zA-Z0-9_]/g, ""),
  };
}

function replacePlaceholders(sql) {
  let index = 0;
  let quote = null;
  let output = "";

  for (let position = 0; position < sql.length; position += 1) {
    const char = sql[position];
    const next = sql[position + 1];
    if (quote) {
      output += char;
      if (char === quote) {
        if (next === quote) {
          output += next;
          position += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      output += char;
    } else if (char === "?") {
      index += 1;
      output += `$${index}`;
    } else {
      output += char;
    }
  }
  return output;
}

export function translateSqliteSql(sqlValue) {
  let sql = String(sqlValue || "").trim();
  const insertOrIgnore = /^INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(sql);
  sql = sql.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\s+/i, "INSERT INTO ");
  sql = sql.replace(/datetime\(\s*'now'\s*\)/gi, "CURRENT_TIMESTAMP");
  sql = sql.replace(/date\(\s*'now'\s*\)/gi, "CURRENT_DATE");
  sql = sql.replace(/datetime\(([^)]+)\)/gi, "CAST($1 AS TIMESTAMPTZ)");
  sql = sql.replace(/\bp\.rowid\b/gi, "p.id");
  sql = sql.replace(/\browid\b/gi, "id");
  sql = replacePlaceholders(sql);
  if (insertOrIgnore) sql = `${sql.replace(/;\s*$/, "")} ON CONFLICT DO NOTHING`;
  return sql;
}

class PostgresStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = translateSqliteSql(sql);
  }

  all(...params) {
    return this.database._execute(this.sql, params).rows;
  }

  get(...params) {
    return this.database._execute(this.sql, params).rows[0];
  }

  run(...params) {
    const result = this.database._execute(this.sql, params);
    return { changes: result.rowCount, lastInsertRowid: null };
  }
}

export class PostgresSyncDatabase {
  constructor(connectionString) {
    this.connection = parseConnectionString(connectionString);
    const readyBuffer = new SharedArrayBuffer(RESPONSE_BUFFER_BYTES);
    this.worker = new Worker(new URL("./postgresWorker.js", import.meta.url), {
      workerData: { connection: this.connection, readyBuffer },
      execArgv: process.execArgv.filter((argument) => !argument.startsWith("--input-type")),
    });
    this._waitForResponse(readyBuffer, Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 15_000));
  }

  _waitForResponse(sharedBuffer, timeout = Number(process.env.DATABASE_QUERY_TIMEOUT_MS || 30_000)) {
    const control = new Int32Array(sharedBuffer, 0, 2);
    const waitResult = Atomics.wait(control, 0, 0, timeout);
    if (waitResult === "timed-out") throw new Error(`PostgreSQL operation timed out after ${timeout}ms`);
    const length = Atomics.load(control, 1);
    const payload = JSON.parse(decoder.decode(new Uint8Array(sharedBuffer, 8, length)) || "{}");
    if (Atomics.load(control, 0) !== 1) {
      const error = new Error(payload.error || "PostgreSQL operation failed");
      Object.assign(error, payload);
      throw error;
    }
    return payload;
  }

  _execute(sql, params = []) {
    const sharedBuffer = new SharedArrayBuffer(RESPONSE_BUFFER_BYTES);
    this.worker.postMessage({ sharedBuffer, sql, params });
    return this._waitForResponse(sharedBuffer);
  }

  prepare(sql) {
    return new PostgresStatement(this, sql);
  }

  exec(sql) {
    return this._execute(translateSqliteSql(sql));
  }

  transaction(callback) {
    return (...args) => {
      this._execute("BEGIN");
      try {
        const result = callback(...args);
        this._execute("COMMIT");
        return result;
      } catch (error) {
        try { this._execute("ROLLBACK"); } catch {}
        throw error;
      }
    };
  }

  pragma(statement, options = {}) {
    if (/journal_mode/i.test(statement)) return options.simple ? "postgres" : [{ journal_mode: "postgres" }];
    return undefined;
  }

  close() {
    const sharedBuffer = new SharedArrayBuffer(1024);
    this.worker.postMessage({ sharedBuffer, close: true });
    this._waitForResponse(sharedBuffer, 5_000);
    this.worker.terminate();
  }
}

export default function createPostgresDatabase(connectionString = process.env.DATABASE_URL) {
  return new PostgresSyncDatabase(connectionString);
}
