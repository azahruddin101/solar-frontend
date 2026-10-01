'use client';

// Shadow report generation: for every season and time, point the viewer's sun at the required
// position, measure how much of the panel area receives direct sun (ray casts against the live
// scene), render the scene from the report camera, then assemble the PDF. The user's own sun
// setting, selection and camera are left exactly as they were.

import * as THREE from 'three';
import { buildingList } from '../buildings.js';
import { compassLabel, DEG } from '../geo.js';
import { fmtDay, fmtHour, fmtHour24, isoDay } from '../seasons.js';
import { useStore } from '../store.js';
import { SUN_UP_MIN_Z, sunPosition } from '../sun.js';
import { REPORT_HOURS, REPORT_SEASONS, SAMPLING } from './config.js';
import { analyseSystemShading } from './panelShading.js';
import { createReportCamera } from './reportCamera.js';
import { createReportRenderer } from './reportRenderer.js';
import { buildingBounds, countPanelInstances, describeObstacles, designBounds, getObstacles, getSolarPanels, getSunLight, sunDirectionOf } from './sceneAdapter.js';
import { buildShadowReportPdf } from './shadowReportPdf.js';

/**
 * @typedef {Object} TimestampResult   one analysed sun position with its render
 * @property {string} season           'winter' | 'summer' | 'monsoon'
 * @property {string} seasonLabel
 * @property {number} day              day of year
 * @property {string} date             ISO date, e.g. "2026-12-21"
 * @property {string} dateLabel        "Dec 21"
 * @property {number} hour             solar hour (24-hour)
 * @property {string} time             "10:00"
 * @property {string} timeLabel        "10:00 AM"
 * @property {number} sunAltitude      degrees
 * @property {number} sunAzimuth       degrees clockwise from north
 * @property {string} sunCompass       "SSE"
 * @property {boolean} sunUp           false → no direct sunlight, output N/A
 * @property {number} panelCount
 * @property {number} totalPanelArea   m²
 * @property {number|null} shadedArea  m²
 * @property {number|null} unshadedArea m²
 * @property {number|null} backlitArea m² facing away from the sun
 * @property {number|null} effectiveOutputPercent
 * @property {number|null} shadedAreaPercent
 * @property {number|null} backlitPercent
 * @property {import('./panelShading.js').PanelResult[]|null} panels
 * @property {{buildingId:string, buildingName:string, image:{data:string, width:number, height:number}}[]} images
 *   one render per building, each framed close on that building (a single-building design has one entry)
 */

/**
 * @typedef {Object} SeasonSummary
 * @property {string} id
 * @property {string} label
 * @property {string} dateLabel
 * @property {string} date
 * @property {string} note
 * @property {number} daylightCount
 * @property {{value:number, timeLabel:string}|null} min
 * @property {{value:number, timeLabel:string}|null} max
 * @property {number|null} avg          mean over daylight timestamps only
 */

/** The progress steps, in order, so the UI can show the whole list before work starts. */
export function reportSteps() {
  const steps = [{ id: 'geometry', label: 'Preparing solar geometry' }];
  for (const s of REPORT_SEASONS) {
    steps.push({ id: `season:${s.id}`, label: `Preparing ${s.label} analysis` });
    for (const h of REPORT_HOURS) steps.push({ id: `${s.id}:${h}`, label: `${s.label} — ${fmtHour(h)}` });
  }
  steps.push({ id: 'pdf', label: 'Building PDF' });
  return steps;
}

export class ShadowReportError extends Error {}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const throwIfAborted = (signal) => {
  if (signal?.aborted) throw new DOMException('Report generation cancelled', 'AbortError');
};

/** Where the viewer points its sun light for this sun position (see Lights in Scene3D). */
const expectedLightDirection = (s) => new THREE.Vector3(s.x, Math.max(s.z, SUN_UP_MIN_Z), -s.y).normalize();

/** Wait until the scene's light points where the store told it to. */
async function waitForSun(light, expected, signal) {
  for (let i = 0; i < 120; i++) {
    await nextFrame();
    throwIfAborted(signal);
    light.updateMatrixWorld(true);
    if (sunDirectionOf(light).angleTo(expected) < 0.25 * DEG) return;
  }
  throw new ShadowReportError('The 3D scene did not update its sun position in time. Please try again.');
}

/** Wait until the scene draws as many panels as the design has. */
async function waitForPanels(scene, expected, signal) {
  for (let i = 0; i < 60; i++) {
    if (countPanelInstances(scene) === expected) return;
    await nextFrame();
    throwIfAborted(signal);
  }
  throw new ShadowReportError(`The 3D scene shows ${countPanelInstances(scene)} panels but the design has ${expected}. Wait for the view to finish updating, then try again.`);
}

export function summariseSeason(season, results) {
  const day = results.filter((r) => r.season === season.id);
  const lit = day.filter((r) => r.sunUp && r.effectiveOutputPercent != null);
  const pick = (cmp) => lit.reduce((b, r) => (b == null || cmp(r.effectiveOutputPercent, b.value) ? { value: r.effectiveOutputPercent, timeLabel: r.timeLabel } : b), null);
  return {
    id: season.id,
    label: season.label,
    dateLabel: fmtDay(season.day),
    date: isoDay(season.day),
    note: season.note,
    daylightCount: lit.length,
    min: pick((a, b) => a < b),
    max: pick((a, b) => a > b),
    avg: lit.length ? lit.reduce((a, r) => a + r.effectiveOutputPercent, 0) / lit.length : null,
  };
}

/**
 * Generate the report.
 * @param {Object} args
 * @param {Object} args.design            the built design (useDesign())
 * @param {() => ({scene:THREE.Scene, gl:THREE.WebGLRenderer, camera:THREE.Camera}|null)} args.getScene
 * @param {Object} args.project           store.project
 * @param {Object} [args.place]           store.place
 * @param {Object} [args.company]
 * @param {Object} [args.client]
 * @param {(stepId:string, status:'active'|'done', detail?:string) => void} [args.onStep]
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{blob:Blob, fileName:string, results:TimestampResult[], summaries:SeasonSummary[], meta:Object}>}
 */
export async function generateShadowReport({ design, getScene, project, place, company, client, onStep = () => {}, signal }) {
  const live = getScene?.();
  if (!live?.scene || !live?.gl) throw new ShadowReportError('The 3D view must be open to generate the shadow report — the renders are taken from the live 3D scene.');
  if (!design.sections.some((s) => s.poly?.length >= 3)) throw new ShadowReportError('Unable to generate shadow report because the design has no valid roof outline.');
  if (!design.modules.length) throw new ShadowReportError('Unable to generate shadow report because no solar panels were found in the current design.');
  if (!Number.isFinite(design.lat)) throw new ShadowReportError('Unable to generate shadow report because the design has no location.');

  const store = useStore.getState();
  const saved = { selectedId: store.selectedId };
  let report = null;
  try {
    onStep('geometry', 'active');
    // a selected group draws an orange highlight; hide it for the renders
    store.set({ selectedId: null, sunOverride: null });
    const { scene, gl } = live;
    const light = getSunLight(scene);
    if (!light) throw new ShadowReportError('The 3D scene has no sun light to analyse.');
    const panels = getSolarPanels(design);
    await waitForPanels(scene, panels.length, signal);
    const obstacles = getObstacles(scene);
    report = createReportRenderer(gl);
    // a single-building design gets one render per hour, same as before; a campus gets one close-up render
    // per building per hour, each framed on that building alone rather than the whole site
    const buildings = buildingList(design.buildings);
    const aspect = report.width / report.height;
    const cameras = buildings.map((b) => createReportCamera(buildings.length > 1 ? buildingBounds(design, b.id) : designBounds(design), aspect));
    const totalArea = panels.reduce((a, p) => a + p.area, 0);
    onStep('geometry', 'done', `${panels.length} panels · ${obstacles.length} shadow-casting objects · ${report.width} × ${report.height} renders`);

    /** @type {TimestampResult[]} */
    const results = [];
    let raysTotal = 0;
    for (const season of REPORT_SEASONS) {
      throwIfAborted(signal);
      onStep(`season:${season.id}`, 'active');
      onStep(`season:${season.id}`, 'done', `${fmtDay(season.day)}`);
      for (const hour of REPORT_HOURS) {
        const stepId = `${season.id}:${hour}`;
        onStep(stepId, 'active');
        throwIfAborted(signal);
        const s = sunPosition(design.lat, season.day, hour);
        const sunUp = s.z > SUN_UP_MIN_Z;
        store.set({ sunOverride: { day: season.day, hour } });
        await waitForSun(light, expectedLightDirection(s), signal);
        let shading = null;
        if (sunUp) {
          // the very direction the shadow map is drawn from
          const sunDir = sunDirectionOf(light);
          shading = await analyseSystemShading({ panels, obstacles: getObstacles(scene), sunDir, sampling: SAMPLING });
          raysTotal += shading.raysCast;
        }
        const overlay = {
          seasonLabel: season.label,
          timeLabel: fmtHour(hour),
          dateLabel: fmtDay(season.day),
          sunUp,
          effectiveOutputPercent: shading?.effectiveOutputPercent ?? null,
          shadedAreaPercent: shading?.shadedAreaPercent ?? null,
          backlitPercent: shading?.backlitPercent ?? null,
          sunAltitude: s.altitude,
          sunAzimuth: s.azimuth,
          sunCompass: compassLabel(s.azimuth),
          panelCount: panels.length,
        };
        const images = buildings.map((b, i) => ({
          buildingId: b.id,
          buildingName: b.name,
          image: report.capture(scene, cameras[i], buildings.length > 1 ? { ...overlay, buildingLabel: b.name } : overlay),
        }));
        results.push({
          season: season.id,
          seasonLabel: season.label,
          day: season.day,
          date: isoDay(season.day),
          dateLabel: fmtDay(season.day),
          hour,
          time: fmtHour24(hour),
          timeLabel: fmtHour(hour),
          sunAltitude: s.altitude,
          sunAzimuth: s.azimuth,
          sunCompass: compassLabel(s.azimuth),
          sunUp,
          panelCount: panels.length,
          totalPanelArea: totalArea,
          shadedArea: shading?.shadedArea ?? null,
          unshadedArea: shading?.litArea ?? null,
          backlitArea: shading?.backlitArea ?? null,
          effectiveOutputPercent: shading?.effectiveOutputPercent ?? null,
          shadedAreaPercent: shading?.shadedAreaPercent ?? null,
          backlitPercent: shading?.backlitPercent ?? null,
          panels: shading?.panels ?? null,
          images,
        });
        onStep(stepId, 'done', sunUp ? `Effective output ${Math.round(shading.effectiveOutputPercent)}% · shaded ${Math.round(shading.shadedAreaPercent)}%` : 'No direct sunlight');
        await nextFrame();
      }
    }

    onStep('pdf', 'active');
    const summaries = REPORT_SEASONS.map((s) => summariseSeason(s, results));
    const { spec, totals } = design;
    const meta = {
      projectName: project?.name || store.designName || 'Rooftop solar design',
      customer: client?.name || project?.customer || '',
      location: place?.address || `${design.origin?.lat?.toFixed(5)}, ${design.origin?.lng?.toFixed(5)}`,
      lat: design.lat,
      lng: design.origin?.lng ?? null,
      generatedAt: new Date(),
      systemKwp: totals.kwp,
      panelCount: panels.length,
      panelWatts: spec.watts,
      moduleName: [spec.brand, spec.model].filter(Boolean).join(' ') || spec.name || `${spec.watts} W module`,
      totalPanelArea: totalArea,
      buildings: buildings.map((b) => ({ id: b.id, name: b.name })),
      obstacles: describeObstacles(design),
      renderWidth: report.width,
      renderHeight: report.height,
      sampling: SAMPLING,
      raysTotal,
      company: company || {},
    };
    const { blob, fileName } = await buildShadowReportPdf({ meta, seasons: REPORT_SEASONS, results, summaries });
    onStep('pdf', 'done');
    return { blob, fileName, results, summaries, meta };
  } finally {
    useStore.getState().set({ sunOverride: null, selectedId: saved.selectedId });
    report?.dispose();
  }
}
