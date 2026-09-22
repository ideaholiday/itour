/**
 * Staff blog (ADR 026). Admins write posts in the admin panel; travelers read
 * published ones at /blog. A post can name a city (it then links to that
 * city's "things to do" page) and listings to show under it; only listings
 * that are live at read time are shown, so a guide never sells what can't be booked.
 */
import { nanoid } from "nanoid";
import { approvedSupplierSql } from "./supplierKybGate.js";
import { destinationPath, destinationSlug } from "../../../shared/destinationSeo.js";
import { blogPath, blogPlainText, readingMinutes, safeHref } from "../../../shared/blogMarkdown.js";
import { displayCity } from "../../../shared/activitySeo.js";

export const BLOG_PAGE_SIZE = 12;
const MAX_LINKED_PRODUCTS = 12;

function blogError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function parseList(value) {
  try {
    const list = JSON.parse(value || "[]");
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

const sqlTimestamp = (date = new Date()) => new Date(date).toISOString().slice(0, 19).replace("T", " ");

export function blogSlug(value) {
  return destinationSlug(value).slice(0, 90).replace(/-+$/, "");
}

function summaryOf(row) {
  const city = row.city ? displayCity(row.city) : null;
  return {
    id: row.id,
    slug: row.slug,
    path: blogPath(row.slug),
    title: row.title,
    excerpt: row.excerpt || blogPlainText(row.body).slice(0, 200),
    coverImage: row.cover_image || null,
    city,
    cityPath: city ? destinationPath(city) : null,
    authorName: row.author_name || "Idea Holiday team",
    publishedAt: row.published_at || null,
    updatedAt: row.updated_at,
    readingMinutes: readingMinutes(row.body),
  };
}

function adminView(row) {
  return { ...summaryOf(row), status: row.status, body: row.body, productIds: parseList(row.product_ids), previousSlugs: parseList(row.previous_slugs), createdAt: row.created_at };
}

/** Linked listings that travelers can book right now, in the order the author chose. */
export function liveLinkedProducts(database, productIds) {
  const ids = [...new Set(productIds)].slice(0, MAX_LINKED_PRODUCTS);
  if (!ids.length) return [];
  const rows = database.prepare(`
    SELECT p.* FROM products p
    WHERE p.id IN (${ids.map(() => "?").join(",")})
      AND p.status = 'PUBLISHED' AND COALESCE(p.is_published, 1) = 1 AND ${approvedSupplierSql("p")}
  `).all(...ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function listPublishedPosts(database, { city = "", page = 1 } = {}) {
  const current = Math.max(1, Math.floor(Number(page) || 1));
  const where = ["status = 'PUBLISHED'"];
  const params = [];
  if (String(city).trim()) {
    where.push("LOWER(TRIM(city)) = ?");
    params.push(String(city).trim().toLowerCase());
  }
  const total = database.prepare(`SELECT COUNT(*) AS total FROM blog_posts WHERE ${where.join(" AND ")}`).get(...params).total;
  const rows = database.prepare(`
    SELECT * FROM blog_posts WHERE ${where.join(" AND ")}
    ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?
  `).all(...params, BLOG_PAGE_SIZE, (current - 1) * BLOG_PAGE_SIZE);
  return {
    posts: rows.map(summaryOf),
    pagination: { page: current, pageSize: BLOG_PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)) },
  };
}

/**
 * A published post by slug, `{ redirectTo }` for a slug it had before a
 * rename, or null. Drafts are never returned.
 */
export function findPublishedPost(database, slug) {
  const key = String(slug || "").toLowerCase();
  const row = database.prepare("SELECT * FROM blog_posts WHERE slug = ? AND status = 'PUBLISHED'").get(key);
  if (row) return { post: { ...summaryOf(row), body: row.body }, productIds: parseList(row.product_ids) };
  const renamed = database.prepare("SELECT slug, previous_slugs FROM blog_posts WHERE status = 'PUBLISHED' AND previous_slugs LIKE ?").all(`%"${key.replace(/[%_"\\]/g, "")}"%`)
    .find((candidate) => parseList(candidate.previous_slugs).includes(key));
  return renamed ? { redirectTo: renamed.slug } : null;
}

/** Published posts for the sitemap. */
export function sitemapBlogEntries(database) {
  return database.prepare("SELECT slug, updated_at FROM blog_posts WHERE status = 'PUBLISHED' ORDER BY published_at DESC").all()
    .map((row) => ({ path: blogPath(row.slug), updatedAt: row.updated_at }));
}

export function listAllPosts(database) {
  return database.prepare("SELECT * FROM blog_posts ORDER BY COALESCE(published_at, created_at) DESC, id DESC").all().map(adminView);
}

function assertSlugFree(database, slug, exceptId = null) {
  const taken = database.prepare("SELECT id, slug, previous_slugs FROM blog_posts WHERE id <> COALESCE(?, '')").all(exceptId)
    .some((row) => row.slug === slug || parseList(row.previous_slugs).includes(slug));
  if (taken) throw blogError("Another post already uses that web address", 409, "BLOG_SLUG_TAKEN");
}

function cleanFields(input) {
  const fields = {};
  if (input.title !== undefined) fields.title = input.title.trim();
  if (input.excerpt !== undefined) fields.excerpt = input.excerpt?.trim() || null;
  if (input.body !== undefined) fields.body = input.body;
  if (input.coverImage !== undefined) {
    if (input.coverImage?.trim() && !safeHref(input.coverImage)) throw blogError("The cover photo must be an https:// link or an uploaded photo", 400, "BLOG_COVER_INVALID");
    fields.cover_image = input.coverImage?.trim() || null;
  }
  if (input.city !== undefined) fields.city = input.city?.trim() ? displayCity(input.city) : null;
  if (input.productIds !== undefined) fields.product_ids = JSON.stringify([...new Set(input.productIds.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_LINKED_PRODUCTS));
  if (input.status !== undefined) fields.status = input.status;
  return fields;
}

export function createPost(database, input, { actorId = null } = {}) {
  const slug = blogSlug(input.slug || input.title);
  if (!slug) throw blogError("Give the post a title or web address", 400, "BLOG_SLUG_REQUIRED");
  assertSlugFree(database, slug);
  const author = actorId ? database.prepare("SELECT name FROM users WHERE id = ?").get(actorId) : null;
  const fields = cleanFields({ status: "DRAFT", ...input });
  const id = `post_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_image, city, product_ids, status, author_id, author_name, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, slug, fields.title, fields.excerpt ?? null, fields.body ?? "", fields.cover_image ?? null, fields.city ?? null,
    fields.product_ids ?? "[]", fields.status, actorId, author?.name || null, fields.status === "PUBLISHED" ? sqlTimestamp() : null,
  );
  return adminView(database.prepare("SELECT * FROM blog_posts WHERE id = ?").get(id));
}

export function updatePost(database, id, input) {
  const existing = database.prepare("SELECT * FROM blog_posts WHERE id = ?").get(id);
  if (!existing) throw blogError("Post not found", 404, "BLOG_POST_NOT_FOUND");
  const fields = cleanFields(input);
  // An empty web address keeps the current one.
  const slug = input.slug ? blogSlug(input.slug) : "";
  if (slug) {
    if (slug !== existing.slug) {
      assertSlugFree(database, slug, id);
      fields.slug = slug;
      // Only a published address can have been shared or indexed.
      if (existing.published_at) fields.previous_slugs = JSON.stringify([...new Set([...parseList(existing.previous_slugs), existing.slug])].filter((old) => old !== slug));
    }
  }
  // The first publish dates the post; unpublishing and republishing keeps that date.
  if (fields.status === "PUBLISHED" && !existing.published_at) fields.published_at = sqlTimestamp();
  const keys = Object.keys(fields);
  if (keys.length) {
    database.prepare(`UPDATE blog_posts SET ${keys.map((key) => `${key} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((key) => fields[key]), id);
  }
  return adminView(database.prepare("SELECT * FROM blog_posts WHERE id = ?").get(id));
}

export function deletePost(database, id) {
  const result = database.prepare("DELETE FROM blog_posts WHERE id = ?").run(id);
  if (!result.changes) throw blogError("Post not found", 404, "BLOG_POST_NOT_FOUND");
}
