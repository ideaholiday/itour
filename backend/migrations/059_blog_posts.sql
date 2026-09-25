-- Staff blog (ADR 026): travel guides written by the Idea Holiday team at
-- /blog/:slug, each linked to a city's "things to do" page and to bookable
-- listings. Drafts are never public. A renamed post keeps its old slug in
-- previous_slugs so shared links redirect instead of breaking.

CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  previous_slugs TEXT NOT NULL DEFAULT '[]',
  title TEXT NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL DEFAULT '',
  cover_image TEXT,
  city TEXT,
  product_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  author_id TEXT,
  author_name TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON blog_posts(status, published_at);

-- @down
DROP INDEX IF EXISTS idx_blog_posts_status_published;
DROP TABLE IF EXISTS blog_posts;
