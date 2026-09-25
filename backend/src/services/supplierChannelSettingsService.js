import { nanoid } from "nanoid";
import { z } from "zod";
import { generateApiKey } from "../middleware/apiPartner.js";

/**
 * Where a supplier sells (ADR 041): three switches per listing, and reseller
 * API keys the owner issues. A supplier-issued key books the supplier's own
 * listings as the supplier's direct sale, optionally at one of their agents'
 * net rates and credit (ADR 039).
 */

const settingsError = (message, status = 400, code = "INVALID_CHANNELS") => Object.assign(new Error(message), { status, code });

export const channelsSchema = z.object({
  marketplace: z.boolean().optional(),
  ideaholidayApi: z.boolean().optional(),
  ownResellers: z.boolean().optional(),
}).strict();

export const resellerKeySchema = z.object({
  name: z.string().trim().min(2).max(120),
  agentId: z.string().trim().max(120).optional().nullable(),
}).strict();

export function channelView(product) {
  return {
    marketplace: Number(product.sell_marketplace ?? 1) === 1,
    ideaholidayApi: Number(product.sell_ideaholiday_api ?? 1) === 1,
    ownResellers: Number(product.sell_own_resellers ?? 1) === 1,
  };
}

/** Switches a listing's channels; omitted ones stay as they are. Existing bookings are untouched. */
export function setProductChannels(db, supplierId, productId, input) {
  const next = channelsSchema.parse(input);
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND supplier_id = ?").get(productId, supplierId);
  if (!product) throw settingsError("Listing not found for this supplier", 404, "PRODUCT_NOT_FOUND");
  const current = channelView(product);
  const merged = { ...current, ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)) };
  db.prepare("UPDATE products SET sell_marketplace = ?, sell_ideaholiday_api = ?, sell_own_resellers = ? WHERE id = ?")
    .run(merged.marketplace ? 1 : 0, merged.ideaholidayApi ? 1 : 0, merged.ownResellers ? 1 : 0, productId);
  return { productId, channels: merged };
}

function keyView(row) {
  return {
    id: row.id, name: row.name, keyPrefix: row.key_prefix, status: row.status, agentId: row.agent_id || null, agentName: row.agent_name || null,
    lastUsedAt: row.last_used_at || null, createdAt: row.created_at,
  };
}

/** The supplier's own reseller keys (never IdeaHoliday's), without the key itself. */
export function listResellerKeys(db, supplierId) {
  return db.prepare(`SELECT k.*, a.name AS agent_name FROM api_partners k LEFT JOIN supplier_agents a ON a.id = k.agent_id
    WHERE k.supplier_id = ? AND k.issuer = 'SUPPLIER' ORDER BY CASE k.status WHEN 'ACTIVE' THEN 0 ELSE 1 END, k.created_at DESC`).all(supplierId).map(keyView);
}

/** Issues a key for one of the supplier's resellers. The key is returned once; only its SHA-256 is kept. */
export function createResellerKey(db, supplierId, input, actor = null) {
  const data = resellerKeySchema.parse(input);
  if (data.agentId && !db.prepare("SELECT id FROM supplier_agents WHERE id = ? AND supplier_id = ?").get(data.agentId, supplierId)) {
    throw settingsError("Agent not found", 404, "AGENT_NOT_FOUND");
  }
  const id = `apip_${nanoid(12)}`;
  const { key, keyHash, keyPrefix } = generateApiKey();
  db.prepare(`INSERT INTO api_partners (id, name, supplier_id, key_hash, key_prefix, prepaid, issuer, agent_id, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, 0, 'SUPPLIER', ?, ?)`).run(id, data.name, supplierId, keyHash, keyPrefix, data.agentId || null, actor?.id || null);
  const row = db.prepare("SELECT k.*, a.name AS agent_name FROM api_partners k LEFT JOIN supplier_agents a ON a.id = k.agent_id WHERE k.id = ?").get(id);
  return { key, reseller: keyView(row) };
}

/** Revokes a supplier-issued key at once; its confirmed bookings stay. */
export function revokeResellerKey(db, supplierId, partnerId) {
  const revoked = db.prepare("UPDATE api_partners SET status = 'REVOKED' WHERE id = ? AND supplier_id = ? AND issuer = 'SUPPLIER'").run(partnerId, supplierId);
  if (!revoked.changes) throw settingsError("Key not found", 404, "KEY_NOT_FOUND");
  return { id: partnerId, status: "REVOKED" };
}
