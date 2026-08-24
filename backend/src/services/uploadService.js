import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import db from "../db.js";
import logger from "../config/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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
  static saveFileBuffer({ buffer, originalName, mimeType, userId = null, entityType = null, entityId = null }) {
    const ext = path.extname(originalName) || (mimeType.includes("png") ? ".png" : ".jpg");
    const uniqueName = `file_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    const filePath = path.join(UPLOADS_DIR, uniqueName);

    fs.writeFileSync(filePath, buffer);
    const url = `/uploads/${uniqueName}`;

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
