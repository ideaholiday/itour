/** Countries whose catalogue cities can hold a product (ADR 023, ADR 024). */
export const LISTING_COUNTRIES = Object.freeze(["India", "Thailand", "United Arab Emirates", "Singapore"]);

export function listingOpenIn(country) {
  return LISTING_COUNTRIES.includes(country || "India");
}

/**
 * The catalogue city a supplier listed in, with its state and country. The city
 * decides the country; a country sent by the client must agree with it.
 */
export function resolveCatalogLocation(catalog, city, country) {
  const requested = String(city || "").trim().toLowerCase();
  const match = catalog.find((item) => String(item.id).toLowerCase() === requested || String(item.name).toLowerCase() === requested);
  if (!match) return { error: "Choose a city from the Idea Holiday city catalogue" };
  const cityCountry = match.country || "India";
  if (country && String(country).trim().toLowerCase() !== cityCountry.toLowerCase()) {
    return { error: `${match.name} is in ${cityCountry}, not ${String(country).trim()}` };
  }
  if (!listingOpenIn(cityCountry)) return { error: `Listings in ${cityCountry} open soon. ${match.name} can't hold a product yet.` };
  return { value: { city: match.name, state: match.state, country: cityCountry } };
}
