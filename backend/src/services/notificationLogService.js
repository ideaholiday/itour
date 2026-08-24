import { nanoid } from "nanoid";
import db from "../db.js";

export function beginNotificationDelivery({
  eventKey,
  eventType,
  channel,
  recipientRole,
  recipientId,
  recipientAddress,
  provider,
  subject,
  body,
  metadata = {},
}, database = db) {
  if (eventKey) {
    const existing = database.prepare("SELECT * FROM notification_deliveries WHERE event_key = ?").get(eventKey);
    if (existing?.status === "SENT" || existing?.status === "DELIVERED") return { idempotent: true, delivery: existing };
  }
  const id = `ntf_${nanoid(14)}`;
  database.prepare(`
    INSERT INTO notification_deliveries (
      id, event_key, event_type, channel, recipient_role, recipient_id, recipient_address,
      provider, status, subject, body, metadata, booking_id, booking_ref, attempt_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(event_key) DO UPDATE SET
      status = 'QUEUED', error_message = NULL, provider_message_id = NULL,
      subject = excluded.subject, body = excluded.body, metadata = excluded.metadata,
      booking_id = excluded.booking_id, booking_ref = excluded.booking_ref,
      attempt_count = notification_deliveries.attempt_count + 1, updated_at = datetime('now')
  `).run(
    id, eventKey || null, eventType, channel, recipientRole, recipientId || null,
    recipientAddress, provider, subject || null, body, JSON.stringify(metadata || {}), metadata?.bookingId || null, metadata?.bookingRef || null,
  );
  const delivery = eventKey
    ? database.prepare("SELECT * FROM notification_deliveries WHERE event_key = ?").get(eventKey)
    : database.prepare("SELECT * FROM notification_deliveries WHERE id = ?").get(id);
  return { idempotent: false, delivery };
}

export function finishNotificationDelivery(id, { status, providerMessageId, errorMessage }, database = db) {
  const isDelivered = status === "SENT" || status === "DELIVERED";
  if (isDelivered) {
    database.prepare(`
      UPDATE notification_deliveries
      SET status = ?, provider_message_id = ?, error_message = ?,
          sent_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(status, providerMessageId || null, errorMessage || null, id);
  } else {
    database.prepare(`
      UPDATE notification_deliveries
      SET status = ?, provider_message_id = ?, error_message = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(status, providerMessageId || null, errorMessage || null, id);
  }
  return database.prepare("SELECT * FROM notification_deliveries WHERE id = ?").get(id);
}

export function updateProviderDeliveryStatus(providerMessageId, status, errorMessage = null, database = db) {
  const isDelivered = status === "SENT" || status === "DELIVERED" || status === "READ";
  if (isDelivered) {
    database.prepare(`
      UPDATE notification_deliveries SET status = ?, error_message = COALESCE(?, error_message), updated_at = datetime('now'),
        sent_at = COALESCE(sent_at, datetime('now'))
      WHERE provider_message_id = ?
    `).run(status, errorMessage, providerMessageId);
  } else {
    database.prepare(`
      UPDATE notification_deliveries SET status = ?, error_message = COALESCE(?, error_message), updated_at = datetime('now')
      WHERE provider_message_id = ?
    `).run(status, errorMessage, providerMessageId);
  }
  database.prepare(`
    UPDATE whatsapp_logs SET gateway_status = ?, error_message = COALESCE(?, error_message) WHERE provider_message_id = ?
  `).run(status, errorMessage, providerMessageId);
}
