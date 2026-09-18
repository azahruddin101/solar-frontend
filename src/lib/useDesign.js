'use client';

import { useDeferredValue, useMemo } from 'react';
import { designElectrical } from './electrical.js';
import { buildYieldModel, computeFinancials } from './energy.js';
import { normalizeCatalog } from './catalog.js';
import { buildDesign, resolveAzimuth } from './model.js';
import { shadingLoss } from './shading.js';
import { useStore } from './store.js';
import { computeStructure } from './structure.js';

export function useDesign() {
  const sections = useStore((s) => s.sections);
  const objects = useStore((s) => s.objects);
  const config = useStore((s) => s.config);
  const origin = useStore((s) => s.origin);
  const solarData = useStore((s) => s.solar.data);
  const finance = useStore((s) => s.finance);
  const inverterId = useStore((s) => s.electrical.inverterId);
  const lat = origin?.lat ?? 28.6;
  const rawCatalog = useStore((s) => s.catalog);
  const catalog = useMemo(() => normalizeCatalog(rawCatalog), [rawCatalog]);
  const spec = catalog.panels.find((p) => p.id === config.specId) || catalog.panels[0];
  const pillar = catalog.pillars.find((p) => p.id === config.pillarId) || catalog.pillars[0];

  const design = useMemo(() => buildDesign({ sections, objects, config, lat, spec }), [sections, objects, config, lat, spec]);
  const defaultAzimuth = useMemo(() => resolveAzimuth(config, design.sections, lat), [config, design.sections, lat]);
  const yieldModel = useMemo(() => buildYieldModel(lat, solarData), [lat, solarData]);
  // shading is the heavy part — let it lag behind while dragging so movement stays smooth
  const settled = useDeferredValue(design);
  const shade = useMemo(() => shadingLoss(settled, lat), [settled, lat]);
  const structure = useMemo(() => computeStructure(design), [design]);
  const electrical = useMemo(() => designElectrical(design, { ...structure, pillar }, { inverterId }), [design, structure, pillar, inverterId]);

  const totals = useMemo(() => {
    const eff = finance.efficiency / 100;
    const kw = design.spec.watts / 1000;
    let dc = 0;
    let lostShade = 0;
    const monthly = new Array(12).fill(0);
    const groups = new Map();
    for (const m of design.modules) {
      const gross = kw * yieldModel.specificYield(m.tilt, m.azimuth);
      const loss = shade.get(m.id) || 0;
      dc += gross * (1 - loss);
      lostShade += gross * loss;
      const key = `${Math.round(m.tilt)}|${Math.round(m.azimuth)}`;
      const g = groups.get(key) || { tilt: Math.round(m.tilt), azimuth: Math.round(m.azimuth), count: 0, dc: 0 };
      g.count++;
      g.dc += gross * (1 - loss);
      groups.set(key, g);
    }
    for (const g of groups.values()) yieldModel.monthlyShare(g.tilt, g.azimuth).forEach((sh, i) => (monthly[i] += sh * g.dc * eff));
    const count = design.modules.length;
    const kwp = count * kw;
    return {
      count,
      kwp,
      acKwh: dc * eff,
      shadeLossPct: dc + lostShade > 0 ? (lostShade / (dc + lostShade)) * 100 : 0,
      specificYield: kwp ? (dc * eff) / kwp : 0,
      monthly,
      groups: [...groups.values()],
      invalid: design.tables.filter((t) => !t.valid).length,
    };
  }, [design, yieldModel, shade, finance.efficiency]);

  const cost = useMemo(() => {
    const pillarFt = structure.columnM * 3.281;
    const panels = totals.count * spec.price;
    const pillars = pillarFt * pillar.pricePerFt;
    const other = totals.kwp * catalog.otherCostPerKw;
    return { panels, pillars, pillarFt, other, total: panels + pillars + other };
  }, [structure, totals, spec, pillar, catalog]);
  const fin = useMemo(
    () => computeFinancials({ ...finance, kwp: totals.kwp, annualKwh: totals.acKwh, tariff: catalog.tariff, costPerKw: totals.kwp ? cost.total / totals.kwp : 0 }),
    [totals, finance, cost, catalog.tariff],
  );

  return { ...design, catalog, pillar, cost, currency: catalog.currency, lat, origin, defaultAzimuth, yieldModel, shade, electrical, structure, totals, fin, solarData };
}
