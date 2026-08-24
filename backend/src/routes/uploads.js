import express from "express";
import { UploadService } from "../services/uploadService.js";
import { authenticateBearer, optionalBearer } from "../middleware/auth.js";
import { z } from "zod";
import logger from "../config/logger.js";

const router = express.Router();

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
router.post("/uploads", optionalBearer, async (req, res) => {
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

    // Normalize mimeType
    const mime = String(mimeType || "").toLowerCase();
    const safeMime = mime.includes("png") ? "image/png" :
                     mime.includes("webp") ? "image/webp" :
                     mime.includes("gif") ? "image/gif" :
                     (mime.includes("jpg") || mime.includes("jpeg")) ? "image/jpeg" :
                     "application/pdf";

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

    const upload = UploadService.saveFileBuffer({
      buffer,
      originalName: filename,
      mimeType,
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
router.get("/uploads/:id", (req, res) => {
  const upload = UploadService.getUploadById(req.params.id);
  if (!upload) {
    return res.status(404).json({ error: "UPLOAD_NOT_FOUND" });
  }
  return res.json({ upload });
});

export default router;
