import { apiUrl, tokens } from './api.js';
import { metersPerPixel } from './geo.js';

/** Pick a zoom so a 640px static map covers `spanMeters` * `margin`. */
export function zoomForSpan(lat, spanMeters, margin = 3) {
  for (let z = 21; z >= 15; z--) {
    if (640 * metersPerPixel(lat, z) >= spanMeters * margin) return z;
  }
  return 15;
}

export function staticMapUrl({ lat, lng, zoom, polygon = null, maptype = 'satellite' }) {
  const params = new URLSearchParams({ lat: lat.toFixed(7), lng: lng.toFixed(7), zoom: String(zoom), maptype });
  if (polygon?.length >= 3) params.set('pts', polygon.map((p) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`).join(';'));
  params.set('token', tokens.get()); // <img> / WebGL texture requests cannot send an Authorization header
  return apiUrl(`/api/staticmap?${params}`);
}

/** Ground size in metres covered by a 640px static map at this zoom. */
export function staticMapSize(lat, zoom) {
  return 640 * metersPerPixel(lat, zoom);
}
