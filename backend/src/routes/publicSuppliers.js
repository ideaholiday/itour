import express from "express";
import db from "../db.js";
import logger from "../config/logger.js";
import { authenticate } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/security.js";
import { validateBody } from "../middleware/validation.js";
import { profileSchemas } from "../validators/apiSchemas.js";
import {
  directoryCities, findDirectoryCity, isProfileVisible, publicSupplierReviews, publicSupplierView,
  resolveProfileSlug, searchSupplierDirectory, sitemapSupplierEntries,
} from "../services/supplierProfileService.js";
import { createEnquiry } from "../services/supplierEnquiryService.js";
import { supplierProfileSeo } from "./seo.js";

const BASE_URL = process.env.PUBLIC_ORIGIN || "https://ideaholiday.in";

/**
 * Public supplier directory and profiles. Mounted on its own, outside
 * /api/suppliers, whose router requires a signed-in supplier or admin.
 * Every response here goes through supplierProfileService's allow-list.
 */
const router = express.Router();

const directoryLimiter = createRateLimiter({ windowMs: 60 * 1000, limit: 120, scope: "supplier-directory" });
const enquiryLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, limit: 10, scope: "supplier-enquiry" });

const truthy = (value) => ["1", "true", "yes"].includes(String(value || "").toLowerCase());

function failure(res, req, error, fallback) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

router.get("/", directoryLimiter, (req, res) => {
  try {
    const result = searchSupplierDirectory(db, {
      q: req.query.q,
      city: req.query.city,
      verified: truthy(req.query.verified),
      page: req.query.page,
      limit: req.query.limit,
    });
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json({ success: true, ...result });
  } catch (error) {
    return failure(res, req, error, "Could not load operators");
  }
});

router.get("/cities", directoryLimiter, (req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.json({ success: true, cities: directoryCities(db, { limit: req.query.limit }) });
  } catch (error) {
    return failure(res, req, error, "Could not load cities");
  }
});

router.get("/cities/:citySlug", directoryLimiter, (req, res) => {
  try {
    const city = findDirectoryCity(db, req.params.citySlug);
    if (!city) return res.status(404).json({ error: "No operators listed in this city yet" });
    const indexable = sitemapSupplierEntries(db).cities.some((entry) => entry.slug === city.slug);
    return res.json({ success: true, city: { ...city, indexable } });
  } catch (error) {
    return failure(res, req, error, "Could not load city");
  }
});

function visibleSupplier(slug) {
  const resolved = resolveProfileSlug(db, slug);
  if (!resolved) return { notFound: true };
  if (resolved.redirectTo) return { redirectTo: resolved.redirectTo };
  if (!isProfileVisible(resolved.supplier)) return { notFound: true };
  return { supplier: resolved.supplier };
}

router.get("/:slug", directoryLimiter, (req, res) => {
  try {
    const found = visibleSupplier(req.params.slug);
    if (found.notFound) return res.status(404).json({ error: "Operator not found" });
    // The SPA follows this to the current slug; crawlers get a real 301 from routes/seo.js.
    if (found.redirectTo) return res.json({ success: true, redirectTo: found.redirectTo });
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    const supplier = publicSupplierView(db, found.supplier);
    return res.json({
      success: true,
      supplier,
      // The same head tags the server wrote into the page, so the SPA keeps them.
      seo: supplierProfileSeo(supplier, BASE_URL),
      ...publicSupplierReviews(db, found.supplier.id, { page: 1, limit: 10 }),
    });
  } catch (error) {
    return failure(res, req, error, "Could not load operator");
  }
});

router.get("/:slug/reviews", directoryLimiter, (req, res) => {
  try {
    const found = visibleSupplier(req.params.slug);
    if (found.notFound || found.redirectTo) return res.status(404).json({ error: "Operator not found" });
    return res.json({ success: true, ...publicSupplierReviews(db, found.supplier.id, { page: req.query.page, limit: req.query.limit }) });
  } catch (error) {
    return failure(res, req, error, "Could not load reviews");
  }
});

router.post("/:slug/enquiries", enquiryLimiter, authenticate, validateBody(profileSchemas.enquiry), (req, res) => {
  try {
    const found = visibleSupplier(req.params.slug);
    if (found.notFound || found.redirectTo) return res.status(404).json({ error: "Operator not found" });
    const result = createEnquiry(db, {
      supplier: found.supplier,
      actor: req.user,
      message: req.body.message,
      travelDate: req.body.travelDate,
      travelers: req.body.travelers,
    });
    return res.status(result.reused ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return failure(res, req, error, "Your enquiry could not be sent");
  }
});

export default router;
