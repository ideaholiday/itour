import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

const ADMIN = { email: "sharekit.admin@example.test", password: "Integration@Admin2026" };

test("share kit: tracked redirect, QR images, a framable widget, and the supplier's kit", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_sharekit_admin', 'Share Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const token = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const supplier = db.prepare("SELECT id, public_slug, email, phone FROM suppliers WHERE public_slug IS NOT NULL AND kyb_status = 'APPROVED' LIMIT 1").get();
  assert.ok(supplier?.public_slug);

  const traveler = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Rhea D", email: "rhea.share@example.test", password: "Integration@2026", phone: "+919811122233" } });
  assert.equal((await requestJson(api.baseUrl, `/api/suppliers/${supplier.id}/share-kit`, { token: traveler.data.token })).response.status, 403);
  const kit = await requestJson(api.baseUrl, `/api/suppliers/${supplier.id}/share-kit`, { token });
  assert.equal(kit.response.status, 200, JSON.stringify(kit.data));
  assert.ok(kit.data.shareKit.reviewLinkUrl.includes("/r/"));

  const redirect = await fetch(`${api.baseUrl}/go/s/${supplier.public_slug}?t=review&c=standee`, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  assert.match(redirect.headers.get("location"), /\/r\//);
  const unknown = await fetch(`${api.baseUrl}/go/s/no-such-supplier-xyz`, { redirect: "manual" });
  assert.equal(unknown.status, 302);
  assert.match(unknown.headers.get("location"), /\/suppliers$/);
  const counted = db.prepare("SELECT target, channel FROM supplier_share_scans WHERE supplier_id = ?").all(supplier.id);
  assert.deepEqual(counted.map((row) => [row.target, row.channel]), [["REVIEW", "STANDEE"]]);

  const svg = await fetch(`${api.baseUrl}/api/share/s/${supplier.public_slug}/qr.svg?t=profile`);
  assert.equal(svg.status, 200);
  assert.equal(svg.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  const png = await fetch(`${api.baseUrl}/api/share/s/${supplier.public_slug}/qr.png?t=review&download=1`);
  assert.equal(png.headers.get("content-type"), "image/png");
  assert.match(png.headers.get("content-disposition"), /attachment/);

  const widget = await fetch(`${api.baseUrl}/api/share/s/${supplier.public_slug}/widget`);
  assert.equal(widget.status, 200);
  assert.equal(widget.headers.get("x-frame-options"), null, "the widget can be framed");
  assert.match(widget.headers.get("content-security-policy"), /frame-ancestors \*/);
  const html = await widget.text();
  assert.equal(html.includes(supplier.email) || html.includes(supplier.phone), false);
  const profile = await fetch(`${api.baseUrl}/api/share/s/${supplier.public_slug}/print?format=sticker`);
  assert.notEqual(profile.headers.get("x-frame-options"), null, "other share pages keep the frame protection");
});
