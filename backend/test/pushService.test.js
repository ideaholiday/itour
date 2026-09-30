import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { firebaseConfiguration, pushDevicesFor, registerPushDevice, sendPush, unregisterPushDevice } from "../src/services/pushService.js";
import { migratedDb } from "./helpers/migratedDb.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const ACCOUNT = { project_id: "ideaholiday-test", client_email: "push@ideaholiday-test.iam.gserviceaccount.com", private_key: privateKey };
const ENV = { FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(ACCOUNT)).toString("base64") };
const TOKEN = (name) => `${name}-registration-token-0123456789`;

function database(t) {
  const db = migratedDb(t);
  db.prepare(`INSERT INTO users (id, name, email, password, phone, role) VALUES
    ('usr_owner', 'Owner', 'owner@coast.test', 'x', '+919000000011', 'SUPPLIER'),
    ('usr_desk', 'Desk', 'desk@coast.test', 'x', '+919000000012', 'SUPPLIER'),
    ('usr_guide', 'Guide', 'guide@coast.test', 'x', '+919000000013', 'SUPPLIER'),
    ('usr_traveler', 'Asha', 'asha@example.test', 'x', '+919000000014', 'TRAVELER')`).run();
  db.prepare(`INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, kyb_status, subscription_exempt)
    VALUES ('sup_c', 'Coast Rides', 'O', 'Owner@Coast.test', '+919000000011', 'Goa', 'Goa', 'APPROVED', 1)`).run();
  db.prepare(`INSERT INTO supplier_members (id, supplier_id, user_id, role) VALUES ('m1', 'sup_c', 'usr_desk', 'FRONT_DESK'), ('m2', 'sup_c', 'usr_guide', 'GUIDE')`).run();
  return db;
}

/** A fake Firebase: the OAuth token endpoint, then messages:send answering from `replies` per device token. */
function fakeFirebase(replies = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url === "https://oauth2.googleapis.com/token") {
      const assertion = new URLSearchParams(options.body).get("assertion");
      const claims = jwt.verify(assertion, publicKey, { algorithms: ["RS256"], audience: "https://oauth2.googleapis.com/token", issuer: ACCOUNT.client_email });
      assert.equal(claims.scope, "https://www.googleapis.com/auth/firebase.messaging");
      return { ok: true, status: 200, json: async () => ({ access_token: "ya29.test", expires_in: 3600 }) };
    }
    const { message } = JSON.parse(options.body);
    const reply = replies[message.token] || { status: 200, body: { name: `projects/ideaholiday-test/messages/0:${calls.length}` } };
    return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
  };
  return { calls, fetchImpl };
}

test("each alert goes to the recipient's own phones only", (t) => {
  const db = database(t);
  registerPushDevice(db, { token: TOKEN("driver"), app: "driver", ownerType: "DRIVER", ownerKey: "ravi@example.test" });
  registerPushDevice(db, { token: TOKEN("traveler"), app: "traveler", ownerType: "USER", ownerKey: "usr_traveler" });
  for (const user of ["usr_owner", "usr_desk", "usr_guide"]) registerPushDevice(db, { token: TOKEN(user), app: "supplier", ownerType: "USER", ownerKey: user });

  assert.deepEqual(pushDevicesFor(db, { role: "DRIVER", email: "Ravi@Example.test" }).map((d) => d.token), [TOKEN("driver")]);
  assert.deepEqual(pushDevicesFor(db, { role: "TRAVELER", id: "usr_traveler" }).map((d) => d.token), [TOKEN("traveler")]);
  assert.deepEqual(pushDevicesFor(db, { role: "SUPPLIER", id: "sup_c" }).map((d) => d.token).sort(), [TOKEN("usr_desk"), TOKEN("usr_owner")], "owner and front desk, not the guide");
  assert.deepEqual(pushDevicesFor(db, { role: "ADMIN", id: "usr_owner" }), []);

  // A phone signed in by someone else moves to them; signing out removes it.
  registerPushDevice(db, { token: TOKEN("traveler"), app: "traveler", ownerType: "USER", ownerKey: "usr_desk" });
  assert.deepEqual(pushDevicesFor(db, { role: "TRAVELER", id: "usr_traveler" }), []);
  unregisterPushDevice(db, TOKEN("driver"));
  assert.deepEqual(pushDevicesFor(db, { role: "DRIVER", email: "ravi@example.test" }), []);
  assert.throws(() => registerPushDevice(db, { token: TOKEN("x"), app: "admin", ownerType: "USER", ownerKey: "usr_owner" }), /Unknown app/);
});

test("a push is sent once through FCM v1, and a dead token is switched off", async (t) => {
  const db = database(t);
  registerPushDevice(db, { token: TOKEN("owner-phone"), app: "supplier", ownerType: "USER", ownerKey: "usr_owner" });
  registerPushDevice(db, { token: TOKEN("owner-old-phone"), app: "supplier", ownerType: "USER", ownerKey: "usr_owner" });
  const firebase = fakeFirebase({ [TOKEN("owner-old-phone")]: { status: 404, body: { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } } } });
  const alert = { database: db, recipient: { role: "SUPPLIER", id: "sup_c" }, eventType: "NEW_BOOKING", eventKeyPrefix: "booking:bk_1", body: "New booking IH-1 for Airport run" };

  const results = await sendPush(alert, { env: ENV, fetchImpl: firebase.fetchImpl });
  assert.deepEqual(results.map((r) => r.status).sort(), ["FAILED", "SENT"]);
  const sent = firebase.calls.find((call) => call.url.endsWith("/messages:send") && call.options.body.includes(TOKEN("owner-phone")));
  assert.equal(sent.url, "https://fcm.googleapis.com/v1/projects/ideaholiday-test/messages:send");
  assert.equal(sent.options.headers.Authorization, "Bearer ya29.test");
  const { message } = JSON.parse(sent.options.body);
  assert.deepEqual(message.notification, { title: "Idea Holiday", body: "New booking IH-1 for Airport run" });
  assert.deepEqual(message.data, { path: "/supplier/bookings" });
  assert.equal(message.android.notification.channel_id, "alerts");
  assert.ok(db.prepare("SELECT disabled_at FROM push_devices WHERE token = ?").get(TOKEN("owner-old-phone")).disabled_at, "the uninstalled phone is switched off");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notification_deliveries WHERE channel = 'PUSH' AND recipient_address LIKE 'push:supplier:%'").get().n, 2);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM notification_deliveries WHERE channel = 'PUSH'").all()).includes(TOKEN("owner-phone")), false, "the log never keeps a device token");

  const again = await sendPush(alert, { env: ENV, fetchImpl: firebase.fetchImpl });
  assert.deepEqual(again.map((r) => r.idempotent), [true], "the same alert is not pushed twice; the dead phone is skipped");
});

test("on Cloud Run, push signs in as the service's own account, with no key", async (t) => {
  const db = database(t);
  registerPushDevice(db, { token: TOKEN("driver"), app: "driver", ownerType: "DRIVER", ownerKey: "ravi@example.test" });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith("http://metadata.google.internal/")) return { ok: true, status: 200, json: async () => ({ access_token: "ya29.runtime", expires_in: 3599 }) };
    return { ok: true, status: 200, json: async () => ({ name: "projects/ideaholiday-todothing/messages/0:1" }) };
  };
  const results = await sendPush({ database: db, recipient: { role: "DRIVER", email: "ravi@example.test" }, eventType: "DRIVER_REQUEST", body: "New trip request IH-2" },
    { env: { FIREBASE_PROJECT_ID: "ideaholiday-todothing" }, fetchImpl });
  assert.deepEqual(results.map((r) => r.status), ["SENT"]);
  assert.equal(calls[0].options.headers["Metadata-Flavor"], "Google");
  assert.equal(calls[1].url, "https://fcm.googleapis.com/v1/projects/ideaholiday-todothing/messages:send");
  assert.equal(calls[1].options.headers.Authorization, "Bearer ya29.runtime");
  assert.deepEqual(JSON.parse(calls[1].options.body).message.data, { path: "/driver" });
});

test("without Firebase configured, pushes are logged as skipped", async (t) => {
  const db = database(t);
  registerPushDevice(db, { token: TOKEN("traveler"), app: "traveler", ownerType: "USER", ownerKey: "usr_traveler" });
  const firebase = fakeFirebase();
  const results = await sendPush({ database: db, recipient: { role: "TRAVELER", id: "usr_traveler" }, eventType: "X", body: "Your driver is on the way" }, { env: {}, fetchImpl: firebase.fetchImpl });
  assert.deepEqual(results.map((r) => r.status), ["SKIPPED"]);
  assert.equal(firebase.calls.length, 0);
  assert.equal(firebaseConfiguration({ FIREBASE_SERVICE_ACCOUNT: "{not json" }), null);
  assert.equal(firebaseConfiguration({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(ACCOUNT) }).projectId, "ideaholiday-test", "raw JSON works too");
});
