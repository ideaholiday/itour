/**
 * The `?destination=` value for a catalogue city. Indian ids match their city
 * name (`goa`); a city abroad has an id like `city_th_bangkok`, so it goes by
 * its name, which is what its products' `city` holds (ADR 023).
 */
export function destinationParam(destination) {
  if (!destination) return "";
  return destination.country && destination.country !== "India" ? destination.name : destination.id || destination.name;
}

/**
 * Home's featured destinations: the cities with the most live products (search
 * `facets.cities`, busiest first), each with the curated photo and tagline when
 * `curated` has one, then curated cities to fill five places. Live ones carry
 * `live: true` and have a "things to do" page.
 */
export function featuredDestinations(catalog, cityFacets, curated = [], count = 5) {
  const byName = new Map((catalog || []).map((d) => [String(d.name || "").toLowerCase(), d]));
  const curatedByName = new Map(curated.map((d) => [d.name.toLowerCase(), d]));
  const live = (cityFacets || []).filter((c) => c.name).map((c) => {
    const name = c.name.trim();
    const key = name.toLowerCase();
    const d = byName.get(key) || { id: name, name };
    const pick = curatedByName.get(key);
    return { ...d, live: true, hero_image: pick?.hero_image || d.hero_image || curated[0]?.hero_image, tagline: pick?.tagline || d.tagline };
  });
  const names = new Set(live.map((d) => d.name.toLowerCase()));
  return [...live, ...curated.filter((d) => !names.has(d.name.toLowerCase()))].slice(0, count);
}

/** Search returns `images` as stored; a JSON string becomes a list. */
export function withImageList(product) {
  if (typeof product.images !== "string") return product;
  try {
    return { ...product, images: JSON.parse(product.images || "[]") };
  } catch {
    return { ...product, images: [] };
  }
}

/**
 * The catalogue city (from `/api/cities`) a product's `city` names, matched by
 * name or id ignoring case, or null. A city whose country isn't open for
 * listings yet doesn't count, the same as the backend's resolveCatalogLocation.
 */
export function catalogCity(cities, city) {
  const wanted = String(city || "").trim().toLowerCase();
  if (!wanted) return null;
  return (cities || []).find((c) => c.listing_open !== false
    && (String(c.name).toLowerCase() === wanted || String(c.id).toLowerCase() === wanted)) || null;
}
