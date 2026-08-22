import test from "node:test";
import assert from "node:assert/strict";
import { generateSitemapXml, generateRobotsTxt } from "../src/routes/seo.js";

test("sitemap.xml returns valid XML containing public routes, destination hubs, and dynamic products", () => {
  const sampleProducts = [
    { id: "act_goa_scuba", updated_at: "2026-08-20T10:00:00.000Z", category: "ACTIVITY", destination_name: "Goa" },
    { id: "act_taj_sunrise", updated_at: "2026-08-19T10:00:00.000Z", category: "DAY_TOUR", destination_name: "Agra" }
  ];

  const xml = generateSitemapXml(sampleProducts, "https://ideaholiday.in");

  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/transfers<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/search<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/search\?q=Goa<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/activity\/act_goa_scuba<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/activity\/act_taj_sunrise<\/loc>/);
  assert.match(xml, /<priority>1.0<\/priority>/);
  assert.match(xml, /<priority>0.85<\/priority>/);
});

test("robots.txt declares crawling rules, disallows private panels and points to sitemap", () => {
  const robots = generateRobotsTxt("https://ideaholiday.in");

  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/ops/);
  assert.match(robots, /Disallow: \/supplier\/dashboard/);
  assert.match(robots, /Disallow: \/checkout/);
  assert.match(robots, /Sitemap: https:\/\/ideaholiday.in\/sitemap.xml/);
});
