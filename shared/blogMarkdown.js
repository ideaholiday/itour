// The small Markdown subset staff write blog posts in: "## " and "### "
// headings, "- " and "1. " lists, "> " quotes, blank-line paragraphs, **bold**
// and [text](link). It parses to plain data so the page renders React elements
// and never raw HTML. Links go only to https:// pages or paths on this site.

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function safeHref(href) {
  const value = String(href || "").trim();
  if (/^https:\/\/[^\s]+$/i.test(value)) return value;
  if (/^\/(?!\/)[^\s]*$/.test(value)) return value;
  return null;
}

/** "Book **early** at [Baga](/things-to-do/goa)" → [{ text }, { text, bold }, { text, href }] */
export function parseInline(line) {
  const parts = [];
  let last = 0;
  for (const match of String(line).matchAll(INLINE)) {
    if (match.index > last) parts.push({ text: line.slice(last, match.index) });
    if (match[1] !== undefined) parts.push({ text: match[1], bold: true });
    else {
      const href = safeHref(match[3]);
      parts.push(href ? { text: match[2], href } : { text: match[2] });
    }
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last) });
  return parts;
}

/** Blocks: { type: "h2" | "h3" | "p" | "quote", inline } or { type: "ul" | "ol", items: [inline] }. */
export function parseBlogBody(body) {
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", inline: parseInline(paragraph.join(" ")) });
    paragraph = [];
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of String(body || "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const quote = line.match(/^>\s?(.+)$/);
    if (!line) flush();
    else if (heading) { flush(); blocks.push({ type: heading[1].length === 2 ? "h2" : "h3", inline: parseInline(heading[2]) }); }
    else if (quote) { flush(); blocks.push({ type: "quote", inline: parseInline(quote[1]) }); }
    else if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      if (paragraph.length || (list && list.type !== type)) flush();
      list = list || { type, items: [] };
      list.items.push(parseInline((bullet || numbered)[1]));
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** The body as plain words: for descriptions, reading time and search. */
export function blogPlainText(body) {
  return parseBlogBody(body)
    .flatMap((block) => (block.items || [block.inline]).map((inline) => inline.map((part) => part.text).join("")))
    .join(" ").replace(/\s+/g, " ").trim();
}

export function readingMinutes(body) {
  const words = blogPlainText(body).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function blogPath(slug) {
  return `/blog/${encodeURIComponent(slug)}`;
}
