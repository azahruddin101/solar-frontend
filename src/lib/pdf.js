'use client';

// Proposal PDF — every page is A4 portrait. Branded for the company (logo, colours, e-signature,
// QR code, terms) and addressed to its client:
//   1 cover · 2 summary & letter · 3 system details · 4–5 drawings · 6 electrical & structure ·
//   7 bill of materials · 8 energy & financials · 9 price & acceptance

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { loadBranding } from './branding.js';
import { drawCover } from './pdfCover.js';
import { formatMoney, formatNumber } from './energy.js';
import { compassLabel } from './geo.js';
import { rectPoly } from './geometry.js';
import { ridgeSegment } from './model.js';
import { drawRichText, richTextIsEmpty } from './pdfRichText.js';
import { MONTHS } from './sun.js';

// A4 portrait, millimetres
const W = 210;
const H = 297;
const M = 16; // side margin
const CW = W - 2 * M; // content width
const TOP = 30; // first content line on inner pages
const BOTTOM = H - 20; // content must end above the footer

const INK = [15, 23, 42];
const BODY = [51, 65, 85];
const MUTED = [100, 116, 139];
const LINE = [226, 232, 240];
const SOFT = [248, 250, 252];
const WHITE = [255, 255, 255];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Mix `rgb` towards white: 0 = the colour, 1 = white. */
const tint = (rgb, t) => rgb.map((c) => Math.round(c + (255 - c) * t));

/* ───────────── primitives ───────────── */

function text(doc, str, x, y, { size = 9, style = 'normal', color = BODY, align, maxWidth, lineHeight } = {}) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  if (lineHeight) doc.setLineHeightFactor(lineHeight);
  doc.text(str, x, y, { align, maxWidth });
  if (lineHeight) doc.setLineHeightFactor(1.15);
}

/** First line of `str` that fits `width` at the given size (adds … when cut). */
function clip(doc, str, width, size, style = 'normal') {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(String(str ?? ''), width);
  return lines.length > 1 ? `${lines[0].replace(/[\s,.;:-]+$/, '')}...` : lines[0] || '';
}

function wrap(doc, str, width, size, style = 'normal') {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  return doc.splitTextToSize(String(str ?? ''), width);
}

function poly(doc, pts, style) {
  doc.lines(pts.slice(1).map((p, i) => [p.x - pts[i].x, p.y - pts[i].y]), pts[0].x, pts[0].y, [1, 1], style, true);
}

/** Draw `img` inside the box (x, y, w, h), keeping its aspect ratio. `align`: left | center | right. */
function placeImage(doc, img, x, y, w, h, align = 'left') {
  const s = Math.min(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  const ix = align === 'right' ? x + w - iw : align === 'center' ? x + (w - iw) / 2 : x;
  doc.addImage(img.data, 'PNG', ix, y + (h - ih) / 2, iw, ih, undefined, 'FAST');
}

/** Company logo, or the company name in the brand colour when there is no logo. */
function logoOrName(doc, r, x, y, w, h, size = 13) {
  if (r.brand.logo) placeImage(doc, r.brand.logo, x, y, w, h);
  else text(doc, clip(doc, r.company.name, w + 30, size, 'bold'), x, y + h / 2 + size * 0.12, { size, style: 'bold', color: r.brand.primary });
}

/* ───────────── page furniture ───────────── */

/** Inner-page header: logo left, document title + proposal reference right, hairline below. */
function pageHeader(doc, r, title) {
  logoOrName(doc, r, M, 9, 44, 11, 11);
  text(doc, title.toUpperCase(), W - M, 13.5, { size: 8.5, style: 'bold', color: INK, align: 'right' });
  text(doc, clip(doc, `${r.ref}  |  ${r.client.name || r.title}`, 110, 7.5), W - M, 18, { size: 7.5, color: MUTED, align: 'right' });
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, 23.5, W - M, 23.5);
  doc.setFillColor(...r.brand.primary);
  doc.rect(M, 23.1, 18, 0.9, 'F');
}

function newPage(doc, r, title) {
  doc.addPage('a4', 'portrait');
  pageHeader(doc, r, title);
  r.pageTitle = title;
  return TOP + 4;
}

/** Footer on every page except the cover: contact line, page numbers. */
function footers(doc, r) {
  const pages = doc.getNumberOfPages();
  const contact = [r.company.name, r.company.phone, r.company.email, r.company.website].filter(Boolean).join('   |   ');
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M, H - 14, W - M, H - 14);
    text(doc, clip(doc, contact, CW - 30, 7.5), M, H - 9, { size: 7.5, color: MUTED });
    text(doc, `${i} / ${pages}`, W - M, H - 9, { size: 7.5, style: 'bold', color: INK, align: 'right' });
  }
}

/** Numbered section heading: "01  SYSTEM OVERVIEW ————". Returns the y for the content below. */
function section(doc, r, title, y) {
  r.sectionNo = (r.sectionNo || 0) + 1;
  const no = String(r.sectionNo).padStart(2, '0');
  text(doc, no, M, y, { size: 9, style: 'bold', color: r.brand.primary });
  text(doc, title.toUpperCase(), M + 7, y, { size: 9, style: 'bold', color: INK });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const tw = doc.getTextWidth(title.toUpperCase());
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M + 7 + tw + 4, y - 1.1, W - M, y - 1.1);
  return y + 6.5;
}

/** Make room for `need` mm; starts a continuation page when it does not fit. */
function ensure(doc, r, y, need) {
  return y + need > BOTTOM ? newPage(doc, r, r.pageTitle) : y;
}

function tableStyle(doc, r) {
  const drawn = new Set([doc.getNumberOfPages()]);
  return {
    theme: 'plain',
    margin: { left: M, right: M, top: TOP + 4, bottom: H - BOTTOM },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 2.3, bottom: 2.3, left: 3, right: 3 }, textColor: BODY, lineColor: LINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: r.brand.primary, textColor: r.brand.primaryFg, fontStyle: 'bold', fontSize: 8, lineWidth: 0 },
    alternateRowStyles: { fillColor: SOFT },
    // long tables continue on a new page: give that page the same header
    didDrawPage: () => {
      const n = doc.getNumberOfPages();
      if (!drawn.has(n)) {
        drawn.add(n);
        pageHeader(doc, r, r.pageTitle);
      }
    },
  };
}

/** Right-align these column indexes — body and header. */
const numeric = (...cols) => ({
  columnStyles: Object.fromEntries(cols.map((c) => [c, { halign: 'right' }])),
  didParseCell: (d) => {
    if (d.section === 'head' && cols.includes(d.column.index)) d.cell.styles.halign = 'right';
  },
});

/** Stat tiles with a brand-coloured top edge. `items` = [[label, value, sub?]]. */
function statTiles(doc, r, items, y, { cols = 4, h = 21 } = {}) {
  const gap = 4;
  const w = (CW - gap * (cols - 1)) / cols;
  items.forEach(([label, value, sub], i) => {
    const x = M + (i % cols) * (w + gap);
    const yy = y + Math.floor(i / cols) * (h + gap);
    doc.setFillColor(...SOFT);
    doc.rect(x, yy, w, h, 'F');
    doc.setFillColor(...r.brand.primary);
    doc.rect(x, yy, w, 0.9, 'F');
    text(doc, label.toUpperCase(), x + 4, yy + 6.5, { size: 6.5, style: 'bold', color: MUTED });
    text(doc, clip(doc, value, w - 7, 12, 'bold'), x + 4, yy + 13.5, { size: 12, style: 'bold', color: INK });
    if (sub) text(doc, clip(doc, sub, w - 7, 7), x + 4, yy + 18, { size: 7, color: MUTED });
  });
  return y + Math.ceil(items.length / cols) * (h + gap) - gap;
}

/** Label / value rows in two columns (spec sheet). */
function specGrid(doc, rows, y) {
  const colW = (CW - 8) / 2;
  const rowH = 7.2;
  rows.forEach(([label, value], i) => {
    const x = M + (i % 2) * (colW + 8);
    const yy = y + Math.floor(i / 2) * rowH;
    text(doc, label, x, yy + 4.6, { size: 8.5, color: MUTED });
    const labelW = doc.getTextWidth(label);
    text(doc, clip(doc, value, colW - labelW - 5, 8.5, 'bold'), x + colW, yy + 4.6, { size: 8.5, style: 'bold', color: INK, align: 'right' });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(x, yy + rowH, x + colW, yy + rowH);
  });
  return y + Math.ceil(rows.length / 2) * rowH;
}

/* ───────────── drawings ───────────── */

function fit(bb, x, y, w, h, pad = 0.1) {
  const scale = Math.min(w / ((bb.maxX - bb.minX) * (1 + 2 * pad) || 1), h / ((bb.maxY - bb.minY) * (1 + 2 * pad) || 1));
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  return { scale, map: (p) => ({ x: x + w / 2 + (p.x - cx) * scale, y: y + h / 2 - (p.y - cy) * scale }) };
}

function drawLayout(doc, r, design, x, y, w, h, colorStrings) {
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h, 'FD');
  const pts = [...design.sections.flatMap((s) => s.poly), ...design.tables.flatMap((t) => t.poly)];
  const bb = { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) };
  const { map, scale } = fit(bb, x + 6, y + 14, w - 12, h - 28);
  const { stringOf, strings } = design.electrical;

  for (const s of design.sections) {
    doc.setFillColor(...SOFT);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    poly(doc, s.poly.map(map), 'FD');
    const ridge = ridgeSegment(s);
    if (ridge) {
      const [ra, rb] = ridge.map(map);
      doc.setLineWidth(0.35);
      doc.setLineDashPattern([2, 1.2], 0);
      doc.line(ra.x, ra.y, rb.x, rb.y);
      doc.setLineDashPattern([], 0);
      text(doc, 'ridge', (ra.x + rb.x) / 2, (ra.y + rb.y) / 2 - 1.2, { size: 6.5, color: MUTED, align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BODY);
    s.poly.forEach((a, i) => {
      const c = s.poly[(i + 1) % s.poly.length];
      const l = Math.hypot(c.x - a.x, c.y - a.y);
      if (l * scale < 14) return;
      // dimension label just outside the edge, rotated along it
      const m = map({ x: (a.x + c.x) / 2 + ((c.y - a.y) / l) * (4 / scale), y: (a.y + c.y) / 2 - ((c.x - a.x) / l) * (4 / scale) });
      let deg = (Math.atan2(c.y - a.y, c.x - a.x) * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      const label = `${l.toFixed(2)} m`;
      const rad = (deg * Math.PI) / 180;
      const half = doc.getTextWidth(label) / 2;
      doc.text(label, m.x - Math.cos(rad) * half + Math.sin(rad) * 0.9, m.y + Math.sin(rad) * half + Math.cos(rad) * 0.9, { angle: deg });
    });
  }
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1, 1], 0);
  doc.setDrawColor(...MUTED);
  for (const bl of design.blocks) {
    doc.setFillColor(...LINE);
    poly(doc, rectPoly(bl.x, bl.y, bl.w, bl.d, bl.rot || 0).map(map), 'FD');
  }
  for (const t of design.trees) {
    const c = map(t);
    doc.setFillColor(220, 252, 231);
    doc.circle(c.x, c.y, t.r * scale, 'FD');
  }
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(0.15);
  for (const t of design.tables) {
    if (!t.valid) continue;
    for (const m of t.modules) {
      const s = stringOf.get(m.id);
      doc.setFillColor(...(colorStrings && s != null ? hex(strings[s].color) : r.brand.primary));
      poly(doc, m.corners.map(map), 'FD');
    }
  }

  // north arrow
  const nx = x + w - 9;
  doc.setFillColor(...INK);
  doc.triangle(nx, y + 5, nx + 2.4, y + 12, nx - 2.4, y + 12, 'F');
  text(doc, 'N', nx, y + 16.5, { size: 8, style: 'bold', color: INK, align: 'center' });
  // scale bar
  const len = [1, 2, 5, 10, 20, 50].reduce((best, o) => (Math.abs(o * scale - 30) < Math.abs(best * scale - 30) ? o : best), 1);
  doc.setFillColor(...INK);
  doc.rect(x + 5, y + h - 6, len * scale, 1, 'F');
  text(doc, `${len} m   (scale 1:${Math.round(1000 / scale)})`, x + 5, y + h - 8, { size: 7, color: MUTED });
  // legend
  if (colorStrings) {
    strings.slice(0, 16).forEach((s, i) => {
      const lx = x + 5 + (i % 8) * 20;
      const ly = y + 5 + Math.floor(i / 8) * 5;
      doc.setFillColor(...hex(s.color));
      doc.rect(lx, ly, 3, 3, 'F');
      text(doc, `${s.name} (${s.count})`, lx + 4.2, ly + 2.5, { size: 7, color: BODY });
    });
  } else {
    doc.setFillColor(...r.brand.primary);
    doc.rect(x + 5, y + 5, 3, 3, 'F');
    text(doc, `PV module (${design.totals.count})`, x + 9.2, y + 7.5, { size: 7, color: BODY });
  }
}

/** Engineering title block under a drawing. */
function titleBlock(doc, r, sheet, title, y) {
  const h = 19;
  const cols = [M, M + CW * 0.42, M + CW * 0.66, M + CW * 0.84, M + CW];
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.35);
  doc.rect(M, y, CW, h);
  cols.slice(1, -1).forEach((cx) => doc.line(cx, y, cx, y + h));
  const cell = (i, label, lines, big) => {
    text(doc, label.toUpperCase(), cols[i] + 3, y + 5, { size: 6, style: 'bold', color: MUTED });
    lines.filter(Boolean).slice(0, 2).forEach((l, n) => text(doc, clip(doc, l, cols[i + 1] - cols[i] - 6, big ? 10.5 : 8, n === 0 ? 'bold' : 'normal'), cols[i] + 3, y + 10.5 + n * 4.2, { size: big && n === 0 ? 10.5 : 8, style: n === 0 ? 'bold' : 'normal', color: n === 0 ? INK : BODY }));
  };
  cell(0, 'Project', [r.title, r.address]);
  cell(1, 'Drawing', [title, r.company.name], true);
  cell(2, 'System', [`${r.totals.kwp.toFixed(2)} kWp`, `${r.totals.count} modules`]);
  cell(3, 'Sheet', [sheet, r.dateShort]);
  return y + h;
}

function drawSld(doc, r, el, y) {
  const boxes = [['PV ARRAY', `${el.strings.length} strings`, `${el.kwp.toFixed(2)} kWp`], ['DCDB', 'Fuse + SPD', ''], ['INVERTER', `${el.inverterCount} x ${el.inverter.kw} kW`, ''], ['ACDB', 'MCB + SPD', ''], ['NET METER', 'Bi-directional', ''], ['GRID', 'LT panel', '']];
  const gap = 5.6;
  const bw = (CW - gap * (boxes.length - 1)) / boxes.length;
  const bh = 17;
  boxes.forEach((bx, i) => {
    const x = M + i * (bw + gap);
    doc.setFillColor(...(i === 2 ? tint(r.brand.primary, 0.9) : SOFT));
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.35);
    doc.rect(x, y, bw, bh, 'FD');
    text(doc, bx[0], x + bw / 2, y + 6, { size: 7, style: 'bold', color: INK, align: 'center' });
    text(doc, bx[1], x + bw / 2, y + 10.5, { size: 6.5, color: MUTED, align: 'center' });
    text(doc, bx[2], x + bw / 2, y + 14, { size: 6.5, color: MUTED, align: 'center' });
    if (i < boxes.length - 1) {
      doc.setDrawColor(...(i < 2 ? [220, 38, 38] : [37, 99, 235]));
      doc.setLineWidth(0.5);
      doc.line(x + bw, y + bh / 2, x + bw + gap, y + bh / 2);
    }
  });
  doc.setFillColor(220, 38, 38);
  doc.rect(M, y + bh + 3.2, 5, 0.6, 'F');
  text(doc, 'DC', M + 6.5, y + bh + 4.4, { size: 6.5, color: MUTED });
  doc.setFillColor(37, 99, 235);
  doc.rect(M + 14, y + bh + 3.2, 5, 0.6, 'F');
  text(doc, 'AC', M + 20.5, y + bh + 4.4, { size: 6.5, color: MUTED });
  return y + bh + 8;
}

/* ───────────── charts ───────────── */

/** A round axis maximum just above `v` (1, 2, 4, 5, 8 × 10ⁿ — all divide into four clean ticks). */
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return [1, 2, 4, 5, 8, 10].map((m) => m * p).find((m) => m >= v);
}

function chartFrame(doc, x, y, w, h, min, max, ticks, fmt) {
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const gy = y + h - ((v - min) / (max - min)) * h;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(x, gy, x + w, gy);
    text(doc, fmt(v), x - 2, gy + 1, { size: 6.5, color: MUTED, align: 'right' });
  }
}

function monthlyChart(doc, r, monthly, y) {
  const x = M + 14;
  const w = CW - 14;
  const h = 42;
  const max = niceMax(Math.max(...monthly));
  chartFrame(doc, x, y, w, h, 0, max, 4, (v) => formatNumber(v));
  const bw = w / 12;
  monthly.forEach((v, i) => {
    const bh = (v / max) * h;
    doc.setFillColor(...r.brand.accent);
    doc.rect(x + i * bw + bw * 0.2, y + h - bh, bw * 0.6, bh, 'F');
    text(doc, formatNumber(v), x + i * bw + bw / 2, y + h - bh - 1.5, { size: 6.5, style: 'bold', color: INK, align: 'center' });
    text(doc, MONTHS[i], x + i * bw + bw / 2, y + h + 4.5, { size: 7, color: MUTED, align: 'center' });
  });
  return y + h + 9;
}

/** Net position per year: below zero until the system has paid for itself. */
function paybackChart(doc, r, fin, y, compact) {
  const x = M + 14;
  const w = CW - 14;
  const h = 40;
  const lo = Math.min(0, ...fin.rows.map((v) => v.net));
  const hi = Math.max(1, ...fin.rows.map((v) => v.net));
  const step = niceMax((hi - lo) / 4);
  const min = -Math.ceil(-lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks = Math.round((max - min) / step);
  chartFrame(doc, x, y, w, h, min, max, ticks, compact);
  const zero = y + h - ((0 - min) / (max - min)) * h;
  const bw = w / fin.rows.length;
  fin.rows.forEach((row, i) => {
    const bh = (Math.abs(row.net) / (max - min)) * h;
    doc.setFillColor(...(row.net < 0 ? [203, 213, 225] : r.brand.primary));
    doc.rect(x + i * bw + bw * 0.18, row.net < 0 ? zero : zero - bh, bw * 0.64, bh, 'F');
    if (row.year === 1 || row.year % 5 === 0) text(doc, `Yr ${row.year}`, x + i * bw + bw / 2, y + h + 4.5, { size: 6.5, color: MUTED, align: 'center' });
  });
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(x, zero, x + w, zero);
  if (fin.payback) {
    const px = x + Math.min(fin.payback, fin.rows.length) * bw;
    doc.setDrawColor(...r.brand.accent);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([1.2, 1], 0);
    doc.line(px, y, px, y + h);
    doc.setLineDashPattern([], 0);
    text(doc, `Payback: ${fin.payback.toFixed(1)} years`, px + 2, y + 3.5, { size: 7, style: 'bold', color: INK });
  }
  return y + h + 9;
}

/* ───────────── sign-off ───────────── */

function signOff(doc, r, y) {
  const b = r.brand;
  // rich text from the editor: headings, lists, bold/italic/underline, links, alignment
  if (!richTextIsEmpty(r.company.pdfTerms)) {
    y = section(doc, r, 'Terms & conditions', ensure(doc, r, y, 24));
    y = drawRichText(doc, r.company.pdfTerms, { x: M, y: y - 2.5, width: CW, size: 8.5, color: BODY, headingColor: INK, linkColor: b.primary, markerColor: b.primary, ensure: (yy, need) => ensure(doc, r, yy, need) }) + 8;
  }

  const boxH = 48;
  y = section(doc, r, 'Acceptance', ensure(doc, r, y, boxH + 12));
  const gap = 6;
  const qrW = b.qr ? 46 : 0;
  const w = (CW - (b.qr ? qrW + gap : 0) - gap) / 2;
  const block = (x, label, name, sub, image) => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, boxH);
    doc.setFillColor(...b.primary);
    doc.rect(x, y, w, 0.9, 'F');
    text(doc, clip(doc, label.toUpperCase(), w - 8, 6.5, 'bold'), x + 4, y + 7, { size: 6.5, style: 'bold', color: MUTED });
    if (image) placeImage(doc, image, x + 4, y + 10, w - 8, 20, 'left');
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.25);
    doc.line(x + 4, y + 32, x + w - 4, y + 32);
    text(doc, clip(doc, name || ' ', w - 8, 9.5, 'bold'), x + 4, y + 37.5, { size: 9.5, style: 'bold', color: INK });
    text(doc, clip(doc, sub || ' ', w - 8, 7.5), x + 4, y + 42.5, { size: 7.5, color: MUTED });
  };
  block(M, `For ${r.company.name}`, r.company.signatoryName || r.company.name, [r.company.signatoryTitle, `Date: ${r.date}`].filter(Boolean).join('   |   '), b.signature);
  block(M + w + gap, 'Accepted by client', r.client.name, 'Signature, name & date', null);
  if (b.qr) {
    const x = M + (w + gap) * 2;
    doc.setFillColor(...SOFT);
    doc.rect(x, y, qrW, boxH, 'F');
    placeImage(doc, b.qr, x + 5, y + 4, qrW - 10, 34, 'center');
    text(doc, wrap(doc, r.company.qrLabel || '', qrW - 6, 7, 'bold').slice(0, 2), x + qrW / 2, y + 42, { size: 7, style: 'bold', color: INK, align: 'center' });
  }
  return y + boxH;
}

/* ───────────── document ───────────── */

/**
 * `company` is the signed-in company (profile, theme, logo, e-signature, QR, terms) and `client`
 * the person the design was made for — together they personalise every page.
 */
export async function generatePdf({ design, project, place, finance, snapshot, company = {}, client = {}, designId = '' }) {
  company = { name: project.preparedBy || 'Solar proposal', ...company };
  client = { name: project.customer || '', ...(client || {}) };
  const brand = await loadBranding(company);
  const now = new Date();
  const r = {
    title: project.name || 'Rooftop Solar Plan',
    address: place?.address || `${design.origin.lat.toFixed(5)}, ${design.origin.lng.toFixed(5)}`,
    date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    dateShort: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    ref: `Ref. SP-${now.toISOString().slice(0, 10).replace(/-/g, '')}${designId ? `-${String(designId).slice(-5).toUpperCase()}` : ''}`,
    totals: design.totals,
    brand,
    company,
    client,
  };
  const money = (v, d = 0) => formatMoney(v, finance.currency, { pdf: true, decimals: d });
  const compactMoney = (v) => {
    const a = Math.abs(v);
    return `${v < 0 ? '-' : ''}${a >= 1e7 ? `${(a / 1e6).toFixed(0)}M` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : a.toFixed(0)}`;
  };
  const { totals, fin, electrical: el, spec, cost } = design;
  const moduleName = [spec.brand, spec.model].filter(Boolean).join(' ') || `${spec.watts} W module`;
  const roofArea = design.sections.reduce((a, s) => a + Math.abs(s.poly.reduce((acc, p, i) => acc + p.x * s.poly[(i + 1) % s.poly.length].y - s.poly[(i + 1) % s.poly.length].x * p.y, 0)) / 2, 0);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${r.title} - Solar proposal`, author: company.name, subject: `Solar proposal for ${client.name || 'client'}`, creator: company.name });
  const table = () => tableStyle(doc, r);

  // 1 — cover
  await drawCover(doc, r, design, finance, snapshot);

  // 2 — summary
  let y = newPage(doc, r, 'Proposal summary');
  text(doc, client.name ? `Dear ${client.name},` : 'Dear Customer,', M, y + 2, { size: 11, style: 'bold', color: INK });
  const letter = `Thank you for the opportunity to propose a rooftop solar power system for ${r.address}. After analysing your roof, its orientation and the shading around it, we recommend a ${totals.kwp.toFixed(2)} kWp system built with ${totals.count} ${moduleName} modules of ${spec.watts} W. It is expected to generate about ${formatNumber(totals.acKwh)} kWh of clean electricity every year, saving approximately ${money(fin.firstYearSavings)} in the first year${fin.payback ? ` and paying for itself in about ${fin.payback.toFixed(1)} years` : ''}. The pages that follow describe the design, the equipment, the expected energy and the price in detail.`;
  const letterLines = wrap(doc, letter, CW, 9.5);
  text(doc, letterLines, M, y + 9.5, { size: 9.5, color: BODY, lineHeight: 1.5 });
  y += 9.5 + letterLines.length * 5.05 + 5;

  y = section(doc, r, 'Key figures', y);
  y = statTiles(doc, r, [
    ['System size', `${totals.kwp.toFixed(2)} kWp`, `${totals.count} x ${spec.watts} W modules`],
    ['Annual energy', `${formatNumber(totals.acKwh)} kWh`, `${formatNumber(totals.specificYield)} kWh per kWp`],
    ['Investment', money(fin.cost), totals.kwp ? `${money(fin.cost / totals.kwp)} per kWp` : ''],
    ['Year-1 savings', money(fin.firstYearSavings), `at ${money(design.catalog.tariff, 2)} per kWh`],
    ['Payback', fin.payback ? `${fin.payback.toFixed(1)} years` : '> 25 years', 'simple payback'],
    ['25-year savings', money(fin.lifetimeSavings), `net gain ${money(fin.netGain)}`],
    ['Return on investment', `${formatNumber(fin.roi)} %`, 'over 25 years'],
    ['Shading loss', `${totals.shadeLossPct.toFixed(1)} %`, 'hour-by-hour analysis'],
  ], y) + 10;

  y = section(doc, r, 'Your system at a glance', y);
  y = specGrid(doc, [
    ['Solar module', `${moduleName} ${spec.watts} W`],
    ['Number of modules', String(totals.count)],
    ['Module warranty', spec.warrantyYears != null ? `${spec.warrantyYears} years` : '-'],
    ['Manufacture year', spec.manufactureYear ? String(spec.manufactureYear) : '-'],
    ['Inverter', `${el.inverterCount || 0} x ${el.inverter?.kw ?? '-'} kW`],
    ['Strings', String(el.strings.length)],
    ['Mounting structure', design.structure.columns ? design.pillar?.name || '-' : 'Flush on roof hooks'],
    ['Roof area', `${roofArea.toFixed(0)} m²`],
  ], y) + 10;

  y = section(doc, r, 'Environmental benefit', ensure(doc, r, y, 36));
  const co2 = (totals.acKwh * 0.7) / 1000; // tonnes / year
  statTiles(doc, r, [
    ['CO2 avoided', `${co2.toFixed(1)} t / year`, `${formatNumber(co2 * 25)} t over 25 years`],
    ['Equivalent trees', formatNumber((co2 * 1000) / 21), 'planted and grown'],
    ['Clean energy', `${formatNumber(fin.lifetimeEnergy / 1000)} MWh`, 'over 25 years'],
  ], y, { cols: 3 });
  text(doc, 'Estimated with a grid emission factor of 0.7 kg CO2 per kWh and 21 kg CO2 absorbed per tree per year.', M, y + 21 + 5, { size: 7, color: MUTED });

  // 3 — system details
  y = newPage(doc, r, 'System details');
  y = section(doc, r, 'Solar module', y);
  autoTable(doc, { ...table(), startY: y, head: [['Brand', 'Model', 'Power', 'Size', 'Mfg. year', 'Warranty', 'Qty']], body: [[spec.brand || '-', spec.model || '-', `${spec.watts} W`, `${spec.length} x ${spec.width} m`, spec.manufactureYear || '-', spec.warrantyYears != null ? `${spec.warrantyYears} years` : '-', totals.count]] });
  y = section(doc, r, 'Roof', doc.lastAutoTable.finalY + 10);
  autoTable(doc, { ...table(), startY: y, head: [['Roof section', 'Shape', 'Plan area', 'Wall height', 'Parapet (h x t)']], body: design.sections.map((s) => [s.name, s.frame ? (s.roofType === 'gable' ? `Two slopes (gable), ${Math.round(s.pitch)}°${Math.abs(s.frame.pitch2 - s.pitch) > 0.5 ? ` and ${Math.round(s.frame.pitch2)}°` : ''} pitch` : `Single slope, ${Math.round(s.pitch)}° pitch`) : 'Flat', `${(Math.abs(s.poly.reduce((a, p, i) => a + p.x * s.poly[(i + 1) % s.poly.length].y - s.poly[(i + 1) % s.poly.length].x * p.y, 0)) / 2).toFixed(1)} m²`, `${s.height} m`, s.frame ? 'none (pitched roof)' : `${s.parapetH} m x ${s.parapetT} m`]) });
  y = section(doc, r, 'Array orientation', ensure(doc, r, doc.lastAutoTable.finalY + 10, 30));
  autoTable(doc, { ...table(), startY: y, head: [['Modules', 'Tilt', 'Facing', 'Energy per year', 'Share']], body: totals.groups.map((g) => [g.count, `${g.tilt}°`, `${g.azimuth}° ${compassLabel(g.azimuth)}`, `${formatNumber((g.dc * finance.efficiency) / 100)} kWh`, `${totals.count ? ((g.count / totals.count) * 100).toFixed(0) : 0} %`]) });
  y = section(doc, r, 'Mounting structure schedule', ensure(doc, r, doc.lastAutoTable.finalY + 10, 30));
  autoTable(doc, { ...table(), startY: y, head: [['Table', 'Type', 'Modules', 'Tilt', 'Front leg', 'Back leg', 'Legs / hooks']], body: design.tables.filter((t) => t.valid).map((t, i) => [`T${i + 1}`, t.flush ? 'Flush on roof' : t.kind === 'elevated' ? 'Elevated' : 'Standard', `${t.rows} x ${t.cols}`, `${Math.round(t.tilt * 10) / 10}°`, t.flush ? '-' : `${t.frontLeg.toFixed(2)} m`, t.flush ? '-' : `${t.backLeg.toFixed(2)} m`, t.flush ? `${t.legs.length} hooks` : t.legs.length]) });

  // 4, 5 — drawings
  for (const [sheet, title, colored] of [['E-01', 'PV array layout', false], ['E-02', 'String layout', true]]) {
    y = newPage(doc, r, title);
    y = section(doc, r, title, y);
    const drawingH = BOTTOM - y - 19 - 4;
    drawLayout(doc, r, design, M, y, CW, drawingH, colored);
    titleBlock(doc, r, sheet, title, y + drawingH + 4);
  }

  // 6 — electrical
  y = newPage(doc, r, 'Electrical design');
  y = section(doc, r, 'Single line diagram', y);
  y = drawSld(doc, r, el, y) + 6;
  y = section(doc, r, 'Inverter & strings', y);
  y = specGrid(doc, [['Inverter', `${el.inverterCount || 0} x ${el.inverter?.kw ?? '-'} kW ${el.inverter?.kw <= 6 ? 'single-phase' : 'three-phase'}`], ['DC / AC ratio', el.dcAc ? el.dcAc.toFixed(2) : '-'], ['AC capacity', `${el.acKw ?? '-'} kW`], ['Modules per string', [...new Set(el.strings.map((st) => st.count))].sort((a, c) => a - c).join(' / ') || '-'], ['Allowed string length', `${el.minLen ?? '-'} to ${el.maxLen ?? '-'} modules`]], y) + 6;
  autoTable(doc, { ...table(), startY: y, head: [['String', 'Modules', 'Power', 'Voc STC', 'Voc cold', 'Isc', 'Inverter']], body: el.strings.map((s) => [s.name, s.count, `${s.kwp.toFixed(2)} kWp`, `${s.voc.toFixed(0)} V`, `${s.vocCold.toFixed(0)} V`, `${s.isc} A`, `INV-${s.inverter}`]) });

  // 7 — bill of materials
  y = newPage(doc, r, 'Bill of materials');
  y = section(doc, r, 'Bill of materials', y);
  autoTable(doc, { ...table(), startY: y, head: [['#', 'Item', 'Specification', 'Qty', 'Unit']], body: el.bom.map((row, i) => [i + 1, ...row]), ...numeric(3), columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 78 }, 3: { halign: 'right', cellWidth: 16 }, 4: { cellWidth: 18 } } });

  // 8 — energy & financials
  y = newPage(doc, r, 'Energy & financials');
  y = section(doc, r, 'Monthly energy production (kWh)', y);
  y = monthlyChart(doc, r, totals.monthly, y + 3) + 4;
  y = section(doc, r, `Net position over 25 years (${finance.currency})`, y);
  y = paybackChart(doc, r, fin, y + 1, compactMoney) + 4;
  y = section(doc, r, `Financial outlook (${finance.currency})`, y);
  const years = fin.rows.filter((row) => [1, 2, 3, 5, 10, 15, 20, 25].includes(row.year));
  autoTable(doc, { ...table(), startY: y, styles: { ...table().styles, fontSize: 8, cellPadding: { top: 1.7, bottom: 1.7, left: 3, right: 3 } }, head: [['Year', 'Energy', 'Tariff', 'Savings', 'Cumulative', 'Net position']], body: years.map((row) => [row.year, `${formatNumber(row.energy)} kWh`, money(row.rate, 2), money(row.savings), money(row.cumulative), money(row.net)]), ...numeric(1, 2, 3, 4, 5) });
  y = ensure(doc, r, doc.lastAutoTable.finalY + 6, 12);
  text(doc, wrap(doc, `Assumptions: performance ratio ${finance.efficiency}%, module degradation ${finance.degradation}% per year, tariff escalation ${finance.escalation}% per year. Yield ${design.yieldModel.source === 'google' ? 'calibrated with Google Solar API sunshine data' : 'from a clear-sky model with a regional cloudiness factor'}; shading from parapets, raised roofs, obstructions, trees and adjacent tables computed hourly for 12 representative days. Figures are indicative and should be verified on site.`, CW, 7.5), M, y, { size: 7.5, color: MUTED, lineHeight: 1.35 });

  // 9 — price & acceptance
  y = newPage(doc, r, 'Price & acceptance');
  y = section(doc, r, `Price summary (${finance.currency})`, y);
  autoTable(doc, {
    ...table(),
    startY: y,
    head: [['Item', 'Description', 'Amount']],
    body: [
      ['Solar modules', `${totals.count} x ${moduleName} ${spec.watts} W`, money(cost.panels)],
      ['Mounting structure', design.structure.columns ? `${design.pillar?.name || 'Poles'} - ${formatNumber(cost.pillarFt)} ft` : `Flush mount: ${design.structure.hooks} roof hooks and rails (priced in balance of system)`, money(cost.pillars)],
      ['Balance of system', 'Inverter, cabling, protection devices, installation and commissioning', money(cost.other)],
    ],
    ...numeric(2),
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: INK }, 2: { halign: 'right', cellWidth: 40 } },
  });
  y = doc.lastAutoTable.finalY + 3;
  doc.setFillColor(...brand.primary);
  doc.rect(M, y, CW, 13, 'F');
  text(doc, 'TOTAL INVESTMENT', M + 4, y + 8.2, { size: 8.5, style: 'bold', color: brand.primaryFg });
  text(doc, `${totals.kwp.toFixed(2)} kWp system`, M + 46, y + 8.2, { size: 8.5, color: brand.primaryFg });
  text(doc, money(cost.total), W - M - 4, y + 8.8, { size: 13, style: 'bold', color: brand.primaryFg, align: 'right' });
  signOff(doc, r, y + 13 + 12);

  footers(doc, r);
  const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`${[slug(client.name), slug(r.title)].filter(Boolean).join('_') || 'solar-proposal'}.pdf`);
}
