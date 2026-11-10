// Every line of the proposal's price table ("Bill of materials" in the PDF), worked out once so the
// Products step can show the same list the PDF prints. `amount` is a number for priced lines, null for items included in another line's price.
import { capFirst } from './catalog.js';
import { currentTax } from './tax.js';

/** Rows in print order: { key, group, order, item, spec, qty, unit, amount }. */
export function proposalBomRows(design) {
  const { totals, electrical: el, spec, cost } = design;
  const rows = [];
  const add = (group, order, item, specText, qty, unit, amount = null) => rows.push({ group, order, item: String(item ?? '').trim() || 'Item', spec: String(specText ?? '').trim() || '-', qty: qty ?? 1, unit: unit || 'nos', amount: amount == null ? null : Math.round(Number(amount) || 0) });
  const CHARGES = { group: 'Installation & charges', order: 1e9 };
  if (cost.isPackage) {
    // the package: its items are included in one price
    const pkg = cost.package;
    for (const it of pkg?.items?.length ? pkg.items : []) {
      const specParts = [it.brand && `Brand: ${it.brand}`, it.model && `Model: ${it.model}`, it.spec].filter(Boolean).join(' · ');
      add(it.parentName, it.parentOrder, it.name, specParts || it.description || '-', it.qty || 1, capFirst(it.unit) || 'Nos');
    }
    add('Package', 1e9 - 1, `Package: ${pkg?.name || 'All-inclusive solar package'}`, pkg?.description || `${totals.kwp.toFixed(2)} kW complete turnkey rooftop package, all items above included`, 1, 'set', cost.packagePrice);
  } else {
    add(spec.parentName, spec.parentOrder, 'Solar modules', [spec.brand, spec.model, `${spec.watts} W`, `(${spec.length} x ${spec.width} m)`].filter(Boolean).join(' '), totals.count, 'nos', cost.panels);
    if (design.structure.columns > 0) {
      // one row per kind of pole in use (each base may stand on its own pole)
      for (const p of design.poles?.length ? design.poles : [{ pillar: design.pillar, ft: cost.pillarFt, columns: design.structure.columns }]) {
        add(p.pillar?.parentName, p.pillar?.parentOrder, `Mounting structure (${p.pillar?.name || 'Poles'})`, `${Math.ceil(p.ft)} ft total (${p.pillar?.shape || 'iron column'}): ${p.columns} poles ${Math.ceil((p.columnM || 0) * 3.281)} ft${p.rafterM ? `, rafters ${Math.ceil(p.rafterM * 3.281)} ft` : ''}${p.purlinM ? `, purlins ${Math.ceil(p.purlinM * 3.281)} ft` : ''}${p.braceM ? `, bracing ${Math.ceil(p.braceM * 3.281)} ft` : ''}`, Math.ceil(p.ft), 'ft', p.ft * (p.pillar?.pricePerFt || 0));
      }
    } else if (design.structure.hooks > 0) {
      add(spec.parentName, spec.parentOrder, 'Mounting structure (roof hooks / rails)', 'Flush-mounted roof rails and hooks', design.structure.hooks, 'nos', cost.pillars > 0 ? cost.pillars : null);
    }
    if (cost.hasChosenMaterials) {
      for (const m of cost.categoryMaterials || []) add(m.parentName, m.parentOrder, m.categoryName, m.productName, m.qty, m.unit || 'nos', m.total);
    }
    const skip = (item) => /^PV module|^Pillars|^Pillar length|^Rafters|^Purlins|^Bracing|^Structure length/i.test(item); // the frame is priced in the mounting-structure line
    const BOS = { group: 'Balance of system', order: 1e9 - 2 };
    // the hardware the design works out (clamps, cables, base plates…) is listed only when the flat
    // balance-of-system price pays for it; with products picked one by one, the proposal lists just
    // those (an unpriced "Included" row would promise something the total does not charge for)
    if (!cost.hasChosenMaterials) {
      for (const [item, specText, qty, unit] of el.bom || []) if (!skip(item)) add(BOS.group, BOS.order, item, specText, qty, unit);
      add(BOS.group, BOS.order, 'Balance of system', 'The items above, with installation and commissioning', 1, 'set', cost.other);
    }
  }
  if (Number(cost.floorCost) > 0) add(CHARGES.group, CHARGES.order, 'Floor placement', cost.floorPlacement === 0 ? 'Ground level' : `Floor ${cost.floorPlacement} installation surcharge`, 1, 'nos', cost.floorCost);
  for (const c of cost.installationCharges || []) add(CHARGES.group, CHARGES.order, c.name, 'Installation charge', 1, 'nos', c.price);
  // a stable key per line (for lists)
  const seen = new Map();
  for (const r of rows) {
    const k = [r.item, r.spec, r.qty, r.unit, r.amount ?? 'inc'].join('|');
    seen.set(k, (seen.get(k) || 0) + 1);
    r.key = seen.get(k) > 1 ? `${k}#${seen.get(k)}` : k; // two identical lines keep their own keys
  }
  return rows;
}

// how each quantity / price is worked out, in words, for the review list (not printed)
const RULES = [
  [/^String inverter/i, (d) => `Sized for ${d.totals.kwp.toFixed(2)} kWp at a DC/AC ratio of 1.15 (${(d.totals.kwp / 1.15).toFixed(1)} kW needed)`],
  [/^Base plates/i, () => '1 under every pole'],
  [/^Anchor bolts/i, () => '4 for every pole'],
  [/^RCC pedestals/i, () => '1 under every pole'],
  [/^Roof hooks/i, () => 'Along the rails of flush-mounted panels'],
  [/^Module rails/i, () => 'Along every row of flush-mounted panels'],
  [/^Mid clamps/i, (d) => `2 per panel, minus 2 at the ends of each base (${d.totals.count} panels)`],
  [/^End clamps/i, () => '4 for every base'],
  [/^DC cable/i, (d) => `Each of the ${d.electrical.strings?.length || 0} strings: 2 × (15 m + 0.3 m per panel), +10% spare`],
  [/^MC4/i, (d) => `2 per string (${d.electrical.strings?.length || 0} strings) + 2 spare`],
  [/^DCDB/i, () => 'As the single line diagram needs: string fuses where strings run in parallel, an isolator and SPD per MPPT unless the inverter has them built in'],
  [/^ACDB/i, () => 'One per group of up to 6 inverters, with incomers, SPD and main breaker'],
  [/^AC cable/i, () => 'A standard 25 m run; check it against the site'],
  [/^Earthing/i, () => 'A standard 3 pits; check it against the site'],
  [/^Lightning/i, () => 'One for the system'],
];

/** One line of explanation for a row: where its quantity and amount come from. */
export function bomHow(row, design, money) {
  try {
    return howOf(row, design, money);
  } catch {
    return ''; // an explanation must never break the list
  }
}

function howOf(row, design, money) {
  const { totals, spec, cost, catalog } = design;
  if (row.item === 'Solar modules') return `${totals.count} panels placed × ${money(spec.price)} each`;
  if (row.item.startsWith('Mounting structure (') && row.unit === 'ft') {
    const p = (design.poles || []).find((x) => row.item.includes(x.pillar?.name)) || { pillar: design.pillar };
    return `${row.qty} ft of ${p.pillar?.name || 'pole'} (poles, rafters, purlins, bracing) × ${money(p.pillar?.pricePerFt || 0)}/ft`;
  }
  if (row.item === 'Balance of system') return `${totals.kwp.toFixed(2)} kW × ${money(catalog?.otherCostPerKw || 0)} per kW (the "other cost per kW" setting). Covers every item above marked Included`;
  const m = (cost.categoryMaterials || []).find((x) => x.categoryName === row.item && x.productName === row.spec);
  if (m) return `${m.qty} × ${money(m.price)}${m.gstPercent ? ` + ${m.gstPercent}% ${currentTax().label}` : ''}, picked in Materials`;
  if (row.item === 'Floor placement') return 'Set under Floor placement';
  if (row.spec === 'Installation charge') return 'Added under Installation charges';
  if (row.item.startsWith('Package:')) return 'The price of the chosen package';
  const rule = RULES.find(([re]) => re.test(row.item));
  if (rule) return rule[1](design);
  if (cost.isPackage) return 'Part of the package';
  return '';
}
