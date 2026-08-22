export function resolveIndiaCatalogLocation(catalog, city, country = "India") {
  if (String(country || "India").trim().toLowerCase() !== "india") {
    return { error: "Idea Holiday currently supports listings in India only" };
  }
  const requested = String(city || "").trim().toLowerCase();
  const match = catalog.find((item) => String(item.id).toLowerCase() === requested || String(item.name).toLowerCase() === requested);
  if (!match) return { error: "Choose a city from the Idea Holiday city catalogue" };
  return { value: { city: match.name, state: match.state, country: "India" } };
}
