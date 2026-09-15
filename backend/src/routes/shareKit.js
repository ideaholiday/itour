import express from "express";
import db from "../db.js";
import logger from "../config/logger.js";
import { createRateLimiter } from "../middleware/security.js";
import {
  publicAppUrl, recordShareVisit, renderReviewWidget, renderSharePrintSheet, shareQrForSlug,
} from "../services/supplierShareKitService.js";

/**
 * Supplier share kit (docs/SHARE_KIT.md). `goRouter` serves the short tracked
 * link QR codes point at; `shareRouter` serves QR images, print sheets and the
 * review widget under /api/share. All public: they only expose what the public
 * profile already shows.
 */
const limiter = createRateLimiter({ windowMs: 60_000, limit: 120, scope: "share-kit" });

export const goRouter = express.Router();

// GET /go/s/:slug?t=profile|review&c=qr|standee|sticker|voucher|widget|link
goRouter.get("/go/s/:slug", limiter, (req, res) => {
  try {
    const destination = recordShareVisit(db, req.params.slug, { target: req.query.t, channel: req.query.c });
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, destination || `${publicAppUrl()}/suppliers`);
  } catch (error) {
    logger.error("Share link redirect failed", { requestId: req.requestId, error });
    return res.redirect(302, `${publicAppUrl()}/suppliers`);
  }
});

export const shareRouter = express.Router();
shareRouter.use(limiter);

function failure(res, req, error, fallback) {
  if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

shareRouter.get("/s/:slug/qr.svg", async (req, res) => {
  try {
    const svg = await shareQrForSlug(db, req.params.slug, { target: req.query.t, channel: req.query.c || "qr", format: "svg" });
    res.set("Content-Type", "image/svg+xml").set("Cache-Control", "public, max-age=86400");
    if (req.query.download) res.attachment(`${req.params.slug}-${String(req.query.t || "profile")}-qr.svg`);
    return res.send(svg);
  } catch (error) {
    return failure(res, req, error, "Could not create the QR code");
  }
});

shareRouter.get("/s/:slug/qr.png", async (req, res) => {
  try {
    const png = await shareQrForSlug(db, req.params.slug, { target: req.query.t, channel: req.query.c || "qr", format: "png" });
    res.set("Content-Type", "image/png").set("Cache-Control", "public, max-age=86400");
    if (req.query.download) res.attachment(`${req.params.slug}-${String(req.query.t || "profile")}-qr.png`);
    return res.send(png);
  } catch (error) {
    return failure(res, req, error, "Could not create the QR code");
  }
});

shareRouter.get("/s/:slug/print", (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.type("html").send(renderSharePrintSheet(db, req.params.slug, { format: req.query.format, target: req.query.t }));
  } catch (error) {
    return failure(res, req, error, "Could not create the print sheet");
  }
});

// The widget is meant to be framed on the supplier's own website.
shareRouter.get("/s/:slug/widget", (req, res) => {
  try {
    const html = renderReviewWidget(db, req.params.slug);
    res.removeHeader("X-Frame-Options");
    res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors *; base-uri 'none'; form-action 'none'");
    res.set("Cache-Control", "public, max-age=300");
    return res.type("html").send(html);
  } catch (error) {
    return failure(res, req, error, "Could not load the reviews");
  }
});
