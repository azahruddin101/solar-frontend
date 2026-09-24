// Direct-sun exposure of the solar panels for one sun position, from the actual 3D geometry:
// points across every module's top face cast a ray towards the sun against the scene's shadow-casting
// meshes. Nothing is inferred from pixels; the same meshes that draw the shadows decide the numbers.

import * as THREE from 'three';
import { PANEL_THICKNESS } from '../model.js';
import { SAMPLING } from './config.js';

/** Rays start just above the top face so a module never intersects its own box. */
const LIFT = PANEL_THICKNESS / 2 + 0.01;
/** A sun grazing the panel plane at less than this cosine counts as behind it. */
const MIN_COS = 1e-3;

/**
 * @typedef {Object} PanelSampling
 * @property {number} grid     samples per side
 * @property {number} total    grid²
 * @property {number} lit      samples in direct sun
 * @property {number} shaded   samples an obstacle blocks
 * @property {number} backlit  samples with the sun behind the panel plane (no direct sun, not an obstacle)
 */

/**
 * @typedef {Object} PanelResult
 * @property {string} id
 * @property {string} tableId
 * @property {number} area                m²
 * @property {number} litFraction         0..1
 * @property {number} shadedFraction      0..1
 * @property {number} backlitFraction     0..1
 * @property {PanelSampling} sampling
 */

/**
 * @typedef {Object} SystemShading
 * @property {number} panelCount
 * @property {number} totalArea           m²
 * @property {number} litArea             m² in direct sun
 * @property {number} shadedArea          m² behind an obstacle
 * @property {number} backlitArea         m² facing away from the sun
 * @property {number} effectiveOutputPercent   litArea / totalArea × 100
 * @property {number} shadedAreaPercent        shadedArea / totalArea × 100
 * @property {number} backlitPercent           backlitArea / totalArea × 100
 * @property {number} raysCast
 * @property {PanelResult[]} panels
 */

/** True when any obstacle lies along the ray. Stops at the first hit — the distance is irrelevant. */
function blocked(raycaster, obstacles, hits) {
  for (let i = 0; i < obstacles.length; i++) {
    hits.length = 0;
    obstacles[i].raycast(raycaster, hits);
    if (hits.length) return true;
  }
  return false;
}

/**
 * Sample one panel on a grid × grid lattice of points centred in equal cells of its top face.
 * @param {import('./sceneAdapter.js').SolarPanel} panel
 * @param {THREE.Vector3} sunDir   unit vector towards the sun, scene axes
 * @returns {PanelSampling}
 */
export function samplePanel(panel, sunDir, obstacles, grid, scratch) {
  const total = grid * grid;
  if (panel.normal.dot(sunDir) <= MIN_COS) return { grid, total, lit: 0, shaded: 0, backlit: total };
  const { raycaster, point, hits } = scratch;
  let lit = 0;
  let shaded = 0;
  for (let i = 0; i < grid; i++) {
    const u = (-0.5 + (i + 0.5) / grid) * panel.cross;
    for (let j = 0; j < grid; j++) {
      const v = (-0.5 + (j + 0.5) / grid) * panel.slope;
      point.set(u, LIFT, v).applyMatrix4(panel.matrix);
      raycaster.set(point, sunDir);
      if (blocked(raycaster, obstacles, hits)) shaded++;
      else lit++;
    }
  }
  return { grid, total, lit, shaded, backlit: 0 };
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * Shading of the whole system for one sun direction. Works in slices of ~12 ms so the progress UI
 * keeps painting; area-weighted so mixed panel sizes aggregate correctly.
 * @param {Object} args
 * @param {import('./sceneAdapter.js').SolarPanel[]} args.panels
 * @param {THREE.Object3D[]} args.obstacles
 * @param {THREE.Vector3} args.sunDir
 * @param {{base:number, refined:number, rayBudget:number}} [args.sampling]
 * @param {(done:number, total:number) => void} [args.onProgress]
 * @returns {Promise<SystemShading>}
 */
export async function analyseSystemShading({ panels, obstacles, sunDir, sampling = SAMPLING, onProgress }) {
  const scratch = { raycaster: new THREE.Raycaster(), point: new THREE.Vector3(), hits: [] };
  scratch.raycaster.far = Infinity;
  const dir = sunDir.clone().normalize();
  const results = [];
  let raysCast = 0;
  let sliceStart = performance.now();
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    let s = samplePanel(p, dir, obstacles, sampling.base, scratch);
    raysCast += s.backlit ? 0 : s.total;
    // partly shaded: look closer while the budget allows
    if (s.shaded > 0 && s.shaded < s.total && raysCast + sampling.refined ** 2 <= sampling.rayBudget) {
      s = samplePanel(p, dir, obstacles, sampling.refined, scratch);
      raysCast += s.total;
    }
    results.push({ id: p.id, tableId: p.tableId, area: p.area, litFraction: s.lit / s.total, shadedFraction: s.shaded / s.total, backlitFraction: s.backlit / s.total, sampling: s });
    if (performance.now() - sliceStart > 12) {
      onProgress?.(i + 1, panels.length);
      await nextFrame();
      sliceStart = performance.now();
    }
  }
  let totalArea = 0;
  let litArea = 0;
  let shadedArea = 0;
  let backlitArea = 0;
  for (const r of results) {
    totalArea += r.area;
    litArea += r.area * r.litFraction;
    shadedArea += r.area * r.shadedFraction;
    backlitArea += r.area * r.backlitFraction;
  }
  const pct = (a) => (totalArea > 0 ? (a / totalArea) * 100 : 0);
  return { panelCount: panels.length, totalArea, litArea, shadedArea, backlitArea, effectiveOutputPercent: pct(litArea), shadedAreaPercent: pct(shadedArea), backlitPercent: pct(backlitArea), raysCast, panels: results };
}
