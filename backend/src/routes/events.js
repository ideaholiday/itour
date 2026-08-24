import express from "express";
import { sseService } from "../services/sseService.js";
import { optionalBearer } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/events/stream
 * Server-Sent Events stream for real-time dashboard events
 */
router.get("/events/stream", optionalBearer, (req, res) => {
  const channel = req.query.channel || (req.user?.id ? `user:${req.user.id}` : "public");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  sseService.subscribe(channel, res, req.user?.id || null);

  // Keep-alive heartbeat every 25 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  res.on("close", () => {
    clearInterval(heartbeat);
  });
});

export default router;
