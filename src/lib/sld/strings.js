// PV string electricals and the string lengths an inverter accepts, with the cold and hot temperature
// corrections (never the STC Voc alone).

/** Hot cell temperature from the module's NOCT: Tcell = Tamb + (NOCT − 20) × G / 800. */
export const hotCellC = (mod, rules) => rules.temperature.maxAmbientC + ((mod.noct - 20) * rules.temperature.irradianceWm2) / 800;

const at = (v, betaPct, tC) => v * (1 + (betaPct / 100) * (tC - 25));

/** One module's voltages at the design temperatures. */
export function moduleAtTemps(mod, rules) {
  const tMin = rules.temperature.minCellC;
  const tHot = hotCellC(mod, rules);
  return { tMin, tHot, vocCold: at(mod.voc, mod.betaVoc, tMin), vmpCold: at(mod.vmp, mod.betaVmp, tMin), vmpHot: at(mod.vmp, mod.betaVmp, tHot) };
}

/** A string of `n` modules in series. */
export function stringElectricals(n, mod, rules) {
  const t = moduleAtTemps(mod, rules);
  return {
    modules: n,
    powerW: n * mod.watts,
    voc: n * mod.voc, // STC
    vmp: n * mod.vmp,
    isc: mod.isc,
    imp: mod.imp,
    vocMax: n * t.vocCold, // at the lowest cell temperature
    vmpMax: n * t.vmpCold,
    vmpMin: n * t.vmpHot, // at the hottest cell temperature
    iscMax: mod.isc * rules.iscFactor,
    tMin: t.tMin,
    tHot: t.tHot,
  };
}

/**
 * The string lengths the inverter accepts: the cold Voc under its max DC voltage (and the module's max system
 * voltage), the cold Vmp inside the MPPT range, and the hot Vmp above the MPPT minimum and start-up voltage.
 */
export function lengthRange(mod, inv, rules) {
  const t = moduleAtTemps(mod, rules);
  const vMax = Math.min(inv.maxDcV, mod.maxSystemV || Infinity);
  const maxByVoc = Math.floor(vMax / t.vocCold);
  const maxByMppt = Math.floor(inv.mpptMaxV / t.vmpCold);
  const minByMppt = Math.ceil(Math.max(inv.mpptMinV, inv.startV || 0) / t.vmpHot);
  const max = Math.min(maxByVoc, maxByMppt);
  return { min: Math.max(1, minByMppt), max, maxByVoc, maxByMppt, minByMppt, vMax };
}

/** Problems with one string against its inverter: [{ level, code, message }]. */
export function checkString(st, inv, rules) {
  const out = [];
  const e = (code, message) => out.push({ level: 'error', code, message });
  const vMax = Math.min(inv.maxDcV, st.moduleMaxSystemV || Infinity);
  if (st.vocMax > vMax) e('STRING_VOC_MAX', `${st.name}: Voc at ${st.tMin} °C is ${st.vocMax.toFixed(0)} V, above the ${vMax} V maximum (${st.modules} modules in series is too many)`);
  if (st.vmpMax > inv.mpptMaxV) e('STRING_VMP_HIGH', `${st.name}: Vmp at ${st.tMin} °C is ${st.vmpMax.toFixed(0)} V, above the MPPT range (${inv.mpptMaxV} V)`);
  if (st.vmpMin < inv.mpptMinV) e('STRING_VMP_LOW', `${st.name}: Vmp at ${st.tHot.toFixed(0)} °C cell temperature is ${st.vmpMin.toFixed(0)} V, below the MPPT range (${inv.mpptMinV} V) — too few modules`);
  if (inv.startV && st.vmpMin < inv.startV) e('STRING_START_V', `${st.name}: ${st.vmpMin.toFixed(0)} V when hot is below the ${inv.startV} V start-up voltage`);
  return out;
}

/**
 * How `n` modules of one orientation are split into strings, best first: every option keeps each string
 * inside [min, max]. All strings the same length when possible (they can then share MPPTs), else as few
 * lengths as possible (two, differing by one module). Empty when `n` modules cannot form valid strings.
 */
export function lengthPlans(n, range) {
  const { min, max } = range;
  if (n <= 0) return [[]];
  if (max < 1 || min > max) return [];
  const plans = [];
  const fewest = Math.ceil(n / max);
  // equal lengths: a divisor of n inside the range, longest first (fewest strings)
  for (let L = max; L >= min; L--) if (n % L === 0) plans.push(Array(n / L).fill(L));
  // two lengths (a and a + 1) for k strings, from the fewest strings up
  for (let k = fewest; k <= Math.ceil(n / min); k++) {
    const a = Math.floor(n / k);
    const b = n - a * k; // strings one module longer
    if (a < min || (b > 0 ? a + 1 : a) > max) continue;
    plans.push([...Array(b).fill(a + 1), ...Array(k - b).fill(a)]);
    if (plans.length > 6) break;
  }
  // equal lengths first unless they need far more strings than the fewest possible
  const uniq = new Map(plans.map((p) => [p.join(','), p]));
  return [...uniq.values()].sort((p, q) => {
    const eq = (x) => new Set(x).size === 1;
    const cost = (x) => x.length + (eq(x) ? 0 : 0.5) - (eq(x) && x.length <= fewest * 1.5 ? 1 : 0);
    return cost(p) - cost(q) || q[0] - p[0];
  });
}
