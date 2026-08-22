import { NextRequest, NextResponse } from 'next/server';
import { rankPlaces } from '@/lib/placeRanking';

type Category = 'Airports' | 'Hotels & Resorts' | 'Popular Landmarks' | 'Cities';
type Suggestion = { id: string; label: string; description: string; category: Category; lat: number | null; lng: number | null };

const MAPPLS_SEARCH = 'https://search.mappls.com/search';

function category(text = ''): Category {
  const value = text.toLowerCase();
  if (/airport|airfield|terminal/.test(value)) return 'Airports';
  if (/hotel|resort|lodging|hostel|homestay/.test(value)) return 'Hotels & Resorts';
  if (/city|locality|district|state|village/.test(value)) return 'Cities';
  return 'Popular Landmarks';
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : null;
}

function normalizeMappls(place: any): Suggestion {
  const label = place.placeName ?? place.name ?? place.poi ?? 'Unnamed place';
  const description = place.placeAddress ?? place.address ?? '';
  return {
    id: place.eLoc ?? place.eloc ?? place.mapplsPin ?? '', label, description,
    category: category(`${place.type ?? ''} ${label} ${description}`),
    lat: numberOrNull(place.latitude ?? place.lat ?? place.entryLatitude ?? place.entry_lat),
    lng: numberOrNull(place.longitude ?? place.lng ?? place.lon ?? place.entryLongitude ?? place.entry_lon),
  };
}

async function fetchJson(url: URL | string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8000), next: { revalidate: 300 } });
  if (!response.ok) throw new Error(`Location provider returned ${response.status}`);
  return response.json();
}

async function searchMappls(query: string, apiKey: string, lat?: string | null, lng?: string | null) {
  const url = new URL(`${MAPPLS_SEARCH}/places/autosuggest/json`);
  url.searchParams.set('query', query.slice(0, 80));
  url.searchParams.set('region', 'IND');
  url.searchParams.set('access_token', apiKey);
  if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('hyperLocal', '');
  }
  const data = await fetchJson(url);
  const seen = new Set<string>();
  return [...(data.suggestedLocations ?? []), ...(data.userAddedLocations ?? [])]
    .map(normalizeMappls)
    .filter((place) => {
      if (!place.id || seen.has(place.id)) return false;
      seen.add(place.id);
      return true;
    })
    .slice(0, 8);
}

async function searchGoogle(query: string, apiKey: string, lat: number | null, lng: number | null) {
  const locationBias = Number.isFinite(lat) && Number.isFinite(lng)
    ? { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } }
    : undefined;
  const data = await fetchJson('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text,suggestions.placePrediction.types' },
    body: JSON.stringify({ input: query, includedRegionCodes: ['in'], languageCode: 'en', regionCode: 'IN', locationBias }),
  });
  return (data.suggestions ?? []).flatMap((entry: any) => {
    const place = entry.placePrediction;
    if (!place) return [];
    const label = place.structuredFormat?.mainText?.text ?? place.text?.text ?? '';
    const description = place.structuredFormat?.secondaryText?.text ?? '';
    return [{ id: place.placeId, label, description, category: category(`${place.types?.join(' ')} ${label} ${description}`), lat: null, lng: null }];
  }).slice(0, 8);
}

async function geocodeMappls(address: string, apiKey: string) {
  const url = new URL(`${MAPPLS_SEARCH}/address/geocode`);
  url.searchParams.set('address', address.slice(0, 255));
  url.searchParams.set('itemCount', '1');
  url.searchParams.set('region', 'IND');
  url.searchParams.set('access_token', apiKey);
  const data = await fetchJson(url);
  const place = data.copResults?.[0] ?? data.results?.[0] ?? data.response?.[0];
  if (!place) return null;
  const location = normalizeMappls(place);
  return location.lat !== null && location.lng !== null ? location : null;
}

async function resolveMappls(placeId: string, address: string, apiKey: string) {
  if (placeId) {
    const url = new URL(`https://place.mappls.com/O2O/entity/place-details/${encodeURIComponent(placeId)}`);
    url.searchParams.set('access_token', apiKey);
    const normalized = normalizeMappls({ ...(await fetchJson(url)), eLoc: placeId });
    if (normalized.lat !== null && normalized.lng !== null) return normalized;
  }
  return address ? geocodeMappls(address, apiKey) : null;
}

async function resolveGoogle(placeId: string, apiKey: string) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location' }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
  const place = await response.json();
  return { id: place.id, label: place.displayName?.text ?? place.formattedAddress, description: place.formattedAddress ?? '', category: 'Popular Landmarks' as Category, lat: numberOrNull(place.location?.latitude), lng: numberOrNull(place.location?.longitude) };
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') ?? 'search';
  const mapplsKey = process.env.MAPPLS_API_KEY ?? process.env.MAPMYINDIA_API_KEY;
  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  try {
    if (mode === 'reverse') {
      if (!mapplsKey) return NextResponse.json({ error: 'Mappls is not configured.' }, { status: 503 });
      const lat = Number(request.nextUrl.searchParams.get('lat'));
      const lng = Number(request.nextUrl.searchParams.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: 'Invalid map point.' }, { status: 400 });
      const url = new URL(`${MAPPLS_SEARCH}/address/rev-geocode`);
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lng', String(lng));
      url.searchParams.set('region', 'IND');
      url.searchParams.set('access_token', mapplsKey);
      const place = (await fetchJson(url)).results?.[0];
      return NextResponse.json({ location: { address: place?.formatted_address ?? `Pinned location (${lat.toFixed(6)}, ${lng.toFixed(6)})`, lat, lng }, provider: 'mappls' });
    }
    if (mode === 'resolve') {
      const placeId = request.nextUrl.searchParams.get('placeId')?.trim() ?? '';
      const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';
      const location = mapplsKey ? await resolveMappls(placeId, address, mapplsKey) : googleKey && placeId ? await resolveGoogle(placeId, googleKey) : null;
      if (!location || location.lat === null || location.lng === null) return NextResponse.json({ error: 'This place has no usable map coordinates.' }, { status: 422 });
      return NextResponse.json({ location, provider: mapplsKey ? 'mappls' : 'google' });
    }
    const query = request.nextUrl.searchParams.get('query')?.trim() ?? '';
    if (query.length < 2) return NextResponse.json({ suggestions: [] });
    const latParam = request.nextUrl.searchParams.get('lat');
    const lngParam = request.nextUrl.searchParams.get('lng');
    const lat = latParam !== null && Number.isFinite(Number(latParam)) ? Number(latParam) : null;
    const lng = lngParam !== null && Number.isFinite(Number(lngParam)) ? Number(lngParam) : null;
    const context = request.nextUrl.searchParams.get('context')?.trim().slice(0, 160) ?? '';
    if (mapplsKey) {
      const suggestions = await searchMappls(query, mapplsKey, latParam, lngParam);
      return NextResponse.json({ suggestions: rankPlaces(suggestions, query, context, lat, lng), provider: 'mappls' });
    }
    if (googleKey) {
      const suggestions = await searchGoogle(query, googleKey, lat, lng);
      return NextResponse.json({ suggestions: rankPlaces(suggestions, query, context, lat, lng), provider: 'google' });
    }
    return NextResponse.json({ suggestions: [], error: 'Location provider is not configured.' }, { status: 503 });
  } catch (error) {
    console.error('Location API error:', error);
    return NextResponse.json({ suggestions: [], error: 'Location search is temporarily unavailable.' }, { status: 502 });
  }
}
