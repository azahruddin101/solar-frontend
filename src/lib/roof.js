// Parametric roof model built from a CCW footprint (local metres).
// Every roof is a set of planar faces h(x, y) = a*x + b*y + c. Planes are derived from the
// wall line (footprint) so the eave sits exactly at wall height; face polygons use the
// outward-offset footprint so pitched roofs get an overhang.

import { clipHalfPlane, isConvex, offsetPolygon, polygonArea, projectRange } from './geometry.js';
import { DEG, normalizeAzimuth } from './geo.js';

export const ROOF_TYPES = [
  { id: 'flat', label: 'Flat' },
  { id: 'gable', label: 'Gable' },
  { id: 'hip', label: 'Hip' },
  { id: 'shed', label: 'Shed' },
];

const dirOf = (az) => ({ x: Math.sin(az * DEG), y: Math.cos(az * DEG) });

export function azimuthOfVector(x, y) {
  return normalizeAzimuth(Math.atan2(x, y) / DEG);
}

export function buildRoofModel(footprint, building) {
  const eaveH = building.floors * building.floorHeight;
  let type = building.roofType;
  const hipFallback = type === 'hip' && !isConvex(footprint);
  if (hipFallback) type = 'gable';

  const pitch = type === 'flat' ? 0 : Math.min(60, Math.max(5, building.roofPitch));
  const t = Math.tan(pitch * DEG);
  const overhang = type === 'flat' ? 0 : Math.max(0, building.overhang || 0);
  const outer = overhang > 0 ? offsetPolygon(footprint, -overhang) : footprint;
  const az = normalizeAzimuth(building.roofAzimuth ?? 180);

  let faces = [];
  let heightAt;
  let faceIndexAt;
  let edgeBreaks = () => [];

  if (type === 'flat') {
    faces = [{ poly: footprint, a: 0, b: 0, c: eaveH, pitch: 0, azimuth: null }];
    heightAt = () => eaveH;
    faceIndexAt = () => 0;
  } else if (type === 'shed') {
    const f = dirOf(az);
    const [, maxP] = projectRange(footprint, f.x, f.y);
    faces = [{ poly: outer, a: -t * f.x, b: -t * f.y, c: eaveH + t * maxP, pitch, azimuth: az }];
    heightAt = (x, y) => eaveH + t * (maxP - (x * f.x + y * f.y));
    faceIndexAt = () => 0;
  } else if (type === 'gable') {
    const f = dirOf(az);
    const [minP, maxP] = projectRange(footprint, f.x, f.y);
    const mid = (minP + maxP) / 2;
    const half = (maxP - minP) / 2;
    faces = [
      {
        poly: clipHalfPlane(outer, f.x, f.y, -mid),
        a: -t * f.x,
        b: -t * f.y,
        c: eaveH + t * (half + mid),
        pitch,
        azimuth: az,
      },
      {
        poly: clipHalfPlane(outer, -f.x, -f.y, mid),
        a: t * f.x,
        b: t * f.y,
        c: eaveH + t * (half - mid),
        pitch,
        azimuth: normalizeAzimuth(az + 180),
      },
    ];
    const proj = (x, y) => x * f.x + y * f.y - mid;
    heightAt = (x, y) => eaveH + t * (half - Math.abs(proj(x, y)));
    faceIndexAt = (x, y) => (proj(x, y) >= 0 ? 0 : 1);
    edgeBreaks = (p, q) => {
      const pa = proj(p.x, p.y);
      const pb = proj(q.x, q.y);
      return pa * pb < 0 ? [pa / (pa - pb)] : [];
    };
  } else {
    // hip (convex footprint): h = eave + t * min_i dist(p, edge_i)
    const n = footprint.length;
    const lines = footprint.map((v, i) => {
      const w = footprint[(i + 1) % n];
      const l = Math.hypot(w.x - v.x, w.y - v.y) || 1;
      const nx = -(w.y - v.y) / l;
      const ny = (w.x - v.x) / l;
      return { nx, ny, k: nx * v.x + ny * v.y };
    });
    faces = lines.map((li, i) => {
      let poly = outer;
      lines.forEach((lj, j) => {
        if (j === i || poly.length < 3) return;
        poly = clipHalfPlane(poly, lj.nx - li.nx, lj.ny - li.ny, -(lj.k - li.k));
      });
      return {
        poly,
        a: t * li.nx,
        b: t * li.ny,
        c: eaveH - t * li.k,
        pitch,
        azimuth: azimuthOfVector(-li.nx, -li.ny),
      };
    });
    const dists = (x, y) => lines.map((l) => l.nx * x + l.ny * y - l.k);
    heightAt = (x, y) => eaveH + t * Math.min(...dists(x, y));
    faceIndexAt = (x, y) => {
      const d = dists(x, y);
      let best = 0;
      for (let i = 1; i < d.length; i++) if (d[i] < d[best]) best = i;
      return best;
    };
  }

  faces = faces.map((f, i) => ({ ...f, index: i, area: f.poly.length >= 3 ? polygonArea(f.poly) : 0 }));
  let ridgeH = eaveH;
  for (const f of faces) for (const p of f.poly) ridgeH = Math.max(ridgeH, f.a * p.x + f.b * p.y + f.c);

  return {
    type,
    requestedType: building.roofType,
    hipFallback,
    eaveH,
    ridgeH,
    pitch,
    overhang,
    faces,
    outer,
    heightAt,
    faceAt: (x, y) => faces[faceIndexAt(x, y)],
    edgeBreaks,
  };
}

/** Roof direction that puts slopes perpendicular to the longest wall, favouring the equator-facing side. */
export function defaultRoofAzimuth(footprint, lat) {
  let best = null;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (!best || l > best.l) best = { l, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l };
  }
  if (!best) return lat >= 0 ? 180 : 0;
  const az1 = azimuthOfVector(best.dy, -best.dx);
  const az2 = normalizeAzimuth(az1 + 180);
  const target = lat >= 0 ? 180 : 0;
  const diff = (a) => Math.abs(((a - target + 540) % 360) - 180);
  return Math.round(diff(az1) <= diff(az2) ? az1 : az2);
}
