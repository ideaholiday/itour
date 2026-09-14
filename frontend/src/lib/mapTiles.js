import L from "leaflet";

// One base map for every Leaflet view. The backend proxies Ola Maps tiles so no
// key reaches the browser, and redirects to OpenStreetMap without Ola credentials.
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || "/api/maps/tiles/{z}/{x}/{y}.png";
const ATTRIBUTION = import.meta.env.VITE_MAP_TILE_ATTRIBUTION
  || '&copy; <a href="https://maps.olakrutrim.com">Ola Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function addBaseTiles(map, { maxZoom = 19 } = {}) {
  return L.tileLayer(TILE_URL, { maxZoom, attribution: ATTRIBUTION }).addTo(map);
}
