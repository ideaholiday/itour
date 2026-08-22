import { nanoid } from "nanoid";
import db from "../db.js";
import { beginNotificationDelivery, finishNotificationDelivery } from "./notificationLogService.js";
import logger from "../config/logger.js";

const enabled = () => String(process.env.WHATSAPP_CLOUD_API_ENABLED || "false").toLowerCase() === "true";

export function normalizeWhatsAppPhone(value, countryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91") {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `${String(countryCode).replace(/\D/g, "")}${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function whatsAppProviderConfiguration() {
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v22.0";
  const baseUrl = String(process.env.WHATSAPP_BASE_URL || "https://graph.facebook.com").replace(/\/$/, "");
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  return {
    provider: "WHATSAPP_CLOUD_API",
    enabled: enabled(),
    configured: Boolean(phoneNumberId && accessToken),
    apiVersion,
    baseUrl,
    phoneNumberId,
    timeoutMs: Math.max(1, Number(process.env.WHATSAPP_TIMEOUT || 15)) * 1000,
  };
}

export function whatsAppTemplate(name, values = []) {
  if (!String(name || "").trim()) return undefined;
  return {
    name: String(name).trim(),
    languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
    components: values.length ? [{
      type: "body",
      parameters: values.map((value) => ({ type: "text", text: String(value ?? "-").slice(0, 1024) })),
    }] : [],
  };
}

function writeLegacyWhatsAppLog({ to, recipientName, eventType, recipientRole, body, metadata }, result, database) {
  database.prepare(`
    INSERT INTO whatsapp_logs (
      id, booking_ref, recipient_phone, customer_name, driver_name, driver_phone,
      vehicle_number, maps_link, message_body, gateway_status, sent_at,
      provider, provider_message_id, error_message, event_type, recipient_role
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'WHATSAPP_CLOUD_API', ?, ?, ?, ?)
  `).run(
    `wa_${nanoid(12)}`, metadata?.bookingRef || eventType, `+${to}`, recipientName || recipientRole,
    metadata?.driverName || null, metadata?.driverPhone || null, metadata?.vehicleNumber || null,
    metadata?.mapsLink || null, body, result.status, result.providerMessageId || null,
    result.error || null, eventType, recipientRole,
  );
}

export async function sendWhatsAppMessage({
  to,
  recipientName,
  recipientRole = "TRAVELER",
  recipientId,
  eventType = "GENERAL",
  eventKey,
  text,
  template,
  metadata = {},
}, { fetchImpl = globalThis.fetch, database = db } = {}) {
  const phone = normalizeWhatsAppPhone(to);
  if (!phone) return { success: false, status: "FAILED", error: "A valid WhatsApp phone number is required" };
  if (!template?.name && (!String(text || "").trim() || String(text).length > 4096)) return { success: false, status: "FAILED", error: "WhatsApp text must contain 1 to 4096 characters" };

  const config = whatsAppProviderConfiguration();
  const bodyText = String(text || `Template: ${template?.name || "unknown"}`);
  const started = beginNotificationDelivery({
    eventKey, eventType, channel: "WHATSAPP", recipientRole, recipientId,
    recipientAddress: `+${phone}`, provider: config.provider, body: bodyText, metadata,
  }, database);
  if (started.idempotent) {
    return { success: true, idempotent: true, status: started.delivery.status, deliveryId: started.delivery.id, providerMessageId: started.delivery.provider_message_id, recipientPhone: `+${phone}`, gateway: config.provider };
  }

  if (!config.enabled || !config.configured) {
    const reason = !config.enabled ? "WhatsApp Cloud API is disabled" : "WhatsApp Cloud API credentials are incomplete";
    const delivery = finishNotificationDelivery(started.delivery.id, { status: "SKIPPED", errorMessage: reason }, database);
    const result = { success: false, skipped: true, status: "SKIPPED", deliveryId: delivery.id, recipientPhone: `+${phone}`, gateway: config.provider, error: reason };
    writeLegacyWhatsAppLog({ to: phone, recipientName, eventType, recipientRole, body: bodyText, metadata }, result, database);
    return result;
  }

  const payload = template?.name ? {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.languageCode || "en" },
      ...(template.components?.length ? { components: template.components } : {}),
    },
  } : {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "text",
    text: { preview_url: true, body: bodyText },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseBody?.error?.message || `WhatsApp API returned HTTP ${response.status}`);
    const providerMessageId = responseBody?.messages?.[0]?.id;
    const delivery = finishNotificationDelivery(started.delivery.id, { status: "SENT", providerMessageId }, database);
    const result = { success: true, status: "SENT", deliveryId: delivery.id, providerMessageId, recipientPhone: `+${phone}`, gateway: config.provider };
    writeLegacyWhatsAppLog({ to: phone, recipientName, eventType, recipientRole, body: bodyText, metadata }, result, database);
    return result;
  } catch (error) {
    const message = String(error?.name === "AbortError" ? "WhatsApp API request timed out" : error?.message || "WhatsApp API rejected the message").slice(0, 500);
    const delivery = finishNotificationDelivery(started.delivery.id, { status: "FAILED", errorMessage: message }, database);
    const result = { success: false, status: "FAILED", deliveryId: delivery.id, recipientPhone: `+${phone}`, gateway: config.provider, error: message };
    writeLegacyWhatsAppLog({ to: phone, recipientName, eventType, recipientRole, body: bodyText, metadata }, result, database);
    logger.error("WhatsApp Cloud API notification failed", { error: new Error(message) });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendWhatsAppVoucher({
  bookingRef, customerName, customerPhone, driverName, driverPhone, vehicleModel,
  vehicleNumber, pickupLocation, pickupTime, pickupLat, pickupLng,
}, options) {
  const mapsLink = pickupLat && pickupLng
    ? `https://maps.google.com/?q=${pickupLat},${pickupLng}`
    : pickupLocation ? `https://maps.google.com/?q=${encodeURIComponent(pickupLocation)}` : "https://ideaholiday.in/my-trips";
  const messageBody = `Idea Holiday booking ${bookingRef}\n\nHello ${customerName || "Traveler"}, your trip is confirmed.\nDriver: ${driverName || "To be assigned"}\nDriver phone: ${driverPhone || "To be shared"}\nVehicle: ${vehicleModel || "AC commercial vehicle"} (${vehicleNumber || "TBA"})\nPickup: ${pickupTime || "Time to be confirmed"}, ${pickupLocation || "Location to be confirmed"}\nMap: ${mapsLink}\n\nYour private pickup OTP is available in My Trips. Share it only after checking the driver and number plate.`;
  return sendWhatsAppMessage({
    to: customerPhone,
    recipientName: customerName,
    recipientRole: "TRAVELER",
    eventType: "BOOKING_VOUCHER",
    eventKey: `${bookingRef}:BOOKING_VOUCHER:${normalizeWhatsAppPhone(customerPhone)}:${vehicleNumber || "TBA"}`,
    text: messageBody,
    template: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_DRIVER_ASSIGNED, [
      bookingRef,
      driverName,
      driverPhone,
      vehicleModel,
      vehicleNumber,
      pickupTime,
      pickupLocation,
      `${String(process.env.PUBLIC_APP_URL || "https://ideaholiday.in").replace(/\/$/, "")}/bookings`,
    ]),
    metadata: { bookingRef, driverName, driverPhone, vehicleNumber, mapsLink },
  }, options);
}
