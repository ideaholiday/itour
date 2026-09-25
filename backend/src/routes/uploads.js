import express from "express";
import { UploadService, detectImageType } from "../services/uploadService.js";
import { authenticateBearer, optionalBearer } from "../middleware/auth.js";
import { z } from "zod";
import logger from "../config/logger.js";
import { kybMimeType, saveKybFile } from "../services/kybFileService.js";
import { createRateLimiter } from "../middleware/security.js";
import { supplierMay } from "../services/supplierStaffService.js";

const router = express.Router();
const uploadLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, limit: 60, scope: "upload" });

const Base64UploadSchema = z.object({
  data: z.string().min(10, "Base64 payload required"),
  filename: z.string().min(1).max(255),
  mimeType: z.string().optional().default("application/pdf"),
  entityType: z.enum(["PRODUCT", "AVATAR", "REVIEW", "KYB", "GENERAL"]).optional().default("GENERAL"),
  entityId: z.string().max(128).optional().nullable(),
});

/**
 * POST /api/uploads
 * Upload a file via base64 encoded data
 */
router.post("/uploads", uploadLimiter, authenticateBearer, async (req, res) => {
  try {
    const parseResult = Base64UploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "INVALID_UPLOAD_PAYLOAD",
        message: "Invalid upload request format",
        details: parseResult.error.flatten(),
      });
    }

    const { data, filename, mimeType, entityType, entityId } = parseResult.data;

    // Strip base64 prefix if present (e.g. data:image/png;base64,...)
    const base64Data = data.includes(",") ? data.split(",")[1] : data;
    const buffer = Buffer.from(base64Data, "base64");

    // Size limit: 10MB
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({
        error: "FILE_TOO_LARGE",
        message: "File exceeds 10MB limit",
      });
    }

    if (entityType === "KYB") {
      // Identity documents: only the supplier themselves (or an admin) may add
      // one, and the file is stored privately rather than in public /uploads.
      const role = String(req.user?.role || "").toUpperCase();
      const ownsSupplier = role === "SUPPLIER" && req.user.supplier_id && req.user.supplier_id === entityId && supplierMay(req.user, "owner");
      if (!entityId || !(ownsSupplier || ["ADMIN", "STAFF"].includes(role))) {
        return res.status(403).json({ error: "KYB documents can only be uploaded for your own supplier account", code: "FORBIDDEN" });
      }
      const kybMime = kybMimeType(mimeType);
      if (!kybMime) {
        return res.status(400).json({ error: "KYB documents must be a PDF, PNG, JPG or WEBP file", code: "UNSUPPORTED_FILE_TYPE" });
      }
      const stored = await saveKybFile(buffer, kybMime);
      const upload = UploadService.recordUpload({
        userId: req.user.id || null,
        filename: stored.filename,
        originalName: filename,
        mimeType: kybMime,
        sizeBytes: buffer.length,
        url: stored.url,
        entityType,
        entityId,
      });
      return res.status(201).json({ success: true, upload });
    }

    if (!detectImageType(buffer)) {
      return res.status(400).json({ error: "UNSUPPORTED_FILE_TYPE", message: "Photos must be a PNG, JPG or WEBP image" });
    }
    const upload = await UploadService.saveFileBuffer({
      buffer,
      originalName: filename,
      userId: req.user?.id || null,
      entityType,
      entityId,
    });

    return res.status(201).json({
      success: true,
      upload,
    });
  } catch (error) {
    logger.error("Upload failed", { error: error.message });
    return res.status(500).json({
      error: "UPLOAD_FAILED",
      message: "Failed to process and store file upload",
    });
  }
});

/**
 * GET /api/uploads/:id
 * Retrieve upload metadata
 */
router.get("/uploads/:id", optionalBearer, (req, res) => {
  const upload = UploadService.getUploadById(req.params.id);
  if (!upload) {
    return res.status(404).json({ error: "UPLOAD_NOT_FOUND" });
  }
  if (String(upload.entity_type || "").toUpperCase() === "KYB") {
    const role = String(req.user?.role || "").toUpperCase();
    const ownsSupplier = role === "SUPPLIER" && req.user?.supplier_id && req.user.supplier_id === upload.entity_id && supplierMay(req.user, "owner");
    if (!(ownsSupplier || ["ADMIN", "STAFF"].includes(role))) {
      return res.status(404).json({ error: "UPLOAD_NOT_FOUND" });
    }
  }
  return res.json({ upload });
});

export default router;
