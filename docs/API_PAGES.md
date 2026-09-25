# Pages, Blog & Sitemap API: Idea Holiday

> **Summary:** Server-rendered public pages (supplier profiles, "things to do" city pages, blog posts), their data endpoints, and the sitemaps.
> **Read when:** changing SEO pages, the blog or sitemaps. Other endpoints: [`API_CONTRACTS.md`](API_CONTRACTS.md). Code: `routes/seo.js`, `routes/blog.js`.

Every page route answers with the SPA's `index.html` carrying that page's title,
description, canonical, robots, Open Graph and JSON-LD, `301` for renamed or
miscased slugs, and a `noindex` 404 for unknown or hidden ones. Each falls
through to the SPA when `frontend/dist` is not built.

## 1. Supplier and city pages
- **`GET /suppliers`, `/suppliers/in/:citySlug`, `/suppliers/:slug`**: JSON-LD `TravelAgency` + `BreadcrumbList`.
- **`GET /things-to-do/:citySlug`** (ADR 025): `CollectionPage` + `ItemList`, `BreadcrumbList`, `FAQPage`; `noindex` when nothing is live there.
- **`GET /hi/things-to-do/:citySlug`** (ADR 028): the Hindi version: `<html lang="hi">`, `og:locale` `hi_IN`, Hindi title, description and FAQs. Both versions carry `hreflang` links (`en-IN`, `hi-IN`, `x-default` → English).
- **`GET /api/destination-pages/:slug?lang=hi`** → `{ name, slug, path, state, country, tagline, heroImage, productCount, fromPriceInr, categories: [{ name, count }], faqs: [{ question, answer }], products }` (products shaped as `GET /api/activities`); `404 DESTINATION_NOT_FOUND`.

## 2. Blog (ADR 026)
- **`GET /blog`**, **`GET /blog/:slug`**: pages; a post has `BlogPosting` + `BreadcrumbList`. A draft is a `noindex` 404; a renamed post `301`s from its old slug.
- **`GET /api/blog?city=&page=`** (public) → `{ success, posts: [summary], pagination: { page, pageSize, total, pages } }`. Summary: `{ id, slug, path, title, excerpt, coverImage, city, cityPath, authorName, publishedAt, updatedAt, readingMinutes }`. Published only, newest first, 12 a page.
- **`GET /api/blog/:slug`** (public) → `{ success, post: { ...summary, body }, products }` (linked listings that are live now), or `{ success, redirectTo }` for an old slug; `404 BLOG_POST_NOT_FOUND`.
- **`GET /api/admin/blog`** (`ADMIN`) → `{ success, posts: [{ ...summary, status, body, productIds, previousSlugs, createdAt }] }`.
- **`POST /api/admin/blog`** (`ADMIN`) `{ title, slug?, excerpt?, body, coverImage?, city?, productIds? (≤ 12), status?: DRAFT|PUBLISHED }` → `201 { success, post }`. `409 BLOG_SLUG_TAKEN` (also for another post's old slug), `400 BLOG_COVER_INVALID` (cover must be `https://` or a site path).
- **`PATCH /api/admin/blog/:id`** (`ADMIN`) same fields, all optional; an empty `slug` keeps the current one. **`DELETE /api/admin/blog/:id`** → `{ success }`. `404 BLOG_POST_NOT_FOUND`.
- Body format: the Markdown subset in `shared/blogMarkdown.js` (`##`/`###`, lists, `>` quotes, `**bold**`, `[text](https://… or /path)`), rendered as React elements, never HTML.

## 3. Sitemaps
- **`GET /sitemap.xml`**: static pages, country pages, one `/things-to-do/:city` and one `/hi/things-to-do/:city` per city with live products, live activities, and `/blog` plus each published post (when there is one).
- **`GET /sitemap-suppliers.xml`**: the directory, indexable city pages and indexable profiles. Both are listed in `robots.txt`.
