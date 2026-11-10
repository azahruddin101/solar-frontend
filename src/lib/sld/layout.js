// SLD layout: places the nodes of an SLD document on A4-width sheets and routes every connection of the
// document orthogonally. It draws only what the document contains — a wire exists only for a connection — and
// never shrinks text to make things fit: a design that does not fit one sheet is spread over several
// (DC sheets per inverter group, then the AC sheet), with off-sheet references.
//
// Columns (left → right): PV strings | DCDB (fuses, MPPT busbars, isolators, SPDs) | inverters (one pin per
// MPPT) | ACDB (incomers, busbar, SPD, main) ; the building / grid interface and the earthing run along the bottom.
//
// Output primitives (mm, relative to the sheet's top-left): box, sym, text, wire, dot, arrow. The renderer only
// draws them; tests read them to check overlaps.

import { indexDocument } from './topology.js';

const HEADER = 13;
const LEGEND = 16;
const BAND = 47; // building / grid interface + earthing
const RH = 6.5; // string row pitch
const MPPT_MIN = 10.5; // an MPPT block is at least this tall (its DC SPD hangs below the MPPT line)
const MGAP = 2.5;
const BAND_TOP = 10; // inverter band: DCDB title above the first row
const BAND_BOT = 7;
const BAND_GAP = 5;

/** Columns across the 178 mm content width. */
const X = { pe: 1.6, tag: 3.4, pv: 13, info: 31, infoEnd: 60, dcdb: 62, dcdbW: 42, fuse: 64.5, bus: 74, iso: 79, spd: 93, inv: 111, invW: 25, acdb: 144, acdbW: 32 };
X.out = X.dcdb + X.dcdbW;
X.invR = X.inv + X.invW;
X.inc = X.acdb + 3; // incomer breaker
X.acBus = X.acdb + 17;
X.acSpd = X.acdb + 26;

/** Approximate width (mm) of `s` in Helvetica at `size` pt. */
export const textWidth = (s, size) => String(s).length * size * 0.19;

const fmtA = (a) => (a == null ? '?' : `${a} A`);

/** The DC bands (one per inverter, split by MPPT blocks when a sheet is too short). */
function dcModel(doc, ix) {
  const invs = doc.nodes.filter((n) => n.type === 'INVERTER').sort((a, b) => a.inverter - b.inverter);
  return invs.map((inv) => {
    const mppts = doc.nodes.filter((n) => n.type === 'MPPT' && n.inverter === inv.inverter).sort((a, b) => a.mppt - b.mppt);
    const blocks = mppts.map((m) => {
      const strings = doc.nodes.filter((n) => n.type === 'PV_STRING' && n.inverter === inv.inverter && n.mppt === m.mppt).sort((a, b) => a.string.index - b.string.index);
      const box = m.plan?.dcdb || null;
      const h = Math.max(strings.length * RH, box && m.plan?.spd ? MPPT_MIN : RH);
      return { mppt: m, strings, box, h };
    });
    return { inv, blocks, dcdbs: [...new Set(blocks.map((b) => b.box).filter(Boolean))], hasBox: blocks.some((b) => b.box) };
  });
}

const DCDB_GAP = 14; // between two DCDBs of one inverter: the first box's foot (ratings, PE) and the next one's title

/** The gap above block `i`: wider where a new DCDB starts. */
const gapBefore = (blocks, i) => (i === 0 ? 0 : blocks[i].box && blocks[i - 1].box && blocks[i].box !== blocks[i - 1].box ? DCDB_GAP : MGAP);

/** Height of a band holding these blocks. */
const bandHeight = (blocks) => BAND_TOP + blocks.reduce((a, b, i) => a + b.h + gapBefore(blocks, i), 0) + BAND_BOT + (blocks.some((b) => b.box) ? 6 : 0);

/**
 * Lay out `doc` on sheets of `w` × `h` mm. Returns { sheets: [{ kind, title, items }], mode }.
 * mode 'single': everything on one sheet; 'split': DC sheets + AC sheet.
 */
export function layoutSld(doc, w, h) {
  const ix = indexDocument(doc);
  const bands = dcModel(doc, ix);
  const type = doc.metadata.systemType;
  const dcTotal = bands.reduce((a, b) => a + bandHeight(b.blocks), 0) + BAND_GAP * Math.max(0, bands.length - 1);
  const singleRoom = h - HEADER - LEGEND - BAND;
  const nInv = bands.length;
  const acdbNeed = 34 + 7 * Math.max(0, nInv - 1);
  const single = type === 'on-grid' && doc.metadata.totals.acdbs === 1 && dcTotal <= singleRoom && acdbNeed <= singleRoom && w >= 170;

  if (!bands.length) {
    // nothing connectable: say why rather than draw an invalid diagram
    const err = (doc.validation || []).find((v) => v.level === 'error');
    const lines = err ? ['Single line diagram not drawn: the strings cannot be connected as designed.', err.message] : ['No modules placed - the single line diagram is drawn once the array is designed.'];
    return { mode: 'empty', sheets: [{ kind: 'empty', title: 'Single line diagram', w, h, items: lines.map((s2, i) => ({ t: 'text', x: w / 2, y: h / 2 + i * 5, s: s2, size: i ? 6 : 8, align: 'center', maxW: w - 10 })) }] };
  }

  const sheets = [];
  if (single) {
    const s = newSheet('full', 'Single line diagram', w, h, doc);
    const outs = placeDcBands(s, doc, ix, bands, HEADER, singleRoom, { acOnSheet: true });
    placeAc(s, doc, ix, outs, { top: HEADER, bottom: h - LEGEND - BAND, w, firstX: X.invR });
    placeInterface(s, doc, ix, h - LEGEND - BAND, w);
    sheets.push(s);
  } else {
    // DC sheets: whole inverter bands where they fit, MPPT blocks split over sheets when one band is too tall
    const room = h - HEADER - LEGEND;
    let page = [];
    let used = 0;
    const flush = () => {
      if (page.length) sheets.push({ pending: page });
      page = [];
      used = 0;
    };
    for (const b of bands) {
      const bh = bandHeight(b.blocks);
      if (bh <= room) {
        if (used + bh + (page.length ? BAND_GAP : 0) > room) flush();
        page.push({ ...b, cont: false });
        used += bh + (page.length > 1 ? BAND_GAP : 0);
        continue;
      }
      // one inverter taller than a sheet: its MPPT blocks over several sheets
      flush();
      let part = [];
      let first = true;
      for (const blk of b.blocks) {
        if (part.length && bandHeight([...part, blk]) > room) {
          sheets.push({ pending: [{ ...b, blocks: part, cont: !first }] });
          first = false;
          part = [];
        }
        part.push(blk);
      }
      if (part.length) sheets.push({ pending: [{ ...b, blocks: part, cont: !first }] });
    }
    flush();
    const nDc = sheets.length;
    const acSheets = acPages(doc, ix);
    sheets.forEach((p, i) => {
      const s = newSheet('dc', `DC side ${i + 1} of ${nDc}`, w, h, doc);
      placeDcBands(s, doc, ix, p.pending, HEADER, room, { acOnSheet: false, acRef: acSheets.length > 1 ? 'the AC sheets' : 'the AC sheet' });
      sheets[i] = s;
    });
    acSheets.forEach((group, i) => {
      const last = i === acSheets.length - 1;
      const s = newSheet('ac', acSheets.length > 1 ? `AC side ${i + 1} of ${acSheets.length}` : 'AC side', w, h, doc);
      placeAcSheet(s, doc, ix, group, { w, h, last, dcSheets: nDc });
      sheets.push(s);
    });
  }
  sheets.forEach((s, i) => {
    s.index = i;
    s.count = sheets.length;
  });
  return { mode: single ? 'single' : 'split', sheets };
}

function newSheet(kind, title, w, h, doc) {
  const items = [];
  const t = doc.metadata.totals;
  items.push({ t: 'text', x: X.tag, y: 5.5, s: kind === 'ac' ? 'INVERTERS' : 'PV ARRAY', size: 6, style: 'bold', role: 'heading' });
  if (kind !== 'ac') items.push({ t: 'text', x: X.dcdb, y: 5.5, s: 'DC PROTECTION (DCDB)', size: 6, style: 'bold', role: 'heading' });
  items.push({ t: 'text', x: kind === 'ac' ? 40 : X.inv + X.invW / 2, y: 5.5, s: kind === 'ac' ? '' : 'INVERTERS', size: 6, style: 'bold', align: 'center', role: 'heading' });
  if (kind !== 'dc') items.push({ t: 'text', x: kind === 'ac' ? 96 : X.acdb, y: 5.5, s: 'AC COLLECTION (ACDB)', size: 6, style: 'bold', role: 'heading' });
  items.push({ t: 'text', x: X.tag, y: 10, s: `${t.strings} strings · ${t.dcKw.toFixed(2)} kWp · ${t.inverters} × inverter · ${t.acKw} kW AC`, size: 5, role: 'heading' });
  return { kind, title, w, h, items };
}

/* ───────────── DC bands ───────────── */

/** Places the bands on a sheet from `top`; returns each inverter's AC output point { inv, y }. */
function placeDcBands(s, doc, ix, bands, top, room, { acOnSheet, acRef }) {
  const it = s.items;
  const total = bands.reduce((a, b) => a + bandHeight(b.blocks), 0) + BAND_GAP * (bands.length - 1);
  let y = top + Math.max(0, Math.min(8, (room - total) / 2));
  const outs = [];
  // the DC | AC boundary
  it.push({ t: 'wire', net: 'GUIDE', pts: [[X.invR + 3, top - 3], [X.invR + 3, top + room - 2]] });
  it.push({ t: 'text', x: X.invR + 1.5, y: top - 3.3, s: 'DC', size: 5, style: 'bold', color: 'DC', align: 'right' });
  it.push({ t: 'text', x: X.invR + 4.5, y: top - 3.3, s: 'AC', size: 5, style: 'bold', color: 'AC' });

  for (const band of bands) {
    const bTop = y;
    const bh = bandHeight(band.blocks);
    let ry = bTop + BAND_TOP + RH / 2;
    const pins = [];
    const rowsY = [];
    // DCDB enclosures (an inverter may have several): one box around the blocks of each
    band.blocks.forEach((blk, bi) => {
      ry += gapBefore(band.blocks, bi);
      blk.y0 = ry - RH / 2;
      blk.rows = blk.strings.map((st, i) => ry + i * RH);
      blk.lineY = blk.rows[0];
      rowsY.push(...blk.rows);
      ry += blk.h;
    });
    // the DCDBs of the blocks on this sheet (an inverter split over sheets has some of its boxes here)
    for (const box of [...new Set(band.blocks.map((b) => b.box).filter(Boolean))]) {
      const bl = band.blocks.filter((b) => b.box === box);
      const yt = bl[0].y0 - 6.5;
      const yb = bl[bl.length - 1].y0 + bl[bl.length - 1].h + 6;
      it.push({ t: 'box', id: box, x: X.dcdb, y: yt, w: X.dcdbW, h: yb - yt, kind: 'enclosure' });
      it.push({ t: 'text', x: X.dcdb + 1.8, y: yt + 3.6, s: box, size: 5.5, style: 'bold', role: 'tag' });
      const plan = bl[0].mppt.plan;
      const facts = [plan.fuses ? `F ${fmtA(plan.fuseA)} gPV` : null, plan.isoA ? `Q-DC ${fmtA(plan.isoA)}` : null, `${plan.dcClass ?? '?'} V DC`].filter(Boolean).join(' · ');
      it.push({ t: 'text', x: X.dcdb + 1.8, y: yb - 1.8, s: facts, size: 4.6, color: 'MUTED', maxW: X.dcdbW - 3 });
      it.push({ t: 'pe', x: X.dcdb + 1.5, y: yb, to: 'E1' });
    }

    // strings
    for (const blk of band.blocks) {
      const plan = blk.mppt.plan || {};
      blk.strings.forEach((st, i) => {
        const yy = blk.rows[i];
        const r = st.ratings;
        it.push({ t: 'text', x: X.tag, y: yy + 0.8, s: st.tag, size: 5.5, style: 'bold', maxW: X.pv - X.tag - 1.2, role: 'tag' });
        const icons = r.modules <= 3 ? r.modules : 3;
        for (let k = 0; k < icons; k++) it.push({ t: 'sym', kind: 'pv', x: X.pv + k * 5.2, y: yy });
        if (r.modules > 3) it.push({ t: 'text', x: X.pv + 3 * 5.2 + 0.4, y: yy + 0.6, s: '…', size: 6, style: 'bold' });
        it.push({ t: 'text', x: X.info, y: yy - 0.9, s: `${r.modules} × ${Math.round(r.powerW / r.modules)} W = ${(r.powerW / 1000).toFixed(2)} kWp`, size: 4.9, maxW: X.infoEnd - X.info });
        it.push({ t: 'text', x: X.info, y: yy + 2.5, s: `Voc ${r.voc.toFixed(0)} V (${r.vocMax.toFixed(0)} V cold) · Isc ${r.isc.toFixed(1)} A`, size: 4.3, color: 'MUTED', maxW: X.infoEnd - X.info });
        // the string's connection, as the document has it
        for (const c of ix.out(st.id)) {
          const to = ix.node.get(c.to);
          if (to.type === 'DC_FUSE') {
            it.push({ t: 'wire', net: 'DC', conn: c.id, pts: [[X.pv - 1, yy], [X.fuse, yy]] });
            it.push({ t: 'sym', kind: 'fuse', x: X.fuse, y: yy, id: to.id });
            for (const c2 of ix.out(to.id)) it.push({ t: 'wire', net: 'DC', conn: c2.id, pts: [[X.fuse + 4, yy], [X.bus, yy]] });
          } else if (to.type === 'DC_COMBINER') {
            it.push({ t: 'wire', net: 'DC', conn: c.id, pts: [[X.pv - 1, yy], [X.bus, yy]] });
          } else if (to.type === 'MPPT' && !blk.box) {
            // no DCDB: each string on its own inverter input
            it.push({ t: 'wire', net: 'DC', conn: c.id, pts: [[X.pv - 1, yy], [X.inv, yy]] });
            pins.push({ y: yy, label: i === 0 ? `MPPT${blk.mppt.mppt}` : '' });
          }
          // (a single string in a DCDB runs on to its isolator / MPPT: drawn with the block below)
        }
        if (blk.strings.length > 1 && blk.box) it.push({ t: 'dot', net: 'DC', x: X.bus, y: yy });
      });
      // the block's line from its busbar (or its single string) through the isolator to the MPPT pin
      if (blk.box) {
        const yl = blk.lineY;
        const bus = ix.node.get(`${blk.mppt.id}/BUS`);
        const iso = ix.node.get(`${blk.mppt.id}/Q-DC`);
        const spd = ix.node.get(`${blk.mppt.id}/SPD-DC`);
        const end = iso ? X.iso : X.inv;
        if (bus) {
          it.push({ t: 'wire', net: 'DC', conn: bus.id, bus: true, pts: [[X.bus, blk.rows[0]], [X.bus, blk.rows[blk.rows.length - 1]]], width: 0.8 });
          const c = ix.out(bus.id).find((k) => !k.tap);
          it.push({ t: 'wire', net: 'DC', conn: c?.id, pts: [[X.bus, yl], [end, yl]] });
        } else {
          // one string: its own wire (through its fuse, if it has one) on to the isolator or the MPPT
          const c = ix.out(blk.strings[0].id)[0];
          const fused = ix.node.get(c.to).type === 'DC_FUSE';
          const c2 = fused ? ix.out(c.to)[0] : c;
          it.push({ t: 'wire', net: 'DC', conn: c2.id, pts: [[fused ? X.fuse + 4 : X.pv - 1, yl], [end, yl]] });
        }
        if (iso) {
          it.push({ t: 'sym', kind: 'isolator', x: X.iso, y: yl, id: iso.id });
          const c = ix.out(iso.id).find((k) => !k.tap);
          it.push({ t: 'wire', net: 'DC', conn: c?.id, pts: [[X.iso + 4, yl], [X.inv, yl]] });
        }
        if (spd) {
          it.push({ t: 'dot', net: 'DC', x: X.spd, y: yl });
          it.push({ t: 'sym', kind: 'spd', x: X.spd, y: yl, id: spd.id, earth: 'E1' });
        }
        pins.push({ y: yl, label: `MPPT${blk.mppt.mppt}` });
      }
    }

    // the inverter
    const inv = band.inv;
    const yFirst = Math.min(...pins.map((p) => p.y));
    const yLast = Math.max(...pins.map((p) => p.y));
    const iTop = Math.min(yFirst - 8, bTop + 2);
    const iBot = Math.max(yLast + 5, iTop + 24);
    it.push({ t: 'box', id: inv.id, x: X.inv, y: iTop, w: X.invW, h: iBot - iTop, kind: 'inverter' });
    it.push({ t: 'text', x: X.inv + X.invW / 2, y: iTop + 4, s: band.cont ? `${inv.tag} (cont.)` : inv.tag, size: 6, style: 'bold', align: 'center', role: 'tag' });
    it.push({ t: 'text', x: X.inv + X.invW / 2, y: iBot - 2, s: `${inv.ratings.kw} kW ${inv.ratings.phases === 3 ? '3-ph' : '1-ph'}${inv.ratings.type !== 'grid' ? ` ${inv.ratings.type}` : ''}`, size: 4.8, align: 'center', maxW: X.invW - 1 });
    const symY = Math.max(iTop + 7, Math.min((iTop + iBot) / 2, iBot - 10));
    it.push({ t: 'sym', kind: 'inverter', x: X.inv + X.invW / 2 + 4, y: symY });
    for (const p of pins) if (p.label) it.push({ t: 'text', x: X.inv + 0.8, y: p.y - 0.8, s: p.label, size: 4, color: 'MUTED' });
    it.push({ t: 'pe', x: X.invR - 3, y: iBot, to: 'MET' });
    if (inv.integrated?.dcSwitch || inv.integrated?.dcSpd) it.push({ t: 'text', x: X.inv + X.invW / 2, y: iBot + 3.2, s: `built-in: ${[inv.integrated.dcSwitch && 'DC switch', inv.integrated.dcSpd && 'DC SPD'].filter(Boolean).join(', ')}`, size: 4, align: 'center', color: 'MUTED' });
    // array frames to E1
    it.push({ t: 'wire', net: 'PE', pts: [[X.pe, rowsY[0] - 2], [X.pe, rowsY[rowsY.length - 1] + 2.5]] });
    it.push({ t: 'sym', kind: 'earth', x: X.pe, y: rowsY[rowsY.length - 1] + 2.5, label: 'E1' });

    const yOut = (iTop + iBot) / 2 + 4;
    if (!acOnSheet && !band.cont) {
      it.push({ t: 'wire', net: 'AC', conn: `${inv.id}-ac-ref`, pts: [[X.invR, yOut], [X.invR + 9, yOut]] });
      it.push({ t: 'arrow', x: X.invR + 9, y: yOut, net: 'AC' });
      it.push({ t: 'text', x: X.invR + 11.5, y: yOut + 0.7, s: `to ${acRef || 'ACDB'}`, size: 4.6, color: 'MUTED' });
    }
    outs.push({ inv, y: yOut });
    y = bTop + bh + BAND_GAP;
  }
  return outs;
}

/* ───────────── AC side ───────────── */

/** One ACDB on the sheet: incomers at the inverters' output rows, busbar, SPD, outgoing breaker. Returns the outgoing point. */
function placeAcdb(s, doc, ix, acdbId, feeds, { x, top, bottom }) {
  const it = s.items;
  const acdb = ix.node.get(acdbId);
  const bus = x + 17;
  const spdX = x + 26;
  const ys = feeds.map((f) => f.y);
  const yTop = Math.min(...ys) - 8;
  const yLastIn = Math.max(...ys);
  const ySpd = yLastIn + 6;
  const yQ = ySpd + 8;
  const yBot = yQ + 9;
  it.push({ t: 'box', id: acdbId, x, y: yTop, w: X.acdbW, h: yBot - yTop, kind: 'enclosure' });
  it.push({ t: 'text', x: x + 1.8, y: yTop + 3.8, s: acdb.tag, size: 5.5, style: 'bold', role: 'tag' });
  it.push({ t: 'text', x: x + X.acdbW - 1.5, y: yTop + 3.8, s: `${acdb.ratings.phases === 3 ? '3-ph' : '1-ph'} ${acdb.ratings.acV} V`, size: 4.4, color: 'MUTED', align: 'right' });
  for (const f of feeds) {
    const q = ix.node.get(`Q${f.inv.inverter}`);
    const cIn = ix.into(q.id).find((c) => c.from === f.inv.id);
    it.push({ t: 'wire', net: 'AC', conn: cIn?.id, pts: [[f.fromX, f.y], [x + 3, f.y]] });
    it.push({ t: 'sym', kind: 'breaker', x: x + 3, y: f.y, id: q.id });
    const cOut = ix.out(q.id)[0];
    it.push({ t: 'wire', net: 'AC', conn: cOut?.id, pts: [[x + 7, f.y], [bus, f.y]] });
    it.push({ t: 'dot', net: 'AC', x: bus, y: f.y });
    it.push({ t: 'text', x: x + 2.2, y: f.y - 2.3, s: `${q.tag} ${fmtA(q.ratings.a)}`, size: 4.5, color: 'MUTED' });
  }
  it.push({ t: 'wire', net: 'AC', conn: `${acdbId}/bus`, bus: true, pts: [[bus, Math.min(...ys) - 1.5], [bus, yQ]], width: 0.8 });
  const spd = ix.node.get(`${acdbId}/SPD-AC`);
  if (spd) {
    it.push({ t: 'wire', net: 'AC', conn: ix.out(acdbId).find((c) => c.to === spd.id)?.id, pts: [[bus, ySpd], [spdX, ySpd]] });
    it.push({ t: 'dot', net: 'AC', x: bus, y: ySpd });
    it.push({ t: 'sym', kind: 'spd', x: spdX, y: ySpd, id: spd.id, earth: 'E2' });
  }
  const outC = ix.out(acdbId).find((c) => ix.node.get(c.to)?.type === 'AC_BREAKER');
  const out = ix.node.get(outC.to);
  it.push({ t: 'sym', kind: 'breaker', x: bus, y: yQ, v: true, id: out.id });
  it.push({ t: 'text', x: bus - 2.2, y: yQ + 3, s: `${out.tag} ${fmtA(out.ratings.a)}`, size: 4.6, color: 'MUTED', align: 'right' });
  it.push({ t: 'pe', x: x + 1.5, y: yBot, to: 'E2' });
  return { x: bus, y: yQ + 4, out, bottom: yBot };
}

/** The ACDB column of a single sheet, then down into the interface band. */
function placeAc(s, doc, ix, outs, { top, bottom }) {
  const it = s.items;
  const feeds = outs.map((o) => ({ inv: o.inv, y: o.y, fromX: X.invR }));
  // DC-side wires reach X.invR; the AC outputs leave from the inverter's right edge
  const acdbId = doc.nodes.find((n) => n.type === 'AC_COMBINER' && !n.busbar).id;
  const o = placeAcdb(s, doc, ix, acdbId, feeds, { x: X.acdb, top, bottom });
  s.acOut = o;
}

/** AC sheets: one per ACDB group (several ACDBs) — the last also carries the main combiner and the interface. */
function acPages(doc, ix) {
  const acdbs = doc.nodes.filter((n) => n.type === 'AC_COMBINER' && !n.busbar && n.id !== 'MACDB');
  return acdbs.map((a) => ({ acdb: a, invs: doc.nodes.filter((n) => n.type === 'INVERTER' && ix.out(n.id).some((c) => c.to === `Q${n.inverter}` && ix.out(`Q${n.inverter}`).some((c2) => c2.to === a.id))) }));
}

function placeAcSheet(s, doc, ix, group, { w, h, last, dcSheets }) {
  const it = s.items;
  const multi = doc.nodes.some((n) => n.id === 'MACDB');
  const bandTop = h - LEGEND - BAND;
  const invX = 40;
  const invW = 26;
  const pitch = 28; // box 20 mm + its PE stub and label
  const nInv = group.invs.length;
  const room = bandTop - HEADER - 6;
  const used = (nInv - 1) * pitch + 22;
  let y = HEADER + 6 + Math.max(0, (room - used - 30) / 2);
  const feeds = [];
  const hasBat = Boolean(ix.node.get('BAT'));
  const backup = ix.node.get('BACKUP');
  for (const inv of group.invs) {
    const top = y;
    const bot = y + 20;
    it.push({ t: 'box', id: inv.id, x: invX, y: top, w: invW, h: bot - top, kind: 'inverter' });
    it.push({ t: 'text', x: invX + invW / 2, y: top + 4, s: inv.tag, size: 6, style: 'bold', align: 'center', role: 'tag' });
    it.push({ t: 'text', x: invX + invW / 2, y: bot - 2, s: `${inv.ratings.kw} kW ${inv.ratings.phases === 3 ? '3-ph' : '1-ph'}${inv.ratings.type !== 'grid' ? ` ${inv.ratings.type}` : ''}`, size: 4.6, align: 'center', maxW: invW - 1 });
    it.push({ t: 'sym', kind: 'inverter', x: invX + invW / 2 + 4, y: top + 9.5 });
    // PV DC arriving from the DC sheets
    it.push({ t: 'wire', net: 'DC', conn: `${inv.id}-dc-ref`, pts: [[invX - 9, top + 5], [invX, top + 5]] });
    it.push({ t: 'text', x: invX - 10, y: top + 5.7, s: `PV DC (${dcSheets > 1 ? 'DC sheets' : 'DC sheet'})`, size: 4.4, color: 'MUTED', align: 'right' });
    it.push({ t: 'pe', x: invX + invW - 3, y: bot, to: 'MET' });
    feeds.push({ inv, y: top + 12, fromX: invX + invW });
    if (hasBat) inv._batY = top + 15;
    if (backup) inv._bkY = top + 7;
    y += pitch;
  }
  // battery (hybrid / off-grid): one DC bus to each inverter's battery port
  if (hasBat) {
    const bat = ix.node.get('BAT');
    const ysB = group.invs.map((i) => i._batY);
    const by = (Math.min(...ysB) + Math.max(...ysB)) / 2;
    it.push({ t: 'box', id: 'BAT', x: 3, y: by - 7, w: 17, h: 14, kind: 'equipment' });
    it.push({ t: 'sym', kind: 'battery', x: 11.5, y: by - 1 });
    it.push({ t: 'text', x: 11.5, y: by + 5, s: bat.ratings.kwh ? `${bat.ratings.kwh} kWh` : 'Battery', size: 4.6, align: 'center' });
    it.push({ t: 'wire', net: 'DC', conn: ix.out('BAT').find((c) => c.to === 'Q-BAT')?.id, pts: [[20, by], [22.5, by]] });
    it.push({ t: 'sym', kind: 'isolator', x: 22.5, y: by, id: 'Q-BAT' });
    const busX = 30;
    it.push({ t: 'wire', net: 'DC', conn: 'Q-BAT/out', pts: [[26.5, by], [busX, by]] });
    if (ysB.length > 1) it.push({ t: 'wire', net: 'DC', conn: 'Q-BAT/bus', bus: true, pts: [[busX, Math.min(...ysB, by)], [busX, Math.max(...ysB, by)]] });
    for (const inv of group.invs) {
      it.push({ t: 'wire', net: 'DC', conn: ix.into(inv.id).find((c) => c.port === 'battery')?.id, pts: [[busX, inv._batY], [invX, inv._batY]] });
      if (ysB.length > 1) it.push({ t: 'dot', net: 'DC', x: busX, y: inv._batY });
    }
    if (ysB.length > 1 || by !== ysB[0]) it.push({ t: 'dot', net: 'DC', x: busX, y: by });
    it.push({ t: 'pe', x: 4.5, y: by + 7, to: 'E1' });
  }
  // backup (EPS) outputs to the essential-loads board, above the ACDB column
  if (backup) {
    const bx = 76;
    const ys = group.invs.map((i) => i._bkY);
    for (const inv of group.invs) {
      const q = ix.node.get(`QB${inv.inverter}`);
      it.push({ t: 'wire', net: 'AC', conn: ix.into(q.id)[0]?.id, pts: [[invX + invW, inv._bkY], [bx - 8, inv._bkY]] });
      it.push({ t: 'sym', kind: 'breaker', x: bx - 8, y: inv._bkY, id: q.id });
      it.push({ t: 'wire', net: 'AC', conn: ix.out(q.id)[0]?.id, pts: [[bx - 4, inv._bkY], [bx, inv._bkY]] });
      if (ys.length > 1) it.push({ t: 'dot', net: 'AC', x: bx, y: inv._bkY });
    }
    const yE = HEADER + 1;
    it.push({ t: 'wire', net: 'AC', conn: 'backup/bus', pts: [[bx, Math.max(...ys)], [bx, yE + 5]] });
    it.push({ t: 'box', id: 'BACKUP', x: bx - 2, y: yE - 3, w: 18, h: 8, kind: 'equipment' });
    it.push({ t: 'text', x: bx + 7, y: yE + 1.6, s: 'EDB', size: 5, style: 'bold', align: 'center', role: 'tag' });
    it.push({ t: 'text', x: bx + 17, y: yE + 1.6, s: 'backup loads', size: 4.4, color: 'MUTED' });
  }
  // one ACDB: on the right, so its main comes down right of the meters; several: in the middle, the main combiner on the right
  const o = placeAcdb(s, doc, ix, group.acdb.id, feeds, { x: multi ? 100 : X.acdb, top: HEADER, bottom: bandTop });
  if (multi && !last) {
    it.push({ t: 'wire', net: 'AC', conn: `${group.acdb.id}-macdb`, pts: [[o.x, o.y], [o.x, o.bottom + 6]] });
    it.push({ t: 'arrow', x: o.x, y: o.bottom + 6, v: true, net: 'AC' });
    it.push({ t: 'text', x: o.x + 2, y: o.bottom + 7, s: 'to the main AC combiner (last AC sheet)', size: 4.6, color: 'MUTED' });
    return;
  }
  if (multi) {
    // the main combiner: one incomer per ACDB (the others from the earlier AC sheets)
    const mac = ix.node.get('MACDB');
    const acdbs = doc.nodes.filter((n) => n.type === 'AC_COMBINER' && !n.busbar && n.id !== 'MACDB');
    const mx = 140;
    const myTop = HEADER + 4;
    const pitchM = 7;
    const mh = 14 + acdbs.length * pitchM + 10;
    it.push({ t: 'box', id: 'MACDB', x: mx, y: myTop, w: 34, h: mh, kind: 'enclosure' });
    it.push({ t: 'text', x: mx + 1.8, y: myTop + 3.8, s: mac.tag, size: 5.5, style: 'bold', role: 'tag' });
    const busX = mx + 22;
    acdbs.forEach((a, i) => {
      const yy = myTop + 9 + i * pitchM;
      const qo = ix.node.get(`${a.id}/QO`);
      it.push({ t: 'text', x: mx + 1.8, y: yy - 1.4, s: `from ${a.tag} (${qo.tag} ${fmtA(qo.ratings.a)})`, size: 4.3, color: 'MUTED', maxW: busX - mx - 3 });
      if (a.id !== group.acdb.id) it.push({ t: 'wire', net: 'AC', conn: ix.out(qo.id).find((c) => c.to === 'MACDB')?.id, pts: [[mx, yy], [busX, yy]] });
      it.push({ t: 'dot', net: 'AC', x: busX, y: yy });
    });
    // this sheet's ACDB feeds the main combiner from the left
    const myY = myTop + 9 + acdbs.findIndex((a) => a.id === group.acdb.id) * pitchM;
    // round the ACDB box (its right side is at x + width) in the gap before the main combiner
    const gapX = 100 + X.acdbW + 4;
    it.push({ t: 'wire', net: 'AC', conn: `${group.acdb.id}-macdb`, pts: [[o.x, o.y], [o.x, o.bottom + 3], [gapX, o.bottom + 3], [gapX, myY], [mx, myY], [busX, myY]] });
    const yQ = myTop + 9 + acdbs.length * pitchM + 1;
    it.push({ t: 'wire', net: 'AC', conn: 'MACDB/bus', bus: true, pts: [[busX, myTop + 7.5], [busX, yQ]], width: 0.8 });
    const qm = ix.node.get('QM');
    it.push({ t: 'sym', kind: 'breaker', x: busX, y: yQ, v: true, id: 'QM' });
    it.push({ t: 'text', x: busX - 2.2, y: yQ + 3, s: `QM ${fmtA(qm.ratings.a)}`, size: 4.6, color: 'MUTED', align: 'right' });
    it.push({ t: 'pe', x: mx + 1.5, y: myTop + mh, to: 'E2' });
    s.acOut = { x: busX, y: yQ + 4 };
  } else s.acOut = o;
  placeInterface(s, doc, ix, bandTop, w);
}

/* ───────────── building / grid interface and earthing ───────────── */

function placeInterface(s, doc, ix, top, w) {
  const it = s.items;
  const yw = top + 14;
  it.push({ t: 'text', x: X.tag, y: top + 4, s: doc.metadata.systemType === 'off-grid' ? 'LOADS & EARTHING' : 'BUILDING & GRID INTERFACE · EARTHING', size: 6, style: 'bold', role: 'heading' });
  const from = s.acOut;
  const label = (x, a, b) => {
    it.push({ t: 'text', x, y: yw + 9.4, s: a, size: 5.1, style: 'bold', align: 'center', role: 'tag' });
    if (b) it.push({ t: 'text', x, y: yw + 12.4, s: b, size: 4.5, color: 'MUTED', align: 'center' });
  };
  const chain = [];
  if (ix.node.get('M1')) chain.push({ id: 'M1', x: 140, kind: 'meter', a: 'M1  Generation meter', b: meterText(ix.node.get('M1')) });
  if (ix.node.get('LT')) chain.push({ id: 'LT', x: 110, kind: 'panel', a: 'LT PANEL', b: '' });
  if (ix.node.get('LOADS')) chain.push({ id: 'LOADS', x: 110, kind: 'panel', a: 'LOAD DB', b: '' });
  if (ix.node.get('M2')) chain.push({ id: 'M2', x: ix.node.get('TX') ? 84 : 76, kind: 'meter', a: 'M2  Net meter', b: 'bi-directional, DISCOM' });
  if (ix.node.get('TX')) chain.push({ id: 'TX', x: 54, kind: 'tx', a: 'TX  Transformer', b: txText(ix.node.get('TX')) });
  if (ix.node.get('GRID')) chain.push({ id: 'GRID', x: 22, kind: 'grid', a: ix.node.get('GRID').label, b: `${ix.node.get('GRID').ratings.voltage} V, 50 Hz` });
  // the AC main comes down from the ACDB and runs left through the chain
  if (from && chain.length) {
    const first = chain[0];
    const firstC = ix.into(first.id).find((c) => c.kind === 'AC');
    it.push({ t: 'wire', net: 'AC', conn: firstC?.id, pts: [[from.x, from.y], [from.x, yw], [first.x + edge(first), yw]] });
  }
  chain.forEach((c, i) => {
    const n = ix.node.get(c.id);
    if (c.kind === 'meter') it.push({ t: 'sym', kind: 'meter', x: c.x, y: yw, id: c.id });
    if (c.kind === 'panel') {
      it.push({ t: 'box', id: c.id, x: c.x - 12, y: yw - 6, w: 24, h: 12, kind: 'equipment' });
      it.push({ t: 'text', x: c.x, y: yw - 0.8, s: c.id === 'LT' ? 'LT PANEL' : 'LOAD DB', size: 5.4, style: 'bold', align: 'center', role: 'tag' });
      it.push({ t: 'text', x: c.x, y: yw + 2.6, s: c.id === 'LT' ? 'main distribution' : 'loads', size: 4.5, color: 'MUTED', align: 'center' });
      it.push({ t: 'wire', net: 'AC', conn: `${c.id}-loads`, pts: [[c.x, yw + 6], [c.x, yw + 10]] });
      it.push({ t: 'arrow', x: c.x, y: yw + 10, v: true, net: 'AC' });
      it.push({ t: 'text', x: c.x + 2.5, y: yw + 11.6, s: 'building loads', size: 4.5 });
      it.push({ t: 'pe', x: c.x + 10, y: yw + 6, to: 'MET' });
    }
    if (c.kind === 'tx') it.push({ t: 'sym', kind: 'tx', x: c.x, y: yw, id: c.id });
    if (c.kind === 'grid') it.push({ t: 'sym', kind: 'grid', x: c.x, y: yw, id: c.id });
    if (c.kind !== 'panel') label(c.x, c.a, c.b);
    else if (c.b) label(c.x, c.a, c.b);
    const next = chain[i + 1];
    if (next) {
      const conn = ix.out(c.id).find((k) => k.to === next.id);
      it.push({ t: 'wire', net: 'AC', conn: conn?.id, pts: [[c.x - edge(c), yw], [next.x + edge(next), yw]] });
    }
    void n;
  });

  // earthing: electrodes on one bonded PE bus with the MET
  const yE = top + 37;
  const els = [['E1', 30, 'DC side'], ['E2', 62, 'AC side'], ['MET', 96, 'main earthing terminal']];
  if (ix.node.get('E3')) els.push(['E3', w - 8, 'lightning']);
  it.push({ t: 'wire', net: 'PE', conn: 'earth-bus', pts: [[els[0][1], yE], [els[els.length - 1][1], yE]] });
  for (const [id, x, what] of els) {
    if (id === 'MET') {
      it.push({ t: 'box', id: 'MET', x: x - 5, y: yE - 2, w: 10, h: 4, kind: 'met' });
      it.push({ t: 'text', x, y: yE + 0.8, s: 'MET', size: 4.5, style: 'bold', align: 'center', color: 'PE' });
      it.push({ t: 'text', x, y: yE + 5.5, s: what, size: 4.3, color: 'MUTED', align: 'center' });
    } else {
      it.push({ t: 'dot', net: 'PE', x, y: yE });
      it.push({ t: 'sym', kind: 'earth', x, y: yE, label: '' });
      const right = x > w - 30; // the last electrode: its label on the left, inside the sheet
      it.push({ t: 'text', x: right ? x - 2.3 : x + 2.3, y: yE + 4.2, s: `${id} ${what}`, size: 4.5, color: 'PE', style: 'bold', align: right ? 'right' : undefined });
    }
  }
  if (ix.node.get('LA')) {
    const la = w - 8;
    it.push({ t: 'sym', kind: 'la', x: la, y: top + 6, id: 'LA' });
    it.push({ t: 'wire', net: 'PE', conn: ix.out('LA')[0]?.id, pts: [[la, top + 9.3], [la, yE]] });
    it.push({ t: 'text', x: la - 2.4, y: top + 8.6, s: 'LA', size: 5, style: 'bold', align: 'right', role: 'tag' });
  }
  it.push({ t: 'text', x: 118, y: yE - 1.6, s: 'all PE terminals and electrodes bonded to the MET', size: 4.3, color: 'MUTED', maxW: (ix.node.get('E3') ? w - 12 : w - 2) - 118 });
}

const edge = (c) => (c.kind === 'meter' ? 4.2 : c.kind === 'panel' ? 12 : c.kind === 'tx' ? 5.2 : c.kind === 'grid' ? 5 : 0);
const meterText = (m) => `${m.ratings.phases === 3 ? '3-ph' : '1-ph'}, ${m.ratings.ct ? `CT ${m.ratings.ct}/5 A` : 'whole current'}`;
const txText = (t) => [t.ratings.kva && `${t.ratings.kva} kVA`, t.ratings.primaryV && t.ratings.secondaryV && `${t.ratings.primaryV}/${t.ratings.secondaryV} V`].filter(Boolean).join(', ') || 'rating to be confirmed';

/* ───────────── geometry checks (tests, and a safety net for the renderer) ───────────── */

/** Bounding box of a primitive (null for wires / dots). */
export function bbox(p) {
  if (p.t === 'box') return { x: p.x, y: p.y, w: p.w, h: p.h };
  if (p.t === 'text') {
    const tw = Math.min(textWidth(p.s, p.size), p.maxW ?? Infinity);
    const x = p.align === 'center' ? p.x - tw / 2 : p.align === 'right' ? p.x - tw : p.x;
    return { x, y: p.y - p.size * 0.3, w: tw, h: p.size * 0.36 };
  }
  if (p.t === 'sym') {
    const s = { pv: [0, -1.5, 4.2, 3], fuse: [0, -0.8, 4, 1.6], isolator: [0, -1.8, 4, 2.6], breaker: [0, -1.8, 4, 2.6], spd: [-1.2, 0, 2.4, 8.2], meter: [-4.2, -4.2, 8.4, 8.4], earth: [-1.5, 0, 3, 2.6], inverter: [-3.3, -3.3, 6.6, 6.6], tx: [-5.1, -3.2, 10.2, 6.4], grid: [-5, -4, 10, 8], la: [-1.3, -3.3, 2.6, 3.3], battery: [-4, -2.5, 8, 5] }[p.kind] || [0, 0, 0, 0];
    if (p.v && (p.kind === 'breaker' || p.kind === 'isolator' || p.kind === 'fuse')) return { x: p.x - 1.8, y: p.y, w: 2.6, h: 4 };
    return { x: p.x + s[0], y: p.y + s[1], w: s[2], h: s[3] };
  }
  return null;
}

const overlap = (a, b, pad = 0) => a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;

/** Problems in a laid-out sheet: overlapping boxes, overlapping labels, labels off the sheet, wires of different connections lying on each other. */
export function checkSheet(sheet) {
  const issues = [];
  const boxes = sheet.items.filter((p) => p.t === 'box');
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(bbox(boxes[i]), bbox(boxes[j]), 0.05)) issues.push(`boxes ${boxes[i].id} and ${boxes[j].id} overlap`);
  const texts = sheet.items.filter((p) => p.t === 'text' && p.s);
  for (let i = 0; i < texts.length; i++) {
    const a = bbox(texts[i]);
    if (a.x < -0.5 || a.x + a.w > sheet.w + 0.5 || a.y < 0 || a.y + a.h > sheet.h) issues.push(`label "${texts[i].s}" is off the sheet`);
    for (let j = i + 1; j < texts.length; j++) if (overlap(a, bbox(texts[j]), 0.15)) issues.push(`labels "${texts[i].s}" and "${texts[j].s}" overlap`);
  }
  // collinear overlap of wires from different connections (would read as a connection)
  const segs = [];
  for (const wv of sheet.items.filter((p) => p.t === 'wire' && p.net !== 'GUIDE')) for (let k = 1; k < wv.pts.length; k++) segs.push({ w: wv, a: wv.pts[k - 1], b: wv.pts[k] });
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const p = segs[i];
      const q = segs[j];
      if (p.w === q.w || (p.w.conn && p.w.conn === q.w.conn)) continue;
      const hz = (s) => Math.abs(s.a[1] - s.b[1]) < 1e-6;
      const vt = (s) => Math.abs(s.a[0] - s.b[0]) < 1e-6;
      let shared = 0;
      if (hz(p) && hz(q) && Math.abs(p.a[1] - q.a[1]) < 0.2) shared = Math.min(Math.max(p.a[0], p.b[0]), Math.max(q.a[0], q.b[0])) - Math.max(Math.min(p.a[0], p.b[0]), Math.min(q.a[0], q.b[0]));
      if (vt(p) && vt(q) && Math.abs(p.a[0] - q.a[0]) < 0.2) shared = Math.min(Math.max(p.a[1], p.b[1]), Math.max(q.a[1], q.b[1])) - Math.max(Math.min(p.a[1], p.b[1]), Math.min(q.a[1], q.b[1]));
      // touching end to end is a connection point; only a shared length is a problem, and buses are meant to be shared
      if (shared > 0.3 && !p.w.bus && !q.w.bus) issues.push(`wires ${p.w.conn || '?'} and ${q.w.conn || '?'} overlap for ${shared.toFixed(1)} mm`);
    }
  }
  return issues;
}
