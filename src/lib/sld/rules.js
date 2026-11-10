// Electrical design rules for the SLD engine: versioned and configurable. These are general design
// practice (sizing factors, standard device ratings), kept apart from manufacturer limits, which come
// from each datasheet (equipment.js). Nothing here is a regulatory limit: interconnection rules come from
// the DISCOM / CEA approval for each site, and a design is never reported as compliant by this engine.

export const SLD_RULES = {
  version: '2026.11-1',
  basis: 'General PV design practice (IEC 62548-style sizing factors). Configurable; verify against the site approval, the standards in force and the equipment datasheets.',

  // design temperatures: project values when known, else these defaults (reported as assumed)
  temperature: {
    minCellC: 5, // lowest cell temperature: sets the highest string voltage (use the site's record low)
    maxAmbientC: 45, // hottest ambient: sets the lowest string operating voltage
    irradianceWm2: 1000, // for the hot cell temperature from NOCT
  },

  // current factors
  iscFactor: 1.25, // Isc max = 1.25 × Isc (STC) for conductor / device sizing
  fuseMinFactor: 1.5, // string fuse In ≥ 1.5 × Isc and ≤ 2.4 × Isc and ≤ module max series fuse
  fuseMaxFactor: 2.4,
  dcSwitchFactor: 1.25, // DC isolator In ≥ 1.25 × Isc × strings on the MPPT
  acBreakerFactor: 1.25, // AC breaker In ≥ 1.25 × continuous output current

  // when string fuses are needed: (Np − 1) × Isc max exceeds the module's reverse-current (max series fuse)
  // rating. Without that rating on the datasheet, fuses are drawn from this many parallel strings on.
  fuseFromParallelStrings: 3,

  // protection on the DC side
  externalDcSpd: true, // draw a DC SPD in the DCDB unless the inverter has one built in
  externalDcSwitch: true, // draw a DC isolator per MPPT unless the inverter has one built in
  maxDcdbStringInputs: 12, // more string inputs than this: the inverter's MPPTs are split over several DCDBs

  // AC collection
  maxAcdbIncomers: 6, // more inverters than this: several ACDBs, collected in a main AC combiner
  wholeCurrentMeterMaxA: 100, // above it the meters are drawn CT-operated (confirm with the DISCOM)

  // sizing windows (warnings, not errors)
  dcAcRatio: { min: 0.8, max: 1.4 },

  // standard ratings
  fuses: [6, 8, 10, 12, 15, 16, 20, 25, 30, 32, 40, 50, 63],
  breakers: [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000],
  dcClasses: [600, 1000, 1100, 1500],
  cts: [150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000, 2500, 3000, 4000],
  // indicative ampacity (A) of copper cables for rooftop runs, before site derating
  dcCables: [[4, 30], [6, 40], [10, 55], [16, 75], [25, 100], [35, 125], [50, 150], [70, 190], [95, 230]],
  acCables: [[2.5, 24], [4, 32], [6, 41], [10, 57], [16, 76], [25, 101], [35, 125], [50, 151], [70, 192], [95, 232], [120, 269], [150, 309], [185, 353], [240, 415], [300, 470], [400, 540]],
};

/** The rules with project overrides (shallow per section). */
export function rulesWith(over = {}) {
  return { ...SLD_RULES, ...over, temperature: { ...SLD_RULES.temperature, ...(over.temperature || {}) }, dcAcRatio: { ...SLD_RULES.dcAcRatio, ...(over.dcAcRatio || {}) } };
}

/** The smallest standard rating at or above `a`, or null when none is big enough. */
export const ratingFor = (list, a) => list.find((v) => v >= a - 1e-9) ?? null;

/** Indicative cable size for a current; null when even the largest is too small (then parallel runs). */
export const cableFor = (list, a) => (list.find(([, amp]) => amp >= a - 1e-9) || [null])[0];
