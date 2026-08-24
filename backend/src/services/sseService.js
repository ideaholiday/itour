import logger from "../config/logger.js";

/**
 * Server-Sent Events (SSE) Broadcast & Client Connection Service
 */
class SseService {
  constructor() {
    // Map of channel -> Set of response objects
    this.channels = new Map();
  }

  /**
   * Register a new client SSE response stream on a channel
   */
  subscribe(channel, res, userId = null) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }

    const clientSet = this.channels.get(channel);
    clientSet.add(res);

    logger.debug("SSE client connected", { channel, totalClients: clientSet.size, userId });

    // Send initial handshake
    res.write(`data: ${JSON.stringify({ type: "CONNECTED", channel, timestamp: new Date().toISOString() })}\n\n`);

    // Clean up on disconnect
    res.on("close", () => {
      clientSet.delete(res);
      if (clientSet.size === 0) {
        this.channels.delete(channel);
      }
      logger.debug("SSE client disconnected", { channel, remainingClients: clientSet.size });
    });
  }

  /**
   * Broadcast an event to all subscribers of a channel
   */
  publish(channel, eventType, data = {}) {
    const clientSet = this.channels.get(channel);
    if (!clientSet || clientSet.size === 0) {
      return 0;
    }

    const payload = JSON.stringify({
      type: eventType,
      ...data,
      timestamp: new Date().toISOString(),
    });

    let sent = 0;
    for (const res of clientSet) {
      try {
        res.write(`data: ${payload}\n\n`);
        sent++;
      } catch (err) {
        clientSet.delete(res);
      }
    }

    logger.debug("SSE published", { channel, eventType, recipients: sent });
    return sent;
  }
}

export const sseService = new SseService();
export default sseService;
