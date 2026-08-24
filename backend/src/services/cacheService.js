import logger from "../config/logger.js";

/**
 * Cache Service with In-Memory Map (Redis-ready interface)
 * Supports TTL, get/set/del/invalidatePattern, and cache metrics
 */

class CacheService {
  constructor() {
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.value;
  }

  set(key, value, ttlSeconds = 300) {
    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
    this.stats.sets++;
    return true;
  }

  del(key) {
    const deleted = this.store.delete(key);
    if (deleted) this.stats.deletes++;
    return deleted;
  }

  invalidatePattern(pattern) {
    let count = 0;
    const regex = typeof pattern === "string" 
      ? new RegExp(pattern.replace(/\*/g, ".*"))
      : pattern;

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    this.stats.deletes += count;
    logger.debug("Cache pattern invalidated", { pattern: String(pattern), count });
    return count;
  }

  clear() {
    const size = this.store.size;
    this.store.clear();
    return size;
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 
      : 0;
    return {
      ...this.stats,
      size: this.store.size,
      hitRatePct: Number(hitRate.toFixed(2)),
    };
  }
}

export const cacheService = new CacheService();
export default cacheService;
