import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { nanoid } from "nanoid";
import db from "../db.js";
import { beginNotificationDelivery, finishNotificationDelivery } from "./notificationLogService.js";
import logger from "../config/logger.js";

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const enabled = () => String(process.env.EMAIL_NOTIFICATIONS_ENABLED || "true").toLowerCase() === "true";

export function emailProviderConfiguration() {
  const brevoApiKey = process.env.BREVO_API_KEY || "";
  const provider = (process.env.EMAIL_PROVIDER || (brevoApiKey ? "BREVO" : "AMAZON_SES")).toUpperCase();
  const region = process.env.SES_REGION || process.env.AWS_REGION || "ap-south-1";
  const fromEmail = process.env.BREVO_SENDER_EMAIL || process.env.SES_FROM_EMAIL || process.env.EMAIL_FROM || "info@ideaholiday.com";
  const senderName = process.env.BREVO_SENDER_NAME || process.env.EMAIL_SENDER_NAME || "Idea Holiday";

  const isConfigured = provider === "BREVO"
    ? Boolean(brevoApiKey && fromEmail)
    : Boolean(region && fromEmail);

  return {
    provider,
    enabled: enabled(),
    configured: isConfigured,
    brevoApiKey,
    senderName,
    region,
    fromEmail,
  };
}

export function plainTextToHtml(text) {
  const safeText = String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br />");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF9F6; margin: 0; padding: 20px; color: #1c1917; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e7e5e4; }
    .header { background: #1c1917; padding: 28px 24px; text-align: center; }
    .logo { color: #f59e0b; font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
    .subhead { color: #a8a29e; font-size: 11px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1.5px; }
    .content { padding: 32px 28px; line-height: 1.6; font-size: 14px; color: #292524; }
    .footer { background: #f5f5f4; padding: 20px 24px; text-align: center; font-size: 11px; color: #78716c; border-top: 1px solid #e7e5e4; }
    .btn { display: inline-block; background: #f59e0b; color: #1c1917; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Idea Holiday</div>
      <div class="subhead">Curated Journeys Across India</div>
    </div>
    <div class="content">
      ${safeText}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Idea Holiday Private Limited. All rights reserved.</p>
      <p>For 24/7 travel concierge assistance, reach out at info@ideaholiday.com or +91 9219999214</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function writeLegacyEmailLog({ to, recipientName, subject, text, eventType, recipientRole, provider }, result, database) {
  try {
    database.prepare(`
      INSERT INTO email_logs (
        id, recipient_email, recipient_name, subject, body, status, sent_at,
        provider, provider_message_id, error_message, event_type, recipient_role
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
    `).run(
      `eml_${nanoid(12)}`,
      to,
      recipientName || null,
      subject,
      text,
      result.status,
      provider || "BREVO",
      result.providerMessageId || null,
      result.error || null,
      eventType,
      recipientRole,
    );
  } catch (err) {
    logger.error("Failed to write legacy email log", { error: err.message });
  }
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
}, { client, database = db, fetchImpl = globalThis.fetch } = {}) {
  const address = String(to || "").trim().toLowerCase();
  if (!validEmail(address)) return { success: false, status: "FAILED", error: "A valid recipient email is required" };
  if (!String(subject || "").trim() || !String(text || "").trim()) return { success: false, status: "FAILED", error: "Email subject and body are required" };

  const config = emailProviderConfiguration();
  const started = beginNotificationDelivery({
    eventKey, eventType, channel: "EMAIL", recipientRole, recipientId,
    recipientAddress: address, provider: client ? "AMAZON_SES" : config.provider, subject, body: text, metadata,
  }, database);

  if (started.idempotent) {
    return {
      success: true,
      idempotent: true,
      status: started.delivery.status,
      deliveryId: started.delivery.id,
      providerMessageId: started.delivery.provider_message_id,
    };
  }

  if (!config.enabled) {
    const delivery = finishNotificationDelivery(started.delivery.id, { status: "SKIPPED", errorMessage: "Email notifications are disabled" }, database);
    const result = { success: false, skipped: true, status: "SKIPPED", deliveryId: delivery.id, error: "Email notifications are disabled" };
    writeLegacyEmailLog({ to: address, recipientName, subject, text, eventType, recipientRole, provider: client ? "AMAZON_SES" : config.provider }, result, database);
    return result;
  }

  // --- BREVO (formerly Sendinblue) HTTP API ---
  if (!client && config.provider === "BREVO" && config.brevoApiKey) {
    try {
      const response = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": config.brevoApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: config.senderName,
            email: config.fromEmail,
          },
          to: [
            {
              email: address,
              name: recipientName || address.split("@")[0],
            },
          ],
          subject,
          htmlContent: html || plainTextToHtml(text),
          textContent: text,
          tags: [
            String(eventType).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 50),
            String(recipientRole).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 50),
          ],
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.message || `Brevo API returned status ${response.status}`;
        throw new Error(errorMsg);
      }

      const messageId = data?.messageId || `brevo_${nanoid(16)}`;
      const delivery = finishNotificationDelivery(started.delivery.id, { status: "SENT", providerMessageId: messageId }, database);
      const result = { success: true, status: "SENT", deliveryId: delivery.id, providerMessageId: messageId };
      writeLegacyEmailLog({ to: address, recipientName, subject, text, eventType, recipientRole, provider: "BREVO" }, result, database);
      return result;
    } catch (error) {
      const message = String(error?.message || "Brevo rejected the message").slice(0, 500);
      const delivery = finishNotificationDelivery(started.delivery.id, { status: "FAILED", errorMessage: message }, database);
      const result = { success: false, status: "FAILED", deliveryId: delivery.id, error: message };
      writeLegacyEmailLog({ to: address, recipientName, subject, text, eventType, recipientRole, provider: "BREVO" }, result, database);
      logger.error("Brevo email notification failed", { error: new Error(message) });
      return result;
    }
  }

  // --- AMAZON SES FALLBACK ---
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
    writeLegacyEmailLog({ to: address, recipientName, subject, text, eventType, recipientRole, provider: "AMAZON_SES" }, result, database);
    return result;
  } catch (error) {
    const message = String(error?.message || "Amazon SES rejected the message").slice(0, 500);
    const delivery = finishNotificationDelivery(started.delivery.id, { status: "FAILED", errorMessage: message }, database);
    const result = { success: false, status: "FAILED", deliveryId: delivery.id, error: message };
    writeLegacyEmailLog({ to: address, recipientName, subject, text, eventType, recipientRole, provider: "AMAZON_SES" }, result, database);
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
