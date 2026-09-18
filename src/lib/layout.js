// Automatic panel layout: fills each usable roof face with a grid of panels aligned to the
// panel azimuth, respecting edge setbacks and (for tilted racks) inter-row shading spacing.

import { DEG, toLocal } from './geo.js';
import { offsetPolygon, pointInPolygon, projectRange, rectInsidePolygon } from './geometry.js';
import { newPanelId, panelDims } from './panels.js';

/** Row gap so a tilted row doesn't shade the next one at winter-solstice noon (+ margin). */
export function rowGapFor(tilt, slope, lat) {
  if (tilt <= 1) return 0.05;
  const rise = slope * Math.sin(tilt * DEG);
  const noonAlt = Math.max(18, 90 - Math.abs(lat) - 23.44);
  return Math.min(rise / Math.tan(noonAlt * DEG), 3 * rise) + 0.1;
}

export function autoFillPanels({ roof, footprint, spec, array, lat, yieldModel, minFactor = 0.72, maxPanels = 0 }) {
  const mount = array.mount;
  const setbackPoly = offsetPolygon(footprint, Math.max(0.05, array.setback) + (roof.type === 'flat' ? 0.2 : 0));
  if (setbackPoly.length < 3) return [];

  const out = [];
  for (const face of roof.faces) {
    if (face.poly.length < 3 || face.area < 2) continue;
    const flushOnSlope = mount === 'flush' && face.pitch > 0;
    const tilt = flushOnSlope ? face.pitch : mount === 'flush' ? 0 : array.tilt;
    const azimuth = flushOnSlope ? face.azimuth : array.azimuth;
    if (yieldModel && yieldModel.factor(tilt, azimuth) < minFactor) continue;

    const region = face.pitch > 0 ? offsetPolygon(face.poly, 0.25) : face.poly;
    if (region.length < 3) continue;

    const dims = panelDims(spec, array.orientation);
    const depth = dims.slope * Math.cos(tilt * DEG);
    const width = dims.cross;
    const rowPitch = depth + (mount === 'flush' ? 0.03 : rowGapFor(tilt, dims.slope, lat));
    const colPitch = width + 0.025;

    const f = { x: Math.sin(azimuth * DEG), y: Math.cos(azimuth * DEG) };
    const c = { x: f.y, y: -f.x };
    const [cMin, cMax] = projectRange(region, c.x, c.y);
    const [fMin, fMax] = projectRange(region, f.x, f.y);

    let best = [];
    for (let oc = 0; oc < 1; oc += 0.2) {
      for (let of = 0; of < 1; of += 0.25) {
        const found = [];
        for (let fc = fMax - depth / 2 - of * rowPitch; fc >= fMin + depth / 2; fc -= rowPitch) {
          for (let cc = cMin + width / 2 + oc * colPitch; cc <= cMax - width / 2; cc += colPitch) {
            const at = (du, dv) => ({ x: (cc + du) * c.x + (fc + dv) * f.x, y: (cc + du) * c.y + (fc + dv) * f.y });
            const rect = [at(-width / 2, -depth / 2), at(width / 2, -depth / 2), at(width / 2, depth / 2), at(-width / 2, depth / 2)];
            if (!rectInsidePolygon(rect, region) || !rectInsidePolygon(rect, setbackPoly)) continue;
            found.push(at(0, 0));
          }
        }
        if (found.length > best.length) best = found;
      }
    }
    const factor = yieldModel ? yieldModel.factor(tilt, azimuth) : 1;
    for (const p of best) {
      out.push({
        id: newPanelId(),
        x: p.x,
        y: p.y,
        tilt,
        azimuth,
        flush: mount === 'flush',
        orientation: array.orientation,
        custom: false,
        _score: factor,
      });
    }
  }
  out.sort((a, b) => b._score - a._score);
  const limited = maxPanels > 0 ? out.slice(0, maxPanels) : out;
  return limited.map(({ _score, ...p }) => p);
}

/** Convert Google's recommended panel placements into our panels (only those inside the footprint). */
export function importGooglePanels({ solarData, origin, footprint, maxPanels = 0 }) {
  const sp = solarData?.solarPotential;
  if (!sp?.solarPanels?.length) return [];
  const segs = sp.roofSegmentStats || [];
  const out = [];
  for (const gp of sp.solarPanels) {
    const p = toLocal({ lat: gp.center.latitude, lng: gp.center.longitude }, origin);
    if (!pointInPolygon(p, footprint)) continue;
    const seg = segs[gp.segmentIndex] || {};
    out.push({
      id: newPanelId(),
      x: p.x,
      y: p.y,
      tilt: Math.round((seg.pitchDegrees || 0) * 10) / 10,
      azimuth: Math.round(seg.azimuthDegrees ?? 180),
      flush: false,
      orientation: gp.orientation === 'LANDSCAPE' ? 'landscape' : 'portrait',
      custom: true,
    });
    if (maxPanels > 0 && out.length >= maxPanels) break;
  }
  return out;
}
