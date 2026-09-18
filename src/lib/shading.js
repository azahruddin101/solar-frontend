// Annual beam-shading loss per module from parapets, raised roofs, obstructions, trees
// and other tables. Rays are tested in plan (2D) with a height check at each crossing.

import { rectPoly } from './geometry.js';
import { sunSamples } from './sun.js';

function raySeg(px, py, dx, dy, a, b) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((a.x - px) * ey - (a.y - py) * ex) / den;
  const u = ((a.x - px) * dy - (a.y - py) * dx) / den;
  return t > 1e-4 && u >= 0 && u <= 1 ? t : -1;
}

export function buildOccluders(design) {
  const prisms = [];
  for (const s of design.sections) {
    prisms.push({ poly: s.poly, lo: 0, hi: s.height, id: s.id });
    if (s.parapetH > 0.05) prisms.push({ poly: s.poly, lo: s.height, hi: s.height + s.parapetH, id: s.id + 'p', wall: true });
  }
  for (const b of design.blocks) {
    const base = design.sections.reduce((h, s) => (s.height > h && inside(b, s.poly) ? s.height : h), 0);
    prisms.push({ poly: rectPoly(b.x, b.y, b.w, b.d, b.rot || 0), lo: base, hi: base + b.h, id: b.id });
  }
  for (const t of design.tables) {
    if (!t.valid) continue;
    prisms.push({ poly: t.poly, lo: t.base + t.frontLeg, hi: t.base + t.backLeg, id: t.id, table: t });
  }
  const trees = design.trees.map((t) => ({ ...t, lo: t.h * 0.25, hi: t.h }));
  return { prisms, trees };
}

function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function blocked(m, s, occ) {
  const hl = Math.hypot(s.x, s.y) || 1e-6;
  const dx = s.x / hl;
  const dy = s.y / hl;
  const k = s.z / hl; // rise per horizontal metre
  for (const p of occ.prisms) {
    if (p.id === m.tableId) continue;
    const n = p.poly.length;
    for (let i = 0; i < n; i++) {
      const t = raySeg(m.x, m.y, dx, dy, p.poly[i], p.poly[(i + 1) % n]);
      if (t < 0) continue;
      let hi = p.hi;
      let lo = p.lo;
      if (p.table) {
        // tilted plane: height depends on where the ray crosses the table footprint
        const tb = p.table;
        const qx = m.x + dx * t - tb.x;
        const qy = m.y + dy * t - tb.y;
        const v = qx * Math.sin((tb.azimuth * Math.PI) / 180) + qy * Math.cos((tb.azimuth * Math.PI) / 180);
        const frac = 0.5 - v / (tb.size.depth || 1);
        hi = tb.base + tb.frontLeg + Math.max(0, Math.min(1, frac)) * (tb.backLeg - tb.frontLeg);
        lo = hi - 0.4;
      }
      const z = m.z + t * k;
      if (z > lo && z < hi) return true;
    }
  }
  for (const tr of occ.trees) {
    const ox = tr.x - m.x;
    const oy = tr.y - m.y;
    const along = ox * dx + oy * dy;
    if (along <= 0) continue;
    const perp = Math.abs(ox * dy - oy * dx);
    if (perp > tr.r) continue;
    const z = m.z + along * k;
    if (z > tr.lo && z < tr.hi) return true;
  }
  return false;
}

/** Returns Map(moduleId -> loss fraction 0..1). */
export function shadingLoss(design, lat) {
  const samples = sunSamples(lat);
  const occ = buildOccluders(design);
  const out = new Map();
  for (const m of design.modules) {
    const b = (m.tilt * Math.PI) / 180;
    const g = (m.azimuth * Math.PI) / 180;
    const nx = Math.sin(b) * Math.sin(g);
    const ny = Math.sin(b) * Math.cos(g);
    const nz = Math.cos(b);
    let total = 0;
    let lost = 0;
    for (const s of samples) {
      const cos = s.x * nx + s.y * ny + s.z * nz;
      const beam = cos > 0 ? s.dni * cos : 0;
      total += beam + s.dhi * (1 + nz) * 0.5;
      if (beam > 0 && blocked(m, s, occ)) lost += beam;
    }
    out.set(m.id, total > 0 ? lost / total : 0);
  }
  return out;
}
