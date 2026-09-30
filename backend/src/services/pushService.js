import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import db from "../db.js";
import logger from "../config/logger.js";
import { beginNotificationDelivery, finishNotificationDelivery } from "./notificationLogService.js";

/**
 * Push notifications to the Android apps through Firebase Cloud Messaging
 * (HTTP v1, ADR 053). A push goes out alongside the email and WhatsApp of every
 * recipient alert (see sendRecipientChannels). The notification carries the
 * alert's subject only, and opens the app on the recipient's own page.
 */
export const PUSH_APPS = Object.freeze(["driver", "traveler", "supplier"]);
const OPEN_PATH = Object.freeze({ driver: "/driver", traveler: "/bookings", supplier: "/supplier/bookings" });
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Cloud Run's own service account, with no key file (organisation policy blocks keys).
const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

const error = (message, status = 400) => Object.assign(new Error(message), { status });

/**
 * How the API signs in to Firebase, or null when push is off:
 * - FIREBASE_SERVICE_ACCOUNT: a service-account key (its JSON, raw or base64);
 * - otherwise FIREBASE_PROJECT_ID alone: the runtime service account of Cloud Run,
 *   which needs the "Firebase Cloud Messaging API Admin" role on that project.
 */
export function firebaseConfiguration(env = process.env) {
  const raw = String(env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  const projectId = String(env.FIREBASE_PROJECT_ID || "").trim();
  if (!raw) return projectId ? { projectId, runtimeAccount: true } : null;
  try {
    const account = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    if (!account.project_id || !account.client_email || !account.private_key) return null;
    return { projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key };
  } catch {
    return null;
  }
}

export function registerPushDevice(db, { token, app, ownerType, ownerKey }) {
  if (!PUSH_APPS.includes(app)) throw error("Unknown app");
  const key = String(ownerKey || "").trim();
  if (!key) throw error("Sign in first", 401);
  db.prepare(`INSERT INTO push_devices (id, token, app, owner_type, owner_key) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET app = excluded.app, owner_type = excluded.owner_type, owner_key = excluded.owner_key,
      disabled_at = NULL, updated_at = datetime('now')`).run(`pd_${randomUUID()}`, token, app, ownerType, key);
}

/** Signing out stops pushes to that phone. */
export function unregisterPushDevice(db, token) {
  db.prepare("DELETE FROM push_devices WHERE token = ?").run(token);
}

/** The phones a recipient of an alert uses: a driver's by roster email, a traveler's or supplier team's by user. */
export function pushDevicesFor(db, recipient) {
  const active = "disabled_at IS NULL";
  if (recipient.role === "DRIVER" && recipient.email) {
    return db.prepare(`SELECT * FROM push_devices WHERE owner_type = 'DRIVER' AND owner_key = ? AND app = 'driver' AND ${active}`).all(String(recipient.email).toLowerCase());
  }
  if (recipient.role === "TRAVELER" && recipient.id) {
    return db.prepare(`SELECT * FROM push_devices WHERE owner_type = 'USER' AND owner_key = ? AND app = 'traveler' AND ${active}`).all(recipient.id);
  }
  if (recipient.role === "SUPPLIER" && recipient.id) {
    // The owner (users.email = suppliers.email) and staff who see bookings; guides don't (SECURITY.md).
    return db.prepare(`SELECT pd.* FROM push_devices pd WHERE pd.owner_type = 'USER' AND pd.app = 'supplier' AND pd.${active} AND pd.owner_key IN (
        SELECT u.id FROM users u JOIN suppliers s ON LOWER(s.email) = LOWER(u.email) WHERE s.id = ?
        UNION SELECT m.user_id FROM supplier_members m WHERE m.supplier_id = ? AND m.role IN ('MANAGER', 'FRONT_DESK'))`).all(recipient.id, recipient.id);
  }
  return [];
}

let cachedAccess = null;
async function accessToken(config, fetchImpl, now) {
  const account = config.runtimeAccount ? "runtime" : config.clientEmail;
  if (cachedAccess?.account === account && cachedAccess.expiresAt > now + 60000) return cachedAccess.token;
  if (config.runtimeAccount) {
    const response = await fetchImpl(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw new Error(`Cloud Run service account token failed (${response.status})`);
    cachedAccess = { account, token: data.access_token, expiresAt: now + Number(data.expires_in || 300) * 1000 };
    return cachedAccess.token;
  }
  const assertion = jwt.sign({ scope: SCOPE }, config.privateKey, {
    algorithm: "RS256", issuer: config.clientEmail, audience: TOKEN_URL, expiresIn: "1h",
  });
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`Firebase sign-in failed (${response.status})`);
  cachedAccess = { account, token: data.access_token, expiresAt: now + Number(data.expires_in || 3600) * 1000 };
  return cachedAccess.token;
}

/** Sends one alert to each of the recipient's phones. Returns one result per phone. */
export async function sendPush({ database = db, recipient, eventType, eventKeyPrefix, title = "Idea Holiday", body, metadata }, { env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const devices = pushDevicesFor(database, recipient);
  if (!devices.length || !String(body || "").trim()) return [];
  const config = firebaseConfiguration(env);
  const results = [];
  for (const device of devices) {
    const started = beginNotificationDelivery({
      eventKey: eventKeyPrefix ? `${eventKeyPrefix}:PUSH:${device.id}` : undefined, eventType, channel: "PUSH",
      recipientRole: recipient.role, recipientId: recipient.id, recipientAddress: `push:${device.app}:${device.id}`,
      provider: "FCM", subject: title, body, metadata,
    }, database);
    if (started.idempotent) { results.push({ channel: "PUSH", status: started.delivery.status, idempotent: true }); continue; }
    if (!config) {
      finishNotificationDelivery(started.delivery.id, { status: "SKIPPED", errorMessage: "Push notifications are not configured" }, database);
      results.push({ channel: "PUSH", status: "SKIPPED" });
      continue;
    }
    try {
      const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await accessToken(config, fetchImpl, now)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: {
          token: device.token,
          notification: { title, body },
          data: { path: OPEN_PATH[device.app] },
          android: { priority: "HIGH", notification: { channel_id: "alerts" } },
        } }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        finishNotificationDelivery(started.delivery.id, { status: "SENT", providerMessageId: data.name }, database);
        results.push({ channel: "PUSH", status: "SENT" });
        continue;
      }
      const code = data?.error?.details?.find((detail) => detail.errorCode)?.errorCode || data?.error?.status;
      // The phone uninstalled the app or the token expired: never send to it again.
      if (code === "UNREGISTERED" || (response.status === 400 && code === "INVALID_ARGUMENT")) {
        database.prepare("UPDATE push_devices SET disabled_at = datetime('now') WHERE id = ?").run(device.id);
      }
      finishNotificationDelivery(started.delivery.id, { status: "FAILED", errorMessage: `FCM ${response.status} ${code || ""}`.trim() }, database);
      results.push({ channel: "PUSH", status: "FAILED" });
    } catch (err) {
      logger.error("Push notification failed", { error: err.message, eventType });
      finishNotificationDelivery(started.delivery.id, { status: "FAILED", errorMessage: err.message }, database);
      results.push({ channel: "PUSH", status: "FAILED" });
    }
  }
  return results;
}
