import { cacheService } from "../services/cacheService.js";

/**
 * Route-level Cache Middleware
 * @param {number} ttlSeconds - Time-to-live in seconds
 * @param {function} [keyGenerator] - Optional custom key generator (req) => string
 */
export function cacheResponse(ttlSeconds = 300, keyGenerator = null) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    const key = keyGenerator 
      ? keyGenerator(req) 
      : `http:${req.originalUrl || req.url}`;

    const cachedData = cacheService.get(key);
    if (cachedData !== null) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cachedData);
    }

    res.setHeader("X-Cache", "MISS");
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      // Cache successful 2xx responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheService.set(key, body, ttlSeconds);
      }
      return originalJson(body);
    };

    next();
  };
}

export default cacheResponse;
