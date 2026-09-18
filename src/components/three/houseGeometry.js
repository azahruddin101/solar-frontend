// Procedural building geometry from a footprint + roof model.
// 2D plan (x = east, y = north) maps to three.js as (x, height, -y).

import * as THREE from 'three';
import { edges, offsetPolygon } from '@/lib/geometry';

function flipIfDown(index, pos) {
  if (index.length < 3) return index;
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const a = v(index[0]);
  const n = new THREE.Vector3().subVectors(v(index[1]), a).cross(new THREE.Vector3().subVectors(v(index[2]), a));
  if (n.y >= 0) return index;
  const out = [];
  for (let i = 0; i < index.length; i += 3) out.push(index[i], index[i + 2], index[i + 1]);
  return out;
}

/** Triangulated planar-ish surface over a polygon with height from `heightFn`. */
export function surfaceGeometry(poly, heightFn, uvScale = 0.5) {
  const contour = poly.map((p) => new THREE.Vector2(p.x, p.y));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = [];
  const uv = [];
  for (const p of poly) {
    pos.push(p.x, heightFn(p.x, p.y), -p.y);
    uv.push(p.x * uvScale, p.y * uvScale);
  }
  const index = flipIfDown(tris.flat(), pos);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * Vertical band along every edge of `poly`, from bottom(x, y) to top(x, y).
 * `breaks(a, b)` returns interior parameters where the top profile has a kink.
 */
export function bandGeometry(poly, top, bottom, breaks = () => []) {
  const pos = [];
  const nor = [];
  for (const e of edges(poly)) {
    const ts = [0, ...breaks(e.a, e.b), 1];
    const on = { x: e.outward.x, z: -e.outward.y };
    for (let k = 0; k < ts.length - 1; k++) {
      const p = { x: e.a.x + (e.b.x - e.a.x) * ts[k], y: e.a.y + (e.b.y - e.a.y) * ts[k] };
      const q = { x: e.a.x + (e.b.x - e.a.x) * ts[k + 1], y: e.a.y + (e.b.y - e.a.y) * ts[k + 1] };
      const A0 = [p.x, bottom(p.x, p.y), -p.y];
      const B0 = [q.x, bottom(q.x, q.y), -q.y];
      const B1 = [q.x, top(q.x, q.y), -q.y];
      const A1 = [p.x, top(p.x, p.y), -p.y];
      pos.push(...A0, ...B0, ...B1, ...A0, ...B1, ...A1);
      for (let i = 0; i < 6; i++) nor.push(on.x, 0, on.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** Ring (outer minus inner polygon) extruded upward by `height`, starting at y = `base`. */
export function ringGeometry(outer, inner, height, base) {
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.y)));
  if (inner?.length >= 3) shape.holes.push(new THREE.Path(inner.map((p) => new THREE.Vector2(p.x, p.y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, base, 0);
  return g;
}

/** Window & door placements on every wall and floor. */
export function openings(footprint, building) {
  const list = [];
  const floorH = building.floorHeight;
  const E = edges(footprint);
  let doorEdge = 0;
  E.forEach((e, i) => {
    if (e.length > E[doorEdge].length) doorEdge = i;
  });
  E.forEach((e, i) => {
    if (e.length < 1.6) return;
    const count = Math.max(1, Math.floor((e.length - 0.6) / 2.8));
    const w = Math.min(1.2, e.length / count - 0.6);
    if (w < 0.5) return;
    const rotY = Math.atan2(e.outward.x, -e.outward.y);
    for (let f = 0; f < building.floors; f++) {
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        const isDoor = f === 0 && i === doorEdge && k === Math.floor(count / 2);
        const p = { x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t };
        const h = isDoor ? 2.15 : Math.min(1.4, floorH - 1.3);
        const sill = isDoor ? 0 : 0.9;
        list.push({
          type: isDoor ? 'door' : 'window',
          x: p.x + e.outward.x * 0.02,
          y: p.y + e.outward.y * 0.02,
          z: f * floorH + sill + h / 2 + (f === 0 ? 0.45 : 0),
          w: isDoor ? 1.05 : w,
          h: isDoor ? 2.15 : h,
          rotY,
        });
      }
    }
  });
  return list;
}

export function buildHouse(footprint, roof, building) {
  const eave = roof.eaveH;
  const geos = {};
  geos.walls = bandGeometry(footprint, (x, y) => roof.heightAt(x, y), () => 0, roof.edgeBreaks);
  geos.plinth = ringGeometry(offsetPolygon(footprint, -0.12), footprint, 0.45, 0);
  geos.bands = [];
  for (let f = 1; f < building.floors; f++) {
    geos.bands.push(ringGeometry(offsetPolygon(footprint, -0.07), footprint, 0.18, f * building.floorHeight - 0.09));
  }
  geos.roofFaces = roof.faces.filter((f) => f.poly.length >= 3 && f.area > 0.01).map((f) => surfaceGeometry(f.poly, (x, y) => f.a * x + f.b * y + f.c));

  if (roof.type === 'flat') {
    const inner = offsetPolygon(footprint, 0.2);
    if (building.parapet > 0.05 && inner.length >= 3) {
      geos.parapet = ringGeometry(footprint, inner, building.parapet, eave);
      const copingInner = offsetPolygon(footprint, 0.25);
      geos.coping = ringGeometry(offsetPolygon(footprint, -0.05), copingInner.length >= 3 ? copingInner : inner, 0.07, eave + building.parapet);
    }
    geos.slabEdge = ringGeometry(offsetPolygon(footprint, -0.08), footprint, 0.22, eave - 0.2);
  } else {
    const thickness = 0.16;
    // fascia: thickness band around the (overhanging) roof edge
    const top = (x, y) => roof.heightAt(x, y);
    geos.fascia = bandGeometry(roof.outer, top, (x, y) => top(x, y) - thickness, roof.edgeBreaks);
  }
  return geos;
}
