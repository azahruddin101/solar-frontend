'use client';

import { useMemo } from 'react';
import { buildYieldModel } from './energy.js';
import { toLocal } from './geo.js';
import { bounds, cleanPolygon, convexOverlap, ensureCCW, isConvex, isSimplePolygon, perimeter, polygonArea } from './geometry.js';
import { computePanelPose, getPanelSpec } from './panels.js';
import { buildRoofModel } from './roof.js';
import { useStore } from './store.js';

/** Flag panels whose ground footprints collide; they are excluded from energy totals. */
function markOverlaps(poses) {
  const boxes = poses.map((p) => bounds(p.corners));
  for (let i = 0; i < poses.length; i++) {
    for (let j = i + 1; j < poses.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) continue;
      if (convexOverlap(poses[i].corners, poses[j].corners, 0.02)) {
        poses[i].overlap = true;
        poses[j].overlap = true;
      }
    }
  }
  for (const p of poses) p.valid = p.valid && !p.overlap;
}

export function footprintFrom(polygon, origin) {
  if (!origin || polygon.length < 3) return [];
  return ensureCCW(cleanPolygon(polygon.map((p) => toLocal(p, origin))));
}

/** All derived design data: footprint, roof, panel poses and energy totals. */
export function useDesign() {
  const polygon = useStore((s) => s.polygon);
  const origin = useStore((s) => s.origin);
  const building = useStore((s) => s.building);
  const panels = useStore((s) => s.panels);
  const panelSpecId = useStore((s) => s.panelSpecId);
  const solarData = useStore((s) => s.solar.data);
  const efficiency = useStore((s) => s.finance.efficiency);

  const footprint = useMemo(() => footprintFrom(polygon, origin), [polygon, origin]);
  const shape = useMemo(
    () => ({
      area: footprint.length >= 3 ? polygonArea(footprint) : 0,
      perimeter: footprint.length >= 3 ? perimeter(footprint) : 0,
      convex: isConvex(footprint),
      simple: footprint.length >= 3 && isSimplePolygon(footprint),
    }),
    [footprint],
  );
  const roof = useMemo(() => (footprint.length >= 3 ? buildRoofModel(footprint, building) : null), [footprint, building]);
  const spec = useMemo(() => getPanelSpec(panelSpecId, solarData), [panelSpecId, solarData]);
  const yieldModel = useMemo(() => (origin ? buildYieldModel(origin.lat, solarData) : null), [origin, solarData]);

  const poses = useMemo(() => {
    if (!roof) return [];
    const list = panels.map((p) => computePanelPose(p, spec, roof, footprint));
    markOverlaps(list);
    return list;
  }, [panels, spec, roof, footprint]);

  const totals = useMemo(() => {
    const kwpEach = spec.watts / 1000;
    const eff = (efficiency ?? 85) / 100;
    let dc = 0;
    let count = 0;
    const perPanel = {};
    const monthly = new Array(12).fill(0);
    const groups = new Map();
    for (const pose of poses) {
      if (!pose.valid || !yieldModel) {
        perPanel[pose.id] = 0;
        continue;
      }
      const e = kwpEach * yieldModel.specificYield(pose.tilt, pose.azimuth);
      perPanel[pose.id] = e * eff;
      dc += e;
      count += 1;
      const key = `${Math.round(pose.tilt)}|${Math.round(pose.azimuth)}`;
      const g = groups.get(key) || { tilt: Math.round(pose.tilt), azimuth: Math.round(pose.azimuth), count: 0, dc: 0 };
      g.count += 1;
      g.dc += e;
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const share = yieldModel.monthlyShare(g.tilt, g.azimuth);
      share.forEach((s, i) => (monthly[i] += s * g.dc * eff));
    }
    const kwp = count * kwpEach;
    return {
      count,
      invalid: poses.length - count,
      kwp,
      dcKwh: dc,
      acKwh: dc * eff,
      specificYield: kwp > 0 ? (dc * eff) / kwp : 0,
      panelArea: count * spec.length * spec.width,
      perPanel,
      monthly,
      groups: [...groups.values()].sort((a, b) => b.count - a.count),
    };
  }, [poses, spec, yieldModel, efficiency]);

  return { origin, footprint, shape, roof, spec, yieldModel, poses, totals, building, solarData };
}
