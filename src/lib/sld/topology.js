// The electrical topology of a PV system as a graph: equipment as nodes, electrical connections as edges
// (DC, AC or EARTH). This document is the single source of truth: the layout draws exactly these nodes and
// connections, and the equipment schedule is read from them.
//
//   PV_STRING ─DC─ [DC_FUSE] ─ [DC_COMBINER bus] ─ [DC_ISOLATOR] ─ MPPT ─ INVERTER ─AC─ AC_BREAKER ─ AC_COMBINER
//   (ACDB bus, AC_SPD) ─ main AC_BREAKER ─ ENERGY_METER ─ DISTRIBUTION_PANEL ─ ENERGY_METER (net) ─ [TRANSFORMER] ─ GRID
//   hybrid / off-grid: INVERTER ─DC─ BATTERY; off-grid ends at a load DISTRIBUTION_PANEL instead of the grid.
//   Every protective earth goes to one main earthing terminal (MET); the electrodes are bonded to it.

import { cableFor, ratingFor } from './rules.js';

const SQRT3 = Math.sqrt(3);

/** AC current: I = P / (√3 × V_LL × PF) for three phases, I = P / (V × PF) for one. */
export const acCurrent = (watts, volts, phases, pf = 1) => watts / ((phases === 3 ? SQRT3 : 1) * volts * pf);

/** A breaker's name from its rating: MCB up to 63 A, MCCB to 800 A, ACB above. */
export const breakerType = (a) => (a <= 63 ? 'MCB' : a <= 800 ? 'MCCB' : 'ACB');

/** The inverter's continuous AC output current: the datasheet value, else I = P / (√3 × V × PF) at unity PF. */
export const inverterAcA = (inv) => (inv.assumed.includes('maxAcA') ? acCurrent(inv.kw * 1000, inv.acV, inv.phases, 1) : inv.maxAcA);

/**
 * Build the SLD document.
 * input: { strings: [{ id, name, index, modules, powerW, voc, vmp, isc, imp, vocMax, vmpMin, vmpMax, iscMax, orient, inverter, mppt }],
 *          allocation: { inverters: [{ no, spec, mppts: [{ no, strings }] }] }, module, rules,
 *          system: { type: 'on-grid' | 'hybrid' | 'off-grid', battery: { kwh, voltage }, transformer: { kva, primaryV, secondaryV } | null, lightning: bool },
 *          title, inverterFrom }
 */
export function buildSldDocument(input) {
  const { allocation, module: mod, rules, system: sys = {} } = input;
  const type = sys.type || 'on-grid';
  const nodes = [];
  const connections = [];
  const byId = new Map();
  const add = (n) => {
    if (byId.has(n.id)) throw new Error(`Duplicate SLD node ${n.id}`);
    byId.set(n.id, n);
    nodes.push(n);
    return n;
  };
  const link = (from, to, kind, props = {}) => {
    const c = { id: `C${connections.length + 1}`, from, to, kind, ...props };
    connections.push(c);
    return c;
  };

  const invs = allocation.inverters.filter((inv) => inv.mppts.some((m) => m.strings.length));
  const notes = []; // design facts the validation turns into warnings (assumptions made here)

  // ── earthing: one main earthing terminal, electrodes bonded to it ──
  add({ id: 'MET', type: 'EARTH', tag: 'MET', label: 'Main earthing terminal' });
  add({ id: 'E1', type: 'EARTH', tag: 'E1', label: 'Earth electrode, DC side (array frames, DC SPD)' });
  add({ id: 'E2', type: 'EARTH', tag: 'E2', label: 'Earth electrode, AC side (inverters, AC SPD)' });
  link('E1', 'MET', 'EARTH', { label: 'bonded' });
  link('E2', 'MET', 'EARTH', { label: 'bonded' });
  if (sys.lightning !== false) {
    add({ id: 'E3', type: 'EARTH', tag: 'E3', label: 'Earth electrode, lightning protection' });
    add({ id: 'LA', type: 'LIGHTNING_PROTECTION', tag: 'LA', label: 'Lightning protection (air terminal & down conductor)' });
    link('LA', 'E3', 'EARTH');
    link('E3', 'MET', 'EARTH', { label: 'bonded (equipotential)' });
  }

  // ── DC side, per inverter ──
  const dcdbs = [];
  for (const inv of invs) {
    const spec = inv.spec;
    const invId = `INV-${inv.no}`;
    add({ id: `ARRAY-${inv.no}`, type: 'PV_MODULE_GROUP', tag: `PV-${inv.no}`, label: `PV array of ${invId}`, inverter: inv.no });
    link(`ARRAY-${inv.no}`, 'E1', 'EARTH', { label: 'module frames & mounting structure' });
    add({
      id: invId,
      type: 'INVERTER',
      tag: invId,
      label: spec.name,
      inverter: inv.no,
      ratings: { kw: spec.kw, maxDcV: spec.maxDcV, mppt: `${spec.mpptMinV}-${spec.mpptMaxV} V`, mppts: spec.mppts, acV: spec.acV, phases: spec.phases, acA: inverterAcA(spec), type: spec.type },
      spec,
    });
    link(invId, 'MET', 'EARTH', { label: 'protective earth' });

    const used = inv.mppts.filter((m) => m.strings.length);
    // which protection sits outside the inverter: only what its own datasheet does not cover
    const extSwitch = rules.externalDcSwitch && spec.integratedDcSwitch !== true;
    const extSpd = rules.externalDcSpd && spec.integratedDcSpd !== true;
    if (spec.integratedDcSwitch === null) notes.push({ code: 'INTEGRATED_DC_SWITCH_UNKNOWN', ref: invId });
    if (spec.integratedDcSpd === null) notes.push({ code: 'INTEGRATED_DC_SPD_UNKNOWN', ref: invId });

    const mpptPlans = used.map((m) => {
      const np = m.strings.length;
      const iscMax = Math.max(...m.strings.map((s) => s.iscMax));
      const isc = Math.max(...m.strings.map((s) => s.isc));
      const vocMax = Math.max(...m.strings.map((s) => s.vocMax));
      // string fuses: reverse current from the other strings ((Np − 1) × Isc max) above the module's rating
      let fuses = false;
      if (np > 1) {
        if (mod.maxFuse) fuses = (np - 1) * iscMax > mod.maxFuse;
        else {
          fuses = np >= rules.fuseFromParallelStrings;
          notes.push({ code: 'MODULE_MAX_FUSE_UNKNOWN', ref: `${invId}/MPPT-${m.no}` });
        }
      }
      const fuseMin = rules.fuseMinFactor * isc;
      const fuseMax = Math.min(rules.fuseMaxFactor * isc, mod.maxFuse || Infinity);
      const fuseA = fuses ? ratingFor(rules.fuses.filter((f) => f <= fuseMax + 1e-9), fuseMin) : null;
      const dcClass = ratingFor(rules.dcClasses, vocMax);
      return { m, np, iscMax, isc, vocMax, fuses, fuseA, fuseWindow: [fuseMin, fuseMax], dcClass, isoA: ratingFor(rules.breakers.filter((b) => b >= 16), rules.dcSwitchFactor * isc * np) };
    });
    const needDcdb = extSwitch || extSpd || mpptPlans.some((p) => p.fuses);

    // DCDBs: whole MPPTs per box, up to the rule's number of string inputs
    const boxes = [];
    if (needDcdb) {
      let cur = null;
      for (const p of mpptPlans) {
        if (!cur || cur.inputs + p.np > rules.maxDcdbStringInputs) boxes.push((cur = { plans: [], inputs: 0 }));
        cur.plans.push(p);
        cur.inputs += p.np;
      }
    }
    const boxOf = new Map();
    boxes.forEach((b, bi) => {
      const id = boxes.length > 1 ? `DCDB-${inv.no}.${bi + 1}` : `DCDB-${inv.no}`;
      add({ id, type: 'DC_COMBINER', tag: id, label: 'DC distribution box', inverter: inv.no, ratings: { inputs: b.inputs, outputs: b.plans.length, ip: 'IP65' }, enclosure: true });
      link(id, 'E1', 'EARTH', { label: 'enclosure' });
      dcdbs.push(id);
      for (const p of b.plans) boxOf.set(p.m.no, id);
    });

    for (const p of mpptPlans) {
      const { m } = p;
      const mpptId = `${invId}/MPPT-${m.no}`;
      const box = boxOf.get(m.no) || null;
      add({ id: mpptId, type: 'MPPT', tag: `MPPT${m.no}`, label: `MPPT ${m.no}`, inverter: inv.no, mppt: m.no, parent: invId, ratings: { strings: p.np, maxStrings: spec.stringsPerMppt, impA: m.strings.reduce((a, s) => a + s.imp, 0), iscA: m.strings.reduce((a, s) => a + s.isc, 0), maxImpA: spec.maxImpPerMppt, maxIscA: spec.maxIscPerMppt } });
      const dcV = p.vocMax;
      const c1 = cableFor(rules.dcCables, p.iscMax);
      const c2 = cableFor(rules.dcCables, p.iscMax * p.np);
      // the MPPT's collection point: its busbar in the DCDB when strings are paralleled there, else the string itself
      const bus = box && p.np > 1 ? add({ id: `${mpptId}/BUS`, type: 'DC_COMBINER', tag: `B${m.no}`, label: `MPPT ${m.no} busbar`, inverter: inv.no, mppt: m.no, parent: box, busbar: true }).id : null;
      for (const s of m.strings) {
        add({
          id: `S:${s.id}`,
          type: 'PV_STRING',
          tag: s.name,
          label: `${s.modules} × ${mod.watts} W`,
          inverter: inv.no,
          mppt: m.no,
          parent: `ARRAY-${inv.no}`,
          ratings: { modules: s.modules, powerW: s.powerW, voc: s.voc, vmp: s.vmp, isc: s.isc, imp: s.imp, vocMax: s.vocMax, vmpMin: s.vmpMin, vmpMax: s.vmpMax, orient: s.orient },
          string: s,
        });
        let from = `S:${s.id}`;
        if (box && p.fuses) {
          const fid = `${mpptId}/F-${s.name}`;
          add({ id: fid, type: 'DC_FUSE', tag: `F${s.index + 1}`, label: 'String fuse (+ and −)', inverter: inv.no, mppt: m.no, parent: box, ratings: { a: p.fuseA, v: p.dcClass, poles: 2, class: 'gPV' } });
          link(from, fid, 'DC', { voltageV: s.vocMax, currentA: s.iscMax, cable: c1 && { size: c1, type: 'PV1-F / EN 50618, Cu', tag: 'C1' } });
          from = fid;
        }
        const to = bus || (box ? null : mpptId);
        if (to) link(from, to, 'DC', { voltageV: s.vocMax, currentA: s.iscMax, cable: !(box && p.fuses) && c1 ? { size: c1, type: 'PV1-F / EN 50618, Cu', tag: 'C1' } : undefined });
        else {
          // one string through a DCDB without a busbar: on to the isolator (or straight to the MPPT)
          p.single = from;
        }
      }
      // after the busbar (or the single string): isolator, SPD tap, out to the MPPT
      let head = bus || p.single || null;
      if (box) {
        if (extSwitch) {
          const qid = `${mpptId}/Q-DC`;
          add({ id: qid, type: 'DC_ISOLATOR', tag: `Q-DC${m.no}`, label: 'DC isolator', inverter: inv.no, mppt: m.no, parent: box, ratings: { a: p.isoA, v: p.dcClass, poles: 2 } });
          link(head, qid, 'DC', { voltageV: dcV, currentA: p.iscMax * p.np });
          head = qid;
        }
        if (extSpd) {
          const sid = `${mpptId}/SPD-DC`;
          add({ id: sid, type: 'DC_SPD', tag: `SPD-DC${m.no}`, label: 'DC surge protection', inverter: inv.no, mppt: m.no, parent: box, ratings: { ucpv: p.dcClass, type: 'Type 2', inKa: 20 } });
          link(head, sid, 'DC', { tap: true, voltageV: dcV });
          link(sid, 'E1', 'EARTH');
        }
        link(head, mpptId, 'DC', { voltageV: dcV, currentA: p.iscMax * p.np, cable: c2 && { size: c2, type: 'Solar DC cable, Cu', tag: 'C2' } });
      }
      link(mpptId, invId, 'DC', { internal: true });
      Object.assign(byId.get(mpptId), { plan: { fuses: p.fuses, fuseA: p.fuseA, fuseWindow: p.fuseWindow, isoA: extSwitch ? p.isoA : null, spd: extSpd, dcClass: p.dcClass, dcdb: box } });
    }
    byId.get(invId).dcdbs = boxes.length;
    byId.get(invId).integrated = { dcSwitch: !extSwitch, dcSpd: !extSpd };
  }

  // ── storage (hybrid / off-grid) ──
  if (type !== 'on-grid') {
    const bat = sys.battery || {};
    add({ id: 'BAT', type: 'BATTERY', tag: 'BAT', label: 'Battery storage', ratings: { kwh: bat.kwh || null, voltage: bat.voltage || null, chemistry: bat.chemistry || null } });
    add({ id: 'Q-BAT', type: 'DC_ISOLATOR', tag: 'Q-BAT', label: 'Battery DC breaker / fuse', ratings: {} });
    link('BAT', 'Q-BAT', 'DC', { voltageV: bat.voltage || undefined });
    for (const inv of invs) link('Q-BAT', `INV-${inv.no}`, 'DC', { port: 'battery', voltageV: bat.voltage || undefined });
    link('BAT', 'E1', 'EARTH', { label: 'enclosure' });
  }

  // ── AC side ──
  const phases = invs[0]?.spec.phases || 3;
  const acV = invs[0]?.spec.acV || 415;
  const totalA = invs.reduce((a, inv) => a + inverterAcA(inv.spec), 0);
  const groups = [];
  for (let i = 0; i < invs.length; i += rules.maxAcdbIncomers) groups.push(invs.slice(i, i + rules.maxAcdbIncomers));
  const acdbs = [];
  groups.forEach((g, gi) => {
    const id = groups.length > 1 ? `ACDB-${gi + 1}` : 'ACDB';
    const sumA = g.reduce((a, inv) => a + inverterAcA(inv.spec), 0);
    add({ id, type: 'AC_COMBINER', tag: id, label: 'AC distribution box', ratings: { incomers: g.length, phases, acV, busA: sumA }, enclosure: true });
    link(id, 'E2', 'EARTH', { label: 'enclosure' });
    for (const inv of g) {
      const ia = inverterAcA(inv.spec);
      const qa = ratingFor(rules.breakers, rules.acBreakerFactor * ia);
      const qid = `Q${inv.no}`;
      add({ id: qid, type: 'AC_BREAKER', tag: qid, label: `${breakerType(qa ?? 0)} incomer`, parent: id, inverter: inv.no, ratings: { a: qa, poles: phases === 3 ? 4 : 2, designA: ia } });
      const cable = cableFor(rules.acCables, qa ?? ia);
      link(`INV-${inv.no}`, qid, 'AC', { voltageV: inv.spec.acV, currentA: ia, cable: cable && { size: cable, type: `${phases === 3 ? '4C' : '3C'} Cu armoured`, tag: 'C3' } });
      link(qid, id, 'AC', { voltageV: inv.spec.acV, currentA: ia });
    }
    // the ACDB's own SPD and outgoing breaker
    const spdId = `${id}/SPD-AC`;
    add({ id: spdId, type: 'AC_SPD', tag: groups.length > 1 ? `SPD-AC${gi + 1}` : 'SPD-AC', label: 'AC surge protection', parent: id, ratings: { uc: phases === 3 ? '275 V L-N' : '275 V', config: phases === 3 ? '3+1' : '1+1', type: 'Type 2' } });
    link(id, spdId, 'AC', { tap: true });
    link(spdId, 'E2', 'EARTH');
    const qa = ratingFor(rules.breakers, rules.acBreakerFactor * sumA);
    const outId = groups.length > 1 ? `${id}/QO` : 'QM';
    add({ id: outId, type: 'AC_BREAKER', tag: groups.length > 1 ? `QO${gi + 1}` : 'QM', label: `${breakerType(qa ?? 0)} ${groups.length > 1 ? 'outgoing' : 'main'}`, parent: id, ratings: { a: qa, poles: phases === 3 ? 4 : 2, designA: sumA } });
    link(id, outId, 'AC', { voltageV: acV, currentA: sumA });
    acdbs.push({ id, outId, sumA });
  });

  // several ACDBs: collected in a main AC combiner with its own main breaker
  let head = acdbs[0]?.outId || null;
  if (acdbs.length > 1) {
    add({ id: 'MACDB', type: 'AC_COMBINER', tag: 'MACDB', label: 'Main AC combiner', ratings: { incomers: acdbs.length, phases, acV, busA: totalA }, enclosure: true });
    link('MACDB', 'E2', 'EARTH', { label: 'enclosure' });
    for (const a of acdbs) {
      const cable = cableFor(rules.acCables, a.sumA * rules.acBreakerFactor);
      link(a.outId, 'MACDB', 'AC', { voltageV: acV, currentA: a.sumA, cable: cable && { size: cable, type: `${phases === 3 ? '4C' : '3C'} Cu armoured`, tag: 'C4' } });
    }
    const qa = ratingFor(rules.breakers, rules.acBreakerFactor * totalA);
    add({ id: 'QM', type: 'AC_BREAKER', tag: 'QM', label: `${breakerType(qa ?? 0)} main`, parent: 'MACDB', ratings: { a: qa, poles: phases === 3 ? 4 : 2, designA: totalA } });
    link('MACDB', 'QM', 'AC', { voltageV: acV, currentA: totalA });
    head = 'QM';
  }

  // ── metering and the building / grid interface (only what the system type needs) ──
  const mainA = byId.get('QM')?.ratings.a || 0;
  const ct = mainA > rules.wholeCurrentMeterMaxA ? ratingFor(rules.cts, mainA) : null;
  const meterSpec = { phases, ct, class: '1.0' };
  const mainCable = cableFor(rules.acCables, mainA || totalA);
  if (head) {
    if (type === 'off-grid') {
      add({ id: 'LOADS', type: 'DISTRIBUTION_PANEL', tag: 'LDB', label: 'Load distribution board', ratings: { phases, acV } });
      link(head, 'LOADS', 'AC', { voltageV: acV, currentA: totalA, cable: mainCable && { size: mainCable, type: `${phases === 3 ? '4C' : '3C'} Cu armoured`, tag: 'C4' } });
      link('LOADS', 'MET', 'EARTH', { label: 'PE bar' });
    } else {
      add({ id: 'M1', type: 'ENERGY_METER', tag: 'M1', label: 'Solar generation meter', ratings: meterSpec });
      add({ id: 'LT', type: 'DISTRIBUTION_PANEL', tag: 'LT', label: 'LT panel (building main distribution)', ratings: { phases, acV } });
      add({ id: 'M2', type: 'ENERGY_METER', tag: 'M2', label: 'Net meter (bi-directional, DISCOM)', ratings: { ...meterSpec, bidirectional: true } });
      link(head, 'M1', 'AC', { voltageV: acV, currentA: totalA, cable: mainCable && { size: mainCable, type: `${phases === 3 ? '4C' : '3C'} Cu armoured`, tag: 'C4' } });
      link('M1', 'LT', 'AC', { voltageV: acV, currentA: totalA });
      link('LT', 'M2', 'AC', { voltageV: acV });
      link('LT', 'MET', 'EARTH', { label: 'PE bar' });
      let last = 'M2';
      if (sys.transformer) {
        const t = sys.transformer;
        add({ id: 'TX', type: 'TRANSFORMER', tag: 'TX', label: 'Transformer', ratings: { kva: t.kva || null, primaryV: t.primaryV || null, secondaryV: t.secondaryV || acV } });
        link('M2', 'TX', 'AC', { voltageV: acV });
        link('TX', 'MET', 'EARTH', { label: 'neutral & body' });
        last = 'TX';
      }
      add({ id: 'GRID', type: 'GRID', tag: 'GRID', label: sys.transformer ? 'Utility HT grid' : 'Utility LT grid (DISCOM)', ratings: { voltage: sys.transformer?.primaryV || acV, phases, hz: 50 } });
      link(last, 'GRID', 'AC', { voltageV: sys.transformer?.primaryV || acV });
      if (type === 'hybrid') {
        // backup (EPS) output of each hybrid inverter to the essential loads
        add({ id: 'BACKUP', type: 'DISTRIBUTION_PANEL', tag: 'EDB', label: 'Backup / essential loads', ratings: { phases, acV } });
        for (const inv of invs) {
          const qid = `QB${inv.no}`;
          const ia = inverterAcA(inv.spec);
          const qa = ratingFor(rules.breakers, rules.acBreakerFactor * ia);
          add({ id: qid, type: 'AC_BREAKER', tag: qid, label: `${breakerType(qa ?? 0)} backup output`, inverter: inv.no, ratings: { a: qa, poles: phases === 3 ? 4 : 2, designA: ia } });
          link(`INV-${inv.no}`, qid, 'AC', { port: 'backup', voltageV: inv.spec.acV, currentA: ia });
          link(qid, 'BACKUP', 'AC', { voltageV: inv.spec.acV, currentA: ia });
        }
        link('BACKUP', 'MET', 'EARTH', { label: 'PE bar' });
      }
    }
  }

  const totalW = input.strings.reduce((a, s) => a + s.powerW, 0);
  const acKw = invs.reduce((a, inv) => a + inv.spec.kw, 0);
  return {
    metadata: {
      engine: 'innovbit-sld',
      rulesVersion: rules.version,
      title: input.title || 'Single line diagram',
      systemType: type,
      phases,
      acV,
      totals: {
        modules: input.strings.reduce((a, s) => a + s.modules, 0),
        strings: input.strings.length,
        dcKw: totalW / 1000,
        acKw,
        dcAc: acKw ? totalW / 1000 / acKw : null,
        inverters: invs.length,
        mpptsUsed: invs.reduce((a, inv) => a + inv.mppts.filter((m) => m.strings.length).length, 0),
        mpptsUnused: invs.reduce((a, inv) => a + inv.mppts.filter((m) => !m.strings.length).length, 0),
        dcdbs: dcdbs.length,
        acdbs: acdbs.length + (acdbs.length > 1 ? 1 : 0),
        meterCt: ct,
      },
      temperatures: { minCellC: rules.temperature.minCellC, maxAmbientC: rules.temperature.maxAmbientC },
    },
    nodes,
    connections,
    notes,
    validation: [],
  };
}

/** Index helpers for consumers (layout, schedule, tests). */
export function indexDocument(doc) {
  const node = new Map(doc.nodes.map((n) => [n.id, n]));
  const out = new Map();
  const into = new Map();
  for (const c of doc.connections) {
    if (!out.has(c.from)) out.set(c.from, []);
    if (!into.has(c.to)) into.set(c.to, []);
    out.get(c.from).push(c);
    into.get(c.to).push(c);
  }
  return { node, out: (id) => out.get(id) || [], into: (id) => into.get(id) || [] };
}
