'use client';

import { latLngCentroid } from './geo.js';
import { useStore } from './store.js';

export function finishPolygon() {
  const s = useStore.getState();
  if (s.polygon.length < 3) return false;
  s.closePolygon(latLngCentroid(s.polygon));
  return true;
}

export function undoPoint() {
  const s = useStore.getState();
  if (s.closed || !s.polygon.length) return;
  s.setPolygon(s.polygon.slice(0, -1));
}

/** Rectangle from the Solar API building bounding box as a starting outline. */
export function polygonFromSolarBounds() {
  const s = useStore.getState();
  const bb = s.solar.data?.boundingBox;
  if (!bb?.sw || !bb?.ne) return false;
  const { sw, ne } = bb;
  const poly = [
    { lat: sw.latitude, lng: sw.longitude },
    { lat: sw.latitude, lng: ne.longitude },
    { lat: ne.latitude, lng: ne.longitude },
    { lat: ne.latitude, lng: sw.longitude },
  ];
  s.clearPolygon();
  s.setPolygon(poly, false);
  s.closePolygon(latLngCentroid(poly));
  return true;
}

export const SEGMENT_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#6366f1'];

export const SAMPLE_PROJECT = {
  place: { name: 'Sample house', address: 'Sample footprint · Bengaluru, India', location: { lat: 12.97159, lng: 77.59456 } },
  polygon: [
    { lat: 12.971655, lng: 77.594480 },
    { lat: 12.971655, lng: 77.594640 },
    { lat: 12.971560, lng: 77.594640 },
    { lat: 12.971560, lng: 77.594560 },
    { lat: 12.971500, lng: 77.594560 },
    { lat: 12.971500, lng: 77.594480 },
  ],
};

export function loadSampleProject() {
  const s = useStore.getState();
  s.resetAll();
  s.setPlace(SAMPLE_PROJECT.place);
  s.setPolygon(SAMPLE_PROJECT.polygon, false);
  finishPolygon();
  useStore.getState().setStep(2);
}
