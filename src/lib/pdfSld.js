'use client';

// The single line diagram sheets of the proposal, drawn as vector graphics from the SLD engine (./sld): the
// engine builds the electrical topology (nodes and connections) and lays it out; this file only draws the
// layout's primitives with the symbols below, and lists the equipment schedule from the same topology.
// A design too big for one sheet is drawn over several (DC sheets, then the AC sheet).

import { layoutSld } from './sld/layout.js';
import { indexDocument } from './sld/topology.js';

const INK = [15, 23, 42];
const BODY = [0, 0, 0];
const MUTED = [71, 85, 105];
const LINE = [226, 232, 240];
const WHITE = [255, 255, 255];
const DC = [220, 38, 38];
const AC = [37, 99, 235];
const PE = [22, 163, 74];
const COLORS = { DC, AC, PE, MUTED, INK, BODY };

/* ───────────── schedule ───────────── */

const range = (tags) => (tags.length > 1 ? `${tags[0]}-${tags[tags.length - 1]}` : tags[0] || '-');
const fmtA = (a) => (a == null ? 'rating to be confirmed' : `${a} A`);

/** Equipment schedule for the tags on the diagram: [tag, item, specification, qty], read from the SLD document. */
export function sldSchedule(el, spec, moduleName, moduleCount) {
  const doc = el.sld;
  if (!doc) return [];
  const of = (type, f = () => true) => doc.nodes.filter((n) => n.type === type && f(n));
  const strings = of('PV_STRING');
  const lens = [...new Set(strings.map((s) => s.ratings.modules))].sort((a, b) => a - b).join(' / ');
  const vMax = Math.max(0, ...strings.map((s) => s.ratings.vocMax));
  const rows = [['PV', 'Solar PV module', `${moduleName}, ${spec.watts} Wp${el.module?.assumed?.includes('voc') ? '' : `, Voc ${el.module?.voc ?? spec.voc} V, Isc ${el.module?.isc ?? spec.isc} A`}`, `${moduleCount} nos`]];
  rows.push([range(strings.map((s) => s.tag)), 'PV strings', `${lens} modules in series, up to ${vMax.toFixed(0)} V (Voc at ${doc.metadata.temperatures.minCellC} °C)`, `${strings.length} nos`]);
  const fuses = of('DC_FUSE');
  if (fuses.length) rows.push(['F', 'String fuse', `${[...new Set(fuses.map((f) => fmtA(f.ratings.a)))].join(' / ')} gPV, ${fuses[0].ratings.v} V DC, + and - poles`, `${fuses.length * 2} nos`]);
  const isos = of('DC_ISOLATOR', (n) => n.id !== 'Q-BAT');
  if (isos.length) rows.push(['Q-DC', 'DC isolator', `${[...new Set(isos.map((q) => fmtA(q.ratings.a)))].join(' / ')}, ${isos[0].ratings.v} V DC, 2-pole, lockable, one per MPPT`, `${isos.length} nos`]);
  const spds = of('DC_SPD');
  if (spds.length) rows.push(['SPD-DC', 'DC surge protection', `Type 2, Ucpv ≥ ${spds[0].ratings.ucpv} V DC, one per MPPT`, `${spds.length} nos`]);
  const dcdbs = of('DC_COMBINER', (n) => n.enclosure);
  if (dcdbs.length) rows.push([range(dcdbs.map((d) => d.tag)), 'DC distribution box', 'IP65, inputs / outputs as drawn', `${dcdbs.length} nos`]);
  const invs = of('INVERTER');
  const iv = invs[0]?.spec;
  if (iv) rows.push([range(invs.map((n) => n.tag)), iv.type === 'hybrid' ? 'Hybrid inverter' : iv.type === 'off-grid' ? 'Off-grid inverter / charger' : 'Grid-tie string inverter', `${iv.name}: ${iv.kw} kW, ${iv.phases === 3 ? '3-ph' : '1-ph'} ${iv.acV} V, ${iv.mppts} MPPT, ${iv.maxDcV} V DC max${iv.generic ? ' (generic: choose the product)' : ''}`, `${invs.length} nos`]);
  if (doc.nodes.some((n) => n.id === 'BAT')) {
    const b = doc.nodes.find((n) => n.id === 'BAT').ratings;
    rows.push(['BAT', 'Battery storage', [b.kwh && `${b.kwh} kWh`, b.voltage && `${b.voltage} V`].filter(Boolean).join(', ') || 'capacity to be confirmed', '1 set']);
  }
  const incomers = of('AC_BREAKER', (n) => /^Q\d/.test(n.id));
  if (incomers.length) rows.push([range(incomers.map((q) => q.tag)), 'ACDB incomer', `${[...new Set(incomers.map((q) => `${q.label.split(' ')[0]} ${fmtA(q.ratings.a)}, ${q.ratings.poles}P`))].join(' / ')}`, `${incomers.length} nos`]);
  const acSpds = of('AC_SPD');
  if (acSpds.length) rows.push(['SPD-AC', 'AC surge protection', `Type 2, ${acSpds[0].ratings.uc}, ${acSpds[0].ratings.config}`, `${acSpds.length} nos`]);
  for (const q of of('AC_BREAKER', (n) => n.id === 'QM' || /\/QO$/.test(n.id))) rows.push([q.tag, q.id === 'QM' ? 'Main AC breaker' : 'ACDB outgoing', `${q.label.split(' ')[0]} ${fmtA(q.ratings.a)}, ${q.ratings.poles}P`, '1 nos']);
  const acdbs = of('AC_COMBINER', (n) => n.enclosure);
  rows.push([range(acdbs.map((a) => a.tag)), 'AC distribution box', `${doc.metadata.phases === 3 ? '3-ph' : '1-ph'} ${doc.metadata.acV} V, busbar, SPD, main breaker`, `${acdbs.length} nos`]);
  for (const m of of('ENERGY_METER')) rows.push([m.tag, m.label, `${m.ratings.phases === 3 ? '3-ph' : '1-ph'}, ${m.ratings.ct ? `CT operated ${m.ratings.ct}/5 A` : 'whole current'}, class ${m.ratings.class}${m.ratings.bidirectional ? ', as approved by the DISCOM' : ''}`, '1 nos']);
  for (const t of of('TRANSFORMER')) rows.push(['TX', 'Transformer', [t.ratings.kva && `${t.ratings.kva} kVA`, t.ratings.primaryV && `${t.ratings.primaryV} / ${t.ratings.secondaryV} V`].filter(Boolean).join(', ') || 'rating to be confirmed', '1 nos']);
  const el2 = of('EARTH', (n) => n.id !== 'MET');
  rows.push([`${el2.map((e) => e.tag).join(', ')}, MET`, 'Earthing', `${el2.map((e) => `${e.tag} ${e.label.replace(/^Earth electrode, /, '')}`).join('; ')}; all bonded to the main earthing terminal`, `${el2.length} pits`]);
  if (doc.nodes.some((n) => n.id === 'LA')) rows.push(['LA', 'Lightning protection', 'Air terminal with dedicated down conductor to E3 (per the risk assessment)', '1 nos']);
  return rows;
}

/** The validation of the design: status line and the findings, for the electrical page. */
export function sldFindings(el) {
  const v = el.validation;
  if (!v) return null;
  return { status: v.status, items: v.items };
}

/* ───────────── symbols ───────────── */

function text(doc, str, x, y, { size = 5, style = 'normal', color = BODY, align } = {}) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.text(str, x, y, { align });
}

function clip(doc, str, width, size, style = 'normal') {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(String(str ?? ''), width);
  return lines.length > 1 ? `${lines[0].replace(/[\s,.;:-]+$/, '')}...` : lines[0] || '';
}

function pen(doc, rgb, width = 0.35, dash = []) {
  doc.setDrawColor(...rgb);
  doc.setLineWidth(width);
  doc.setLineDashPattern(dash, 0);
}

/** Polyline in a circuit colour; earthing conductors are dashed. */
function wire(doc, rgb, pts, dashed = rgb === PE) {
  pen(doc, rgb, rgb === PE ? 0.3 : 0.4, dashed ? [0.9, 0.7] : []);
  for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  doc.setLineDashPattern([], 0);
}

const dot = (doc, rgb, x, y) => {
  doc.setFillColor(...rgb);
  doc.circle(x, y, 0.55, 'F');
};

const SW = 4; // length of an in-line device along its wire, mm

/** Fuse, isolator or breaker from (x, y) along the wire — rightwards, or downwards when `v`. */
function device(doc, kind, x, y, v, rgb) {
  const P = (a, c) => (v ? [x + c, y + a] : [x + a, y + c]);
  const ln = (a1, c1, a2, c2) => {
    const [p1, q1] = P(a1, c1);
    const [p2, q2] = P(a2, c2);
    doc.line(p1, q1, p2, q2);
  };
  pen(doc, rgb);
  if (kind === 'fuse') {
    const [rx, ry] = P(0.4, -0.8);
    doc.setFillColor(...WHITE);
    doc.rect(rx, ry, v ? 1.6 : SW - 0.8, v ? SW - 0.8 : 1.6, 'FD');
    ln(0, 0, SW, 0);
    return;
  }
  // blank the wire under the switch, then leads, blade and the fixed-contact mark
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.8);
  ln(0.6, 0, SW - 0.6, 0);
  pen(doc, rgb);
  ln(0, 0, 0.6, 0);
  ln(SW - 0.6, 0, SW, 0);
  ln(0.6, 0, SW - 0.5, -1.7);
  if (kind === 'isolator') ln(SW - 0.6, -0.8, SW - 0.6, 0.8);
  else {
    ln(SW - 1.1, -0.5, SW - 0.1, 0.5);
    ln(SW - 1.1, 0.5, SW - 0.1, -0.5);
  }
}

function earth(doc, x, y) {
  pen(doc, PE, 0.35);
  doc.line(x, y, x, y + 1.3);
  [[1.5, 1.3], [1, 1.9], [0.45, 2.5]].forEach(([hw, dy]) => doc.line(x - hw, y + dy, x + hw, y + dy));
}

/** Surge arrester hanging from (x, y), earthed below unless `bare`. */
function spd(doc, x, y, bare) {
  pen(doc, INK, 0.3);
  doc.line(x, y, x, y + 1.2);
  doc.setFillColor(...WHITE);
  doc.rect(x - 1.2, y + 1.2, 2.4, 3.6, 'FD');
  doc.line(x, y + 1.7, x, y + 3.6);
  doc.setFillColor(...INK);
  doc.triangle(x - 0.6, y + 3.4, x + 0.6, y + 3.4, x, y + 4.3, 'F');
  if (bare) return;
  pen(doc, PE, 0.35);
  doc.line(x, y + 4.8, x, y + 5.4);
  earth(doc, x, y + 5.4);
}

function meter(doc, x, y, rgb, r = 4.2) {
  pen(doc, rgb, 0.4);
  doc.setFillColor(...WHITE);
  doc.circle(x, y, r, 'FD');
  text(doc, 'kWh', x, y + r * 0.19, { size: r * 1.3, style: 'bold', color: INK, align: 'center' });
}

function pvModule(doc, x, y) {
  pen(doc, INK, 0.25);
  doc.setFillColor(...WHITE);
  doc.rect(x, y - 1.5, 4.2, 3, 'FD');
  doc.line(x, y + 1.5, x + 4.2, y - 1.5);
}

/* ───────────── drawing ───────────── */

const SYM = {
  pv: (doc, p) => pvModule(doc, p.x, p.y),
  fuse: (doc, p) => device(doc, 'fuse', p.x, p.y, p.v, DC),
  isolator: (doc, p) => device(doc, 'isolator', p.x, p.y, p.v, DC),
  breaker: (doc, p) => device(doc, 'breaker', p.x, p.y, p.v, AC),
  spd: (doc, p) => spd(doc, p.x, p.y + 0.01),
  meter: (doc, p) => meter(doc, p.x, p.y, AC),
  earth: (doc, p) => earth(doc, p.x, p.y),
  inverter: (doc, p) => {
    pen(doc, INK, 0.3);
    doc.rect(p.x - 3.3, p.y - 3.3, 6.6, 6.6);
    doc.line(p.x - 3.3, p.y + 3.3, p.x + 3.3, p.y - 3.3);
    text(doc, '=', p.x - 1.7, p.y - 0.6, { size: 6, style: 'bold', color: DC, align: 'center' });
    text(doc, '~', p.x + 1.7, p.y + 2.6, { size: 6.5, style: 'bold', color: AC, align: 'center' });
  },
  tx: (doc, p) => {
    pen(doc, INK, 0.4);
    doc.circle(p.x - 1.9, p.y, 3.2);
    doc.circle(p.x + 1.9, p.y, 3.2);
  },
  grid: (doc, p) => {
    pen(doc, INK, 0.4);
    doc.line(p.x - 4, p.y + 3.5, p.x, p.y - 3.5);
    doc.line(p.x + 4, p.y + 3.5, p.x, p.y - 3.5);
    doc.line(p.x - 2.6, p.y + 1, p.x + 2.6, p.y + 1);
    doc.line(p.x - 1.4, p.y - 1.3, p.x + 1.4, p.y - 1.3);
  },
  la: (doc, p) => {
    doc.setFillColor(...INK);
    doc.triangle(p.x, p.y - 3.3, p.x - 1.3, p.y, p.x + 1.3, p.y, 'F');
  },
  battery: (doc, p) => {
    pen(doc, INK, 0.4);
    for (let k = -1; k <= 1; k += 2) {
      doc.line(p.x + k * 1.2 - 0.0, p.y - 2.4, p.x + k * 1.2, p.y + 2.4);
    }
    doc.line(p.x - 3.4, p.y, p.x - 1.2, p.y);
    doc.line(p.x + 1.2, p.y, p.x + 3.4, p.y);
    pen(doc, INK, 0.8);
    doc.line(p.x + 1.2, p.y - 1.2, p.x + 1.2, p.y + 1.2);
  },
};

/** Draw one laid-out sheet at (x0, y0). */
export function drawSldSheet(doc, sheet, x0, y0) {
  const { w, h } = sheet;
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(x0, y0, w, h, 'FD');
  const P = (x, y) => [x0 + x, y0 + y];
  // boxes first, wires over them, then symbols (which blank the wire under a switch), dots and text last
  for (const p of sheet.items.filter((q) => q.t === 'box')) {
    pen(doc, p.kind === 'met' ? PE : INK, p.kind === 'inverter' ? 0.4 : 0.35);
    doc.setFillColor(...WHITE);
    doc.rect(x0 + p.x, y0 + p.y, p.w, p.h, 'FD');
  }
  for (const p of sheet.items.filter((q) => q.t === 'wire')) {
    if (p.net === 'GUIDE') {
      pen(doc, MUTED, 0.2, [1.2, 1]);
      const [a, b] = p.pts;
      doc.line(...P(...a), ...P(...b));
      doc.setLineDashPattern([], 0);
      continue;
    }
    const rgb = COLORS[p.net] || INK;
    pen(doc, rgb, p.width || (p.net === 'PE' ? 0.3 : 0.4), p.net === 'PE' ? [0.9, 0.7] : []);
    for (let i = 1; i < p.pts.length; i++) doc.line(...P(...p.pts[i - 1]), ...P(...p.pts[i]));
    doc.setLineDashPattern([], 0);
  }
  for (const p of sheet.items.filter((q) => q.t === 'pe')) {
    wire(doc, PE, [P(p.x, p.y), P(p.x, p.y + 1.6)]);
    earth(doc, ...P(p.x, p.y + 1.6));
    text(doc, p.to, x0 + p.x + 2, y0 + p.y + 4.4, { size: 4.6, style: 'bold', color: PE });
  }
  for (const p of sheet.items.filter((q) => q.t === 'sym')) {
    const f = SYM[p.kind];
    if (f) f(doc, { ...p, x: x0 + p.x, y: y0 + p.y });
    if (p.kind === 'spd' && p.earth) text(doc, p.earth, x0 + p.x + 2, y0 + p.y + 8.4, { size: 4.6, style: 'bold', color: PE });
  }
  for (const p of sheet.items.filter((q) => q.t === 'arrow')) {
    doc.setFillColor(...(COLORS[p.net] || INK));
    const [x, y] = P(p.x, p.y);
    if (p.v) doc.triangle(x - 1.2, y, x + 1.2, y, x, y + 2, 'F');
    else doc.triangle(x, y - 1.2, x, y + 1.2, x + 2, y, 'F');
  }
  for (const p of sheet.items.filter((q) => q.t === 'dot')) dot(doc, COLORS[p.net] || INK, ...P(p.x, p.y));
  for (const p of sheet.items.filter((q) => q.t === 'text' && q.s)) {
    const color = COLORS[p.color] || (p.role === 'heading' ? MUTED : p.role === 'tag' ? INK : BODY);
    const s = p.maxW ? clip(doc, p.s, p.maxW, p.size, p.style) : p.s;
    text(doc, s, x0 + p.x, y0 + p.y, { size: p.size, style: p.style || 'normal', color, align: p.align });
  }
  drawLegend(doc, x0, y0 + h - 16, w);
  if (sheet.count > 1) text(doc, `Sheet ${sheet.index + 1} of ${sheet.count}: ${sheet.title}`, x0 + w - 3, y0 + 5.5, { size: 5.5, style: 'bold', color: MUTED, align: 'right' });
}

function drawLegend(doc, x0, yL, w) {
  pen(doc, LINE, 0.3);
  doc.line(x0, yL, x0 + w, yL);
  const items = [
    [(x, y) => pvModule(doc, x, y), 'PV module'],
    [(x, y) => device(doc, 'fuse', x, y, false, INK), 'Fuse'],
    [(x, y) => device(doc, 'isolator', x, y, false, INK), 'Isolator'],
    [(x, y) => device(doc, 'breaker', x, y, false, INK), 'Circuit breaker (MCB / MCCB)'],
    [(x, y) => spd(doc, x + 2, y - 2.4, true), 'Surge protection device'],
    [(x, y) => meter(doc, x + 2, y, INK, 2.2), 'Energy meter'],
    [(x, y) => earth(doc, x + 2, y - 1.6), 'Earth (bonded to MET)'],
    [(x, y) => wire(doc, DC, [[x, y], [x + 5, y]]), 'DC circuit'],
    [(x, y) => wire(doc, AC, [[x, y], [x + 5, y]]), 'AC circuit'],
    [(x, y) => wire(doc, PE, [[x, y], [x + 5, y]]), 'Earthing conductor'],
  ];
  items.forEach(([draw, name], i) => {
    const x = x0 + 5 + (i % 5) * 35;
    const y = yL + 5 + Math.floor(i / 5) * 5.6;
    draw(x, y);
    text(doc, name, x + 7, y + 0.9, { size: 5, color: BODY });
  });
}

/** The sheets for a system (`el` from designElectrical), each `w` × `h` mm. */
export function sldSheets(el, w, h, { stringId = null } = {}) {
  if (!el?.sld) return layoutSld({ metadata: { systemType: 'on-grid', totals: { strings: 0, dcKw: 0, inverters: 0, acKw: 0, acdbs: 0 } }, nodes: [], connections: [], validation: [] }, w, h).sheets;
  return layoutSld(stringId ? subDocument(el.sld, stringId) : el.sld, w, h).sheets;
}

/** Draw the first sheet in the box (x0, y0, w, h) — kept for callers that have room for one sheet only. */
export function drawSld(doc, el, spec, x0, y0, w, h) {
  const [first] = sldSheets(el, w, h);
  drawSldSheet(doc, first, x0, y0);
}

/**
 * One string's own diagram: the string, its protection, its MPPT and inverter, the AC path of that inverter to the
 * grid, and the earthing — the rest of the system left out.
 */
export function subDocument(doc, stringId) {
  const ix = indexDocument(doc);
  const start = `S:${stringId}`;
  if (!ix.node.get(start)) return doc;
  const keep = new Set([start]);
  const q = [start];
  while (q.length) {
    const id = q.shift();
    for (const c of ix.out(id)) if (c.kind !== 'EARTH' && !keep.has(c.to)) (keep.add(c.to), q.push(c.to));
  }
  const s = ix.node.get(start);
  keep.add(`ARRAY-${s.inverter}`);
  // the busbar's other strings are left out, so the busbar itself is not needed: the string runs on directly
  for (const n of doc.nodes) if (n.type === 'EARTH' || n.type === 'LIGHTNING_PROTECTION') keep.add(n.id);
  const nodes = doc.nodes.filter((n) => keep.has(n.id));
  const connections = doc.connections.filter((c) => keep.has(c.from) && keep.has(c.to));
  const inv = ix.node.get(`INV-${s.inverter}`);
  return {
    ...doc,
    nodes,
    connections,
    metadata: { ...doc.metadata, totals: { ...doc.metadata.totals, strings: 1, modules: s.ratings.modules, dcKw: s.ratings.powerW / 1000, inverters: 1, acKw: inv?.spec.kw ?? 0, acdbs: 1, dcdbs: 1 } },
  };
}

