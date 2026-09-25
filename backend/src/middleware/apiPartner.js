import { createHash, randomBytes } from "node:crypto";
import db from "../db.js";
import logger from "../config/logger.js";

// Partner keys look like `ihp_<48 hex>`. Only their SHA-256 is stored.
export const hashApiKey = (key) => createHash("sha256").update(String(key)).digest("hex");

export function generateApiKey() {
  const key = `ihp_${randomBytes(24).toString("hex")}`;
  return { key, keyHash: hashApiKey(key), keyPrefix: key.slice(0, 12) };
}

export function findApiPartner(database, key) {
  if (!key) return null;
  return database.prepare("SELECT * FROM api_partners WHERE key_hash = ? AND status = 'ACTIVE'").get(hashApiKey(key)) || null;
}

// OCTo sends the key as `Authorization: Bearer <key>`.
export function requireApiPartner(database = db) {
  return (req, res, next) => {
    const header = String(req.headers.authorization || "");
    const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const partner = findApiPartner(database, key);
    if (!partner) {
      logger.warn("OCTo request without a valid partner key", { event: "api_partner_denied", requestId: req.requestId, path: req.path });
      return res.status(401).json({ error: "A valid API key is required", code: "UNAUTHORIZED" });
    }
    database.prepare("UPDATE api_partners SET last_used_at = ? WHERE id = ?").run(new Date().toISOString(), partner.id);
    req.apiPartner = partner;
    return next();
  };
}

// Browsing takes a key when one is sent, so a supplier's own reseller sees
// that supplier's listings on its channel (ADR 041). No key is the public view;
// a wrong key is refused rather than silently ignored.
export function optionalApiPartner(database = db) {
  const required = requireApiPartner(database);
  return (req, res, next) => (String(req.headers.authorization || "").startsWith("Bearer ") ? required(req, res, next) : next());
}
