import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

const ADMIN = { email: "blog.admin@example.test", password: "Integration@Admin2026" };

test("admins write and publish blog posts; travelers see only published ones", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_blog_admin', 'Blog Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const travelerToken = (await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Asha Rao", email: "asha.blog@example.test", password: "Integration@2026", phone: "+919877700031" },
  })).data.token;
  const goa = (await requestJson(api.baseUrl, "/api/activities?destination=Goa")).data[0];

  assert.equal((await requestJson(api.baseUrl, "/api/admin/blog")).response.status, 401);
  assert.equal((await requestJson(api.baseUrl, "/api/admin/blog", { token: travelerToken, body: { title: "Nope" } })).response.status, 403);
  assert.equal((await requestJson(api.baseUrl, "/api/admin/blog", { token: adminToken, body: { title: "x" } })).response.status, 400);

  const created = await requestJson(api.baseUrl, "/api/admin/blog", {
    token: adminToken,
    body: { title: "Best Goa Beaches for Families", body: "## North Goa\nCalm water.", city: "Goa", productIds: [goa.id, "no_such_product"] },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const { post } = created.data;
  assert.equal(post.status, "DRAFT");
  assert.equal((await requestJson(api.baseUrl, `/api/blog/${post.slug}`)).response.status, 404, "drafts are private");

  const published = await requestJson(api.baseUrl, `/api/admin/blog/${post.id}`, { token: adminToken, method: "PATCH", body: { status: "PUBLISHED" } });
  assert.equal(published.response.status, 200);
  const read = await requestJson(api.baseUrl, `/api/blog/${post.slug}`);
  assert.equal(read.response.status, 200);
  assert.equal(read.data.post.authorName, "Blog Admin");
  assert.deepEqual(read.data.products.map((product) => product.id), [goa.id], "unknown ids are left out");
  const list = await requestJson(api.baseUrl, "/api/blog?city=Goa");
  assert.ok(list.data.posts.some((entry) => entry.id === post.id));
  assert.equal("body" in list.data.posts[0], false, "the list doesn't send whole posts");

  assert.equal((await requestJson(api.baseUrl, `/api/admin/blog/${post.id}`, { token: travelerToken, method: "DELETE" })).response.status, 403);
  assert.equal((await requestJson(api.baseUrl, `/api/admin/blog/${post.id}`, { token: adminToken, method: "DELETE" })).response.status, 200);
  assert.equal((await requestJson(api.baseUrl, `/api/blog/${post.slug}`)).response.status, 404);
});
