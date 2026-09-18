'use client';

// PDF drawing set: cover/summary, PV array layout (A4 landscape with title block),
// electrical (strings, SLD, BOM) and energy/financials.

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatMoney, formatNumber } from './energy.js';
import { compassLabel } from './geo.js';
import { rectPoly } from './geometry.js';
import { MONTHS } from './sun.js';

const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const LINE = [203, 213, 225];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function poly(doc, pts, style) {
  doc.lines(pts.slice(1).map((p, i) => [p.x - pts[i].x, p.y - pts[i].y]), pts[0].x, pts[0].y, [1, 1], style, true);
}

function fit(bb, x, y, w, h, pad = 0.08) {
  const scale = Math.min(w / ((bb.maxX - bb.minX) * (1 + 2 * pad) || 1), h / ((bb.maxY - bb.minY) * (1 + 2 * pad) || 1));
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  return { scale, map: (p) => ({ x: x + w / 2 + (p.x - cx) * scale, y: y + h / 2 - (p.y - cy) * scale }) };
}

function titleBlock(doc, r, sheet, title, W, H) {
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.rect(7, 7, W - 14, H - 14);
  const bh = 22;
  const y = H - 7 - bh;
  doc.line(7, y, W - 7, y);
  const cols = [7, W * 0.38, W * 0.62, W * 0.8, W - 7];
  cols.slice(1, -1).forEach((x) => doc.line(x, y, x, H - 7));
  const cell = (i, label, value, big) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), cols[i] + 3, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(big ? 12 : 9);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(String(value), cols[i + 1] - cols[i] - 6).slice(0, 2), cols[i] + 3, y + 11);
  };
  cell(0, 'Project', `${r.title}\n${r.address}`);
  cell(1, 'Drawing title', title, true);
  cell(2, 'System', `${r.totals.kwp.toFixed(2)} kWp · ${r.totals.count} modules`);
  cell(3, 'Sheet / Date', `${sheet}   ${r.date}`);
}

function header(doc, r, title) {
  doc.setFillColor(...INK);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 14, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(doc.splitTextToSize(r.address, 150)[0], 14, 16.5);
  doc.text(r.date, 196, 10, { align: 'right' });
}

function section(doc, text, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(text.toUpperCase(), 14, y);
  return y + 5;
}

function kpis(doc, items, y) {
  const w = (182 - 9) / 4;
  items.forEach((it, i) => {
    const x = 14 + (i % 4) * (w + 3);
    const yy = y + Math.floor(i / 4) * 19;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...LINE);
    doc.roundedRect(x, yy, w, 16, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(it[0].toUpperCase(), x + 3, yy + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(String(it[1]), x + 3, yy + 12);
  });
  return y + Math.ceil(items.length / 4) * 19 + 3;
}

const table = { theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6, lineColor: LINE, lineWidth: 0.2, textColor: INK }, headStyles: { fillColor: INK, textColor: 255 }, margin: { left: 14, right: 14 } };

function drawLayout(doc, design, x, y, w, h, colorStrings) {
  const pts = [...design.sections.flatMap((s) => s.poly), ...design.tables.flatMap((t) => t.poly)];
  const bb = { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) };
  const { map, scale } = fit(bb, x, y, w, h);
  const { stringOf, strings } = design.electrical;
  for (const s of design.sections) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.6);
    poly(doc, s.poly.map(map), 'FD');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    s.poly.forEach((a, i) => {
      const b = s.poly[(i + 1) % s.poly.length];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l * scale < 14) return;
      const m = map({ x: (a.x + b.x) / 2 + ((b.y - a.y) / l) * (4 / scale), y: (a.y + b.y) / 2 - ((b.x - a.x) / l) * (4 / scale) });
      let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      doc.text(`${l.toFixed(2)} m`, m.x, m.y, { align: 'center', angle: deg, baseline: 'middle' });
    });
  }
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1, 1], 0);
  doc.setDrawColor(100, 116, 139);
  for (const b of design.blocks) {
    doc.setFillColor(226, 232, 240);
    poly(doc, rectPoly(b.x, b.y, b.w, b.d, b.rot || 0).map(map), 'FD');
  }
  for (const t of design.trees) {
    const c = map(t);
    doc.setFillColor(220, 252, 231);
    doc.circle(c.x, c.y, t.r * scale, 'FD');
  }
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.12);
  for (const t of design.tables) {
    if (!t.valid) continue;
    for (const m of t.modules) {
      const s = stringOf.get(m.id);
      doc.setFillColor(...(colorStrings && s != null ? hex(strings[s].color) : [30, 58, 138]));
      poly(doc, m.corners.map(map), 'FD');
    }
  }
  // north arrow + scale bar
  const nx = x + w - 8;
  doc.setFillColor(239, 68, 68);
  doc.triangle(nx, y + 4, nx + 2.5, y + 12, nx - 2.5, y + 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text('N', nx, y + 16.5, { align: 'center' });
  const len = [1, 2, 5, 10, 20, 50].reduce((b, o) => (Math.abs(o * scale - 30) < Math.abs(b * scale - 30) ? o : b), 1);
  doc.setFillColor(...INK);
  doc.rect(x + 3, y + h - 4, len * scale, 1.2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`${len} m  (1:${Math.round(1000 / scale)})`, x + 3, y + h - 5.5);
  if (colorStrings) {
    strings.slice(0, 14).forEach((s, i) => {
      doc.setFillColor(...hex(s.color));
      doc.rect(x + 3 + i * 17, y + 2, 3, 3, 'F');
      doc.text(`${s.name} (${s.count})`, x + 7 + i * 17, y + 4.5);
    });
  }
}

function drawSld(doc, el, spec, x, y) {
  const boxes = [['PV ARRAY', `${el.strings.length} strings`, `${el.kwp.toFixed(2)} kWp`], ['DCDB', 'Fuse + SPD', ''], ['INVERTER', `${el.inverterCount} x ${el.inverter.kw} kW`, ''], ['ACDB', 'MCB + SPD', ''], ['NET METER', '', ''], ['GRID', 'LT panel', '']];
  boxes.forEach((b, i) => {
    const bx = x + i * 31;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.rect(bx, y, 25, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...INK);
    doc.text(b[0], bx + 12.5, y + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(b[1], bx + 12.5, y + 9.5, { align: 'center' });
    doc.text(b[2], bx + 12.5, y + 13, { align: 'center' });
    if (i < 5) {
      doc.setDrawColor(...(i < 2 ? [220, 38, 38] : [37, 99, 235]));
      doc.line(bx + 25, y + 8, bx + 31, y + 8);
    }
  });
}

export async function generatePdf({ design, project, place, finance, snapshot }) {
  const r = {
    title: project.name || 'Rooftop Solar Plan',
    address: place?.address || `${design.origin.lat.toFixed(5)}, ${design.origin.lng.toFixed(5)}`,
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    totals: design.totals,
  };
  const money = (v, d = 0) => formatMoney(v, finance.currency, { pdf: true, decimals: d });
  const { totals, fin, electrical: el, spec } = design;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

  // 1 — summary
  header(doc, r, r.title);
  let y = 30;
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text([project.customer && `Customer: ${project.customer}`, project.preparedBy && `Prepared by: ${project.preparedBy}`, `Location: ${design.origin.lat.toFixed(6)}, ${design.origin.lng.toFixed(6)}`].filter(Boolean).join('   |   '), 14, y);
  y = kpis(doc, [['System size', `${totals.kwp.toFixed(2)} kWp`], ['Modules', `${totals.count} x ${spec.watts} W`], ['Annual energy', `${formatNumber(totals.acKwh)} kWh`], ['Specific yield', `${formatNumber(totals.specificYield)} kWh/kWp`], ['System cost', money(fin.cost)], ['Year-1 savings', money(fin.firstYearSavings)], ['Payback', fin.payback ? `${fin.payback.toFixed(1)} years` : '> 25 years'], ['Shading loss', `${totals.shadeLossPct.toFixed(1)} %`]], y + 5);
  y = section(doc, '3D model', y + 3);
  if (snapshot) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = snapshot; }).catch(() => null);
    if (img) {
      const s = Math.min(182 / img.naturalWidth, 105 / img.naturalHeight);
      doc.addImage(snapshot, 'JPEG', 14 + (182 - img.naturalWidth * s) / 2, y, img.naturalWidth * s, img.naturalHeight * s);
      y += img.naturalHeight * s + 7;
    }
  }
  y = section(doc, 'Roof & structure', y);
  autoTable(doc, { ...table, startY: y, head: [['Roof section', 'Area', 'Height', 'Parapet']], body: design.sections.map((s) => [s.name, `${(Math.abs(s.poly.reduce((a, p, i) => a + p.x * s.poly[(i + 1) % s.poly.length].y - s.poly[(i + 1) % s.poly.length].x * p.y, 0)) / 2).toFixed(1)} m²`, `${s.height} m`, `${s.parapetH} m x ${s.parapetT} m`]) });
  autoTable(doc, { ...table, startY: doc.lastAutoTable.finalY + 4, head: [['Modules', 'Tilt', 'Facing', 'Energy / yr']], body: totals.groups.map((g) => [g.count, `${g.tilt}°`, `${g.azimuth}° ${compassLabel(g.azimuth)}`, `${formatNumber(g.dc * finance.efficiency / 100)} kWh`]) });

  // 2, 3 — drawings (landscape)
  for (const [sheet, title, colored] of [['E-01', 'PV ARRAY LAYOUT', false], ['E-02', 'STRING LAYOUT', true]]) {
    doc.addPage('a4', 'landscape');
    titleBlock(doc, r, sheet, title, 297, 210);
    drawLayout(doc, design, 12, 12, 273, 152, colored);
  }

  // 4 — structure table + electrical
  doc.addPage('a4', 'portrait');
  header(doc, r, 'Electrical & Structure');
  y = section(doc, 'Single line diagram', 32);
  drawSld(doc, el, spec, 14, y);
  y = section(doc, 'Strings', y + 26);
  autoTable(doc, { ...table, startY: y, head: [['String', 'Modules', 'Power', 'Voc STC', 'Voc cold', 'Isc', 'Inverter']], body: el.strings.map((s) => [s.name, s.count, `${s.kwp.toFixed(2)} kWp`, `${s.voc.toFixed(0)} V`, `${s.vocCold.toFixed(0)} V`, `${s.isc} A`, `INV-${s.inverter}`]) });
  y = section(doc, 'Mounting structure schedule', doc.lastAutoTable.finalY + 8);
  autoTable(doc, { ...table, startY: y, head: [['Table', 'Type', 'Modules', 'Tilt', 'Front leg', 'Back leg', 'Legs']], body: design.tables.filter((t) => t.valid).map((t, i) => [`T${i + 1}`, t.kind === 'elevated' ? 'Elevated' : 'Standard', `${t.rows} x ${t.cols}`, `${t.tilt}°`, `${t.frontLeg.toFixed(2)} m`, `${t.backLeg.toFixed(2)} m`, t.legs.length]) });
  doc.addPage();
  header(doc, r, 'Bill of Materials');
  autoTable(doc, { ...table, startY: 30, head: [['#', 'Item', 'Specification', 'Qty', 'Unit']], body: el.bom.map((b, i) => [i + 1, ...b]) });

  // energy & finance
  doc.addPage();
  header(doc, r, 'Energy & Financials');
  y = section(doc, 'Monthly production (kWh)', 32);
  const max = Math.max(1, ...totals.monthly);
  totals.monthly.forEach((v, i) => {
    const bw = 182 / 12;
    const bh = (v / max) * 42;
    doc.setFillColor(245, 165, 36);
    doc.rect(14 + i * bw + 2, y + 46 - bh, bw - 4, bh, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(...INK);
    doc.text(formatNumber(v), 14 + i * bw + bw / 2, y + 44 - bh, { align: 'center' });
    doc.setTextColor(...MUTED);
    doc.text(MONTHS[i], 14 + i * bw + bw / 2, y + 50, { align: 'center' });
  });
  y = section(doc, `Financial outlook (${finance.currency})`, y + 60);
  const rows = fin.rows.filter((x) => [1, 2, 3, 5, 7, 10, 15, 20, 25].includes(x.year));
  autoTable(doc, { ...table, startY: y, head: [['Year', 'Energy', 'Tariff', 'Savings', 'Cumulative', 'Net position']], body: rows.map((x) => [x.year, `${formatNumber(x.energy)} kWh`, money(x.rate, 2), money(x.savings), money(x.cumulative), money(x.net)]) });
  y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(`Assumptions: performance ratio ${finance.efficiency}%, degradation ${finance.degradation}%/yr, tariff escalation ${finance.escalation}%/yr. Yield ${design.yieldModel.source === 'google' ? 'calibrated with Google Solar API sunshine data' : 'from a clear-sky model with regional cloudiness factor'}; shading from parapets, raised roofs, obstructions, trees and adjacent tables computed hourly for 12 representative days. Indicative only - verify on site.`, 182), 14, y);

  doc.save(`${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
}
