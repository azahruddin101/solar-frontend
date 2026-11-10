// Mounting-structure take-off: iron columns (legs), rafters, purlins, base plates, steel weight.
// Tables lying flush on a sloped roof have no columns: rails are fixed to the roof with hooks.
// For now the whole frame of a base (columns, rafters, purlins, bracing, support cross rods) is
// made of its pole section (round, square, angle…), so it is priced as one length of that pole.

const KG_PER_M = { column: 5.45, rail: 2.9 }; // 60x60x3 SHS (the frame), 41x41 C rail (flush)

/**
 * The frame of one table on poles, in metres: columns cut to 50 mm, a rafter on every pole line
 * (front pole to back pole, the full slope), two purlins under every panel row the base has room
 * for, the cross rod of each support row, and bracing behind tall back poles. Zero for flush tables.
 */
export function tableFrame(t) {
  if (t.flush || !t.legs.length) return { columnM: 0, rafterM: 0, purlinM: 0, braceM: 0, frameM: 0 };
  const columnM = tableColumnM(t);
  const pairs = t.legs.length / 2;
  const rows = Math.max(t.rows || 0, t.grid?.rows || 0); // purlins stay when panels are taken off
  const rafterM = pairs * (t.size.slopeLen + 0.1);
  const purlinM = (rows * 2 + (t.midLegs?.length ? t.joins.length : 0)) * (t.size.width + 0.1);
  const back = t.legs[t.legs.length - 1] ? Math.ceil(t.legs[t.legs.length - 1].h * 20) / 20 : 0;
  const braceM = back > 1.2 ? pairs * Math.hypot(back * 0.6, t.size.depth * 0.6) : 0;
  return { columnM, rafterM, purlinM, braceM, frameM: columnM + rafterM + purlinM + braceM };
}

/** Column metres of a table, cut to 50 mm like the cut list. */
export const tableColumnM = (t) => (t.flush ? 0 : [...t.legs, ...(t.midLegs || [])].reduce((a, l) => a + Math.ceil(l.h * 20) / 20, 0));
/** Every column under a table: front / back poles and the mid supports between stacked rows. */
export const allLegs = (t) => (t.midLegs?.length ? [...t.legs, ...t.midLegs] : t.legs);

/**
 * Columns grouped by the pole they are made of: each group (base) can use its own pole from the
 * catalog, `poleFor(table)` says which. Returns [{pillar, columns, columnM, ft}], used first first.
 */
export function columnsByPole(tables, poleFor) {
  const by = new Map();
  for (const t of tables) {
    if (!t.valid || t.flush || !t.legs.length) continue;
    const pillar = poleFor(t);
    if (!pillar) continue;
    const g = by.get(pillar.id) || { pillar, columns: 0, columnM: 0, rafterM: 0, purlinM: 0, braceM: 0, frameM: 0, ft: 0 };
    const fr = tableFrame(t);
    g.columns += allLegs(t).length;
    for (const k of ['columnM', 'rafterM', 'purlinM', 'braceM', 'frameM']) g[k] += fr[k];
    g.ft = g.frameM * 3.281; // the whole frame is the pole section: priced per foot of it
    by.set(pillar.id, g);
  }
  return [...by.values()];
}

export function computeStructure(design) {
  const tables = design.tables.filter((t) => t.valid);
  const cuts = new Map();
  let front = 0;
  let back = 0;
  let columnM = 0;
  let rafterM = 0;
  let purlinM = 0;
  let braceM = 0;
  let railM = 0;
  let hooks = 0;
  let mid = 0;
  const rows = tables.map((t, i) => {
    if (t.flush) {
      hooks += t.legs.length;
      railM += t.rows * 2 * (t.size.width + 0.1);
      return { name: `T${i + 1}`, kind: 'flush', modules: t.modules.length, grid: `${t.rows} x ${t.cols}`, tilt: t.tilt, columns: 0, hooks: t.legs.length, frontLen: 0, backLen: 0 };
    }
    let fl = 0;
    let bl = 0;
    t.legs.forEach((l, k) => {
      const len = Math.ceil(l.h * 20) / 20; // cut to 50 mm
      cuts.set(len, (cuts.get(len) || 0) + 1);
      columnM += len;
      if (k % 2 === 0) { front++; fl = len; } else { back++; bl = len; }
    });
    for (const l of t.midLegs || []) {
      const len = Math.ceil(l.h * 20) / 20;
      cuts.set(len, (cuts.get(len) || 0) + 1);
      columnM += len;
      mid++;
    }
    const fr = tableFrame(t);
    rafterM += fr.rafterM;
    purlinM += fr.purlinM;
    braceM += fr.braceM;
    return { name: `T${i + 1}`, kind: t.kind, modules: t.modules.length, grid: `${t.rows} x ${t.cols}`, tilt: t.tilt, columns: allLegs(t).length, mid: t.midLegs?.length || 0, frontLen: fl, backLen: bl };
  });
  const columns = front + back + mid;
  const frameM = columnM + rafterM + purlinM + braceM;
  const weight = frameM * KG_PER_M.column + railM * KG_PER_M.rail + hooks * 0.45;
  return {
    rows,
    columns,
    front,
    back,
    mid,
    columnM,
    rafterM,
    purlinM,
    braceM,
    frameM,
    railM,
    hooks,
    weight,
    basePlates: columns,
    anchorBolts: columns * 4,
    foundations: columns,
    cutList: [...cuts.entries()].sort((a, b) => a[0] - b[0]).map(([len, qty]) => ({ len, qty })),
  };
}
