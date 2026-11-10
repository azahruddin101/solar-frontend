// Validation of an SLD document, in three levels: error (the design is electrically wrong or the topology is
// broken), warning (unverified or incomplete: missing datasheet values, assumed temperatures, coordination not
// checked) and info (totals). A design is never reported as approved or compliant: the best status is
// 'checked' (no errors, nothing missing), which still needs an engineer's verification.

import { checkString } from './strings.js';
import { indexDocument } from './topology.js';
import { SPEC_NAMES } from './equipment.js';

const list = (xs) => [...new Set(xs)].map((k) => SPEC_NAMES[k] || k).join(', ');

export function validateDocument(doc, { module: mod, rules, temperaturesGiven = false, extra = [] } = {}) {
  const out = [];
  const add = (level, code, message, ref) => out.push({ level, code, message, ...(ref ? { ref } : {}) });
  const ix = indexDocument(doc);
  const invNodes = doc.nodes.filter((n) => n.type === 'INVERTER');
  const strings = doc.nodes.filter((n) => n.type === 'PV_STRING');
  for (const e of extra) out.push(e);

  // ── strings against their inverter ──
  for (const st of strings) {
    const inv = ix.node.get(`INV-${st.inverter}`)?.spec;
    if (!inv) continue;
    // a string the user picked by hand is wired as they decided: its findings are checks, not errors
    for (const i of checkString({ ...st.string, name: st.tag, moduleMaxSystemV: mod?.maxSystemV }, inv, rules)) add(st.string?.manual ? 'warning' : i.level, i.code, i.message, st.id);
  }

  // ── MPPTs: only alike strings in parallel, within the inputs and currents ──
  for (const m of doc.nodes.filter((n) => n.type === 'MPPT')) {
    const inv = ix.node.get(m.parent)?.spec;
    const sts = strings.filter((s) => s.inverter === m.inverter && s.mppt === m.mppt);
    if (inv && m.mppt > inv.mppts) add('error', 'MPPT_UNAVAILABLE', `${m.parent} has ${inv.mppts} MPPTs: MPPT ${m.mppt} does not exist`, m.id);
    const lens = new Set(sts.map((s) => s.ratings.modules));
    if (lens.size > 1) add('error', 'MPPT_MIXED_LENGTH', `${m.parent} MPPT ${m.mppt}: strings of ${[...lens].join(' and ')} modules are in parallel — their voltages differ`, m.id);
    if (inv) {
      if (sts.length > inv.stringsPerMppt) add('error', 'MPPT_INPUTS', `${m.parent} MPPT ${m.mppt}: ${sts.length} strings on ${inv.stringsPerMppt} input${inv.stringsPerMppt === 1 ? '' : 's'}`, m.id);
      const imp = sts.reduce((a, s) => a + s.ratings.imp, 0);
      const isc = sts.reduce((a, s) => a + s.ratings.isc, 0);
      if (imp > inv.maxImpPerMppt + 1e-9) add('error', 'MPPT_CURRENT', `${m.parent} MPPT ${m.mppt}: ${imp.toFixed(1)} A operating current is above its ${inv.maxImpPerMppt} A limit`, m.id);
      if (isc > inv.maxIscPerMppt + 1e-9) add('error', 'MPPT_ISC', `${m.parent} MPPT ${m.mppt}: ${isc.toFixed(1)} A short-circuit current is above its ${inv.maxIscPerMppt} A limit`, m.id);
    }
    if (m.plan?.fuses && !m.plan.fuseA) add('error', 'FUSE_RATING', `${m.parent} MPPT ${m.mppt}: no standard fuse between ${m.plan.fuseWindow[0].toFixed(1)} A and ${m.plan.fuseWindow[1].toFixed(1)} A (1.5–2.4 × Isc, max series fuse)`, m.id);
    const orients = new Set(sts.map((s) => s.ratings.orient));
    if (orients.size > 1) add('warning', 'MPPT_MIXED_ORIENTATION', `${m.parent} MPPT ${m.mppt}: strings facing different directions share this MPPT`, m.id);
  }

  // ── inverters: DC/AC, DC input power, type for the system ──
  for (const n of invNodes) {
    const inv = n.spec;
    const dcW = strings.filter((s) => s.inverter === n.inverter).reduce((a, s) => a + s.ratings.powerW, 0);
    if (inv.maxDcKw && dcW / 1000 > inv.maxDcKw + 1e-9) add('error', 'INVERTER_DC_POWER', `${n.id}: ${(dcW / 1000).toFixed(2)} kWp is above its ${inv.maxDcKw} kW max DC input power`, n.id);
    const r = dcW / 1000 / inv.kw;
    if (r < rules.dcAcRatio.min || r > rules.dcAcRatio.max) add('warning', 'DC_AC_RATIO', `${n.id}: DC/AC ratio ${r.toFixed(2)} is outside the ${rules.dcAcRatio.min}–${rules.dcAcRatio.max} design window`, n.id);
    if (doc.metadata.systemType !== 'on-grid' && inv.type === 'grid') add('error', 'INVERTER_TYPE', `${n.id} (${inv.name}) is a grid-tie inverter; a ${doc.metadata.systemType} system needs a ${doc.metadata.systemType === 'hybrid' ? 'hybrid' : 'battery (off-grid)'} inverter`, n.id);
    if (inv.generic) add('warning', 'INVERTER_GENERIC', `${n.id}: no inverter product chosen — the ${inv.kw} kW limits used are generic, not from a datasheet. Pick the inverter in Products.`, n.id);
    else if (inv.assumed.length) add('warning', 'INVERTER_DATASHEET', `${n.id} (${inv.name}): missing datasheet values: ${list(inv.assumed)}. Defaults were used; add them as attributes of the product.`, n.id);
  }
  const phases = new Set(invNodes.map((n) => n.spec.phases));
  const volts = new Set(invNodes.map((n) => n.spec.acV));
  if (phases.size > 1 || volts.size > 1) add('error', 'AC_MIXED', 'Inverters with different AC voltages or phases are collected on one ACDB bus', 'ACDB');

  // ── module data ──
  if (mod?.assumed?.length) add('warning', 'MODULE_DATASHEET', `Module ${mod.name}: missing datasheet values: ${list(mod.assumed)}. Conservative defaults were used.`);
  if (!temperaturesGiven) add('warning', 'DESIGN_TEMPERATURE', `Design temperatures are defaults (${rules.temperature.minCellC} °C coldest cell, ${rules.temperature.maxAmbientC} °C hottest ambient): set the site's values to confirm the string voltages.`);

  // ── what this engine does not verify ──
  for (const nt of doc.notes || []) {
    if (nt.code === 'MODULE_MAX_FUSE_UNKNOWN') add('warning', nt.code, `${nt.ref}: the module's max series fuse rating is not on file; string fuses follow the ${rules.fuseFromParallelStrings}-strings-in-parallel rule`, nt.ref);
    if (nt.code === 'INTEGRATED_DC_SWITCH_UNKNOWN') add('warning', nt.code, `${nt.ref}: whether the inverter has a built-in DC switch is not on file; an external DC isolator is drawn`, nt.ref);
    if (nt.code === 'INTEGRATED_DC_SPD_UNKNOWN') add('warning', nt.code, `${nt.ref}: whether the inverter has built-in DC surge protection is not on file; an external DC SPD is drawn`, nt.ref);
  }
  add('warning', 'PROTECTION_COORDINATION', 'Breaker breaking capacity and selectivity are not verified: the fault level at the LT panel is not known. Confirm with the site data.');
  add('warning', 'CABLE_SIZING', 'Cable sizes are indicative (current only): derating, run lengths and voltage drop are not calculated.');
  add('warning', 'EARTHING', 'Earthing is shown as one bonded system (MET); electrode resistance, conductor sizes and the lightning-protection risk assessment are not verified.');
  if (doc.metadata.systemType !== 'on-grid') {
    const bat = ix.node.get('BAT');
    if (!bat?.ratings.kwh || !bat?.ratings.voltage) add('warning', 'BATTERY_DATASHEET', 'Battery capacity / voltage not given: the battery protection cannot be rated.', 'BAT');
  }

  // ── topology: every string reaches an inverter; every inverter reaches the grid or the loads ──
  const reach = (from, ok) => {
    const seen = new Set([from]);
    const q = [from];
    while (q.length) {
      const id = q.shift();
      if (ok(id)) return true;
      for (const c of ix.out(id)) if (c.kind !== 'EARTH' && !seen.has(c.to)) (seen.add(c.to), q.push(c.to));
    }
    return false;
  };
  for (const st of strings) if (!reach(st.id, (id) => ix.node.get(id)?.type === 'INVERTER')) add('error', 'TOPOLOGY_STRING', `${st.tag} is not connected to an inverter`, st.id);
  const end = doc.metadata.systemType === 'off-grid' ? 'DISTRIBUTION_PANEL' : 'GRID';
  for (const n of invNodes) if (!reach(n.id, (id) => ix.node.get(id)?.type === end)) add('error', 'TOPOLOGY_AC', `${n.id} has no AC path to the ${end === 'GRID' ? 'grid' : 'loads'}`, n.id);
  for (const c of doc.connections) {
    if (!ix.node.get(c.from) || !ix.node.get(c.to)) add('error', 'TOPOLOGY_DANGLING', `Connection ${c.id} refers to equipment that does not exist (${c.from} → ${c.to})`, c.id);
    if (c.kind === 'DC') {
      const a = ix.node.get(c.from);
      const b = ix.node.get(c.to);
      // DC from one MPPT group must never meet another's
      if (a?.mppt && b?.mppt && (a.mppt !== b.mppt || a.inverter !== b.inverter)) add('error', 'TOPOLOGY_MPPT_BUS', `${a.id} and ${b.id} join two MPPT groups on one DC bus`, c.id);
    }
  }
  for (const n of doc.nodes) {
    if (['EARTH', 'LIGHTNING_PROTECTION'].includes(n.type)) continue;
    if (!ix.out(n.id).length && !ix.into(n.id).length) add('error', 'TOPOLOGY_ISOLATED', `${n.tag} is not connected to anything`, n.id);
  }
  // every protective earth ends at the MET (no separate, isolated earth systems)
  for (const e of doc.nodes.filter((n) => n.type === 'EARTH' && n.id !== 'MET')) if (!reach(e.id, (id) => id === 'MET') && !ix.out(e.id).some((c) => c.to === 'MET')) add('error', 'EARTH_ISOLATED', `${e.tag} is not bonded to the main earthing terminal`, e.id);

  // ── totals ──
  const t = doc.metadata.totals;
  add('info', 'TOTALS', `${t.modules} modules in ${t.strings} strings · ${t.dcKw.toFixed(2)} kWp DC · ${t.acKw} kW AC (${t.inverters} inverter${t.inverters === 1 ? '' : 's'}) · DC/AC ${t.dcAc ? t.dcAc.toFixed(2) : '-'}`);
  add('info', 'MPPTS', `${t.mpptsUsed} MPPT${t.mpptsUsed === 1 ? '' : 's'} used, ${t.mpptsUnused} unused · ${t.dcdbs} DCDB${t.dcdbs === 1 ? '' : 's'} · ${t.acdbs} ACDB${t.acdbs === 1 ? '' : 's'}`);

  const errors = out.filter((v) => v.level === 'error').length;
  const incomplete = out.some((v) => ['MODULE_DATASHEET', 'INVERTER_DATASHEET', 'INVERTER_GENERIC', 'DESIGN_TEMPERATURE', 'BATTERY_DATASHEET'].includes(v.code));
  return { items: out, status: errors ? 'invalid' : incomplete ? 'incomplete' : 'checked', errors, warnings: out.filter((v) => v.level === 'warning').length };
}

/** A sentence for the status: never "approved". */
export const STATUS_TEXT = {
  invalid: 'Electrical errors: the design needs changes before it can be built.',
  incomplete: 'No electrical errors found with the data on file, but datasheet values or site data are missing: not verified.',
  checked: 'No electrical errors found with the data on file. Needs verification by a qualified engineer before construction.',
};
