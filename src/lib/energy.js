// Energy + financial estimates.
// Orientation effects come from the clear-sky sun model; the absolute level ("how cloudy /
// shaded is this roof") is calibrated from Google Solar API sunshine quantiles when available.

import { getSunModel } from './sun.js';

/** Typical ratio of real-world to clear-sky plane-of-array irradiance when no Solar API data. */
function fallbackClearness(lat) {
  const a = Math.abs(lat);
  return Math.min(0.78, Math.max(0.5, 0.78 - Math.max(0, a - 35) * 0.0115));
}

export function buildYieldModel(lat, solarData) {
  const sun = getSunModel(lat);
  const optimal = sun.optimal();
  const segments = solarData?.solarPotential?.roofSegmentStats || [];
  let num = 0;
  let den = 0;
  for (const s of segments) {
    const q = s.stats?.sunshineQuantiles;
    const area = s.stats?.areaMeters2 || 0;
    if (!q?.length || area < 4) continue;
    const median = q[Math.floor(q.length / 2)];
    const clear = sun.poa(s.pitchDegrees || 0, s.azimuthDegrees || 0);
    if (clear > 0 && median > 0) {
      num += (area * median) / clear;
      den += area;
    }
  }
  const calibrated = den > 0;
  const k = calibrated ? Math.min(1.05, Math.max(0.25, num / den)) : fallbackClearness(lat);
  const cacheMap = new Map();
  const poa = (tilt, az) => {
    const key = `${Math.round(tilt * 2)}:${Math.round(az)}`;
    if (!cacheMap.has(key)) cacheMap.set(key, sun.poa(Math.round(tilt * 2) / 2, Math.round(az)));
    return cacheMap.get(key);
  };
  return {
    source: calibrated ? 'google' : 'model',
    k,
    optimal,
    /** kWh (DC) per kWp per year for a panel at this orientation. */
    specificYield: (tilt, az) => k * poa(tilt, az),
    /** 0..1 relative to the best orientation for this latitude. */
    factor: (tilt, az) => poa(tilt, az) / optimal.poa,
    monthlyShare: (tilt, az) => {
      const m = sun.monthly(tilt, az);
      const total = m.reduce((s, v) => s + v, 0) || 1;
      return m.map((v) => v / total);
    },
  };
}

export const CURRENCIES = {
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN', tariff: 8, costPerKw: 55000 },
  USD: { code: 'USD', symbol: '$', locale: 'en-US', tariff: 0.17, costPerKw: 2800 },
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE', tariff: 0.3, costPerKw: 1500 },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB', tariff: 0.25, costPerKw: 1600 },
  AUD: { code: 'AUD', symbol: 'A$', locale: 'en-AU', tariff: 0.3, costPerKw: 1100 },
  AED: { code: 'AED', symbol: 'AED ', locale: 'en-AE', tariff: 0.38, costPerKw: 3500 },
};

export function guessCurrency(regionCode, lat, lng) {
  const map = { IN: 'INR', US: 'USD', GB: 'GBP', AU: 'AUD', AE: 'AED', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', PT: 'EUR', AT: 'EUR', IE: 'EUR' };
  if (regionCode && map[regionCode]) return map[regionCode];
  if (lat > 6 && lat < 36 && lng > 68 && lng < 98) return 'INR';
  if (lat > 35 && lat < 71 && lng > -11 && lng < 30) return 'EUR';
  return 'USD';
}

export function formatMoney(value, code, { pdf = false, decimals = 0 } = {}) {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  const num = Number(value || 0).toLocaleString(c.locale, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  // Built-in PDF fonts cannot render ₹/€ etc., so the PDF uses ISO codes.
  return pdf ? `${c.code} ${num}` : `${c.symbol}${num}`;
}

export function formatNumber(v, decimals = 0) {
  return Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

/** GST on top of subtotal; split equally into SGST and CGST for display. */
export function computeGst(subtotal, { included = true, percent = 0 } = {}) {
  const base = Number(subtotal) || 0;
  const gstIncluded = included !== false;
  const gstPercent = Math.max(0, Math.min(100, Number(percent) || 0));
  if (gstIncluded || gstPercent <= 0) {
    return { subtotal: base, gstIncluded: true, gstPercent: 0, gstAmount: 0, sgst: 0, cgst: 0, grandTotal: base };
  }
  const gstAmount = base * (gstPercent / 100);
  const half = gstAmount / 2;
  return { subtotal: base, gstIncluded: false, gstPercent, gstAmount, sgst: half, cgst: half, grandTotal: base + gstAmount };
}

export function computeFinancials({ kwp, annualKwh, tariff, costPerKw, degradation = 0.5, years = 25 }) {
  const cost = kwp * costPerKw;
  const rows = [];
  let cumulative = 0;
  let payback = null;
  for (let y = 1; y <= years; y++) {
    const energy = annualKwh * Math.pow(1 - degradation / 100, y - 1);
    const rate = tariff; // the company's current rate, held flat
    const savings = energy * rate;
    const before = cumulative;
    cumulative += savings;
    if (payback === null && cost > 0 && cumulative >= cost) payback = y - 1 + (cost - before) / savings;
    rows.push({ year: y, energy, rate, savings, cumulative, net: cumulative - cost });
  }
  const lifetimeEnergy = rows.reduce((s, r) => s + r.energy, 0);
  return {
    cost,
    rows,
    payback,
    firstYearSavings: rows[0]?.savings || 0,
    lifetimeSavings: cumulative,
    lifetimeEnergy,
    netGain: cumulative - cost,
    roi: cost > 0 ? ((cumulative - cost) / cost) * 100 : 0,
  };
}
