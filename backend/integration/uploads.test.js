import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * Public photo uploads are served from our own domain, so only a signed-in
 * user may upload, only real PNG/JPG/WEBP images are kept, and the stored
 * extension comes from the file's contents rather than the name it was sent with.
 */

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("photo uploads need sign-in and a real image, and are stored with the image's own extension", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const city = db.prepare("SELECT name, state FROM destinations WHERE COALESCE(is_active, 1) = 1 ORDER BY name LIMIT 1").get();
  const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", {
    body: { companyName: "Konkan Photo Tours", contactName: "Ravi Naik", email: "ravi@konkanphoto.example", phone: "+919845011223", city: city.name, state: city.state, password: "Photo@Supplier2026" },
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  const token = signup.data.token;
  const supplierId = signup.data.user.supplier_id;

  const photo = { data: `data:image/png;base64,${PNG_BASE64}`, filename: "cover.html", mimeType: "image/png", entityType: "GENERAL", entityId: supplierId };

  assert.equal((await requestJson(api.baseUrl, "/api/uploads", { body: photo })).response.status, 401, "signed-out uploads are refused");

  const html = Buffer.from("<html><script>alert(document.cookie)</script></html>").toString("base64");
  const disguised = await requestJson(api.baseUrl, "/api/uploads", { token, body: { ...photo, data: html } });
  assert.equal(disguised.response.status, 400, "a page sent as image/png is refused");
  assert.equal(disguised.data.error, "UNSUPPORTED_FILE_TYPE");

  const upload = await requestJson(api.baseUrl, "/api/uploads", { token, body: photo });
  assert.equal(upload.response.status, 201, JSON.stringify(upload.data));
  assert.match(upload.data.upload.url, /^\/uploads\/file_.+\.png$/, "extension comes from the contents, not cover.html");
  assert.equal(upload.data.upload.mime_type, "image/png");
  t.after(() => fs.rmSync(path.join(import.meta.dirname, "..", upload.data.upload.url), { force: true }));

  const served = await fetch(`${api.baseUrl}${upload.data.upload.url}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
});
