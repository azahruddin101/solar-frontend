// Conversions between WGS84 lat/lng and a local east/north tangent plane (metres).
// At building scale (< 1 km) an equirectangular projection is accurate to millimetres.

const EARTH_RADIUS = 6378137;
export const DEG = Math.PI / 180;

/** lat/lng -> local {x: east, y: north} metres relative to `origin`. */
export function toLocal(p, origin) {
  return {
    x: (p.lng - origin.lng) * DEG * EARTH_RADIUS * Math.cos(origin.lat * DEG),
    y: (p.lat - origin.lat) * DEG * EARTH_RADIUS,
  };
}

/** local {x, y} metres -> lat/lng. */
export function toLatLng(pt, origin) {
  return {
    lat: origin.lat + pt.y / EARTH_RADIUS / DEG,
    lng: origin.lng + pt.x / (EARTH_RADIUS * Math.cos(origin.lat * DEG)) / DEG,
  };
}

/** Area-weighted centroid of a lat/lng polygon. */
export function latLngCentroid(points) {
  if (!points.length) return null;
  const ref = points[0];
  const local = points.map((p) => toLocal(p, ref));
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < local.length; i++) {
    const p = local[i];
    const q = local[(i + 1) % local.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    const avg = local.reduce((s, p) => ({ x: s.x + p.x / local.length, y: s.y + p.y / local.length }), { x: 0, y: 0 });
    return toLatLng(avg, ref);
  }
  return toLatLng({ x: cx / (3 * a), y: cy / (3 * a) }, ref);
}

/** Ground metres per (logical) pixel for Google/Web-Mercator tiles. */
export function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos(lat * DEG)) / 2 ** zoom;
}

export function distanceMeters(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(s));
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** 0..360 compass bearing -> "SSW" style label. */
export function compassLabel(azimuth) {
  const a = ((azimuth % 360) + 360) % 360;
  return COMPASS[Math.round(a / 22.5) % 16];
}

export function normalizeAzimuth(a) {
  return ((a % 360) + 360) % 360;
}
