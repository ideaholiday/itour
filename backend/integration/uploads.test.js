import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * Public photo uploads are served from our own domain, so only a signed-in
 * user may upload, only real PNG/JPG/WEBP images are kept, and the stored
 * extension comes from the file's contents rather than the name it was sent with.
 */

async function signupSupplier(api, db, { companyName, email, phone }) {
  const city = db.prepare("SELECT name, state FROM destinations WHERE COALESCE(is_active, 1) = 1 ORDER BY name LIMIT 1").get();
  const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", {
    body: { companyName, contactName: "Ravi Naik", email, phone, city: city.name, state: city.state, password: "Photo@Supplier2026" },
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  return { token: signup.data.token, supplierId: signup.data.user.supplier_id };
}

// Stands in for Supabase Storage's object API: stores uploads in memory and
// serves them back, recording what the backend sent.
async function startFakeStorage() {
  const objects = new Map();
  const server = http.createServer((req, res) => {
    const match = req.url.match(/^\/storage\/v1\/object\/([^?]+)/);
    if (!match) return res.writeHead(404).end();
    const key = decodeURIComponent(match[1]);
    if (req.method === "POST") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        objects.set(key, { body: Buffer.concat(chunks), contentType: req.headers["content-type"], authorization: req.headers.authorization });
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ Id: "obj", Key: key }));
      });
      return undefined;
    }
    const object = objects.get(key);
    if (req.method === "GET" && object) return res.writeHead(200, { "Content-Type": object.contentType }).end(object.body);
    return res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, objects, stop: () => new Promise((resolve) => server.close(resolve)) };
}

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("photo uploads need sign-in and a real image, and are stored with the image's own extension", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const { token, supplierId } = await signupSupplier(api, db, { companyName: "Konkan Photo Tours", email: "ravi@konkanphoto.example", phone: "+919845011223" });

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

test("with MEDIA_STORAGE=supabase, photos go to the public bucket and KYB files to the private one", async (t) => {
  const storage = await startFakeStorage();
  t.after(() => storage.stop());
  const api = await startTestServer({ MEDIA_STORAGE: "supabase", SUPABASE_URL: storage.url, SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key" });
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());
  const { token, supplierId } = await signupSupplier(api, db, { companyName: "Malvan Boat Rides", email: "ops@malvanboats.example", phone: "+919845033445" });

  const photo = await requestJson(api.baseUrl, "/api/uploads", {
    token, body: { data: PNG_BASE64, filename: "boat.png", mimeType: "image/png", entityType: "PRODUCT", entityId: supplierId },
  });
  assert.equal(photo.response.status, 201, JSON.stringify(photo.data));
  const photoUrl = photo.data.upload.url;
  const photoPath = photoUrl.match(/\/storage\/v1\/object\/public\/supplier-media\/(product\/file_.+\.png)$/)?.[1];
  assert.ok(photoUrl.startsWith(storage.url) && photoPath, `public Supabase link, got ${photoUrl}`);
  const stored = storage.objects.get(`supplier-media/${photoPath}`);
  assert.ok(stored.body.equals(Buffer.from(PNG_BASE64, "base64")));
  assert.equal(stored.contentType, "image/png");
  assert.equal(stored.authorization, "Bearer test-service-role-key");
  assert.equal(fs.existsSync(path.join(import.meta.dirname, "..", "uploads", path.basename(photoPath))), false, "nothing written to local disk");

  const pdf = Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF");
  const kyb = await requestJson(api.baseUrl, "/api/uploads", {
    token, body: { data: pdf.toString("base64"), filename: "pan.pdf", mimeType: "application/pdf", entityType: "KYB", entityId: supplierId },
  });
  assert.equal(kyb.response.status, 201, JSON.stringify(kyb.data));
  const kybName = kyb.data.upload.url.replace("kyb-file://", "");
  assert.ok(storage.objects.get(`kyb-documents/${kybName}`).body.equals(pdf), "stored in the private bucket");

  const submitted = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/kyb`, {
    token, body: { docType: "PAN", docNumber: "AAACB8781B", docUrl: kyb.data.upload.url },
  });
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.data));
  const opened = await fetch(`${api.baseUrl}/api/suppliers/${supplierId}/kyb/${submitted.data.docId}/file`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(opened.status, 200);
  assert.equal(opened.headers.get("content-type"), "application/pdf");
  assert.equal(opened.headers.get("cache-control"), "private, no-store");
  assert.ok(Buffer.from(await opened.arrayBuffer()).equals(pdf), "served from the private bucket through the backend");
});
