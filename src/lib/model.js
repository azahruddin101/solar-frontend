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
import { hipFrame, hipPlaneAt, hipPlanes, hipZ } from './hipRoof.js';

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
  { id: 'hip', label: 'Four slopes (hip)' },
];
/** Words for a section's roof shape (proposal, lists). */
export function roofShapeLabel(s) {
  if (!s.frame) return 'Flat';
  if (s.frame.hip) return `${s.frame.ends === 'kerala' ? 'Kerala style' : s.frame.ends === 'gable' ? 'Hip with gable ends' : 'Four slopes (hip)'}, ${Math.round(s.pitch)}° pitch`;
  if (s.roofType === 'gable') return `Two slopes (gable), ${Math.round(s.pitch)}°${Math.abs(s.frame.pitch2 - s.pitch) > 0.5 ? ` and ${Math.round(s.frame.pitch2)}°` : ''} pitch`;
  return `Single slope, ${Math.round(s.pitch)}° pitch`;
}
/** Panels on a sloped roof sit on hooks this far above the surface (m). */
export const FLUSH_STANDOFF = 0.1;

export const isSloped = (s) => (s?.roofType === 'shed' || s?.roofType === 'gable' || s?.roofType === 'hip' || s?.roofType === 'plane') && s.pitch > 0;
/** Under this pitch a measured roof face counts as flat: panels go on tilted frames. */
export const FLAT_PLANE_PITCH = 4;

export function normSection(s) {
  const poly = ensureCCW(cleanPolygon(s.points));
  // a roof face measured by Google: one plane through its centre (height above the ground there),
  // falling towards `slopeAz` at `pitch`
  if (s.roofType === 'plane' && poly.length >= 3) {
    if (!(s.pitch >= FLAT_PLANE_PITCH)) return { ...s, poly, roofType: 'flat', parapetH: 0, frame: null };
    const pitch = Math.min(70, s.pitch);
    const az = normalizeAzimuth(s.slopeAz ?? 180);
    const f = { x: Math.sin(az * DEG), y: Math.cos(az * DEG) };
    const tan = Math.tan(pitch * DEG);
    const c = s.centre || poly.reduce((m, p) => ({ x: m.x + p.x / poly.length, y: m.y + p.y / poly.length }), { x: 0, y: 0 });
    const zAt = (x, y) => s.height - tan * ((x - c.x) * f.x + (y - c.y) * f.y);
    const zs = poly.map((p) => zAt(p.x, p.y));
    const low = Math.min(...zs);
    return { ...s, poly, pitch, slopeAz: az, parapetH: 0, frame: { plane: true, f, c, tan, az, zc: s.height, pitch2: pitch, wallBase: low, eave2: low, rise: Math.max(...zs) - low } };
  }
  if (!isSloped(s) || poly.length < 3) return { ...s, poly, roofType: 'flat', frame: null };
  if (s.roofType === 'hip') {
    const pitch = Math.min(60, Math.max(1, s.pitch));
    const frame = hipFrame(poly, { ...s, pitch });
    return { ...s, poly: frame.base, pitch, parapetH: 0, frame };
  }
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
  if (fr.plane) return fr.zc - fr.tan * ((x - fr.c.x) * fr.f.x + (y - fr.c.y) * fr.f.y);
  if (fr.hip) return hipZ(sec, x, y);
  const d = x * fr.f.x + y * fr.f.y;
  if (d >= fr.dMid) return sec.height + Math.max(0, fr.dMax - d) * fr.tan;
  return fr.eave2 + Math.max(0, d - fr.dMin) * fr.tan2;
}

export const ridgeHeight = (sec) => (sec.frame?.plane ? sec.frame.wallBase + sec.frame.rise : sec.height + (sec.frame ? sec.frame.rise : 0));

/** The plane under a point: panels laid flush take this tilt and facing. */
export function planeAt(sec, x, y) {
  const fr = sec.frame;
  if (!fr) return null;
  if (fr.plane) return { tilt: sec.pitch, azimuth: fr.az };
  if (fr.hip) return hipPlaneAt(sec, x, y);
  const uphillSide = sec.roofType === 'gable' && x * fr.f.x + y * fr.f.y < fr.dMid;
  return { tilt: uphillSide ? fr.pitch2 : sec.pitch, azimuth: normalizeAzimuth(fr.az + (uphillSide ? 180 : 0)) };
}

/** The slopes of a section as plan polygons with their facing: 1 for a shed, 2 for a gable, none for flat. */
export function roofPlanes(sec) {
  const fr = sec.frame;
  if (!fr) return [];
  if (fr.plane) return [{ poly: sec.poly, azimuth: fr.az, tilt: sec.pitch }];
  if (fr.hip) return hipPlanes(sec);
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
    // a hipped roof covers its overhang too, past the walls
    const cover = s.frame?.hip && s.frame.roofPoly?.length >= 3 ? s.frame.roofPoly : s.poly;
    if (cover.length < 3 || !pointInPolygon({ x, y }, cover)) continue;
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
    // a hip has slopes on every side: leave out the ones turned away from the sun (east and west
    // slopes stay, even turned a little off: they are good places for panels; the best go first)
    .filter((pl) => !sec.frame.hip || away(pl.azimuth) <= 115)
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

/**
 * Pathways: a base with more than one row (or column) can leave a walkway after every `every`
 * rows (or columns), to reach the panels for cleaning. `pathRow` runs across the base between rows
 * (rows count from the front); `pathCol` runs up the slope between columns. `width` is the clear
 * walkway in metres. Designs saved with `after` (one pathway) read it as `every`.
 */
export const PATH_WIDTH = 0.6;
/** Pathway colours, the same in 3D, on the plan and in the sidebar: between rows / between columns. */
export const PATH_COLORS = { row: '#f59e0b', col: '#0ea5e9' };
export function pathOn(t, axis, n) {
  const p = t?.[axis === 'row' ? 'pathRow' : 'pathCol'];
  if (!p || !(n >= 2)) return null;
  const every = Math.round(Number(p.every ?? p.after));
  const width = Math.max(0.2, Math.min(3, Number(p.width) || PATH_WIDTH));
  return every >= 1 && every <= n - 1 ? { every, width, extra: width - PANEL_GAP } : null;
}
/** How many pathways lie before slot `i` (one after every `every` slots). */
const pathsBefore = (i, path) => (path ? Math.floor(i / path.every) : 0);
/** How many pathways a run of `n` slots has inside it. */
export const pathCount = (n, path) => (path && n > 1 ? Math.floor((n - 1) / path.every) : 0);
/** Where slot `i` starts along an axis of modules `m` metres long, past the pathways before it. */
export const slotStart = (i, m, path) => i * (m + PANEL_GAP) + pathsBefore(i, path) * (path?.extra || 0);
/** Span of `n` modules laid side by side along one axis (metres), with their pathways. */
const span = (n, m, path = null) => (n > 0 ? n * m + (n - 1) * PANEL_GAP + pathCount(n, path) * (path?.extra || 0) : 0);
/** How many modules fit in `L` metres, the pathways taking their room. */
function fitCount(L, m, path) {
  let n = Math.max(0, Math.floor((L + PANEL_GAP + 1e-6) / (m + PANEL_GAP)));
  while (n > 0 && span(n, m, path) > L + 1e-6) n--;
  return n;
}
/** The slot under a distance `x` from the start of an axis, or -1 (off the grid or on a pathway). */
function slotIndex(x, m, n, path) {
  for (let i = 0; i < n; i++) {
    const a = slotStart(i, m, path);
    if (x >= a && x < a + m + PANEL_GAP) return i;
    if (x < a) return -1; // in a pathway before this slot
  }
  return -1;
}
/** A base's pathways for its slot grid: { row, col } (either may be null). */
export function pathsOf(t, grid) {
  // the pathway is stored against the base's own size: look it up with the grid's rows / columns
  return { row: pathOn(t, 'row', grid.rows), col: pathOn(t, 'col', grid.cols) };
}

/**
 * Base-first groups: a group is a mounting base (frame) that panels are planted on. `w` / `len`
 * (metres across / along the slope) size the base itself; `planted: false` is a base still waiting
 * for its panels. Groups without `w` / `len` (older designs, auto layouts) are bases exactly the
 * size of their panels.
 */
export const isBase = (o) => o && o.type === 'array' && o.w > 0 && o.len > 0;

/** How many rows × columns of modules fit on a base. */
export function baseFit(t, spec) {
  const d = moduleDims(spec, t.orientation);
  if (!(t.w > 0 && t.len > 0)) return { rows: t.rows || 0, cols: t.cols || 0 };
  // the pathways are checked against the most slots there could be
  const most = { rows: fitCount(t.len, d.slope, null), cols: fitCount(t.w, d.cross, null) };
  return { rows: fitCount(t.len, d.slope, pathOn(t, 'row', most.rows)), cols: fitCount(t.w, d.cross, pathOn(t, 'col', most.cols)) };
}

/** The base size that holds exactly rows × cols modules. */
export function baseFor(rows, cols, t, spec) {
  const d = moduleDims(spec, t.orientation);
  return { w: span(cols, d.cross, pathOn(t, 'col', cols)), len: span(rows, d.slope, pathOn(t, 'row', rows)) };
}

/** The modules actually on a group: none on an unplanted base, never more than fit on it. */
export function plantedOn(t, spec) {
  const fit = baseFit(t, spec);
  const rows = Math.min(t.rows || 0, fit.rows);
  const cols = Math.min(t.cols || 0, fit.cols);
  if (t.planted === false || rows === 0 || cols === 0) return { rows: 0, cols, count: 0, keys: new Set(), grid: { rows, cols } };
  const keys = new Set();
  if (Array.isArray(t.filled)) {
    // the user placed / removed single panels: exactly these slots (those still on the grid)
    for (const key of t.filled) {
      const [r, k] = key.split(':').map(Number);
      if (r >= 0 && r < rows && k >= 0 && k < cols) keys.add(`${r}:${k}`);
    }
  } else {
    // a base need not be full: `count` panels, filled row by row from the front (6 slots, 5 panels)
    const count = Math.max(0, Math.min(rows * cols, t.count == null ? rows * cols : Math.round(t.count)));
    for (let i = 0; i < count; i++) keys.add(`${Math.floor(i / cols)}:${i % cols}`);
  }
  let used = 0;
  for (const key of keys) used = Math.max(used, Number(key.split(':')[0]) + 1);
  return { rows: used, cols, count: keys.size, keys, grid: { rows, cols } };
}

/** The slot keys ("row:col") holding a panel on a group, in reading order. */
export const plantedKeys = (t, spec) => [...plantedOn(t, spec).keys].sort((a, b) => { const [ar, ak] = a.split(':').map(Number); const [br, bk] = b.split(':').map(Number); return ar - br || ak - bk; });

/**
 * The panel slot under a roof-plan point on a built table (`design.tables` entry), or null when
 * the point is off the slot grid. Slots are the grid the base has room for, filled or not.
 */
export function slotAt(t, p, spec) {
  const d = moduleDims(spec, t.orientation);
  const f = { x: Math.sin(t.azimuth * DEG), y: Math.cos(t.azimuth * DEG) };
  const c = { x: f.y, y: -f.x };
  const cos = Math.cos(t.tilt * DEG);
  // a built table carries its slot grid (its `rows` are the rows in use, 0 on an empty base)
  const grid = t.grid || plantedOn(t, spec).grid;
  if (!grid.rows || !grid.cols) return null;
  const u = (p.x - t.x) * c.x + (p.y - t.y) * c.y;
  const v = (p.x - t.x) * f.x + (p.y - t.y) * f.y;
  const sl = (t.size.depth / 2 - v) / cos;
  const paths = pathsOf(t, grid);
  const u0 = -span(grid.cols, d.cross, paths.col) / 2;
  const sl0 = (t.size.slopeLen - span(grid.rows, d.slope, paths.row)) / 2;
  const k = slotIndex(u - u0, d.cross, grid.cols, paths.col);
  const r = slotIndex(sl - sl0, d.slope, grid.rows, paths.row);
  if (k < 0 || r < 0) return null;
  return { r, k, key: `${r}:${k}` };
}

/**
 * The tilt of a base whose front and back poles were given their own heights
 * (`heightMode: 'heights'`, `frontLeg` + `backLeg`): the slope that joins the two pole tops.
 * Otherwise the stored tilt. Degrees, 0–60.
 */
export function resolveTilt(t, spec) {
  if (t.heightMode !== 'heights' || t.flush || !(t.backLeg >= 0)) return t.tilt;
  const d = moduleDims(spec, t.orientation);
  const slopeLen = t.w > 0 && t.len > 0 ? t.len : span(t.rows, d.slope);
  if (!(slopeLen > 0)) return t.tilt;
  const ratio = Math.max(-0.99, Math.min(0.99, (t.backLeg - t.frontLeg) / slopeLen));
  return Math.max(0, Math.min(60, Math.asin(ratio) / DEG));
}

/**
 * How many supports a base gets between its front and back poles: `midSupport` is a number
 * (0 = none, as many as the user likes), or true from older designs (one at every row junction).
 * They are spread evenly up the slope, so 2 rows + 1 support is the junction and 3 rows + 1
 * support is the middle of the base.
 */
export function midSupports(t, slots) {
  const n = t.midSupport === true ? Math.max(0, slots - 1) : Number(t.midSupport) || 0;
  return Math.max(0, Math.min(MAX_SUPPORTS, Math.round(n)));
}
export const MAX_SUPPORTS = 50;

/**
 * Pole lines along the slope (rafters with a front and a back pole): the two edges plus the
 * vertical supports in between. `midSupportV` is how many in between (any number, divided
 * equally); left unset, one about every two panels.
 */
export function poleLines(t, width, cross) {
  const auto = Math.max(2, Math.round(width / (cross * 2)) + 1);
  if (t.midSupportV == null || t.midSupportV === '') return auto;
  return 2 + Math.max(0, Math.min(MAX_SUPPORTS, Math.round(Number(t.midSupportV) || 0)));
}

/**
 * The panel slots a rectangle dragged from `a` to `b` covers on a base facing `azimuth` with
 * `tilt`: whole rows × columns (at least 1 × 1) and the middle of the base that fills them.
 */
export function slotsBetween(a, b, { azimuth, tilt, orientation }, spec) {
  const d = moduleDims(spec, orientation);
  const f = { x: Math.sin(azimuth * DEG), y: Math.cos(azimuth * DEG) };
  const c = { x: f.y, y: -f.x };
  const du = (b.x - a.x) * c.x + (b.y - a.y) * c.y;
  const dv = (b.x - a.x) * f.x + (b.y - a.y) * f.y;
  const cols = Math.max(1, Math.round((Math.abs(du) + PANEL_GAP) / (d.cross + PANEL_GAP)));
  const rows = Math.max(1, Math.round((Math.abs(dv) + PANEL_GAP) / (d.slope * Math.cos(tilt * DEG) + PANEL_GAP)));
  const width = span(cols, d.cross);
  const depth = span(rows, d.slope) * Math.cos(tilt * DEG);
  const su = du < 0 ? -1 : 1;
  const sv = dv < 0 ? -1 : 1;
  const center = { x: a.x + (c.x * su * width + f.x * sv * depth) / 2, y: a.y + (c.y * su * width + f.y * sv * depth) / 2 };
  return { rows, cols, center, width, depth };
}

/**
 * Resize a group by dragging the corner opposite `anchor` to `point`: whole panel slots, any
 * number of them. A base grows its footprint and keeps the panels already planted (trimmed when
 * it got smaller); an auto group just changes its rows × columns. Returns the patch to apply.
 */
export function resizeBase(o, anchor, point, spec) {
  const f = { x: Math.sin(o.azimuth * DEG), y: Math.cos(o.azimuth * DEG) };
  const c = { x: f.y, y: -f.x };
  const d = moduleDims(spec, o.orientation);
  // whole slots to the nearest one; the pathways take their room
  const cos = Math.cos(o.tilt * DEG);
  const uExt = (point.x - anchor.x) * c.x + (point.y - anchor.y) * c.y;
  const slExt = -((point.x - anchor.x) * f.x + (point.y - anchor.y) * f.y) / Math.max(0.2, cos);
  const cols = Math.max(1, fitCount(uExt + d.cross / 2, d.cross, pathOn(o, 'col', 999)));
  const rows = Math.max(1, fitCount(slExt + d.slope / 2, d.slope, pathOn(o, 'row', 999)));
  const base = isBase(o);
  const dims = base ? baseFor(rows, cols, o, spec) : {};
  const size = tableSize({ ...o, ...dims, rows, cols }, spec);
  // a base with panels fills its new size (dragging adds or removes whole rows and columns of
  // panels); an empty base stays empty
  const count = base && o.planted === false ? { rows, cols } : { rows, cols, filled: undefined, count: undefined, planted: true };
  return { ...dims, ...count, auto: false, x: anchor.x + c.x * (size.width / 2) - f.x * (size.depth / 2), y: anchor.y + c.y * (size.width / 2) - f.y * (size.depth / 2) };
}

export function tableSize(t, spec) {
  const d = moduleDims(spec, t.orientation);
  const n = t.w > 0 && t.len > 0 ? null : { rows: t.rows, cols: t.cols };
  const slopeLen = n ? span(n.rows, d.slope, pathOn(t, 'row', n.rows)) : t.len;
  const width = n ? span(n.cols, d.cross, pathOn(t, 'col', n.cols)) : t.w;
  return { ...d, width, slopeLen, depth: slopeLen * Math.cos(t.tilt * DEG) };
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
  // a terrace keeps a walkway along the parapet; a pitched roof only needs a small margin from its edges;
  // a face measured by Google is already the area its panels fit in
  if (sec.google) inset = Math.min(inset, 0.02);
  else if (sec.frame) inset = Math.min(inset, 0.3);
  // a hipped roof reaches past its walls (the overhang): the margin is kept from the roof's own edge
  const edgePoly = sec.frame?.hip && sec.frame.roofPoly?.length >= 3 ? sec.frame.roofPoly : sec.poly;
  const inner = ctx.insets.get(sec.id + ':' + inset) || ctx.insets.set(sec.id + ':' + inset, offsetPolygon(edgePoly, inset)).get(sec.id + ':' + inset);
  if (inner.length < 3) return { ok: false, reason: 'Roof too small' };
  const edge = sec.frame ? 'Too close to the roof edge' : 'Crosses the parapet';
  for (const p of rect) if (!pointInPolygon(p, inner)) return { ok: false, reason: edge };
  for (const v of inner) if (pointInPolygon(v, rect)) return { ok: false, reason: edge };
  if (sec.frame && sec.roofType === 'gable') {
    // every corner on the same side of the ridge, with a little clearance from it
    const side = rect.map((p) => p.x * sec.frame.f.x + p.y * sec.frame.f.y - sec.frame.dMid);
    if (!(side.every((d) => d > 0.15) || side.every((d) => d < -0.15))) return { ok: false, reason: 'Crosses the ridge' };
  }
  if (sec.frame?.hip) {
    // all four corners and the middle on one slope: a panel never bends over a ridge, hip or valley
    const keys = new Set([...rect, c].map((p) => planeAt(sec, p.x, p.y).key));
    if (keys.size > 1) return { ok: false, reason: 'Crosses a ridge or valley' };
  }
  // measured faces sit side by side (their outlines may touch): only a drawn raised roof blocks
  for (const s of ctx.sections) if (s.id !== sec.id && !s.google && !sec.google && s.height > sec.height && polysOverlap(rect, s.poly)) return { ok: false, reason: 'Hits a raised roof' };
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
  // where the first row and column start: 4 × 4 tries, finer for "Maximum panels" (zone.phaseStep)
  const step = zone.phaseStep > 0 ? zone.phaseStep : 0.25;
  for (let ov = 0; ov < 1; ov += step) {
    for (let ou = 0; ou < 1; ou += step) {
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
  // the panels sit centred on the base (a base can be bigger than the panels planted on it)
  const n = plantedOn(t, spec);
  // the slot grid is the base's full grid, so a panel keeps its place when others come and go
  const paths = pathsOf(t, n.grid);
  const u0 = -span(n.grid.cols, s.cross, paths.col) / 2;
  const sl0 = (s.slopeLen - span(n.grid.rows, s.slope, paths.row)) / 2;
  for (let r = 0; r < n.rows; r++) {
    for (let k = 0; k < n.cols; k++) {
      if (!n.keys.has(`${r}:${k}`)) continue; // an empty slot
      const sl = sl0 + slotStart(r, s.slope, paths.row) + s.slope / 2;
      const u = u0 + slotStart(k, s.cross, paths.col) + s.cross / 2;
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
  // legs: front & back rows, roughly every 2 modules across; with `midSupport`, a support under
  // every junction of two panel rows planted one above the other (a cross rod on mid columns)
  const legs = [];
  const midLegs = [];
  // the supports stay when the panels are taken off: they go with the rows the base has room for
  const slots = Math.max(n.rows, baseFit(t, spec).rows);
  const joins = [];
  const supports = t.flush ? 0 : midSupports(t, slots);
  for (let i = 0; i < supports; i++) joins.push((s.slopeLen * (i + 1)) / (supports + 1));
  // pole lines across the base (hooks on a sloped roof). Column pathways split the panels into
  // blocks: each block stands on its own lines, one at each of its edges and the rest spread
  // between, so no pole stands in a walkway and no panel hangs past a pathway unsupported.
  // Vertical supports (`midSupportV`) are then the lines between the edges of each block.
  const lineCount = (w) => (t.flush ? Math.max(2, Math.round(w / (s.cross * 2)) + 1) : poleLines(t, w, s.cross));
  const blocks = [];
  if (paths.col) {
    const nb = pathCount(n.grid.cols, paths.col) + 1;
    for (let j = 0; j < nb; j++) {
      const first = j * paths.col.every;
      const last = Math.min(n.grid.cols, (j + 1) * paths.col.every) - 1;
      // the outer blocks reach the base's own edges (a base can be wider than its panels)
      const a = j === 0 ? -s.width / 2 : u0 + slotStart(first, s.cross, paths.col);
      const b = j === nb - 1 ? s.width / 2 : u0 + slotStart(last, s.cross, paths.col) + s.cross;
      blocks.push([a, b]);
    }
  } else blocks.push([-s.width / 2, s.width / 2]);
  const lineUs = blocks.flatMap(([a, b]) => {
    const w = b - a;
    if (w <= 0.4) return [(a + b) / 2];
    const k = lineCount(w);
    return Array.from({ length: k }, (_, i) => a + 0.15 + ((w - 0.3) * i) / (k - 1));
  });
  const inset = Math.min(0.3, s.slopeLen * 0.15);
  for (const u of lineUs) {
    for (const sl of [inset, s.slopeLen - inset]) {
      const v = s.depth / 2 - sl * cos;
      const x = t.x + c.x * u + f.x * v;
      const y = t.y + c.y * u + f.y * v;
      const ground = roofHeightAt(sections, x, y);
      legs.push({ x, y, base: ground, h: Math.max(0.05, base + t.frontLeg + sl * sin - ground) });
    }
    for (const sl of joins) {
      const v = s.depth / 2 - sl * cos;
      const x = t.x + c.x * u + f.x * v;
      const y = t.y + c.y * u + f.y * v;
      const ground = roofHeightAt(sections, x, y);
      midLegs.push({ x, y, sl, base: ground, h: Math.max(0.05, base + t.frontLeg + sl * sin - ground) });
    }
  }
  // the pathways as strips on the panel plane: plan outline, 3D corners, and their size
  const at3 = (u, sl) => {
    const v = s.depth / 2 - sl * cos;
    const x = t.x + c.x * u + f.x * v;
    const y = t.y + c.y * u + f.y * v;
    return { x, y, z: base + t.frontLeg + sl * sin };
  };
  const strip = (axis, u1, u2, sl1, sl2, width, length, at) => {
    const pts = [at3(u1, sl1), at3(u2, sl1), at3(u2, sl2), at3(u1, sl2)];
    const mid = at3((u1 + u2) / 2, (sl1 + sl2) / 2);
    // a measuring line straight across the walkway (for the width mark), at `at`: over the first
    // column (row pathways) or first row (column pathways) of panels, never where two pathways cross
    const dim = axis === 'row' ? [at3(at, sl1), at3(at, sl2)] : [at3(u1, at), at3(u2, at)];
    return { axis, width, length, poly: pts.map(({ x, y }) => ({ x, y })), corners: pts, mid, dim };
  };
  const pathways = [];
  const gridW = span(n.grid.cols, s.cross, paths.col);
  const gridL = span(n.grid.rows, s.slope, paths.row);
  for (let j = 1; j <= pathCount(n.grid.rows, paths.row); j++) {
    const a = sl0 + slotStart(j * paths.row.every, s.slope, paths.row) - paths.row.width;
    pathways.push(strip('row', u0, u0 + gridW, a, a + paths.row.width, paths.row.width, gridW, u0 + s.cross / 2));
  }
  for (let j = 1; j <= pathCount(n.grid.cols, paths.col); j++) {
    const a = u0 + slotStart(j * paths.col.every, s.cross, paths.col) - paths.col.width;
    pathways.push(strip('col', a, a + paths.col.width, sl0, sl0 + gridL, paths.col.width, gridL, sl0 + s.slope / 2));
  }
  return { ...t, rows: n.rows, cols: n.cols, grid: n.grid, poly, base, size: s, modules, legs, midLegs, joins, pathways, poleBlocks: blocks.length, vSupports: Math.max(0, lineCount(blocks[0][1] - blocks[0][0]) - 2), backLeg: t.frontLeg + s.slopeLen * sin };
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
    return plane ? { ...o, ...plane, frontLeg: FLUSH_STANDOFF, flush: true, kind: 'array', source: o.id } : { ...o, tilt: resolveTilt(o, spec), flush: false, kind: o.elevated ? 'elevated' : 'array', source: o.id };
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
  const roofArea = sections.filter((s) => s.main || s.google).reduce((a, s) => a + polygonArea(s.poly), 0);
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
