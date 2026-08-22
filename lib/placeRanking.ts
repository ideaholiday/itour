export type RankablePlace = {
  label: string;
  description: string;
  lat?: number | null;
  lng?: number | null;
};

const contextStopWords = new Set([
  'address', 'airport', 'area', 'city', 'district', 'hotel', 'india', 'international',
  'landmark', 'near', 'point', 'road', 'state', 'station', 'terminal', 'the',
  'uttar', 'pradesh',
]);

function words(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length >= 3);
}

function distanceKm(originLat: number | null, originLng: number | null, place: RankablePlace) {
  if (!Number.isFinite(originLat) || !Number.isFinite(originLng) || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = radians(Number(place.lat) - Number(originLat));
  const lngDelta = radians(Number(place.lng) - Number(originLng));
  const startLat = radians(Number(originLat));
  const endLat = radians(Number(place.lat));
  const haversine = Math.sin(latDelta / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function proximityScore(distance: number | null) {
  if (distance === null) return 0;
  if (distance <= 15) return 140;
  if (distance <= 40) return 110;
  if (distance <= 100) return 75;
  if (distance <= 250) return 35;
  if (distance >= 750) return -30;
  return 0;
}

export function rankPlaces<T extends RankablePlace>(places: T[], query: string, context: string, lat: number | null, lng: number | null) {
  const queryWords = new Set(words(query));
  const contextWords = [...new Set(words(context))].filter((word) => !queryWords.has(word) && !contextStopWords.has(word));
  if (!contextWords.length && !Number.isFinite(lat) && !Number.isFinite(lng)) return places;

  return places.map((place, index) => {
    const searchable = ` ${words(`${place.label} ${place.description}`).join(' ')} `;
    const contextMatches = contextWords.reduce((count, word) => count + (searchable.includes(` ${word} `) ? 1 : 0), 0);
    return { place, index, score: contextMatches * 100 + proximityScore(distanceKm(lat, lng, place)) };
  }).sort((left, right) => right.score - left.score || left.index - right.index).map(({ place }) => place);
}

