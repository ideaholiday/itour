import { nanoid } from "nanoid";

/**
 * Saved customer contacts (migration 076). One list per supplier, split by
 * agent: agent_id IS NULL is the supplier's direct customers, and agent_id
 * set is that one agent's customers. Booking and quotation flows call
 * rememberCustomer after saving so the next quotation autocompletes.
 *
 * Match rule: same phone wins; else same email; else same name (case
 * insensitive) within the same agent scope. This keeps duplicates out
 * without punishing typo variants that share a phone or email.
 */

const clean = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

export function listCustomers(db, supplierId, { agentId = null, query = "", limit = 30 } = {}) {
  const scope = agentId ? "= ?" : "IS NULL";
  const params = [supplierId];
  if (agentId) params.push(agentId);
  let sql = `SELECT id, name, email, phone, agent_id, last_used_at FROM supplier_customers
    WHERE supplier_id = ? AND agent_id ${scope}`;
  const q = clean(query);
  if (q) {
    sql += " AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ?)";
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, `%${q}%`);
  }
  sql += " ORDER BY last_used_at DESC LIMIT ?";
  params.push(Math.min(200, Math.max(1, Number(limit) || 30)));
  return db.prepare(sql).all(...params)
    .map((row) => ({ id: row.id, name: row.name, email: row.email || null, phone: row.phone || null, agentId: row.agent_id || null, lastUsedAt: row.last_used_at }));
}

/** Upserts a saved customer for this supplier/agent scope. Called after a
 * quotation or direct booking is saved. Empty names are ignored. */
export function rememberCustomer(db, supplierId, { agentId = null, name, email = null, phone = null }) {
  const cleanName = clean(name);
  if (!cleanName || cleanName.length < 2) return null;
  const cleanEmail = clean(email)?.toLowerCase() || null;
  const cleanPhone = clean(phone);
  const scope = agentId ? "= ?" : "IS NULL";
  const conds = ["LOWER(name) = LOWER(?)"];
  const params = [supplierId];
  if (agentId) params.push(agentId);
  const tailParams = [cleanName];
  if (cleanPhone) { conds.unshift("phone = ?"); tailParams.unshift(cleanPhone); }
  if (cleanEmail) { conds.unshift("LOWER(email) = ?"); tailParams.unshift(cleanEmail); }
  const match = db.prepare(`SELECT id FROM supplier_customers
    WHERE supplier_id = ? AND agent_id ${scope} AND (${conds.join(" OR ")})
    ORDER BY last_used_at DESC LIMIT 1`).get(...params, ...tailParams);
  if (match) {
    db.prepare(`UPDATE supplier_customers SET name = ?, email = COALESCE(?, email), phone = COALESCE(?, phone),
        last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(cleanName, cleanEmail, cleanPhone, match.id);
    return match.id;
  }
  const id = `cst_${nanoid(12)}`;
  db.prepare(`INSERT INTO supplier_customers (id, supplier_id, agent_id, name, email, phone) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, supplierId, agentId || null, cleanName, cleanEmail, cleanPhone);
  return id;
}

export function deleteCustomer(db, supplierId, customerId) {
  const result = db.prepare("DELETE FROM supplier_customers WHERE id = ? AND supplier_id = ?").run(customerId, supplierId);
  return result.changes > 0;
}
