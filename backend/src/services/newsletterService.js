import crypto from "crypto";
import { nanoid } from "nanoid";
import db from "../db.js";
import { emailProviderConfiguration, sendEmail } from "./emailService.js";
import logger from "../config/logger.js";

const validEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val || "").trim());

function getSecret() {
  return process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || "idea-holiday-newsletter-secret-key-2026";
}

/**
 * Generate a secure, deterministic unsubscribe token for an email address.
 */
export function generateUnsubscribeToken(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return crypto
    .createHmac("sha256", getSecret())
    .update(normalized)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Verify if the provided token matches the email's HMAC token.
 */
export function verifyUnsubscribeToken(email, token) {
  if (!email || !token) return false;
  const expected = generateUnsubscribeToken(email);
  try {
    return crypto.timingSafeEqual(Buffer.from(token, "utf-8"), Buffer.from(expected, "utf-8"));
  } catch {
    return false;
  }
}

/**
 * Subscribe an email to Idea Holiday newsletter updates.
 */
export async function subscribeNewsletter({
  email,
  name,
  source = "FOOTER",
  ipAddress,
}, { fetchImpl = globalThis.fetch, database = db } = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim() || null;
  const cleanSource = String(source || "FOOTER").trim().toUpperCase();

  if (!validEmail(normalizedEmail)) {
    return { success: false, error: "A valid email address is required" };
  }

  const existing = database
    .prepare("SELECT * FROM newsletter_subscribers WHERE email = ?")
    .get(normalizedEmail);

  let subscriberId;
  let isNew = false;
  let reactivated = false;

  if (existing) {
    subscriberId = existing.id;
    if (existing.status === "ACTIVE") {
      return {
        success: true,
        alreadySubscribed: true,
        message: "You are already subscribed to Idea Holiday updates!",
        subscriber: existing,
      };
    }
    // Reactivate previous subscriber
    reactivated = true;
    database.prepare(`
      UPDATE newsletter_subscribers
      SET status = 'ACTIVE',
          name = COALESCE(?, name),
          source = COALESCE(?, source),
          subscribed_at = datetime('now'),
          unsubscribed_at = NULL,
          ip_address = COALESCE(?, ip_address)
      WHERE id = ?
    `).run(cleanName, cleanSource, ipAddress || null, subscriberId);
  } else {
    isNew = true;
    subscriberId = `sub_${nanoid(12)}`;
    database.prepare(`
      INSERT INTO newsletter_subscribers (
        id, email, name, source, status, subscribed_at, ip_address
      ) VALUES (?, ?, ?, ?, 'ACTIVE', datetime('now'), ?)
    `).run(subscriberId, normalizedEmail, cleanName, cleanSource, ipAddress || null);
  }

  // 1. Sync contact with Brevo Contacts API if configured
  const emailConfig = emailProviderConfiguration();
  let brevoContactId = null;

  if (emailConfig.brevoApiKey) {
    try {
      const listId = process.env.BREVO_NEWSLETTER_LIST_ID ? Number(process.env.BREVO_NEWSLETTER_LIST_ID) : null;
      const listIds = listId && !Number.isNaN(listId) ? [listId] : [];

      const names = (cleanName || "").split(" ");
      const firstName = names[0] || "";
      const lastName = names.slice(1).join(" ") || "";

      const contactPayload = {
        email: normalizedEmail,
        updateEnabled: true,
      };

      if (listIds.length > 0) {
        contactPayload.listIds = listIds;
      }

      if (firstName || cleanSource) {
        contactPayload.attributes = {};
        if (firstName) contactPayload.attributes.FNAME = firstName;
        if (lastName) contactPayload.attributes.LNAME = lastName;
        if (cleanSource) contactPayload.attributes.SOURCE = cleanSource;
      }

      const res = await fetchImpl("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "api-key": emailConfig.brevoApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(contactPayload),
      });

      if (res.ok || res.status === 201 || res.status === 204) {
        const body = await res.json().catch(() => ({}));
        if (body && body.id) {
          brevoContactId = String(body.id);
          database.prepare("UPDATE newsletter_subscribers SET brevo_contact_id = ? WHERE id = ?").run(brevoContactId, subscriberId);
        }
      }
    } catch (syncErr) {
      logger.warn("Brevo contact sync skipped/failed", { error: syncErr.message, email: normalizedEmail });
    }
  }

  // 2. Dispatch Welcome Email
  const unsubToken = generateUnsubscribeToken(normalizedEmail);
  const baseUrl = process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "https://ideaholiday.com";
  const unsubUrl = `${baseUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(normalizedEmail)}&token=${unsubToken}`;

  const welcomeSubject = "Welcome to Idea Holiday! 🌟 Your Next Adventure Awaits";
  const welcomeText = `Hello ${cleanName || "Traveler"},\n\n`
    + `Thank you for subscribing to Idea Holiday updates!\n\n`
    + `You will be the first to know about:\n`
    + `• Handpicked hidden gems & cultural experiences across India\n`
    + `• Exclusive seasonal discounts & secret promoter vouchers\n`
    + `• Verified airport transfer tips & holiday itineraries\n\n`
    + `Explore trending experiences: ${baseUrl}/search\n\n`
    + `Travel More with Idea Holiday.\n\n`
    + `If you did not sign up or wish to stop receiving updates, you can unsubscribe anytime: ${unsubUrl}`;

  const welcomeHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#B45309 0%,#D97706 100%);padding:32px 24px;text-align:center;color:#ffffff;">
        <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;letter-spacing:-0.02em;">Idea Holiday</h1>
        <p style="margin:0;font-size:14px;opacity:0.95;font-weight:500;">Travel More with idea Holiday</p>
      </div>
      <div style="padding:32px 24px;color:#292524;line-height:1.6;">
        <h2 style="font-size:20px;color:#1c1917;margin-top:0;margin-bottom:16px;">Welcome aboard${cleanName ? `, ${cleanName}` : ""}! 🎉</h2>
        <p style="font-size:15px;color:#44403c;margin-bottom:20px;">
          Thank you for joining our community of passionate travelers. You're now on the insider list for thoughtfully curated experiences and authentic local adventures across India.
        </p>
        <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <h3 style="margin:0 0 10px;font-size:14px;color:#92400E;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">What you will receive:</h3>
          <ul style="margin:0;padding-left:20px;color:#78350F;font-size:14px;line-height:1.8;">
            <li>Exclusive subscriber-only discounts & seasonal promo codes</li>
            <li>Curated weekend getaways & multi-day holiday circuits</li>
            <li>KYB-verified local guides and private transfer tips</li>
          </ul>
        </div>
        <div style="text-align:center;margin:28px 0;">
          <a href="${baseUrl}/search" style="display:inline-block;background:#B45309;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;box-shadow:0 2px 4px rgba(180,83,9,0.2);">
            Explore Handpicked Tours
          </a>
        </div>
        <p style="font-size:13px;color:#78716c;margin-top:28px;border-top:1px solid #f5f5f4;padding-top:16px;">
          Have questions or need help planning your trip? Reply directly to this email or reach us at <a href="mailto:info@ideaholiday.com" style="color:#B45309;">info@ideaholiday.com</a>.
        </p>
      </div>
      <div style="background:#F5F3ED;padding:16px 24px;text-align:center;font-size:12px;color:#78716c;border-top:1px solid #e7e5e4;">
        <p style="margin:0 0 6px;">© 2026 Idea Holiday Private Limited. All rights reserved.</p>
        <p style="margin:0;"><a href="${unsubUrl}" style="color:#a8a29e;text-decoration:underline;">Unsubscribe from updates</a></p>
      </div>
    </div>
  `;

  try {
    await sendEmail({
      to: normalizedEmail,
      recipientName: cleanName || "Traveler",
      recipientRole: "TRAVELER",
      eventType: "NEWSLETTER_WELCOME",
      eventKey: `newsletter:welcome:${subscriberId}`,
      subject: welcomeSubject,
      text: welcomeText,
      html: welcomeHtml,
    }, { database, fetchImpl });
  } catch (err) {
    logger.warn("Welcome email delivery skipped/failed", { error: err.message, email: normalizedEmail });
  }

  const updated = database
    .prepare("SELECT * FROM newsletter_subscribers WHERE id = ?")
    .get(subscriberId);

  return {
    success: true,
    isNew,
    reactivated,
    message: "Thank you for subscribing! Check your inbox for travel inspiration.",
    subscriber: updated,
  };
}

/**
 * Unsubscribe a user using their email and verified HMAC token.
 */
export async function unsubscribeNewsletter({
  email,
  token,
}, { database = db } = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !token) {
    return { success: false, error: "Email and valid token are required to unsubscribe" };
  }

  if (!verifyUnsubscribeToken(normalizedEmail, token)) {
    return { success: false, error: "Invalid or expired unsubscribe link" };
  }

  const subscriber = database
    .prepare("SELECT * FROM newsletter_subscribers WHERE email = ?")
    .get(normalizedEmail);

  if (!subscriber) {
    return { success: false, error: "Subscriber not found" };
  }

  if (subscriber.status === "UNSUBSCRIBED") {
    return { success: true, message: "You are already unsubscribed from Idea Holiday updates." };
  }

  database.prepare(`
    UPDATE newsletter_subscribers
    SET status = 'UNSUBSCRIBED',
        unsubscribed_at = datetime('now')
    WHERE email = ?
  `).run(normalizedEmail);

  return {
    success: true,
    message: "You have been successfully unsubscribed from Idea Holiday updates.",
  };
}

/**
 * Retrieve subscriber analytics and stats for admin dashboard.
 */
export function getSubscriberStats({ database = db } = {}) {
  const total = database.prepare("SELECT COUNT(*) as count FROM newsletter_subscribers").get()?.count || 0;
  const active = database.prepare("SELECT COUNT(*) as count FROM newsletter_subscribers WHERE status = 'ACTIVE'").get()?.count || 0;
  const unsubscribed = database.prepare("SELECT COUNT(*) as count FROM newsletter_subscribers WHERE status = 'UNSUBSCRIBED'").get()?.count || 0;

  const sourceBreakdown = database.prepare(`
    SELECT source, COUNT(*) as count
    FROM newsletter_subscribers
    GROUP BY source
    ORDER BY count DESC
  `).all() || [];

  const recentSubscribers = database.prepare(`
    SELECT id, email, name, source, status, subscribed_at, unsubscribed_at
    FROM newsletter_subscribers
    ORDER BY subscribed_at DESC
    LIMIT 20
  `).all() || [];

  return {
    total,
    active,
    unsubscribed,
    sourceBreakdown,
    recentSubscribers,
  };
}
