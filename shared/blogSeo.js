import { absoluteImage, DEFAULT_SOCIAL_IMAGE } from "./activitySeo.js";
import { blogPlainText } from "./blogMarkdown.js";

// Head tags for /blog and /blog/:slug. The server writes them into the HTML and
// the blog pages set the same values in the browser.

const SITE = "https://ideaholiday.in";

function excerpt(text, max = 155) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * A stored timestamp → ISO 8601. SQLite writes "2026-09-22 10:00:00" (UTC);
 * Postgres fills TEXT defaults as "2026-09-22 10:00:00.123456+00".
 */
export function isoDate(value) {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  const text = String(value).trim().replace(" ", "T").replace(/(T[\d:.]+[+-]\d\d)$/, "$1:00");
  const date = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function blogIndexSeo({ baseUrl = SITE, page = 1 } = {}) {
  return {
    title: "Travel Guides for India and Asia | Idea Holiday Blog",
    description: "Trip ideas, city guides, festival and pilgrimage planning from the Idea Holiday team, with tours and cabs you can book.",
    canonical: `${baseUrl}/blog${page > 1 ? `?page=${page}` : ""}`,
  };
}

/** @param post  title, path, excerpt, body, coverImage, city, cityPath, authorName, publishedAt, updatedAt */
export function blogPostSeo(post, { baseUrl = SITE } = {}) {
  const canonical = `${baseUrl}${post.path}`;
  const image = absoluteImage(post.coverImage, baseUrl) || DEFAULT_SOCIAL_IMAGE;
  const description = excerpt(post.excerpt || blogPlainText(post.body));
  const crumbs = [
    { name: "Home", item: `${baseUrl}/` },
    { name: "Blog", item: `${baseUrl}/blog` },
    { name: post.title, item: canonical },
  ];
  return {
    title: `${post.title} | Idea Holiday`,
    description,
    canonical,
    image,
    type: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BlogPosting",
          "@id": `${canonical}#post`,
          headline: excerpt(post.title, 110),
          description,
          image: [image],
          url: canonical,
          mainEntityOfPage: canonical,
          datePublished: isoDate(post.publishedAt),
          dateModified: isoDate(post.updatedAt) || isoDate(post.publishedAt),
          author: post.authorName && post.authorName !== "Idea Holiday team"
            ? { "@type": "Person", name: post.authorName }
            : { "@type": "Organization", name: "Idea Holiday" },
          publisher: { "@type": "Organization", name: "Idea Holiday", logo: { "@type": "ImageObject", url: DEFAULT_SOCIAL_IMAGE } },
          ...(post.city ? { about: { "@type": "Place", name: post.city } } : {}),
        },
        { "@type": "BreadcrumbList", itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.item })) },
      ],
    },
  };
}
