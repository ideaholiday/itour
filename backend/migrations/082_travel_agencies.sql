-- IdeaHoliday B2B travel agents (ADR 054, docs/plans/b2b-travel-agents.md).
--
-- An agent is a traveler account with an agency profile. The agency applies on
-- ideaholiday.in with a GSTIN or a PAN; an admin approves it and sets its
-- discount, 5 to 10% below the website price. Only an APPROVED agency gets the
-- agent price. This is IdeaHoliday's own channel, not a supplier's agents
-- (supplier_agents, ADR 039).

CREATE TABLE IF NOT EXISTS travel_agencies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  agency_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  gstin TEXT,
  pan TEXT,
  address TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  website TEXT,
  discount_pct REAL NOT NULL DEFAULT 5 CHECK (discount_pct >= 5 AND discount_pct <= 10),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (gstin IS NOT NULL OR pan IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_travel_agencies_status ON travel_agencies(status, created_at);

-- @down
DROP INDEX IF EXISTS idx_travel_agencies_status;
DROP TABLE IF EXISTS travel_agencies;
