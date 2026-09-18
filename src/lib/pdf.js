'use client';

// Generates the downloadable PDF plan with jsPDF (vector plan + charts, raster images).

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatMoney, formatNumber } from './energy.js';
import { compassLabel } from './geo.js';
import { fitPlan, niceScaleLength } from './report.js';
import { MONTHS } from './sun.js';

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const AMBER = [245, 158, 11];
const LINE = [226, 232, 240];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

async function fetchAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) throw new Error('image unavailable');
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const imgFormat = (dataUrl) => (dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG');

function polygon(doc, pts, style) {
  if (pts.length < 2) return;
  const rel = pts.slice(1).map((p, i) => [p.x - pts[i].x, p.y - pts[i].y]);
  doc.lines(rel, pts[0].x, pts[0].y, [1, 1], style, true);
}

function header(doc, r, title) {
  doc.setFillColor(...INK);
  doc.rect(0, 0, PAGE_W, 24, 'F');
  doc.setFillColor(...AMBER);
  doc.rect(0, 24, PAGE_W, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, M, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  const addr = r.place?.address || `${r.origin.lat.toFixed(5)}, ${r.origin.lng.toFixed(5)}`;
  doc.text(doc.splitTextToSize(addr, 140)[0], M, 18);
  doc.text(r.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), PAGE_W - M, 11, { align: 'right' });
  doc.text(r.title, PAGE_W - M, 18, { align: 'right' });
}

function sectionTitle(doc, text, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(text.toUpperCase(), M, y);
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(0.6);
  doc.line(M, y + 1.8, M + 12, y + 1.8);
  return y + 7;
}

function kpis(doc, items, y) {
  const cols = 4;
  const gap = 3;
  const w = (PAGE_W - 2 * M - gap * (cols - 1)) / cols;
  const h = 17;
  items.forEach((it, i) => {
    const x = M + (i % cols) * (w + gap);
    const yy = y + Math.floor(i / cols) * (h + gap);
    if (it.accent) doc.setFillColor(255, 247, 230);
    else doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...(it.accent ? [253, 216, 150] : LINE));
    doc.setLineWidth(0.3);
    doc.roundedRect(x, yy, w, h, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...MUTED);
    doc.text(it.label.toUpperCase(), x + 3, yy + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(String(it.value), x + 3, yy + 12.5);
    if (it.unit) {
      const vw = doc.getTextWidth(String(it.value));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(it.unit, x + 4 + vw, yy + 12.5);
    }
  });
  return y + Math.ceil(items.length / cols) * (h + gap);
}

function drawPlan(doc, plan, x, y, w, h) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');
  const { map, scale } = fitPlan(plan.bounds, x + 6, y + 6, w - 12, h - 12, 0.14);
  const mp = (poly) => poly.map(map);

  if (plan.outline !== plan.footprint) {
    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([1.2, 1], 0);
    doc.setLineWidth(0.25);
    polygon(doc, mp(plan.outline), 'S');
    doc.setLineDashPattern([], 0);
  }
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  polygon(doc, mp(plan.footprint), 'FD');
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.2);
  plan.faces.forEach((f) => polygon(doc, mp(f), 'S'));

  doc.setLineWidth(0.15);
  doc.setDrawColor(255, 255, 255);
  const numbers = plan.panels.length <= 80 && scale > 2.2;
  for (const p of plan.panels) {
    if (p.valid) doc.setFillColor(30, 58, 95);
    else doc.setFillColor(239, 68, 68);
    const c = mp(p.corners);
    polygon(doc, c, 'FD');
    if (numbers) {
      const cx = c.reduce((s, q) => s + q.x, 0) / 4;
      const cy = c.reduce((s, q) => s + q.y, 0) / 4;
      doc.setFontSize(4.5);
      doc.setTextColor(203, 213, 225);
      doc.text(String(p.n), cx, cy + 0.8, { align: 'center' });
    }
  }

  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  for (const e of plan.edgeLabels) {
    const p = map({ x: e.mid.x + (e.outward.x * 4) / scale, y: e.mid.y + (e.outward.y * 4) / scale });
    let deg = (e.angle * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg < -90) deg += 180;
    doc.text(e.text, p.x, p.y, { align: 'center', angle: deg, baseline: 'middle' });
  }

  // north arrow
  const nx = x + w - 10;
  const ny = y + 12;
  doc.setFillColor(239, 68, 68);
  doc.triangle(nx, ny - 6, nx + 2.4, ny + 1.5, nx - 2.4, ny + 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text('N', nx, ny + 6, { align: 'center' });

  // scale bar
  const len = niceScaleLength(scale, 30);
  const sx = x + 6;
  const sy = y + h - 7;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.setFillColor(...INK);
  doc.rect(sx, sy, len * scale, 1.6, 'FD');
  doc.setFillColor(255, 255, 255);
  doc.rect(sx, sy, (len * scale) / 2, 1.6, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('0', sx, sy - 1.2);
  doc.text(`${len} m`, sx + len * scale, sy - 1.2, { align: 'right' });
}

function drawMonthly(doc, monthly, x, y, w, h) {
  const max = Math.max(1, ...monthly);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const padL = 14;
  const padB = 6;
  const cw = w - padL;
  const ch = h - padB;
  const yOf = (v) => y + ch * (1 - v / top);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  [0, top / 2, top].forEach((t) => {
    doc.line(x + padL, yOf(t), x + w, yOf(t));
    doc.text(formatNumber(t), x + padL - 2, yOf(t) + 1, { align: 'right' });
  });
  const bw = cw / 12;
  doc.setFillColor(...AMBER);
  monthly.forEach((v, i) => {
    const bx = x + padL + i * bw + bw * 0.2;
    doc.rect(bx, yOf(v), bw * 0.6, yOf(0) - yOf(v), 'F');
    doc.text(MONTHS[i], x + padL + i * bw + bw / 2, y + h, { align: 'center' });
    doc.setTextColor(...INK);
    doc.text(formatNumber(v), x + padL + i * bw + bw / 2, yOf(v) - 1.2, { align: 'center' });
    doc.setTextColor(...MUTED);
  });
}

const tableStyle = {
  theme: 'grid',
  styles: { fontSize: 8, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.2, textColor: INK },
  headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [248, 250, 252] },
  margin: { left: M, right: M },
};

export async function generatePdf(r) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const money = (v, decimals = 0) => formatMoney(v, r.currency, { pdf: true, decimals });
  const f = r.finance;

  // ---------- page 1: summary ----------
  header(doc, r, 'Rooftop Solar Plan');
  let y = 34;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const meta = [
    r.customer && `Customer: ${r.customer}`,
    r.preparedBy && `Prepared by: ${r.preparedBy}`,
    `Location: ${r.origin.lat.toFixed(6)}, ${r.origin.lng.toFixed(6)}`,
  ].filter(Boolean);
  doc.text(meta.join('   |   '), M, y);
  y += 6;

  y = kpis(
    doc,
    [
      { label: 'System size', value: r.totals.kwp.toFixed(2), unit: 'kWp', accent: true },
      { label: 'Panels', value: r.totals.count, unit: `x ${r.spec.watts} W` },
      { label: 'Annual energy', value: formatNumber(r.totals.acKwh), unit: 'kWh', accent: true },
      { label: 'Specific yield', value: formatNumber(r.totals.specificYield), unit: 'kWh/kWp' },
      { label: 'System cost', value: money(f.cost) },
      { label: 'Year-1 savings', value: money(f.firstYearSavings) },
      { label: 'Payback', value: f.payback ? f.payback.toFixed(1) : '> 25', unit: 'years' },
      { label: 'CO2 avoided', value: (r.co2Kg / 1000).toFixed(1), unit: 't/year' },
    ],
    y,
  );
  y += 4;

  y = sectionTitle(doc, '3D model', y);
  if (r.snapshot) {
    try {
      const { w, h } = await loadImage(r.snapshot);
      const maxW = PAGE_W - 2 * M;
      const maxH = 110;
      const s = Math.min(maxW / w, maxH / h);
      doc.addImage(r.snapshot, imgFormat(r.snapshot), M + (maxW - w * s) / 2, y, w * s, h * s);
      y += h * s + 6;
    } catch {
      y += 4;
    }
  } else {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('No 3D snapshot captured.', M, y + 4);
    y += 10;
  }

  y = sectionTitle(doc, 'System details', y);
  autoTable(doc, {
    ...tableStyle,
    startY: y,
    theme: 'plain',
    styles: { ...tableStyle.styles, lineWidth: 0 },
    columnStyles: { 0: { textColor: MUTED, cellWidth: 38 }, 2: { textColor: MUTED, cellWidth: 38 } },
    body: [
      ['Panel model', `${r.spec.name} (${r.spec.length.toFixed(2)} x ${r.spec.width.toFixed(2)} m)`, 'Footprint area', `${r.footprintArea.toFixed(1)} m²`],
      ['Roof', `${r.roof.type}${r.roof.pitch ? `, ${r.roof.pitch}° pitch` : ''}`, 'Building height', `${r.roof.ridgeH.toFixed(1)} m (${r.building.floors} floors)`],
      ['Panel area', `${r.totals.panelArea.toFixed(1)} m²`, 'Coverage', `${(r.coverage * 100).toFixed(0)}% of footprint`],
      ['System efficiency', `${f.efficiency}%`, 'Yield basis', r.yieldSource === 'google' ? 'Google Solar API' : 'Irradiance model'],
    ],
  });

  // ---------- page 2: site & layout ----------
  doc.addPage();
  header(doc, r, 'Site & Roof Layout');
  y = 34;
  y = sectionTitle(doc, 'Site', y);
  const siteSize = 78;
  let siteDrawn = false;
  if (r.siteImageUrl) {
    try {
      const data = await fetchAsDataUrl(r.siteImageUrl);
      doc.addImage(data, imgFormat(data), M, y, siteSize, siteSize);
      siteDrawn = true;
    } catch {
      /* static map unavailable */
    }
  }
  if (!siteDrawn) {
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y, siteSize, siteSize, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Satellite image unavailable', M + siteSize / 2, y + siteSize / 2, { align: 'center' });
  }
  const colX = M + siteSize + 8;
  const colW = PAGE_W - M - colX;
  autoTable(doc, {
    ...tableStyle,
    startY: y,
    margin: { left: colX, right: M },
    tableWidth: colW,
    head: [['Google Solar API', '']],
    body: r.solar
      ? [
          ['Imagery quality', r.solar.quality || '-'],
          ['Imagery date', r.solar.imageryDate ? `${r.solar.imageryDate.month}/${r.solar.imageryDate.year}` : '-'],
          ['Max panels (Google)', formatNumber(r.solar.maxPanels)],
          ['Max array area', `${formatNumber(r.solar.maxArea)} m²`],
          ['Peak sunshine', `${formatNumber(r.solar.maxSunshine)} h/yr`],
          ['Whole roof area', `${formatNumber(r.solar.roofArea)} m²`],
          ['Roof segments', String(r.solar.segments.length)],
        ]
      : [['Status', 'No Solar API data for this building'], ['Estimates', 'Clear-sky model with regional cloudiness factor']],
  });
  y += siteSize + 8;

  y = sectionTitle(doc, 'Roof layout plan', y);
  const planH = 105;
  drawPlan(doc, r.plan, M, y, PAGE_W - 2 * M, planH);
  y += planH + 8;

  y = sectionTitle(doc, 'Array configuration', y);
  autoTable(doc, {
    ...tableStyle,
    startY: y,
    head: [['Panels', 'Tilt', 'Facing', 'Capacity', 'Energy / year', 'Orientation eff.']],
    body: r.groups.map((g) => [
      g.count,
      `${g.tilt}°`,
      `${g.azimuth}° ${compassLabel(g.azimuth)}`,
      `${g.kwp.toFixed(2)} kWp`,
      `${formatNumber(g.acKwh)} kWh`,
      g.efficiency ? `${(g.efficiency * 100).toFixed(0)}%` : '-',
    ]),
    foot: [['' + r.totals.count, '', '', `${r.totals.kwp.toFixed(2)} kWp`, `${formatNumber(r.totals.acKwh)} kWh`, '']],
    footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: 'bold' },
  });

  // ---------- page 3: energy & finance ----------
  doc.addPage();
  header(doc, r, 'Energy & Financials');
  y = 34;
  y = sectionTitle(doc, 'Monthly production (kWh)', y);
  drawMonthly(doc, r.totals.monthly, M, y, PAGE_W - 2 * M, 55);
  y += 63;

  y = sectionTitle(doc, `Financial outlook (${r.currency})`, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `Tariff ${money(f.tariff, 2)}/kWh (+${f.escalation}%/yr)  |  Cost ${money(f.costPerKw)}/kWp  |  Degradation ${f.degradation}%/yr`,
    M,
    y,
  );
  autoTable(doc, {
    ...tableStyle,
    startY: y + 3,
    head: [['Year', 'Energy', 'Tariff', 'Savings', 'Cumulative savings', 'Net position']],
    body: f.rows
      .filter((row) => [1, 2, 3, 5, 7, 10, 15, 20, 25].includes(row.year))
      .map((row) => [row.year, `${formatNumber(row.energy)} kWh`, money(row.rate, 2), money(row.savings), money(row.cumulative), money(row.net)]),
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const row = f.rows.filter((rr) => [1, 2, 3, 5, 7, 10, 15, 20, 25].includes(rr.year))[data.row.index];
        data.cell.styles.textColor = row.net >= 0 ? [4, 120, 87] : [220, 38, 38];
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  y = kpis(
    doc,
    [
      { label: 'Investment', value: money(f.cost) },
      { label: '25-yr savings', value: money(f.lifetimeSavings), accent: true },
      { label: 'Payback', value: f.payback ? f.payback.toFixed(1) : '> 25', unit: 'years' },
      { label: 'ROI (25 yr)', value: `${f.roi.toFixed(0)}%` },
      { label: 'Lifetime energy', value: formatNumber(f.lifetimeEnergy / 1000, 1), unit: 'MWh' },
      { label: 'CO2 avoided / yr', value: formatNumber(r.co2Kg), unit: 'kg' },
      { label: 'Trees equivalent', value: formatNumber(r.trees), unit: '/ yr' },
      { label: 'Grid factor', value: formatNumber(r.carbonFactor), unit: 'kg/MWh' },
    ],
    y,
  );
  y += 4;

  y = sectionTitle(doc, 'Assumptions & notes', y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  const notes = [
    r.yieldSource === 'google'
      ? 'Annual yield is calibrated per roof with Google Solar API sunshine quantiles; orientation effects use an hourly sun-path model.'
      : 'No Google Solar API data was available; yield uses a clear-sky sun-path model scaled by a regional cloudiness factor.',
    `Optimal orientation for this latitude: ${r.optimal ? `${r.optimal.tilt.toFixed(0)}° tilt facing ${compassLabel(r.optimal.azimuth)}` : '-'}.`,
    'Shading from nearby obstructions and between rows is only captured through the Solar API calibration; confirm with a site survey.',
    'Financial figures are indicative, exclude subsidies, net-metering rules, financing costs and maintenance.',
  ];
  notes.forEach((n) => {
    const lines = doc.splitTextToSize(`- ${n}`, PAGE_W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 3.6 + 1;
  });

  // footers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
    doc.text('Generated with Rooftop Solar Planner - estimates only, not an engineering design.', M, PAGE_H - 7.5);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 7.5, { align: 'right' });
  }

  const slug = (r.title || 'solar-plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'solar-plan';
  doc.save(`${slug}.pdf`);
}
