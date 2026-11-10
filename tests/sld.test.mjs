// SLD engine tests (T1–T20): electrical topology and the laid-out drawing, for each configuration.
// Run: npm run test:sld   (node:test; the app's ES modules are loaded with jiti)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': new URL('../src', import.meta.url).pathname } });
const { SLD_RULES, rulesWith } = await jiti.import('../src/lib/sld/rules.js');
const { moduleSpec, inverterSpec } = await jiti.import('../src/lib/sld/equipment.js');
const { stringElectricals, lengthRange, lengthPlans, checkString } = await jiti.import('../src/lib/sld/strings.js');
const { allocateMppts } = await jiti.import('../src/lib/sld/allocate.js');
const { buildSldDocument, acCurrent, indexDocument } = await jiti.import('../src/lib/sld/topology.js');
const { validateDocument } = await jiti.import('../src/lib/sld/validate.js');
const { layoutSld, checkSheet } = await jiti.import('../src/lib/sld/layout.js');
const { electricalForCount } = await jiti.import('../src/lib/electrical.js');

/* ───────────── fixtures ───────────── */

// a 575 W TOPCon module with its full datasheet
const MOD = moduleSpec({ id: 'm575', name: 'Test 575', watts: 575, attributes: { voc: 51.2, vmp: 42.6, isc: 14.1, imp: 13.5, tempCoeffVoc: -0.25, tempCoeffPmax: -0.3, noct: 43, maxSeriesFuse: 25, maxSystemVoltage: 1500 } });
const MOD_440 = moduleSpec({ id: 'm440', name: 'Test 440', watts: 440, attributes: { voc: 49.3, vmp: 41.2, isc: 11.3, imp: 10.7, tempCoeffVoc: -0.27, tempCoeffPmax: -0.35, noct: 45, maxSeriesFuse: 20 } });
const RULES = rulesWith({ temperature: { minCellC: 5, maxAmbientC: 45 } });

// inverters with full datasheets
const INV = {
  res5: { name: 'Res 5 kW', kw: 5, phase: 'Single Phase (230V)', mpptCount: 2, maxDcVoltage: 600, mpptVoltageMin: 80, mpptVoltageMax: 550, startUpVoltage: 100, maxInputCurrentPerMppt: 16, maxShortCircuitCurrentPerMppt: 22, stringsPerMppt: 1, acVoltage: 230, maxAcOutputCurrent: 22.7, maxDcPower: 7.5, inverterType: 'On-grid', integratedDcSwitch: 'Yes', integratedDcSpd: 'No' },
  c20: { name: 'C&I 20 kW', kw: 20, phase: 'Three phase', mpptCount: 2, maxDcVoltage: 1100, mpptVoltageMin: 200, mpptVoltageMax: 1000, startUpVoltage: 200, maxInputCurrentPerMppt: 32, maxShortCircuitCurrentPerMppt: 40, stringsPerMppt: 2, acVoltage: 415, maxAcOutputCurrent: 31.9, maxDcPower: 30, inverterType: 'On-grid', integratedDcSwitch: 'Yes', integratedDcSpd: 'No' },
  c50: { name: 'C&I 50 kW', kw: 50, phase: 'Three phase', mpptCount: 4, maxDcVoltage: 1100, mpptVoltageMin: 200, mpptVoltageMax: 1000, startUpVoltage: 200, maxInputCurrentPerMppt: 32, maxShortCircuitCurrentPerMppt: 40, stringsPerMppt: 3, acVoltage: 415, maxAcOutputCurrent: 80, maxDcPower: 75, inverterType: 'On-grid', integratedDcSwitch: 'Yes', integratedDcSpd: 'Yes' },
  c100: { name: 'C&I 100 kW', kw: 100, phase: 'Three phase', mpptCount: 8, maxDcVoltage: 1100, mpptVoltageMin: 200, mpptVoltageMax: 1000, startUpVoltage: 200, maxInputCurrentPerMppt: 32, maxShortCircuitCurrentPerMppt: 40, stringsPerMppt: 2, acVoltage: 415, maxAcOutputCurrent: 160, maxDcPower: 150, inverterType: 'On-grid', integratedDcSwitch: 'Yes', integratedDcSpd: 'No' },
  hyb8: { name: 'Hybrid 8 kW', kw: 8, phase: 'Three phase', mpptCount: 2, maxDcVoltage: 1000, mpptVoltageMin: 160, mpptVoltageMax: 950, startUpVoltage: 180, maxInputCurrentPerMppt: 16, maxShortCircuitCurrentPerMppt: 22, stringsPerMppt: 1, acVoltage: 415, maxAcOutputCurrent: 12.1, maxDcPower: 12, inverterType: 'Hybrid', integratedDcSwitch: 'Yes', integratedDcSpd: 'Yes' },
  off5: { name: 'Off-grid 5 kW', kw: 5, phase: 'Single phase', mpptCount: 1, maxDcVoltage: 500, mpptVoltageMin: 120, mpptVoltageMax: 450, startUpVoltage: 150, maxInputCurrentPerMppt: 18, maxShortCircuitCurrentPerMppt: 22, stringsPerMppt: 1, acVoltage: 230, maxAcOutputCurrent: 21.7, maxDcPower: 6.5, inverterType: 'Off-grid', integratedDcSwitch: 'Yes', integratedDcSpd: 'No' },
};

let seq = 0;
/** Strings of `len` modules (optionally another orientation / module). */
const mk = (count, len, { orient = '180°/20°', mod = MOD } = {}) => Array.from({ length: count }, () => {
  const i = seq++;
  return { id: `s${i}`, name: `S${i + 1}`, index: i, orient, moduleKey: mod.id, ...stringElectricals(len, mod, RULES) };
});

/** The whole pipeline for a set of strings on `count` inverters of `inv` (attributes). */
function system(strings, inv, count = 1, sys = {}, mod = MOD) {
  strings.forEach((s, i) => Object.assign(s, { index: i, name: `S${i + 1}` }));
  const spec = inverterSpec(inv);
  const inverters = Array.from({ length: count }, (_, k) => ({ no: k + 1, spec }));
  const allocation = allocateMppts(strings, inverters);
  const placed = new Set([...allocation.byString.keys()]);
  const doc = buildSldDocument({ strings: strings.filter((s) => placed.has(s.id)), allocation, module: mod, rules: RULES, system: sys });
  const v = validateDocument(doc, { module: mod, rules: RULES, temperaturesGiven: true, extra: allocation.issues });
  doc.validation = v.items;
  const layout = layoutSld(doc, 178, 232);
  return { doc, v, allocation, layout, ix: indexDocument(doc) };
}

const codes = (v, level) => v.items.filter((i) => !level || i.level === level).map((i) => i.code);

/** Every sheet readable; every drawn wire is one of the document's connections; every device is drawn. */
function assertDrawing({ doc, layout }) {
  for (const sh of layout.sheets) assert.deepEqual(checkSheet(sh), [], `sheet ${sh.title}`);
  const ids = new Set(doc.connections.map((c) => c.id));
  const drawn = layout.sheets.flatMap((sh) => sh.items);
  for (const w of drawn.filter((p) => p.t === 'wire' && /^C\d+$/.test(p.conn || ''))) assert.ok(ids.has(w.conn), `wire ${w.conn} is a document connection`);
  const shown = new Set(drawn.filter((p) => p.id).map((p) => p.id));
  const tags = new Set(drawn.filter((p) => p.t === 'text').map((p) => p.s));
  for (const n of doc.nodes) {
    if (['DC_FUSE', 'DC_ISOLATOR', 'DC_SPD', 'INVERTER', 'AC_BREAKER', 'AC_SPD', 'ENERGY_METER', 'GRID', 'TRANSFORMER', 'BATTERY'].includes(n.type) || (n.enclosure && n.type !== 'EARTH')) assert.ok(shown.has(n.id), `${n.id} is drawn`);
    if (n.type === 'PV_STRING') assert.ok(tags.has(n.tag), `string ${n.tag} is drawn`);
  }
}

/** Strings sharing an MPPT are always alike. */
function assertCompatibleMppts({ allocation }) {
  for (const inv of allocation.inverters) for (const m of inv.mppts) {
    assert.ok(new Set(m.strings.map((s) => s.modules)).size <= 1, `INV-${inv.no} MPPT ${m.no}: one string length`);
    assert.ok(new Set(m.strings.map((s) => s.moduleKey)).size <= 1, `INV-${inv.no} MPPT ${m.no}: one module type`);
    assert.ok(m.strings.length <= inv.spec.stringsPerMppt, `INV-${inv.no} MPPT ${m.no}: within the inputs`);
  }
}

/* ───────────── string electricals ───────────── */

test('string electricals: P, Voc, Vmp, Isc, Imp and the temperature-corrected voltages', () => {
  const s = stringElectricals(16, MOD, RULES);
  assert.equal(s.powerW, 16 * 575);
  assert.equal(s.voc, 16 * 51.2);
  assert.equal(s.vmp, 16 * 42.6);
  assert.equal(s.isc, 14.1);
  assert.equal(s.imp, 13.5);
  // Voc at 5 °C: 16 × 51.2 × (1 − 0.0025 × (5 − 25)) = 16 × 51.2 × 1.05
  assert.ok(Math.abs(s.vocMax - 16 * 51.2 * 1.05) < 1e-9);
  // hot cell: 45 + (43 − 20) × 1000 / 800 = 73.75 °C; Vmp × (1 − 0.003 × 48.75)
  assert.ok(Math.abs(s.vmpMin - 16 * 42.6 * (1 - 0.003 * 48.75)) < 1e-9);
  assert.ok(s.vocMax > s.voc, 'never only the STC Voc');
  const r = lengthRange(MOD, inverterSpec(INV.c20), RULES);
  assert.equal(r.max, Math.min(Math.floor(1100 / (51.2 * 1.05)), Math.floor(1000 / (42.6 * 1.06))));
  assert.ok(r.min >= Math.ceil(200 / (42.6 * (1 - 0.003 * 48.75))));
});

test('string length plans: equal lengths first, never outside the range', () => {
  const plans = lengthPlans(33, { min: 6, max: 20 });
  assert.deepEqual(plans[0], [11, 11, 11]);
  for (const p of plans) for (const L of p) assert.ok(L >= 6 && L <= 20);
  assert.equal(lengthPlans(4, { min: 6, max: 20 }).length, 0, 'too few modules: no valid plan');
});

/* ───────────── T1–T20 ───────────── */

test('T1: 1 string, 1 inverter', () => {
  const r = system(mk(1, 9), INV.res5);
  assert.deepEqual(codes(r.v, 'error'), []);
  assert.equal(r.doc.metadata.totals.strings, 1);
  // one main path out of the string (the SPD is a tap on it)
  assert.equal(r.ix.out(r.doc.nodes.find((n) => n.type === 'PV_STRING').id).filter((c) => !c.tap).length, 1);
  // built-in DC switch, external DC SPD only: a DCDB, without fuses (one string)
  assert.equal(r.doc.nodes.filter((n) => n.type === 'DC_FUSE').length, 0);
  assert.equal(r.doc.nodes.filter((n) => n.type === 'DC_SPD').length, 1);
  assert.equal(r.doc.nodes.filter((n) => n.type === 'DC_ISOLATOR').length, 0, 'built-in DC switch: no external isolator');
  assert.equal(r.layout.mode, 'single');
  assertDrawing(r);
});

test('T2: 4 strings, 1 inverter with 2 MPPTs (2 strings each)', () => {
  const r = system(mk(4, 12), INV.c20);
  assertCompatibleMppts(r);
  assert.deepEqual(r.allocation.inverters[0].mppts.map((m) => m.strings.length), [2, 2]);
  assert.deepEqual(codes(r.v, 'error'), []);
  // 2 in parallel with a 25 A module fuse rating: (2 − 1) × 1.25 × 14.1 < 25 → no fuses
  assert.equal(r.doc.nodes.filter((n) => n.type === 'DC_FUSE').length, 0);
  assertDrawing(r);
});

test('T3: 11 strings, 1 inverter with 8 MPPTs — spread over every MPPT', () => {
  const r = system(mk(11, 16), INV.c100);
  assertCompatibleMppts(r);
  const per = r.allocation.inverters[0].mppts.map((m) => m.strings.length);
  assert.equal(per.reduce((a, b) => a + b, 0), 11);
  assert.ok(per.every((n) => n >= 1 && n <= 2), `all 8 MPPTs used: ${per}`);
  assert.deepEqual(codes(r.v, 'error'), []);
  assertDrawing(r);
});

test('T4: 20 strings, 2 inverters — balanced', () => {
  const r = system(mk(20, 16), INV.c100, 2);
  assertCompatibleMppts(r);
  const loads = r.allocation.inverters.map((i) => i.mppts.reduce((a, m) => a + m.strings.length, 0));
  assert.deepEqual(loads, [10, 10]);
  assert.deepEqual(codes(r.v, 'error'), []);
  assert.equal(r.doc.nodes.filter((n) => n.type === 'AC_BREAKER' && /^Q\d/.test(n.id)).length, 2, 'one incomer per inverter');
  assertDrawing(r);
});

test('T5: 50 strings, 5 inverters', () => {
  const r = system(mk(50, 16), INV.c100, 5);
  assertCompatibleMppts(r);
  assert.equal(r.doc.metadata.totals.inverters, 5);
  assert.deepEqual(codes(r.v, 'error'), []);
  assert.ok(r.layout.sheets.length > 1, 'spread over several sheets');
  assertDrawing(r);
});

test('T6: different string lengths never share an MPPT (the "MPPT 6: 14 + 13 modules" bug)', () => {
  const r = system([...mk(8, 14), ...mk(3, 13)], INV.c100);
  assertCompatibleMppts(r);
  assert.ok(!codes(r.v).includes('MPPT_MIXED_LENGTH'));
  assert.deepEqual(codes(r.v, 'error'), []);
  // and when there are not enough MPPTs for both lengths: an explicit error, not a forced connection
  const tight = system([...mk(2, 14), ...mk(1, 13)], { ...INV.res5, mpptCount: 1, stringsPerMppt: 3, maxInputCurrentPerMppt: 45, maxShortCircuitCurrentPerMppt: 60, maxDcVoltage: 1000, mpptVoltageMax: 950 });
  assert.ok(codes(tight.v, 'error').includes('MPPT_UNAVAILABLE'));
  assertCompatibleMppts(tight);
});

test('T7: different roof orientations stay on separate MPPTs; shared only when MPPTs run out (warned)', () => {
  const r = system([...mk(2, 16, { orient: '180°/20°' }), ...mk(2, 16, { orient: '90°/20°' })], INV.c20);
  for (const m of r.allocation.inverters[0].mppts) assert.ok(new Set(m.strings.map((s) => s.orient)).size <= 1);
  assert.ok(!r.allocation.relaxed);
  const r2 = system([...mk(2, 16, { orient: '180°/20°' }), ...mk(2, 16, { orient: '90°/20°' }), ...mk(2, 16, { orient: '270°/20°' })], INV.c20);
  assert.ok(r2.allocation.ok === false || r2.allocation.relaxed);
  if (r2.allocation.relaxed) assert.ok(codes(r2.v, 'warning').includes('MPPT_MIXED_ORIENTATION'));
});

test('T8: different module specifications never share an MPPT', () => {
  const r = system([...mk(2, 12), ...mk(2, 12, { mod: MOD_440 })], INV.c20);
  assertCompatibleMppts(r);
  assert.deepEqual(codes(r.v, 'error'), []);
});

test('T9: 100+ strings', () => {
  const r = system(mk(112, 16), INV.c100, 7);
  assertCompatibleMppts(r);
  assert.equal(r.doc.metadata.totals.strings, 112);
  assert.deepEqual(codes(r.v, 'error'), []);
  assert.ok(r.doc.metadata.totals.acdbs >= 2, 'more than 6 inverters: several ACDBs + main combiner');
  assertDrawing(r);
});

test('T10: hybrid inverter with battery', () => {
  const r = system(mk(2, 10), INV.hyb8, 1, { type: 'hybrid', battery: { kwh: 10, voltage: 400 } });
  assert.ok(r.ix.node.get('BAT'));
  assert.ok(r.ix.out('Q-BAT').some((c) => c.to === 'INV-1' && c.kind === 'DC'));
  assert.ok(r.ix.node.get('BACKUP') && r.ix.node.get('GRID'));
  assert.deepEqual(codes(r.v, 'error'), []);
  assertDrawing(r);
  // a grid-tie inverter in a hybrid system is an error
  const bad = system(mk(2, 12), INV.c20, 1, { type: 'hybrid', battery: { kwh: 10, voltage: 400 } });
  assert.ok(codes(bad.v, 'error').includes('INVERTER_TYPE'));
});

test('T11: off-grid: battery and loads, no grid, no net meter', () => {
  const r = system(mk(1, 8), INV.off5, 1, { type: 'off-grid', battery: { kwh: 7.5, voltage: 48 } });
  assert.ok(!r.ix.node.get('GRID') && !r.ix.node.get('M2'));
  assert.ok(r.ix.node.get('LOADS') && r.ix.node.get('BAT'));
  assert.deepEqual(codes(r.v, 'error'), []);
  assertDrawing(r);
});

test('T12: missing inverter datasheet values: reported, never "checked"', () => {
  const r = system(mk(2, 14), { name: 'Unknown 10 kW', capacity: 10, mpptCount: 2 });
  assert.ok(codes(r.v, 'warning').includes('INVERTER_DATASHEET'));
  assert.notEqual(r.v.status, 'checked');
  const msg = r.v.items.find((i) => i.code === 'INVERTER_DATASHEET').message;
  assert.match(msg, /max DC voltage/);
  // generic (no product chosen)
  const el = electricalForCount(20, { id: 'x', watts: 575, voc: 51.2, isc: 14.1 });
  assert.ok(el.validation.items.some((i) => i.code === 'INVERTER_GENERIC'));
  assert.equal(el.validation.status, 'incomplete');
});

test('T13: MPPT input current exceeded: explicit error', () => {
  const r = system(mk(2, 14), { ...INV.c20, maxInputCurrentPerMppt: 12.5, maxShortCircuitCurrentPerMppt: 15 });
  assert.ok(codes(r.v, 'error').includes('MPPT_CURRENT'));
  // and the validation catches an over-filled MPPT in any document
  const r2 = system(mk(2, 14), INV.c20);
  const mppt = r2.doc.nodes.find((n) => n.type === 'MPPT');
  mppt.parentSpecBackup = null;
  const inv = r2.ix.node.get('INV-1');
  inv.spec = { ...inv.spec, maxImpPerMppt: 20 };
  const s = r2.doc.nodes.filter((n) => n.type === 'PV_STRING');
  s.forEach((n) => Object.assign(n, { mppt: 1 }));
  const v = validateDocument(r2.doc, { module: MOD, rules: RULES, temperaturesGiven: true });
  assert.ok(codes(v, 'error').includes('MPPT_CURRENT'));
});

test('T14: inverter max DC voltage exceeded (cold Voc): explicit error', () => {
  const inv = inverterSpec(INV.c20);
  const st = { name: 'S1', ...stringElectricals(21, MOD, RULES) };
  assert.ok(st.voc < 1100 && st.vocMax > 1100, 'fine at STC, too high when cold');
  assert.ok(checkString(st, inv, RULES).some((i) => i.code === 'STRING_VOC_MAX'));
  const r = system([{ id: 'x', orient: 'a', moduleKey: MOD.id, ...st }], { ...INV.c20, stringsPerMppt: 1 });
  assert.ok(codes(r.v, 'error').includes('STRING_VOC_MAX'));
});

test('T15: multiple inverters on one common ACDB: incomers, busbar, SPD, main breaker', () => {
  const r = system(mk(6, 12), INV.c20, 3);
  const acdb = r.ix.node.get('ACDB');
  assert.equal(acdb.ratings.incomers, 3);
  for (const n of [1, 2, 3]) assert.ok(r.ix.out(`Q${n}`).some((c) => c.to === 'ACDB'));
  assert.ok(r.ix.out('ACDB').some((c) => c.to === 'ACDB/SPD-AC'));
  const qm = r.ix.node.get('QM');
  // main ≥ 1.25 × 3 × 31.9 A, from the standard list (not a fixed 160 A)
  assert.equal(qm.ratings.a, SLD_RULES.breakers.find((b) => b >= 1.25 * 3 * 31.9));
  assertDrawing(r);
});

test('T16: integrated inverter protection: no external DCDB', () => {
  const r = system(mk(4, 16), INV.c50);
  assert.equal(r.doc.nodes.filter((n) => n.type === 'DC_COMBINER').length, 0);
  assert.equal(r.doc.metadata.totals.dcdbs, 0);
  for (const s of r.doc.nodes.filter((n) => n.type === 'PV_STRING')) assert.ok(r.ix.out(s.id).some((c) => r.ix.node.get(c.to).type === 'MPPT'));
  assertDrawing(r);
});

test('T17: multiple DCDBs and ACDBs', () => {
  // 3 strings per MPPT with fuses → 24 inputs per inverter → 2 DCDBs each (12 inputs max); 8 inverters → 2 ACDBs + main
  const inv = { ...INV.c100, stringsPerMppt: 3, maxInputCurrentPerMppt: 45, maxShortCircuitCurrentPerMppt: 60 };
  const r = system(mk(192, 10), inv, 8, {}, moduleSpec({ ...MOD, attributes: { voc: 51.2, vmp: 42.6, isc: 14.1, imp: 13.5, tempCoeffVoc: -0.25, tempCoeffPmax: -0.3, noct: 43, maxSeriesFuse: 25 } }));
  assert.ok(r.doc.metadata.totals.dcdbs >= 16);
  assert.ok(r.doc.nodes.some((n) => n.id === 'DCDB-1.2'));
  assert.ok(r.ix.node.get('MACDB') && r.ix.node.get('ACDB-2'));
  assert.ok(r.doc.nodes.filter((n) => n.type === 'DC_FUSE').length > 0, '3 in parallel above the 25 A fuse rating: fuses');
  assert.deepEqual(codes(r.v, 'error'), []);
  assertDrawing(r);
});

test('T18: invalid and incomplete topology is reported', () => {
  const r = system(mk(2, 16), INV.c20);
  const doc = structuredClone({ ...r.doc, nodes: r.doc.nodes.map((n) => ({ ...n, spec: n.spec })) });
  doc.connections.push({ id: 'Cx', from: 'S:nope', to: 'INV-1', kind: 'DC' });
  doc.nodes.push({ id: 'ORPHAN', type: 'AC_BREAKER', tag: 'QX', ratings: {} });
  doc.connections = doc.connections.filter((c) => !(c.from === 'QM' && c.to === 'M1'));
  const v = validateDocument(doc, { module: MOD, rules: RULES, temperaturesGiven: true });
  const e = codes(v, 'error');
  assert.ok(e.includes('TOPOLOGY_DANGLING'));
  assert.ok(e.includes('TOPOLOGY_ISOLATED'));
  assert.ok(e.includes('TOPOLOGY_AC'));
  assert.equal(v.status, 'invalid');
});

test('T19: AC voltage and phases: currents from I = P/(√3·V·PF) and P/(V·PF); mixed phases on one bus rejected', () => {
  assert.ok(Math.abs(acCurrent(20000, 415, 3, 1) - 20000 / (Math.sqrt(3) * 415)) < 1e-9);
  assert.ok(Math.abs(acCurrent(5000, 230, 1, 0.9) - 5000 / (230 * 0.9)) < 1e-9);
  const one = system(mk(1, 9), INV.res5);
  assert.equal(one.doc.metadata.phases, 1);
  assert.equal(one.ix.node.get('Q1').ratings.poles, 2);
  const three = system(mk(2, 16), INV.c20);
  assert.equal(three.ix.node.get('Q1').ratings.poles, 4);
  // a 1-phase and a 3-phase inverter collected together
  const strings = mk(4, 9); // more than the 3-phase inverter's 2 MPPTs: both inverters are used
  const allocation = allocateMppts(strings, [{ no: 1, spec: inverterSpec(INV.res5) }, { no: 2, spec: inverterSpec(INV.c20) }]);
  const doc = buildSldDocument({ strings, allocation, module: MOD, rules: RULES, system: {} });
  const v = validateDocument(doc, { module: MOD, rules: RULES, temperaturesGiven: true });
  assert.ok(codes(v, 'error').includes('AC_MIXED'));
});

test('T20: large diagram: several sheets, nothing overlaps, every string drawn once', () => {
  const r = system([...mk(60, 16), ...mk(40, 15, { orient: '90°/10°' }), ...mk(30, 14)], INV.c100, 9);
  assertCompatibleMppts(r);
  assert.deepEqual(codes(r.v, 'error'), []);
  assert.ok(r.layout.sheets.length >= 4);
  assertDrawing(r);
  const tags = r.layout.sheets.flatMap((s) => s.items.filter((p) => p.t === 'text' && /^S\d+$/.test(p.s)).map((p) => p.s));
  assert.equal(tags.length, 130);
  assert.equal(new Set(tags).size, 130);
});

/* ───────────── the app's pipeline ───────────── */

test('designElectrical keeps its shape and uses the engine', () => {
  const el = electricalForCount(33, { id: 'p', watts: 575, voc: 51.2, isc: 14.1 });
  for (const k of ['kwp', 'inverter', 'inverterCount', 'acKw', 'dcAc', 'maxLen', 'minLen', 'strings', 'stringOf', 'bom', 'sld', 'validation']) assert.ok(k in el, k);
  assert.deepEqual(el.strings.map((s) => s.count), [11, 11, 11]);
  for (const s of el.strings) for (const k of ['name', 'count', 'voc', 'vocCold', 'isc', 'kwp', 'inverter', 'mppt', 'modules']) assert.ok(k in s, k);
  assert.ok(el.inverter.kw && el.inverter.mppt && el.inverter.maxVdc);
  // an inverter product with its datasheet decides the strings
  const el2 = electricalForCount(40, { id: 'p', watts: 575, attributes: { voc: 51.2, vmp: 42.6, isc: 14.1, imp: 13.5 } }, { inverterProduct: { id: 'i', ...INV.c20 }, inverterQty: 1 });
  assert.equal(el2.inverter.name, 'C&I 20 kW');
  for (const s of el2.strings) assert.ok(s.count >= el2.minLen && s.count <= el2.maxLen);
});
