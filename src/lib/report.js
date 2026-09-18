// Assembles every number, table and plan primitive used by both the on-screen report
// and the PDF so they always agree.

import { computeFinancials, CURRENCIES } from './energy.js';
import { compassLabel } from './geo.js';
import { bounds, edges, polygonArea } from './geometry.js';

export function buildReport({ design, finance, report, place, snapshot }) {
  const { totals, spec, roof, shape, footprint, solarData, origin, yieldModel, poses, building } = design;
  const currency = CURRENCIES[finance.currency] ? finance.currency : 'USD';
  const fin = computeFinancials({
    kwp: totals.kwp,
    annualKwh: totals.acKwh,
    tariff: finance.tariff,
    costPerKw: finance.costPerKw,
    degradation: finance.degradation,
    escalation: finance.escalation,
  });
  const sp = solarData?.solarPotential;
  const carbonFactor = sp?.carbonOffsetFactorKgPerMwh ?? (currency === 'INR' ? 710 : 450);
  const co2Kg = (totals.acKwh * carbonFactor) / 1000;
  const roofArea = roof.faces.reduce((s, f) => s + (f.pitch > 0 ? f.area / Math.cos((f.pitch * Math.PI) / 180) : f.area), 0);

  return {
    title: report.projectName || 'Rooftop Solar Plan',
    customer: report.customerName,
    preparedBy: report.preparedBy,
    date: new Date(),
    place,
    origin,
    currency,
    snapshot,
    spec,
    building,
    roof: { type: roof.type, pitch: roof.pitch, eaveH: roof.eaveH, ridgeH: roof.ridgeH, area: roofArea },
    footprintArea: shape.area,
    perimeter: shape.perimeter,
    totals,
    groups: totals.groups.map((g) => ({
      ...g,
      direction: `${g.azimuth}° ${compassLabel(g.azimuth)}`,
      kwp: (g.count * spec.watts) / 1000,
      acKwh: g.dc * ((finance.efficiency ?? 85) / 100),
      efficiency: yieldModel ? yieldModel.factor(g.tilt, g.azimuth) : null,
    })),
    finance: { ...finance, currency, ...fin },
    co2Kg,
    carbonFactor,
    trees: co2Kg / 21,
    coverage: shape.area > 0 ? totals.panelArea / shape.area : 0,
    yieldSource: yieldModel?.source || 'model',
    optimal: yieldModel?.optimal,
    solar: sp
      ? {
          quality: solarData.imageryQuality,
          imageryDate: solarData.imageryDate,
          maxPanels: sp.maxArrayPanelsCount,
          maxArea: sp.maxArrayAreaMeters2,
          maxSunshine: sp.maxSunshineHoursPerYear,
          roofArea: sp.wholeRoofStats?.areaMeters2,
          segments: (sp.roofSegmentStats || []).map((s, i) => {
            const q = s.stats?.sunshineQuantiles || [];
            return {
              index: i + 1,
              pitch: s.pitchDegrees || 0,
              azimuth: s.azimuthDegrees || 0,
              area: s.stats?.areaMeters2 || 0,
              sunshine: q.length ? q[Math.floor(q.length / 2)] : 0,
            };
          }),
        }
      : null,
    plan: planData(footprint, roof, poses),
  };
}

/** Plan-view primitives in local metres (x east, y north). */
export function planData(footprint, roof, poses) {
  const outline = roof.outer?.length >= 3 ? roof.outer : footprint;
  const faces = roof.type === 'flat' ? [] : roof.faces.filter((f) => f.poly.length >= 3 && f.area > 0.05).map((f) => f.poly);
  const panels = poses.map((p, i) => ({ id: p.id, n: i + 1, corners: p.corners.map(({ x, y }) => ({ x, y })), valid: p.valid }));
  const edgeLabels = edges(footprint)
    .filter((e) => e.length >= 1)
    .map((e) => ({ mid: e.mid, outward: e.outward, text: `${e.length.toFixed(2)} m`, angle: Math.atan2(e.dir.y, e.dir.x) }));
  const bb = bounds([...footprint, ...outline, ...panels.flatMap((p) => p.corners)]);
  return { footprint, outline, faces, panels, edgeLabels, bounds: bb, area: polygonArea(footprint) };
}

/** Fit plan bounds into a box; returns a mapper from metres to box coordinates (north up). */
export function fitPlan(bb, x, y, w, h, pad = 0.12) {
  const spanX = bb.width * (1 + pad * 2) || 1;
  const spanY = bb.height * (1 + pad * 2) || 1;
  const scale = Math.min(w / spanX, h / spanY);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  return {
    scale,
    map: (p) => ({ x: x + w / 2 + (p.x - cx) * scale, y: y + h / 2 - (p.y - cy) * scale }),
  };
}

export function niceScaleLength(scale, targetUnits) {
  const target = targetUnits / scale;
  const options = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200];
  return options.reduce((best, o) => (Math.abs(o - target) < Math.abs(best - target) ? o : best), options[0]);
}
