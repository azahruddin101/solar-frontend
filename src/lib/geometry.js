// 2D polygon helpers. Points are {x, y} in metres (x = east, y = north).

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function polygonArea(pts) {
  return Math.abs(signedArea(pts));
}

export function ensureCCW(pts) {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts;
}

export function polygonCentroid(pts) {
  const a = signedArea(pts);
  if (Math.abs(a) < 1e-9) {
    const n = pts.length || 1;
    return pts.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 });
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const c = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function perimeter(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Drop near-duplicate and (almost) collinear vertices. */
export function cleanPolygon(pts, minDist = 0.05, minAngleDeg = 0.75) {
  let out = [];
  for (const p of pts) {
    if (!out.length || dist(out[out.length - 1], p) > minDist) out.push(p);
  }
  if (out.length > 2 && dist(out[0], out[out.length - 1]) <= minDist) out.pop();
  const sinMin = Math.sin((minAngleDeg * Math.PI) / 180);
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const l1 = dist(a, b);
      const l2 = dist(b, c);
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      if (Math.abs(cross) / (l1 * l2) < sinMin && dot > 0) {
        out = out.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return out;
}

export function isConvex(pts) {
  if (pts.length < 4) return true;
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function segmentsIntersect(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** True when no two non-adjacent edges cross. */
export function isSimplePolygon(pts) {
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsIntersect(a, b, pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Sutherland–Hodgman clip keeping the side where a*x + b*y + c >= 0. */
export function clipHalfPlane(pts, a, b, c) {
  const out = [];
  const val = (p) => a * p.x + b * p.y + c;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const vp = val(p);
    const vq = val(q);
    if (vp >= 0) out.push(p);
    if ((vp >= 0) !== (vq >= 0)) {
      const t = vp / (vp - vq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

/**
 * Offset a CCW polygon. Positive `d` moves edges inward, negative outward.
 * Uses mitred joins (clamped) — fine for building footprints.
 */
export function offsetPolygon(pts, d) {
  const n = pts.length;
  const normals = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const l = dist(a, b) || 1;
    normals.push({ x: -(b.y - a.y) / l, y: (b.x - a.x) / l }); // left = inward for CCW
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const n1 = normals[(i - 1 + n) % n];
    const n2 = normals[i];
    let denom = 1 + n1.x * n2.x + n1.y * n2.y;
    denom = Math.max(denom, 0.25); // miter limit ~ 2.8x
    out.push({ x: pts[i].x + (d * (n1.x + n2.x)) / denom, y: pts[i].y + (d * (n1.y + n2.y)) / denom });
  }
  if (d > 0) {
    // inward offset can invert/collapse small polygons
    const a0 = signedArea(pts);
    const a1 = signedArea(out);
    if (Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < 0.05) return [];
  }
  return out;
}

export function bounds(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** [min, max] of the projection of pts on unit vector (ux, uy). */
export function projectRange(pts, ux, uy) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    const v = p.x * ux + p.y * uy;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Edge descriptors for a CCW polygon (outward normal points away from the interior). */
export function edges(pts) {
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const length = dist(a, b);
    const dir = { x: (b.x - a.x) / (length || 1), y: (b.y - a.y) / (length || 1) };
    return {
      a,
      b,
      length,
      dir,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      outward: { x: dir.y, y: -dir.x },
    };
  });
}

function pointInConvexQuad(p, quad) {
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const o = orient(quad[i], quad[(i + 1) % quad.length], p);
    if (Math.abs(o) < 1e-9) continue;
    const s = Math.sign(o);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Rectangle (4 corners) fully inside polygon — also rejects reflex vertices poking into it. */
export function rectInsidePolygon(corners, poly) {
  for (const c of corners) if (!pointInPolygon(c, poly)) return false;
  for (const v of poly) if (pointInConvexQuad(v, corners)) return false;
  return true;
}

/** Separating-axis overlap test for two convex polygons (with a small tolerance). */
export function convexOverlap(A, B, tol = 0.01) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = -(q.y - p.y);
      const ny = q.x - p.x;
      const len = Math.hypot(nx, ny) || 1;
      const [a0, a1] = projectRange(A, nx / len, ny / len);
      const [b0, b1] = projectRange(B, nx / len, ny / len);
      if (a1 - tol <= b0 || b1 - tol <= a0) return false;
    }
  }
  return true;
}

/** True when two simple polygons overlap (edge crossing or containment). */
export function polysOverlap(A, B) {
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B.length; j++)
      if (segmentsIntersect(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return pointInPolygon(A[0], B) || pointInPolygon(B[0], A);
}

export function pointSegDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function circleHitsPoly(c, r, poly) {
  if (pointInPolygon(c, poly)) return true;
  for (let i = 0; i < poly.length; i++) if (pointSegDist(c, poly[i], poly[(i + 1) % poly.length]) < r) return true;
  return false;
}

export function rectPoly(cx, cy, w, d, rotDeg) {
  const a = (rotDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => ({ x: cx + u * c + v * s, y: cy - u * s + v * c }));
}
