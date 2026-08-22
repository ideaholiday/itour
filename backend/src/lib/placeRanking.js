const CONTEXT_STOP_WORDS = new Set([
  "address", "airport", "area", "city", "district", "hotel", "india", "international",
  "landmark", "near", "point", "road", "state", "station", "terminal", "the",
  "uttar", "pradesh",
]);

function words(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function distanceKm(originLat, originLng, destinationLat, destinationLng) {
  if (![originLat, originLng, destinationLat, destinationLng].every(Number.isFinite)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latDelta = radians(destinationLat - originLat);
  const lngDelta = radians(destinationLng - originLng);
  const startLat = radians(originLat);
  const endLat = radians(destinationLat);
  const haversine = Math.sin(latDelta / 2) ** 2
    + Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function proximityScore(distance) {
  if (distance === null) return 0;
  if (distance <= 15) return 140;
  if (distance <= 40) return 110;
  if (distance <= 100) return 75;
  if (distance <= 250) return 35;
  if (distance >= 750) return -30;
  return 0;
}

/**
 * Preserve the provider's relevance order while promoting results around the
 * booking's known city/route. Context is intentionally a soft bias, so users
 * can still search for a place in another city.
 */
export function rankSuggestions(suggestions, { query = "", context = "", lat = null, lng = null } = {}) {
  const queryWords = new Set(words(query));
  const contextWords = [...new Set(words(context))]
    .filter((word) => !queryWords.has(word) && !CONTEXT_STOP_WORDS.has(word));

  if (!contextWords.length && !Number.isFinite(lat) && !Number.isFinite(lng)) return suggestions;

  return suggestions
    .map((suggestion, index) => {
      const searchable = ` ${words(`${suggestion.label || ""} ${suggestion.description || ""}`).join(" ")} `;
      const contextMatches = contextWords.reduce(
        (count, word) => count + (searchable.includes(` ${word} `) ? 1 : 0),
        0,
      );
      const suggestionLat = suggestion.lat === null || suggestion.lat === undefined ? null : Number(suggestion.lat);
      const suggestionLng = suggestion.lng === null || suggestion.lng === undefined ? null : Number(suggestion.lng);
      const distance = distanceKm(lat, lng, suggestionLat, suggestionLng);
      return {
        suggestion,
        index,
        score: contextMatches * 100 + proximityScore(distance),
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ suggestion }) => suggestion);
}
