import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import db from "../db.js";
import logger from "../config/logger.js";
import { PUBLIC_MEDIA_BUCKET, mediaStorageEnabled, publicObjectUrl, putObject } from "./mediaStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Public uploads are served from our own domain, so only real images are
// kept, and the file's extension comes from its contents, never its name.
const IMAGE_EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export class UploadService {
  /**
   * Save uploaded file metadata to database
   */
  static recordUpload({
    userId = null,
    filename,
    originalName,
    mimeType,
    sizeBytes,
    url,
    thumbnailUrl = null,
    entityType = null,
    entityId = null,
  }) {
    const id = `upload_${crypto.randomBytes(8).toString("hex")}`;
    const stmt = db.prepare(`
      INSERT INTO uploads (
        id, user_id, filename, original_name, mime_type,
        size_bytes, url, thumbnail_url, entity_type, entity_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(
      id,
      userId,
      filename,
      originalName,
      mimeType,
      sizeBytes,
      url,
      thumbnailUrl,
      entityType,
      entityId
    );

    logger.info("Upload recorded", { id, filename, sizeBytes, entityType });
    return {
      id,
      filename,
      original_name: originalName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      url,
      thumbnail_url: thumbnailUrl,
      entity_type: entityType,
      entity_id: entityId,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Process raw buffer or file
   */
  static async saveFileBuffer({ buffer, originalName, userId = null, entityType = null, entityId = null }) {
    const mimeType = detectImageType(buffer);
    const ext = IMAGE_EXTENSIONS[mimeType];
    if (!ext) throw Object.assign(new Error("Images must be a PNG, JPG or WEBP file"), { status: 400 });
    const uniqueName = `file_${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;

    let url;
    if (mediaStorageEnabled()) {
      const objectPath = `${String(entityType || "GENERAL").toLowerCase()}/${uniqueName}`;
      await putObject(PUBLIC_MEDIA_BUCKET, objectPath, buffer, mimeType);
      url = publicObjectUrl(objectPath);
    } else {
      fs.writeFileSync(path.join(UPLOADS_DIR, uniqueName), buffer);
      url = `/uploads/${uniqueName}`;
    }

    return this.recordUpload({
      userId,
      filename: uniqueName,
      originalName,
      mimeType,
      sizeBytes: buffer.length,
      url,
      thumbnailUrl: url,
      entityType,
      entityId,
    });
  }

  /**
   * Get upload by ID
   */
  static getUploadById(id) {
    return db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);
  }

  /**
   * List uploads for a user or entity
   */
  static listUploads({ userId, entityType, entityId, limit = 50, offset = 0 }) {
    let query = "SELECT * FROM uploads WHERE 1=1";
    const params = [];

    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }
    if (entityType) {
      query += " AND entity_type = ?";
      params.push(entityType);
    }
    if (entityId) {
      query += " AND entity_id = ?";
      params.push(entityId);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    return db.prepare(query).all(...params);
  }
}

export default UploadService;
