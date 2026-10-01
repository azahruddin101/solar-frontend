'use client';

// The shadow report PDF — A4 portrait, like the proposal it can be appended to:
//   1 cover · 2–4 one page per season (3 × 2 renders with their figures) · 5 summary table,
//   season figures, how to read and methodology
// Branded with the company's logo and colour like the proposal; every number comes from the
// analysis results, never from labels typed here.

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { loadBranding } from '../branding.js';
import { formatNumber } from '../energy.js';
import { REPORT_HOURS } from './config.js';

// A4 portrait, millimetres
const W = 210;
const H = 297;
const M = 14;
const CW = W - 2 * M;

const INK = [15, 23, 42];
const BODY = [0, 0, 0];
const MUTED = [0, 0, 0];
const LINE = [226, 232, 240];
const SOFT = [248, 250, 252];
const WHITE = [255, 255, 255];
const GOOD = [22, 163, 74];
const WARN = [217, 119, 6];
const BAD = [220, 38, 38];

const pct = (v) => (v == null ? 'N/A' : `${Math.round(v)}%`);
const tone = (v) => (v == null ? MUTED : v >= 90 ? GOOD : v >= 60 ? WARN : BAD);
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ───────────── primitives ───────────── */

function text(doc, str, x, y, { size = 9, style = 'normal', color = BODY, align, maxWidth, lineHeight } = {}) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  if (lineHeight) doc.setLineHeightFactor(lineHeight);
  doc.text(str, x, y, { align, maxWidth });
  if (lineHeight) doc.setLineHeightFactor(1.15);
}

function wrap(doc, str, width, size, style = 'normal') {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  return doc.splitTextToSize(String(str ?? ''), width);
}

function clip(doc, str, width, size, style = 'normal') {
  const lines = wrap(doc, str, width, size, style);
  return lines.length > 1 ? `${lines[0].replace(/[\s,.;:-]+$/, '')}...` : lines[0] || '';
}

function hairline(doc, x1, y, x2) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
}

/** A render, placed edge to edge in its box (all renders share one aspect ratio). */
function render(doc, img, x, y, w, h) {
  doc.addImage(img.data, 'JPEG', x, y, w, h, undefined, 'FAST');
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h, 'S');
}

function logoOrName(doc, r, x, y, w, h, size = 11) {
  const logo = r.brand.logo;
  if (logo) {
    const s = Math.min(w / logo.width, h / logo.height);
    doc.addImage(logo.data, 'PNG', x, y + (h - logo.height * s) / 2, logo.width * s, logo.height * s, undefined, 'FAST');
  } else text(doc, clip(doc, r.company.name || 'Shadow analysis', w + 40, size, 'bold'), x, y + h / 2 + size * 0.12, { size, style: 'bold', color: r.brand.primary });
}

/* ───────────── page furniture ───────────── */

function pageHeader(doc, r, title, sub) {
  logoOrName(doc, r, M, 8, 40, 10);
  text(doc, title, W - M, 13, { size: 11, style: 'bold', color: INK, align: 'right' });
  if (sub) text(doc, clip(doc, sub, CW - 50, 7.5), W - M, 18, { size: 7.5, color: MUTED, align: 'right' });
  hairline(doc, M, 22, W - M);
  doc.setFillColor(...r.brand.primary);
  doc.rect(M, 21.6, 18, 0.9, 'F');
}

function newPage(doc, r, title, sub) {
  doc.addPage('a4', 'portrait');
  pageHeader(doc, r, title, sub);
  return 30;
}

/**
 * Footer on every page from `from` on (the report's own cover has none): project · location,
 * generated date, page numbers out of the whole document.
 */
function footers(doc, r, from = 2) {
  const pages = doc.getNumberOfPages();
  for (let i = from; i <= pages; i++) {
    doc.setPage(i);
    hairline(doc, M, H - 12, W - M);
    text(doc, clip(doc, `${r.meta.projectName}  |  ${r.meta.location}`, CW - 78, 7.5), M, H - 7.5, { size: 7.5, color: MUTED });
    text(doc, `Shadow analysis  |  ${r.dateLong}`, W - M - 14, H - 7.5, { size: 7.5, color: MUTED, align: 'right' });
    text(doc, `${i} / ${pages}`, W - M, H - 7.5, { size: 7.5, style: 'bold', color: INK, align: 'right' });
  }
}

/** Stat tile with a brand-coloured top edge. */
function tile(doc, r, x, y, w, h, label, value, sub) {
  doc.setFillColor(...SOFT);
  doc.rect(x, y, w, h, 'F');
  doc.setFillColor(...r.brand.primary);
  doc.rect(x, y, w, 0.9, 'F');
  text(doc, label.toUpperCase(), x + 4, y + 6.5, { size: 6.5, style: 'bold', color: MUTED });
  text(doc, clip(doc, value, w - 7, 12, 'bold'), x + 4, y + 13.5, { size: 12, style: 'bold', color: INK });
  if (sub) text(doc, clip(doc, sub, w - 7, 7), x + 4, y + 18.2, { size: 7, color: MUTED });
}

/* ───────────── pages ───────────── */

function cover(doc, r, results, summaries) {
  const { meta } = r;
  doc.setFillColor(...r.brand.primary);
  doc.rect(0, 0, W, 2.2, 'F');
  logoOrName(doc, r, M, 12, 52, 13, 13);
  text(doc, 'SHADOW ANALYSIS REPORT', W - M, 17, { size: 8.5, style: 'bold', color: MUTED, align: 'right' });
  text(doc, r.dateLong, W - M, 22, { size: 8.5, color: BODY, align: 'right' });
  hairline(doc, M, 30, W - M);

  // title block
  text(doc, 'DIRECT-SUN EXPOSURE OF THE SOLAR ARRAY ACROSS THE DAY AND THE SEASONS', M, 42, { size: 7.5, style: 'bold', color: r.brand.primary });
  text(doc, ['SOLAR SHADOW &', 'PANEL EFFICIENCY ANALYSIS'], M, 54, { size: 22, style: 'bold', color: INK, lineHeight: 1.05 });
  let y = 78;
  text(doc, clip(doc, meta.projectName, CW, 13, 'bold'), M, y, { size: 13, style: 'bold', color: INK });
  y += 6.5;
  if (meta.customer) {
    text(doc, clip(doc, `Prepared for ${meta.customer}`, CW, 9.5), M, y, { size: 9.5, color: BODY });
    y += 5.5;
  }
  const loc = wrap(doc, meta.location, CW, 9).slice(0, 2);
  text(doc, loc, M, y, { size: 9, color: MUTED });
  y += loc.length * 4.6;
  if (Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) text(doc, `${meta.lat.toFixed(5)}°, ${meta.lng.toFixed(5)}°`, M, y, { size: 8, color: MUTED });

  // hero render, full width: the brightest daylight render (first building when there's more than one)
  const hero = results.filter((x) => x.sunUp).sort((a, b) => b.effectiveOutputPercent - a.effectiveOutputPercent)[0] || results[0];
  const heroImage = hero.images[0].image;
  const hy = 112;
  const hh = CW * (heroImage.height / heroImage.width);
  render(doc, heroImage, M, hy, CW, hh);
  text(doc, clip(doc, `${hero.seasonLabel} · ${hero.timeLabel} — ${hero.sunUp ? `Effective Solar Output ${pct(hero.effectiveOutputPercent)}` : 'No direct sunlight'}  ·  render of the 3D design model`, CW, 7.5), M, hy + hh + 4.5, { size: 7.5, color: MUTED });

  // key figures: 3 + 2 tiles
  const ty = hy + hh + 11;
  const gap = 4;
  const dates = summaries.map((s) => `${s.label} ${s.dateLabel}`).join(' · ');
  const tiles = [
    ['System size', `${meta.systemKwp.toFixed(2)} kWp`, `${meta.panelCount} × ${meta.panelWatts} W`],
    ['Solar panels', String(meta.panelCount), `${meta.totalPanelArea.toFixed(1)} m² of module area`],
    ['Module', meta.moduleName, `${meta.panelWatts} W`],
    ['Obstacles modelled', String(meta.obstacles.count), meta.obstacles.count ? meta.obstacles.summary : 'none marked on the roof'],
    ['Analysis period', `${summaries.length} seasons × ${REPORT_HOURS.length} times`, dates],
  ];
  const tw3 = (CW - gap * 2) / 3;
  const tw2 = (CW - gap) / 2;
  tiles.forEach(([l, v, sub], i) => {
    const row = i < 3 ? 0 : 1;
    const w = row ? tw2 : tw3;
    const x = M + (row ? i - 3 : i) * (w + gap);
    tile(doc, r, x, ty + row * 26, w, 22, l, v, sub);
  });

  // footer band
  doc.setFillColor(...SOFT);
  doc.rect(0, H - 12, W, 12, 'F');
  const contact = [r.company.name, r.company.phone, r.company.email, r.company.website].filter(Boolean).join('   |   ');
  text(doc, clip(doc, contact ? `Prepared by ${contact}` : 'Shadow analysis', CW - 50, 7.5), M, H - 5, { size: 7.5, color: MUTED });
  text(doc, `${meta.renderWidth} × ${meta.renderHeight} px renders`, W - M, H - 5, { size: 7.5, color: MUTED, align: 'right' });
}

/** Room left on the page before the footer; a new page (with the same header) is started when a row won't fit. */
const BOTTOM = H - 18;

function seasonPage(doc, r, season, results, summary) {
  const rows = results.filter((x) => x.season === season.id);
  const buildings = r.meta.buildings?.length ? r.meta.buildings : [{ id: 'b1', name: '' }];
  const n = buildings.length;
  const title = `${season.label.toUpperCase()} — SHADOW ANALYSIS`;
  const sub = `Representative date ${summary.dateLabel}  ·  ${season.note}`;
  let y = newPage(doc, r, title, sub);

  const gap = 4;
  const iw = (CW - gap * (n - 1)) / n;
  const ih = iw * (rows[0].images[0].image.height / rows[0].images[0].image.width);
  const cap = 20;
  const rowH = ih + cap;

  rows.forEach((res) => {
    if (y + rowH > BOTTOM) y = newPage(doc, r, title, `Representative date ${summary.dateLabel} (continued)`);
    // one close-up per building, side by side, sharing this hour's figures below
    res.images.forEach((im, i) => {
      const x = M + i * (iw + gap);
      render(doc, im.image, x, y, iw, ih);
      if (n > 1) text(doc, clip(doc, im.buildingName, iw - 6, 7, 'bold'), x + 3, y + 8, { size: 7, style: 'bold', color: WHITE });
    });
    const cy = y + ih;
    text(doc, res.timeLabel, M, cy + 5.2, { size: 10, style: 'bold', color: INK });
    text(doc, res.sunUp ? `Sun altitude ${res.sunAltitude.toFixed(0)}°  ·  azimuth ${res.sunAzimuth.toFixed(0)}° ${res.sunCompass}` : `Sun below the horizon (${res.sunAltitude.toFixed(0)}°)`, M + CW, cy + 5.2, { size: 7, color: MUTED, align: 'right' });
    const half = CW / 2;
    if (res.sunUp) {
      text(doc, 'EFFECTIVE SOLAR OUTPUT', M, cy + 10.6, { size: 6.3, style: 'bold', color: MUTED });
      text(doc, pct(res.effectiveOutputPercent), M, cy + 15.8, { size: 11.5, style: 'bold', color: tone(res.effectiveOutputPercent) });
      text(doc, 'SHADED AREA', M + half, cy + 10.6, { size: 6.3, style: 'bold', color: MUTED });
      const shaded = `${pct(res.shadedAreaPercent)}  ·  ${res.shadedArea.toFixed(1)} of ${res.totalPanelArea.toFixed(1)} m²`;
      text(doc, shaded, M + half, cy + 15.8, { size: 9, style: 'bold', color: INK });
      if ((res.backlitPercent ?? 0) >= 0.5) text(doc, `${pct(res.backlitPercent)} of the area faces away from the sun`, M + half, cy + 19.4, { size: 6.3, color: MUTED });
    } else {
      text(doc, 'NO DIRECT SUNLIGHT', M, cy + 10.6, { size: 6.3, style: 'bold', color: MUTED });
      text(doc, 'Output: N/A', M, cy + 15.8, { size: 11.5, style: 'bold', color: MUTED });
      text(doc, 'SHADED AREA', M + half, cy + 10.6, { size: 6.3, style: 'bold', color: MUTED });
      text(doc, '—  not applicable', M + half, cy + 15.8, { size: 9, style: 'bold', color: MUTED });
    }
    y += rowH + 5;
  });

  // season strip
  if (y + 15 > BOTTOM) y = newPage(doc, r, title, `Representative date ${summary.dateLabel} (continued)`);
  const sy = y;
  doc.setFillColor(...SOFT);
  doc.rect(M, sy, CW, 15, 'F');
  doc.setFillColor(...r.brand.primary);
  doc.rect(M, sy, 1.2, 15, 'F');
  const items = summary.daylightCount
    ? [
        ['Minimum effective output', `${pct(summary.min.value)} at ${summary.min.timeLabel}`],
        ['Maximum effective output', `${pct(summary.max.value)} at ${summary.max.timeLabel}`],
        ['Average daytime output', pct(summary.avg)],
        ['Daylight timestamps', `${summary.daylightCount} of ${rows.length}`],
      ]
    : [['Daylight timestamps', `0 of ${rows.length} — the sun is below the horizon at every analysed time`]];
  const iwid = (CW - 8) / items.length;
  items.forEach(([l, v], i) => {
    const x = M + 6 + i * iwid;
    text(doc, l.toUpperCase(), x, sy + 5.8, { size: 6.3, style: 'bold', color: MUTED });
    text(doc, clip(doc, v, iwid - 6, 10, 'bold'), x, sy + 11.6, { size: 10, style: 'bold', color: INK });
  });
}

function summaryPage(doc, r, seasons, results, summaries) {
  const { meta } = r;
  const y0 = newPage(doc, r, 'SUMMARY — ALL SEASONS', `${results.length} sun positions  ·  ${meta.panelCount} panels  ·  ${meta.systemKwp.toFixed(2)} kWp`);
  const body = results.map((x) => [x.seasonLabel, x.timeLabel, x.sunUp ? `${x.sunAltitude.toFixed(0)}°` : 'below horizon', x.sunUp ? pct(x.effectiveOutputPercent) : 'N/A', x.sunUp ? pct(x.shadedAreaPercent) : '—']);
  autoTable(doc, {
    startY: y0,
    theme: 'plain',
    margin: { left: M, right: M, top: 30, bottom: 16 },
    styles: { font: 'helvetica', fontSize: 7.8, cellPadding: { top: 1.35, bottom: 1.35, left: 3, right: 3 }, textColor: BODY, lineColor: LINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: r.brand.primary, textColor: r.brand.primaryFg, fontStyle: 'bold', fontSize: 7.5, lineWidth: 0 },
    alternateRowStyles: { fillColor: SOFT },
    columnStyles: { 0: { fontStyle: 'bold', textColor: INK }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'right' } },
    head: [['Season', 'Time', 'Sun altitude', 'Effective Output', 'Shaded Area']],
    body,
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index >= 2) d.cell.styles.halign = 'right';
      if (d.section === 'body' && d.column.index === 3) {
        const v = results[d.row.index];
        d.cell.styles.textColor = v.sunUp ? tone(v.effectiveOutputPercent) : MUTED;
      }
      // the season name once per group
      if (d.section === 'body' && d.column.index === 0 && d.row.index > 0 && results[d.row.index - 1].season === results[d.row.index].season) d.cell.text = [''];
    },
  });

  // season figures: one card per season, side by side
  let y = doc.lastAutoTable.finalY + 7;
  const gap = 4;
  const cw = (CW - gap * (summaries.length - 1)) / summaries.length;
  const ch = 29;
  summaries.forEach((s, i) => {
    const cx = M + i * (cw + gap);
    doc.setFillColor(...SOFT);
    doc.rect(cx, y, cw, ch, 'F');
    doc.setFillColor(...r.brand.primary);
    doc.rect(cx, y, cw, 0.9, 'F');
    text(doc, s.label.toUpperCase(), cx + 4, y + 6.2, { size: 8, style: 'bold', color: INK });
    text(doc, s.dateLabel, cx + cw - 4, y + 6.2, { size: 7.5, color: MUTED, align: 'right' });
    const rows = s.daylightCount
      ? [
          ['Minimum', `${pct(s.min.value)}  ·  ${s.min.timeLabel}`],
          ['Maximum', `${pct(s.max.value)}  ·  ${s.max.timeLabel}`],
          ['Average', `${pct(s.avg)}  ·  ${s.daylightCount} daylight times`],
        ]
      : [['No daylight', 'sun below the horizon']];
    rows.forEach(([l, v], k) => {
      const ry = y + 12.5 + k * 5.2;
      text(doc, l, cx + 4, ry, { size: 7.2, color: MUTED });
      text(doc, clip(doc, v, cw - 26, 7.2, 'bold'), cx + cw - 4, ry, { size: 7.2, style: 'bold', color: INK, align: 'right' });
    });
  });
  y += ch + 9;

  // how to read (left) and methodology (right)
  const colW = (CW - 8) / 2;
  const heading = (t, x) => text(doc, t, x, y, { size: 7.5, style: 'bold', color: INK });
  heading('HOW TO READ THESE FIGURES', M);
  heading('METHODOLOGY', M + colW + 8);
  const notes = [
    '100% — the whole panel area receives direct sunlight; no obstacle shading.',
    '80% — about 20% of the panel area lies in an obstacle\'s shadow.',
    '50% — about half of the direct-sun exposure is lost to shadow.',
    'N/A — the sun is below the horizon: no direct sunlight, not obstacle shading.',
    'Averages use daylight timestamps only. Figures are area-weighted across all panels and describe direct-sun exposure, not the electrical efficiency of the PV modules.',
  ];
  let ny = y + 5.5;
  for (const n of notes) {
    const l = wrap(doc, n, colW, 7.2);
    text(doc, l, M, ny, { size: 7.2, color: BODY, lineHeight: 1.35 });
    ny += l.length * 3.45 + 1.4;
  }
  const dates = summaries.map((s) => `${s.label} ${s.dateLabel}`).join(' · ');
  const method = `For each of the ${results.length} sun positions — ${dates} at ${REPORT_HOURS.map((h) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`).join(', ')} (local solar time) — the sun's direction is calculated from the site latitude and the date, exactly as in the interactive 3D view. Every panel is sampled on a ${meta.sampling.base} × ${meta.sampling.base} grid (${meta.sampling.refined} × ${meta.sampling.refined} where a panel is partly shaded) and a ray is cast from each point towards the sun through the 3D model of the roof, parapets, tanks, rooms, trees, mounting structure and the other panels. Effective Solar Output is the share of the total panel area that receives direct sunlight; Shaded Area is the share an obstacle blocks. Both are area-weighted across all ${meta.panelCount} panels (${formatNumber(meta.raysTotal)} rays in total). When the sun is below the horizon the panels receive no direct sunlight and the output is reported as N/A rather than as shading. These percentages describe direct-sun exposure of the module surface; they are not the electrical conversion efficiency of the PV modules and do not include diffuse sky light or electrical string effects.`;
  text(doc, wrap(doc, method, colW, 6.9), M + colW + 8, y + 5.5, { size: 6.9, color: BODY, lineHeight: 1.35 });
}

async function context(meta) {
  const company = { name: '', ...(meta.company || {}) };
  return {
    meta,
    company,
    brand: await loadBranding(company),
    dateLong: meta.generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/** Cover, one page per season and the summary, starting on the document's current page. */
function drawReport(doc, r, { seasons, results, summaries }) {
  cover(doc, r, results, summaries);
  for (const s of seasons) seasonPage(doc, r, s, results, summaries.find((x) => x.id === s.id));
  summaryPage(doc, r, seasons, results, summaries);
}

/**
 * Build the PDF.
 * @returns {Promise<{blob: Blob, fileName: string}>}
 */
export async function buildShadowReportPdf({ meta, seasons, results, summaries }) {
  if (!results.length) throw new Error('There are no analysis results to put in the PDF.');
  const r = await context(meta);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${meta.projectName} - Solar shadow & panel efficiency analysis`, author: r.company.name || undefined, subject: `Shadow analysis for ${meta.customer || meta.projectName}`, creator: r.company.name || 'Solar designer' });
  drawReport(doc, r, { seasons, results, summaries });
  footers(doc, r);
  const blob = doc.output('blob');
  return { blob, fileName: `${[slug(meta.customer), slug(meta.projectName)].filter(Boolean).join('_') || 'solar'}_shadow-analysis.pdf` };
}

/**
 * Append the shadow report (A4 portrait) to another document, e.g. the proposal, as its last
 * section. Call it after everything else is drawn: its footers number pages out of the final total.
 */
export async function appendShadowReport(doc, { meta, seasons, results, summaries }) {
  if (!results.length) throw new Error('There are no analysis results to put in the PDF.');
  const r = await context(meta);
  doc.addPage('a4', 'portrait');
  const first = doc.getNumberOfPages();
  drawReport(doc, r, { seasons, results, summaries });
  footers(doc, r, first + 1);
}
