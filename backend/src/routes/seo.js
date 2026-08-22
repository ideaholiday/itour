import { Router } from "express";
import db from "../db.js";
import logger from "../config/logger.js";

const router = Router();
const BASE_URL = process.env.PUBLIC_ORIGIN || "https://ideaholiday.in";

export function generateSitemapXml(products = [], baseUrl = BASE_URL) {
  const staticUrls = [
    { loc: `${baseUrl}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${baseUrl}/transfers`, priority: "0.9", changefreq: "daily" },
    { loc: `${baseUrl}/search`, priority: "0.9", changefreq: "daily" },
    { loc: `${baseUrl}/how-it-works`, priority: "0.7", changefreq: "monthly" },
    { loc: `${baseUrl}/about-us`, priority: "0.6", changefreq: "monthly" },
    { loc: `${baseUrl}/contact-us`, priority: "0.6", changefreq: "monthly" },
    { loc: `${baseUrl}/terms`, priority: "0.5", changefreq: "monthly" },
    { loc: `${baseUrl}/cancellation`, priority: "0.5", changefreq: "monthly" },
  ];

  const popularDestinations = ["Goa", "Jaipur", "Agra", "Delhi", "Kerala", "Varanasi", "Rishikesh", "Manali", "Udaipur", "Mumbai"];
  const destinationUrls = popularDestinations.map((city) => ({
    loc: `${baseUrl}/search?q=${encodeURIComponent(city)}`,
    priority: "0.8",
    changefreq: "weekly",
  }));

  const productUrls = (products || []).map((p) => {
    const lastMod = p.updated_at ? new Date(p.updated_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
    return {
      loc: `${baseUrl}/activity/${encodeURIComponent(p.id)}`,
      lastmod: lastMod,
      priority: "0.85",
      changefreq: "weekly",
    };
  });

  const allUrls = [...staticUrls, ...destinationUrls, ...productUrls];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  allUrls.forEach((entry) => {
    xml += `  <url>\n`;
    xml += `    <loc>${entry.loc}</loc>\n`;
    if (entry.lastmod) {
      xml += `    <lastmod>${entry.lastmod}</lastmod>\n`;
    }
    if (entry.changefreq) {
      xml += `    <changefreq>${entry.changefreq}</changefreq>\n`;
    }
    if (entry.priority) {
      xml += `    <priority>${entry.priority}</priority>\n`;
    }
    xml += `  </url>\n`;
  });

  xml += `</urlset>`;
  return xml;
}

export function generateRobotsTxt(baseUrl = BASE_URL) {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/*
Disallow: /ops
Disallow: /ops/*
Disallow: /supplier/dashboard
Disallow: /supplier/bookings
Disallow: /checkout
Disallow: /checkout/*

Sitemap: ${baseUrl}/sitemap.xml
`;
}

// ── GET /sitemap.xml ───────────────────────────────────────────
router.get("/sitemap.xml", (req, res) => {
  try {
    let products = [];
    try {
      products = db
        .prepare("SELECT id, created_at as updated_at, category, city as destination_name FROM products WHERE is_published = 1 ORDER BY id DESC")
        .all() || [];
    } catch (dbErr) {
      logger.warn("Sitemap database fallback failed", { requestId: req.requestId, error: dbErr });
      products = [];
    }

    const xml = generateSitemapXml(products, BASE_URL);
    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    logger.error("Sitemap generation failed", { requestId: req.requestId, error: err });
    res.status(500).send("Error generating sitemap");
  }
});

// ── GET /robots.txt ────────────────────────────────────────────
router.get("/robots.txt", (req, res) => {
  const robots = generateRobotsTxt(BASE_URL);
  res.header("Content-Type", "text/plain");
  res.send(robots);
});

export default router;
