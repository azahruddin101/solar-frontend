import { useEffect, useState } from 'react';
import { api, apiUrl } from './api.js';
import { metersPerPixel } from './geo.js';

/** Pick a zoom so a 640px static map covers `spanMeters` * `margin`. */
export function zoomForSpan(lat, spanMeters, margin = 3) {
  for (let z = 21; z >= 15; z--) {
    if (640 * metersPerPixel(lat, z) >= spanMeters * margin) return z;
  }
  return 15;
}

// The satellite image is loaded by <img> / WebGL, which cannot send an Authorization header. It carries a short-lived,
// single-purpose map token (never the login token), fetched once and renewed before it expires.
const MAP_TOKEN_REFRESH_MS = 10 * 60 * 1000; // tokens last 15 minutes
let mapToken = '';
let mapTokenAt = 0;
let mapTokenRequest = null;

async function fetchMapToken() {
  const r = await api('/api/staticmap/token');
  mapToken = r.token;
  mapTokenAt = Date.now();
  return mapToken;
}

/** Resolves once a map token is available (fetching or renewing it when needed). */
export function ensureMapToken() {
  if (mapToken && Date.now() - mapTokenAt < MAP_TOKEN_REFRESH_MS) return Promise.resolve(mapToken);
  mapTokenRequest ||= fetchMapToken().finally(() => { mapTokenRequest = null; });
  return mapTokenRequest;
}

// On the public proposal page nobody is signed in: the 3D ground image is fetched with the proposal's share token instead.
let publicToken = '';
export const setPublicMapToken = (t) => { publicToken = t || ''; };

export const clearMapToken = () => { mapToken = ''; mapTokenAt = 0; };

/** True once the map token is ready; keeps it fresh while the component using it stays mounted. */
export function useMapToken() {
  const [ready, setReady] = useState(Boolean(mapToken) || Boolean(publicToken));
  useEffect(() => {
    if (publicToken) return undefined; // no map token to fetch on the public page
    let alive = true;
    const renew = () => ensureMapToken().then(() => alive && setReady(true)).catch(() => alive && setReady(true)); // an image error is shown by the map itself
    renew();
    const t = setInterval(renew, MAP_TOKEN_REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return ready;
}

export function staticMapUrl({ lat, lng, zoom, polygon = null, maptype = 'satellite' }) {
  const params = new URLSearchParams({ lat: lat.toFixed(7), lng: lng.toFixed(7), zoom: String(zoom), maptype });
  if (polygon?.length >= 3) params.set('pts', polygon.map((p) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`).join(';'));
  if (publicToken) {
    params.set('st', publicToken);
    return apiUrl(`/api/public/staticmap?${params}`);
  }
  params.set('mt', mapToken);
  return apiUrl(`/api/staticmap?${params}`);
}

/** Ground size in metres covered by a 640px static map at this zoom. */
export function staticMapSize(lat, zoom) {
  return 640 * metersPerPixel(lat, zoom);
}
