import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../config/logger.js";
import { PUBLIC_MEDIA_BUCKET, publicObjectPath, removeObject } from "./mediaStorage.js";

// Photos uploaded but never saved into a product, profile or review are deleted
// after 30 days (ADR 021). Product drafts live only in the supplier's browser,
// so the wait is long enough for a supplier to come back to a draft.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

export const ORPHAN_UPLOAD_RETENTION_DAYS = 30;

// Every column that can hold an uploaded photo's link. JSON lists (images,
// itinerary) are searched as text, so a photo anywhere in them counts as used.
const REFERENCES = [
  ["products", "hero_image"],
  ["products", "images"],
  ["products", "itinerary"],
  ["product_media", "url"],
  ["product_media", "thumbnail_url"],
  ["suppliers", "logo_url"],
  ["suppliers", "cover_url"],
  ["review_photos", "photo_url"],
  ["destinations", "hero_image"],
  ["user_profiles", "avatar_url"],
  ["support_case_evidence", "evidence_url"],
];

const REFERENCE_SQL = REFERENCES
  .map(([table, column]) => `SELECT 1 AS used FROM ${table} WHERE CAST(${column} AS TEXT) LIKE ?`)
  .join(" UNION ALL ");

// Upload file names are unique and random, so matching the name is enough.
// LIKE's "_" wildcard only widens the match, which errs towards keeping a file.
export function isUploadReferenced(database, filename) {
  const pattern = `%${filename}%`;
  return Boolean(database.prepare(`SELECT used FROM (${REFERENCE_SQL}) refs LIMIT 1`).get(...REFERENCES.map(() => pattern)));
}

// created_at is text in both engines ("2026-09-19 12:36:46" or with fractions
// and a zone); this format compares correctly against either.
function sqlTimestamp(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function localUploadPath(url, uploadsDir) {
  const match = String(url || "").match(/^\/(?:api\/uploads\/files|uploads)\/([\w.-]+)$/);
  return match ? path.join(uploadsDir, match[1]) : null;
}

/**
 * Deletes up to `limit` unused photo uploads older than the retention period.
 * Candidates are sampled at random, so photos in use (which are also old) can't
 * crowd out the unused ones run after run. KYB documents are never touched.
 */
export async function purgeOrphanUploads(database, { now = new Date(), sample = 200, limit = 50, uploadsDir = UPLOADS_DIR, remove = removeObject } = {}) {
  const cutoff = sqlTimestamp(new Date(now.getTime() - ORPHAN_UPLOAD_RETENTION_DAYS * 86_400_000));
  const candidates = database.prepare(`
    SELECT id, filename, url FROM uploads
    WHERE UPPER(COALESCE(entity_type, '')) <> 'KYB' AND created_at < ?
    ORDER BY RANDOM() LIMIT ?
  `).all(cutoff, sample);

  const result = { checked: candidates.length, deleted: 0, failed: 0 };
  for (const upload of candidates) {
    if (result.deleted >= limit) break;
    if (!upload.filename || isUploadReferenced(database, upload.filename)) continue;

    const objectPath = publicObjectPath(upload.url);
    const localPath = localUploadPath(upload.url, uploadsDir);
    if (!objectPath && !localPath) continue; // not a file we stored

    try {
      if (objectPath) await remove(PUBLIC_MEDIA_BUCKET, objectPath);
      else fs.rmSync(localPath, { force: true });
      database.prepare("DELETE FROM uploads WHERE id = ?").run(upload.id);
      result.deleted += 1;
    } catch (err) {
      result.failed += 1;
      logger.error("Could not delete unused upload", { uploadId: upload.id, error: err.message });
    }
  }
  return result;
}
