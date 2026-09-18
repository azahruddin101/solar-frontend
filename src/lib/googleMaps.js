'use client';

// Minimal async loader for the Maps JavaScript API (libraries are pulled with importLibrary).

export const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

let loadPromise = null;
const authListeners = new Set();

export function onMapsAuthFailure(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps can only load in the browser'));
  if (!MAPS_API_KEY) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set'));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const callback = '__solarPlannerMapsReady';
    window[callback] = () => resolve(window.google.maps);
    window.gm_authFailure = () => authListeners.forEach((fn) => fn());
    const script = document.createElement('script');
    const params = new URLSearchParams({ key: MAPS_API_KEY, v: 'weekly', loading: 'async', callback });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Could not load the Google Maps script (network or ad-blocker?)'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export async function importLibrary(name) {
  const maps = await loadGoogleMaps();
  return maps.importLibrary(name);
}
