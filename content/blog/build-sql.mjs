// Builds an INSERT for marketplace.blog_posts from the Markdown posts in a
// folder, after checking them against the same rules the admin API applies
// (ADR 026). Usage: node content/blog/build-sql.mjs content/blog/phase1 [DRAFT|PUBLISHED]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { parseBlogBody, safeHref } from "../../shared/blogMarkdown.js";
import { destinationSlug } from "../../shared/destinationSeo.js";

// Published before this batch (production, 2026-09-29); internal links may point at them.
const EXISTING = `pattaya-beyond-the-beach bangkok-3-days-for-indian-travellers one-day-in-lucknow jaipur-3-days-guide
varanasi-spiritual-guide kerala-backwaters-houseboat-guide ladakh-complete-travel-guide goa-beyond-beach-guide agra-taj-mahal-guide
hampi-vijayanagara-guide rishikesh-yoga-adventure-guide udaipur-city-of-lakes-guide mysore-royal-heritage-guide amritsar-golden-temple-guide
darjeeling-tea-himalaya-guide munnar-tea-estates-guide coorg-coffee-estates-guide manali-adventure-guide khajuraho-temples-guide
pushkar-camel-fair-guide ooty-nilgiri-hills-guide jaisalmer-desert-safari-guide sikkim-gangtok-monastery-guide ranthambore-tiger-safari-guide
andaman-islands-travel-guide kolkata-city-of-joy-guide hyderabad-biryani-charminar-guide mahabalipuram-temples-guide aurangabad-ajanta-ellora-guide
jodhpur-blue-city-guide shimla-hill-station-guide bhopal-lakes-mosques-guide tirupati-temple-pilgrimage-guide first-time-in-goa-4-day-plan`.split(/\s+/);

const [dir, status = "PUBLISHED"] = process.argv.slice(2);
if (!dir || !["DRAFT", "PUBLISHED"].includes(status)) throw new Error("usage: build-sql.mjs <dir> [DRAFT|PUBLISHED]");

function parse(file) {
  const text = readFileSync(join(dir, file), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(match[1].split("\n").map((line) => {
    const at = line.indexOf(":");
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }));
  return { file, ...meta, body: match[2].trim() + "\n" };
}

const posts = readdirSync(dir).filter((file) => file.endsWith(".md")).sort().map(parse);
const known = new Set([...EXISTING, ...posts.map((post) => post.slug)]);
const errors = [];
for (const post of posts) {
  const where = post.file;
  if (post.slug !== destinationSlug(post.slug).slice(0, 90)) errors.push(`${where}: slug is not in canonical form`);
  if (EXISTING.includes(post.slug)) errors.push(`${where}: slug already published`);
  if (!post.title || post.title.length > 160) errors.push(`${where}: title must be 3-160 characters`);
  if (!post.excerpt || post.excerpt.length > 300) errors.push(`${where}: excerpt must be 1-300 characters`);
  if (!post.city || post.city.length > 80) errors.push(`${where}: city must be 1-80 characters`);
  if (post.body.length > 60_000) errors.push(`${where}: body over 60,000 characters`);
  for (const [, href] of post.body.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (!safeHref(href)) errors.push(`${where}: unsafe link ${href}`);
    const blog = href.match(/^\/blog\/([^/?#]+)$/);
    if (blog && !known.has(blog[1])) errors.push(`${where}: link to unknown post ${href}`);
  }
  if (!parseBlogBody(post.body).some((block) => block.type === "h2")) errors.push(`${where}: no ## headings`);
}
if (new Set(posts.map((post) => post.slug)).size !== posts.length) errors.push("duplicate slugs in batch");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const quote = (value) => (value == null ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);
const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const rows = posts.map((post) => `(${[
  `post_${randomBytes(9).toString("base64url")}`, post.slug, post.title, post.excerpt, post.body, post.city,
  status, "Idea Holiday team", status === "PUBLISHED" ? now : null, now, now,
].map(quote).join(", ")})`);
const sql = `INSERT INTO marketplace.blog_posts (id, slug, title, excerpt, body, city, status, author_name, published_at, created_at, updated_at)
VALUES
${rows.join(",\n")}
ON CONFLICT (slug) DO NOTHING
RETURNING slug, status;
`;
const out = join(dir, `insert-${status.toLowerCase()}.sql`);
writeFileSync(out, sql);
const words = posts.map((post) => post.body.split(/\s+/).length);
console.log(`${posts.length} posts OK, ${Math.min(...words)}-${Math.max(...words)} words each -> ${out}`);
