'use client';

import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Building2, ChevronDown, ChevronUp, Maximize, Maximize2, Pause, Play, RotateCw, Sun, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { formatMoney, formatNumber } from '@/lib/energy';
import { compassLabel, toLatLng } from '@/lib/geo';
import { offsetPolygon, rectPoly, signedArea } from '@/lib/geometry';
import { hipParts, hipPlaneZ, hipZ } from '@/lib/hipRoof';
import { addBase, togglePanelAt, withinPackage } from '@/lib/autofill';
import { activeStringPath, allStringColors, stringPaint, stringStroke } from '@/lib/strings';
import { magnetize, PANEL_GAP, PANEL_THICKNESS, PATH_COLORS, pathCount, pathOn, resizeBase, ridgeHeight, roofHeightAt, roofPlanes, roofZ, slotAt, slotStart } from '@/lib/model';
import { dayFor, fmtDay, fmtHour, fmtHour24, SEASON_DAYS } from '@/lib/seasons';
import { PANEL_MESH_TAG, SUN_LIGHT_NAME } from '@/lib/shadowReport/sceneAdapter';
import { staticMapSize, staticMapUrl, zoomForSpan } from '@/lib/staticMap';
import { useStore } from '@/lib/store';
import { dayLength, SUN_UP_MIN_Z, sunPosition } from '@/lib/sun';
import { cx } from '../ui';

/**
 * Bridge out of the R3F canvas for code that lives outside it: `capture` gives the proposal its
 * cover picture, `getScene` hands the live scene, renderer and camera to the shadow report.
 */
export const sceneApi = { capture: null, getScene: null, focusBuilding: null };

function useSatellite(origin, zoom) {
  const [tex, setTex] = useState(null);
  const url = staticMapUrl({ lat: origin.lat, lng: origin.lng, zoom });
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(url, (t) => {
      if (!alive) return;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      setTex(t);
    });
    return () => (alive = false);
  }, [url]);
  return tex;
}

function ringGeo(outer, inner, height, base) {
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.y)));
  if (inner?.length >= 3) shape.holes.push(new THREE.Path(inner.map((p) => new THREE.Vector2(p.x, p.y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, base, 0);
  return g;
}

// `at` is where the satellite picture is centred, in the design's metres ({x, y}); the map's own centre by default
const HERE = { x: 0, y: 0 };

function topGeo(poly, y, mapSize, at = HERE) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y))));
  const pos = g.attributes.position;
  const uv = [];
  for (let i = 0; i < pos.count; i++) uv.push((pos.getX(i) - at.x) / mapSize + 0.5, (pos.getY(i) - at.y) / mapSize + 0.5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/**
 * Pitched roof: each slope is triangulated in plan and lifted onto the roof surface, and the walls
 * are closed up to it (the triangular gable ends, the tall side of a single slope).
 */
function slopedRoofGeo(section, mapSize, at = HERE) {
  const top = [];
  const topUv = [];
  const walls = [];
  const lift = 0.02;
  const fr = section.frame;
  const onRidge = (p) => section.roofType === 'gable' && Math.abs(p.x * fr.f.x + p.y * fr.f.y - fr.dMid) < 1e-6;
  for (const { poly } of roofPlanes(section)) {
    const contour = poly.map((p) => new THREE.Vector2(p.x, p.y));
    for (const tri of THREE.ShapeUtils.triangulateShape(contour, [])) {
      for (const i of tri) {
        const p = poly[i];
        top.push(p.x, roofZ(section, p.x, p.y) + lift, -p.y);
        topUv.push((p.x - at.x) / mapSize + 0.5, (p.y - at.y) / mapSize + 0.5);
      }
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (onRidge(a) && onRidge(b)) continue; // the ridge is inside the building, not a wall
      const za = roofZ(section, a.x, a.y);
      const zb = roofZ(section, b.x, b.y);
      const h = fr.wallBase; // the box below reaches the lower roof edge; this closes the rest
      if (za - h < 1e-4 && zb - h < 1e-4) continue; // nothing above the wall here
      walls.push(a.x, h, -a.y, b.x, h, -b.y, b.x, zb, -b.y, a.x, h, -a.y, b.x, zb, -b.y, a.x, za, -a.y);
    }
  }
  const make = (positions, uv) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  return { top: make(top, topUv), walls: walls.length ? make(walls) : null };
}

/* ───────────── hip / Kerala roofs ───────────── */

// one Mangalore tile is about 25 cm wide and shows about 33 cm per course; the texture holds 8 × 8
const TILE_W = 0.25;
const TILE_H = 0.33;
const TILE_GRID = 8;
const ROOF_BOARD = 0.12; // thickness of the roof edge (eave board)
const TIMBER = '#6b4226';

let tileTexture;
/** Terracotta Mangalore tiles: rows run along the eave, two ribs per tile, a shadow under each course. */
function tiles() {
  if (tileTexture) return tileTexture;
  const size = 512;
  const cell = size / TILE_GRID;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < TILE_GRID; row++) {
    for (let col = 0; col < TILE_GRID; col++) {
      const x = col * cell;
      const y = row * cell;
      const hue = 12 + rand() * 7;
      const sat = 52 + rand() * 12;
      const lit = 36 + rand() * 9;
      // canvas y grows down; v grows up the slope, so the top of a cell is the upper end of the tile
      const grad = g.createLinearGradient(0, y, 0, y + cell);
      grad.addColorStop(0, `hsl(${hue} ${sat}% ${lit - 6}%)`);
      grad.addColorStop(0.7, `hsl(${hue} ${sat}% ${lit + 4}%)`);
      grad.addColorStop(0.86, `hsl(${hue} ${sat}% ${lit + 2}%)`);
      grad.addColorStop(1, `hsl(${hue} ${sat}% ${lit - 16}%)`); // the lower edge throws a shadow on the course below
      g.fillStyle = grad;
      g.fillRect(x, y, cell, cell);
      // two ribs per tile
      for (const k of [0.3, 0.7]) {
        const rib = g.createLinearGradient(x + cell * (k - 0.09), 0, x + cell * (k + 0.09), 0);
        rib.addColorStop(0, 'rgba(0,0,0,0.18)');
        rib.addColorStop(0.45, 'rgba(255,255,255,0.16)');
        rib.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rib;
        g.fillRect(x + cell * (k - 0.09), y, cell * 0.18, cell);
      }
      g.fillStyle = 'rgba(30,10,4,0.55)';
      g.fillRect(x, y, 1.5, cell); // joint between tiles
    }
  }
  tileTexture = new THREE.CanvasTexture(c);
  tileTexture.wrapS = tileTexture.wrapT = THREE.RepeatWrapping;
  tileTexture.colorSpace = THREE.SRGBColorSpace;
  tileTexture.anisotropy = 8;
  return tileTexture;
}

/** Quads [{x, y, z}×4] in plan + height → a geometry (two triangles each). */
function quadsGeo(quads) {
  if (!quads.length) return null;
  const pos = [];
  for (const [a, b, c, d] of quads) for (const p of [a, b, c, a, c, d]) pos.push(p.x, p.z, -p.y);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A hip / Kerala roof: tiled slopes (tile rows parallel to each eave), the same surface a board's
 * thickness lower as the underside of the overhang, the eave board, gable triangles and the small
 * upright triangles of Kerala ends.
 */
function hipRoofGeo(section) {
  const parts = hipParts(section, ROOF_BOARD);
  const cos = Math.cos((section.pitch * Math.PI) / 180);
  const top = [];
  const uv = [];
  for (const pl of parts.roof) {
    const t = { x: -pl.eave.n.y, y: pl.eave.n.x }; // along the eave
    const contour = pl.poly.map((p) => new THREE.Vector2(p.x, p.y));
    for (const tri of THREE.ShapeUtils.triangulateShape(contour, [])) {
      // counter-clockwise in plan is counter-clockwise seen from above, so the face looks up
      const [a, b, c] = tri.map((i) => pl.poly[i]);
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) tri.reverse();
      for (const i of tri) {
        const p = pl.poly[i];
        top.push(p.x, hipPlaneZ(section, pl, p), -p.y);
        const up = (pl.eave.c - (pl.eave.n.x * p.x + pl.eave.n.y * p.y)) / cos; // metres up the slope
        uv.push((p.x * t.x + p.y * t.y) / (TILE_W * TILE_GRID), up / (TILE_H * TILE_GRID));
      }
    }
  }
  if (!parts.roof.length) {
    // an outline the slopes can't be worked out for (slanted walls with an inward corner): a finely
    // cut surface that follows the roof height, tiles laid in plan
    const poly = section.frame.roofPoly;
    const z = (p) => hipZ(section, p.x, p.y);
    const emit = (a, b, c, depth) => {
      if (depth === 0) {
        for (const p of [a, b, c]) {
          top.push(p.x, z(p), -p.y);
          uv.push(p.x / (TILE_W * TILE_GRID), p.y / (TILE_H * TILE_GRID));
        }
        return;
      }
      const m = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
      const [ab, bc, ca] = [m(a, b), m(b, c), m(c, a)];
      emit(a, ab, ca, depth - 1);
      emit(ab, b, bc, depth - 1);
      emit(ca, bc, c, depth - 1);
      emit(ab, bc, ca, depth - 1);
    };
    for (const tri of THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p.x, p.y)), [])) {
      const [a, b, c] = tri.map((i) => poly[i]);
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) emit(a, c, b, 4);
      else emit(a, b, c, 4);
    }
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  surface.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  surface.computeVertexNormals();
  const under = surface.clone();
  under.translate(0, -ROOF_BOARD, 0);
  return { top: surface, under, walls: quadsGeo(parts.walls), gablets: quadsGeo(parts.gablets), fascia: quadsGeo(parts.fascia) };
}

function HipRoof({ section }) {
  const geos = useMemo(() => hipRoofGeo(section), [section]);
  useEffect(() => () => Object.values(geos).forEach((g) => g?.dispose?.()), [geos]);
  return (
    <group>
      <mesh geometry={geos.top} castShadow receiveShadow>
        <meshStandardMaterial map={tiles()} roughness={0.85} />
      </mesh>
      <mesh geometry={geos.under} receiveShadow>
        <meshStandardMaterial color="#8a6a52" roughness={0.95} side={THREE.BackSide} />
      </mesh>
      {geos.fascia && (
        <mesh geometry={geos.fascia} castShadow>
          <meshStandardMaterial color={TIMBER} roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
      {geos.walls && (
        <mesh geometry={geos.walls} castShadow receiveShadow>
          <meshStandardMaterial color={WALL} roughness={0.92} side={THREE.DoubleSide} />
        </mesh>
      )}
      {geos.gablets && (
        <mesh geometry={geos.gablets} castShadow receiveShadow>
          <meshStandardMaterial color={TIMBER} roughness={0.75} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/* ───────────── building finish ───────────── */

const WALL = '#ece8df'; // off-white painted plaster
const PLINTH = '#8f8a80';
const COPING = '#f7f5f0';
const EDGE = '#5f5b53';
const FLOOR_H = 3; // storey height of the slab bands, m

let plasterTexture;
/**
 * Painted plaster for the walls, one storey (3 m) per tile: fine grain, faint weathering towards
 * the bottom and a shadowed slab band at each floor line. The walls' UVs are in metres.
 */
function plaster() {
  if (plasterTexture) return plasterTexture;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grime = (y / size) * 10; // canvas y runs down the storey: a little darker near its foot
      const v = 255 - rand() * 14 - grime;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v - 2;
    }
  }
  g.putImageData(img, 0, 0);
  // slab band at the top of each storey: a lit edge over a soft shadow line
  const band = size * (0.2 / FLOOR_H);
  const grad = g.createLinearGradient(0, 0, 0, band * 1.6);
  grad.addColorStop(0, 'rgba(120,112,100,0.55)');
  grad.addColorStop(0.55, 'rgba(120,112,100,0.25)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, band * 1.6);
  plasterTexture = new THREE.CanvasTexture(c);
  plasterTexture.colorSpace = THREE.SRGBColorSpace;
  plasterTexture.wrapS = plasterTexture.wrapT = THREE.RepeatWrapping;
  plasterTexture.repeat.set(1 / FLOOR_H, 1 / FLOOR_H);
  // extruded walls get v = 1 − height: unflipped and shifted, each tile spans exactly one storey
  // from its floor line (canvas bottom) up to the next (canvas top)
  plasterTexture.flipY = false;
  plasterTexture.offset.set(0, (FLOOR_H - 1) / FLOOR_H);
  plasterTexture.anisotropy = 4;
  return plasterTexture;
}

const WIN = { w: 1.2, h: 1.3, sill: 0.95, frame: 0.08, minGap: 1.4, corner: 0.6 };

/**
 * Window placements (instance matrices) for walls of height `wallH`: evenly spaced along every wall
 * long enough, one row per 3 m storey, set just proud of the face and turned to face outwards.
 */
function windowLayout(poly, wallH) {
  const out = { frames: [], glass: [], sills: [] };
  const rows = [];
  for (let k = 0; k * FLOOR_H + WIN.sill + WIN.h + 0.2 <= wallH; k++) rows.push(k * FLOOR_H + WIN.sill + WIN.h / 2);
  if (!rows.length) return out;
  const ccw = signedArea(poly) > 0;
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor((len - 2 * WIN.corner + WIN.minGap) / (WIN.w + WIN.minGap));
    if (n < 1) continue;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    // outward normal in plan (right of a CCW edge), then into scene space (x, up, −y)
    const nx = ccw ? dy : -dy;
    const ny = ccw ? -dx : dx;
    q.setFromAxisAngle(up, Math.atan2(nx, -ny));
    const place = (list, t, h, off, scale = one) => list.push(new THREE.Matrix4().compose(new THREE.Vector3(a.x + dx * t + nx * off, h, -(a.y + dy * t + ny * off)), q, scale));
    for (let j = 0; j < n; j++) {
      const t = (len * (j + 0.5)) / n;
      for (const h of rows) {
        place(out.frames, t, h, 0.012);
        place(out.glass, t, h, 0.02);
        place(out.sills, t, h - WIN.h / 2 - 0.03, 0.05);
      }
    }
  }
  return out;
}

const windowGeos = {};
function windowGeo(kind) {
  windowGeos[kind] ??=
    kind === 'frame'
      ? new THREE.PlaneGeometry(WIN.w + 2 * WIN.frame, WIN.h + 2 * WIN.frame)
      : kind === 'glass'
        ? new THREE.PlaneGeometry(WIN.w, WIN.h)
        : new THREE.BoxGeometry(WIN.w + 0.25, 0.06, 0.1);
  return windowGeos[kind];
}

let glassTexture;
/** Glazing: dark tinted glass with a mullion, a transom and a soft sky reflection. */
function glass() {
  if (glassTexture) return glassTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 140;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 128, 140);
  sky.addColorStop(0, '#6f8aa3');
  sky.addColorStop(0.45, '#2f4458');
  sky.addColorStop(1, '#1b2733');
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 140);
  g.fillStyle = 'rgba(255,255,255,0.12)'; // diagonal glint
  g.beginPath();
  g.moveTo(20, 0);
  g.lineTo(52, 0);
  g.lineTo(0, 70);
  g.lineTo(0, 27);
  g.fill();
  g.fillStyle = '#f4f2ec'; // mullion and transom
  g.fillRect(61, 0, 6, 140);
  g.fillRect(0, 44, 128, 5);
  glassTexture = new THREE.CanvasTexture(c);
  glassTexture.colorSpace = THREE.SRGBColorSpace;
  return glassTexture;
}

function Windows({ poly, wallH }) {
  const w = useMemo(() => windowLayout(poly, wallH), [poly, wallH]);
  return (
    <>
      <Instances items={w.frames} geometry={windowGeo('frame')} cast={false}>
        <meshStandardMaterial color="#f4f2ec" roughness={0.6} />
      </Instances>
      <Instances items={w.glass} geometry={windowGeo('glass')} cast={false}>
        <meshStandardMaterial map={glass()} roughness={0.12} metalness={0.4} />
      </Instances>
      <Instances items={w.sills} geometry={windowGeo('sill')} cast={false}>
        <meshStandardMaterial color="#d9d5cc" roughness={0.85} />
      </Instances>
    </>
  );
}

function Building({ section, tex, mapSize, at = HERE }) {
  const geos = useMemo(() => {
    const t = Math.min(section.parapetT || 0.23, 0.5);
    const inner = offsetPolygon(section.poly, t);
    const wallH = section.frame ? section.frame.wallBase : section.height;
    const plinthH = Math.min(0.45, wallH * 0.2);
    // a slightly proud, darker band at ground level
    const plinth = plinthH > 0.05 ? ringGeo(offsetPolygon(section.poly, -0.03), null, plinthH, 0) : null;
    if (section.frame?.hip) {
      const body = ringGeo(section.poly, null, wallH, 0);
      return { body, hip: true, plinth, edges: new THREE.EdgesGeometry(body, 30) };
    }
    if (section.frame) {
      const roof = slopedRoofGeo(section, mapSize, at);
      const body = ringGeo(section.poly, null, wallH, 0);
      return { body, top: roof.top, gables: roof.walls, parapet: null, sloped: true, plinth, edges: new THREE.EdgesGeometry(body, 30) };
    }
    const body = ringGeo(section.poly, null, section.height, 0);
    const hasParapet = section.parapetH > 0.05 && inner.length >= 3;
    // coping: a thin, slightly wider cap sitting within the parapet's height (no change to shading)
    const capIn = offsetPolygon(section.poly, t + 0.03);
    const cap = Math.min(0.06, section.parapetH / 2);
    return {
      body,
      top: topGeo(section.poly, section.height + 0.02, mapSize, at),
      parapet: hasParapet ? ringGeo(section.poly, inner, section.parapetH - cap, section.height) : null,
      coping: hasParapet && capIn.length >= 3 ? ringGeo(offsetPolygon(section.poly, -0.03), capIn, cap, section.height + section.parapetH - cap) : null,
      plinth,
      edges: new THREE.EdgesGeometry(body, 30),
    };
  }, [section, mapSize, at]);
  useEffect(() => () => Object.values(geos).forEach((g) => g?.dispose?.()), [geos]);
  const wallMap = plaster();
  return (
    <group>
      <mesh geometry={geos.body} castShadow receiveShadow>
        <meshStandardMaterial color={WALL} map={wallMap} roughness={0.92} />
      </mesh>
      <Windows poly={section.poly} wallH={section.frame ? section.frame.wallBase : section.height} />
      <lineSegments geometry={geos.edges}>
        <lineBasicMaterial color={EDGE} transparent opacity={0.55} />
      </lineSegments>
      {geos.plinth && (
        <mesh geometry={geos.plinth} receiveShadow>
          <meshStandardMaterial color={PLINTH} roughness={0.95} />
        </mesh>
      )}
      {geos.hip && <HipRoof section={section} />}
      {geos.top && <mesh geometry={geos.top} receiveShadow castShadow={Boolean(geos.sloped)}>
        {/* a pitched roof is seen from both sides near the eaves; without imagery it gets a tile colour */}
        <meshStandardMaterial key={tex ? 'sat' : 'plain'} map={tex} color={tex ? '#ffffff' : geos.sloped ? '#a1604a' : '#cfcbc2'} roughness={1} side={geos.sloped ? THREE.DoubleSide : THREE.FrontSide} />
      </mesh>}
      {geos.gables && (
        <mesh geometry={geos.gables} castShadow receiveShadow>
          <meshStandardMaterial color={WALL} roughness={0.92} side={THREE.DoubleSide} />
        </mesh>
      )}
      {geos.parapet && (
        <mesh geometry={geos.parapet} castShadow receiveShadow>
          <meshStandardMaterial color={WALL} map={wallMap} roughness={0.92} />
        </mesh>
      )}
      {geos.coping && (
        <mesh geometry={geos.coping} castShadow receiveShadow>
          <meshStandardMaterial color={COPING} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

function Instances({ items, geometry, children, cast = true, userData, colors = null }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    items.forEach((m, i) => ref.current.setMatrixAt(i, m));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  // an optional tint per instance (string colours on the panels); white = the material as it is
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || (!colors && !mesh.instanceColor)) return;
    const c = new THREE.Color();
    items.forEach((_, i) => mesh.setColorAt(i, c.set((colors && colors[i]) || '#ffffff')));
    mesh.instanceColor.needsUpdate = true;
  }, [items, colors]);
  if (!items.length) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[geometry, undefined, items.length]} castShadow={cast} receiveShadow userData={userData}>
      {children}
    </instancedMesh>
  );
}

function legGeometry(shape) {
  if (shape === 'cylindrical') return new THREE.CylinderGeometry(0.04, 0.04, 1, 14);
  if (shape === 'l-shape') {
    // angle section: two thin plates meeting at a corner
    const g = new THREE.ExtrudeGeometry(new THREE.Shape([[0, 0], [0.08, 0], [0.08, 0.012], [0.012, 0.012], [0.012, 0.08], [0, 0.08]].map(([x, y]) => new THREE.Vector2(x - 0.03, y - 0.03))), { depth: 1, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.5, 0);
    return g;
  }
  if (shape === 'c-channel') {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape([[0, 0], [0.08, 0], [0.08, 0.012], [0.012, 0.012], [0.012, 0.068], [0.08, 0.068], [0.08, 0.08], [0, 0.08]].map(([x, y]) => new THREE.Vector2(x - 0.04, y - 0.04))), { depth: 1, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.5, 0);
    return g;
  }
  return new THREE.BoxGeometry(0.07, 1, 0.07);
}

/** The string being built, in 3D: a numbered marker on each picked panel and a line in tap order. */
function StringPath({ design }) {
  const tool = useStore((s) => s.tool);
  const activeId = useStore((s) => s.activeStringId);
  const picked = useStore((s) => s.electrical.strings);
  const path = useMemo(() => activeStringPath(design, activeId, tool), [design, activeId, tool, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!path || !path.points.length) return null;
  const lift = 0.25;
  const pts = path.points.map((m) => [m.position[0], m.position[1] + lift, m.position[2]]);
  return (
    <group>
      {pts.length > 1 && <Line points={pts} color={path.color} lineWidth={3} depthTest={false} />}
      {path.points.map((m, i) => (
        <Html key={m.id} position={[m.position[0], m.position[1] + lift, m.position[2]]} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
          <div className="grid h-6 w-6 place-items-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow" style={{ background: path.color }}>{i + 1}</div>
        </Html>
      ))}
    </group>
  );
}

function PanelTables({ design }) {
  const { poleFor } = design;
  // the string tool is out: every panel shows its string's colour
  const stringTool = useStore((s) => s.tool === 'string');
  const stringColors = useMemo(() => (stringTool ? allStringColors(design.electrical) : null), [stringTool, design.electrical]);
  const data = useMemo(() => {
    const byDim = new Map();
    const legs = new Map(); // pole shape → column matrices (each base stands on its own kind of pole)
    const blocks = [];
    const rods = []; // rafters (along the slope, pole to pole) and purlins (across, under the panels)
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const t of design.tables) {
      const key = `${t.size.cross.toFixed(3)}|${t.size.slope.toFixed(3)}|${t.valid}`;
      if (!byDim.has(key)) byDim.set(key, { key, bad: !t.valid, cross: t.size.cross, slope: t.size.slope, list: [], ids: [] });
      for (const m of t.modules) {
        e.set(...m.rotation);
        q.setFromEuler(e);
        byDim.get(key).list.push(new THREE.Matrix4().compose(new THREE.Vector3(...m.position), q, one));
        byDim.get(key).ids.push(m.id);
      }
      const tilt = t.tilt * (Math.PI / 180);
      const sin = Math.sin(tilt);
      const cos = Math.cos(tilt);
      const f = { x: Math.sin(t.azimuth * (Math.PI / 180)), y: Math.cos(t.azimuth * (Math.PI / 180)) };
      const c = { x: f.y, y: -f.x };
      e.set(tilt, Math.PI - t.azimuth * (Math.PI / 180), 0, 'YXZ');
      q.setFromEuler(e);
      // a rod lying on the frame: at `sl` metres up the slope from the front edge, `u` across from
      // the middle, `drop` metres under the panel plane; local x across, local z along the slope
      const rod = (sl, u, drop, sx, sz) => {
        const v = t.size.depth / 2 - sl * cos;
        const z = t.base + t.frontLeg + sl * sin - drop;
        rods.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x + c.x * u + f.x * v, z, -(t.y + c.y * u + f.y * v)), q, new THREE.Vector3(sx, 0.05, sz)));
      };
      const { slopeLen, width, slope } = t.size;
      const inset = Math.min(0.3, slopeLen * 0.15);
      // purlins: two under every panel row — the rows planted, or the rows the base has room for
      const rows = Math.max(t.rows, t.grid?.rows || 0);
      const rowPath = pathOn(t, 'row', rows); // a pathway between two rows shifts the rows past it
      const sl0 = (slopeLen - (rows * slope + (rows - 1) * PANEL_GAP + pathCount(rows, rowPath) * (rowPath?.extra || 0))) / 2;
      if (t.flush) {
        // on a sloped roof the rails sit on hooks, right where the hooks are
        for (const sl of [inset, slopeLen - inset]) rod(sl, 0, 0.03, width, 0.05);
      } else {
        for (let r = 0; r < rows; r++) {
          const top = sl0 + slotStart(r, slope, rowPath);
          rod(top + slope * 0.2, 0, 0.03, width, 0.05);
          rod(top + slope * 0.8, 0, 0.03, width, 0.05);
        }
      }
      const shape = t.flush ? 'square' : poleFor?.(t)?.shape || 'square';
      if (!legs.has(shape)) legs.set(shape, []);
      const own = legs.get(shape);
      for (let i = 0; i < t.legs.length; i += 2) {
        const front = t.legs[i];
        const back = t.legs[i + 1];
        if (!back) break;
        own.push(new THREE.Matrix4().makeScale(1, front.h, 1).setPosition(front.x, front.base + front.h / 2, -front.y));
        own.push(new THREE.Matrix4().makeScale(1, back.h, 1).setPosition(back.x, back.base + back.h / 2, -back.y));
        if (t.flush) continue; // hooks: no pedestal, no rafter
        blocks.push(new THREE.Matrix4().makeTranslation(front.x, front.base + 0.09, -front.y));
        blocks.push(new THREE.Matrix4().makeTranslation(back.x, back.base + 0.09, -back.y));
        // the rafter from this front pole to its back pole, carrying the purlins
        const u = (front.x - t.x) * c.x + (front.y - t.y) * c.y;
        rod(slopeLen / 2, u, 0.08, 0.06, slopeLen - 2 * inset + 0.1);
      }
      // supports between panel rows planted one above the other: a column under each rafter at
      // the junction, and a cross rod joining them under the panel edges
      for (const l of t.midLegs || []) {
        own.push(new THREE.Matrix4().makeScale(1, l.h, 1).setPosition(l.x, l.base + l.h / 2, -l.y));
        blocks.push(new THREE.Matrix4().makeTranslation(l.x, l.base + 0.09, -l.y));
      }
      for (const sl of t.joins || []) rod(sl, 0, 0.08, width, 0.06);
    }
    return { groups: [...byDim.values()], legs: [...legs.entries()].map(([shape, list]) => ({ shape, list })), blocks, rods };
  }, [design.tables, poleFor]);

  const legGeos = useMemo(() => new Map(data.legs.map((l) => [l.shape, legGeometry(l.shape)])), [data.legs]);
  const blockGeo = useMemo(() => new THREE.BoxGeometry(0.35, 0.18, 0.35), []);
  const rodGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  return (
    <group>
      {data.groups.map((g) => (
        <PanelGroup key={g.key} group={g} colors={stringColors ? g.ids.map((id) => stringColors.get(id) || '#ffffff') : null} />
      ))}
      {design.tables.map((t) => (
        <TablePick key={t.id} t={t} design={design} />
      ))}
      {design.tables.map((t) => (t.pathways?.length ? <Pathways key={`${t.id}-paths`} t={t} /> : null))}
      <Instances items={data.rods} geometry={rodGeo}>
        <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.5} />
      </Instances>
      {data.legs.map((l) => (
        <Instances key={l.shape} items={l.list} geometry={legGeos.get(l.shape)}>
          <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.4} />
        </Instances>
      ))}
      <Instances items={data.blocks} geometry={blockGeo}>
        <meshStandardMaterial color="#a8a29e" roughness={1} />
      </Instances>
    </group>
  );
}

/**
 * Follow the pointer on a horizontal plane at height `y` until the button is let go; `onPoint`
 * gets the roof-plan point {x, y} under the pointer (orbit controls are paused meanwhile).
 */
function dragOnPlane(e, get, y, onPoint) {
  const { camera, gl, controls, raycaster } = get();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let frame = 0;
  if (controls) controls.enabled = false;
  gl.domElement.style.cursor = 'grabbing';
  const move = (ev) => {
    // the button was let go where we did not hear it (outside the window, a dialog…): stop here,
    // or the group would keep following the mouse
    if (ev.buttons === 0) {
      up();
      return;
    }
    const r = gl.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const pos = { x: hit.x, y: -hit.z };
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => onPoint(pos, ev));
  };
  function up() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('blur', up);
    if (controls) controls.enabled = true;
    gl.domElement.style.cursor = '';
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', up);
}

/** A grab handle on a selected base: a small ball the user drags (resize corner, turn). */
function Handle({ position, anchor, color, cursor, onDown, title, Icon }) {
  // an icon button floating a little away from the base (so it never sits over the panels), with
  // a thin line back to the point it controls; the button itself is what the user drags
  return (
    <group>
      {anchor && <Line points={[anchor, position]} color={color} lineWidth={1.5} transparent opacity={0.9} depthTest={false} />}
      <mesh position={anchor || position} renderOrder={20}>
        <sphereGeometry args={[0.08, 10, 8]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <Html position={position} center zIndexRange={[20, 0]}>
        <button
          type="button"
          title={title}
          aria-label={title}
          onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); onDown(ev); }}
          className="grid h-9 w-9 cursor-grab place-items-center rounded-full border-2 border-white text-white shadow-lg active:cursor-grabbing"
          style={{ background: color, cursor }}
        >
          <Icon className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </Html>
    </group>
  );
}

/**
 * Click / drag target over a table: click selects the group, dragging slides it on the roof.
 * A selected base also gets a corner handle to resize it (whole panels, any number) and a dot in
 * front of it to turn it — the same editing as the plan view.
 */
/**
 * The pathways of one base: amber walkway strips. Their size is in the sidebar; with the base
 * selected, the first pathway of each direction also gets a width mark (a measuring line with
 * end ticks and a small "60 cm" tag), not a label on every strip.
 */
function Pathways({ t }) {
  const selected = useStore((s) => s.selectedId === t.source);
  // one mesh per direction, each in its own colour
  const geos = useMemo(() => ['row', 'col'].map((axis) => {
    const list = t.pathways.filter((p) => p.axis === axis);
    if (!list.length) return null;
    const g = new THREE.BufferGeometry();
    const v = [];
    const idx = [];
    list.forEach((p, i) => {
      v.push(...p.corners.flatMap((q) => [q.x, q.z + (axis === 'col' ? 0.035 : 0.03), -q.y]));
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { axis, g };
  }).filter(Boolean), [t.pathways]);
  useEffect(() => () => geos.forEach(({ g }) => g.dispose()), [geos]);
  const marks = selected ? ['row', 'col'].map((axis) => t.pathways.find((p) => p.axis === axis)).filter(Boolean) : [];
  return (
    <group>
      {geos.map(({ axis, g }) => (
        <mesh key={axis} geometry={g} raycast={() => null}>
          <meshStandardMaterial color={PATH_COLORS[axis]} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {marks.map((p) => <WidthMark key={p.axis} p={p} />)}
    </group>
  );
}

/** A dimension mark across a pathway: a line with a tick at each end and the width in the middle. */
function WidthMark({ p }) {
  const lift = 0.08;
  const [a, b] = p.dim.map((q) => new THREE.Vector3(q.x, q.z + lift, -q.y));
  // the ticks run along the pathway, square to the measuring line
  const along = new THREE.Vector3(p.corners[1].x - p.corners[0].x, 0, -(p.corners[1].y - p.corners[0].y));
  if (p.axis === 'col') along.set(p.corners[3].x - p.corners[0].x, 0, -(p.corners[3].y - p.corners[0].y));
  along.normalize().multiplyScalar(0.18);
  const tick = (q) => [q.clone().sub(along), q.clone().add(along)];
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return (
    <group>
      <Line points={[a, b]} color="#ffffff" lineWidth={2} depthTest={false} />
      <Line points={tick(a)} color="#ffffff" lineWidth={2} depthTest={false} />
      <Line points={tick(b)} color="#ffffff" lineWidth={2} depthTest={false} />
      <Html position={mid} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded px-1.5 py-px text-[10px] font-bold text-white shadow" style={{ background: PATH_COLORS[p.axis] }}>{Math.round(p.width * 100)} cm</div>
      </Html>
    </group>
  );
}

/** A press-and-drag across panels with the string tool: { mode: 'add' | 'remove' }, or null. */
let stringDrag = null;

function TablePick({ t, design }) {
  const selected = useStore((s) => s.selectedId === t.source);
  const get = useThree((s) => s.get);
  const mid = t.base + (t.frontLeg + t.backLeg) / 2 + 0.06;
  const movable = t.kind !== 'zone';
  const top = t.base + t.backLeg + 0.3;

  /** The id of the panel under a pointer event on this table, or null. */
  const panelAt = (e) => {
    const slot = slotAt(t, { x: e.point.x, y: -e.point.z }, design.spec);
    const id = slot && `${t.id}:${slot.key}`;
    return id && t.modules.some((m) => m.id === id) ? id : null;
  };
  const onMove = (e) => {
    if (!stringDrag || !(e.buttons & 1)) return;
    e.stopPropagation();
    const id = panelAt(e);
    if (id) stringPaint(id, stringDrag.mode, design.electrical?.maxLen);
  };

  const onDown = (e) => {
    e.stopPropagation();
    const store = useStore.getState();
    if (store.readOnly) return; // the client's view-only 3D: no selecting, no moving
    if (store.tool === 'string') {
      // the string tool: a click puts the panel in the open string (or starts one); pressing and
      // dragging across panels adds them in that order (the camera holds still meanwhile)
      if (e.button === 0) {
        const id = panelAt(e);
        if (!id) return;
        const { controls } = get();
        stringDrag = { mode: stringStroke(id, design.electrical?.maxLen) };
        if (controls) controls.enabled = false;
        const up = () => {
          stringDrag = null;
          if (controls) controls.enabled = true;
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          window.removeEventListener('blur', up);
        };
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        window.addEventListener('blur', up);
      }
      return;
    }
    if (store.tool === 'add-panel' || store.tool === 'remove-panel') {
      // one panel at a time: the slot under the click
      if (movable && e.button === 0) togglePanelAt(design, t, { x: e.point.x, y: -e.point.z }, store.tool === 'add-panel' ? 'add' : 'remove');
      return;
    }
    store.set({ selectedId: t.source });
    if (!movable || e.button !== 0) return;
    const off = { x: t.x - e.point.x, y: t.y + e.point.z };
    dragOnPlane(e, get, e.point.y, (p, ev) => {
      const pos = { x: p.x + off.x, y: p.y + off.y };
      const st = useStore.getState();
      const o = st.objects.find((k) => k.id === t.source);
      if (o) st.updateObject(o.id, ev.altKey ? pos : magnetize(o, pos, design));
    });
  };
  // the corner opposite the anchor is dragged: whole panel slots, no limit
  const onResize = (e) => {
    e.stopPropagation();
    if (useStore.getState().readOnly || e.button !== 0) return;
    const anchor = t.poly[3];
    dragOnPlane(e, get, top, (p) => {
      const st = useStore.getState();
      const o = st.objects.find((k) => k.id === t.source);
      if (o) st.updateObject(o.id, withinPackage(o, resizeBase(o, anchor, p, design.spec), design.spec)); // a package caps the panels
    });
  };
  const onTurn = (e) => {
    e.stopPropagation();
    if (useStore.getState().readOnly || e.button !== 0) return;
    dragOnPlane(e, get, top, (p, ev) => {
      let az = ((Math.atan2(p.x - t.x, p.y - t.y) * 180) / Math.PI + 360) % 360;
      if (ev.shiftKey) az = Math.round(az / 15) * 15;
      useStore.getState().updateObject(t.source, { azimuth: Math.round(az), auto: false });
    });
  };

  const f = { x: Math.sin(t.azimuth * (Math.PI / 180)), y: Math.cos(t.azimuth * (Math.PI / 180)) };
  const c = { x: f.y, y: -f.x };
  // handles sit clear of the base: the turn dot 2 m in front of it, the resize icon 1.2 m out
  // from the corner it moves (diagonally, away from the base)
  const turnAt = { x: t.x + f.x * (t.size.depth / 2 + 2), y: t.y + f.y * (t.size.depth / 2 + 2) };
  const corner = t.poly[1];
  const su = Math.sign((corner.x - t.x) * c.x + (corner.y - t.y) * c.y) || 1;
  const sv = Math.sign((corner.x - t.x) * f.x + (corner.y - t.y) * f.y) || 1;
  const resizeAt = { x: corner.x + (c.x * su + f.x * sv) * 0.85, y: corner.y + (c.y * su + f.y * sv) * 0.85 };
  const resizeHandle = <Handle position={[resizeAt.x, top, -resizeAt.y]} anchor={[corner.x, top, -corner.y]} color="#0f172a" cursor="nwse-resize" onDown={onResize} title="Resize: drag to add or remove panel rows and columns" Icon={Maximize2} />;
  return (
    <group>
      <mesh
        position={[t.x, mid, -t.y]}
        rotation={[t.tilt * (Math.PI / 180), Math.PI - t.azimuth * (Math.PI / 180), 0, 'YXZ']}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerOver={() => !useStore.getState().readOnly && (document.body.style.cursor = ['string', 'add-panel', 'remove-panel'].includes(useStore.getState().tool) ? 'crosshair' : movable ? 'grab' : 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[t.size.width + 0.1, 0.08, t.size.slopeLen + 0.1]} />
        <meshBasicMaterial color="#f5a524" transparent opacity={selected ? 0.45 : 0} depthWrite={false} />
      </mesh>
      {selected && movable && resizeHandle}
      {selected && movable && !t.flush && <Handle position={[turnAt.x, top, -turnAt.y]} anchor={[t.x + f.x * (t.size.depth / 2), top, -(t.y + f.y * (t.size.depth / 2))]} color="#f5a524" cursor="grab" onDown={onTurn} title="Turn: drag to change the facing direction" Icon={RotateCw} />}
    </group>
  );
}

/**
 * A typical crystalline module seen from above: silver aluminium frame, deep blue cells in a
 * 6 x 12 grid (turned for landscape) separated by white lines, with fine silver busbars.
 */
function panelTexture(cross, slope) {
  const landscape = cross > slope;
  const [cols, rows] = landscape ? [12, 6] : [6, 12];
  const W = 32 * cols;
  const H = Math.round((W * slope) / cross);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const frame = Math.max(4, Math.round(W * 0.018));
  const edge = g.createLinearGradient(0, 0, W, H);
  edge.addColorStop(0, '#e5e7eb');
  edge.addColorStop(0.5, '#b8bec6');
  edge.addColorStop(1, '#d9dde2');
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f8fafc'; // white backsheet showing between the cells
  g.fillRect(frame, frame, W - 2 * frame, H - 2 * frame);
  const gap = Math.max(2, W * 0.008);
  const cw = (W - 2 * frame - gap * (cols + 1)) / cols;
  const ch = (H - 2 * frame - gap * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = frame + gap + k * (cw + gap);
      const y = frame + gap + r * (ch + gap);
      const cell = g.createLinearGradient(x, y, x + cw, y + ch);
      cell.addColorStop(0, '#2a4f9e');
      cell.addColorStop(0.55, '#1d3a80');
      cell.addColorStop(1, '#16306b');
      g.fillStyle = cell;
      g.fillRect(x, y, cw, ch);
      g.fillStyle = 'rgba(203,213,225,0.55)'; // busbars run along the long side of the module
      for (let b = 1; b <= 3; b++) {
        if (landscape) g.fillRect(x, y + (ch * b) / 4 - 0.5, cw, 1);
        else g.fillRect(x + (cw * b) / 4 - 0.5, y, 1, ch);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function PanelGroup({ group, colors }) {
  const geo = useMemo(() => new THREE.BoxGeometry(group.cross, PANEL_THICKNESS, group.slope), [group.cross, group.slope]);
  const tex = useMemo(() => panelTexture(group.cross, group.slope), [group.cross, group.slope]);
  return (
    <Instances items={group.list} geometry={geo} colors={colors} userData={{ [PANEL_MESH_TAG]: !group.bad }}>
      <meshStandardMaterial map={tex} roughness={0.3} metalness={0.2} color={group.bad ? '#ff5a5a' : '#ffffff'} emissive={group.bad ? '#ff0000' : '#000000'} emissiveIntensity={group.bad ? 0.55 : 0} />
    </Instances>
  );
}

/** Seeded random so a tree keeps its shape between renders. */
function rng(seed) {
  const st = { v: seed };
  return () => (st.v = (st.v * 16807) % 2147483647) / 2147483647;
}

/** One leafy clump: a lumpy sphere with darker undersides and lighter sun-lit tops. */
function leafClump(radius, rnd) {
  const g = new THREE.IcosahedronGeometry(radius, 3);
  const pos = g.attributes.position;
  const colors = [];
  const base = new THREE.Color().setHSL(0.27 + rnd() * 0.06, 0.5 + rnd() * 0.15, 0.2 + rnd() * 0.06);
  const c = new THREE.Color();
  const k1 = 2 + rnd() * 2;
  const k2 = 3 + rnd() * 3;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + 0.16 * Math.sin((x / radius) * k1 * 3 + z) + 0.12 * Math.sin((y / radius) * k2 * 3 + x * 2) + 0.1 * Math.cos((z / radius) * k1 * 4 + y);
    pos.setXYZ(i, x * n, y * n * 0.85, z * n);
    const light = 0.75 + 0.55 * Math.max(0, y / radius); // brighter on top
    c.copy(base).multiplyScalar(light);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function buildTree(t) {
  const rnd = rng(Math.abs(Math.round(t.x * 131 + t.y * 71 + t.r * 13)) + 7);
  const trunkH = t.h * 0.45;
  const trunkR = Math.max(0.12, t.r * 0.07);
  const branches = [];
  const clumps = [];
  // main boughs fan out from the top of the trunk
  const boughs = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < boughs; i++) {
    const a = (i / boughs) * Math.PI * 2 + rnd() * 0.6;
    const reach = t.r * (0.45 + rnd() * 0.3);
    const rise = t.h * (0.18 + rnd() * 0.18);
    const from = new THREE.Vector3(0, trunkH * (0.75 + rnd() * 0.2), 0);
    const to = new THREE.Vector3(Math.cos(a) * reach, from.y + rise, Math.sin(a) * reach);
    branches.push({ from, to, r: trunkR * 0.45 });
    clumps.push({ p: to.clone(), r: t.r * (0.38 + rnd() * 0.16) });
    clumps.push({ p: from.clone().lerp(to, 0.55).add(new THREE.Vector3(0, t.r * 0.15, 0)), r: t.r * (0.3 + rnd() * 0.12) });
  }
  // crown on top and a few fillers so the canopy reads as one mass
  clumps.push({ p: new THREE.Vector3(0, t.h * 0.82, 0), r: t.r * 0.5 });
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    const d = t.r * 0.35 * rnd();
    clumps.push({ p: new THREE.Vector3(Math.cos(a) * d, t.h * (0.6 + rnd() * 0.25), Math.sin(a) * d), r: t.r * (0.3 + rnd() * 0.15) });
  }
  return {
    trunkH,
    trunkR,
    branches: branches.map((b) => {
      const dir = b.to.clone().sub(b.from);
      const len = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      return { pos: b.from.clone().add(b.to).multiplyScalar(0.5), q, len, r: b.r };
    }),
    clumps: clumps.map((c) => ({ p: c.p, geo: leafClump(c.r, rnd) })),
  };
}

function Tree({ t, base }) {
  const tree = useMemo(() => buildTree(t), [t]);
  useEffect(() => () => tree.clumps.forEach((c) => c.geo.dispose()), [tree]);
  return (
    <group position={[t.x, base, -t.y]}>
      {/* trunk: tapered, with a flared root */}
      <mesh position={[0, tree.trunkH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[tree.trunkR * 0.6, tree.trunkR * 1.25, tree.trunkH, 10]} />
        <meshStandardMaterial color="#4a3728" roughness={1} />
      </mesh>
      <mesh position={[0, tree.trunkR * 0.4, 0]} castShadow>
        <cylinderGeometry args={[tree.trunkR * 1.2, tree.trunkR * 2, tree.trunkR * 0.8, 10]} />
        <meshStandardMaterial color="#3f2f22" roughness={1} />
      </mesh>
      {tree.branches.map((b, i) => (
        <mesh key={i} position={b.pos} quaternion={b.q} castShadow>
          <cylinderGeometry args={[b.r * 0.5, b.r, b.len, 7]} />
          <meshStandardMaterial color="#4a3728" roughness={1} />
        </mesh>
      ))}
      {tree.clumps.map((c, i) => (
        <mesh key={i} position={c.p} geometry={c.geo} castShadow receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────── sun path ───────────── */

const SUMMER = '#f59e0b';
const WINTER = '#60a5fa';
const DAY_PATH = '#facc15';

let glowTexture;
/** Soft radial glow for the sun (built once). */
function sunGlow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,250,210,1)');
  grad.addColorStop(0.25, 'rgba(255,236,120,0.85)');
  grad.addColorStop(0.5, 'rgba(255,214,60,0.35)');
  grad.addColorStop(1, 'rgba(255,200,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/** Arc of one day's sun, sunrise → sunset, on a dome of `radius` around the building. */
function dayArc(lat, day, radius) {
  const { sunrise, sunset } = dayLength(lat, day);
  const at = (h) => {
    const s = sunPosition(lat, day, h);
    return [s.x * radius, Math.max(s.z, 0) * radius, -s.y * radius];
  };
  const pts = [];
  for (let h = sunrise; h < sunset; h += 0.1) pts.push(at(h));
  pts.push(at(sunset));
  return { pts, at, sunrise, sunset };
}

const label = (color, size = 'text-base') => `${size} font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]`.concat(' ', color);

/**
 * Sun study: the selected day's arc with hour numbers and sunrise / sunset times, the summer and
 * winter solstice arcs, hour paths joining the same hour across the year, and the sun itself.
 */
function SunPath({ lat, day, hour, radius }) {
  const today = dayArc(lat, day, radius);
  const summer = dayArc(lat, SEASON_DAYS.summer, radius);
  const winter = dayArc(lat, SEASON_DAYS.winter, radius);
  const hours = [];
  for (let h = Math.ceil(today.sunrise); h <= Math.floor(today.sunset); h++) hours.push(h);
  // hour paths: each whole hour traced from the winter to the summer solstice (while the sun is up)
  const hourPaths = useMemo(() => {
    const out = [];
    for (let h = 5; h <= 19; h++) {
      const pts = [];
      for (let d = SEASON_DAYS.summer; d <= SEASON_DAYS.winter; d += 6) {
        const s = sunPosition(lat, d, h);
        if (s.z > 0) pts.push([s.x * radius, s.z * radius, -s.y * radius]);
      }
      if (pts.length > 1) out.push(pts);
    }
    return out;
  }, [lat, radius]);
  const s = sunPosition(lat, day, hour);
  const up = s.z > SUN_UP_MIN_Z;
  const sun = [s.x * radius, s.z * radius, -s.y * radius];
  const tex = useMemo(() => sunGlow(), []);
  return (
    <group>
      {hourPaths.map((pts, i) => (
        <Line key={i} points={pts} color={DAY_PATH} lineWidth={1} transparent opacity={0.35} />
      ))}
      {summer.pts.length > 1 && <Line points={summer.pts} color={SUMMER} lineWidth={1.5} transparent opacity={0.85} />}
      {winter.pts.length > 1 && <Line points={winter.pts} color={WINTER} lineWidth={1.5} transparent opacity={0.85} />}
      {today.pts.length > 1 && <Line points={today.pts} color={DAY_PATH} lineWidth={2.5} />}
      {hours.map((h) => (
        // zIndexRange kept low so these never escape above page UI (modals sit at z-50) — drei's default range is in the millions
        <Html key={h} position={today.at(h)} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
          <span className={label('text-yellow-300', 'text-xl')}>{h}</span>
        </Html>
      ))}
      {[today.sunrise, today.sunset].map((h) => (
        <Html key={h} position={today.at(h)} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
          <span className={cx(label('text-yellow-300', 'text-sm'), 'block translate-y-5')}>{fmtHour24(h)}</span>
        </Html>
      ))}
      {up && (
        <group position={sun}>
          <sprite scale={radius * 0.45}>
            <spriteMaterial map={tex} transparent opacity={0.9} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </sprite>
          <mesh>
            <sphereGeometry args={[radius * 0.055, 32, 32]} />
            <meshBasicMaterial color="#fff27a" toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Reports the camera's heading every frame so the compass can turn with it (north is −z). */
function CompassTracker({ onTurn }) {
  // measured from the point the camera turns around, which is not always the middle of the map
  useFrame(({ camera, controls }) => onTurn((Math.atan2(camera.position.x - (controls?.target.x || 0), camera.position.z - (controls?.target.z || 0)) * 180) / Math.PI));
  return null;
}

function Compass({ dial }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  return (
    <div className="pointer-events-none absolute right-4 top-4 h-16 w-16 rounded-full bg-black/75 shadow-lg ring-1 ring-white/15 backdrop-blur-sm">
      <svg ref={dial} viewBox="-50 -50 100 100" className="h-full w-full">
        {ticks.map((a) => (
          <line key={a} x1="0" y1={a % 90 ? -42 : -38} x2="0" y2="-46" stroke="white" strokeWidth={a % 90 ? 1.2 : 2.4} transform={`rotate(${a})`} />
        ))}
        <line x1="-8" y1="0" x2="8" y2="0" stroke="white" strokeWidth="1.2" />
        <line x1="0" y1="-8" x2="0" y2="8" stroke="white" strokeWidth="1.2" />
        {[['N', 0, '#ef4444'], ['E', 90, 'white'], ['S', 180, 'white'], ['W', 270, 'white']].map(([t, a, c]) => (
          <text key={t} x="0" y="-24" fill={c} fontSize="13" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${a}) rotate(${-a} 0 -24)`}>
            {t}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Lights({ lat, day, hour, span }) {
  const s = sunPosition(lat, day, hour);
  const up = s.z > SUN_UP_MIN_Z;
  const d = span * 2 + 40;
  const ext = span + 10;
  return (
    <>
      <ambientLight intensity={up ? 0.55 : 0.25} />
      <hemisphereLight args={['#dbeafe', '#1f2937', up ? 0.5 : 0.2]} />
      <directionalLight
        name={SUN_LIGHT_NAME}
        castShadow
        intensity={up ? 2.6 * Math.min(1, s.z * 3 + 0.25) : 0}
        position={[s.x * d, Math.max(s.z, 0.02) * d, -s.y * d]}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-camera-left={-ext}
        shadow-camera-right={ext}
        shadow-camera-top={ext}
        shadow-camera-bottom={-ext}
        shadow-camera-far={d * 3}
      />
    </>
  );
}

/** Slim slider: brand-coloured fill and a white knob over a native range input. */
function SunSlider({ label: name, min, max, step, value, onChange }) {
  const v = Math.max(min, Math.min(max, value));
  const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
  return (
    <div className="relative h-5 flex-1">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <div className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand bg-white shadow" style={{ left: `calc(${pct}% + ${8 - (pct / 100) * 16}px)` }} />
      <input aria-label={name} type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(Number(e.target.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </div>
  );
}

/* ───────────── selected panel group ───────────── */

/**
 * Sun study controls, docked at the bottom centre. Collapsed: date, time and play in one pill.
 * Expanded: date and time sliders, solstice presets and the path legend.
 */
function SunControls({ day, hour, sunrise, sunset, playing, onPlay, patch }) {
  const [open, setOpen] = useState(false);
  const shown = Math.max(sunrise, Math.min(sunset, hour));
  const presets = [
    ['Jun 21', SEASON_DAYS.summer],
    ['Dec 21', SEASON_DAYS.winter],
  ];
  const legend = [
    ['Summer solstice', SUMMER, 1],
    ['Winter solstice', WINTER, 1],
    ['Hour path', DAY_PATH, 0.45],
    ['Selected day', DAY_PATH, 1],
  ];
  return (
    <div className="absolute bottom-4 left-1/2 z-10 w-[22rem] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl bg-white/95 text-slate-800 shadow-xl backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-3 py-2">
        <Sun className="h-4 w-4 shrink-0 text-amber-500" />
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm">
          <span className="font-semibold">{fmtDay(day)}</span>
          <span className="text-slate-400">·</span>
          <span className="font-medium tabular-nums">{fmtHour(shown)}</span>
          {open ? <ChevronDown className="ml-auto h-4 w-4 text-slate-400" /> : <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />}
        </button>
        <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={onPlay} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-brand-fg shadow hover:bg-brand-600">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 pb-3 pt-3">
          <div className="flex items-center gap-3">
            <span className="w-9 text-xs text-slate-500">Date</span>
            <SunSlider label="Date" min={1} max={365} step={1} value={day} onChange={(d) => patch('sun', { season: null, day: d })} />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-9 text-xs text-slate-500">Time</span>
            <SunSlider label="Time" min={sunrise} max={sunset} step={1 / 60} value={hour} onChange={(h) => patch('sun', { hour: h })} />
          </div>
          <div className="flex items-center gap-2">
            {presets.map(([text, d]) => (
              <button
                key={d}
                type="button"
                onClick={() => patch('sun', { season: null, day: d, hour: 12 })}
                className={cx('rounded-full border px-3 py-1 text-xs font-medium transition', day === d && Math.abs(hour - 12) < 0.01 ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 hover:bg-slate-50')}
              >
                {text}, 12 PM
              </button>
            ))}
            <span className="ml-auto text-[11px] tabular-nums text-slate-400">
              {fmtHour24(sunrise)} - {fmtHour24(sunset)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {legend.map(([text, color, opacity]) => (
              <span key={text} className="flex items-center gap-1">
                <span className="h-0.5 w-3 rounded-full" style={{ background: color, opacity }} />
                {text}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Moves the camera's pivot: `focusApi.go(point, distance?)`, set while a scene is mounted. */
const focusApi = { go: null };

/**
 * The point the camera turns around. It glides to wherever `focusApi.go` sends it — a double-clicked spot,
 * a building, the whole site — carrying the camera along, so the view keeps its angle. Dragging the view
 * takes over at once.
 */
function CameraFocus() {
  const get = useThree((s) => s.get);
  const goal = useRef(null);
  const bound = useRef(null);
  useEffect(() => {
    focusApi.go = (point, distance) => { goal.current = { to: new THREE.Vector3().copy(point), distance }; };
    return () => {
      focusApi.go = null;
      bound.current?.controls.removeEventListener('start', bound.current.stop);
    };
  }, []);
  useFrame((_, dt) => {
    const { camera, controls } = get();
    if (!controls) return;
    if (bound.current?.controls !== controls) {
      const stop = () => { goal.current = null; };
      controls.addEventListener('start', stop);
      bound.current = { controls, stop };
    }
    const g = goal.current;
    if (!g) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 7);
    const step = g.to.clone().sub(controls.target).multiplyScalar(k);
    controls.target.add(step);
    camera.position.add(step);
    const arm = camera.position.clone().sub(controls.target);
    if (g.distance) camera.position.copy(controls.target).add(arm.setLength(arm.length() + (g.distance - arm.length()) * k));
    controls.update();
    const there = g.to.distanceTo(controls.target) < 0.03 && (!g.distance || Math.abs(camera.position.distanceTo(controls.target) - g.distance) < 0.1);
    if (there) goal.current = null;
  });
  return null;
}

function Bridge({ span, height, center }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { camera } = get();
    const d = Math.max(span * 1.25, 20);
    camera.position.set(center[0] - d * 0.55, height + d * 0.6, center[2] + d * 0.75);
    sceneApi.capture = () => {
      const { gl, scene, camera: cam } = get();
      gl.render(scene, cam);
      return gl.domElement.toDataURL('image/jpeg', 0.9);
    };
    sceneApi.getScene = () => {
      const { gl, scene, camera: cam } = get();
      return { gl, scene, camera: cam };
    };
    return () => {
      sceneApi.capture = null;
      sceneApi.getScene = null;
    };
  }, [get, span, height, center]);
  return null;
}

export default function Scene3D({ design }) {
  const origin = useStore((s) => s.origin);
  const sun = useStore((s) => s.sun);
  const sunOverride = useStore((s) => s.sunOverride);
  const patch = useStore((s) => s.patch);
  const [playing, setPlaying] = useState(false);
  const dial = useRef(null);
  const selectedId = useStore((s) => s.selectedId);
  const turnCompass = (deg) => {
    if (dial.current) dial.current.style.transform = `rotate(${deg}deg)`;
  };
  const userDay = sun.day ?? dayFor(sun.season);
  // while the shadow report runs it drives the scene's sun; the controls keep showing the user's own state
  const day = sunOverride?.day ?? userDay;
  const hour = sunOverride?.hour ?? sun.hour;
  const { sunrise, sunset } = dayLength(design.lat, userDay);

  const span = useMemo(() => {
    const p = design.sections.flatMap((s) => s.poly);
    if (!p.length) return 20;
    return Math.max(Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x)), Math.max(...p.map((q) => q.y)) - Math.min(...p.map((q) => q.y)), 12);
  }, [design.sections]);
  const maxH = Math.max(3, ...design.sections.map((s) => ridgeHeight(s)));
  // the camera starts turning around the middle of everything drawn, not the map's centre
  const centerKey = useMemo(() => {
    const p = design.sections.flatMap((s) => s.poly);
    if (!p.length) return '0|0';
    return `${((Math.max(...p.map((q) => q.x)) + Math.min(...p.map((q) => q.x))) / 2).toFixed(1)}|${((Math.max(...p.map((q) => q.y)) + Math.min(...p.map((q) => q.y))) / 2).toFixed(1)}`;
  }, [design.sections]);
  const center = useMemo(() => {
    const [x, y] = centerKey.split('|').map(Number);
    return [x, maxH * 0.6, -y];
  }, [centerKey, maxH]);
  // one entry per building, to bring it into view
  const places = useMemo(() => design.buildings.map((b) => {
    const own = design.sections.filter((s) => s.building === b.id);
    const p = own.flatMap((s) => s.poly);
    if (!p.length) return null;
    const xs = p.map((q) => q.x);
    const ys = p.map((q) => q.y);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 8);
    const top = Math.max(...own.map((s) => ridgeHeight(s)));
    return { id: b.id, name: b.name, point: new THREE.Vector3((Math.max(...xs) + Math.min(...xs)) / 2, top * 0.6, -(Math.max(...ys) + Math.min(...ys)) / 2), distance: Math.max(size * 1.7 + top, 18) };
  }).filter(Boolean), [design.buildings, design.sections]);
  const wholeSite = () => focusApi.go?.(new THREE.Vector3(...center), Math.max(span * 1.25, 20) * 1.15);
  // the sidebar's building picker turns the view to the chosen building (see StepSimpleDesign)
  useEffect(() => {
    sceneApi.focusBuilding = (id) => {
      const b = places.find((p) => p.id === id);
      if (b) focusApi.go?.(b.point, b.distance);
    };
    return () => {
      sceneApi.focusBuilding = null;
    };
  }, [places]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      const { sun: cur, patch: p } = useStore.getState();
      const next = Math.max(sunrise, cur.hour + 0.1);
      p('sun', { hour: next > sunset ? sunrise : next });
    }, 60);
    return () => clearInterval(id);
  }, [playing, sunrise, sunset]);

  if (!origin) return null;
  return (
    <div className="absolute inset-0 bg-[#05070d]">
      <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 42, near: 0.3, far: 5000 }}>
        <color attach="background" args={['#05070d']} />
        {/* double-click anything — a roof, a panel, the ground — to turn the camera around that spot */}
        <group onDoubleClick={(e) => { e.stopPropagation(); focusApi.go?.(e.point); }}>
          <SceneContent design={design} origin={origin} day={day} hour={hour} span={span} maxH={maxH} />
        </group>
        <OrbitControls makeDefault enableDamping target={center} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={3} maxDistance={span * 8} />
        <CameraFocus />
        <Bridge span={span} height={maxH} center={center} />
        <CompassTracker onTurn={turnCompass} />
      </Canvas>

      {!sunOverride && (
        <div className="absolute left-4 top-16 flex max-w-[60%] flex-col items-start gap-2">
          {places.length > 1 && (
            <div className="flex flex-wrap gap-1.5 rounded-xl bg-black/70 p-1.5 shadow-lg ring-1 ring-white/15 backdrop-blur-sm">
              <button type="button" onClick={wholeSite} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/15"><Maximize className="h-3.5 w-3.5" /> Whole site</button>
              {places.map((b) => (
                <button key={b.id} type="button" title={`Bring ${b.name} into view`} onClick={() => { focusApi.go?.(b.point, b.distance); useStore.getState().set({ buildingId: b.id }); }} className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{b.name}</span></button>
              ))}
            </div>
          )}
          <div className="pointer-events-none rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/80 shadow ring-1 ring-white/10">Double-click a spot to rotate around it · right-drag to move the view</div>
        </div>
      )}
      <Compass dial={dial} />
      <SunControls day={userDay} hour={sun.hour} sunrise={sunrise} sunset={sunset} playing={playing} onPlay={() => setPlaying((v) => !v)} patch={patch} />
    </div>
  );
}

/**
 * A building that lies outside the sharp satellite picture around the map's centre (a campus spreads
 * further than one picture covers). It gets a picture of its own, centred on it: laid on the ground
 * around it and on its roofs, so every building looks as sharp as the first.
 */
function FarBuilding({ group }) {
  const tex = useSatellite(group.center, group.zoom);
  const size = staticMapSize(group.center.lat, group.zoom);
  return (
    <>
      {tex && (
        <mesh rotation-x={-Math.PI / 2} position={[group.at.x, 0.015, -group.at.y]} receiveShadow>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial map={tex} roughness={1} />
        </mesh>
      )}
      {group.sections.map((s) => <Building key={s.id} section={s} tex={tex} mapSize={size} at={group.at} />)}
    </>
  );
}

function SceneContent({ design, origin, day, hour, span, maxH }) {
  const texNear = useSatellite(origin, 20);
  const texFar = useSatellite(origin, 18);
  const nearSize = staticMapSize(origin.lat, 20);
  const farSize = staticMapSize(origin.lat, 18);
  // roofs inside the centre picture use it; a building reaching beyond it gets a picture of its own
  const groups = useMemo(() => {
    const reach = nearSize / 2 - 1;
    const near = [];
    const far = [];
    for (const b of design.buildings) {
      const sections = design.sections.filter((s) => s.building === b.id);
      const p = sections.flatMap((s) => s.poly);
      if (!p.length) continue;
      const xs = p.map((q) => q.x);
      const ys = p.map((q) => q.y);
      if (Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)) <= reach) {
        near.push(...sections);
        continue;
      }
      const at = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      far.push({ id: b.id, sections, at, center: toLatLng(at, origin), zoom: Math.min(20, zoomForSpan(origin.lat, size, 1.25)) });
    }
    return { near, far };
  }, [design.buildings, design.sections, nearSize, origin]);
  return (
    <>
      <Lights lat={design.lat} day={day} hour={hour} span={span} />
      <SunPath lat={design.lat} day={day} hour={hour} radius={span * 1.6 + 25} />
      <gridHelper args={[farSize * 3, 60, '#1f2937', '#111827']} position={[0, -0.06, 0]} />
      {texFar && (
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 0]} receiveShadow>
          <planeGeometry args={[farSize, farSize]} />
          <meshStandardMaterial map={texFar} roughness={1} />
        </mesh>
      )}
      {texNear && (
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[nearSize, nearSize]} />
          <meshStandardMaterial map={texNear} roughness={1} />
        </mesh>
      )}
      {/* the roofs: with the base tool armed, a tap on a roof puts a base right there */}
      <group
        onPointerDown={(e) => {
          const st = useStore.getState();
          if (st.tool !== 'add-base' || st.readOnly || e.button !== 0) return;
          e.stopPropagation();
          addBase(design, { x: e.point.x, y: -e.point.z }); // adding selects the base and puts the tool away
        }}
        onPointerOver={() => useStore.getState().tool === 'add-base' && (document.body.style.cursor = 'crosshair')}
        onPointerOut={() => useStore.getState().tool === 'add-base' && (document.body.style.cursor = '')}
      >
        {groups.near.map((s) => (
          <Building key={s.id} section={s} tex={texNear} mapSize={nearSize} />
        ))}
        {groups.far.map((g) => <FarBuilding key={g.id} group={g} />)}
      </group>
      {design.blocks.map((b) => {
        const base = roofHeightAt(design.sections, b.x, b.y);
        const c = rectPoly(b.x, b.y, b.w, b.d, b.rot || 0);
        const ang = Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x);
        return (
          <mesh key={b.id} position={[b.x, base + b.h / 2, -b.y]} rotation-y={ang} castShadow receiveShadow>
            {/tank/i.test(b.name || '') ? <cylinderGeometry args={[b.w / 2, b.w / 2, b.h, 24]} /> : <boxGeometry args={[b.w, b.h, b.d]} />}
            <meshStandardMaterial color={/tank/i.test(b.name || '') ? '#1f2937' : '#8b9099'} roughness={0.9} />
          </mesh>
        );
      })}
      {design.trees.map((t) => (
        <Tree key={t.id} t={t} base={roofHeightAt(design.sections, t.x, t.y)} />
      ))}
      <PanelTables design={design} />
      <StringPath design={design} />
    </>
  );
}
