export function activityPath(productOrId, title = "") {
  const product = typeof productOrId === "object" ? productOrId : { id: productOrId, title };
  const slug = String(product.title || "Activity").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "Activity";
  return `/activity/${encodeURIComponent(slug)}/${encodeURIComponent(product.id)}`;
}
