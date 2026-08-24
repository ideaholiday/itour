import express from "express";
import { ExportService } from "../services/exportService.js";
import { authenticateBearer, optionalBearer } from "../middleware/auth.js";
import { z } from "zod";

const router = express.Router();

const ExportRequestSchema = z.object({
  type: z.enum(["bookings", "products", "payouts"]),
  format: z.enum(["csv", "json"]).optional().default("csv"),
  filters: z.record(z.any()).optional().default({}),
});

/**
 * POST /api/exports
 * Generate data export (CSV / JSON)
 */
router.post("/exports", optionalBearer, (req, res) => {
  const parseResult = ExportRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: "INVALID_EXPORT_REQUEST",
      details: parseResult.error.flatten(),
    });
  }

  const { type, format, filters } = parseResult.data;
  const result = ExportService.createExportJob({
    userId: req.user?.id || null,
    exportType: type,
    format,
    filters,
  });

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${type}_export_${Date.now()}.csv"`);
    return res.send(result.content);
  }

  return res.json({
    success: true,
    jobId: result.jobId,
    rowCount: result.rowCount,
    data: JSON.parse(result.content),
  });
});

export default router;
