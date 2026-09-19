'use client';

// Page 1 of the proposal: a magazine-style cover.
//   header · curved photo hero with title, script tagline and a glass "benefits" panel ·
//   icon stats strip · "prepared for / by" cards · wave footer
// Decorative layers (curves over the photo, translucency, script lettering, the wave) are composed
// on a canvas and placed as images; every piece of real information stays vector text on top.

import { formatMoney, formatNumber } from './energy.js';
import { loadScriptFont } from './pdfFonts.js';
import { drawIcon, paintIcon } from './pdfIcons.js';

const W = 210; // A4 portrait, millimetres
const PX = 10; // canvas pixels per millimetre

const WHITE = [255, 255, 255];
const MUTED = [100, 116, 139];
const BODY = [51, 65, 85];
const LINE = [226, 232, 240];

const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const css = (rgb, alpha = 1) => `rgba(${rgb.join(',')},${alpha})`;

function palette(brand) {
  const { primary, accent } = brand;
  return {
    primary,
    accent,
    primaryFg: brand.primaryFg,
    ink: mix(primary, [6, 12, 20], 0.72), // headline colour: a very dark shade of the brand
    deep: mix(primary, [0, 0, 0], 0.45),
    panel: mix(primary, [244, 246, 248], 0.94),
    cream: mix(accent, WHITE, 0.9),
  };
}

function setText(doc, size, style, color) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}

const lines = (doc, str, width, size, style = 'normal') => {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  return doc.splitTextToSize(String(str ?? ''), width);
};

/** Largest size (≤ max) at which every line of `str` fits `width` in at most `maxLines` lines. */
function fitText(doc, str, width, max, min, maxLines, style = 'bold') {
  for (let size = max; size >= min; size -= 1) {
    const l = lines(doc, str, width, size, style);
    if (l.length <= maxLines) return { size, lines: l };
  }
  return { size: min, lines: lines(doc, str, width, min, style).slice(0, maxLines) };
}

const loadImage = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/** Split a tagline into two balanced lines for the script lettering. */
function twoLines(str) {
  const words = String(str || '').trim().split(/\s+/);
  if (words.length < 3) return [words.join(' ')];
  let best = 1;
  for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length) < Math.abs(words.slice(0, best).join(' ').length - words.slice(best).join(' ').length)) best = i;
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/* ───────────── canvas layers ───────────── */

const HERO = { y: 30.5, h: 126.5 };
const GLASS = { x: 171, y: 6, w: 35, h: 39 }; // relative to the hero's top-left, mm

/** The S-curve that separates the cream title area (left) from the photo (right). `dx` shifts it sideways. */
function heroCurve(ctx, w, h, dx = 0) {
  ctx.beginPath();
  ctx.moveTo(0.55 * w + dx, 0);
  ctx.bezierCurveTo(0.45 * w + dx, 0.22 * h, 0.44 * w + dx, 0.42 * h, 0.385 * w + dx, 0.6 * h);
  ctx.bezierCurveTo(0.34 * w + dx, 0.76 * h, 0.3 * w + dx, 0.9 * h, 0.245 * w + dx, h);
  ctx.lineTo(w, h);
  ctx.lineTo(w, 0);
  ctx.closePath();
}

async function heroLayer(p, snapshot, tagline, scriptTop) {
  const w = W * PX;
  const h = Math.round(HERO.h * PX);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // cream title area
  const bg = ctx.createLinearGradient(0, 0, w * 0.6, h);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, css(p.cream));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // soft swoosh hugging the curve
  heroCurve(ctx, w, h, -0.045 * w);
  ctx.fillStyle = css(p.accent, 0.16);
  ctx.fill();
  heroCurve(ctx, w, h, -0.02 * w);
  ctx.fillStyle = css(WHITE, 0.7);
  ctx.fill();

  // photo (the 3D model), cover-fitted into the curved region
  ctx.save();
  heroCurve(ctx, w, h);
  ctx.clip();
  const img = snapshot ? await loadImage(snapshot) : null;
  const rx = 0.245 * w;
  const rw = w - rx;
  if (img) {
    const s = Math.max(rw / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * s;
    const ih = img.naturalHeight * s;
    ctx.drawImage(img, rx + (rw - iw) / 2 + rw * 0.05, (h - ih) / 2, iw, ih);
    const warm = ctx.createLinearGradient(rx, 0, w, 0); // sunlit wash so the render sits in the page
    warm.addColorStop(0, css(p.cream, 0.28));
    warm.addColorStop(0.45, css(p.cream, 0.04));
    warm.addColorStop(1, css(p.cream, 0));
    ctx.fillStyle = warm;
    ctx.fillRect(rx, 0, rw, h);
  } else {
    const g = ctx.createLinearGradient(rx, 0, w, h);
    g.addColorStop(0, css(mix(p.primary, WHITE, 0.25)));
    g.addColorStop(1, css(p.deep));
    ctx.fillStyle = g;
    ctx.fillRect(rx, 0, rw, h);
    paintIcon(ctx, 'sun', w * 0.52, h * 0.18, h * 0.64, mix(p.primary, WHITE, 0.55), 1.1);
  }
  const shade = ctx.createLinearGradient(0, h * 0.62, 0, h); // keeps the white script legible
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = shade;
  ctx.fillRect(w * 0.62, h * 0.62, w * 0.38, h * 0.38);
  ctx.restore();

  // glass panel behind the three benefits
  const g = { x: GLASS.x * PX, y: GLASS.y * PX, w: GLASS.w * PX, h: GLASS.h * PX };
  ctx.beginPath();
  ctx.roundRect(g.x, g.y, g.w, g.h, 26);
  ctx.fillStyle = 'rgba(38, 48, 44, 0.58)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (const k of [1, 2]) ctx.fillRect(g.x + 22, g.y + (g.h / 3) * k, g.w - 44, 1.5);

  // script lettering
  const family = await loadScriptFont();
  const script = (text, x, y, size, color, angle) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `${size}px ${family}`;
    ctx.fillStyle = color;
    twoLines(text).forEach((line, i) => ctx.fillText(line, i * size * 0.22, i * size * 0.95));
    ctx.restore();
  };
  // sits below the address block; shrinks a little when a two-line title leaves less room
  const sy = Math.min(0.85 * h, Math.max(0.775 * h, scriptTop * PX));
  const size = sy > 0.8 * h ? 84 : 96;
  script(tagline, 0.05 * w, sy, size, css(p.ink), -0.13);
  ctx.beginPath(); // accent underline flourish
  ctx.moveTo(0.08 * w, sy + 0.15 * h);
  ctx.quadraticCurveTo(0.17 * w, sy + 0.12 * h, 0.26 * w, sy + 0.06 * h);
  ctx.strokeStyle = css(p.accent);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();
  script('Solar today, a better tomorrow', 0.815 * w, 0.875 * h, 50, 'rgba(255,255,255,0.95)', -0.13);

  return canvas.toDataURL('image/jpeg', 0.9);
}

const FOOTER = { y: 259, h: 38 };

function footerLayer(p) {
  const w = W * PX;
  const h = FOOTER.h * PX;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const wave = (top, dip, color) => {
    ctx.beginPath();
    ctx.moveTo(0, top * h);
    ctx.bezierCurveTo(0.22 * w, (top - 0.2) * h, 0.4 * w, dip * h, 0.62 * w, (dip + 0.02) * h);
    ctx.bezierCurveTo(0.8 * w, (dip + 0.03) * h, 0.9 * w, (dip - 0.2) * h, w, (dip - 0.34) * h);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  wave(0.27, 0.43, css(mix(p.primary, WHITE, 0.35), 0.55)); // thin highlight riding on the main wave
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, css(p.deep));
  g.addColorStop(1, css(mix(p.primary, [0, 0, 0], 0.62)));
  wave(0.34, 0.5, g);
  // faint leaves on the right
  ctx.save();
  ctx.globalAlpha = 0.1;
  for (const [x, y, size, rot] of [[0.8, 0.0, 0.95, 0.5], [0.9, 0.18, 0.8, -0.2], [0.7, 0.42, 0.55, 0.9]]) {
    ctx.save();
    ctx.translate(x * w, y * h);
    ctx.rotate(rot);
    paintIcon(ctx, 'leaf', 0, 0, size * h, mix(p.primary, WHITE, 0.5), 1.4);
    ctx.restore();
  }
  ctx.restore();
  return canvas.toDataURL('image/png');
}

/* ───────────── sections ───────────── */

function header(doc, r, p) {
  if (r.brand.logo) {
    const s = Math.min(82 / r.brand.logo.width, 19 / r.brand.logo.height);
    doc.addImage(r.brand.logo.data, 'PNG', 8, 6.5 + (19 - r.brand.logo.height * s) / 2, r.brand.logo.width * s, r.brand.logo.height * s, 'cover-logo', 'FAST');
  } else {
    setText(doc, 18, 'bold', p.primary);
    doc.text(lines(doc, r.company.name, 105, 18, 'bold')[0], 9, 18);
  }
  setText(doc, 11, 'bold', p.ink);
  doc.text('SOLAR PROPOSAL', 118, 12.8, { charSpace: 0.75 });
  setText(doc, 8.5, 'normal', MUTED);
  doc.text(r.ref, 118, 18.8);
  doc.text(r.date, 118, 23.4);
  doc.setFillColor(...p.accent);
  doc.rect(171.5, 8.2, 0.45, 15.6, 'F');
  setText(doc, 6.3, 'normal', MUTED);
  ['SOLAR', 'SUSTAINABLE', 'RELIABLE'].forEach((word, i) => doc.text(word, 177.5, 11.6 + i * 4.2, { charSpace: 0.55 }));
  doc.setFillColor(...p.accent); // setTextColor above also changed the fill colour
  doc.roundedRect(177.5, 22.4, 8.5, 0.8, 0.4, 0.4, 'F');
}

/** Title block metrics, shared by the canvas layer (script position) and the vector text. */
function heroLayout(doc, r) {
  // "Nair villa – 6 kW" → headline "Nair villa"; the size gets its own line below
  const name = r.title.split(/\s+[–—-]\s+|\s*\|\s*/)[0].trim() || r.title;
  let title = fitText(doc, name, 84, 38, 20, 1);
  if (title.size < 30) title = fitText(doc, name, 84, 33, 20, 2); // long names read better on two lines
  const step = title.size * 0.3528 * 1.04;
  const titleY = 18 + title.size * 0.3528 * 0.8; // first baseline, relative to the hero top
  const y = titleY + (title.lines.length - 1) * step;
  const address = lines(doc, r.address, 58, 9.5).slice(0, 2);
  return { title, step, titleY, y, address, bottom: y + 37.4 + (address.length - 1) * 4.7 };
}

function heroText(doc, r, p, totals, layout) {
  const x = 11;
  const top = HERO.y;
  setText(doc, 7.2, 'normal', p.ink);
  doc.text('ROOFTOP SOLAR POWER SYSTEM', x, top + 12.5, { charSpace: 0.95 });

  const { title, step } = layout;
  setText(doc, title.size, 'bold', p.ink);
  title.lines.forEach((l, i) => doc.text(l, x - 0.6, top + layout.titleY + i * step));
  const y = top + layout.y;

  const kwp = `${Number(totals.kwp.toFixed(2))} kWp`;
  setText(doc, 31, 'bold', p.primary);
  doc.text(kwp, x - 0.4, y + 14.5);
  setText(doc, 15.5, 'normal', p.ink);
  doc.text('Rooftop Solar System', x, y + 23.5);
  doc.setFillColor(...p.accent);
  doc.roundedRect(x, y + 28.5, 11.5, 1.25, 0.6, 0.6, 'F');

  drawIcon(doc, 'pin', x - 0.3, y + 34.2, 5.2, p.ink, 2.2);
  setText(doc, 9.5, 'normal', BODY);
  doc.text(layout.address, x + 7.5, y + 37.4, { lineHeightFactor: 1.4 });

  // benefits on the glass panel
  [['leaf', 'Lower', 'Electricity Bills'], ['house', 'Energy', 'Independence'], ['leaf', 'A Cleaner', 'Greener Planet']].forEach(([icon, a, b], i) => {
    const cy = top + GLASS.y + (GLASS.h / 3) * (i + 0.5);
    drawIcon(doc, icon, GLASS.x + 3.6, cy - 3, 6, WHITE, 1.9);
    setText(doc, 7.8, 'normal', WHITE);
    doc.text(a, GLASS.x + 12.6, cy - 0.7);
    doc.text(b, GLASS.x + 12.6, cy + 3.2);
  });
}

function stats(doc, p, design, finance) {
  const { totals, fin } = design;
  const box = { x: 6.5, y: 160.5, w: 197, h: 44 };
  doc.setFillColor(...p.panel);
  doc.roundedRect(box.x, box.y, box.w, box.h, 4.5, 4.5, 'F');
  const col = box.w / 4;
  const inr = finance.currency === 'INR';
  const items = [
    ['bolt', p.primary, 'SYSTEM SIZE', `${Number(totals.kwp.toFixed(2))} kWp`, 'Solar power system'],
    ['sun', p.accent, 'EST. ANNUAL GENERATION', `${formatNumber(totals.acKwh)} kWh`, 'Clean energy per year'],
    ['coins', p.primary, 'YEAR-1 SAVINGS', formatMoney(fin.firstYearSavings, finance.currency, { pdf: true }).replace(inr ? /^INR\s*/ : /^$/, ''), 'On electricity bills', inr],
    ['chart', p.primary, 'PAYBACK PERIOD', fin.payback ? `${fin.payback.toFixed(1)} years` : '> 25 years', 'Estimated'],
  ];
  items.forEach(([icon, color, label, value, sub, rupee], i) => {
    const x = box.x + i * col + 9;
    if (i) {
      doc.setDrawColor(...mix(p.panel, [148, 163, 184], 0.35));
      doc.setLineWidth(0.25);
      doc.line(box.x + i * col, box.y + 6, box.x + i * col, box.y + box.h - 6);
    }
    doc.setFillColor(...color);
    doc.circle(x + 5.8, box.y + 11.3, 5.9, 'F');
    drawIcon(doc, icon, x + 2.1, box.y + 7.6, 7.4, WHITE, 2.1);
    setText(doc, 7.2, 'normal', mix(p.primary, [0, 0, 0], 0.25));
    doc.text(label, x, box.y + 22.7, { charSpace: 0.12 });
    // the built-in fonts have no ₹ glyph, so it is drawn as an icon
    const fit = fitText(doc, value, col - 16 - (rupee ? 5 : 0), 20, 13, 1);
    if (rupee) drawIcon(doc, 'rupee', x - 0.9, box.y + 31.6 - fit.size * 0.29, fit.size * 0.3, p.ink, 3);
    setText(doc, fit.size, 'bold', p.ink);
    doc.text(fit.lines[0], x + (rupee ? fit.size * 0.245 : 0), box.y + 31.6);
    setText(doc, 8.6, 'normal', BODY);
    doc.text(sub, x, box.y + 38.3);
  });
}

function contactCard(doc, p, x, y, w, h, { icon, label, name, rows, note }) {
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 3, 3, 'FD');
  doc.setFillColor(...p.primary);
  doc.circle(x + 9.6, y + 9.8, 4.6, 'F');
  drawIcon(doc, icon, x + 6.7, y + 6.9, 5.8, WHITE, 2.1);
  setText(doc, 6.4, 'normal', p.primary);
  doc.text(label, x + 18, y + 8.2, { charSpace: 0.15 });
  setText(doc, 11, 'bold', p.ink);
  doc.text(lines(doc, name, w - 21, 11, 'bold')[0], x + 18, y + 13.8);

  let cy = y + 22.6;
  for (const [rowIcon, value] of rows.filter(([, v]) => v)) {
    const l = lines(doc, value, w - 23, 8.4).slice(0, 2);
    drawIcon(doc, rowIcon, x + 11.4, cy - 2.9, 3.7, mix(p.ink, WHITE, 0.2), 2.3);
    setText(doc, 8.4, 'normal', BODY);
    doc.text(l, x + 18, cy, { lineHeightFactor: 1.32 });
    cy += l.length * 3.95 + 1.35;
  }
  if (note) {
    setText(doc, 7.8, 'normal', BODY);
    doc.text(lines(doc, note, w - 20, 7.8)[0], x + 18, Math.min(cy + 0.6, y + h - 3.2));
  }
}

function cards(doc, r, p) {
  const y = 208;
  const h = 50;
  contactCard(doc, p, 7, y, 75.5, h, { icon: 'user', label: 'PREPARED FOR', name: r.client.name || 'Client', rows: [['pin', r.client.address], ['phone', r.client.phone], ['mail', r.client.email]] });
  contactCard(doc, p, 85.5, y, 72.5, h, {
    icon: 'building',
    label: 'PREPARED BY',
    name: r.company.name,
    rows: [['pin', r.company.address], ['phone', r.company.phone], ['mail', r.company.email], ['globe', r.company.website]],
    note: r.company.taxId && `GSTIN / Tax ID: ${r.company.taxId}`,
  });
  // closing note
  const x = 161;
  doc.setFillColor(...mix(p.cream, WHITE, 0.35));
  doc.roundedRect(x, y, 42.5, h, 3, 3, 'F');
  drawIcon(doc, 'sprout', x + 5.5, y + 5.5, 12.5, mix(p.primary, [101, 163, 13], 0.35), 1.8);
  setText(doc, 10.2, 'normal', p.ink);
  doc.text(['Sustainable', 'Energy,', 'Happier', 'Tomorrows'], x + 7, y + 25.5, { lineHeightFactor: 1.3 });
  doc.setFillColor(...p.accent);
  doc.roundedRect(x + 7, y + 43, 9.5, 0.9, 0.45, 0.45, 'F');
}

function footer(doc, r) {
  setText(doc, 11.5, 'bold', WHITE);
  doc.text(lines(doc, r.company.name, 80, 11.5, 'bold')[0], 11, 283.6);
  setText(doc, 8.2, 'normal', [226, 240, 232]);
  doc.text('Solar   |   Sustainable   |   Reliable', 11, 289.3);

  // contacts, laid out from the right edge
  const items = [['globe', r.company.website], ['mail', r.company.email], ['phone', r.company.phone]].filter(([, v]) => v);
  let x = W - 11;
  setText(doc, 8.3, 'normal', WHITE);
  const nameEnd = 11 + Math.min(80, doc.getTextWidth(r.company.name) * (11.5 / 8.3) * 1.08) + 8;
  for (const [icon, value] of items) {
    const tw = doc.getTextWidth(value);
    if (x - tw - 5.5 < nameEnd) break; // never run into the company name
    doc.text(value, x - tw, 288.3);
    drawIcon(doc, icon, x - tw - 5.2, 285.2, 3.9, WHITE, 2.2);
    x -= tw + 10;
  }
}

/** Draws the whole cover on the current (first) page. `r` carries brand, company, client, title, address, ref, date. */
export async function drawCover(doc, r, design, finance, snapshot) {
  const p = palette(r.brand);
  const layout = heroLayout(doc, r);
  doc.addImage(await heroLayer(p, snapshot, r.company.tagline || 'Clean energy for a brighter tomorrow', layout.bottom + 17), 'JPEG', 0, HERO.y, W, HERO.h, 'cover-hero', 'MEDIUM');
  doc.addImage(footerLayer(p), 'PNG', 0, FOOTER.y, W, FOOTER.h, 'cover-footer', 'FAST');
  header(doc, r, p);
  heroText(doc, r, p, design.totals, layout);
  stats(doc, p, design, finance);
  cards(doc, r, p);
  footer(doc, r);
}
