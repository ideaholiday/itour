import { Router } from "express";
import db from "../db.js";
import logger from "../config/logger.js";
import { findPublishedPost, listPublishedPosts, liveLinkedProducts } from "../services/blogService.js";
import { parseProductRows } from "./activities.js";

// Public staff blog (ADR 026): published posts only.
const router = Router();

router.get("/", (req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({ success: true, ...listPublishedPosts(db, { city: String(req.query.city || ""), page: req.query.page }) });
  } catch (error) {
    logger.error("Blog list failed", { requestId: req.requestId, error });
    res.status(500).json({ error: "Could not load the blog" });
  }
});

router.get("/:slug", (req, res) => {
  try {
    const found = findPublishedPost(db, req.params.slug);
    if (!found) return res.status(404).json({ error: "Post not found", code: "BLOG_POST_NOT_FOUND", requestId: req.requestId });
    if (found.redirectTo) return res.json({ success: true, redirectTo: found.redirectTo });
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({ success: true, post: found.post, products: parseProductRows(liveLinkedProducts(db, found.productIds)) });
  } catch (error) {
    logger.error("Blog post lookup failed", { requestId: req.requestId, error });
    res.status(500).json({ error: "Could not load the post" });
  }
});

export default router;
