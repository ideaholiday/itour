import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { sendEmail } from "../src/services/emailService.js";
import { normalizeWhatsAppPhone, sendWhatsAppMessage } from "../src/services/whatsappService.js";

const restoreEnv = (name, value) => value === undefined ? delete process.env[name] : process.env[name] = value;

function notificationDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE notification_deliveries (
      id TEXT PRIMARY KEY, event_key TEXT UNIQUE, event_type TEXT, channel TEXT,
      recipient_role TEXT, recipient_id TEXT, recipient_address TEXT, provider TEXT,
      provider_message_id TEXT, status TEXT, subject TEXT, body TEXT, error_message TEXT,
      metadata TEXT, booking_id TEXT, booking_ref TEXT, attempt_count INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
      sent_at TEXT, updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE email_logs (
      id TEXT PRIMARY KEY, recipient_email TEXT, recipient_name TEXT, subject TEXT, body TEXT,
      status TEXT, sent_at TEXT, provider TEXT, provider_message_id TEXT, error_message TEXT,
      event_type TEXT, recipient_role TEXT
    );
    CREATE TABLE whatsapp_logs (
      id TEXT PRIMARY KEY, booking_ref TEXT, recipient_phone TEXT, customer_name TEXT,
      driver_name TEXT, driver_phone TEXT, vehicle_number TEXT, maps_link TEXT,
      message_body TEXT, gateway_status TEXT, sent_at TEXT, provider TEXT,
      provider_message_id TEXT, error_message TEXT, event_type TEXT, recipient_role TEXT
    );
  `);
  return database;
}

test("Amazon SES sends through the provider and records the message id", async () => {
  const previous = process.env.EMAIL_NOTIFICATIONS_ENABLED;
  process.env.EMAIL_NOTIFICATIONS_ENABLED = "true";
  const database = notificationDatabase();
  let commandInput;
  const client = { send: async (command) => { commandInput = command.input; return { MessageId: "ses-message-1" }; } };
  const result = await sendEmail({
    to: "traveler@example.com", recipientName: "Traveler", recipientRole: "TRAVELER",
    eventType: "TEST", eventKey: "test:email:1", subject: "Provider test", text: "Email connected",
  }, { client, database });
  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, "ses-message-1");
  assert.equal(commandInput.Destination.ToAddresses[0], "traveler@example.com");
  assert.equal(database.prepare("SELECT status FROM notification_deliveries").get().status, "SENT");
  database.close();
  restoreEnv("EMAIL_NOTIFICATIONS_ENABLED", previous);
});

test("WhatsApp Cloud API normalizes Indian phones and records accepted messages", async () => {
  const previous = {
    enabled: process.env.WHATSAPP_CLOUD_API_ENABLED,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    token: process.env.WHATSAPP_ACCESS_TOKEN,
  };
  process.env.WHATSAPP_CLOUD_API_ENABLED = "true";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  const database = notificationDatabase();
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.1" }] }) };
  };
  const result = await sendWhatsAppMessage({
    to: "9876500001", recipientName: "Traveler", recipientRole: "TRAVELER",
    eventType: "TEST", eventKey: "test:whatsapp:1", text: "WhatsApp connected",
  }, { fetchImpl, database });
  assert.equal(normalizeWhatsAppPhone("+91 98765 00001"), "919876500001");
  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, "wamid.1");
  assert.match(request.url, /phone-id\/messages$/);
  assert.equal(JSON.parse(request.options.body).to, "919876500001");
  assert.equal(database.prepare("SELECT gateway_status FROM whatsapp_logs").get().gateway_status, "SENT");
  database.close();
  restoreEnv("WHATSAPP_CLOUD_API_ENABLED", previous.enabled);
  restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previous.phoneId);
  restoreEnv("WHATSAPP_ACCESS_TOKEN", previous.token);
});

test("duplicate successful event keys are idempotent", async () => {
  const previous = process.env.EMAIL_NOTIFICATIONS_ENABLED;
  process.env.EMAIL_NOTIFICATIONS_ENABLED = "true";
  const database = notificationDatabase();
  let calls = 0;
  const client = { send: async () => { calls += 1; return { MessageId: "ses-idempotent" }; } };
  const input = { to: "ops@example.com", recipientRole: "STAFF", eventType: "TEST", eventKey: "same-event", subject: "Test", text: "One send" };
  await sendEmail(input, { client, database });
  const second = await sendEmail(input, { client, database });
  assert.equal(second.idempotent, true);
  assert.equal(calls, 1);
  database.close();
  restoreEnv("EMAIL_NOTIFICATIONS_ENABLED", previous);
});
