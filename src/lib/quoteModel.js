// Energy, electrical and financial figures for a proposal without a 3D design. The system is described by its
// size (kWp), module, location (latitude) and orientation; the same models as the designer do the rest.
import { normalizeCatalog } from './catalog.js';
import { electricalForCount } from './electrical.js';
import { buildYieldModel, computeFinancials } from './energy.js';

export const QUOTE_FINANCE = { efficiency: 85, degradation: 0.5 };
/** Panel watts from a package line such as "Adani 575 W" (the packages store watts only for panel products). */
export const wattsFrom = (...texts) => Number((texts.join(' ').match(/(\d{3,4})\s*w/i) || [])[1]) || 0;

/**
 * The system follows what was chosen: the panel line of the selected package, or the solar-panel product picked
 * in Custom (its quantity is the number of panels). Returns { spec, count } or null when no panel was chosen.
 */
export function deriveQuoteSystem(quote, fallbackPanels = []) {
  const norm = (panel) => normalizeCatalog({ panels: [{ id: 'q', ...panel }] }).panels[0];
  const items = quote.items || [];
  for (const it of items) {
    for (const b of it.bundle?.length ? it.bundle : [it]) {
      const count = Math.round(Number(b.qty) || 0);
      if (b.panel?.watts && count > 0) return { spec: norm(b.panel), count };
    }
  }
  const pkg = items.find((i) => i.kind === 'package' && Number(i.kw) > 0);
  if (pkg && fallbackPanels[0]) return { spec: fallbackPanels[0], count: Math.ceil((pkg.kw * 1000) / fallbackPanels[0].watts - 1e-9) };
  return null;
}

export const DEFAULT_SYSTEM = { kwp: 0, moduleId: '', lat: 28.6, tilt: 15, azimuth: 180 };

export function computeQuoteSystem(quote, spec, { count: given, years = 10, tariff = 8, cost = 0, finance = QUOTE_FINANCE } = {}) {
  const sys = { ...DEFAULT_SYSTEM, ...(quote.system || {}) };
  const watts = spec?.watts || 540;
  const count = Math.max(0, Math.round(Number(given) || 0));
  const kwp = (count * watts) / 1000;
  if (!count) return { ready: false, sys, count: 0, kwp: 0 };

  const yieldModel = buildYieldModel(Number(sys.lat) || 28.6, null);
  const tilt = Number(sys.tilt) || 0;
  const az = Number(sys.azimuth);
  const dc = kwp * yieldModel.specificYield(tilt, Number.isFinite(az) ? az : 180);
  const acKwh = dc * (finance.efficiency / 100);
  const monthly = yieldModel.monthlyShare(tilt, Number.isFinite(az) ? az : 180).map((s) => s * acKwh);
  const fin = computeFinancials({ ...finance, years, kwp, annualKwh: acKwh, tariff, costPerKw: kwp ? cost / kwp : 0 });
  const el = electricalForCount(count, spec);
  return {
    ready: true,
    sys,
    count,
    kwp,
    acKwh,
    monthly,
    specificYield: kwp ? acKwh / kwp : 0,
    fin,
    years,
    el,
    yieldModel,
    totals: { kwp, count, acKwh, monthly, specificYield: kwp ? acKwh / kwp : 0, shadeLossPct: 0 },
  };
}

/** Month-by-month outlook over `years`: energy (with yearly degradation), tariff (the company's current rate, held flat), savings, and the running net position. */
export function monthlyOutlook({ monthly, cost, tariff, years, finance = QUOTE_FINANCE, start = new Date() }) {
  const rows = [];
  let cumulative = 0;
  for (let i = 0; i < years * 12; i++) {
    const yr = Math.floor(i / 12);
    const when = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const energy = monthly[when.getMonth()] * Math.pow(1 - finance.degradation / 100, yr);
    const rate = tariff;
    const savings = energy * rate;
    cumulative += savings;
    rows.push({ n: i + 1, when, energy, rate, savings, cumulative, net: cumulative - cost });
  }
  return rows;
}
