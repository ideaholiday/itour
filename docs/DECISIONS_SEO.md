# SEO & Content Decisions (ADR 025 onward): Idea Holiday

> **Summary:** Owner decisions on organic traffic: city landing pages, the staff blog, link previews and Hindi pages, with their reasons.
> **Read when:** changing SEO pages, the blog, previews or languages, or recording a new decision in that area. Other ADRs: [`DECISIONS.md`](DECISIONS.md).

## ADR 025: "Things to Do" City Pages for Search Traffic
- **Date**: 2026-09-22
- **Context**: City landing pages existed only as `/search?destination=X`, which got its own head tags but a generic search body. Owner chose destination pages as the first step to grow organic visits (ahead of a staff blog and more JSON-LD).
- **Decision Made**:
  - Each city gets `/things-to-do/:citySlug` (lowercase, hyphenated). It is the canonical page for a bookable city: the sitemap lists it instead of `/search?destination=`, and `/search?destination=X` alone points its canonical there.
  - The page is built only from live listings: product list, starting price, categories and FAQs. No hand-written or invented copy. `CollectionPage` + `ItemList`, `BreadcrumbList` and `FAQPage` markup match what the page shows.
  - A catalogue city with nothing live has a `noindex` page; an unknown slug is a `noindex` 404.
- **Consequences**: Activity-page breadcrumbs and Home's live featured cities link to the city page. Editorial content (the blog) can later link into these pages.

---

## ADR 026: Staff Blog
- **Date**: 2026-09-22
- **Context**: Second step to grow organic visits after city pages (ADR 025): travel guides written by the team (city guides, festivals, pilgrimages) that link to bookable listings.
- **Decision Made**:
  - Posts live in `blog_posts` (migration 059) and are written in the admin panel (`/admin/blog`). Only `ADMIN` accounts can write; a writer who shouldn't have other admin powers needs a narrower role later.
  - Posts are drafts until published. Public pages are `/blog` and `/blog/:slug`, with `BlogPosting` markup, in the sitemap once published.
  - Body is a small Markdown subset rendered as React elements (no HTML, no new library). Links go only to `https://` or site paths; outside links are `nofollow`.
  - A post may name a city (shown on that city's page, links back to it) and up to 12 listings; only listings live at read time are shown.
  - A renamed published post keeps its old address as a `301`.
- **Consequences**: API: [`API_PAGES.md`](API_PAGES.md) §2. The pages-and-sitemap section moved there from `API_CONTRACTS.md` (size cap).

---

## ADR 027: Activity Link Previews Carry the Price in Text
- **Date**: 2026-09-22
- **Context**: Activity links are shared mostly on WhatsApp. A generated preview image (photo + price) needs an image library (`sharp`) and a bundled font.
- **Decision Made**: No image library. The preview keeps the activity photo, and the description leads with the price and verified rating (`From ₹2,999 · ★ 4.5 (4 reviews). …`), built in `shared/activitySeo.js` for both the server and the browser. No price or rating is shown when the listing has none. `og:image:alt` is set.
- **Consequences**: Google's snippet shows the same line. A drawn preview image stays possible later, as its own decision.

---

## ADR 028: Hindi City Pages
- **Date**: 2026-09-22
- **Context**: Hindi travel searches have less competition than English ones. City pages are generated from listings, so they can be translated without hand-written copy.
- **Decision Made**:
  - Each city page has a Hindi version at `/hi/things-to-do/:citySlug`, with Hindi page text, title, description and FAQs (`shared/destinationSeo.js`), `lang="hi"` and `og:locale` `hi_IN`. Both versions link to each other with `hreflang`; `x-default` is English. Both are in the sitemap.
  - City names, listing titles and supplier text stay as written (English): a guessed transliteration could name the wrong place.
  - Other pages (activities, blog, search, checkout) stay English for now; a Hindi page links into them unchanged.
- **Consequences**: A language is added by adding its strings and a path prefix. Hindi activity pages and Hindi blog posts are later, separate decisions.
