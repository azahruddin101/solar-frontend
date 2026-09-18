// Panel models and 3D pose computation (shared by the 3D scene, layout, plan and PDF).

import { DEG } from './geo.js';
import { pointInPolygon } from './geometry.js';

export const PANEL_PRESETS = [
  { id: 'std-400', name: 'Standard 400 W', watts: 400, length: 1.879, width: 1.045 },
  { id: 'mono-450', name: 'Mono PERC 450 W', watts: 450, length: 2.094, width: 1.038 },
  { id: 'mono-550', name: 'Bifacial 550 W', watts: 550, length: 2.278, width: 1.134 },
  { id: 'topcon-590', name: 'TOPCon 590 W', watts: 590, length: 2.278, width: 1.134 },
  { id: 'res-330', name: 'Compact 330 W', watts: 330, length: 1.689, width: 0.996 },
];

export const PANEL_THICKNESS = 0.04;

export function googlePanelSpec(solarData) {
  const sp = solarData?.solarPotential;
  if (!sp?.panelCapacityWatts) return null;
  return {
    id: 'google',
    name: `Solar API reference ${Math.round(sp.panelCapacityWatts)} W`,
    watts: sp.panelCapacityWatts,
    length: sp.panelHeightMeters || 1.879,
    width: sp.panelWidthMeters || 1.045,
  };
}

export function getPanelSpec(id, solarData) {
  if (id === 'google') return googlePanelSpec(solarData) || PANEL_PRESETS[0];
  return PANEL_PRESETS.find((p) => p.id === id) || PANEL_PRESETS[0];
}

export function panelDims(spec, orientation) {
  return orientation === 'landscape'
    ? { slope: spec.width, cross: spec.length }
    : { slope: spec.length, cross: spec.width };
}

/** Effective tilt/azimuth: flush panels follow the roof face under them. */
export function effectiveOrientation(panel, roof) {
  if (panel.flush) {
    const face = roof.faceAt(panel.x, panel.y);
    if (face && face.pitch > 0) return { tilt: face.pitch, azimuth: face.azimuth };
    return { tilt: 0, azimuth: panel.azimuth };
  }
  return { tilt: panel.tilt, azimuth: panel.azimuth };
}

/**
 * Offsets of the four panel corners from its centre for a given tilt/azimuth.
 * Returns plan offsets (dx east, dy north) and vertical offset dz. Order: low-left, low-right,
 * high-right, high-left (low = the edge facing the azimuth).
 */
export function cornerOffsets(tilt, azimuth, dims) {
  const b = tilt * DEG;
  const yaw = Math.PI - azimuth * DEG;
  const c = dims.cross / 2;
  const s = dims.slope / 2;
  const local = [
    [-c, s],
    [c, s],
    [c, -s],
    [-c, -s],
  ];
  return local.map(([lx, lz]) => {
    // rotate about X by b, then about Y by yaw (three.js, Y up, -Z north)
    const y = -lz * Math.sin(b);
    const z = lz * Math.cos(b);
    const wx = lx * Math.cos(yaw) + z * Math.sin(yaw);
    const wz = -lx * Math.sin(yaw) + z * Math.cos(yaw);
    return { dx: wx, dy: -wz, dz: y };
  });
}

export function computePanelPose(panel, spec, roof, footprint) {
  const { tilt, azimuth } = effectiveOrientation(panel, roof);
  const dims = panelDims(spec, panel.orientation);
  const offs = cornerOffsets(tilt, azimuth, dims);
  let base = roof.heightAt(panel.x, panel.y);
  for (const o of offs) base = Math.max(base, roof.heightAt(panel.x + o.dx, panel.y + o.dy) - o.dz);
  const clearance = panel.flush ? 0.07 : 0.25;
  const z = base + clearance + PANEL_THICKNESS / 2;
  const corners = offs.map((o) => ({
    x: panel.x + o.dx,
    y: panel.y + o.dy,
    z: z + o.dz,
    roofZ: roof.heightAt(panel.x + o.dx, panel.y + o.dy),
  }));
  const valid = footprint ? corners.every((c) => pointInPolygon(c, footprint)) : true;
  return {
    id: panel.id,
    tilt,
    azimuth,
    dims,
    center: { x: panel.x, y: panel.y, z },
    // three.js: x = east, y = up, z = south
    position: [panel.x, z, -panel.y],
    rotation: [tilt * DEG, Math.PI - azimuth * DEG, 0, 'YXZ'],
    corners,
    valid,
  };
}

let seq = 0;
export function newPanelId() {
  seq += 1;
  return `p${Date.now().toString(36)}${seq.toString(36)}`;
}
