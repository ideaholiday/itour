import pg from "pg";
import { parentPort, workerData } from "node:worker_threads";

const { Client, types } = pg;
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

const encoder = new TextEncoder();
const connection = workerData.connection;
const client = new Client({ ...connection, application_name: "idea-holiday-cloud-run" });

function writeResponse(sharedBuffer, status, payload) {
  const control = new Int32Array(sharedBuffer, 0, 2);
  const output = new Uint8Array(sharedBuffer, 8);
  const encoded = encoder.encode(JSON.stringify(payload));
  if (encoded.length > output.length) {
    const fallback = encoder.encode(JSON.stringify({ error: `PostgreSQL response exceeded ${output.length} bytes` }));
    output.set(fallback.subarray(0, output.length));
    Atomics.store(control, 1, Math.min(fallback.length, output.length));
    Atomics.store(control, 0, -1);
  } else {
    output.set(encoded);
    Atomics.store(control, 1, encoded.length);
    Atomics.store(control, 0, status);
  }
  Atomics.notify(control, 0);
}

try {
  await client.connect();
  await client.query(`SET search_path TO ${connection.schema}, public`);

  const ensureColumns = [
    `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_code TEXT`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS product_code TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_code TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cashfree_order_id TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cashfree_payment_id TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_session_id TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_signature TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS otp_code TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS otp_hash TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS otp_encrypted TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS otp_expires_at TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS otp_verified_at TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_response_status TEXT DEFAULT 'NOT_STARTED'`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_response_deadline TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_responded_at TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_response_note TEXT`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assignment_round INTEGER DEFAULT 1`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_request_id TEXT`,
    `ALTER TABLE payouts ADD COLUMN IF NOT EXISTS transfer_id TEXT`,
    `ALTER TABLE payouts ADD COLUMN IF NOT EXISTS provider_batch_id TEXT`,
    `ALTER TABLE payouts ADD COLUMN IF NOT EXISTS settlement_status TEXT DEFAULT 'PENDING'`
  ];
  for (const q of ensureColumns) {
    try { await client.query(q); } catch {}
  }
  await client.query("UPDATE suppliers SET supplier_code = id::text WHERE NULLIF(BTRIM(supplier_code), '') IS NULL");
  await client.query("UPDATE products SET product_code = id::text WHERE NULLIF(BTRIM(product_code), '') IS NULL");
  await client.query("UPDATE bookings SET product_code = COALESCE(NULLIF(BTRIM(product_code), ''), product_id::text), supplier_code = COALESCE(NULLIF(BTRIM(supplier_code), ''), supplier_id::text) WHERE NULLIF(BTRIM(product_code), '') IS NULL OR NULLIF(BTRIM(supplier_code), '') IS NULL");

  writeResponse(workerData.readyBuffer, 1, { ready: true });
} catch (error) {
  writeResponse(workerData.readyBuffer, -1, { error: error.message, code: error.code });
}

parentPort.on("message", async ({ sharedBuffer, sql, params = [], close = false }) => {
  if (close) {
    try { await client.end(); } catch {}
    writeResponse(sharedBuffer, 1, { closed: true });
    return;
  }

  try {
    const result = await client.query(sql, params);
    writeResponse(sharedBuffer, 1, {
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      command: result.command,
    });
  } catch (error) {
    writeResponse(sharedBuffer, -1, {
      error: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
    });
  }
});
