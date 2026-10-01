'use client';

// Proposal PDF — every page is A4 portrait. Branded for the company (logo, colours, e-signature,
// QR code, terms) and addressed to its client:
//   1 cover · 2 summary & letter · 3 system details · 4–6 drawings (layout, strings, single line
//   diagram) · 7 electrical design · 8 bill of materials · 9 energy & financials · 10 price & acceptance
// With `shadow` (results of a shadow analysis run) the shadow report follows as its last section.

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { loadBranding } from './branding.js';
import { capFirst } from './catalog.js';
import { drawCoverStyle } from './pdfCoverVariants.js';
import { QUOTE_FINANCE, computeQuoteSystem, monthlyOutlook } from './quoteModel.js';
import { shareForPdf } from './share.js';
import { validUntilText } from './validity.js';
import { formatMoney, formatNumber } from './energy.js';
import { pricingFromQuote } from './pricing.js';
import { compassLabel } from './geo.js';
import { rectPoly } from './geometry.js';
import { ridgeSegment } from './model.js';
import { drawRichText, richTextIsEmpty } from './pdfRichText.js';
import { drawSld, sldSchedule } from './pdfSld.js';
import { appendShadowReport } from './shadowReport/shadowReportPdf.js';
import { MONTHS } from './sun.js';

// A4 portrait, millimetres
const W = 210;
const H = 297;
const M = 16; // side margin
const CW = W - 2 * M; // content width
const TOP = 30; // first content line on inner pages
const BOTTOM = H - 20; // content must end above the footer

const INK = [15, 23, 42];
const BODY = [0, 0, 0];
const MUTED = [0, 0, 0];
const LINE = [226, 232, 240];
const SOFT = [248, 250, 252];
const WHITE = [255, 255, 255];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/* ───────────── primitives ───────────── */

/** Small text is drawn one point larger (5–9 pt): easier to read on paper and on screen. */
const S = (n) => (n >= 5 && n < 9 ? n + 1 : n);


function text(doc, str, x, y, { size = 9, style = 'normal', color = BODY, align, maxWidth, lineHeight } = {}) {
  doc.setFont('helvetica', style);
  doc.setFontSize(S(size));
  doc.setTextColor(...color);
  if (lineHeight) doc.setLineHeightFactor(lineHeight);
  doc.text(str, x, y, { align, maxWidth });
  if (lineHeight) doc.setLineHeightFactor(1.15);
}

/** First line of `str` that fits `width` at the given size (adds … when cut). */
function clip(doc, str, width, size, style = 'normal') {
  doc.setFont('helvetica', style);
  doc.setFontSize(S(size));
  const lines = doc.splitTextToSize(String(str ?? ''), width);
  return lines.length > 1 ? `${lines[0].replace(/[\s,.;:-]+$/, '')}...` : lines[0] || '';
}

function wrap(doc, str, width, size, style = 'normal') {
  doc.setFont('helvetica', style);
  doc.setFontSize(S(size));
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

/** Footer on proposal pages 2…`last`: contact line, page numbers out of the whole document. */
function footers(doc, r, last = doc.getNumberOfPages(), first = 2) {
  const pages = doc.getNumberOfPages();
  const contact = [r.company.name, r.company.phone, r.company.email, r.company.website].filter(Boolean).join('   |   ');
  for (let i = first; i <= last; i++) {
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
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: { top: 2.3, bottom: 2.3, left: 3, right: 3 }, textColor: BODY, lineColor: LINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: r.brand.primary, textColor: r.brand.primaryFg, fontStyle: 'bold', fontSize: 9, lineWidth: 0 },
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
  // a campus: each building's name above its main roof
  if (design.buildings.length > 1) {
    for (const s of design.sections.filter((x) => x.main)) {
      const mapped = s.poly.map(map);
      const top = Math.min(...mapped.map((p) => p.y));
      const cx = mapped.reduce((a, p) => a + p.x, 0) / mapped.length;
      text(doc, design.buildings.find((b) => b.id === s.building)?.name || '', cx, top - 6.5, { size: 8.5, style: 'bold', color: r.brand.primary, align: 'center' });
    }
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
    doc.setFillColor(...(r.calm ? r.brand.primary : r.brand.accent));
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
    doc.setDrawColor(...(r.calm ? INK : r.brand.accent));
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
export async function generatePdf({ design, project, place, finance, snapshot, company = {}, client = {}, designId = '', shadow = null, validUntil = null, cover }) {
  company = { name: project.preparedBy || 'Solar proposal', ...company };
  client = { name: project.customer || '', ...(client || {}) };
  const brand = await loadBranding(company);
  const share = await shareForPdf(designId); // the proposal's public link and its QR code (null if unavailable)
  const now = new Date();
  const r = {
    title: project.name || 'Rooftop Solar Plan',
    address: place?.address || `${design.origin.lat.toFixed(5)}, ${design.origin.lng.toFixed(5)}`,
    date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    validUntil: validUntilText(validUntil),
    shareUrl: share?.url || '',
    shareQr: share?.qr || '',
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
  const years = fin.rows.length; // the outlook period chosen for this design
  const moduleName = [spec.brand, spec.model].filter(Boolean).join(' ') || `${spec.watts} W module`;
  const campus = (cost.buildings?.length || 0) > 1; // several buildings: one price, with a breakdown per building
  const buildingName = (id) => design.buildings.find((b) => b.id === id)?.name || '';
  const inverterOf = (id) => {
    const b = el.buildings?.find((x) => x.id === id);
    return b ? `${b.inverterCount} x ${b.inverter.kw} kW` : '-';
  };
  const roofArea = design.sections.reduce((a, s) => a + Math.abs(s.poly.reduce((acc, p, i) => acc + p.x * s.poly[(i + 1) % s.poly.length].y - s.poly[(i + 1) % s.poly.length].x * p.y, 0)) / 2, 0);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${r.title} - Solar proposal`, author: company.name, subject: `Solar proposal for ${client.name || 'client'}`, creator: company.name });
  const table = () => tableStyle(doc, r);

  // 1 — cover, in the style picked at download
  await drawCoverStyle(doc, r, design, finance, snapshot, cover);

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
    ['Payback', fin.payback ? `${fin.payback.toFixed(1)} years` : `> ${years} years`, 'simple payback'],
    [`${years}-year savings`, money(fin.lifetimeSavings), `net gain ${money(fin.netGain)}`],
    ['Return on investment', `${formatNumber(fin.roi)} %`, `over ${years} years`],
    ['Shading loss', `${totals.shadeLossPct.toFixed(1)} %`, 'hour-by-hour analysis'],
  ], y) + 10;

  y = section(doc, r, 'Your system at a glance', y);
  y = specGrid(doc, [
    ['Solar module', `${moduleName} ${spec.watts} W`],
    ['Number of modules', String(totals.count)],
    ['Module warranty', spec.warrantyYears != null ? `${spec.warrantyYears} years` : '-'],
    ['Manufacture year', spec.manufactureYear ? String(spec.manufactureYear) : '-'],
    ...(campus ? [['Buildings', String(cost.buildings.length)]] : []),
    ['Inverter', campus ? `${el.inverterCount} inverters, sized per building` : `${el.inverterCount || 0} x ${el.inverter?.kw ?? '-'} kW`],
    ['Strings', String(el.strings.length)],
    ['Mounting structure', design.structure.columns ? design.pillar?.name || '-' : 'Flush on roof hooks'],
    ['Roof area', `${roofArea.toFixed(0)} m²`],
  ], y) + 10;

  y = section(doc, r, 'Environmental benefit', ensure(doc, r, y, 36));
  const co2 = (totals.acKwh * 0.7) / 1000; // tonnes / year
  statTiles(doc, r, [
    ['CO2 avoided', `${co2.toFixed(1)} t / year`, `${formatNumber(co2 * years)} t over ${years} years`],
    ['Equivalent trees', formatNumber((co2 * 1000) / 21), 'planted and grown'],
    ['Clean energy', `${formatNumber(fin.lifetimeEnergy / 1000)} MWh`, `over ${years} years`],
  ], y, { cols: 3 });
  text(doc, 'Estimated with a grid emission factor of 0.7 kg CO2 per kWh and 21 kg CO2 absorbed per tree per year.', M, y + 21 + 5, { size: 7, color: MUTED });

  // 3 — system details
  y = newPage(doc, r, 'System details');
  if (campus) {
    y = section(doc, r, 'Buildings on this site', y);
    autoTable(doc, { ...table(), startY: y, head: [['Building', 'Modules', 'Capacity', 'Energy per year', 'Shading loss', 'Inverter']], body: totals.buildings.map((b) => [b.name, b.count, `${b.kwp.toFixed(2)} kWp`, `${formatNumber(b.acKwh)} kWh`, `${b.shadeLossPct.toFixed(1)} %`, inverterOf(b.id)]), foot: [['All buildings', totals.count, `${totals.kwp.toFixed(2)} kWp`, `${formatNumber(totals.acKwh)} kWh`, `${totals.shadeLossPct.toFixed(1)} %`, `${el.inverterCount} inverters`]], footStyles: { fillColor: SOFT, textColor: INK, fontStyle: 'bold' }, columnStyles: { 0: { fontStyle: 'bold', textColor: INK } } });
    y = doc.lastAutoTable.finalY + 10;
  }
  y = section(doc, r, 'Solar module', y);
  autoTable(doc, { ...table(), startY: y, head: [['Brand', 'Model', 'Power', 'Size', 'Mfg. year', 'Warranty', 'Qty']], body: [[spec.brand || '-', spec.model || '-', `${spec.watts} W`, `${spec.length} x ${spec.width} m`, spec.manufactureYear || '-', spec.warrantyYears != null ? `${spec.warrantyYears} years` : '-', totals.count]] });
  y = section(doc, r, 'Roof', doc.lastAutoTable.finalY + 10);
  autoTable(doc, { ...table(), startY: y, head: [['Roof section', 'Shape', 'Plan area', 'Wall height', 'Parapet (h x t)']], body: design.sections.map((s) => [campus ? `${buildingName(s.building)} - ${s.name}` : s.name, s.frame ? (s.roofType === 'gable' ? `Two slopes (gable), ${Math.round(s.pitch)}°${Math.abs(s.frame.pitch2 - s.pitch) > 0.5 ? ` and ${Math.round(s.frame.pitch2)}°` : ''} pitch` : `Single slope, ${Math.round(s.pitch)}° pitch`) : 'Flat', `${(Math.abs(s.poly.reduce((a, p, i) => a + p.x * s.poly[(i + 1) % s.poly.length].y - s.poly[(i + 1) % s.poly.length].x * p.y, 0)) / 2).toFixed(1)} m²`, `${s.height} m`, s.frame ? 'none (pitched roof)' : `${s.parapetH} m x ${s.parapetT} m`]) });
  y = section(doc, r, 'Array orientation', ensure(doc, r, doc.lastAutoTable.finalY + 10, 30));
  autoTable(doc, { ...table(), startY: y, head: [['Modules', 'Tilt', 'Facing', 'Energy per year', 'Share']], body: totals.groups.map((g) => [g.count, `${g.tilt}°`, `${g.azimuth}° ${compassLabel(g.azimuth)}`, `${formatNumber((g.dc * finance.efficiency) / 100)} kWh`, `${totals.count ? ((g.count / totals.count) * 100).toFixed(0) : 0} %`]) });
  y = section(doc, r, 'Mounting structure schedule', ensure(doc, r, doc.lastAutoTable.finalY + 10, 30));
  autoTable(doc, { ...table(), startY: y, head: [['Table', ...(campus ? ['Building'] : []), 'Type', 'Modules', 'Tilt', 'Front leg', 'Back leg', 'Legs / hooks']], body: design.tables.filter((t) => t.valid).map((t, i) => [`T${i + 1}`, ...(campus ? [buildingName(t.building)] : []), t.flush ? 'Flush on roof' : t.kind === 'elevated' ? 'Elevated' : 'Standard', `${t.rows} x ${t.cols}`, `${Math.round(t.tilt * 10) / 10}°`, t.flush ? '-' : `${t.frontLeg.toFixed(2)} m`, t.flush ? '-' : `${t.backLeg.toFixed(2)} m`, t.flush ? `${t.legs.length} hooks` : t.legs.length]) });

  // 4, 5 — drawings
  for (const [sheet, title, colored] of [['E-01', 'PV array layout', false], ['E-02', 'String layout', true]]) {
    y = newPage(doc, r, title);
    y = section(doc, r, title, y);
    const drawingH = BOTTOM - y - 19 - 4;
    drawLayout(doc, r, design, M, y, CW, drawingH, colored);
    titleBlock(doc, r, sheet, title, y + drawingH + 4);
  }

  // 6 — single line diagram
  // a campus has one diagram per building: each building has its own inverters and strings
  const systems = campus ? el.buildings.map((b, i) => ({ el: b, sheet: `E-03.${i + 1}`, name: b.name, count: b.strings.reduce((n, st) => n + st.count, 0) })) : [{ el, sheet: 'E-03', name: '', count: totals.count }];
  for (const sys of systems) {
    const title = sys.name ? `Single line diagram - ${sys.name}` : 'Single line diagram';
    y = newPage(doc, r, 'Single line diagram');
    y = section(doc, r, title, y);
    const sldH = BOTTOM - y - 19 - 4;
    drawSld(doc, sys.el, spec, M, y, CW, sldH);
    titleBlock(doc, r, sys.sheet, sys.name ? `SLD - ${sys.name}` : title, y + sldH + 4);
  }

  // 7 — electrical
  y = newPage(doc, r, 'Electrical design');
  for (const sys of el.strings.length ? systems : []) {
    y = section(doc, r, sys.name ? `Equipment schedule - ${sys.name} (sheet ${sys.sheet})` : 'Equipment schedule (sheet E-03)', ensure(doc, r, y, 40));
    autoTable(doc, { ...table(), startY: y, styles: { ...table().styles, fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 2.5, right: 2.5 } }, head: [['Tag', 'Item', 'Specification', 'Qty']], body: sldSchedule(sys.el, spec, moduleName, sys.count), ...numeric(3), columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold', textColor: INK }, 1: { cellWidth: 42 }, 3: { halign: 'right', cellWidth: 20 } } });
    y = ensure(doc, r, doc.lastAutoTable.finalY + 4, 12);
    text(doc, wrap(doc, 'Protection ratings are sized from the design currents (string fuse 1.56 x Isc, DC isolator 1.25 x Isc per MPPT, AC breakers 1.25 x inverter output current); cable sizes assume copper conductors derated for rooftop runs. Final selection to be verified against equipment datasheets, IS / IEC 60364-7-712 and DISCOM net-metering requirements.', CW, 7), M, y, { size: 7, color: MUTED, lineHeight: 1.35 });
    y += 13;
  }
  y = section(doc, r, 'Inverter & strings', ensure(doc, r, y, 40));
  y = specGrid(doc, [['Inverter', campus ? `${el.inverterCount} inverters, sized per building` : `${el.inverterCount || 0} x ${el.inverter?.kw ?? '-'} kW ${el.inverter?.kw <= 6 ? 'single-phase' : 'three-phase'}`], ['DC / AC ratio', el.dcAc ? el.dcAc.toFixed(2) : '-'], ['AC capacity', `${el.acKw ?? '-'} kW`], ['Modules per string', [...new Set(el.strings.map((st) => st.count))].sort((a, c) => a - c).join(' / ') || '-'], ['Allowed string length', `${el.minLen ?? '-'} to ${el.maxLen ?? '-'} modules`]], y) + 6;
  autoTable(doc, { ...table(), startY: y, head: [['String', ...(campus ? ['Building'] : []), 'Modules', 'Power', 'Voc STC', 'Voc cold', 'Isc', 'Inverter']], body: el.strings.map((s) => [s.name, ...(campus ? [s.buildingName] : []), s.count, `${s.kwp.toFixed(2)} kWp`, `${s.voc.toFixed(0)} V`, `${s.vocCold.toFixed(0)} V`, `${s.isc} A`, `INV-${s.inverter}`]) });

  // 8 — bill of materials
  y = newPage(doc, r, 'Bill of materials');
  y = section(doc, r, 'Bill of materials', y);

  // every row carries its parent category (`group`), which the table is printed in
  let bomRows = [];
  if (cost.isPackage) {
    if (cost.package?.items?.length) {
      bomRows = cost.package.items.map((it) => {
        const specParts = [
          it.brand && `Brand: ${it.brand}`,
          it.model && `Model: ${it.model}`,
          it.spec,
        ].filter(Boolean).join(' · ');
        return { group: it.parentName, order: it.parentOrder, cells: [it.name, specParts || '-', it.qty || 1, capFirst(it.unit) || 'Nos'] };
      });
    }
  } else {
    // Custom mode: only include the items selected and configured during design creation:
    // 1. Solar modules
    bomRows.push({ group: spec.parentName, order: spec.parentOrder, cells: [
      'Solar modules',
      [spec.brand, spec.model, `${spec.watts} W`, `(${spec.length} x ${spec.width} m)`].filter(Boolean).join(' '),
      totals.count,
      'nos',
    ] });

    // 2. Mounting structure / poles (if elevated/poles used)
    if (design.structure.columns > 0) {
      bomRows.push({ group: design.pillar?.parentName, order: design.pillar?.parentOrder, cells: [
        `Pillars / Mounting structure (${design.pillar?.name || 'Poles'})`,
        `${Math.ceil(cost.pillarFt)} ft total length (${design.pillar?.shape || 'iron column'})`,
        design.structure.columns,
        'nos',
      ] });
    } else if (design.structure.hooks > 0) {
      // no product of its own: it goes with the modules it carries
      bomRows.push({ group: spec.parentName, order: spec.parentOrder, cells: [
        'Mounting structure (Roof hooks / rails)',
        'Flush-mounted roof rails & hooks',
        design.structure.hooks,
        'nos',
      ] });
    }

    // 3. Category materials actually chosen by the user
    if (cost.categoryMaterials?.length) {
      for (const m of cost.categoryMaterials) {
        bomRows.push({ group: m.parentName, order: m.parentOrder, cells: [
          m.categoryName,
          m.productName,
          m.qty,
          m.unit || 'nos',
        ] });
      }
    }
  }

  autoTable(doc, { ...table(), startY: y, head: [['#', 'Item', 'Specification', 'Qty', 'Unit']], body: groupedBom(bomRows, brand), ...numeric(3), columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 78 }, 3: { halign: 'right', cellWidth: 16 }, 4: { cellWidth: 18 } } });


  // 9 — energy & financials
  y = newPage(doc, r, 'Energy & financials');
  y = section(doc, r, 'Monthly energy production (kWh)', y);
  y = monthlyChart(doc, r, totals.monthly, y + 3) + 4;
  y = section(doc, r, `Net position over ${years} years (${finance.currency})`, y);
  y = paybackChart(doc, r, fin, y + 1, compactMoney) + 4;
  y = outlookSummary(doc, r, y, fin, years, money);
  doc.lastAutoTable = { finalY: y };
  y = ensure(doc, r, doc.lastAutoTable.finalY + 6, 12);
  text(doc, wrap(doc, `Assumptions: performance ratio ${finance.efficiency}%, module degradation ${finance.degradation}% per year, electricity tariff held at the current rate of ${money(design.catalog.tariff, 2)} per kWh. Yield ${design.yieldModel.source === 'google' ? 'calibrated with Google Solar API sunshine data' : 'from a clear-sky model with a regional cloudiness factor'}; shading from parapets, raised roofs, obstructions, trees and adjacent tables computed hourly for 12 representative days. Figures are indicative and should be verified on site.`, CW, 7.5), M, y, { size: 7.5, color: MUTED, lineHeight: 1.35 });

  monthlyOutlookPages(doc, r, { monthly: totals.monthly, fin, tariff: design.catalog.tariff, years, finance, money });

  // 10 — price & acceptance
  y = newPage(doc, r, 'Price & acceptance');
  y = section(doc, r, `Price summary (${finance.currency})`, y);

  let priceRows = [];
  if (cost.isPackage) {
    // Package mode: list all bundled equipment with product name and [-] against price
    const pkg = cost.package;
    const items = pkg?.items?.length ? pkg.items : [];

    priceRows = items.map((it) => {
      const details = [
        it.brand && `Brand: ${it.brand}`,
        it.model && `Model: ${it.model}`,
        it.spec,
        it.qty && `Qty: ${it.qty} ${it.unit || ''}`.trim(),
      ].filter(Boolean).join(' · ');
      return [
        it.name,
        details || it.description || 'Included in package',
        '-',
      ];
    });

    // Add Package base line
    priceRows.push([
      `Package: ${pkg?.name || 'All-Inclusive Solar Package'}`,
      pkg?.description || `${totals.kwp.toFixed(2)} kW complete turnkey rooftop package (all equipment above included)`,
      money(cost.packagePrice),
    ]);

    // Floor placement surcharge if applicable
    if (Number(cost.floorCost) > 0) {
      priceRows.push([
        'Floor placement',
        cost.floorPlacement === 0 ? 'Ground level (₹0)' : `Floor ${cost.floorPlacement} rooftop installation surcharge`,
        money(cost.floorCost),
      ]);
    }
  } else {
    // Custom mode: calculate prices on the basis of chosen materials (panels, poles, and company categories)
    priceRows = [
      ['Solar modules', `${totals.count} x ${moduleName} ${spec.watts} W`, money(cost.panels)],
      ['Mounting structure', design.structure.columns ? `${design.pillar?.name || 'Poles'} - ${formatNumber(cost.pillarFt)} ft` : `Flush mount: ${design.structure.hooks} roof hooks and rails`, money(cost.pillars)],
    ];

    if (cost.hasChosenMaterials) {
      for (const m of (cost.categoryMaterials || [])) {
        priceRows.push([m.categoryName, `${m.productName} (Qty: ${m.qty} ${m.unit})`, money(m.total)]);
      }
    } else {
      priceRows.push(['Balance of system', 'Inverter, cabling, protection devices, installation and commissioning', money(cost.other)]);
    }

    if (Number(cost.floorCost) > 0) {
      priceRows.push([
        'Floor placement',
        cost.floorPlacement === 0 ? 'Ground level (₹0)' : `Floor ${cost.floorPlacement} installation surcharge`,
        money(cost.floorCost),
      ]);
    }
  }



  for (const c of cost.installationCharges || []) priceRows.push([c.name, 'Installation charge', money(c.price)]);

  autoTable(doc, {
    ...table(),
    startY: y,
    head: [['Item', 'Description', 'Amount']],
    body: priceRows,
    ...numeric(2),
    columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold', textColor: INK }, 2: { halign: 'right', cellWidth: 38 } },
  });
  y = doc.lastAutoTable.finalY + 3;

  const subtotal = cost.subtotal ?? cost.total;
  const gstExtra = cost.withGst !== false && (cost.gstAmount || 0) > 0;
  if (gstExtra) {
    autoTable(doc, {
      ...table(),
      startY: y,
      body: [
        ['Taxable value', money(subtotal)],
        ['SGST', money(cost.sgst)],
        ['CGST', money(cost.cgst)],
      ],
      theme: 'plain',
      styles: { fontSize: 9.5, textColor: BODY },
      columnStyles: { 0: { cellWidth: CW - 42 }, 1: { halign: 'right', cellWidth: 42 } },
    });
    y = doc.lastAutoTable.finalY + 3;
  }

  doc.setFillColor(...brand.primary);
  doc.rect(M, y, CW, 13, 'F');
  text(doc, gstExtra ? 'GRAND TOTAL (INCL. GST)' : 'TOTAL INVESTMENT', M + 4, y + 8.2, { size: 8.5, style: 'bold', color: brand.primaryFg });
  text(doc, `${totals.kwp.toFixed(2)} kWp system`, M + 68, y + 8.2, { size: 8.5, color: brand.primaryFg });
  text(doc, money(cost.total), W - M - 4, y + 8.8, { size: 13, style: 'bold', color: brand.primaryFg, align: 'right' });
  y += 13 + 8;
  if (campus) {
    y = section(doc, r, 'Price breakdown by building', ensure(doc, r, y + 2, 30 + cost.buildings.length * 8));
    autoTable(doc, {
      ...table(),
      startY: y,
      head: [['Building', 'Modules', 'Capacity', ...(cost.isPackage ? [] : ['Modules & structure', 'Share of common items']), 'Amount']],
      body: cost.buildings.map((b) => [b.name, b.count, `${b.kwp.toFixed(2)} kWp`, ...(cost.isPackage ? [] : [money(b.modulesCost + b.structureCost), money(b.shared)]), money(b.total)]),
      foot: [['All buildings', totals.count, `${totals.kwp.toFixed(2)} kWp`, ...(cost.isPackage ? [] : [money(cost.buildings.reduce((a, b) => a + b.modulesCost + b.structureCost, 0)), money(cost.buildings.reduce((a, b) => a + b.shared, 0))]), money(cost.total)]],
      footStyles: { fillColor: SOFT, textColor: INK, fontStyle: 'bold' },
      columnStyles: { 0: { fontStyle: 'bold', textColor: INK } },
      didParseCell: (d) => {
        if (d.column.index > 0) d.cell.styles.halign = 'right';
      },
    });
    y = ensure(doc, r, doc.lastAutoTable.finalY + 4, 12);
    text(doc, wrap(doc, cost.isPackage ? 'The package price is shared between the buildings in proportion to their capacity. The amounts add up to the total above.' : 'Each building carries its own modules and mounting structure, plus its share (by capacity) of what the buildings have in common: inverters and other materials, installation charges and tax. The amounts add up to the total above.', CW, 7), M, y, { size: 7, color: MUTED, lineHeight: 1.3 });
    y += 10;
  }
  signOff(doc, r, onlineBlock(doc, r, y) + 4);

  const proposalEnd = doc.getNumberOfPages();
  if (shadow) await appendShadowReport(doc, shadow);
  footers(doc, r, proposalEnd);
  const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `${[slug(client.name), slug(r.title)].filter(Boolean).join('_') || 'solar-proposal'}${shadow ? '_with-shadow-analysis' : ''}.pdf`;
  doc.save(filename);
  return { blob: doc.output('blob'), filename };
}

/**
 * The bill of materials in its parent categories ("Structures", "Electricals", …): a heading row, then the
 * items under it, numbered through. Items without a parent category come last under "Other items"; when
 * nothing has a parent category the table is a plain list.
 */
export function groupedBom(rows, brand) {
  const groups = new Map();
  for (const row of rows) {
    const name = String(row.group || '').trim();
    if (!groups.has(name)) groups.set(name, { name, order: name ? Number(row.order) || 0 : Infinity, rows: [] });
    groups.get(name).rows.push(row.cells);
  }
  const ordered = [...groups.values()].sort((a, b) => a.order - b.order); // stable: equal orders keep their first appearance
  const grouped = ordered.some((g) => g.name);
  const body = [];
  let n = 0;
  for (const g of ordered) {
    if (grouped) body.push([{ content: `${(g.name || 'Other items').toUpperCase()}  (${g.rows.length})`, colSpan: 5, styles: { fontStyle: 'bold', fontSize: 8.5, textColor: brand.primary, fillColor: brand.primary.map((c) => Math.round(c + (255 - c) * 0.88)), halign: 'left', cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 } } }]);
    for (const cells of g.rows) body.push([++n, ...cells]);
  }
  return body;
}

/** Totals over the outlook period. */
function outlookSummary(doc, r, y, fin, years, money) {
  y = section(doc, r, `Summary over ${years} years`, y);
  return specGrid(doc, [
    ['Total energy', `${formatNumber(fin.lifetimeEnergy)} kWh`],
    ['Total savings', money(fin.lifetimeSavings)],
    ['Investment', money(fin.cost)],
    ['Net gain', money(fin.netGain)],
    ['Payback', fin.payback ? `${fin.payback.toFixed(1)} years` : `> ${years} years`],
    ['Return on investment', `${formatNumber(fin.roi)} %`],
  ], y);
}

/** Monthly financial outlook: one row per month for the chosen number of years (own pages, header repeated). */
function monthlyOutlookPages(doc, r, { monthly, fin, tariff, years, finance, money }) {
  let y = newPage(doc, r, 'Monthly financial outlook');
  y = section(doc, r, `Month-by-month outlook, ${years} years / ${years * 12} months`, y);
  const outlook = monthlyOutlook({ monthly, cost: fin.cost, tariff, years, finance });
  const base = tableStyle(doc, r);
  autoTable(doc, {
    ...base,
    startY: y,
    styles: { ...base.styles, fontSize: 8.5, cellPadding: { top: 1.1, bottom: 1.1, left: 2.5, right: 2.5 } },
    head: [['#', 'Month', 'Energy', 'Tariff', 'Savings', 'Cumulative', 'Net position']],
    body: outlook.map((o) => [o.n, o.when.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), `${formatNumber(o.energy)} kWh`, money(o.rate, 2), money(o.savings), money(o.cumulative), money(o.net)]),
    columnStyles: { 0: { cellWidth: 12, halign: 'right' }, 1: { cellWidth: 26 } },
    // a light rule closes each year
    didParseCell: (d) => {
      if (d.section === 'head' && [0, 2, 3, 4, 5, 6].includes(d.column.index)) d.cell.styles.halign = 'right';
      if (d.section === 'body' && [0, 2, 3, 4, 5, 6].includes(d.column.index)) d.cell.styles.halign = 'right';
      if (d.section === 'body' && (d.row.index + 1) % 12 === 0) d.cell.styles.lineWidth = { bottom: 0.5 };
    },
  });
}

/**
 * Proposal without a 3D design. Same look as the full proposal — cover, summary, system details, single line
 * diagram, electrical design, bill of materials, energy & financials, price & acceptance — but without the roof,
 * layout, string-layout and mounting pages, and with no render on the cover.
 * `spec` and `count` are the solar module and how many of them the chosen package / panel product gives; the
 * location and orientation use the defaults in `quote.system`.
 */
export async function generateQuotePdf({ quote, name = '', company = {}, client = {}, designId = '', currency = 'INR', spec, count, tariff = 8, validUntil = null, cover }) {
  company = { name: 'Solar proposal', ...company };
  client = { name: '', ...(client || {}) };
  const brand = await loadBranding(company);
  const share = await shareForPdf(designId); // the proposal's public link and its QR code (null if unavailable)
  const now = new Date();
  const money = (v, d = 0) => formatMoney(v, currency, { pdf: true, decimals: d });
  const compactMoney = (v) => {
    const a = Math.abs(v);
    return `${v < 0 ? '-' : ''}${a >= 1e7 ? `${(a / 1e6).toFixed(0)}M` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : a.toFixed(0)}`;
  };

  // price
  const items = quote.items || [];
  const floorCost = Number(quote.floorCost) || 0;
  const charges = (quote.installationCharges || []).filter((c) => c.name);
  const pricing = pricingFromQuote(quote);

  // system, energy, electrical, financials
  const years = Math.max(1, Math.min(30, Math.round(Number(quote.outlookYears) || 10)));
  const m = computeQuoteSystem(quote, spec, { count, years, tariff, cost: pricing.total });
  if (!m.ready) throw new Error('Choose a solar panel first');
  const { totals, fin, el, sys } = m;
  const finance = { ...QUOTE_FINANCE, currency };
  const moduleName = [spec.brand, spec.model].filter(Boolean).join(' ') || `${spec.watts} W module`;

  const r = {
    title: name || 'Solar price proposal',
    address: client.address || '',
    date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    validUntil: validUntilText(validUntil),
    shareUrl: share?.url || '',
    shareQr: share?.qr || '',
    dateShort: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    ref: `Ref. SP-${now.toISOString().slice(0, 10).replace(/-/g, '')}${designId ? `-${String(designId).slice(-5).toUpperCase()}` : ''}`,
    totals,
    brand,
    company,
    client,
    calm: true,
  };
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${r.title} - Solar proposal`, author: company.name, subject: `Solar proposal for ${client.name || 'client'}`, creator: company.name });
  const table = () => tableStyle(doc, r);

  // 1 — cover (the same designed cover as the full proposal; without a render it shows the brand artwork)
  await drawCoverStyle(doc, r, { totals, fin }, finance, null, cover);

  // 2 — summary
  let y = newPage(doc, r, 'Proposal summary');
  text(doc, client.name ? `Dear ${client.name},` : 'Dear Customer,', M, y + 2, { size: 11, style: 'bold', color: INK });
  const letter = `Thank you for the opportunity to propose a rooftop solar power system${client.address ? ` for ${client.address}` : ''}. We recommend a ${totals.kwp.toFixed(2)} kWp system built with ${totals.count} ${moduleName} modules of ${spec.watts} W. It is expected to generate about ${formatNumber(totals.acKwh)} kWh of clean electricity every year, saving approximately ${money(fin.firstYearSavings)} in the first year${fin.payback ? ` and paying for itself in about ${fin.payback.toFixed(1)} years` : ''}. The pages that follow describe the system, the equipment, the expected energy and the price in detail.`;
  const letterLines = wrap(doc, letter, CW, 9.5);
  text(doc, letterLines, M, y + 9.5, { size: 9.5, color: BODY, lineHeight: 1.5 });
  y += 9.5 + letterLines.length * 5.05 + 5;

  y = section(doc, r, 'Key figures', y);
  y = statTiles(doc, r, [
    ['System size', `${totals.kwp.toFixed(2)} kWp`, `${totals.count} x ${spec.watts} W modules`],
    ['Annual energy', `${formatNumber(totals.acKwh)} kWh`, `${formatNumber(totals.specificYield)} kWh per kWp`],
    ['Investment', money(fin.cost), totals.kwp ? `${money(fin.cost / totals.kwp)} per kWp` : ''],
    ['Year-1 savings', money(fin.firstYearSavings), `at ${money(tariff, 2)} per kWh`],
    ['Payback', fin.payback ? `${fin.payback.toFixed(1)} years` : `> ${years} years`, 'simple payback'],
    [`${years}-year savings`, money(fin.lifetimeSavings), `net gain ${money(fin.netGain)}`],
    ['Return on investment', `${formatNumber(fin.roi)} %`, `over ${years} years`],
    ['Performance ratio', `${finance.efficiency} %`, 'system efficiency'],
  ], y) + 10;

  y = section(doc, r, 'Your system at a glance', y);
  y = specGrid(doc, [
    ['Solar module', `${moduleName} ${spec.watts} W`],
    ['Number of modules', String(totals.count)],
    ['Module warranty', spec.warrantyYears != null ? `${spec.warrantyYears} years` : '-'],
    ['Manufacture year', spec.manufactureYear ? String(spec.manufactureYear) : '-'],
    ['Inverter', `${el.inverterCount || 0} x ${el.inverter?.kw ?? '-'} kW`],
    ['Strings', String(el.strings.length)],
    ['Module tilt', `${sys.tilt}°`],
    ['Facing', `${sys.azimuth}° ${compassLabel(Number(sys.azimuth))}`],
  ], y) + 10;

  y = section(doc, r, 'Environmental benefit', ensure(doc, r, y, 36));
  const co2 = (totals.acKwh * 0.7) / 1000;
  statTiles(doc, r, [
    ['CO2 avoided', `${co2.toFixed(1)} t / year`, `${formatNumber(co2 * years)} t over ${years} years`],
    ['Equivalent trees', formatNumber((co2 * 1000) / 21), 'planted and grown'],
    ['Clean energy', `${formatNumber(fin.lifetimeEnergy / 1000)} MWh`, `over ${years} years`],
  ], y, { cols: 3 });
  text(doc, 'Estimated with a grid emission factor of 0.7 kg CO2 per kWh and 21 kg CO2 absorbed per tree per year.', M, y + 21 + 5, { size: 7, color: MUTED });

  // 3 — system & electrical design
  y = newPage(doc, r, 'System & electrical design');
  y = section(doc, r, 'Solar module', y);
  autoTable(doc, { ...table(), startY: y, head: [['Brand', 'Model', 'Power', 'Size', 'Mfg. year', 'Warranty', 'Qty']], body: [[spec.brand || '-', spec.model || '-', `${spec.watts} W`, `${spec.length} x ${spec.width} m`, spec.manufactureYear || '-', spec.warrantyYears != null ? `${spec.warrantyYears} years` : '-', totals.count]] });
  y = section(doc, r, 'Inverter & strings', doc.lastAutoTable.finalY + 8);
  y = specGrid(doc, [['Inverter', `${el.inverterCount || 0} x ${el.inverter?.kw ?? '-'} kW ${el.inverter?.kw <= 6 ? 'single-phase' : 'three-phase'}`], ['DC / AC ratio', el.dcAc ? el.dcAc.toFixed(2) : '-'], ['AC capacity', `${el.acKw ?? '-'} kW`], ['Modules per string', [...new Set(el.strings.map((st) => st.count))].sort((a, c) => a - c).join(' / ') || '-'], ['Allowed string length', `${el.minLen ?? '-'} to ${el.maxLen ?? '-'} modules`], ['Array orientation', `${sys.tilt}° tilt, facing ${compassLabel(Number(sys.azimuth))}`]], y) + 5;
  autoTable(doc, { ...table(), startY: y, head: [['String', 'Modules', 'Power', 'Voc STC', 'Voc cold', 'Isc', 'Inverter']], body: el.strings.map((st) => [st.name, st.count, `${st.kwp.toFixed(2)} kWp`, `${st.voc.toFixed(0)} V`, `${st.vocCold.toFixed(0)} V`, `${st.isc} A`, `INV-${st.inverter}`]) });
  y = section(doc, r, 'Equipment schedule (sheet E-01)', ensure(doc, r, doc.lastAutoTable.finalY + 8, 40));
  autoTable(doc, { ...table(), startY: y, styles: { ...table().styles, fontSize: 9, cellPadding: { top: 1.7, bottom: 1.7, left: 2.5, right: 2.5 } }, head: [['Tag', 'Item', 'Specification', 'Qty']], body: sldSchedule(el, spec, moduleName, totals.count), ...numeric(3), columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold', textColor: INK }, 1: { cellWidth: 42 }, 3: { halign: 'right', cellWidth: 20 } } });
  y = ensure(doc, r, doc.lastAutoTable.finalY + 4, 12);
  text(doc, wrap(doc, 'Protection ratings are sized from the design currents (string fuse 1.56 x Isc, DC isolator 1.25 x Isc per MPPT, AC breakers 1.25 x inverter output current); cable sizes assume copper conductors derated for rooftop runs. Final selection to be verified against equipment datasheets, IS / IEC 60364-7-712 and DISCOM net-metering requirements.', CW, 7.5), M, y, { size: 7.5, color: MUTED, lineHeight: 1.35 });

  // 4 — single line diagram
  y = newPage(doc, r, 'Single line diagram');
  y = section(doc, r, 'Single line diagram', y);
  const sldH = BOTTOM - y - 19 - 4;
  drawSld(doc, el, spec, M, y, CW, sldH);
  titleBlock(doc, r, 'E-01', 'Single line diagram', y + sldH + 4);

  // 5 — energy & financials
  y = newPage(doc, r, 'Energy & financials');
  y = section(doc, r, 'Monthly energy production (kWh)', y);
  y = monthlyChart(doc, r, totals.monthly, y + 3) + 4;
  y = section(doc, r, `Net position over ${years} years (${currency})`, y);
  y = paybackChart(doc, r, fin, y + 1, compactMoney) + 4;
  y = outlookSummary(doc, r, y, fin, years, money);
  doc.lastAutoTable = { finalY: y };
  y = ensure(doc, r, doc.lastAutoTable.finalY + 6, 12);
  text(doc, wrap(doc, `Assumptions: performance ratio ${finance.efficiency}%, module degradation ${finance.degradation}% per year, electricity tariff held at the current rate of ${money(tariff, 2)} per kWh. Yield from a clear-sky model for latitude ${Number(sys.lat).toFixed(1)}° with a regional cloudiness factor; no site-specific shading analysis was made. Figures are indicative and should be verified on site.`, CW, 7.5), M, y, { size: 7.5, color: MUTED, lineHeight: 1.35 });

  monthlyOutlookPages(doc, r, { monthly: totals.monthly, fin, tariff, years, finance, money });

  // 6 — price & acceptance (its table already lists every product, so there is no separate bill of materials)
  y = newPage(doc, r, 'Price & acceptance');
  y = section(doc, r, `Price summary (${currency})`, y);
  const body = [];
  for (const it of items) {
    // package: list what is bundled with "-" against it, then the package price (as in the 3D proposal)
    for (const b of it.bundle || []) body.push([b.name, [b.detail, b.qty && `Qty: ${b.qty} ${b.unit || ''}`.trim()].filter(Boolean).join(' · ') || 'Included in package', '', '-', '-']);
    body.push([it.category || it.name, it.category ? [it.name, it.detail].filter(Boolean).join(' · ') : it.detail || (it.kind === 'package' ? 'Complete package' : ''), `${formatNumber(it.qty, 2)} ${it.unit || ''}`.trim(), money(it.price), money((Number(it.qty) || 0) * (Number(it.price) || 0))]);
  }
  if (floorCost > 0) body.push(['Floor placement', `Floor ${quote.floorPlacement} installation surcharge`, '', '', money(floorCost)]);
  for (const c of charges) body.push([c.name, 'Installation charge', '', '', money(c.price)]);
  for (const it of quote.extraItems || []) {
    if (!it?.name) continue;
    body.push([it.name, it.detail || 'Additional item', `${formatNumber(it.qty, 2)} ${it.unit || ''}`.trim(), money(it.price), money((Number(it.qty) || 0) * (Number(it.price) || 0))]);
  }

  autoTable(doc, {
    ...table(),
    startY: y,
    head: [['Item', 'Description', 'Qty', 'Rate', 'Amount']],
    body,
    ...numeric(2, 3, 4),
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: INK }, 2: { halign: 'right', cellWidth: 22 }, 3: { halign: 'right', cellWidth: 26 }, 4: { halign: 'right', cellWidth: 28 } },
  });
  y = doc.lastAutoTable.finalY + 3;

  const gstExtra = pricing.withGst !== false && pricing.gstTotal > 0;
  if (pricing.discountAmount > 0) {
    autoTable(doc, { ...table(), startY: y, body: [['Discount', money(-pricing.discountAmount)]], theme: 'plain', styles: { fontSize: 9.5, textColor: BODY }, columnStyles: { 0: { cellWidth: CW - 42 }, 1: { halign: 'right', cellWidth: 42 } } });
    y = doc.lastAutoTable.finalY + 2;
  }
  if (gstExtra) {
    autoTable(doc, {
      ...table(),
      startY: y,
      body: [
        ['Taxable value', money(pricing.taxableTotal)],
        ['SGST', money(pricing.sgst)],
        ['CGST', money(pricing.cgst)],
      ],
      theme: 'plain',
      styles: { fontSize: 9.5, textColor: BODY },
      columnStyles: { 0: { cellWidth: CW - 42 }, 1: { halign: 'right', cellWidth: 42 } },
    });
    y = doc.lastAutoTable.finalY + 3;
  }
  y = ensure(doc, r, y, 26);
  doc.setFillColor(...brand.primary);
  doc.rect(M, y, CW, 13, 'F');
  text(doc, gstExtra ? 'GRAND TOTAL (INCL. GST)' : 'TOTAL INVESTMENT', M + 4, y + 8.2, { size: 8.5, style: 'bold', color: brand.primaryFg });
  text(doc, `${totals.kwp.toFixed(2)} kWp system`, M + 68, y + 8.2, { size: 8.5, color: brand.primaryFg });
  text(doc, money(pricing.total), W - M - 4, y + 8.8, { size: 13, style: 'bold', color: brand.primaryFg, align: 'right' });
  signOff(doc, r, onlineBlock(doc, r, y + 13 + 8) + 4);

  footers(doc, r);
  const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `${[slug(client.name), slug(r.title)].filter(Boolean).join('_') || 'solar-proposal'}.pdf`;
  doc.save(filename);
  return { blob: doc.output('blob'), filename };
}

/** "View this proposal online": the QR code and link, shown near the price and acceptance. Returns the y below it. */
function onlineBlock(doc, r, y) {
  if (!r.shareQr) return y;
  y = ensure(doc, r, y, 34);
  const size = 26;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(M, y, CW, size + 6);
  doc.addImage(r.shareQr, 'PNG', M + 3, y + 3, size, size, 'share-qr', 'FAST');
  const x = M + size + 9;
  text(doc, 'View this proposal online', x, y + 9, { size: 11, style: 'bold', color: INK });
  text(doc, wrap(doc, 'Scan the QR code with your phone camera, or open the link below, to see the price, the system and the 3D design any time.', CW - size - 15, 8.5), x, y + 15, { size: 8.5, color: BODY, lineHeight: 1.35 });
  text(doc, clip(doc, r.shareUrl, CW - size - 15, 8.5, 'bold'), x, y + size + 1, { size: 8.5, style: 'bold', color: r.brand.primary });
  return y + size + 6 + 6;
}

/** Building blocks for the other branded documents (receipts, invoices). */
export const pdfKit = { text, clip, wrap, tableStyle, numeric, placeImage, logoOrName, pageSize: { W, H, M, CW }, colors: { INK, BODY, MUTED, LINE, SOFT, WHITE } };
