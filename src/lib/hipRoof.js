// Hip roofs on any square-cornered outline (rectangle, L, T, U, +…), the way Kerala houses are built:
// every side slopes at one pitch, the roof sticks out past the walls (overhang), and the two ends of a
// wing are either sloped (hip), a full triangle (gable) or a small triangle at the top (Kerala
// "mukhappu", a Dutch gable).
//
// How the surface is found: an outline is covered by overlapping wing rectangles. On one wing the
// height at a point is tan(pitch) × (distance to the nearest eave) — exact on a convex block. Where
// wings overlap the higher surface wins, which puts the valleys where real cross-hip roofs have them
// and lets a narrower wing's lower ridge run into the wider one.
//
// Plan coordinates: metres, x east, y north. Heights are metres above the ground.

import { DEG, normalizeAzimuth } from './geo.js';
import { cleanPolygon, clipHalfPlane, ensureCCW, isConvex, offsetPolygon, pointInPolygon, polygonArea } from './geometry.js';

export const ROOF_ENDS = [
  { id: 'hip', label: 'Sloped' },
  { id: 'gable', label: 'Triangle' },
  { id: 'kerala', label: 'Small triangle on top' },
];
export const MAX_OVERHANG = 1.5;
/** A Kerala end slope climbs this share of the way to the ridge before the small triangle starts. */
const KERALA_CUT = 0.55;
const EPS = 1e-4;

const edgesOf = (poly) =>
  poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len }; // outward for a CCW polygon
    return { a, b, n, c: n.x * a.x + n.y * a.y, len };
  });

/** Distance from p to the eave line of e, measured inward. */
const inward = (e, x, y) => e.c - (e.n.x * x + e.n.y * y);

/** Inside a convex CCW polygon, counting points within `tol` of its edges (corners of the slopes sit on them). */
const insideConvex = (edges, x, y, tol = 1e-3) => edges.every((e) => inward(e, x, y) > -tol);

/** Wing rectangles covering a square-cornered outline, or null when a wall is slanted. */
function wingRects(poly) {
  const longest = edgesOf(poly).reduce((m, e) => (e.len > m.len ? e : m));
  const ux = { x: (longest.b.x - longest.a.x) / longest.len, y: (longest.b.y - longest.a.y) / longest.len };
  const to = (p) => ({ u: p.x * ux.x + p.y * ux.y, v: -p.x * ux.y + p.y * ux.x });
  const from = (u, v) => ({ x: u * ux.x - v * ux.y, y: u * ux.y + v * ux.x });
  const loc = poly.map(to);
  for (let i = 0; i < loc.length; i++) {
    const a = loc[i];
    const b = loc[(i + 1) % loc.length];
    const ang = Math.abs(Math.atan2(b.v - a.v, b.u - a.u) / DEG) % 90;
    if (Math.min(ang, 90 - ang) > 3) return null;
  }
  const uniq = (xs) => xs.sort((p, q) => p - q).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.05);
  const us = uniq(loc.map((p) => p.u));
  const vs = uniq(loc.map((p) => p.v));
  const I = us.length - 1;
  const J = vs.length - 1;
  if (I < 1 || J < 1 || I * J > 900) return null;
  const inside = [];
  for (let i = 0; i < I; i++) {
    inside.push([]);
    for (let j = 0; j < J; j++) inside[i].push(pointInPolygon(from((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2), poly));
  }
  const full = (i0, i1, j0, j1) => {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!inside[i][j]) return false;
    return true;
  };
  // every maximal all-inside rectangle of cells, then a greedy cover (most new area first)
  const cands = [];
  for (let i0 = 0; i0 < I; i0++) {
    for (let j0 = 0; j0 < J; j0++) {
      if (!inside[i0][j0]) continue;
      for (let i1 = i0; i1 < I && inside[i1][j0]; i1++) {
        for (let j1 = j0; j1 < J && full(i0, i1, j0, j1); j1++) {
          const grow = (i0 > 0 && full(i0 - 1, i0 - 1, j0, j1)) || (i1 < I - 1 && full(i1 + 1, i1 + 1, j0, j1)) || (j0 > 0 && full(i0, i1, j0 - 1, j0 - 1)) || (j1 < J - 1 && full(i0, i1, j1 + 1, j1 + 1));
          if (!grow) cands.push({ i0, i1, j0, j1 });
        }
      }
    }
  }
  const covered = inside.map((r) => r.map(() => false));
  const area = (r) => (us[r.i1 + 1] - us[r.i0]) * (vs[r.j1 + 1] - vs[r.j0]);
  const fresh = (r) => {
    let a = 0;
    for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) if (!covered[i][j]) a += (us[i + 1] - us[i]) * (vs[j + 1] - vs[j]);
    return a;
  };
  const picked = [];
  for (;;) {
    let best = null;
    let bestA = 1e-6;
    for (const r of cands) {
      const a = fresh(r);
      if (a > bestA + 1e-9 || (best && Math.abs(a - bestA) < 1e-9 && area(r) > area(best))) {
        best = r;
        bestA = a;
      }
    }
    if (!best) break;
    picked.push(best);
    for (let i = best.i0; i <= best.i1; i++) for (let j = best.j0; j <= best.j1; j++) covered[i][j] = true;
  }
  return picked.map((r) => ensureCCW([from(us[r.i0], vs[r.j0]), from(us[r.i1 + 1], vs[r.j0]), from(us[r.i1 + 1], vs[r.j1 + 1]), from(us[r.i0], vs[r.j1 + 1])]));
}

/**
 * The outline with every wall turned square to the longest one: cut corners and small bays (under
 * `minStep` m) are squared off. Used when a slanted inner corner leaves no clean wing layout — the
 * roof then covers the squared outline, which is how such houses are usually roofed anyway.
 */
function squareOff(poly, minStep = 1) {
  const longest = edgesOf(poly).reduce((m, e) => (e.len > m.len ? e : m));
  const ux = { x: (longest.b.x - longest.a.x) / longest.len, y: (longest.b.y - longest.a.y) / longest.len };
  const to = (p) => ({ u: p.x * ux.x + p.y * ux.y, v: -p.x * ux.y + p.y * ux.x });
  const from = (u, v) => ({ x: u * ux.x - v * ux.y, y: u * ux.y + v * ux.x });
  const loc = poly.map(to);
  let lines = loc.map((a, i) => {
    const b = loc[(i + 1) % loc.length];
    const horiz = Math.abs(b.u - a.u) >= Math.abs(b.v - a.v);
    return { h: horiz, c: horiz ? (a.v + b.v) / 2 : (a.u + b.u) / 2, w: Math.hypot(b.u - a.u, b.v - a.v) };
  });
  const merge = () => {
    const out = [];
    for (const l of lines) {
      const last = out[out.length - 1];
      if (last && last.h === l.h) {
        last.c = (last.c * last.w + l.c * l.w) / (last.w + l.w || 1);
        last.w += l.w;
      } else out.push({ ...l });
    }
    if (out.length > 1 && out[0].h === out[out.length - 1].h) {
      const l = out.pop();
      out[0].c = (out[0].c * out[0].w + l.c * l.w) / (out[0].w + l.w || 1);
      out[0].w += l.w;
    }
    lines = out;
  };
  merge();
  for (let pass = 0; pass < 4 && lines.length > 4; pass++) {
    const k = lines.length;
    const i = lines.findIndex((l, j) => l.w < minStep && lines[(j - 1 + k) % k].h === lines[(j + 1) % k].h);
    if (i < 0) break;
    lines.splice(i, 1);
    merge();
  }
  if (lines.length < 4 || lines.length % 2) return null;
  const pts = lines.map((l, i) => {
    const p = lines[(i - 1 + lines.length) % lines.length];
    return p.h ? from(l.c, p.c) : from(p.c, l.c);
  });
  const out = ensureCCW(cleanPolygon(pts));
  const ratio = polygonArea(out) / polygonArea(poly);
  return out.length >= 4 && ratio > 0.8 && ratio < 1.25 ? out : null;
}

/** Whether edge e lies along edge o (same line, same outward side, overlapping). */
function alongEdge(e, o) {
  if (Math.abs(e.n.x * o.n.x + e.n.y * o.n.y - 1) > 1e-3 || Math.abs(e.c - o.c) > 0.05) return false;
  const t = { x: -o.n.y, y: o.n.x };
  const [e0, e1] = [e.a, e.b].map((p) => p.x * t.x + p.y * t.y).sort((p, q) => p - q);
  const [o0, o1] = [o.a, o.b].map((p) => p.x * t.x + p.y * t.y).sort((p, q) => p - q);
  return Math.min(e1, o1) - Math.max(e0, o0) > 0.05;
}

/**
 * The two end edges of a 4-sided wing: its short sides (for a square, the pair facing along the
 * house's longest wall). An end only counts where the wing really stops — not where it runs into
 * another wing or along another wing's wall.
 */
function wingEnds(edges, others, axis) {
  if (edges.length !== 4) return [];
  const pairA = [edges[0], edges[2]];
  const pairB = [edges[1], edges[3]];
  const lenA = pairA[0].len + pairA[1].len;
  const lenB = pairB[0].len + pairB[1].len;
  let ends;
  if (Math.abs(lenA - lenB) > 0.6) ends = lenA < lenB ? pairA : pairB;
  else ends = Math.abs(pairA[0].n.x * axis.x + pairA[0].n.y * axis.y) > 0.7 ? pairA : pairB;
  return ends.filter((e) => !others.some((o) => o.some((k) => alongEdge(e, k))));
}

/**
 * Everything about a hip roof that does not change while panels move: wings, eaves, heights.
 * `s` is the section: { height (wall top, m), pitch (°), overhang (m), ends ('hip'|'gable'|'kerala') }.
 */
export function hipFrame(poly, s) {
  const pitch = Math.min(60, Math.max(1, s.pitch));
  const tan = Math.tan(pitch * DEG);
  const overhang = Math.min(MAX_OVERHANG, Math.max(0, Number(s.overhang) || 0));
  const ends = ROOF_ENDS.some((e) => e.id === s.ends) ? s.ends : 'hip';
  // the roof outline: the walls pushed out by the overhang (an outward offset keeps square corners)
  let base = poly;
  if (!isConvex(base)) {
    // an outline with an inward corner is roofed as square wings: walls even slightly off square (or
    // slanted) are squared first, so walls and roof match exactly
    const ref = edgesOf(base).reduce((m, e) => (e.len > m.len ? e : m));
    const off = Math.max(...edgesOf(base).map((e) => {
      const a = Math.abs(Math.atan2(e.n.x * ref.n.y - e.n.y * ref.n.x, e.n.x * ref.n.x + e.n.y * ref.n.y) / DEG) % 90;
      return Math.min(a, 90 - a);
    }));
    if (off > 0.3) {
      const sq = squareOff(base);
      if (sq && (isConvex(sq) || wingRects(sq))) base = sq;
    }
  }
  let rects;
  const grown = overhang > 0.01 ? ensureCCW(cleanPolygon(offsetPolygon(base, -overhang))) : base;
  const roofPoly = grown.length >= 3 ? grown : base;
  const eaveH = s.height - overhang * tan; // height of the roof's outer edge

  rects = isConvex(roofPoly) ? [roofPoly] : wingRects(roofPoly);
  const approx = !rects?.length; // slanted walls with an inward corner: surface only, no slopes for panels
  const outline = edgesOf(roofPoly);
  const longest = outline.reduce((m, e) => (e.len > m.len ? e : m), outline[0]);
  const axis = { x: (longest.b.x - longest.a.x) / longest.len, y: (longest.b.y - longest.a.y) / longest.len };
  const wingEdges = (approx ? [roofPoly] : rects).map(edgesOf);

  const blocks = wingEdges.map((all, bi) => {
    const endEdges = ends === 'hip' || approx ? [] : wingEnds(all, wingEdges.filter((_, j) => j !== bi), axis);
    const eaves = [];
    for (const e of all) {
      const isEnd = endEdges.includes(e);
      if (isEnd && ends === 'gable') continue; // the side slopes run out to a gable end
      // a Kerala end slope only climbs part of the way; above it the small triangle stands upright
      eaves.push({ ...e, cut: isEnd && ends === 'kerala' ? (e.len / 2) * KERALA_CUT : Infinity, end: isEnd });
    }
    return { poly: approx ? roofPoly : rects[bi], edges: all, eaves: eaves.length ? eaves : all.map((e) => ({ ...e, cut: Infinity })) };
  });

  const segDist = (x, y) => {
    let m = Infinity;
    for (const e of outline) {
      const t = Math.max(0, Math.min(1, ((x - e.a.x) * (e.b.x - e.a.x) + (y - e.a.y) * (e.b.y - e.a.y)) / (e.len * e.len)));
      m = Math.min(m, Math.hypot(x - e.a.x - t * (e.b.x - e.a.x), y - e.a.y - t * (e.b.y - e.a.y)));
    }
    return m;
  };
  /** The eave a point drains to on a wing, and how far in from it the point is. */
  const nearest = (b, x, y) => {
    let best = null;
    let d = Infinity;
    for (const e of b.eaves) {
      const v = inward(e, x, y);
      if (v >= e.cut) continue;
      if (v < d) {
        d = v;
        best = e;
      }
    }
    return { eave: best, d: approx ? segDist(x, y) : d === Infinity ? 0 : Math.max(0, d) };
  };
  /** Highest wing surface at a point: { block, eave, z } with z above the roof's outer edge. */
  const top = (x, y) => {
    let res = null;
    for (const b of blocks) {
      if (blocks.length > 1 && !insideConvex(b.edges, x, y)) continue;
      const n = nearest(b, x, y);
      if (!res || n.d * tan > res.z + 1e-9) res = { block: b, eave: n.eave, z: n.d * tan };
    }
    if (res) return res;
    const n = nearest(blocks[0], x, y);
    return { block: blocks[0], eave: n.eave, z: n.d * tan };
  };

  // the highest point (ridge) by sampling the roof's box
  const xs = roofPoly.map((p) => p.x);
  const ys = roofPoly.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let peak = 0;
  const N = 36;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const y = y0 + ((y1 - y0) * j) / N;
      if (pointInPolygon({ x, y }, roofPoly)) peak = Math.max(peak, top(x, y).z);
    }
  }
  const az = normalizeAzimuth(Math.atan2(longest.n.x, longest.n.y) / DEG);
  return {
    hip: true,
    base, // the walls' outline (squared when needed)
    ends,
    overhang,
    roofPoly,
    eaveH,
    blocks,
    top,
    tan,
    rise: Math.max(0, peak - overhang * tan), // ridge height above the wall top
    wallBase: s.height,
    eave2: s.height,
    az,
    f: longest.n,
    pitch2: pitch,
    approx,
    wings: blocks.length,
  };
}

/** Roof height (m above ground) at a plan point. */
export const hipZ = (sec, x, y) => sec.frame.eaveH + sec.frame.top(x, y).z;

/** Convex polygon minus convex polygon, as convex pieces. */
function subtractConvex(poly, cut) {
  const out = [];
  let rest = poly;
  for (let i = 0; i < cut.length && rest.length >= 3; i++) {
    const [e] = edgesOf([cut[i], cut[(i + 1) % cut.length]]);
    const outside = clipHalfPlane(rest, e.n.x, e.n.y, -e.c);
    if (outside.length >= 3 && polygonArea(outside) > 1e-4) out.push(outside);
    rest = clipHalfPlane(rest, -e.n.x, -e.n.y, e.c);
  }
  return out;
}

// half-planes, as clipHalfPlane keeps a·x + b·y + c ≥ 0
const notAbove = (poly, e, k, off = 0) => clipHalfPlane(poly, e.n.x - k.n.x, e.n.y - k.n.y, k.c - e.c + off); // e's slope at or below k's
const strictlyAbove = (poly, e, k) => clipHalfPlane(poly, k.n.x - e.n.x, k.n.y - e.n.y, e.c - k.c);
const pastCut = (poly, k) => clipHalfPlane(poly, -k.n.x, -k.n.y, k.c - k.cut);
const beforeCut = (poly, k) => clipHalfPlane(poly, k.n.x, k.n.y, k.cut - k.c);

/**
 * The slopes of a hip roof as convex plan polygons with their facing and tilt — what panels are
 * laid on. Each wing gives one slope per eave, minus where another wing's roof is higher.
 */
export function hipPlanes(sec) {
  const fr = sec.frame;
  if (fr.approx) return [];
  const planes = [];
  fr.blocks.forEach((b, bi) => {
    b.eaves.forEach((e, ei) => {
      const full = b.eaves.filter((k) => k !== e && k.cut === Infinity);
      const cuts = b.eaves.filter((k) => k !== e && k.cut !== Infinity);
      const base = full.reduce((poly, k) => (poly.length < 3 ? poly : notAbove(poly, e, k)), e.cut === Infinity ? b.poly : beforeCut(b.poly, e));
      // a cut (Kerala end) eave only takes over below its cut: split on each one
      let pieces = [base];
      for (const k of cuts) {
        pieces = pieces.flatMap((pc) => (e.cut !== Infinity ? [notAbove(pc, e, k)] : [notAbove(pc, e, k), pastCut(strictlyAbove(pc, e, k), k)]));
        pieces = pieces.filter((pc) => pc.length >= 3 && polygonArea(pc) > 1e-4);
      }
      // remove where another wing's roof is higher (ties go to the earlier wing, as top() does)
      fr.blocks.forEach((o, oi) => {
        if (oi === bi) return;
        const off = oi < bi ? 1e-4 : -1e-4;
        // where e's slope is below wing o's roof: under every full eave of o, and under each cut
        // (Kerala end) eave of o or past its cut — split into convex pieces on those
        let under = [o.eaves.filter((k) => k.cut === Infinity).reduce((poly, k) => (poly.length < 3 ? poly : notAbove(poly, e, k, off)), o.poly)];
        for (const k of o.eaves.filter((q) => q.cut !== Infinity)) {
          under = under.flatMap((u) => [notAbove(u, e, k, off), pastCut(strictlyAbove(u, e, k), k)]);
        }
        under = under.filter((u) => u.length >= 3 && polygonArea(u) > 1e-4);
        for (const u of under) {
          pieces = pieces.flatMap((pc) => {
            const left = subtractConvex(pc, ensureCCW(u));
            return Math.abs(left.reduce((t, q) => t + polygonArea(q), 0) - polygonArea(pc)) < 1e-3 ? [pc] : left;
          });
        }
      });
      const azimuth = normalizeAzimuth(Math.atan2(e.n.x, e.n.y) / DEG);
      for (const pc of pieces) {
        const poly = cleanPolygon(pc, 0.01);
        if (poly.length >= 3 && polygonArea(poly) > 0.01) planes.push({ poly, azimuth, tilt: sec.pitch, key: `${bi}:${ei}`, eave: e });
      }
    });
  });
  return planes;
}

/** Slope under a point: { tilt, azimuth, key } — key changes across every ridge, hip and valley. */
export function hipPlaneAt(sec, x, y) {
  const fr = sec.frame;
  const { eave } = fr.top(x, y);
  if (!eave) return { tilt: sec.pitch, azimuth: fr.az, key: 'x' };
  // a slope is known by its plane — the eave line it falls to (all slopes share one pitch) — so where
  // two wings' slopes run on as one flat surface, a panel on it is not taken for crossing a valley
  const key = `${eave.n.x.toFixed(3)},${eave.n.y.toFixed(3)},${(Math.round(eave.c * 10) / 10).toFixed(1)}`;
  return { tilt: sec.pitch, azimuth: normalizeAzimuth(Math.atan2(eave.n.x, eave.n.y) / DEG), key };
}

/** Points where segment a–b crosses the edges of any polygon in `polys`, as parameters 0..1 (sorted, with 0 and 1). */
function breakpoints(a, b, polys) {
  const ts = [0, 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
      const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
      if (t > EPS && t < 1 - EPS && u > -EPS && u < 1 + EPS) ts.push(t);
    }
  }
  ts.sort((p, q) => p - q);
  return ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1e-5);
}

/**
 * A vertical strip along a–b between bottom(p) and top(p), cut into quads at every slope boundary
 * so it follows the roof exactly. Returns quads as [{x, y, z}×4], skipping zero-height parts.
 */
function strip(a, b, bottom, top, polys) {
  const ts = breakpoints(a, b, polys);
  const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const quads = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const p = at(ts[i]);
    const q = at(ts[i + 1]);
    const [pb, qb, pt, qt] = [bottom(p), bottom(q), top(p), top(q)];
    if (pt - pb < 1e-3 && qt - qb < 1e-3) continue;
    quads.push([{ ...p, z: pb }, { ...q, z: qb }, { ...q, z: Math.max(qb, qt) }, { ...p, z: Math.max(pb, pt) }]);
  }
  return quads;
}

/**
 * The visible pieces of a hip roof, shared by the 3D view and the small preview:
 *   roof    – the slopes [{ poly (plan), azimuth, tilt }] (heights from hipZ)
 *   walls   – quads closing the walls up to the roof (gable triangles)
 *   gablets – quads of the small upright triangles of Kerala ends
 *   fascia  – quads of the eave board around the roof's edge (thickness `board`)
 */
export function hipParts(sec, board = 0.12) {
  const fr = sec.frame;
  const roof = hipPlanes(sec);
  const polys = roof.map((p) => p.poly);
  const z = (p) => hipZ(sec, p.x, p.y);
  const walls = [];
  sec.poly.forEach((a, i) => {
    const b = sec.poly[(i + 1) % sec.poly.length];
    walls.push(...strip(a, b, () => fr.wallBase, (p) => z(p) - 0.02, polys));
  });
  const gablets = [];
  fr.blocks.forEach((b) => {
    for (const e of b.eaves) {
      if (e.cut === Infinity) continue;
      // the line where the end slope stops, across the wing
      const ln = clipHalfPlane(clipHalfPlane(b.poly, -e.n.x, -e.n.y, e.c - e.cut + 1e-6), e.n.x, e.n.y, e.cut - e.c + 1e-6);
      if (ln.length < 2) continue;
      const t = { x: -e.n.y, y: e.n.x };
      const s = ln.map((p) => p.x * t.x + p.y * t.y);
      const pa = ln[s.indexOf(Math.min(...s))];
      const pb = ln[s.indexOf(Math.max(...s))];
      const off = (p, d) => ({ x: p.x - e.n.x * d, y: p.y - e.n.y * d }); // d > 0: further in from the end
      gablets.push(...strip(pa, pb, (p) => z(off(p, -0.01)), (p) => z(off(p, 0.01)), polys));
    }
  });
  const fascia = [];
  fr.roofPoly.forEach((a, i) => {
    const b = fr.roofPoly[(i + 1) % fr.roofPoly.length];
    // a touch inside the edge so the height is read from the slope, not the outside
    const [e] = edgesOf([a, b]);
    const pull = (p) => ({ x: p.x - e.n.x * 1e-3, y: p.y - e.n.y * 1e-3 });
    fascia.push(...strip(a, b, (p) => z(pull(p)) - board, (p) => z(pull(p)), polys));
  });
  return { roof, walls, gablets, fascia };
}

/** Height of a point on one slope's own plane (exact at its corners, even where the roof steps). */
export const hipPlaneZ = (sec, plane, p) => sec.frame.eaveH + Math.max(0, inward(plane.eave, p.x, p.y)) * sec.frame.tan;
