import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { isUploadReferenced, purgeOrphanUploads } from "../src/services/uploadCleanupService.js";

const NOW = new Date("2026-10-30T10:00:00Z");
const OLD = "2026-09-01 08:00:00";
const RECENT = "2026-10-25 08:00:00.123456+00";

function cleanupDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE uploads (id TEXT PRIMARY KEY, filename TEXT, url TEXT, entity_type TEXT, created_at TEXT);
    CREATE TABLE products (hero_image TEXT, images TEXT, itinerary TEXT);
    CREATE TABLE product_media (url TEXT, thumbnail_url TEXT);
    CREATE TABLE suppliers (logo_url TEXT, cover_url TEXT);
    CREATE TABLE review_photos (photo_url TEXT);
    CREATE TABLE destinations (hero_image TEXT);
    CREATE TABLE user_profiles (avatar_url TEXT);
    CREATE TABLE support_case_evidence (evidence_url TEXT);
  `);
  return database;
}

function addUpload(database, id, { url = `/uploads/${id}.webp`, entityType = "PRODUCT", createdAt = OLD } = {}) {
  database.prepare("INSERT INTO uploads VALUES (?, ?, ?, ?, ?)").run(id, path.basename(url), url, entityType, createdAt);
}

test("unused photos older than 30 days are deleted; used, recent and KYB files are kept", async (t) => {
  const database = cleanupDatabase();
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-cleanup-"));
  t.after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));
  for (const name of ["orphan", "gallery", "logo", "recent"]) fs.writeFileSync(path.join(uploadsDir, `${name}.webp`), "x");

  addUpload(database, "orphan");
  addUpload(database, "gallery");
  addUpload(database, "logo", { entityType: "GENERAL" });
  addUpload(database, "recent", { createdAt: RECENT });
  addUpload(database, "kyb", { url: "kyb-file://kyb_1_abc.pdf", entityType: "KYB" });
  addUpload(database, "pasted", { url: "https://images.unsplash.com/photo-1.jpg" });
  database.prepare("INSERT INTO products (images) VALUES (?)").run(JSON.stringify(["https://x.example/a.jpg", "/uploads/gallery.webp"]));
  database.prepare("INSERT INTO suppliers (logo_url) VALUES ('/uploads/logo.webp')").run();

  const result = await purgeOrphanUploads(database, { now: NOW, uploadsDir });

  assert.equal(result.deleted, 1);
  assert.deepEqual(database.prepare("SELECT id FROM uploads ORDER BY id").all().map((row) => row.id), ["gallery", "kyb", "logo", "pasted", "recent"]);
  assert.equal(fs.existsSync(path.join(uploadsDir, "orphan.webp")), false);
  for (const kept of ["gallery", "logo", "recent"]) assert.ok(fs.existsSync(path.join(uploadsDir, `${kept}.webp`)), kept);
});

test("unused photos in Supabase Storage are removed from the public bucket", async (t) => {
  const saved = { MEDIA_STORAGE: process.env.MEDIA_STORAGE, SUPABASE_URL: process.env.SUPABASE_URL };
  process.env.MEDIA_STORAGE = "supabase";
  process.env.SUPABASE_URL = "https://project.supabase.co";
  t.after(() => Object.entries(saved).forEach(([key, value]) => (value === undefined ? delete process.env[key] : (process.env[key] = value))));

  const database = cleanupDatabase();
  const base = "https://project.supabase.co/storage/v1/object/public/supplier-media";
  addUpload(database, "unused", { url: `${base}/product/file_1_unused.webp` });
  addUpload(database, "hero", { url: `${base}/product/file_2_hero.webp` });
  addUpload(database, "failing", { url: `${base}/product/file_3_failing.webp` });
  addUpload(database, "elsewhere", { url: "https://other.supabase.co/storage/v1/object/public/supplier-media/product/file_4.webp" });
  database.prepare("INSERT INTO products (hero_image) VALUES (?)").run(`${base}/product/file_2_hero.webp`);

  const removed = [];
  const remove = async (bucket, objectPath) => {
    if (objectPath.includes("failing")) throw new Error("storage unavailable");
    removed.push(`${bucket}/${objectPath}`);
  };
  const result = await purgeOrphanUploads(database, { now: NOW, remove });

  assert.deepEqual(removed, ["supplier-media/product/file_1_unused.webp"]);
  assert.deepEqual(result, { checked: 4, deleted: 1, failed: 1 });
  assert.deepEqual(database.prepare("SELECT id FROM uploads ORDER BY id").all().map((row) => row.id), ["elsewhere", "failing", "hero"], "a failed delete is retried next run");
});

test("a photo counts as used wherever its name appears, including JSON lists", () => {
  const database = cleanupDatabase();
  database.prepare("INSERT INTO products (itinerary) VALUES (?)").run(JSON.stringify([{ day: 1, image: "/uploads/day1.webp" }]));
  database.prepare("INSERT INTO review_photos (photo_url) VALUES ('/uploads/review.jpg')").run();
  assert.equal(isUploadReferenced(database, "day1.webp"), true);
  assert.equal(isUploadReferenced(database, "review.jpg"), true);
  assert.equal(isUploadReferenced(database, "nowhere.webp"), false);
});
