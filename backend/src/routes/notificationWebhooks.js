import express from "express";
import crypto from "node:crypto";
import db from "../db.js";
import { updateProviderDeliveryStatus } from "../services/notificationLogService.js";
import logger from "../config/logger.js";

const router = express.Router();

function validMetaSignature(req) {
  const appSecret = String(process.env.WHATSAPP_APP_SECRET || "");
  const signature = String(req.headers["x-hub-signature-256"] || "");
  if (!appSecret || !signature.startsWith("sha256=") || !req.rawBody) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Meta calls this once while registering the callback URL.
router.get("/whatsapp", (req, res) => {
  const expectedToken = String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "");
  if (req.query["hub.mode"] === "subscribe" && expectedToken && req.query["hub.verify_token"] === expectedToken) {
    return res.status(200).send(String(req.query["hub.challenge"] || ""));
  }
  return res.status(403).json({ error: "WhatsApp webhook verification failed" });
});

router.post("/whatsapp", (req, res) => {
  if (!validMetaSignature(req)) return res.status(401).json({ error: "Invalid WhatsApp webhook signature" });
  try {
    const statuses = (req.body?.entry || []).flatMap((entry) => entry?.changes || [])
      .flatMap((change) => change?.value?.statuses || []);
    for (const item of statuses) {
      const status = String(item.status || "SENT").toUpperCase();
      const error = item.errors?.map((value) => value.title || value.message).filter(Boolean).join("; ") || null;
      if (item.id) updateProviderDeliveryStatus(item.id, status, error, db);
    }
    return res.sendStatus(200);
  } catch (error) {
    logger.error("WhatsApp webhook processing failed", { requestId: req.requestId, error });
    return res.sendStatus(200);
  }
});

export default router;
