import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { createPost, deletePost, findPublishedPost, listPublishedPosts, liveLinkedProducts, sitemapBlogEntries, updatePost } from "../src/services/blogService.js";
import { blogPlainText, parseBlogBody, readingMinutes, safeHref } from "../../shared/blogMarkdown.js";
import { blogPostSeo, isoDate } from "../../shared/blogSeo.js";
import { blogPostPage, generateSitemapXml } from "../src/routes/seo.js";

const INDEX_TEMPLATE = fs.readFileSync(new URL("../../frontend/index.html", import.meta.url), "utf8");
const headOf = (html) => html.slice(0, html.indexOf("</head>"));

function blogDatabase() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, kyb_status TEXT, subscription_exempt INTEGER DEFAULT 0);
    CREATE TABLE supplier_subscriptions (id TEXT PRIMARY KEY, supplier_id TEXT, status TEXT, starts_at TEXT, ends_at TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT, title TEXT, status TEXT DEFAULT 'PUBLISHED', is_published INTEGER DEFAULT 1, sell_marketplace INTEGER DEFAULT 1, sell_ideaholiday_api INTEGER DEFAULT 1, sell_own_resellers INTEGER DEFAULT 1);
    INSERT INTO users VALUES ('usr_staff', 'Priya Nair');
    INSERT INTO suppliers VALUES ('sup_ok', 'APPROVED', 1), ('sup_pending', 'PENDING', 1);
    INSERT INTO products (id, supplier_id, title) VALUES ('p_live', 'sup_ok', 'Dudhsagar trip'), ('p_other', 'sup_ok', 'Spice farm'), ('p_pending', 'sup_pending', 'Pending tour');
    INSERT INTO products (id, supplier_id, title, status) VALUES ('p_draft', 'sup_ok', 'Draft', 'DRAFT');
  `);
  const sql = fs.readFileSync(new URL("../migrations/059_blog_posts.sql", import.meta.url), "utf8");
  executeMigrationSql(db, sql.split("-- @down")[0]);
  return db;
}

test("the post format parses to plain data; unsafe links lose their link", () => {
  const blocks = parseBlogBody("## Getting there\nTake the **Konkan** train.\nIt is scenic.\n\n- Book [early](/things-to-do/goa)\n- Carry cash\n\n1. Day one\n2. Day two\n> Go in monsoon\n[bad](javascript:alert(1)) and [ok](https://goa.gov.in)");
  assert.deepEqual(blocks.map((block) => block.type), ["h2", "p", "ul", "ol", "quote", "p"]);
  assert.deepEqual(blocks[1].inline, [{ text: "Take the " }, { text: "Konkan", bold: true }, { text: " train. It is scenic." }]);
  assert.deepEqual(blocks[2].items[0], [{ text: "Book " }, { text: "early", href: "/things-to-do/goa" }]);
  assert.deepEqual(blocks[5].inline[0], { text: "bad" }, "javascript: is dropped, the words kept");
  assert.equal(blocks[5].inline[2].href, "https://goa.gov.in");
  for (const bad of ["javascript:alert(1)", "//evil.test", "http://plain.test", "data:text/html,x"]) assert.equal(safeHref(bad), null, bad);
  assert.equal(blogPlainText("## Hi\n**Bold** [link](/x)"), "Hi Bold link");
  assert.equal(readingMinutes("word ".repeat(1000)), 5);
});

test("drafts stay private; publishing dates a post once, and a renamed post redirects its old address", () => {
  const db = blogDatabase();
  const draft = createPost(db, { title: "Goa in the Monsoon: What's Open", body: "## Beaches\nMost shacks close.", city: "goa", productIds: ["p_pending", "p_live", "p_draft", "p_other"] }, { actorId: "usr_staff" });
  assert.equal(draft.slug, "goa-in-the-monsoon-what-s-open");
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.authorName, "Priya Nair");
  assert.equal(draft.city, "Goa");
  assert.equal(draft.cityPath, "/things-to-do/goa");
  assert.equal(findPublishedPost(db, draft.slug), null, "a draft is not public");
  assert.equal(listPublishedPosts(db).posts.length, 0);

  assert.throws(() => createPost(db, { title: "Goa in the monsoon what's open" }), { status: 409, code: "BLOG_SLUG_TAKEN" });
  assert.throws(() => createPost(db, { title: "Cover", coverImage: "javascript:alert(1)" }), { status: 400, code: "BLOG_COVER_INVALID" });

  const published = updatePost(db, draft.id, { status: "PUBLISHED", slug: "" });
  assert.ok(published.publishedAt);
  assert.equal(published.slug, draft.slug, "an empty web address keeps the current one");
  const found = findPublishedPost(db, draft.slug);
  assert.equal(found.post.title, "Goa in the Monsoon: What's Open");
  assert.deepEqual(liveLinkedProducts(db, found.productIds).map((product) => product.id), ["p_live", "p_other"], "only live listings, in the author's order");
  assert.deepEqual(listPublishedPosts(db, { city: "GOA" }).posts.map((post) => post.id), [draft.id]);
  assert.equal(listPublishedPosts(db, { city: "Jaipur" }).posts.length, 0);

  const renamed = updatePost(db, draft.id, { slug: "Goa Monsoon Guide" });
  assert.equal(renamed.slug, "goa-monsoon-guide");
  assert.equal(renamed.publishedAt, published.publishedAt);
  assert.deepEqual(findPublishedPost(db, draft.slug), { redirectTo: "goa-monsoon-guide" });
  assert.throws(() => createPost(db, { title: "x", slug: draft.slug }), { code: "BLOG_SLUG_TAKEN" }, "an old address can't be reused");
  assert.deepEqual(sitemapBlogEntries(db).map((entry) => entry.path), ["/blog/goa-monsoon-guide"]);

  updatePost(db, draft.id, { status: "DRAFT" });
  assert.equal(findPublishedPost(db, "goa-monsoon-guide"), null, "unpublishing hides it again");
  assert.equal(sitemapBlogEntries(db).length, 0);
  deletePost(db, draft.id);
  assert.throws(() => deletePost(db, draft.id), { status: 404 });
  db.close();
});

test("a post page gets BlogPosting markup, a 301 after a rename, and a noindex 404 for drafts", () => {
  const db = blogDatabase();
  const post = createPost(db, { title: "Kedarnath Yatra Guide", excerpt: "Registration, routes and when to go.", body: "Plan early.", coverImage: "/uploads/kedarnath.jpg", status: "PUBLISHED" }, { actorId: "usr_staff" });
  const page = blogPostPage(db, post.slug, INDEX_TEMPLATE, "https://ideaholiday.in");
  assert.equal(page.status, 200);
  const head = headOf(page.html);
  assert.match(head, /<title>Kedarnath Yatra Guide \| Idea Holiday<\/title>/);
  assert.match(head, /<meta name="description" content="Registration, routes and when to go." \/>/);
  assert.match(head, /<link rel="canonical" href="https:\/\/ideaholiday.in\/blog\/kedarnath-yatra-guide" \/>/);
  assert.match(head, /og:type" content="article"/);
  assert.match(head, /og:image" content="https:\/\/ideaholiday.in\/uploads\/kedarnath.jpg"/);
  const article = JSON.parse(head.match(/id="structured-data-json-ld">([\s\S]*?)<\/script>/)[1])["@graph"][0];
  assert.equal(article["@type"], "BlogPosting");
  assert.deepEqual(article.author, { "@type": "Person", name: "Priya Nair" });
  assert.match(article.datePublished, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);

  assert.deepEqual(blogPostPage(db, "Kedarnath-Yatra-Guide", INDEX_TEMPLATE), { status: 301, location: "/blog/kedarnath-yatra-guide" });
  updatePost(db, post.id, { slug: "kedarnath-2026" });
  assert.deepEqual(blogPostPage(db, "kedarnath-yatra-guide", INDEX_TEMPLATE), { status: 301, location: "/blog/kedarnath-2026" });
  const draft = createPost(db, { title: "Unfinished" });
  const hidden = blogPostPage(db, draft.slug, INDEX_TEMPLATE);
  assert.equal(hidden.status, 404);
  assert.match(headOf(hidden.html), /content="noindex, follow"/);

  assert.equal(blogPostSeo({ ...post, authorName: "Idea Holiday team" }).jsonLd["@graph"][0].author["@type"], "Organization");
  const xml = generateSitemapXml([], "https://ideaholiday.in", [], [], [{ path: "/blog/kedarnath-2026" }]);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/blog<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/blog\/kedarnath-2026<\/loc>/);
  assert.doesNotMatch(generateSitemapXml([], "https://ideaholiday.in"), /\/blog/, "no empty blog in the sitemap");
  db.close();
});

test("stored timestamps from either engine read as the same instant", () => {
  assert.equal(isoDate("2026-09-22 15:45:40"), "2026-09-22T15:45:40.000Z", "SQLite");
  assert.equal(isoDate("2026-09-22 15:45:40.292191+00"), "2026-09-22T15:45:40.292Z", "Postgres TEXT default");
  assert.equal(isoDate("2026-09-22T21:15:40+05:30"), "2026-09-22T15:45:40.000Z");
  assert.equal(isoDate(new Date("2026-09-22T15:45:40Z")), "2026-09-22T15:45:40.000Z");
  assert.equal(isoDate("2026-09-22"), "2026-09-22T00:00:00.000Z", "a bare date is not read as an offset");
  for (const bad of [null, "", "not a date"]) assert.equal(isoDate(bad), undefined);
  const seo = blogPostSeo({ title: "T", path: "/blog/t", body: "x", publishedAt: "2026-09-22 10:00:00", updatedAt: "2026-09-23 08:00:00.5+00" });
  assert.equal(seo.jsonLd["@graph"][0].dateModified, "2026-09-23T08:00:00.500Z");
});
