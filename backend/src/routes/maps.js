import { Router } from "express";
import logger from "../config/logger.js";
import { mapTile, olaMapsConfigured } from "../services/olaMapsService.js";

const router = Router();

const MAX_ZOOM = 19;
// Every tile is otherwise a round trip to Ola. Recently served tiles (~20 KB each,
// ~40 MB at the cap) are answered from memory for a day.
const TILE_CACHE_TTL_MS = 24 * 60 * 60_000;
const TILE_CACHE_MAX_ENTRIES = 2000;
const tileCache = new Map();

async function cachedTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  const entry = tileCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    // Re-insert so the Map's insertion order tracks recent use.
    tileCache.delete(key);
    tileCache.set(key, entry);
    return entry.png;
  }
  const png = await mapTile(z, x, y);
  tileCache.delete(key);
  if (tileCache.size >= TILE_CACHE_MAX_ENTRIES) tileCache.delete(tileCache.keys().next().value);
  tileCache.set(key, { png, expiresAt: Date.now() + TILE_CACHE_TTL_MS });
  return png;
}

// GET /api/maps/tiles/:z/:x/:y.png — base-map tiles for every Leaflet map.
// Proxied so the Ola credentials stay on the server; without them, OpenStreetMap.
router.get("/tiles/:z/:x/:y.png", async (req, res) => {
  const [z, x, y] = [req.params.z, req.params.x, req.params.y].map((value) => (/^\d+$/.test(value) ? Number(value) : NaN));
  if (!Number.isInteger(z) || z > MAX_ZOOM || !Number.isInteger(x) || !Number.isInteger(y) || x >= 2 ** z || y >= 2 ** z) {
    return res.status(400).json({ success: false, error: "Invalid map tile." });
  }
  if (!olaMapsConfigured()) {
    res.set("Cache-Control", "public, max-age=86400");
    return res.redirect(302, `https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
  }
  try {
    const png = await cachedTile(z, x, y);
    res.set({ "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
    return res.send(png);
  } catch (error) {
    logger.warn("Ola Maps tile failed", { requestId: req.requestId, tile: `${z}/${x}/${y}`, error: error.message });
    return res.status(error.status === 404 ? 404 : 502).json({ success: false, error: "Map tile unavailable." });
  }
});

export default router;
