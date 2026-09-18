// Design model: roof sections (extruded polygons with parapets), obstructions, and panel
// "tables" (rows x cols of modules on a tilted frame with front/back legs).
// Everything is in local metres around the project origin (x east, y north).

import { DEG, normalizeAzimuth } from './geo.js';
import {
  circleHitsPoly,
  cleanPolygon,
  ensureCCW,
  edges,
  offsetPolygon,
  pointInPolygon,
  polygonArea,
  polysOverlap,
  projectRange,
  rectPoly,
} from './geometry.js';

export const PANEL_SPECS = [
  { id: 'm550', name: 'Mono PERC 550 W', watts: 550, length: 2.278, width: 1.134, voc: 49.9, isc: 13.9 },
  { id: 'm590', name: 'TOPCon 590 W', watts: 590, length: 2.278, width: 1.134, voc: 52.3, isc: 14.2 },
  { id: 'm450', name: 'Mono PERC 450 W', watts: 450, length: 2.094, width: 1.038, voc: 49.3, isc: 11.6 },
  { id: 'm400', name: 'Standard 400 W', watts: 400, length: 1.879, width: 1.045, voc: 37.1, isc: 13.8 },
  { id: 'm335', name: 'Poly 335 W', watts: 335, length: 1.96, width: 0.992, voc: 46.1, isc: 9.3 },
];
export const getSpec = (id) => PANEL_SPECS.find((s) => s.id === id) || PANEL_SPECS[0];

export const PANEL_GAP = 0.025;
export const PANEL_THICKNESS = 0.035;

let seq = 0;
export const newId = (p = 'o') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

// ---------- roof sections ----------
export function normSection(s) {
  return { ...s, poly: ensureCCW(cleanPolygon(s.points)) };
}

export function topSection(sections, x, y) {
  let best = null;
  for (const s of sections) if (s.poly.length >= 3 && pointInPolygon({ x, y }, s.poly) && (!best || s.height > best.height)) best = s;
  return best;
}

export const roofHeightAt = (sections, x, y) => topSection(sections, x, y)?.height ?? 0;

/** Azimuth of the building edge normal closest to the equator-facing direction. */
export function buildingAzimuth(sections, lat) {
  const main = sections[0];
  const target = lat >= 0 ? 180 : 0;
  if (!main || main.poly.length < 3) return target;
  let best = target;
  let bestScore = Infinity;
  for (const e of edges(main.poly)) {
    if (e.length < 2) continue;
    const az = normalizeAzimuth(Math.atan2(e.outward.x, e.outward.y) / DEG);
    const diff = Math.abs(((az - target + 540) % 360) - 180);
    const score = diff - e.length * 0.2;
    if (score < bestScore) {
      bestScore = score;
      best = az;
    }
  }
  return Math.round(best);
}

export function resolveAzimuth(config, sections, lat) {
  if (config.azimuthMode === 'custom') return config.azimuth;
  if (config.azimuthMode === 'south') return lat >= 0 ? 180 : 0;
  return buildingAzimuth(sections, lat);
}

// ---------- tables ----------
export function moduleDims(spec, orientation) {
  return orientation === 'landscape' ? { slope: spec.width, cross: spec.length } : { slope: spec.length, cross: spec.width };
}

export function tableSize(t, spec) {
  const d = moduleDims(spec, t.orientation);
  const slopeLen = t.rows * d.slope + (t.rows - 1) * PANEL_GAP;
  return { ...d, width: t.cols * d.cross + (t.cols - 1) * PANEL_GAP, slopeLen, depth: slopeLen * Math.cos(t.tilt * DEG) };
}

/** Rotation for rectPoly so that its +v axis points along the facing azimuth. */
const rotOf = (az) => az;

export function tableFootprint(t, spec) {
  const s = tableSize(t, spec);
  return rectPoly(t.x, t.y, s.width, s.depth, rotOf(t.azimuth));
}

/** Row gap that avoids inter-row shading at winter-solstice 10:00–14:00. */
export function autoRowGap(tilt, slopeLen, lat) {
  if (tilt < 2) return 0.1;
  const rise = slopeLen * Math.sin(tilt * DEG);
  const alt = Math.max(15, 90 - Math.abs(lat) - 23.44 - 6);
  return Math.min(rise / Math.tan(alt * DEG), rise * 3.5) + 0.15;
}

function obstaclePolys(ctx) {
  return ctx.blocks.map((b) => rectPoly(b.x, b.y, b.w + 0.3, b.d + 0.3, b.rot || 0));
}

/** Can a rectangle (4 pts) host panels? Must sit on one roof section, clear of obstacles. */
export function rectPlacement(rect, ctx, { ignoreId = null, inset = 0.05 } = {}) {
  const c = { x: (rect[0].x + rect[2].x) / 2, y: (rect[0].y + rect[2].y) / 2 };
  const sec = topSection(ctx.sections, c.x, c.y);
  if (!sec) return { ok: false, reason: 'Outside the roof' };
  const inner = ctx.insets.get(sec.id + ':' + inset) || ctx.insets.set(sec.id + ':' + inset, offsetPolygon(sec.poly, inset)).get(sec.id + ':' + inset);
  if (inner.length < 3) return { ok: false, reason: 'Roof too small' };
  for (const p of rect) if (!pointInPolygon(p, inner)) return { ok: false, reason: 'Crosses the parapet' };
  for (const v of inner) if (pointInPolygon(v, rect)) return { ok: false, reason: 'Crosses the parapet' };
  for (const s of ctx.sections) if (s.id !== sec.id && s.height > sec.height && polysOverlap(rect, s.poly)) return { ok: false, reason: 'Hits a raised roof' };
  for (const b of ctx.obstaclePolys) if (polysOverlap(rect, b)) return { ok: false, reason: 'Hits an obstruction' };
  for (const t of ctx.trees) if (circleHitsPoly(t, t.r * 0.6, rect)) return { ok: false, reason: 'Under a tree' };
  for (const o of ctx.fixed) if (o.id !== ignoreId && polysOverlap(rect, o.poly)) return { ok: false, reason: 'Overlaps another array' };
  return { ok: true, section: sec };
}

function fillZone(zone, ctx) {
  const { spec, lat } = ctx;
  const poly = ensureCCW(cleanPolygon(zone.points));
  if (poly.length < 3) return [];
  const proto = { rows: zone.rowsPerTable, cols: 1, tilt: zone.tilt, orientation: zone.orientation };
  const size = tableSize(proto, spec);
  const gap = zone.rowGap > 0 ? zone.rowGap : autoRowGap(zone.tilt, size.slopeLen, lat);
  const rowPitch = size.depth + gap;
  const colPitch = size.cross + PANEL_GAP;
  const f = { x: Math.sin(zone.azimuth * DEG), y: Math.cos(zone.azimuth * DEG) };
  const c = { x: f.y, y: -f.x };
  const [cMin, cMax] = projectRange(poly, c.x, c.y);
  const [fMin, fMax] = projectRange(poly, f.x, f.y);
  const at = (u, v) => ({ x: u * c.x + v * f.x, y: u * c.y + v * f.y });

  let best = [];
  let bestCount = -1;
  for (let ov = 0; ov < 1; ov += 0.25) {
    for (let ou = 0; ou < 1; ou += 0.25) {
      const tables = [];
      let count = 0;
      for (let v = fMax - size.depth / 2 - ov * rowPitch; v >= fMin + size.depth / 2; v -= rowPitch) {
        let run = [];
        const flush = () => {
          if (!run.length) return;
          const u = (run[0] + run[run.length - 1]) / 2;
          const p = at(u, v);
          tables.push({ ...proto, id: `${zone.id}-${tables.length}`, source: zone.id, kind: 'zone', x: p.x, y: p.y, cols: run.length, azimuth: zone.azimuth, frontLeg: zone.frontLeg });
          count += run.length * proto.rows;
          run = [];
        };
        for (let u = cMin + size.cross / 2 + ou * colPitch; u <= cMax - size.cross / 2; u += colPitch) {
          const p = at(u, v);
          const rect = rectPoly(p.x, p.y, size.cross, size.depth, zone.azimuth);
          const inZone = rect.every((q) => pointInPolygon(q, poly)) && !poly.some((q) => pointInPolygon(q, rect));
          if (inZone && rectPlacement(rect, ctx, { inset: ctx.setback }).ok && (!zone.maxCols || run.length < zone.maxCols)) run.push(u);
          else {
            flush();
            if (inZone && rectPlacement(rect, ctx, { inset: ctx.setback }).ok) run.push(u);
          }
        }
        flush();
      }
      if (count > bestCount) {
        bestCount = count;
        best = tables;
      }
    }
  }
  return best;
}

/** Expand a table into module poses + legs. */
function expandTable(t, ctx) {
  const { spec, sections } = ctx;
  const s = tableSize(t, spec);
  const f = { x: Math.sin(t.azimuth * DEG), y: Math.cos(t.azimuth * DEG) };
  const c = { x: f.y, y: -f.x };
  const poly = rectPoly(t.x, t.y, s.width, s.depth, t.azimuth);
  const base = Math.max(...poly.map((p) => roofHeightAt(sections, p.x, p.y)), roofHeightAt(sections, t.x, t.y));
  const sin = Math.sin(t.tilt * DEG);
  const cos = Math.cos(t.tilt * DEG);
  const modules = [];
  for (let r = 0; r < t.rows; r++) {
    for (let k = 0; k < t.cols; k++) {
      const sl = r * (s.slope + PANEL_GAP) + s.slope / 2;
      const u = -s.width / 2 + k * (s.cross + PANEL_GAP) + s.cross / 2;
      const v = s.depth / 2 - sl * cos;
      const x = t.x + c.x * u + f.x * v;
      const y = t.y + c.y * u + f.y * v;
      const z = base + t.frontLeg + sl * sin + PANEL_THICKNESS / 2;
      modules.push({
        id: `${t.id}:${r}:${k}`,
        tableId: t.id,
        x,
        y,
        z,
        tilt: t.tilt,
        azimuth: t.azimuth,
        dims: s,
        corners: rectPoly(x, y, s.cross, s.slope * cos, t.azimuth),
        position: [x, z, -y],
        rotation: [t.tilt * DEG, Math.PI - t.azimuth * DEG, 0, 'YXZ'],
      });
    }
  }
  // legs: front & back rows, roughly every 2 modules across
  const legs = [];
  const n = Math.max(2, Math.round(s.width / (s.cross * 2)) + 1);
  const inset = Math.min(0.3, s.slopeLen * 0.15);
  for (let i = 0; i < n; i++) {
    const u = -s.width / 2 + 0.15 + ((s.width - 0.3) * i) / (n - 1);
    for (const sl of [inset, s.slopeLen - inset]) {
      const v = s.depth / 2 - sl * cos;
      const x = t.x + c.x * u + f.x * v;
      const y = t.y + c.y * u + f.y * v;
      const ground = roofHeightAt(sections, x, y);
      legs.push({ x, y, base: ground, h: Math.max(0.05, base + t.frontLeg + sl * sin - ground) });
    }
  }
  return { ...t, poly, base, size: s, modules, legs, backLeg: t.frontLeg + s.slopeLen * sin };
}

/** Build everything derived from the stored design. */
export function buildDesign({ sections: rawSections, objects, config, lat }) {
  const sections = rawSections.map(normSection).filter((s) => s.poly.length >= 3);
  const spec = getSpec(config.specId);
  const trees = objects.filter((o) => o.type === 'tree');
  const blocks = objects.filter((o) => o.type === 'block');
  const ctx = { sections, spec, lat, trees, blocks, setback: config.setback, insets: new Map(), fixed: [] };
  ctx.obstaclePolys = obstaclePolys(ctx);

  // manual arrays first (zones flow around them)
  const manual = objects.filter((o) => o.type === 'array').map((o) => ({ ...o, kind: o.elevated ? 'elevated' : 'array', source: o.id }));
  ctx.fixed = manual.map((t) => ({ id: t.id, poly: tableFootprint(t, spec) }));
  const tables = [];
  for (const t of manual) {
    const placement = rectPlacement(tableFootprint(t, spec), ctx, { ignoreId: t.id, inset: 0.05 });
    tables.push({ ...expandTable(t, ctx), valid: placement.ok, reason: placement.reason });
  }
  for (const z of objects.filter((o) => o.type === 'zone')) {
    for (const t of fillZone(z, ctx)) tables.push({ ...expandTable(t, ctx), valid: true });
  }

  const modules = tables.filter((t) => t.valid).flatMap((t) => t.modules);
  const roofArea = sections.length ? polygonArea(sections[0].poly) : 0;
  return { sections, spec, trees, blocks, tables, modules, roofArea, ctx };
}
