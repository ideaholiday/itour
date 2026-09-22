import React from "react";
import { Link } from "react-router-dom";
import { parseBlogBody } from "../../../shared/blogMarkdown.js";

// Renders a post's Markdown subset as React elements (never as HTML).
function Inline({ parts }) {
  return parts.map((part, index) => {
    if (part.bold) return <strong key={index} className="font-bold text-stone-900 dark:text-stone-100">{part.text}</strong>;
    if (part.href?.startsWith("/")) return <Link key={index} to={part.href} className="font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-800 dark:text-amber-400">{part.text}</Link>;
    if (part.href) return <a key={index} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-800 dark:text-amber-400">{part.text}</a>;
    return <React.Fragment key={index}>{part.text}</React.Fragment>;
  });
}

export default function BlogBody({ body }) {
  return (
    <div className="space-y-4 text-base leading-relaxed text-stone-700 dark:text-stone-300 sm:text-lg">
      {parseBlogBody(body).map((block, index) => {
        if (block.type === "h2") return <h2 key={index} className="pt-4 font-display text-2xl text-stone-900 dark:text-stone-100 sm:text-3xl"><Inline parts={block.inline} /></h2>;
        if (block.type === "h3") return <h3 key={index} className="pt-2 text-xl font-bold text-stone-900 dark:text-stone-100"><Inline parts={block.inline} /></h3>;
        if (block.type === "quote") return <blockquote key={index} className="border-l-4 border-amber-400 pl-4 italic"><Inline parts={block.inline} /></blockquote>;
        if (block.type === "ul" || block.type === "ol") {
          const List = block.type;
          return (
            <List key={index} className={`space-y-1.5 pl-6 ${block.type === "ul" ? "list-disc" : "list-decimal"}`}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}><Inline parts={item} /></li>)}
            </List>
          );
        }
        return <p key={index}><Inline parts={block.inline} /></p>;
      })}
    </div>
  );
}
