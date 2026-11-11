// Tidy a roof outline clicked by hand on the map: walls that are nearly square to each other are made
// exactly square, so the house types (two slopes, four slopes, Kerala) sit on it cleanly.
import { ensureCCW, signedArea } from './geometry.js';

const DEG = Math.PI / 180;

/** Main direction of an outline (radians, 0..π/2): length-weighted average of its edges, modulo 90°. */
export function dominantAngle(pts) {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    sx += len * Math.cos(4 * ang);
    sy += len * Math.sin(4 * ang);
  }
  return Math.atan2(sy, sx) / 4;
}

/**
 * Square the corners: every edge within `tolDeg` of the main direction (or across it) becomes exactly
 * parallel / perpendicular; new corners are where those lines meet. Edges further off stay as drawn.
 * `angle` lets several parts share one direction.
 */
export function squareUp(pts, tolDeg = 18, angle = dominantAngle(pts), minStep = 0.9) {
  if (pts.length < 4) return pts;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rot = (p) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  const unrot = (p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const loc = pts.map(rot);
  const n = loc.length;
  // each edge as a line: horizontal (y = c), vertical (x = c) or free (through its two points)
  let lines = [];
  for (let i = 0; i < n; i++) {
    const a = loc[i];
    const b = loc[(i + 1) % n];
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) / DEG + 360) % 180;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.min(ang, 180 - ang) <= tolDeg) lines.push({ kind: 'h', c: (a.y + b.y) / 2, w: len });
    else if (Math.abs(ang - 90) <= tolDeg) lines.push({ kind: 'v', c: (a.x + b.x) / 2, w: len });
    else lines.push({ kind: 'f', a, b, w: len });
  }
  // small steps and cut corners (under `minStep`) between two walls are dropped, then neighbours of
  // the same kind merge (a staircase run becomes one wall)
  for (let pass = 0; pass < 3 && lines.length > 4; pass++) {
    const k = lines.length;
    const drop = lines.map((l, i) => {
      if (l.w >= minStep) return false;
      const prev = lines[(i - 1 + k) % k];
      const nxt = lines[(i + 1) % k];
      return prev.kind !== 'f' && nxt.kind !== 'f' && (prev.kind === nxt.kind || l.kind === 'f');
    });
    if (!drop.some(Boolean)) break;
    lines = lines.filter((_, i) => !drop[i]);
  }
  const merged = [];
  for (const l of lines) {
    const last = merged[merged.length - 1];
    if (last && l.kind !== 'f' && last.kind === l.kind) {
      last.c = (last.c * last.w + l.c * l.w) / (last.w + l.w);
      last.w += l.w;
    } else merged.push({ ...l });
  }
  if (merged.length > 1 && merged[0].kind !== 'f' && merged[0].kind === merged[merged.length - 1].kind) {
    const l = merged.pop();
    merged[0].c = (merged[0].c * merged[0].w + l.c * l.w) / (merged[0].w + l.w);
    merged[0].w += l.w;
  }
  lines = merged;
  if (lines.length < 3) return pts;
  const meet = (l1, l2) => {
    const asLine = (l) => (l.kind === 'h' ? { p: { x: 0, y: l.c }, d: { x: 1, y: 0 } } : l.kind === 'v' ? { p: { x: l.c, y: 0 }, d: { x: 0, y: 1 } } : { p: l.a, d: { x: l.b.x - l.a.x, y: l.b.y - l.a.y } });
    const A1 = asLine(l1);
    const A2 = asLine(l2);
    const den = A1.d.x * A2.d.y - A1.d.y * A2.d.x;
    if (Math.abs(den) < 1e-9) return null; // parallel neighbours (a tiny jog): no corner
    const t = ((A2.p.x - A1.p.x) * A2.d.y - (A2.p.y - A1.p.y) * A2.d.x) / den;
    return { x: A1.p.x + A1.d.x * t, y: A1.p.y + A1.d.y * t };
  };
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const p = meet(lines[(i - 1 + lines.length) % lines.length], lines[i]);
    if (p) out.push(unrot(p));
  }
  if (out.length < 3) return pts;
  // a sanity check: squaring must not change the area much
  const before = Math.abs(signedArea(pts));
  const after = Math.abs(signedArea(out));
  return after > before * 0.75 && after < before * 1.25 ? ensureCCW(out) : pts;
}
