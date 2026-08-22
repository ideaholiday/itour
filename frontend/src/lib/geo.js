export function normalizePolygon(points = []) {
  const valid = points
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180);
  if (valid.length < 3) return valid;
  const [firstLat, firstLng] = valid[0];
  const [lastLat, lastLng] = valid[valid.length - 1];
  return firstLat === lastLat && firstLng === lastLng ? valid : [...valid, [firstLat, firstLng]];
}

export function pointInPolygon(point, polygon) {
  const [lat, lng] = point.map(Number);
  const ring = normalizePolygon(polygon);
  if (ring.length < 4) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    const intersects = (lngI > lng) !== (lngJ > lng) && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI || Number.EPSILON) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distanceKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const [lat1, lng1] = a.map(Number);
  const [lat2, lng2] = b.map(Number);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function isPointCovered(point, zone) {
  const polygon = normalizePolygon(zone.polygon_coordinates || zone.polygonPoints || []);
  if (polygon.length >= 4) return pointInPolygon(point, polygon);
  return distanceKm(point, [zone.center_lat ?? zone.centerLat, zone.center_lng ?? zone.centerLng]) <= Number(zone.radius_km ?? zone.radiusKm ?? 0);
}

export function polygonAreaKm2(points) {
  const ring = normalizePolygon(points);
  if (ring.length < 4) return 0;
  const meanLat = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
  const scaleX = 111.32 * Math.cos((meanLat * Math.PI) / 180);
  const scaleY = 110.574;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) area += ring[i][1] * scaleX * ring[i + 1][0] * scaleY - ring[i + 1][1] * scaleX * ring[i][0] * scaleY;
  return Math.abs(area) / 2;
}

export function createRadiusPolygon(center, radiusKm, sides = 20) {
  const [lat, lng] = center.map(Number);
  const latOffset = Number(radiusKm) / 110.574;
  const lngOffset = Number(radiusKm) / (111.32 * Math.cos((lat * Math.PI) / 180));
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    return [Number((lat + Math.sin(angle) * latOffset).toFixed(6)), Number((lng + Math.cos(angle) * lngOffset).toFixed(6))];
  });
  return normalizePolygon(points);
}
