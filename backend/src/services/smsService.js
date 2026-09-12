import { beginNotificationDelivery, finishNotificationDelivery } from "./notificationLogService.js";

export function smsConfiguration() {
  return { enabled: process.env.SMS_NOTIFICATIONS_ENABLED === "true", configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_MESSAGING_SERVICE_SID), provider: "TWILIO" };
}
export async function sendSupplierSms({ to, text, eventKey, supplierId, metadata = {} }, { database, request = fetch } = {}) {
  const config = smsConfiguration();
  if (!config.enabled) return { success: false, skipped: true, status: "SKIPPED" };
  let phone = String(to || "").replace(/[\s()-]/g, "");
  if (/^\d{10}$/.test(phone)) phone = `+91${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return { success: false, status: "FAILED", error: "Invalid supplier phone number" };
  const started = beginNotificationDelivery({ eventKey, eventType: "BOOKING_CONFIRMED", channel: "SMS", recipientRole: "SUPPLIER", recipientId: supplierId, recipientAddress: phone, provider: "TWILIO", body: text, metadata }, database);
  if (started.idempotent) return { success: true, idempotent: true, status: started.delivery.status };
  try {
    if (!config.configured) throw new Error("Supplier SMS provider is not configured");
    const response = await request(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID, Body: text }),
    });
    const result = await response.json();
    if (!response.ok || !result.sid || ["failed", "undelivered"].includes(result.status)) throw new Error(`SMS provider rejected the message (${result.code || response.status})`);
    finishNotificationDelivery(started.delivery.id, { status: "SENT", providerMessageId: result.sid }, database);
    return { success: true, status: "SENT", providerMessageId: result.sid };
  } catch (error) {
    finishNotificationDelivery(started.delivery.id, { status: "FAILED", errorMessage: error.message }, database);
    return { success: false, status: "FAILED", error: error.message };
  }
}
