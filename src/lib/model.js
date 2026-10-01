// Design model: roof sections (extruded polygons — flat with parapets, or sloped), obstructions, and panel
// "tables" (rows x cols of modules on a tilted frame with front/back legs).
// Everything is in local metres around the project origin (x east, y north).

import { buildingIdOf, buildingList } from './buildings.js';
import { DEG, normalizeAzimuth } from './geo.js';
import {
  circleHitsPoly,
  cleanPolygon,
  clipHalfPlane,
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
// A section is flat (terrace, optional parapet) or sloped:
//   shed  – one plane falling towards `slopeAz`
//   gable – two planes meeting at a ridge; one faces `slopeAz`, the other the opposite way
// `height` is the wall (eave) height, `pitch` the slope in degrees, `slopeAz` a compass bearing.
// `ridge` (gable, 0.15–0.85, default 0.5) is the share of the roof's depth covered by the slope that
// faces `slopeAz`. `rise2` (gable, metres, optional) is how far the *other* slope climbs from its own
// edge to the ridge. Left out, both roof edges sit at the wall height; set, that side's edge ends up
// higher or lower than the other — an uneven roof (say 1 m on one side and 2 m on the other).
export const ROOF_TYPES = [
  { id: 'flat', label: 'Flat' },
  { id: 'shed', label: 'Single slope' },
  { id: 'gable', label: 'Two slopes (gable)' },
];
/** Panels on a sloped roof sit on hooks this far above the surface (m). */
export const FLUSH_STANDOFF = 0.1;

export const isSloped = (s) => (s?.roofType === 'shed' || s?.roofType === 'gable') && s.pitch > 0;

export function normSection(s) {
  const poly = ensureCCW(cleanPolygon(s.points));
  if (!isSloped(s) || poly.length < 3) return { ...s, poly, roofType: 'flat', frame: null };
  const az = normalizeAzimuth(s.slopeAz ?? 180);
  const f = { x: Math.sin(az * DEG), y: Math.cos(az * DEG) }; // downhill direction of the plane facing `az`
  const [dMin, dMax] = projectRange(poly, f.x, f.y);
  const pitch = Math.min(60, Math.max(1, s.pitch));
  const tan = Math.tan(pitch * DEG);
  const gable = s.roofType === 'gable';
  const ridge = gable ? Math.min(0.85, Math.max(0.15, s.ridge ?? 0.5)) : 1;
  const dMid = dMax - ridge * (dMax - dMin); // plan position of the ridge (a shed's "ridge" is its high edge)
  const rise = (dMax - dMid) * tan; // ridge height above the walls
  const span2 = dMid - dMin;
  // the other slope: at most 60° steep, and its edge never drops below half a metre above the ground
  const rise2 = gable ? Math.min(Math.max(0.05, s.rise2 > 0 ? s.rise2 : rise), span2 * Math.tan(60 * DEG), s.height + rise - 0.5) : 0;
  const tan2 = gable ? rise2 / span2 : 0;
  const eave2 = gable ? s.height + rise - rise2 : s.height; // height of the other slope's low edge
  const frame = { f, az, dMin, dMax, dMid, tan, tan2, rise, rise2, eave2, wallBase: Math.min(s.height, eave2), ridge, pitch2: gable ? Math.round((Math.atan(tan2) / DEG) * 10) / 10 : 0 };
  // a pitched roof has no boundary wall
  return { ...s, poly, pitch, slopeAz: az, parapetH: 0, frame };
}

/** Roof surface height at a point of this section. */
export function roofZ(sec, x, y) {
  const fr = sec.frame;
  if (!fr) return sec.height;
  const d = x * fr.f.x + y * fr.f.y;
  if (d >= fr.dMid) return sec.height + Math.max(0, fr.dMax - d) * fr.tan;
  return fr.eave2 + Math.max(0, d - fr.dMin) * fr.tan2;
}

export const ridgeHeight = (sec) => sec.height + (sec.frame ? sec.frame.rise : 0);

/** The plane under a point: panels laid flush take this tilt and facing. */
export function planeAt(sec, x, y) {
  const fr = sec.frame;
  if (!fr) return null;
  const uphillSide = sec.roofType === 'gable' && x * fr.f.x + y * fr.f.y < fr.dMid;
  return { tilt: uphillSide ? fr.pitch2 : sec.pitch, azimuth: normalizeAzimuth(fr.az + (uphillSide ? 180 : 0)) };
}

/** The slopes of a section as plan polygons with their facing: 1 for a shed, 2 for a gable, none for flat. */
export function roofPlanes(sec) {
  const fr = sec.frame;
  if (!fr) return [];
  if (sec.roofType !== 'gable') return [{ poly: sec.poly, azimuth: fr.az, tilt: sec.pitch }];
  return [
    { poly: clipHalfPlane(sec.poly, fr.f.x, fr.f.y, -fr.dMid), azimuth: fr.az, tilt: sec.pitch }, // the downhill half (d ≥ dMid) faces `az`
    { poly: clipHalfPlane(sec.poly, -fr.f.x, -fr.f.y, fr.dMid), azimuth: normalizeAzimuth(fr.az + 180), tilt: fr.pitch2 },
  ].filter((p) => p.poly.length >= 3);
}

/** Ridge of a gable roof as a segment [a, b] in plan, or null. */
export function ridgeSegment(sec) {
  const fr = sec.frame;
  if (!fr || sec.roofType !== 'gable') return null;
  const pts = [];
  for (let i = 0; i < sec.poly.length; i++) {
    const a = sec.poly[i];
    const b = sec.poly[(i + 1) % sec.poly.length];
    const da = a.x * fr.f.x + a.y * fr.f.y - fr.dMid;
    const db = b.x * fr.f.x + b.y * fr.f.y - fr.dMid;
    if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
      const t = da / (da - db);
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (pts.length < 2) return null;
  const along = (p) => p.x * fr.f.y - p.y * fr.f.x;
  pts.sort((p, q) => along(p) - along(q));
  return [pts[0], pts[pts.length - 1]];
}

export function topSection(sections, x, y) {
  let best = null;
  let bestZ = -Infinity;
  for (const s of sections) {
    if (s.poly.length < 3 || !pointInPolygon({ x, y }, s.poly)) continue;
    const z = roofZ(s, x, y);
    if (z > bestZ) {
      best = s;
      bestZ = z;
    }
  }
  return best;
}

export function roofHeightAt(sections, x, y) {
  const sec = topSection(sections, x, y);
  return sec ? roofZ(sec, x, y) : 0;
}

/**
 * Where panels may be auto-placed on a section, as fill zones. A flat roof is one zone using the
 * design's tilt / facing / leg height. A sloped roof gives one zone per slope, with panels flush on
 * it; the slope facing the equator comes first so a limited panel count goes to the better side.
 */
export function zonesForSection(sec, config, defaultAzimuth, lat, idPrefix = 'z') {
  const shared = { type: 'zone', rowsPerTable: config.rowsPerTable, orientation: config.orientation };
  if (!sec.frame) {
    const inner = offsetPolygon(sec.poly, 0.05);
    return [{ ...shared, id: `${idPrefix}-${sec.id}`, points: inner.length >= 3 ? inner : sec.poly, tilt: config.tilt, azimuth: defaultAzimuth, frontLeg: config.frontLeg, rowGap: config.rowGap }];
  }
  const sunward = lat >= 0 ? 180 : 0;
  const away = (az) => Math.abs(((az - sunward + 540) % 360) - 180);
  return roofPlanes(sec)
    .sort((a, b) => away(a.azimuth) - away(b.azimuth))
    // one panel row per table, packed edge to edge: rows on the same plane never shade each other
    .map((pl, i) => ({ ...shared, id: `${idPrefix}-${sec.id}-${i}`, points: pl.poly, tilt: pl.tilt, azimuth: pl.azimuth, frontLeg: FLUSH_STANDOFF, rowsPerTable: 1, rowGap: 0.03, flush: true }));
}

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

/** The facing panels get on this section: in "follow the building" mode, that of the section's own building. */
export function sectionAzimuth(config, sections, lat, section) {
  if (config.azimuthMode === 'custom' || config.azimuthMode === 'south') return resolveAzimuth(config, sections, lat);
  const own = sections.filter((s) => s.building === section.building);
  return buildingAzimuth(own.length ? own : sections, lat);
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
  // a terrace keeps a walkway along the parapet; a pitched roof only needs a small margin from its edges
  if (sec.frame) inset = Math.min(inset, 0.3);
  const inner = ctx.insets.get(sec.id + ':' + inset) || ctx.insets.set(sec.id + ':' + inset, offsetPolygon(sec.poly, inset)).get(sec.id + ':' + inset);
  if (inner.length < 3) return { ok: false, reason: 'Roof too small' };
  const edge = sec.frame ? 'Too close to the roof edge' : 'Crosses the parapet';
  for (const p of rect) if (!pointInPolygon(p, inner)) return { ok: false, reason: edge };
  for (const v of inner) if (pointInPolygon(v, rect)) return { ok: false, reason: edge };
  if (sec.frame && sec.roofType === 'gable') {
    // every corner on the same side of the ridge, with a little clearance from it
    const side = rect.map((p) => p.x * sec.frame.f.x + p.y * sec.frame.f.y - sec.frame.dMid);
    if (!(side.every((d) => d > 0.15) || side.every((d) => d < -0.15))) return { ok: false, reason: 'Crosses the ridge' };
  }
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
          tables.push({ ...proto, id: `${zone.id}-${tables.length}`, source: zone.id, kind: 'zone', x: p.x, y: p.y, cols: run.length, azimuth: zone.azimuth, frontLeg: zone.frontLeg, flush: Boolean(zone.flush) });
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
  // flat roof: clear the highest point under the table. Sloped roof: follow the surface, measured
  // under the low (front) edge — the table has the roof's own tilt, so it stays parallel to it.
  const base = t.flush
    ? roofHeightAt(sections, t.x + f.x * (s.depth / 2), t.y + f.y * (s.depth / 2))
    : Math.max(...poly.map((p) => roofHeightAt(sections, p.x, p.y)), roofHeightAt(sections, t.x, t.y));
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
export function buildDesign({ sections: rawSections, objects, config, lat, spec: givenSpec, buildings: rawBuildings }) {
  // every section knows its building; a building's first section is its main roof
  const list = buildingList(rawBuildings);
  const mains = new Set();
  const sections = rawSections.map(normSection).filter((s) => s.poly.length >= 3).map((s) => {
    const building = buildingIdOf(s, list);
    const main = !mains.has(building);
    mains.add(building);
    return { ...s, building, main };
  });
  const buildings = list.filter((b) => mains.has(b.id));
  if (!buildings.length) buildings.push(list[0]);
  const spec = givenSpec || getSpec(config.specId);
  const trees = objects.filter((o) => o.type === 'tree');
  const blocks = objects.filter((o) => o.type === 'block');
  const ctx = { sections, spec, lat, trees, blocks, setback: config.setback, insets: new Map(), fixed: [] };
  ctx.obstaclePolys = obstaclePolys(ctx);

  // manual arrays first (zones flow around them)
  const manual = objects.filter((o) => o.type === 'array').map((o) => {
    const sec = topSection(sections, o.x, o.y);
    const plane = sec && planeAt(sec, o.x, o.y);
    // on a sloped roof a group always lies flush with the slope it is on, whatever tilt it was given
    return plane ? { ...o, ...plane, frontLeg: FLUSH_STANDOFF, flush: true, kind: 'array', source: o.id } : { ...o, flush: false, kind: o.elevated ? 'elevated' : 'array', source: o.id };
  });
  ctx.fixed = manual.map((t) => ({ id: t.id, poly: tableFootprint(t, spec) }));
  const tables = [];
  for (const t of manual) {
    const placement = rectPlacement(tableFootprint(t, spec), ctx, { ignoreId: t.id, inset: 0.05 });
    tables.push({ ...expandTable(t, ctx), valid: placement.ok, reason: placement.reason });
  }
  // zones: fill, then cap to the panel limit (target capacity) before expanding
  let budget = config.maxPanels > 0 ? Math.max(0, config.maxPanels - tables.filter((t) => t.valid).reduce((a, t) => a + t.modules.length, 0)) : Infinity;
  for (const z of objects.filter((o) => o.type === 'zone')) {
    for (const t of fillZone(z, ctx)) {
      if (budget <= 0) break;
      // trim the last table to the remaining budget (fewer columns, or a single short row)
      const rows = Math.min(t.rows, budget);
      const cols = Math.max(1, Math.min(t.cols, Math.floor(budget / rows)));
      budget -= cols * rows;
      tables.push({ ...expandTable({ ...t, rows, cols }, ctx), valid: true });
    }
  }

  // panels belong to the building whose roof they stand on
  for (const t of tables) {
    t.building = topSection(sections, t.x, t.y)?.building || buildings[0].id;
    for (const m of t.modules) m.building = t.building;
  }
  const modules = tables.filter((t) => t.valid).flatMap((t) => t.modules);
  const roofArea = sections.filter((s) => s.main).reduce((a, s) => a + polygonArea(s.poly), 0);
  return { sections, buildings, spec, trees, blocks, tables, modules, roofArea, ctx };
}

/**
 * Magnetic placement for a dragged group: lines it up with nearby groups and, if it overlaps
 * something slightly, nudges it to the nearest free spot (max ~0.8 m).
 */
export function magnetize(obj, pos, design) {
  const { ctx, spec, tables } = design;
  const f = { x: Math.sin(obj.azimuth * DEG), y: Math.cos(obj.azimuth * DEG) };
  const c = { x: f.y, y: -f.x };
  let { x, y } = pos;
  const size = tableSize(obj, spec);

  // 1. align with neighbours that face the same way (centre lines and flush edges)
  for (const t of tables) {
    if (t.source === obj.id || Math.abs(((t.azimuth - obj.azimuth + 540) % 360) - 180) > 1) continue;
    const du = (x - t.x) * c.x + (y - t.y) * c.y;
    const dv = (x - t.x) * f.x + (y - t.y) * f.y;
    const snapTo = (d, targets) => targets.find((k) => Math.abs(d - k) < 0.35);
    const su = snapTo(du, [0, (size.width + t.size.width) / 2 + PANEL_GAP, -(size.width + t.size.width) / 2 - PANEL_GAP]);
    const sv = snapTo(dv, [0]);
    if (su !== undefined && Math.abs(dv) < (size.depth + t.size.depth) / 2 + 1) {
      x -= (du - su) * c.x;
      y -= (du - su) * c.y;
    }
    if (sv !== undefined && Math.abs(du) < (size.width + t.size.width) / 2 + 1) {
      x -= (dv - sv) * f.x;
      y -= (dv - sv) * f.y;
    }
  }

  // 2. resolve small overlaps
  const ok = (px, py) => rectPlacement(tableFootprint({ ...obj, x: px, y: py }, spec), ctx, { ignoreId: obj.id, inset: 0.05 }).ok;
  if (ok(x, y)) return { x, y };
  for (let r = 0.05; r <= 0.8; r += 0.05) {
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const px = x + (c.x * a + f.x * b) * r;
      const py = y + (c.y * a + f.y * b) * r;
      if (ok(px, py)) return { x: px, y: py };
    }
  }
  return { x, y };
}
