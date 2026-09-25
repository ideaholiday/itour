#!/usr/bin/env node
/**
 * Issue an OCTo partner key. The key is printed once and only its hash is stored.
 *
 * Usage:
 *   node scripts/create-api-partner.js "Partner name" [--supplier <supplierId>] [--prepaid]
 *   node scripts/create-api-partner.js --revoke <partnerId>
 */
import { nanoid } from "nanoid";
import db from "../src/db.js";
import { generateApiKey } from "../src/middleware/apiPartner.js";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

if (args.includes("--revoke")) {
  const id = flag("--revoke");
  const result = db.prepare("UPDATE api_partners SET status = 'REVOKED' WHERE id = ?").run(id);
  console.log(result.changes ? `Revoked ${id}` : `No partner ${id}`);
  process.exit(result.changes ? 0 : 1);
}

const name = args[0] && !args[0].startsWith("--") ? args[0] : null;
if (!name) {
  console.error('Usage: node scripts/create-api-partner.js "Partner name" [--supplier <supplierId>] [--prepaid]');
  process.exit(1);
}
const supplierId = flag("--supplier");
if (supplierId && !db.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId)) {
  console.error(`No supplier ${supplierId}`);
  process.exit(1);
}

const id = `apip_${nanoid(12)}`;
const { key, keyHash, keyPrefix } = generateApiKey();
db.prepare("INSERT INTO api_partners (id, name, supplier_id, key_hash, key_prefix, prepaid) VALUES (?, ?, ?, ?, ?, ?)")
  .run(id, name, supplierId, keyHash, keyPrefix, args.includes("--prepaid") ? 1 : 0);

console.log(`Partner ${id} (${name}) created.`);
console.log(`API key (shown once, send it securely): ${key}`);
