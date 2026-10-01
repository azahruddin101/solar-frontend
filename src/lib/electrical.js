// Inverter selection, auto-stringing and bill of materials.

export const INVERTERS = [3, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100].map((kw) => ({
  id: `inv${kw}`,
  kw,
  name: `${kw} kW ${kw <= 6 ? 'single-phase' : 'three-phase'} string inverter`,
  maxVdc: kw <= 6 ? 600 : 1100,
  mppt: kw <= 6 ? 2 : kw <= 20 ? 2 : kw <= 50 ? 4 : 8,
}));

export const STRING_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#6366f1', '#06b6d4', '#e11d48'];

export function designElectrical(design, structure, { inverterId = 'auto', dcAcRatio = 1.15 } = {}) {
  const { modules, spec, tables } = design;
  const n = modules.length;
  const kwp = (n * spec.watts) / 1000;
  if (!n) return { kwp: 0, inverters: [], strings: [], stringOf: new Map(), bom: [] };

  let inv = INVERTERS.find((i) => i.id === inverterId);
  let count = 1;
  if (!inv) {
    const target = kwp / dcAcRatio;
    inv = INVERTERS.find((i) => i.kw >= target) || INVERTERS[INVERTERS.length - 1];
    count = Math.max(1, Math.ceil(target / inv.kw));
  } else count = Math.max(1, Math.ceil(kwp / dcAcRatio / inv.kw / 1.1));

  const maxLen = Math.max(2, Math.floor((inv.maxVdc * 0.92) / (spec.voc * 1.12)));
  const minLen = Math.min(maxLen, Math.max(2, Math.ceil(200 / (spec.voc * 0.8))));
  const ideal = Math.min(maxLen, Math.max(minLen, maxLen - 2));
  const nStrings = Math.max(1, Math.ceil(n / ideal));
  const baseLen = Math.floor(n / nStrings);
  let extra = n - baseLen * nStrings;

  // snake through tables so strings stay physically contiguous
  const ordered = [];
  tables
    .filter((t) => t.valid)
    .forEach((t) => {
      for (let r = 0; r < t.rows; r++) {
        const row = t.modules.filter((m) => m.id.split(':')[1] === String(r));
        ordered.push(...(r % 2 ? row.reverse() : row));
      }
    });

  const strings = [];
  const stringOf = new Map();
  let i = 0;
  for (let s = 0; s < nStrings; s++) {
    const len = baseLen + (extra-- > 0 ? 1 : 0);
    const mods = ordered.slice(i, i + len);
    i += len;
    mods.forEach((m) => stringOf.set(m.id, s));
    strings.push({
      index: s,
      name: `S${s + 1}`,
      color: STRING_COLORS[s % STRING_COLORS.length],
      count: mods.length,
      voc: mods.length * spec.voc,
      vocCold: mods.length * spec.voc * 1.12,
      isc: spec.isc,
      kwp: (mods.length * spec.watts) / 1000,
      inverter: Math.floor((s / nStrings) * count) + 1,
      path: mods.map((m) => ({ x: m.x, y: m.y })),
    });
  }

  const dcCable = strings.reduce((a, s) => a + 2 * (15 + s.count * 0.3), 0) * 1.1;
  const bom = [
    ['PV module', `${spec.name} (${spec.length} x ${spec.width} m)`, n, 'nos'],
    ['String inverter', inv.name, count, 'nos'],
    ...(structure.columns
      ? [
          [`Pillars — ${structure.pillar?.name || 'iron column'} (${structure.pillar?.shape || ''})`, structure.cutList.map((c) => `${c.len.toFixed(2)} m x ${c.qty}`).join(', '), structure.columns, 'nos'],
          ['Pillar length total', `${Math.ceil(structure.columnM * 3.281)} ft, cut as per list`, Math.ceil(structure.columnM), 'm'],
          ['Rafters 80x40x3 RHS', '', Math.ceil(structure.rafterM), 'm'],
        ]
      : []),
    // panels flush on a sloped roof: rails fixed with hooks / L-feet instead of columns
    ...(structure.hooks ? [['Roof hooks / L-feet', 'Stainless, with EPDM sealing washer — match to the roof covering', structure.hooks, 'nos']] : []),
    ['Purlins / module rails', '41x41 C-channel', Math.ceil(structure.purlinM), 'm'],
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
    ['DCDB', `${nStrings} in / ${Math.min(nStrings, inv.mppt * count)} out, SPD + fuses`, count, 'nos'],
    ['ACDB', `${inv.kw * count} kW, MCB + SPD`, 1, 'nos'],
    ['AC cable', inv.kw <= 6 ? '3C x 6 sq.mm' : '4C x 16 sq.mm', 25, 'm'],
    ['Earthing kit', 'Chemical earthing, 3 pits', 3, 'sets'],
    ['Lightning arrestor', 'ESE type with down conductor', 1, 'nos'],
  ];
  return { kwp, inverter: inv, inverterCount: count, acKw: inv.kw * count, dcAc: kwp / (inv.kw * count), maxLen, minLen, strings, stringOf, bom };
}

/**
 * A campus: every building gets its own inverter(s) and strings, so no string runs from one building to
 * another. The result has the same shape as a single system (totals, all strings numbered through), plus
 * `buildings` with each building's own design. `structures` maps a building id to its structure take-off.
 */
export function designElectricalByBuilding(design, structures, opts = {}) {
  const parts = design.buildings
    .map((b) => {
      const tables = design.tables.filter((t) => t.building === b.id);
      const modules = design.modules.filter((m) => m.building === b.id);
      return { building: b, el: designElectrical({ ...design, tables, modules }, structures.get(b.id), opts) };
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
  };
}

/** Inverter and string design for a system that has a size but no roof layout (proposal without a 3D design). */
export function electricalForCount(count, spec, opts = {}) {
  const modules = Array.from({ length: count }, (_, i) => ({ id: `T1:0:${i}`, x: i, y: 0 }));
  const tables = [{ valid: true, rows: 1, cols: count, modules }];
  const structure = { columns: 0, hooks: 0, columnM: 0, rafterM: 0, purlinM: 0, basePlates: 0, anchorBolts: 0, foundations: 0, cutList: [] };
  return designElectrical({ modules, spec, tables }, structure, opts);
}
