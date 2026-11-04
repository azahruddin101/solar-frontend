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

// ---------------------------------------------------------------------------------------------------------------
// Typed coordinates: "31°19'17.8"N 77°35'15.6"E", "31.321611, 77.587667", "31.321611 N, 77.587667 E", "N 31.32 E 77.58".
// Returns Google Maps order { lat, lng } (never GeoJSON [lng, lat]).

const NUM = String.raw`\d+(?:\.\d+)?(?![\d.])`;
// direction letter after the numbers ("31.3 N, 77.5 E") or before them ("N 31.3 E 77.5"); one style per input
const body = (pre, post) => String.raw`${pre}([-+])?(${NUM})\s*(?:(°)\s*(?:(${NUM})\s*'\s*(?:(${NUM})\s*(?:"|'')\s*)?)?)?${post}`;
const SUFFIX = body('()', '([NSEW])?');
const PREFIX = body(String.raw`(?:([NSEW])\s*)?`, '()');
const build = (part) => new RegExp(String.raw`^\s*${part}\s*[,;]?\s*${part}\s*$`, 'i');
const COORD_RES = [{ re: build(SUFFIX), pre: false }, { re: build(PREFIX), pre: true }];
const GROUPS = 7; // [dir-before, sign, degrees, °, minutes, seconds, dir-after]

function readPart(g) {
  const [pre, sign, deg, degSign, min, sec, post] = g;
  const d1 = pre?.toUpperCase();
  const d2 = post?.toUpperCase();
  const dir = d1 || d2 || null;
  if (sign === '-' && dir) return null; // "-31 S" is contradictory
  if (min !== undefined && (!Number.isInteger(Number(deg)) || Number(min) >= 60)) return null;
  if (sec !== undefined && (!Number.isInteger(Number(min)) || Number(sec) >= 60)) return null;
  const dms = min !== undefined;
  let value = Number(deg) + (dms ? Number(min) / 60 + Number(sec || 0) / 3600 : 0);
  if (dms) value = Math.round(value * 1e6) / 1e6; // 6 decimals is about 0.1 m
  if (sign === '-' || dir === 'S' || dir === 'W') value = -value;
  return { value, dms, degSign: Boolean(degSign), axis: dir ? (dir === 'N' || dir === 'S' ? 'lat' : 'lng') : null };
}

/** { lat, lng } for a valid typed coordinate pair, otherwise null (never throws). */
export function parseCoordinates(input) {
  if (typeof input !== 'string' || input.length > 80) return null;
  const text = input.replace(/[′’‘]/g, "'").replace(/[″”“]/g, '"').replace(/[º˚]/g, '°');
  for (const { re } of COORD_RES) {
    const m = text.match(re);
    if (!m) continue;
    const a = readPart(m.slice(1, 1 + GROUPS));
    const b = readPart(m.slice(1 + GROUPS, 1 + 2 * GROUPS));
    if (!a || !b) continue;
    // a half-typed pair such as 31°19'17.8"N 77° is not a coordinate yet
    if (a.dms !== b.dms && (a.dms ? b.degSign : a.degSign)) continue;
    const first = a.axis || (b.axis === 'lat' ? 'lng' : 'lat');
    const second = b.axis || (first === 'lat' ? 'lng' : 'lat');
    if (first === second) continue; // "31 N 40 S"
    const out = { [first]: a.value, [second]: b.value };
    if (Math.abs(out.lat) <= 90 && Math.abs(out.lng) <= 180) return { lat: out.lat, lng: out.lng };
  }
  return null;
}

/**
 * True when the text is made only of what coordinates are made of and has a coordinate marker (°, ' or ", a decimal
 * point, or a comma between numbers) - e.g. a half-typed "31°19'17.8"N 77°". Such text must never reach Places
 * Autocomplete, which would read it as a street address ("31 N 77th St").
 */
export function looksLikeCoordinates(input) {
  const t = String(input || '').trim();
  if (!/\d/.test(t) || !/^[\sNSEW0-9.,;°º˚'′’"″”+-]+$/i.test(t)) return false;
  return /[°º˚'′’"″”]/.test(t) || /\d\.\d/.test(t) || /\d\s*[,;]\s*[-+\d]/.test(t);
}
