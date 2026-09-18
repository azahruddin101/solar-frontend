// Mounting-structure take-off: iron columns (legs), rafters, purlins, base plates, steel weight.

const KG_PER_M = { column: 5.45, rafter: 4.2, purlin: 2.9, brace: 1.8 }; // 60x60x3 SHS, 80x40x3 RHS, 41x41 C, 40x40x3 angle

export function computeStructure(design) {
  const tables = design.tables.filter((t) => t.valid);
  const cuts = new Map();
  let front = 0;
  let back = 0;
  let columnM = 0;
  let rafterM = 0;
  let purlinM = 0;
  let braceM = 0;
  const rows = tables.map((t, i) => {
    const pairs = t.legs.length / 2;
    let fl = 0;
    let bl = 0;
    t.legs.forEach((l, k) => {
      const len = Math.ceil(l.h * 20) / 20; // cut to 50 mm
      cuts.set(len, (cuts.get(len) || 0) + 1);
      columnM += len;
      if (k % 2 === 0) { front++; fl = len; } else { back++; bl = len; }
    });
    rafterM += pairs * (t.size.slopeLen + 0.1);
    purlinM += t.rows * 2 * (t.size.width + 0.1);
    if (bl > 1.2) braceM += pairs * Math.hypot(bl * 0.6, t.size.depth * 0.6);
    return { name: `T${i + 1}`, kind: t.kind, modules: t.modules.length, grid: `${t.rows} x ${t.cols}`, tilt: t.tilt, columns: t.legs.length, frontLen: fl, backLen: bl };
  });
  const columns = front + back;
  const weight = columnM * KG_PER_M.column + rafterM * KG_PER_M.rafter + purlinM * KG_PER_M.purlin + braceM * KG_PER_M.brace;
  return {
    rows,
    columns,
    front,
    back,
    columnM,
    rafterM,
    purlinM,
    braceM,
    weight,
    basePlates: columns,
    anchorBolts: columns * 4,
    foundations: columns,
    cutList: [...cuts.entries()].sort((a, b) => a[0] - b[0]).map(([len, qty]) => ({ len, qty })),
  };
}
