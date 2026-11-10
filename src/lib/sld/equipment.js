// Equipment data for the SLD engine: the PV module and the inverter, read from the catalog (product fields
// and the attributes a company adds to its categories). Every value says where it came from; a value that is
// not on the datasheet falls back to a conservative default and is listed in `assumed`, so the validation
// can say exactly which specification is missing instead of claiming the design is complete.

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^\d.+-eE]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const yes = (v) => (v === true ? true : v === false ? false : /^(y|yes|true|1|built.?in|integrated|included)/i.test(String(v ?? '').trim()) ? true : /^(n|no|false|0|none|not)/i.test(String(v ?? '').trim()) ? false : null);

/** The first attribute (or field) that is present, from several spellings a company may have used. */
function read(src, keys) {
  const a = src?.attributes || {};
  for (const k of keys) {
    if (src?.[k] !== undefined && src?.[k] !== null && src?.[k] !== '') return src[k];
    if (a[k] !== undefined && a[k] !== null && a[k] !== '') return a[k];
  }
  return null;
}

/* ───────────── PV module ───────────── */

const MODULE_KEYS = {
  voc: ['voc', 'vocV', 'openCircuitVoltage'],
  vmp: ['vmp', 'vmpV', 'vmpp', 'maxPowerVoltage'],
  isc: ['isc', 'iscA', 'shortCircuitCurrent'],
  imp: ['imp', 'impA', 'impp', 'maxPowerCurrent'],
  betaVoc: ['tempCoeffVoc', 'temperatureCoefficientOfVoc', 'tempCoefficientOfVoc', 'betaVoc'], // %/°C (negative)
  betaVmp: ['tempCoeffVmp', 'temperatureCoefficientOfVmp', 'tempCoeffPmax', 'temperatureCoefficientOfPmax', 'tempCoefficientOfPmax'], // %/°C; Pmax as a stand-in for Vmp
  noct: ['noct', 'noctC', 'nmot', 'nmotC'],
  maxFuse: ['maxSeriesFuse', 'maxSeriesFuseRating', 'maximumSeriesFuseRating', 'reverseCurrentRating'],
  maxSystemV: ['maxSystemVoltage', 'maximumSystemVoltage'],
};

/**
 * Module electrical data. `spec` is the designer's panel (watts, voc, isc, attributes…). Missing values get
 * conservative stand-ins (a stronger temperature coefficient, so the cold voltage is not under-estimated) and
 * are named in `assumed`.
 */
export function moduleSpec(spec = {}) {
  const assumed = [];
  const watts = num(spec.watts) || 0;
  const pick = (name, fallback) => {
    // the catalog fills voc / isc with an estimate from the watts (`vocEstimated`): that is not a datasheet value
    const estimated = spec[`${name}Estimated`] && num(read({ attributes: spec.attributes }, MODULE_KEYS[name])) === null;
    const v = estimated ? null : num(read(spec, MODULE_KEYS[name]));
    if (v !== null && v !== 0) return v;
    assumed.push(name);
    return estimated ? num(spec[name]) ?? fallback : fallback;
  };
  const voc = pick('voc', 30 + watts * 0.04);
  const isc = pick('isc', 8 + watts * 0.011);
  const vmp = pick('vmp', voc * 0.83);
  const imp = pick('imp', isc * 0.94);
  let betaVoc = pick('betaVoc', -0.3);
  let betaVmp = pick('betaVmp', -0.4);
  // a coefficient written as a fraction (-0.0029) instead of a percentage (-0.29)
  if (Math.abs(betaVoc) < 0.02) betaVoc *= 100;
  if (Math.abs(betaVmp) < 0.02) betaVmp *= 100;
  return {
    id: String(spec.id || ''),
    name: spec.name || [spec.brand, spec.model].filter(Boolean).join(' ') || `${watts} W module`,
    watts,
    voc,
    vmp,
    isc,
    imp,
    betaVoc: -Math.abs(betaVoc), // %/°C
    betaVmp: -Math.abs(betaVmp),
    noct: pick('noct', 45),
    maxFuse: num(read(spec, MODULE_KEYS.maxFuse)), // A; null = not on the datasheet (no stand-in: it decides fusing)
    maxSystemV: num(read(spec, MODULE_KEYS.maxSystemV)),
    assumed,
  };
}

/* ───────────── inverter ───────────── */

const INV_KEYS = {
  kw: ['kw', 'capacity', 'capacityKw', 'ratedAcPower', 'ratedPower'],
  maxDcKw: ['maxDcPower', 'maxDcInputPower', 'maxDcPowerKw'],
  maxDcV: ['maxDcV', 'maxDcVoltage', 'maxInputVoltage', 'maximumDcVoltage'],
  mpptMinV: ['mpptMinV', 'mpptVoltageMin', 'mpptRangeMin', 'mpptMin'],
  mpptMaxV: ['mpptMaxV', 'mpptVoltageMax', 'mpptRangeMax', 'mpptMax'],
  startV: ['startV', 'startUpVoltage', 'startupVoltage', 'startVoltage'],
  mppts: ['mppt', 'mppts', 'mpptCount', 'numberOfMppt', 'noOfMppt'],
  maxImp: ['maxImpPerMppt', 'maxInputCurrentPerMppt', 'maxInputCurrent', 'maxCurrentPerMppt'],
  maxIsc: ['maxIscPerMppt', 'maxShortCircuitCurrentPerMppt', 'maxShortCircuitCurrent'],
  stringsPerMppt: ['stringsPerMppt', 'inputsPerMppt', 'stringInputsPerMppt'],
  acV: ['acV', 'acVoltage', 'ratedAcVoltage', 'gridVoltage'],
  phases: ['phases', 'phase', 'acPhases'],
  maxAcA: ['maxAcA', 'maxAcOutputCurrent', 'maxAcCurrent', 'ratedAcCurrent'],
  pfMin: ['pfMin', 'powerFactorMin'],
  type: ['type', 'inverterType', 'gridType'],
  dcSwitch: ['integratedDcSwitch', 'dcSwitch', 'builtInDcSwitch'],
  dcSpd: ['integratedDcSpd', 'dcSpd', 'builtInDcSpd'],
  acSpd: ['integratedAcSpd', 'acSpd', 'builtInAcSpd'],
  batteryV: ['batteryVoltage', 'batteryVoltageNominal'],
};

/** "Single Phase (230V)", "3", "Three phase" → 1 or 3. */
const phasesOf = (v) => {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (/three|3\s*-?\s*ph|^3\b|415|400|380/.test(s)) return 3;
  if (/single|1\s*-?\s*ph|^1\b|230|220|240/.test(s)) return 1;
  return null;
};
const typeOf = (v, name = '') => {
  const s = `${v ?? ''} ${name}`.toLowerCase();
  if (/off.?grid|standalone|stand-alone/.test(s)) return 'off-grid';
  if (/hybrid/.test(s)) return 'hybrid';
  return v || name ? 'grid' : null;
};

/**
 * An inverter's datasheet values from a catalog product ({ name, brand, model, attributes }) or from a generic
 * entry ({ kw, maxVdc, mppt }). `generic: true` marks one that is not a real product: all its limits are assumed.
 */
export function inverterSpec(src = {}, { generic = false } = {}) {
  const assumed = [];
  const get = (name, fallback, conv = num) => {
    const v = conv(read(src, INV_KEYS[name]));
    if (v !== null && v !== undefined && !(typeof v === 'number' && !Number.isFinite(v))) return v;
    assumed.push(name);
    return typeof fallback === 'function' ? fallback() : fallback;
  };
  const name = src.name || [src.brand, src.model].filter(Boolean).join(' ') || 'Inverter';
  let kw = get('kw', null);
  if (kw === null) {
    const m = String(name).match(/(\d+(?:\.\d+)?)\s*k\s*w/i);
    kw = m ? Number(m[1]) : 5;
  }
  if (kw > 1000) kw /= 1000; // given in W
  const phases = get('phases', kw <= 6 ? 1 : 3, (v) => phasesOf(v));
  const acV = get('acV', phases === 1 ? 230 : 415);
  const maxDcV = get('maxDcV', phases === 1 ? 600 : 1100);
  const mppts = Math.max(1, Math.round(get('mppts', kw <= 20 ? 2 : kw <= 50 ? 4 : 8)));
  const spm = get('stringsPerMppt', kw <= 10 ? 1 : 2);
  const type = typeOf(read(src, INV_KEYS.type), name) || 'grid';
  const out = {
    id: String(src.id || `inv-${kw}`),
    name,
    make: src.brand || '',
    model: src.model || '',
    generic: generic || Boolean(src.generic),
    kw,
    maxDcKw: get('maxDcKw', kw * 1.5),
    maxDcV,
    mpptMinV: get('mpptMinV', phases === 1 ? 90 : 200),
    mpptMaxV: get('mpptMaxV', phases === 1 ? 550 : 1000),
    startV: get('startV', phases === 1 ? 100 : 200),
    mppts,
    // stand-ins sized for current 13–15 A modules (older 13 A inputs would reject them); always flagged as assumed
    maxImpPerMppt: get('maxImp', 16 * Math.max(1, Math.round(spm))),
    maxIscPerMppt: get('maxIsc', 22 * Math.max(1, Math.round(spm))),
    stringsPerMppt: Math.max(1, Math.round(spm)),
    acV,
    phases,
    maxAcA: get('maxAcA', () => (kw * 1000) / (phases === 3 ? Math.sqrt(3) * acV : acV)), // I = P / (√3 × V × PF), PF 1
    pfMin: get('pfMin', 0.8),
    type,
    integratedDcSwitch: get('dcSwitch', null, yes),
    integratedDcSpd: get('dcSpd', null, yes),
    integratedAcSpd: get('acSpd', null, yes),
    batteryV: num(read(src, INV_KEYS.batteryV)),
    assumed,
  };
  return out;
}

/** The attribute labels a company can add to its categories, so these values come from the datasheet. */
export const DATASHEET_LABELS = {
  module: ['Voc (V)', 'Vmp (V)', 'Isc (A)', 'Imp (A)', 'Temp coeff Voc (%/°C)', 'Temp coeff Pmax (%/°C)', 'NOCT (°C)', 'Max series fuse (A)', 'Max system voltage (V)'],
  inverter: ['Capacity (kW)', 'MPPT count', 'Phase', 'Max DC voltage (V)', 'MPPT voltage min (V)', 'MPPT voltage max (V)', 'Start-up voltage (V)', 'Max input current per MPPT (A)', 'Max short-circuit current per MPPT (A)', 'Strings per MPPT', 'AC voltage (V)', 'Max AC output current (A)', 'Max DC power (kW)', 'Inverter type', 'Integrated DC switch', 'Integrated DC SPD', 'Integrated AC SPD'],
};

/** Plain names for the missing values, for the validation messages. */
export const SPEC_NAMES = {
  voc: 'Voc', vmp: 'Vmp', isc: 'Isc', imp: 'Imp', betaVoc: 'temperature coefficient of Voc', betaVmp: 'temperature coefficient of Vmp/Pmax', noct: 'NOCT',
  kw: 'rated AC power', maxDcKw: 'max DC input power', maxDcV: 'max DC voltage', mpptMinV: 'MPPT voltage range (min)', mpptMaxV: 'MPPT voltage range (max)', startV: 'start-up voltage',
  mppts: 'number of MPPTs', maxImp: 'max input current per MPPT', maxIsc: 'max short-circuit current per MPPT', stringsPerMppt: 'strings per MPPT', acV: 'AC voltage',
  phases: 'phases', maxAcA: 'max AC output current', pfMin: 'power factor range', type: 'inverter type', dcSwitch: 'integrated DC switch', dcSpd: 'integrated DC SPD', acSpd: 'integrated AC SPD',
};
