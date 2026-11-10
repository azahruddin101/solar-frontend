// Inverter selection, auto-stringing, MPPT allocation, the SLD document and the bill of materials.
// The electrical engine is in ./sld (rules, equipment data, strings, MPPT allocation, topology, validation, layout).
import { rulesWith } from './sld/rules.js';
import { inverterSpec, moduleSpec } from './sld/equipment.js';
import { lengthPlans, lengthRange, stringElectricals } from './sld/strings.js';
import { allocateMppts } from './sld/allocate.js';
import { buildSldDocument } from './sld/topology.js';
import { validateDocument } from './sld/validate.js';

export const INVERTERS = [3, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100].map((kw) => ({
  id: `inv${kw}`,
  kw,
  name: `${kw} kW ${kw <= 6 ? 'single-phase' : 'three-phase'} string inverter`,
  maxVdc: kw <= 6 ? 600 : 1100,
  mppt: kw <= 6 ? 2 : kw <= 20 ? 2 : kw <= 50 ? 4 : 8,
}));

export const STRING_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#6366f1', '#06b6d4', '#e11d48'];

/** A string as the SLD engine sees it: `modules` is the number in series (the app's `modules` holds their ids). */
const engineString = (st) => ({ ...st, modules: st.count, moduleIds: st.modules });

/** A generic list entry as an inverter spec (all limits except kW, max DC V and MPPTs are assumed). */
const genericInverter = (g) => inverterSpec({ id: g.id, name: g.name, kw: g.kw, maxDcV: g.maxVdc, mppt: g.mppt }, { generic: true });

/** "180°/15°": the roof orientation of a table (strings are kept within one). */
const orientOf = (t) => `${Math.round(Number(t?.azimuth ?? 180))}°/${Math.round(Number(t?.tilt ?? 0))}°`;

/**
 * Strings, inverters and the SLD for a set of modules.
 * opts: inverterId ('auto' | generic id), dcAcRatio, manual (hand-picked strings), inverterProduct (the
 * inverter chosen in Products, with its datasheet attributes) and inverterQty, system ({ type, battery,
 * transformer, lightning }), temperatures ({ minCellC, maxAmbientC } for the site).
 */
export function designElectrical(design, structure, { inverterId = 'auto', dcAcRatio = 1.15, manual = [], inverterProduct = null, inverterQty = 0, system = {}, temperatures = null, idPrefix = '' } = {}) {
  const { modules, spec, tables } = design;
  const n = modules.length;
  const kwp = (n * spec.watts) / 1000;
  if (!n) return { kwp: 0, inverters: [], strings: [], stringOf: new Map(), bom: [], maxLen: 0, minLen: 0, sld: null, validation: null };
  const rules = rulesWith(temperatures ? { temperature: temperatures } : {});
  const mod = moduleSpec(spec);

  // the inverter(s): the product chosen in Products (fixed), a generic size picked by hand (fixed), or auto
  const candidates = [];
  if (inverterProduct) {
    const sp = inverterSpec(inverterProduct);
    candidates.push({ spec: sp, count: inverterQty > 0 ? Math.round(inverterQty) : Math.max(1, Math.ceil(kwp / dcAcRatio / sp.kw)), fixed: true });
  } else {
    const picked = INVERTERS.find((i) => i.id === inverterId);
    if (picked) candidates.push({ spec: genericInverter(picked), count: Math.max(1, Math.ceil(kwp / dcAcRatio / picked.kw / 1.1)), fixed: true });
    else {
      const target = kwp / dcAcRatio;
      const base = INVERTERS.find((i) => i.kw >= target) || INVERTERS[INVERTERS.length - 1];
      const count = Math.max(1, Math.ceil(target / base.kw));
      const bigger = INVERTERS[INVERTERS.indexOf(base) + 1];
      // tried in order until the strings fit the MPPTs: the right size first, then more MPPTs
      candidates.push({ spec: genericInverter(base), count }, ...(bigger ? [{ spec: genericInverter(bigger), count }] : []), { spec: genericInverter(base), count: count + 1 });
    }
  }

  // modules in wiring order: snake through each table, tables grouped by roof orientation
  const ordered = [];
  const orientOfModule = new Map();
  tables
    .filter((t) => t.valid)
    .forEach((t) => {
      for (let r = 0; r < t.rows; r++) {
        const row = t.modules.filter((m) => m.id.split(':')[1] === String(r));
        for (const m of r % 2 ? row.reverse() : row) {
          ordered.push(m);
          orientOfModule.set(m.id, orientOf(t));
        }
      }
    });
  // strings the user picked by hand come first, with the modules they named that are still on the roof
  const byId = new Map(modules.map((m) => [m.id, m]));
  const picked = (manual || []).map((ms) => ({ ...ms, mods: (ms.modules || []).map((id) => byId.get(id)).filter(Boolean) })).filter((ms) => ms.mods.length);
  const taken = new Set(picked.flatMap((ms) => ms.mods.map((m) => m.id)));
  const groups = new Map(); // orientation → modules still to string
  for (const m of ordered) if (!taken.has(m.id)) {
    const k = orientOfModule.get(m.id);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  // modules not on a valid table (none normally) still get strung, with the first orientation
  const loose = modules.filter((m) => !taken.has(m.id) && !orientOfModule.has(m.id));
  if (loose.length) {
    const k = groups.keys().next().value || 'unknown';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(...loose);
  }

  const build = (cand, attempt) => {
    const inv = cand.spec;
    const range = lengthRange(mod, inv, rules);
    const issues = [];
    if (range.max < 1 || range.min > range.max) issues.push({ level: 'error', code: 'STRING_RANGE', message: `No string length fits ${inv.name}: at least ${range.min} modules are needed for its MPPT range, but at most ${Math.max(0, range.max)} keep the cold voltage under ${range.vMax} V.` });
    const strings = [];
    const add = (mods, own, orient) => {
      const idx = strings.length;
      const e = stringElectricals(mods.length, mod, rules);
      strings.push({
        index: idx,
        id: own?.id || `${idPrefix}auto-${idx}`, // unique across the buildings of a campus (idPrefix)
        manual: Boolean(own),
        name: (own && own.name) || `S${idx + 1}`,
        color: STRING_COLORS[idx % STRING_COLORS.length],
        count: mods.length,
        ...e,
        vocCold: e.vocMax,
        kwp: e.powerW / 1000,
        orient,
        moduleKey: mod.id || 'module',
        tooLong: mods.length > range.max,
        tooShort: mods.length < range.min,
        modules: mods.map((m) => m.id),
        path: mods.map((m) => ({ x: m.x, y: m.y })),
      });
    };
    for (const ms of picked) {
      // a hand-picked string takes the orientation most of its modules have
      const counts = new Map();
      for (const m of ms.mods) counts.set(orientOfModule.get(m.id), (counts.get(orientOfModule.get(m.id)) || 0) + 1);
      const orient = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      add(ms.mods, ms, counts.size > 1 ? `${orient} (mixed)` : orient);
    }
    // a roof face with too few panels for a string of its own joins the biggest face's strings (rather than
    // being left as an invalid string); the user can always wire them differently by picking strings by hand
    const faces = [...groups.entries()].map(([orient, mods]) => ({ orient, mods: [...mods] }));
    const main = faces.reduce((a, f) => (!a || f.mods.length > a.mods.length ? f : a), null);
    for (const f of faces) if (f !== main && f.mods.length < range.min) {
      main.mods.push(...f.mods);
      main.mixed = true;
      f.mods = [];
    }
    for (const { orient: o, mods, mixed } of faces.filter((f) => f.mods.length)) {
      const orient = mixed ? `${o} + small faces` : o;
      let plans = lengthPlans(mods.length, range);
      if (!plans.length) {
        // no valid split: the fewest strings within the max length (each is reported by the validation)
        const k = Math.max(1, Math.ceil(mods.length / Math.max(1, range.max)));
        const a = Math.floor(mods.length / k);
        const b = mods.length - a * k;
        plans = [[...Array(b).fill(a + 1), ...Array(k - b).fill(a)]];
        if (mods.length < range.min) issues.push({ level: 'warning', code: 'STRING_TOO_FEW', message: `Only ${mods.length} module${mods.length === 1 ? '' : 's'}: below the ${range.min} that ${inv.name} needs to start.` });
      }
      const plan = plans[Math.min(attempt, plans.length - 1)];
      let i = 0;
      for (const len of plan) {
        add(mods.slice(i, i + len), null, orient);
        i += len;
      }
    }
    const inverters = Array.from({ length: cand.count }, (_, k) => ({ no: k + 1, spec: inv }));
    // the engine counts modules in series (`modules`); the app keeps the module ids under `modules` too
    const allocation = allocateMppts(strings.map(engineString), inverters);
    return { cand, range, strings, allocation, issues, ok: allocation.ok && !issues.some((x) => x.level === 'error') };
  };
  let best = null;
  search: for (const cand of candidates) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = build(cand, attempt);
      if (!best) best = r;
      if (r.ok) {
        best = r;
        break search;
      }
    }
  }
  const { cand, range, strings, allocation } = best;
  const inv = cand.spec;
  const count = cand.count;
  for (const st of strings) {
    const at = allocation.byString.get(st.id);
    st.inverter = at?.inverter ?? null;
    st.mppt = at?.mppt ?? null;
  }
  const nStrings = strings.length;
  const maxLen = range.max;
  const minLen = range.min;
  const placed = new Map(allocation.inverters.flatMap((iv) => iv.mppts.flatMap((m) => m.strings.map((x) => [x.id, x]))));
  const sld = buildSldDocument({ strings: strings.filter((st) => placed.has(st.id)).map(engineString), allocation, module: mod, rules, system, title: 'Single line diagram' });
  const validation = validateDocument(sld, { module: mod, rules, temperaturesGiven: Boolean(temperatures), extra: [...best.issues, ...allocation.issues] });
  sld.validation = validation.items;
  sld.status = validation.status;
  // strings without an MPPT are still listed (on inverter 1) so the user sees them; the validation says why
  for (const st of strings) if (!st.inverter) st.inverter = 1;
  const t = sld.metadata.totals;
  const fuses = sld.nodes.filter((nd) => nd.type === 'DC_FUSE').length;

  const dcCable = strings.reduce((a, s) => a + 2 * (15 + s.count * 0.3), 0) * 1.1;
  const bom = [
    ['PV module', `${spec.name} (${spec.length} x ${spec.width} m)`, n, 'nos'],
    ['String inverter', inv.name, count, 'nos'],
    ...(structure.columns
      ? [
          [`Pillars — ${structure.pillar?.name || 'iron column'} (${structure.pillar?.shape || ''})`, structure.cutList.map((c) => `${c.len.toFixed(2)} m x ${c.qty}`).join(', '), structure.columns, 'nos'],
          ['Pillar length total', `${Math.ceil(structure.columnM * 3.281)} ft, cut as per list`, Math.ceil(structure.columnM), 'm'],
          ['Rafters', 'Same section as the pillars', Math.ceil(structure.rafterM), 'm'],
          ['Purlins', 'Same section as the pillars', Math.ceil(structure.purlinM), 'm'],
          ...(structure.braceM > 0 ? [['Bracing', 'Same section as the pillars', Math.ceil(structure.braceM), 'm']] : []),
          ['Structure length total', `${Math.ceil(structure.frameM * 3.281)} ft: pillars, rafters, purlins${structure.braceM > 0 ? ', bracing' : ''}`, Math.ceil(structure.frameM), 'm'],
        ]
      : []),
    // panels flush on a sloped roof: rails fixed with hooks / L-feet instead of columns
    ...(structure.hooks ? [['Roof hooks / L-feet', 'Stainless, with EPDM sealing washer — match to the roof covering', structure.hooks, 'nos']] : []),
    ...(structure.railM > 0 ? [['Module rails', '41x41 C-channel', Math.ceil(structure.railM), 'm']] : []),
    ...(structure.columns
      ? [
          ['Base plates 200x200x8', 'with 4 anchor bolts M12 each', structure.basePlates, 'nos'],
          ['Anchor bolts M12', '', structure.anchorBolts, 'nos'],
          ['RCC pedestals / ballast', '300 x 300 x 300', structure.foundations, 'nos'],
        ]
      : []),
    ['Mid clamps', '', Math.max(0, n * 2 - tables.length * 2), 'nos'],
    ['End clamps', '', tables.filter((t) => t.valid).length * 4 * 1, 'nos'],
    ['DC cable 4 sq.mm', 'Solar grade, red + black', Math.ceil(dcCable / 5) * 5, 'm'],
    ['MC4 connector pairs', '', nStrings * 2 + 2, 'pairs'],
    // DC and AC boxes as the single line diagram needs them (none when the inverter has the DC protection built in)
    ...(t.dcdbs ? [['DCDB', `${nStrings} in / ${t.mpptsUsed} out${fuses ? `, ${fuses} string fuse pairs` : ''}, isolators + SPD per MPPT as required`, t.dcdbs, 'nos']] : []),
    ['ACDB', `${inv.kw * count} kW, ${count} incomer${count === 1 ? '' : 's'} + SPD + main breaker`, t.acdbs, 'nos'],
    ...(system?.type && system.type !== 'on-grid' ? [['Battery storage', [system.battery?.kwh && `${system.battery.kwh} kWh`, system.battery?.voltage && `${system.battery.voltage} V`].filter(Boolean).join(', ') || 'Capacity to be confirmed', 1, 'set']] : []),
    ['AC cable', inv.kw <= 6 ? '3C x 6 sq.mm' : '4C x 16 sq.mm', 25, 'm'],
    ['Earthing kit', 'Chemical earthing, 3 pits', 3, 'sets'],
    ['Lightning arrestor', 'ESE type with down conductor', 1, 'nos'],
  ];
  const stringOf = new Map();
  strings.forEach((st, si) => st.modules.forEach((id) => stringOf.set(id, si)));
  // `inverter` keeps the old fields (kw, name, mppt, maxVdc) next to the datasheet values
  const inverter = { ...inv, mppt: inv.mppts, maxVdc: inv.maxDcV };
  return { kwp, inverter, inverterCount: count, acKw: inv.kw * count, dcAc: kwp / (inv.kw * count), maxLen, minLen, strings, stringOf, bom, sld, validation, module: mod };
}

/**
 * A campus: every building gets its own inverter(s) and strings, so no string runs from one building to
 * another. The result has the same shape as a single system (totals, all strings numbered through), plus
 * `buildings` with each building's own design. `structures` maps a building id to its structure take-off.
 */
export function designElectricalByBuilding(design, structures, opts = {}) {
  // several buildings: the inverter quantity chosen in Products cannot be split between them, so each is sized
  const multi = design.buildings.filter((b) => design.modules.some((m) => m.building === b.id)).length > 1;
  const parts = design.buildings
    .map((b) => {
      const tables = design.tables.filter((t) => t.building === b.id);
      const modules = design.modules.filter((m) => m.building === b.id);
      const ids = new Set(modules.map((m) => m.id));
      // a hand-picked string stays within a building: only its modules on this building count here
      const manual = (opts.manual || []).map((ms) => ({ ...ms, modules: (ms.modules || []).filter((id) => ids.has(id)) }));
      return { building: b, el: designElectrical({ ...design, tables, modules }, structures.get(b.id), { ...opts, manual, inverterQty: multi ? 0 : opts.inverterQty, idPrefix: multi ? `${b.id}:` : '' }) };
    })
    .filter((p) => p.el.strings.length);
  if (!parts.length) return { ...designElectrical({ ...design, modules: [], tables: [] }, structures.values().next().value, opts), buildings: [] };
  if (parts.length === 1) return { ...parts[0].el, buildings: [{ ...parts[0].building, ...parts[0].el }] };

  const strings = [];
  const stringOf = new Map();
  const bom = new Map();
  const buildings = [];
  let inverterBase = 0;
  for (const { building, el } of parts) {
    const base = strings.length;
    const own = el.strings.map((st) => ({ ...st, index: base + st.index, name: `S${base + st.index + 1}`, color: STRING_COLORS[(base + st.index) % STRING_COLORS.length], inverter: inverterBase + st.inverter, building: building.id, buildingName: building.name }));
    strings.push(...own);
    for (const [id, i] of el.stringOf) stringOf.set(id, base + i);
    for (const [item, specText, qty, unit] of el.bom) {
      const key = `${item}|${specText}|${unit}`;
      const row = bom.get(key) || [item, specText, 0, unit];
      row[2] += qty;
      bom.set(key, row);
    }
    buildings.push({ ...building, ...el, strings: own, inverterFrom: inverterBase + 1 });
    inverterBase += el.inverterCount;
  }
  const kwp = parts.reduce((a, p) => a + p.el.kwp, 0);
  const acKw = parts.reduce((a, p) => a + p.el.acKw, 0);
  const largest = parts.reduce((a, p) => (p.el.inverter.kw > a.el.inverter.kw ? p : a)).el;
  return {
    kwp,
    inverter: largest.inverter, // the biggest one in the design; each building's own is in `buildings`
    inverterCount: inverterBase,
    acKw,
    dcAc: kwp / acKw,
    maxLen: Math.min(...parts.map((p) => p.el.maxLen)),
    minLen: Math.max(...parts.map((p) => p.el.minLen)),
    strings,
    stringOf,
    bom: [...bom.values()],
    buildings,
    sld: null, // one diagram per building: buildings[i].sld
    validation: mergeValidation(parts.map((p) => [p.building.name, p.el.validation])),
  };
}

const RANK = { invalid: 2, incomplete: 1, checked: 0 };
/** One validation for a campus: each building's findings, named. */
function mergeValidation(list) {
  const items = [];
  let status = 'checked';
  for (const [name, v] of list) {
    if (!v) continue;
    if (RANK[v.status] > RANK[status]) status = v.status;
    for (const i of v.items) items.push({ ...i, message: `${name}: ${i.message}` });
  }
  return { items, status, errors: items.filter((i) => i.level === 'error').length, warnings: items.filter((i) => i.level === 'warning').length };
}

/** Inverter and string design for a system that has a size but no roof layout (proposal without a 3D design). */
export function electricalForCount(count, spec, opts = {}) {
  const modules = Array.from({ length: count }, (_, i) => ({ id: `T1:0:${i}`, x: i, y: 0 }));
  const tables = [{ valid: true, rows: 1, cols: count, modules }];
  const structure = { columns: 0, hooks: 0, columnM: 0, rafterM: 0, purlinM: 0, braceM: 0, frameM: 0, railM: 0, basePlates: 0, anchorBolts: 0, foundations: 0, cutList: [] };
  return designElectrical({ modules, spec, tables }, structure, opts);
}
