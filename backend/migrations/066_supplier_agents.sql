-- Supplier agents: a supplier's own travel agents, hotels and resellers
-- (ADR 035, ADR 039, docs/SUPPLIER_OPERATIONS.md).
--
-- Staff book for an agent at a net rate: the server quote minus the agent's
-- commission_pct, or a per-listing override in supplier_agent_rates. The
-- booking is source 'AGENT', payment_status 'OFFLINE', commission-free for
-- IdeaHoliday. bookings.amount_inr is the net the agent pays and
-- balance_due_inr what the agent still owes on it, so what an agent owes is the
-- sum over their live bookings. credit_limit_inr caps it; 0 means pay at booking.

CREATE TABLE IF NOT EXISTS supplier_agents (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  commission_pct REAL NOT NULL DEFAULT 0 CHECK (commission_pct >= 0 AND commission_pct <= 90),
  credit_limit_inr INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_inr >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_agents_supplier ON supplier_agents(supplier_id);

CREATE TABLE IF NOT EXISTS supplier_agent_rates (
  agent_id TEXT NOT NULL REFERENCES supplier_agents(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  commission_pct REAL NOT NULL CHECK (commission_pct >= 0 AND commission_pct <= 90),
  PRIMARY KEY (agent_id, product_id)
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agent_commission_inr INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_bookings_agent ON bookings(agent_id);

-- @down
DROP INDEX IF EXISTS idx_bookings_agent;
ALTER TABLE bookings DROP COLUMN agent_commission_inr;
ALTER TABLE bookings DROP COLUMN agent_id;
DROP TABLE IF EXISTS supplier_agent_rates;
DROP INDEX IF EXISTS idx_supplier_agents_supplier;
DROP TABLE IF EXISTS supplier_agents;
