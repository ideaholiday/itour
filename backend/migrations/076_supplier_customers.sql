-- Saved customer contacts per supplier (docs/SUPPLIER_OPERATIONS.md, ADR 034,
-- ADR 039). Every quotation and direct booking already carries a customer
-- name, email and phone; this table remembers those so staff can pick a
-- customer back on the next quotation instead of retyping.
--
-- A customer belongs to the supplier and, optionally, to one of the
-- supplier's agents (ADR 039):
--   - agent_id IS NULL  -> a direct customer (walk-in, phone, manual, marketplace).
--   - agent_id set      -> that agent's customer, shown only when the agent
--                          is chosen on the quotation or walk-in drawer.
-- No PII beyond what the booking or quotation already had. Deleting a
-- customer here never touches past bookings or quotations.

CREATE TABLE IF NOT EXISTS supplier_customers (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  agent_id TEXT REFERENCES supplier_agents(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_customers_supplier ON supplier_customers(supplier_id, agent_id, last_used_at);
CREATE INDEX IF NOT EXISTS idx_supplier_customers_phone ON supplier_customers(supplier_id, phone);
CREATE INDEX IF NOT EXISTS idx_supplier_customers_email ON supplier_customers(supplier_id, email);

-- @down
DROP INDEX IF EXISTS idx_supplier_customers_email;
DROP INDEX IF EXISTS idx_supplier_customers_phone;
DROP INDEX IF EXISTS idx_supplier_customers_supplier;
DROP TABLE IF EXISTS supplier_customers;
