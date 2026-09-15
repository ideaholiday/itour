import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

/**
 * Supplier profiles over HTTP: a supplier signs up and gets a link, edits the
 * profile, a traveler finds it and sends an enquiry, the supplier answers, an
 * admin grants the Verified badge, and the page and sitemap reflect it.
 */

const ADMIN = { email: "profiles.admin@example.test", password: "Integration@Admin2026" };
const FRONTEND_BUILT = fs.existsSync(new URL("../../frontend/dist/index.html", import.meta.url));

test("a supplier profile goes from signup to a verified, indexable page with enquiries", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const city = db.prepare("SELECT name, state FROM destinations WHERE COALESCE(is_active, 1) = 1 ORDER BY name LIMIT 1").get();
  assert.ok(city, "the demo marketplace seeds destinations");

  const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", {
    body: { companyName: "Sunrise Ganga Rafting", contactName: "Vikram Negi", email: "vikram@sunrise-rafting.example", phone: "+919811122233", city: city.name, state: city.state, password: "Rafting@2026" },
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  const supplierToken = signup.data.token;
  const supplierId = signup.data.user.supplier_id || db.prepare("SELECT id FROM suppliers WHERE email = ?").get("vikram@sunrise-rafting.example").id;

  // Signup assigns the link; the new profile is public but not yet for Google.
  const own = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/public-profile`, { token: supplierToken });
  assert.equal(own.response.status, 200, JSON.stringify(own.data));
  assert.equal(own.data.profile.slug, "sunrise-ganga-rafting");
  assert.equal(own.data.visible, true);
  assert.equal(own.data.indexable, false);

  const refused = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/public-profile`, {
    method: "PATCH", token: supplierToken, body: { about: "WhatsApp us on 98111 22233 for the best rates" },
  });
  assert.equal(refused.response.status, 400);
  assert.match(refused.data.error, /enquiries on Idea Holiday/);

  const saved = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/public-profile`, {
    method: "PATCH", token: supplierToken,
    body: { tagline: "Grade III rafting on the Ganga", languages: ["Hindi", "English"], serviceCities: ["Rishikesh"] },
  });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.completeness.missing.some((item) => item.key === "tagline"), false);

  // Another supplier can't read or edit this profile.
  const other = await requestJson(api.baseUrl, "/api/suppliers/some_other_supplier/public-profile", { token: supplierToken });
  assert.equal(other.response.status, 403);

  // Public view: found in the directory, nothing private in the payload.
  const directory = await requestJson(api.baseUrl, "/api/public/suppliers?q=ganga");
  assert.equal(directory.response.status, 200);
  assert.deepEqual(directory.data.suppliers.map((s) => s.slug), ["sunrise-ganga-rafting"]);

  const publicProfile = await requestJson(api.baseUrl, "/api/public/suppliers/sunrise-ganga-rafting");
  assert.equal(publicProfile.response.status, 200);
  assert.equal(publicProfile.data.supplier.badge.status, "NOT_VERIFIED");
  const payload = JSON.stringify(publicProfile.data);
  for (const secret of ["vikram@sunrise-rafting.example", "9811122233", "Vikram Negi", supplierId]) {
    assert.equal(payload.includes(secret), false, `public profile leaked ${secret}`);
  }

  // A traveler enquires; contact details are refused; the supplier replies.
  const traveler = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Meera Shah", email: "meera.enquiry@example.test", password: "Meera@2026", phone: "+919822200011" },
  });
  assert.equal(traveler.response.ok, true, JSON.stringify(traveler.data));
  const travelerToken = traveler.data.token;

  const anonymous = await requestJson(api.baseUrl, "/api/public/suppliers/sunrise-ganga-rafting/enquiries", { body: { message: "Is rafting open in October?" } });
  assert.equal(anonymous.response.status, 401);

  const leaky = await requestJson(api.baseUrl, "/api/public/suppliers/sunrise-ganga-rafting/enquiries", {
    token: travelerToken, body: { message: "Please email me at meera@example.test" },
  });
  assert.equal(leaky.response.status, 400);

  const sent = await requestJson(api.baseUrl, "/api/public/suppliers/sunrise-ganga-rafting/enquiries", {
    token: travelerToken, body: { message: "Is rafting open in October for 4 adults?", travelers: 4 },
  });
  assert.equal(sent.response.status, 201, JSON.stringify(sent.data));
  const ref = sent.data.enquiry.ref;

  const inbox = await requestJson(api.baseUrl, "/api/enquiries", { token: supplierToken });
  assert.deepEqual(inbox.data.enquiries.map((e) => [e.ref, e.travelerName]), [[ref, "Meera"]]);
  const reply = await requestJson(api.baseUrl, `/api/enquiries/${ref}/messages`, { token: supplierToken, body: { message: "Yes, daily at 9am and 1pm." } });
  assert.equal(reply.response.status, 201, JSON.stringify(reply.data));
  const thread = await requestJson(api.baseUrl, `/api/enquiries/${ref}`, { token: travelerToken });
  assert.equal(thread.data.enquiry.status, "REPLIED");
  assert.equal(thread.data.enquiry.messages.length, 2);

  // KYB approval makes the page indexable; an admin grants the badge after the checks.
  db.prepare("UPDATE suppliers SET kyb_status = 'APPROVED' WHERE id = ?").run(supplierId);
  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_profiles_admin', 'Profiles Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminLogin = await requestJson(api.baseUrl, "/api/auth/login", { body: ADMIN });
  const adminToken = adminLogin.data.token;

  const incomplete = await requestJson(api.baseUrl, `/api/admin/suppliers/${supplierId}/profile-verification`, {
    token: adminToken, body: { action: "GRANT", checks: ["BUSINESS_IDENTITY"] },
  });
  assert.equal(incomplete.response.status, 400);
  const granted = await requestJson(api.baseUrl, `/api/admin/suppliers/${supplierId}/profile-verification`, {
    token: adminToken, body: { action: "GRANT", checks: ["BUSINESS_IDENTITY", "BANK_ACCOUNT", "BUSINESS_ADDRESS", "OWNER_CALL"] },
  });
  assert.equal(granted.response.status, 201, JSON.stringify(granted.data));
  const supplierCannotGrant = await requestJson(api.baseUrl, `/api/admin/suppliers/${supplierId}/profile-verification`, {
    token: supplierToken, body: { action: "GRANT", checks: [] },
  });
  assert.equal(supplierCannotGrant.response.status >= 401 && supplierCannotGrant.response.status <= 403, true);

  const verified = await requestJson(api.baseUrl, "/api/public/suppliers?verified=1");
  assert.ok(verified.data.suppliers.some((s) => s.slug === "sunrise-ganga-rafting" && s.verified));

  const sitemap = await fetch(`${api.baseUrl}/sitemap-suppliers.xml`).then((response) => response.text());
  assert.match(sitemap, /\/suppliers\/sunrise-ganga-rafting<\/loc>/);

  // A rename keeps the old link working.
  const renamed = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/public-profile`, { method: "PATCH", token: supplierToken, body: { slug: "sunrise-rafting-rishikesh" } });
  assert.equal(renamed.response.status, 200, JSON.stringify(renamed.data));
  const oldApi = await requestJson(api.baseUrl, "/api/public/suppliers/sunrise-ganga-rafting");
  assert.equal(oldApi.data.redirectTo, "sunrise-rafting-rishikesh");

  if (FRONTEND_BUILT) {
    const old = await fetch(`${api.baseUrl}/suppliers/sunrise-ganga-rafting`, { redirect: "manual" });
    assert.equal(old.status, 301);
    assert.equal(old.headers.get("location"), "/suppliers/sunrise-rafting-rishikesh");

    const page = await fetch(`${api.baseUrl}/suppliers/sunrise-rafting-rishikesh`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<title>Sunrise Ganga Rafting – Travel operator in /);
    assert.match(html, /<meta name="robots" content="index, follow" \/>/);
    assert.match(html, /"@type":"TravelAgency"/);
    assert.match(html, /<div id="root"><\/div>/, "the SPA still boots");

    const missing = await fetch(`${api.baseUrl}/suppliers/not-a-real-operator`);
    assert.equal(missing.status, 404);
  } else {
    t.diagnostic("frontend/dist not built: skipped the server-rendered page checks");
  }
});
