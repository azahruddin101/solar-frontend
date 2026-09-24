'use client';

// Sheet E-03 of the proposal: a detailed single line diagram, drawn as vector graphics.
//   PV strings → DCDB (string fuses, isolator + SPD per MPPT) → inverters → ACDB (incomers,
//   busbar, SPD, main breaker) → generation meter → LT panel → net meter → DISCOM grid,
//   with earthing (E1 DC, E2 AC, E3 lightning arrestor), cable tags and a symbol legend.
// Ratings follow the usual rules of thumb (string fuse 1.56 x Isc, DC isolator 1.25 x Isc per
// MPPT, AC breakers 1.25 x inverter current); `sldSchedule` lists every tagged item in full.

const INK = [15, 23, 42];
const BODY = [51, 65, 85];
const MUTED = [100, 116, 139];
const LINE = [226, 232, 240];
const WHITE = [255, 255, 255];
const DC = [220, 38, 38];
const AC = [37, 99, 235];
const PE = [22, 163, 74];

const FUSES = [6, 8, 10, 12, 15, 16, 20, 25, 30, 32, 40, 50, 63];
const BREAKERS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800, 1000, 1250, 1600];
const CTS = [150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000];
// indicative current-carrying capacity (A) of copper cables, derated for rooftop runs
const DC_CABLES = [[4, 30], [6, 40], [10, 55], [16, 75], [25, 100], [35, 125], [50, 150]];
const AC_CABLES = [[2.5, 24], [4, 32], [6, 41], [10, 57], [16, 76], [25, 101], [35, 125], [50, 151], [70, 192], [95, 232], [120, 269], [150, 309], [185, 353], [240, 415], [300, 470]];

const pick = (list, a) => list.find((v) => v >= a) ?? list[list.length - 1];
const cableFor = (list, a) => (list.find(([, amp]) => amp >= a) ?? list[list.length - 1])[0];
const range = (prefix, a, b) => (a === b ? `${prefix}${a}` : `${prefix}${a}-${prefix}${b}`);

/* ───────────── ratings ───────────── */

/** Strings grouped per inverter and MPPT, with protection and cable ratings. */
export function sldPlan(el) {
  const inv = el.inverter;
  const single = inv.kw <= 6;
  const groups = Array.from({ length: el.inverterCount }, (_, g) => {
    const strings = el.strings.filter((s) => s.inverter === g + 1);
    const m = Math.min(strings.length, inv.mppt);
    const mppts = Array.from({ length: m }, () => []);
    strings.forEach((s, j) => mppts[Math.floor((j * m) / strings.length)].push(s));
    return { no: g + 1, strings, mppts };
  });
  const isc = Math.max(...el.strings.map((s) => s.isc));
  const vocCold = Math.max(...el.strings.map((s) => s.vocCold));
  const perMppt = Math.max(1, ...groups.flatMap((g) => g.mppts.map((m) => m.length)));
  const iDc = 1.25 * isc * perMppt;
  const iAc = (inv.kw * 1000) / (single ? 230 : Math.sqrt(3) * 415);
  const incomer = pick(BREAKERS, 1.25 * iAc);
  const main = pick(BREAKERS, 1.25 * iAc * el.inverterCount);
  return {
    inv,
    single,
    groups,
    isc,
    voc: Math.max(...el.strings.map((s) => s.voc)),
    vocCold,
    dcClass: vocCold <= 1000 ? 1000 : 1500,
    fuse: pick(FUSES, 1.56 * isc),
    dcIso: pick(BREAKERS.filter((v) => v >= 16), iDc),
    dcCable: cableFor(DC_CABLES, iDc),
    mppts: groups.reduce((a, g) => a + g.mppts.length, 0),
    iAc,
    incomer,
    main,
    ct: main > 100 ? pick(CTS, main) : 0,
    acCable: cableFor(AC_CABLES, incomer),
    mainCable: cableFor(AC_CABLES, main),
    cores: single ? '3C' : '4C',
    phase: single ? '1-ph, 230 V' : '3-ph, 415 V',
  };
}

const breakerName = (p, a) => `${a <= 63 ? 'MCB' : 'MCCB'} ${a} A, ${p.single ? '2P' : '4P'}${a <= 63 ? ', C curve' : ''}, 10 kA`;

/** Equipment schedule for the tags on the diagram: [tag, item, specification, qty]. */
export function sldSchedule(el, spec, moduleName, moduleCount) {
  const p = sldPlan(el);
  const n = el.strings.length;
  const k = el.inverterCount;
  const bomQty = (name, fallback) => {
    const row = el.bom?.find((b) => String(b[0]).startsWith(name));
    return row ? `${row[2]} ${row[3]}` : fallback;
  };
  const lens = [...new Set(el.strings.map((s) => s.count))].sort((a, b) => a - b).join(' / ');
  const volt = `${p.dcClass} V DC`;
  const meter = `${p.single ? '1-ph' : '3-ph'}, ${p.ct ? `CT operated ${p.ct}/5 A` : 'whole current'}`;
  return [
    ['PV', 'Solar PV module', `${moduleName}, ${spec.watts} Wp, Voc ${spec.voc} V, Isc ${spec.isc} A`, `${moduleCount} nos`],
    [range('S', 1, n), 'PV strings', `${lens} modules in series, Voc ${p.voc.toFixed(0)} V (STC) / ${p.vocCold.toFixed(0)} V (cold)`, `${n} nos`],
    ['C1', 'DC string cable', '4 sq.mm Cu, solar grade (EN 50618), red (+) / black (-)', bomQty('DC cable', '-')],
    ['F', 'String fuse', `${p.fuse} A gPV, ${volt}, in + and - poles`, `${n * 2} nos`],
    ['Q-DC', 'DC isolator', `${p.dcIso} A, ${volt}, 2-pole, lockable, one per MPPT`, `${p.mppts} nos`],
    ['SPD-DC', 'DC surge protection', `Type II, Ucpv ${volt}, In 20 kA, one per MPPT`, `${p.mppts} nos`],
    [range('DCDB-', 1, k), 'DC distribution box', `IP65, ${n} in / ${p.mppts} out`, `${k} nos`],
    ['C2', 'DC cable, DCDB to inverter', `${p.dcCable} sq.mm Cu, solar grade`, `${p.mppts} pairs`],
    [range('INV-', 1, k), 'Grid-tie string inverter', `${p.inv.kw} kW, ${p.phase}, ${p.inv.mppt} MPPT, ${p.inv.maxVdc} V DC max, anti-islanding`, `${k} nos`],
    ['C3', 'AC cable, inverter to ACDB', `${p.cores} x ${p.acCable} sq.mm Cu, armoured`, `${k} ${k > 1 ? 'runs' : 'run'}`],
    [range('Q', 1, k), 'ACDB incomer', breakerName(p, p.incomer), `${k} nos`],
    ['SPD-AC', 'AC surge protection', `Type II, Uc 275 V AC, ${p.single ? '1+1' : '3+1'} configuration`, '1 nos'],
    ['QM', 'ACDB main outgoing', breakerName(p, p.main), '1 nos'],
    ['C4', 'AC cable, ACDB to LT panel', `${p.cores} x ${p.mainCable} sq.mm Cu, armoured`, '1 run'],
    ['M1', 'Solar generation meter', `${meter}, class 1.0`, '1 nos'],
    ['M2', 'Net meter', `Bi-directional, ${meter}, as approved by DISCOM`, '1 nos'],
    ['E1-E3', 'Earthing', 'E1 array frames + DC SPD, E2 inverter + AC SPD, E3 lightning arrestor', bomQty('Earthing', '3 sets')],
    ['LA', 'Lightning arrestor', 'ESE type, dedicated down conductor to E3', bomQty('Lightning', '1 nos')],
  ];
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

/**
 * The diagram inside the box (x0, y0, w, h) — laid out for the 178 mm content width of an A4 page.
 * Too many strings to draw are summarised per MPPT; too many inverters are summarised after the first.
 */
export function drawSld(doc, el, spec, x0, y0, w, h) {
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(x0, y0, w, h, 'FD');
  if (!el.strings?.length || !el.inverter) {
    text(doc, 'No modules placed - the single line diagram is drawn once the array is designed.', x0 + w / 2, y0 + h / 2, { size: 8, color: MUTED, align: 'center' });
    return;
  }
  const p = sldPlan(el);
  const X = { tag: x0 + 4, chain: x0 + 12, info: x0 + 36, dcdb: x0 + 64, inv: x0 + 110, acdb: x0 + w - 34 };
  const invW = 22;
  const xDiv = X.inv + invW / 2;
  const legendH = 15;
  const bandH = 42;
  const yT = y0 + 14;
  const yB = y0 + h - legendH - bandH - 2;

  // ── fit: largest row height that shows every string, else summarise, else drop inverters ──
  const GAP = 6;
  const MORE_H = 14;
  const maxPerMppt = Math.max(1, ...p.groups.flatMap((g) => g.mppts.map((m) => m.length)));
  const rowsOf = (g, k) => g.mppts.map((m) => (m.length <= k ? m.map((s) => ({ s })) : [...m.slice(0, k - 1).map((s) => ({ s })), { more: m.slice(k - 1) }]));
  const bandOf = (g, k, rh) => {
    const rows = rowsOf(g, k);
    const n = rows.reduce((a, m) => a + m.length, 0);
    const dcdbH = 6 + n * rh + Math.max(0, rows.length - 1) * 1.5 + 13;
    return { rows, dcdbH, h: Math.max(dcdbH, 26) };
  };
  const heightOf = (bands, hidden) => bands.reduce((a, b) => a + b.h, 0) + GAP * (bands.length - 1) + (hidden ? MORE_H + GAP : 0);
  let shown = p.groups;
  let fit;
  for (;;) {
    search: for (let k = maxPerMppt; k >= 1; k--) {
      for (const rh of [7, 6, 5, 4.2]) {
        const bands = shown.map((g) => bandOf(g, k, rh));
        if (heightOf(bands, shown.length < p.groups.length) <= yB - yT) {
          fit = { rh, bands };
          break search;
        }
      }
    }
    if (fit || shown.length === 1) break;
    shown = shown.slice(0, -1);
  }
  fit ??= { rh: 4.2, bands: shown.map((g) => bandOf(g, 1, 4.2)) };
  const hidden = p.groups.slice(shown.length);
  const { rh, bands } = fit;
  const spare = Math.max(0, yB - yT - heightOf(bands, hidden.length));
  const nBands = bands.length + (hidden.length ? 1 : 0);
  const slack = Math.min(spare / (nBands + 1), 10);

  // ── headings and the DC | AC boundary ──
  const heading = (str, x, align) => text(doc, str, x, y0 + 5.5, { size: 6, style: 'bold', color: MUTED, align });
  heading('PV ARRAY', X.tag);
  heading('DC COMBINER (DCDB)', X.dcdb);
  heading('INVERTER', xDiv, 'center');
  heading('AC COMBINER (ACDB)', X.acdb);
  text(doc, `${el.strings.length} strings, ${el.kwp.toFixed(2)} kWp`, X.tag, y0 + 9.5, { size: 5, color: MUTED });
  text(doc, 'DC SIDE', xDiv - 2, y0 + 9.5, { size: 5, style: 'bold', color: DC, align: 'right' });
  text(doc, 'AC SIDE', xDiv + 2, y0 + 9.5, { size: 5, style: 'bold', color: AC });
  pen(doc, MUTED, 0.2, [1.2, 1]);
  doc.line(xDiv, y0 + 7, xDiv, yB + 1);
  doc.setLineDashPattern([], 0);

  // ── PV strings, DCDB and inverter, one band per inverter ──
  const acIn = []; // AC outputs to the ACDB: { y, label, dashed }
  let cursor = yT + (spare - slack * (nBands - 1)) / 2; // centred in the free height
  shown.forEach((g, gi) => {
    const band = bands[gi];
    const top = cursor;
    cursor += band.h + GAP + slack;
    let yy = top + 6 + rh / 2;
    const mp = band.rows.map((rows) => {
      const ys = rows.map(() => {
        const y = yy;
        yy += rh;
        return y;
      });
      yy += 1.5;
      return { rows, ys, y: (ys[0] + ys[ys.length - 1]) / 2 };
    });
    const allY = mp.flatMap((m) => m.ys);
    const lastY = allY[allY.length - 1];
    const yc = mp.length ? (mp[0].y + mp[mp.length - 1].y) / 2 : top + band.h / 2;
    const xb = X.dcdb + 13; // MPPT busbars
    const xs = X.dcdb + 29; // SPD tap

    if (mp.length) {
      pen(doc, INK, 0.35);
      doc.setFillColor(...WHITE);
      doc.rect(X.dcdb, top, 36, band.dcdbH, 'FD');
      text(doc, `DCDB-${g.no}`, X.dcdb + 2, top + 4, { size: 5.5, style: 'bold', color: INK });
      text(doc, `F: ${p.fuse} A gPV`, X.dcdb + 2, lastY + rh / 2 + 6.5, { size: 4.8, color: MUTED });
      text(doc, `Q-DC: ${p.dcIso} A, ${p.dcClass} V`, X.dcdb + 2, lastY + rh / 2 + 9.8, { size: 4.8, color: MUTED });

      // array frames bonded to E1
      wire(doc, PE, [[x0 + 2.4, allY[0] - 1.5], [x0 + 2.4, lastY + 3]]);
      earth(doc, x0 + 2.4, lastY + 3);
      text(doc, 'E1', x0 + 4.4, lastY + 6, { size: 4.8, style: 'bold', color: PE });
    }

    mp.forEach((m, mi) => {
      m.rows.forEach((row, ri) => {
        const y = m.ys[ri];
        const s = row.s || row.more[0];
        const count = s.count;
        wire(doc, DC, [[X.chain - 1, y], [xb, y]], !!row.more);
        const slots = count <= 4 ? Array.from({ length: count }, (_, i) => i) : [0, 1, 3];
        slots.forEach((i) => pvModule(doc, X.chain + i * 5.4, y));
        if (count > 4) text(doc, '...', X.chain + 2 * 5.4 + 2.1, y + 0.4, { size: 6, style: 'bold', color: INK, align: 'center' });
        device(doc, 'fuse', X.dcdb + 4, y, false, DC);
        dot(doc, DC, xb, y);

        const tag = row.more ? `${row.more[0].name}-${row.more[row.more.length - 1].name}` : s.name;
        text(doc, tag, X.tag, y + 0.7, { size: row.more ? 4.5 : 5.5, style: 'bold', color: INK });
        const infoW = X.dcdb - X.info - 5;
        const line1 = row.more ? `${row.more.length} strings, not drawn` : `${count} x ${spec.watts} W = ${s.kwp.toFixed(2)} kWp`;
        const line2 = row.more ? `${[...new Set(row.more.map((q) => q.count))].join(' / ')} modules each` : `Voc ${s.voc.toFixed(0)} V, Isc ${s.isc} A`;
        text(doc, clip(doc, line1, infoW, 5), X.info, y - 0.9, { size: 5, color: BODY });
        if (rh >= 6) text(doc, clip(doc, line2, infoW, 4.6), X.info, y + 2.6, { size: 4.6, color: MUTED });
        if (gi === 0 && mi === 0 && ri === 0) text(doc, 'C1', X.dcdb - 1, y - 0.8, { size: 4.6, style: 'bold', color: MUTED, align: 'right' });
      });

      // busbar → isolator → inverter MPPT input
      if (m.ys.length > 1) wire(doc, DC, [[xb, m.ys[0]], [xb, m.ys[m.ys.length - 1]]]);
      wire(doc, DC, [[xb, m.y], [X.inv, m.y]]);
      device(doc, 'isolator', X.dcdb + 19, m.y, false, DC);
      if (gi === 0 && mi === 0) text(doc, 'C2', X.dcdb + 38.5, m.y - 0.8, { size: 4.6, style: 'bold', color: MUTED });
    });

    // one SPD drawn on the last MPPT (the schedule lists one per MPPT)
    if (mp.length) {
      const last = mp[mp.length - 1];
      const spdTop = Math.max(last.y, lastY) + 2;
      wire(doc, DC, [[xs, last.y], [xs, spdTop]]);
      dot(doc, DC, xs, last.y);
      spd(doc, xs, spdTop);
      text(doc, 'SPD', xs + 1.9, spdTop + 3.8, { size: 4.6, color: MUTED });
      text(doc, 'E1', xs + 2, spdTop + 8.4, { size: 4.8, style: 'bold', color: PE });
    }

    // inverter
    const iTop = Math.min(yc - 10, (mp[0]?.y ?? yc) - 4);
    const iBot = Math.max(yc + 10, (mp[mp.length - 1]?.y ?? yc) + 4);
    pen(doc, INK, 0.4);
    doc.setFillColor(...WHITE);
    doc.rect(X.inv, iTop, invW, iBot - iTop, 'FD');
    text(doc, `INV-${g.no}`, xDiv, iTop + 4.2, { size: 6, style: 'bold', color: INK, align: 'center' });
    const sy = (iTop + iBot) / 2 + 0.3;
    pen(doc, INK, 0.3);
    doc.rect(xDiv - 3.3, sy - 3.3, 6.6, 6.6);
    doc.line(xDiv - 3.3, sy + 3.3, xDiv + 3.3, sy - 3.3);
    text(doc, '=', xDiv - 1.7, sy - 0.6, { size: 6, style: 'bold', color: DC, align: 'center' });
    text(doc, '~', xDiv + 1.7, sy + 2.6, { size: 6.5, style: 'bold', color: AC, align: 'center' });
    text(doc, `${p.inv.kw} kW ${p.single ? '1-ph' : '3-ph'}`, xDiv, iBot - 2, { size: 5, color: BODY, align: 'center' });
    if (mp.length > 1) mp.forEach((m, mi) => text(doc, `MPPT${mi + 1}`, X.inv + 1, m.y - 0.7, { size: 4, color: MUTED }));
    const xe = X.inv + invW - 4;
    wire(doc, PE, [[xe, iBot], [xe, iBot + 1.4]]);
    earth(doc, xe, iBot + 1.4);
    text(doc, 'E2', xe + 2, iBot + 4.4, { size: 4.8, style: 'bold', color: PE });
    acIn.push({ y: yc, label: `Q${g.no}` });
  });

  if (hidden.length) {
    const top = cursor;
    const a = hidden[0].no;
    const b = hidden[hidden.length - 1].no;
    pen(doc, MUTED, 0.3, [1.2, 1]);
    doc.setFillColor(...WHITE);
    doc.rect(X.tag - 1, top, X.inv + invW - X.tag + 1, MORE_H - 2, 'FD');
    doc.setLineDashPattern([], 0);
    const nStr = hidden.reduce((acc, g) => acc + g.strings.length, 0);
    text(doc, `${a === b ? `INV-${a}` : `INV-${a} to INV-${b}`}: ${nStr} more strings, arranged as above (DCDB, fuses, isolators, SPD, earthing)`, X.tag + 2, top + (MORE_H - 2) / 2 + 0.8, { size: 5.5, color: BODY });
    acIn.push({ y: top + (MORE_H - 2) / 2, label: range('Q', a, b), dashed: true });
  }

  // ── ACDB: incomer per inverter → busbar → SPD, main breaker ──
  const xa = X.acdb;
  const aw = 30;
  const pitch = 8;
  const aH = 26 + (acIn.length - 1) * pitch;
  const aTop = Math.max(yT - 2, Math.min(acIn[0].y - 10, yB - aH));
  const yin = acIn.map((_, i) => aTop + 10 + i * pitch);
  const yLast = yin[yin.length - 1];
  const xbA = xa + 14;
  pen(doc, INK, 0.35);
  doc.setFillColor(...WHITE);
  doc.rect(xa, aTop, aw, aH, 'FD');
  text(doc, 'ACDB', xa + 2, aTop + 4.5, { size: 5.5, style: 'bold', color: INK });
  text(doc, p.phase, xa + aw - 2, aTop + 4.5, { size: 4.6, color: MUTED, align: 'right' });
  const step = Math.min(1.6, 8 / Math.max(1, acIn.length - 1));
  acIn.forEach((a, i) => {
    const xr = X.inv + invW + 3 + i * step;
    wire(doc, AC, [[X.inv + invW, a.y], [xr, a.y], [xr, yin[i]], [xbA, yin[i]]], a.dashed);
    device(doc, 'breaker', xa + 3, yin[i], false, AC);
    dot(doc, AC, xbA, yin[i]);
    text(doc, `${a.label} ${p.incomer} A`, xa + 2.2, yin[i] - 2.4, { size: 4.6, color: MUTED });
  });
  text(doc, 'C3', X.inv + invW + 0.6, acIn[0].y - 0.8, { size: 4.6, style: 'bold', color: MUTED });
  pen(doc, AC, 0.8);
  doc.line(xbA, yin[0] - 1.5, xbA, yLast + 7);
  const yS = yLast + 4;
  wire(doc, AC, [[xbA, yS], [xa + 23, yS]]);
  dot(doc, AC, xa + 23, yS);
  spd(doc, xa + 23, yS);
  text(doc, 'SPD', xa + 25, yS + 3.8, { size: 4.6, color: MUTED });
  text(doc, 'E2', xa + 25, yS + 8.4, { size: 4.8, style: 'bold', color: PE });
  device(doc, 'breaker', xbA, yLast + 7, true, AC);
  text(doc, `QM ${p.main} A`, xbA - 2.4, yLast + 10, { size: 4.6, color: MUTED, align: 'right' });

  // ── utility interface: generation meter → LT panel → net meter → grid ──
  const yb0 = yB + 2;
  const yw = yb0 + 15;
  text(doc, 'BUILDING & UTILITY INTERFACE', X.tag, yb0 + 4, { size: 6, style: 'bold', color: MUTED });
  wire(doc, AC, [[xbA, yLast + 11], [xbA, yw], [x0 + 33.4, yw]]);
  text(doc, 'C4', xbA - 1.5, (aTop + aH + yw) / 2 + 1, { size: 4.6, style: 'bold', color: MUTED, align: 'right' });
  const label = (x, a, b) => {
    text(doc, a, x, yw + 9.5, { size: 5.2, style: 'bold', color: INK, align: 'center' });
    text(doc, b, x, yw + 12.6, { size: 4.6, color: MUTED, align: 'center' });
  };
  const m1 = x0 + 140;
  const lt = x0 + 110;
  const m2 = x0 + 74;
  const tx = x0 + 30;
  meter(doc, m1, yw, AC);
  label(m1, 'M1  Generation meter', 'solar output');
  pen(doc, INK, 0.4);
  doc.setFillColor(...WHITE);
  doc.rect(lt - 12, yw - 6, 24, 12, 'FD');
  text(doc, 'LT PANEL', lt, yw - 0.8, { size: 5.5, style: 'bold', color: INK, align: 'center' });
  text(doc, 'main distribution', lt, yw + 2.6, { size: 4.6, color: MUTED, align: 'center' });
  wire(doc, AC, [[lt, yw + 6], [lt, yw + 11]]);
  doc.setFillColor(...AC);
  doc.triangle(lt - 1.2, yw + 11, lt + 1.2, yw + 11, lt, yw + 13, 'F');
  text(doc, 'Building loads', lt, yw + 16.5, { size: 5, color: BODY, align: 'center' });
  meter(doc, m2, yw, AC);
  label(m2, 'M2  Net meter', 'bi-directional, DISCOM');
  pen(doc, INK, 0.4);
  doc.circle(tx - 1.9, yw, 3.2);
  doc.circle(tx + 1.9, yw, 3.2);
  wire(doc, AC, [[tx - 5.1, yw], [x0 + 12, yw]]);
  label(tx, 'DISCOM LT grid', `${p.single ? '230 V 1-ph' : '415 V 3-ph'}, 50 Hz`);
  // lightning arrestor on its own earth pit
  const la = x0 + w - 6;
  doc.setFillColor(...INK);
  doc.triangle(la, yb0 + 4.5, la - 1.3, yb0 + 7.8, la + 1.3, yb0 + 7.8, 'F');
  wire(doc, PE, [[la, yb0 + 7.8], [la, yw + 8]]);
  earth(doc, la, yw + 8);
  text(doc, 'LA (ESE)', la - 2.2, yb0 + 7.4, { size: 5, style: 'bold', color: INK, align: 'right' });
  text(doc, 'E3', la - 2.2, yw + 10.6, { size: 4.8, style: 'bold', color: PE, align: 'right' });

  // ── legend ──
  const yL = y0 + h - legendH;
  pen(doc, LINE, 0.3);
  doc.line(x0, yL, x0 + w, yL);
  const items = [
    [(x, y) => pvModule(doc, x, y), 'PV module'],
    [(x, y) => device(doc, 'fuse', x, y, false, INK), 'Fuse'],
    [(x, y) => device(doc, 'isolator', x, y, false, INK), 'Isolator'],
    [(x, y) => device(doc, 'breaker', x, y, false, INK), 'Circuit breaker (MCB / MCCB)'],
    [(x, y) => spd(doc, x + 2, y - 2.4, true), 'Surge protection device'],
    [(x, y) => meter(doc, x + 2, y, INK, 2.2), 'Energy meter'],
    [(x, y) => earth(doc, x + 2, y - 1.6), 'Earth electrode'],
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
