// Adapters between the design model / the live three.js scene and the shadow analysis: which objects
// are solar panels, which objects block the sun, where the sun light is and how big the design is.
// Nothing here depends on object names beyond the two tags Scene3D sets.

import * as THREE from 'three';
import { buildingIdOf } from '../buildings.js';
import { ridgeHeight, roofHeightAt } from '../model.js';

/** `userData` flag Scene3D puts on the instanced meshes that draw the (valid) solar panels. */
export const PANEL_MESH_TAG = 'solarPanels';
/** `name` Scene3D gives the directional light that plays the sun. */
export const SUN_LIGHT_NAME = 'sun';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * @typedef {Object} SolarPanel  one PV module as the analysis sees it
 * @property {string} id
 * @property {string} tableId
 * @property {number} cross      width across the row (m) — the module's local x
 * @property {number} slope      length up the slope (m) — the module's local z
 * @property {number} area       cross × slope (m²)
 * @property {THREE.Matrix4} matrix  local → world (same pose the scene renders)
 * @property {THREE.Vector3} normal  world-space normal of the sunward face
 */

/**
 * The solar panels of the design as sampling targets. They come from the very module poses the
 * scene renders (design.modules → PanelTables), so the numbers describe exactly what the image shows.
 * @returns {SolarPanel[]}
 */
export function getSolarPanels(design) {
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  return design.modules.map((m) => {
    euler.set(...m.rotation);
    q.setFromEuler(euler);
    return {
      id: m.id,
      tableId: m.tableId,
      cross: m.dims.cross,
      slope: m.dims.slope,
      area: m.dims.cross * m.dims.slope,
      matrix: new THREE.Matrix4().compose(new THREE.Vector3(...m.position), q, one),
      normal: UP.clone().applyQuaternion(q),
    };
  });
}

/** The instanced meshes that draw the panels (for cross-checking the scene against the design). */
export function getSolarPanelMeshes(scene) {
  const out = [];
  scene.traverse((o) => {
    if (o.isInstancedMesh && o.userData?.[PANEL_MESH_TAG]) out.push(o);
  });
  return out;
}

/** How many panel instances the scene currently draws. */
export const countPanelInstances = (scene) => getSolarPanelMeshes(scene).reduce((n, m) => n + m.count, 0);

/**
 * Everything that can throw a shadow on a panel: every visible mesh that casts shadows — walls,
 * parapets, raised roofs, tanks and other blocks, trees, mounting legs and rails, and the other
 * panels (inter-row shading). This is the same set the viewer's shadow map is drawn from, so the
 * numbers and the picture agree by construction.
 * @returns {THREE.Object3D[]}
 */
export function getObstacles(scene) {
  const out = [];
  scene.traverse((o) => {
    if (o.isMesh && o.castShadow && o.visible) out.push(o);
  });
  return out;
}

/** The directional light Scene3D drives with the sun position. */
export function getSunLight(scene) {
  let light = null;
  scene.traverse((o) => {
    if (!light && o.isDirectionalLight && o.name === SUN_LIGHT_NAME) light = o;
  });
  return light;
}

/** Unit vector from the scene towards the sun, exactly as the light is pointed. */
export function sunDirectionOf(light) {
  return light.position.clone().sub(light.target.position).normalize();
}

/** Design objects the user placed that shade the panels (for the report's cover). */
export function describeObstacles(design) {
  const blocks = design.blocks.length;
  const trees = design.trees.length;
  const parapets = design.sections.filter((s) => !s.frame && s.parapetH > 0.05).length;
  const raised = Math.max(0, design.sections.length - 1);
  const parts = [];
  if (blocks) parts.push(`${blocks} block${blocks > 1 ? 's' : ''} (tank, room, structure)`);
  if (trees) parts.push(`${trees} tree${trees > 1 ? 's' : ''}`);
  if (raised) parts.push(`${raised} additional roof section${raised > 1 ? 's' : ''}`);
  if (parapets) parts.push(`${parapets} parapet${parapets > 1 ? 's' : ''}`);
  return { count: blocks + trees + raised + parapets, summary: parts.length ? parts.join(', ') : 'none marked — only the mounting structure and the panels themselves can shade' };
}

/**
 * World bounds of the design in scene axes (x east, y up, z south): roof sections with their walls,
 * blocks, trees and the panel tables. Used to frame the report camera.
 */
export function designBounds(design) {
  const box = new THREE.Box3();
  const add = (x, y, z) => box.expandByPoint(new THREE.Vector3(x, y, -z));
  // the frame is fitted to the roofs and what stands on them; the walls below only need to be seen,
  // not fitted, so the roof fills the picture instead of shrinking to make room for the ground
  let lowestRoof = Infinity;
  for (const s of design.sections) {
    const top = ridgeHeight(s) + (s.parapetH || 0);
    lowestRoof = Math.min(lowestRoof, s.frame ? s.frame.wallBase : s.height);
    for (const p of s.poly) {
      add(p.x, Math.max(0, (s.frame ? s.frame.wallBase : s.height) - 1.5), p.y);
      add(p.x, top, p.y);
    }
  }
  for (const b of design.blocks) {
    const base = roofHeightAt(design.sections, b.x, b.y);
    const r = Math.hypot(b.w, b.d) / 2;
    add(b.x - r, base, b.y - r);
    add(b.x + r, base + b.h, b.y + r);
  }
  for (const t of design.trees) {
    const base = roofHeightAt(design.sections, t.x, t.y);
    add(t.x - t.r, Math.max(base, Number.isFinite(lowestRoof) ? lowestRoof - 1.5 : 0), t.y - t.r);
    add(t.x + t.r, base + t.h, t.y + t.r);
  }
  for (const t of design.tables) {
    if (!t.valid) continue;
    for (const p of t.poly) {
      add(p.x, t.base, p.y);
      add(p.x, t.base + t.backLeg + 0.1, p.y);
    }
  }
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 2, 0), new THREE.Vector3(12, 4, 12));
  return box;
}

/**
 * World bounds of one building only (its own roof sections, with their walls) — the same framing
 * `designBounds` does for the whole site, narrowed to a single building so its report render is a
 * close-up rather than the whole campus. Blocks/trees/tables aren't attributed to a building in the
 * model, so they aren't included here; they still appear in the render (it's the same shared scene),
 * just aren't fitted to.
 */
export function buildingBounds(design, buildingId) {
  const box = new THREE.Box3();
  const add = (x, y, z) => box.expandByPoint(new THREE.Vector3(x, y, -z));
  const own = design.sections.filter((s) => buildingIdOf(s, design.buildings) === buildingId);
  for (const s of own) {
    const top = ridgeHeight(s) + (s.parapetH || 0);
    for (const p of s.poly) {
      add(p.x, Math.max(0, (s.frame ? s.frame.wallBase : s.height) - 1.5), p.y);
      add(p.x, top, p.y);
    }
  }
  if (box.isEmpty()) return designBounds(design);
  return box;
}
