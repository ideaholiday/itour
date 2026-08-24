import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  subscribeNewsletter,
  unsubscribeNewsletter,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  getSubscriberStats,
} from "../src/services/newsletterService.js";

function createTestDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      source TEXT DEFAULT 'FOOTER',
      status TEXT DEFAULT 'ACTIVE',
      brevo_contact_id TEXT,
      subscribed_at TEXT DEFAULT (datetime('now')),
      unsubscribed_at TEXT,
      ip_address TEXT
    );
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      event_key TEXT UNIQUE,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient_role TEXT NOT NULL,
      recipient_id TEXT,
      recipient_address TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_message_id TEXT,
      status TEXT DEFAULT 'QUEUED',
      subject TEXT,
      body TEXT,
      error_message TEXT,
      metadata TEXT DEFAULT '{}',
      booking_id TEXT,
      booking_ref TEXT,
      attempt_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      sent_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      recipient_email TEXT,
      recipient_name TEXT,
      subject TEXT,
      body TEXT,
      status TEXT,
      sent_at TEXT,
      provider TEXT,
      provider_message_id TEXT,
      error_message TEXT,
      event_type TEXT,
      recipient_role TEXT
    );
  `);
  return database;
}

test("NewsletterService: subscribes a new valid email and writes database record", async () => {
  const database = createTestDatabase();
  let emailSent = false;
  const mockFetch = async () => {
    emailSent = true;
    return { ok: true, json: async () => ({ messageId: "msg_welcome_123" }) };
  };

  const result = await subscribeNewsletter({
    email: "Traveler.New@Example.Com",
    name: "Aarav Sharma",
    source: "FOOTER",
    ipAddress: "192.168.1.1",
  }, { database, fetchImpl: mockFetch });

  assert.equal(result.success, true);
  assert.equal(result.isNew, true);
  assert.ok(result.subscriber);
  assert.equal(result.subscriber.email, "traveler.new@example.com");
  assert.equal(result.subscriber.name, "Aarav Sharma");
  assert.equal(result.subscriber.source, "FOOTER");
  assert.equal(result.subscriber.status, "ACTIVE");

  const row = database.prepare("SELECT * FROM newsletter_subscribers WHERE email = ?").get("traveler.new@example.com");
  assert.ok(row);
  assert.equal(row.name, "Aarav Sharma");
  assert.equal(row.status, "ACTIVE");

  database.close();
});

test("NewsletterService: rejects invalid email formats", async () => {
  const database = createTestDatabase();
  const result = await subscribeNewsletter({
    email: "not-an-email",
    name: "Bad Input",
  }, { database });

  assert.equal(result.success, false);
  assert.match(result.error, /valid email/i);
  database.close();
});

test("NewsletterService: handles duplicate active subscription idempotently", async () => {
  const database = createTestDatabase();
  const mockFetch = async () => ({ ok: true, json: async () => ({}) });

  await subscribeNewsletter({ email: "repeat@example.com", name: "Repeat User" }, { database, fetchImpl: mockFetch });
  const second = await subscribeNewsletter({ email: "repeat@example.com" }, { database, fetchImpl: mockFetch });

  assert.equal(second.success, true);
  assert.equal(second.alreadySubscribed, true);
  assert.match(second.message, /already subscribed/i);

  const count = database.prepare("SELECT COUNT(*) as count FROM newsletter_subscribers WHERE email = ?").get("repeat@example.com").count;
  assert.equal(count, 1);
  database.close();
});

test("NewsletterService: reactivates a previously unsubscribed user", async () => {
  const database = createTestDatabase();
  const mockFetch = async () => ({ ok: true, json: async () => ({}) });

  // 1. Initial subscription
  await subscribeNewsletter({ email: "rejoin@example.com", name: "Rejoining Member" }, { database, fetchImpl: mockFetch });
  
  // 2. Unsubscribe
  const token = generateUnsubscribeToken("rejoin@example.com");
  await unsubscribeNewsletter({ email: "rejoin@example.com", token }, { database });

  const unsubRow = database.prepare("SELECT status FROM newsletter_subscribers WHERE email = ?").get("rejoin@example.com");
  assert.equal(unsubRow.status, "UNSUBSCRIBED");

  // 3. Resubscribe
  const resubResult = await subscribeNewsletter({
    email: "rejoin@example.com",
    name: "Rejoining Member",
    source: "HOME_CTA",
  }, { database, fetchImpl: mockFetch });

  assert.equal(resubResult.success, true);
  assert.equal(resubResult.reactivated, true);

  const activeRow = database.prepare("SELECT * FROM newsletter_subscribers WHERE email = ?").get("rejoin@example.com");
  assert.equal(activeRow.status, "ACTIVE");
  assert.equal(activeRow.unsubscribed_at, null);
  assert.equal(activeRow.source, "HOME_CTA");

  database.close();
});

test("NewsletterService: syncs contact to Brevo contacts API when key is configured", async () => {
  const database = createTestDatabase();
  const prevKey = process.env.BREVO_API_KEY;
  const prevListId = process.env.BREVO_NEWSLETTER_LIST_ID;
  process.env.BREVO_API_KEY = "test-brevo-key-123";
  process.env.BREVO_NEWSLETTER_LIST_ID = "5";

  let capturedBrevoBody;
  let capturedHeaders;
  const mockFetch = async (url, options) => {
    if (url.includes("/v3/contacts")) {
      capturedHeaders = options.headers;
      capturedBrevoBody = JSON.parse(options.body);
      return { ok: true, status: 201, json: async () => ({ id: 42981 }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  const result = await subscribeNewsletter({
    email: "brevo.user@example.com",
    name: "Meera Nair",
    source: "CHECKOUT",
  }, { database, fetchImpl: mockFetch });

  assert.equal(result.success, true);
  assert.equal(capturedHeaders["api-key"], "test-brevo-key-123");
  assert.equal(capturedBrevoBody.email, "brevo.user@example.com");
  assert.deepEqual(capturedBrevoBody.listIds, [5]);
  assert.equal(capturedBrevoBody.attributes.FNAME, "Meera");
  assert.equal(capturedBrevoBody.attributes.LNAME, "Nair");
  assert.equal(capturedBrevoBody.attributes.SOURCE, "CHECKOUT");

  const row = database.prepare("SELECT brevo_contact_id FROM newsletter_subscribers WHERE email = ?").get("brevo.user@example.com");
  assert.equal(row.brevo_contact_id, "42981");

  process.env.BREVO_API_KEY = prevKey;
  process.env.BREVO_NEWSLETTER_LIST_ID = prevListId;
  database.close();
});

test("NewsletterService: generates and verifies HMAC unsubscribe tokens securely", () => {
  const email = "subscriber@example.com";
  const token = generateUnsubscribeToken(email);

  assert.ok(token);
  assert.equal(typeof token, "string");
  assert.equal(verifyUnsubscribeToken(email, token), true);
  assert.equal(verifyUnsubscribeToken("other@example.com", token), false);
  assert.equal(verifyUnsubscribeToken(email, "invalid-token"), false);
  assert.equal(verifyUnsubscribeToken(null, token), false);
});

test("NewsletterService: unsubscribes an active subscriber with valid token", async () => {
  const database = createTestDatabase();
  const mockFetch = async () => ({ ok: true, json: async () => ({}) });

  await subscribeNewsletter({ email: "leave@example.com" }, { database, fetchImpl: mockFetch });
  const token = generateUnsubscribeToken("leave@example.com");

  const result = await unsubscribeNewsletter({ email: "leave@example.com", token }, { database });
  assert.equal(result.success, true);

  const row = database.prepare("SELECT * FROM newsletter_subscribers WHERE email = ?").get("leave@example.com");
  assert.equal(row.status, "UNSUBSCRIBED");
  assert.ok(row.unsubscribed_at);

  database.close();
});

test("NewsletterService: getSubscriberStats returns accurate counts and breakdowns", async () => {
  const database = createTestDatabase();
  const mockFetch = async () => ({ ok: true, json: async () => ({}) });

  await subscribeNewsletter({ email: "s1@example.com", source: "FOOTER" }, { database, fetchImpl: mockFetch });
  await subscribeNewsletter({ email: "s2@example.com", source: "FOOTER" }, { database, fetchImpl: mockFetch });
  await subscribeNewsletter({ email: "s3@example.com", source: "HOME_CTA" }, { database, fetchImpl: mockFetch });
  await subscribeNewsletter({ email: "s4@example.com", source: "CHECKOUT" }, { database, fetchImpl: mockFetch });

  const token = generateUnsubscribeToken("s4@example.com");
  await unsubscribeNewsletter({ email: "s4@example.com", token }, { database });

  const stats = getSubscriberStats({ database });

  assert.equal(stats.total, 4);
  assert.equal(stats.active, 3);
  assert.equal(stats.unsubscribed, 1);
  assert.equal(stats.sourceBreakdown.length >= 3, true);
  assert.equal(stats.recentSubscribers.length, 4);

  database.close();
});
