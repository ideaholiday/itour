import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { nanoid } from "nanoid";
import db from "../db.js";
import { beginNotificationDelivery, finishNotificationDelivery } from "./notificationLogService.js";
import logger from "../config/logger.js";

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const enabled = () => String(process.env.EMAIL_NOTIFICATIONS_ENABLED || "false").toLowerCase() === "true";

export function emailProviderConfiguration() {
  const region = process.env.SES_REGION || process.env.AWS_REGION || "ap-south-1";
  const fromEmail = process.env.SES_FROM_EMAIL || process.env.EMAIL_FROM || "no-reply@ideaholiday.in";
  return {
    provider: "AMAZON_SES",
    enabled: enabled(),
    configured: Boolean(region && fromEmail),
    region,
    fromEmail,
  };
}

function plainTextToHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll("\n", "<br />");
}

function writeLegacyEmailLog({ to, recipientName, subject, text, eventType, recipientRole }, result, database) {
  database.prepare(`
    INSERT INTO email_logs (
      id, recipient_email, recipient_name, subject, body, status, sent_at,
      provider, provider_message_id, error_message, event_type, recipient_role
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'AMAZON_SES', ?, ?, ?, ?)
  `).run(
    `eml_${nanoid(12)}`, to, recipientName || null, subject, text,
    result.status, result.providerMessageId || null, result.error || null, eventType, recipientRole,
  );
}

export async function sendEmail({
  to,
  recipientName,
  recipientRole = "TRAVELER",
  recipientId,
  eventType = "GENERAL",
  eventKey,
  subject,
  text,
  html,
  metadata,
}, { client, database = db } = {}) {
  const address = String(to || "").trim().toLowerCase();
  if (!validEmail(address)) return { success: false, status: "FAILED", error: "A valid recipient email is required" };
  if (!String(subject || "").trim() || !String(text || "").trim()) return { success: false, status: "FAILED", error: "Email subject and body are required" };

  const config = emailProviderConfiguration();
  const started = beginNotificationDelivery({
    eventKey, eventType, channel: "EMAIL", recipientRole, recipientId,
    recipientAddress: address, provider: config.provider, subject, body: text, metadata,
  }, database);
  if (started.idempotent) {
    return { success: true, idempotent: true, status: started.delivery.status, deliveryId: started.delivery.id, providerMessageId: started.delivery.provider_message_id };
  }

  if (!config.enabled) {
    const delivery = finishNotificationDelivery(started.delivery.id, { status: "SKIPPED", errorMessage: "Email notifications are disabled" }, database);
    const result = { success: false, skipped: true, status: "SKIPPED", deliveryId: delivery.id, error: "Email notifications are disabled" };
    writeLegacyEmailLog({ to: address, recipientName, subject, text, eventType, recipientRole }, result, database);
    return result;
  }

  try {
    const ses = client || new SESv2Client({ region: config.region });
    const response = await ses.send(new SendEmailCommand({
      FromEmailAddress: config.fromEmail,
      ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
      EmailTags: [
        { Name: "event_type", Value: String(eventType).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) },
        { Name: "recipient_role", Value: String(recipientRole).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) },
      ],
      Destination: { ToAddresses: [address] },
      ReplyToAddresses: process.env.SES_REPLY_TO_EMAIL ? [process.env.SES_REPLY_TO_EMAIL] : undefined,
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: text, Charset: "UTF-8" },
            Html: { Data: html || plainTextToHtml(text), Charset: "UTF-8" },
          },
        },
      },
    }));
    const delivery = finishNotificationDelivery(started.delivery.id, { status: "SENT", providerMessageId: response.MessageId }, database);
    const result = { success: true, status: "SENT", deliveryId: delivery.id, providerMessageId: response.MessageId };
    writeLegacyEmailLog({ to: address, recipientName, subject, text, eventType, recipientRole }, result, database);
    return result;
  } catch (error) {
    const message = String(error?.message || "Amazon SES rejected the message").slice(0, 500);
    const delivery = finishNotificationDelivery(started.delivery.id, { status: "FAILED", errorMessage: message }, database);
    const result = { success: false, status: "FAILED", deliveryId: delivery.id, error: message };
    writeLegacyEmailLog({ to: address, recipientName, subject, text, eventType, recipientRole }, result, database);
    logger.error("Amazon SES notification failed", { error: new Error(message) });
    return result;
  }
}

export async function sendSupplierNotification({ supplierEmail, supplierName, action, reason = "", details = {} }) {
  const templates = {
    APPROVED: {
      subject: "Your Idea Holiday supplier account is approved",
      text: `Dear ${supplierName},\n\nYour business verification is approved. You can now publish products and accept bookings.\n\nPlatform commission: ${details.commissionRate || 15}%\n\nIdea Holiday Operations`,
    },
    REJECTED: {
      subject: "Action required on your Idea Holiday supplier account",
      text: `Dear ${supplierName},\n\nYour verification needs an update.\n\nReason: ${reason || "Please review your submitted business documents."}\n\nSign in to update the requested information.\n\nIdea Holiday Compliance`,
    },
    SUSPENDED: {
      subject: "Your Idea Holiday supplier account is suspended",
      text: `Dear ${supplierName},\n\nYour supplier account is temporarily suspended.\n\nReason: ${reason || "Compliance review in progress."}\n\nPlease contact admin@ideaholiday.in.\n\nIdea Holiday Operations`,
    },
  };
  const template = templates[action];
  if (!template) return { success: false, status: "FAILED", error: "Unsupported supplier notification action" };
  return sendEmail({
    to: supplierEmail,
    recipientName: supplierName,
    recipientRole: "SUPPLIER",
    eventType: `SUPPLIER_${action}`,
    eventKey: `supplier:${supplierEmail}:${action}:${Date.now()}`,
    ...template,
  });
}
