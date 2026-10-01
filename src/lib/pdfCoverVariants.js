'use client';

// The alternative front pages of the proposal (see coverStyles.js). They carry the same information
// as the magazine cover in pdfCover.js and reuse its stats strip and contact cards — only the
// composition changes. Pictures and gradients are composed on a canvas, text stays vector.

import { coverStyle } from './coverStyles.js';
import { BODY, LINE, PX, W, WHITE, cards, contactCard, css, drawCover, fitText, footer, header, lines, loadImage, mix, palette, setText, stats } from './pdfCover.js';
import { drawIcon, paintIcon } from './pdfIcons.js';

const H = 297;
const PT = 0.3528; // millimetres per point
const TAGLINE = 'Clean energy for a brighter tomorrow';

/** "Nair villa – 6 kW" → "Nair villa" (the size is printed on its own line). */
const headline = (r) => r.title.split(/\s+[–—-]\s+|\s*\|\s*/)[0].trim() || r.title;
const kwpText = (totals) => `${Number(totals.kwp.toFixed(2))} kWp`;

/** Right-aligned text; jsPDF's own alignment ignores `charSpace`. */
function rightText(doc, str, x, y, charSpace = 0) {
  doc.text(str, x - doc.getTextWidth(str) - charSpace * str.length, y, { charSpace });
}

/**
 * The cover picture (the 3D render, cover-fitted) as a JPEG of w × h millimetres; without a render,
 * brand artwork. `radius` rounds the corners on white, `over(ctx, w, h)` paints on top of the picture.
 */
async function photoLayer(p, snapshot, w, h, { radius = 0, over } = {}) {
  const cw = Math.round(w * PX);
  const ch = Math.round(h * PX);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  if (radius) {
    ctx.beginPath();
    ctx.roundRect(0, 0, cw, ch, radius * PX);
    ctx.clip();
  }
  const img = snapshot ? await loadImage(snapshot) : null;
  if (img) {
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    ctx.drawImage(img, (cw - img.naturalWidth * s) / 2, (ch - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  } else {
    const g = ctx.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, css(mix(p.primary, WHITE, 0.25)));
    g.addColorStop(1, css(p.deep));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    const size = Math.min(cw, ch) * 0.7;
    paintIcon(ctx, 'sun', cw - size * 1.05, (ch - size) / 2, size, mix(p.primary, WHITE, 0.55), 1.1);
  }
  over?.(ctx, cw, ch);
  ctx.restore();
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** The logo on a white plate (so any logo reads on a dark ground), or the company name in white. */
function logoPlate(doc, r, x, y, w, h) {
  const { logo } = r.brand;
  if (!logo) {
    setText(doc, 15, 'bold', WHITE);
    doc.text(lines(doc, r.company.name, w, 15, 'bold').slice(0, 2), x, y + 8, { lineHeightFactor: 1.15 });
    return;
  }
  const s = Math.min((w - 8) / logo.width, (h - 6) / logo.height);
  const lw = logo.width * s;
  const lh = logo.height * s;
  doc.setFillColor(...WHITE);
  doc.roundedRect(x, y, lw + 8, h, 2.5, 2.5, 'F');
  doc.addImage(logo.data, 'PNG', x + 4, y + (h - lh) / 2, lw, lh, 'cover-logo', 'FAST');
}

/* ───────────── full photo ───────────── */

async function photoCover(doc, r, design, finance, snapshot) {
  const p = palette(r.brand);
  const ph = 158; // the picture's height
  const img = await photoLayer(p, snapshot, W, ph, {
    over: (ctx, w, h) => {
      const top = ctx.createLinearGradient(0, 0, 0, h * 0.32); // behind the header
      top.addColorStop(0, 'rgba(0,0,0,0.6)');
      top.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, w, h * 0.32);
      const bottom = ctx.createLinearGradient(0, h * 0.42, 0, h); // behind the title
      bottom.addColorStop(0, css(p.deep, 0));
      bottom.addColorStop(0.55, css(mix(p.deep, [0, 0, 0], 0.35), 0.78));
      bottom.addColorStop(1, css(mix(p.deep, [0, 0, 0], 0.5), 0.94));
      ctx.fillStyle = bottom;
      ctx.fillRect(0, h * 0.42, w, h * 0.58);
    },
  });
  doc.addImage(img, 'JPEG', 0, 0, W, ph, 'cover-photo', 'MEDIUM');

  // header, on the picture
  logoPlate(doc, r, 9, 8, 70, 19);
  setText(doc, 11, 'bold', WHITE);
  rightText(doc, 'SOLAR PROPOSAL', W - 10, 13.2, 0.75);
  setText(doc, 8.5, 'normal', [235, 240, 245]);
  [r.ref, `Created on ${r.date}`, r.validUntil && `Valid until ${r.validUntil}`].filter(Boolean).forEach((t, i) => rightText(doc, t, W - 10, 18.8 + i * 4.4));

  // title block, built upwards from the picture's bottom edge
  const x = 12;
  const address = lines(doc, r.address, 130, 9.5).slice(0, 2);
  const addressY = ph - 9 - (address.length - 1) * 4.7;
  const kwpY = addressY - 10.5;
  const title = fitText(doc, headline(r), 170, 34, 20, 2);
  const step = title.size * PT * 1.04;
  const titleY = kwpY - 14 - (title.lines.length - 1) * step;

  setText(doc, 7.2, 'normal', WHITE);
  doc.text('ROOFTOP SOLAR POWER SYSTEM', x, titleY - title.size * PT - 2.5, { charSpace: 0.95 });
  setText(doc, title.size, 'bold', WHITE);
  title.lines.forEach((l, i) => doc.text(l, x - 0.6, titleY + i * step));
  setText(doc, 27, 'bold', WHITE);
  const kwp = kwpText(design.totals);
  doc.text(kwp, x - 0.4, kwpY);
  const kw = doc.getTextWidth(kwp);
  setText(doc, 14, 'normal', WHITE);
  doc.text('Rooftop Solar System', x + kw + 4, kwpY);
  doc.setFillColor(...p.accent);
  doc.roundedRect(x, kwpY + 3, 11.5, 1.25, 0.6, 0.6, 'F');
  if (address.length) {
    drawIcon(doc, 'pin', x - 0.3, addressY - 3.6, 4.6, WHITE, 2.2);
    setText(doc, 9.5, 'normal', WHITE);
    doc.text(address, x + 6.5, addressY, { lineHeightFactor: 1.4 });
  }

  stats(doc, p, design, finance, { y: ph + 4 });
  cards(doc, r, p, ph + 52);

  // flat footer band
  doc.setFillColor(...mix(p.primary, [0, 0, 0], 0.55));
  doc.rect(0, 272, W, H - 272, 'F');
  doc.setFillColor(...p.accent);
  doc.rect(0, 272, W, 1.2, 'F');
  footer(doc, r);
}

/* ───────────── side panel ───────────── */

const PANEL = 76; // the brand column's width

function panelLayer(p) {
  const w = PANEL * PX;
  const h = H * PX;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, css(mix(p.primary, [0, 0, 0], 0.22)));
  g.addColorStop(1, css(mix(p.primary, [0, 0, 0], 0.66)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.09; // faint sun, half off the column
  paintIcon(ctx, 'sun', -w * 0.45, h * 0.47, w * 1.35, WHITE, 0.9);
  ctx.globalAlpha = 1;
  ctx.fillStyle = css(p.accent);
  ctx.fillRect(w - 1.2 * PX, 0, 1.2 * PX, h);
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function panelCover(doc, r, design, finance, snapshot) {
  const p = palette(r.brand);
  const soft = mix(p.primary, WHITE, 0.86); // secondary text on the column
  doc.addImage(panelLayer(p), 'JPEG', 0, 0, PANEL, H, 'cover-panel', 'MEDIUM');
  const x = 9;
  const iw = PANEL - 2 * x - 1; // text width inside the column

  logoPlate(doc, r, x, 10, iw, 22);
  setText(doc, 10.5, 'bold', WHITE);
  doc.text('SOLAR PROPOSAL', x, 46, { charSpace: 0.75 });
  doc.setFillColor(...p.accent);
  doc.roundedRect(x, 49.2, 11.5, 1.2, 0.6, 0.6, 'F');
  setText(doc, 8.2, 'normal', soft);
  [r.ref, `Created on ${r.date}`, r.validUntil && `Valid until ${r.validUntil}`].filter(Boolean).forEach((t, i) => doc.text(t, x, 57.5 + i * 4.5));

  // title
  setText(doc, 6.2, 'normal', soft);
  doc.text('ROOFTOP SOLAR POWER SYSTEM', x, 86, { charSpace: 0.45 });
  const title = fitText(doc, headline(r), iw, 26, 15, 3);
  const step = title.size * PT * 1.06;
  const titleY = 90 + title.size * PT * 0.8;
  setText(doc, title.size, 'bold', WHITE);
  title.lines.forEach((l, i) => doc.text(l, x - 0.3, titleY + i * step));
  let y = titleY + (title.lines.length - 1) * step;
  setText(doc, 25, 'bold', WHITE);
  doc.text(kwpText(design.totals), x - 0.3, y + 13.5);
  setText(doc, 11.5, 'normal', soft);
  doc.text('Rooftop Solar System', x, y + 20);
  const address = lines(doc, r.address, iw - 7, 8.4).slice(0, 3);
  if (address.length) {
    drawIcon(doc, 'pin', x - 0.3, y + 25, 4.4, WHITE, 2.2);
    setText(doc, 8.4, 'normal', WHITE);
    doc.text(address, x + 6.2, y + 28.4, { lineHeightFactor: 1.35 });
  }

  // prepared by
  y = 198;
  doc.setDrawColor(...mix(p.primary, WHITE, 0.45));
  doc.setLineWidth(0.25);
  doc.line(x, y - 7, PANEL - x - 1, y - 7);
  setText(doc, 6.4, 'normal', soft);
  doc.text('PREPARED BY', x, y, { charSpace: 0.15 });
  setText(doc, 11, 'bold', WHITE);
  doc.text(lines(doc, r.company.name, iw, 11, 'bold')[0], x, y + 5.8);
  let cy = y + 13;
  for (const [icon, value] of [['pin', r.company.address], ['phone', r.company.phone], ['mail', r.company.email], ['globe', r.company.website]].filter(([, v]) => v)) {
    const l = lines(doc, value, iw - 6.5, 8).slice(0, 2);
    drawIcon(doc, icon, x, cy - 2.9, 3.7, WHITE, 2.3);
    setText(doc, 8, 'normal', WHITE);
    doc.text(l, x + 6.2, cy, { lineHeightFactor: 1.32 });
    cy += l.length * 3.95 + 1.5;
  }
  if (r.company.taxId) {
    setText(doc, 7.4, 'normal', soft);
    doc.text(lines(doc, `GSTIN / Tax ID: ${r.company.taxId}`, iw, 7.4)[0], x, cy + 1);
  }
  if (r.shareQr) {
    const qy = 256;
    doc.setFillColor(...WHITE);
    doc.roundedRect(x, qy, 30, 30, 2.5, 2.5, 'F');
    doc.addImage(r.shareQr, 'PNG', x + 2, qy + 2, 26, 26, 'share-qr', 'FAST');
    setText(doc, 7.2, 'bold', WHITE);
    doc.text(['SCAN TO', 'VIEW THIS', 'PROPOSAL', 'ONLINE'], x + 33.5, qy + 10, { lineHeightFactor: 1.4 });
  }

  // right-hand side: picture, figures, client
  const rx = PANEL + 6;
  const rw = W - rx - 6;
  doc.addImage(await photoLayer(p, snapshot, rw, 104, { radius: 4.5 }), 'JPEG', rx, 10, rw, 104, 'cover-photo', 'MEDIUM');
  stats(doc, p, design, finance, { x: rx, y: 119, w: rw }, [0, 1]);
  stats(doc, p, design, finance, { x: rx, y: 166, w: rw }, [2, 3]);
  contactCard(doc, p, rx, 215, rw, 46, { icon: 'user', label: 'PREPARED FOR', name: r.client.name || 'Client', rows: [['pin', r.client.address], ['phone', r.client.phone], ['mail', r.client.email]] });

  // closing note
  doc.setFillColor(...mix(p.cream, WHITE, 0.35));
  doc.roundedRect(rx, 266, rw, 23, 3, 3, 'F');
  drawIcon(doc, 'sprout', rx + 5, 271, 13, mix(p.primary, [101, 163, 13], 0.35), 1.8);
  setText(doc, 11, 'bold', p.ink);
  doc.text(lines(doc, r.company.tagline || TAGLINE, rw - 30, 11, 'bold')[0], rx + 23, 276.5);
  setText(doc, 8.4, 'normal', BODY);
  doc.text('Solar   |   Sustainable   |   Reliable', rx + 23, 282.6);
}

/* ───────────── minimal ───────────── */

async function minimalCover(doc, r, design, finance, snapshot) {
  const p = palette(r.brand);
  const x = 14;
  const cw = W - 2 * x;
  header(doc, r, p);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(x, 31.5, W - x, 31.5);

  setText(doc, 7.2, 'normal', p.primary);
  doc.text('ROOFTOP SOLAR POWER SYSTEM', x, 43, { charSpace: 0.95 });
  const title = fitText(doc, headline(r), cw, 34, 20, 2);
  const step = title.size * PT * 1.04;
  const titleY = 47 + title.size * PT * 0.8;
  setText(doc, title.size, 'bold', p.ink);
  title.lines.forEach((l, i) => doc.text(l, x - 0.6, titleY + i * step));
  let y = titleY + (title.lines.length - 1) * step;

  setText(doc, 23, 'bold', p.primary);
  const kwp = kwpText(design.totals);
  doc.text(kwp, x - 0.3, y + 12);
  const kw = doc.getTextWidth(kwp);
  setText(doc, 13, 'normal', p.ink);
  doc.text('Rooftop Solar System', x + kw + 4, y + 12);
  y += 12;
  const address = lines(doc, r.address, cw - 8, 9.5).slice(0, 2);
  if (address.length) {
    drawIcon(doc, 'pin', x - 0.3, y + 4.4, 4.6, p.ink, 2.2);
    setText(doc, 9.5, 'normal', BODY);
    doc.text(address, x + 6.5, y + 8, { lineHeightFactor: 1.4 });
    y += 8 + (address.length - 1) * 4.7;
  }

  // the picture takes whatever room the title left
  const top = y + 7;
  const bottom = 184;
  doc.addImage(await photoLayer(p, snapshot, cw, bottom - top, { radius: 4.5 }), 'JPEG', x, top, cw, bottom - top, 'cover-photo', 'MEDIUM');
  doc.setFillColor(...p.accent);
  doc.rect(x, 31.2, 22, 0.9, 'F');

  stats(doc, p, design, finance, { y: 188 });
  cards(doc, r, p, 236);

  const contact = [r.company.name, r.company.website, r.company.email, r.company.phone].filter(Boolean).join('   |   ');
  setText(doc, 8, 'normal', BODY);
  doc.text(lines(doc, contact, cw, 8)[0], W / 2, 292, { align: 'center' });
}

const COVERS = { magazine: drawCover, photo: photoCover, panel: panelCover, minimal: minimalCover };

/** Draws the front page in the chosen `style` (see COVER_STYLES) on the current (first) page. */
export function drawCoverStyle(doc, r, design, finance, snapshot, style) {
  return COVERS[coverStyle(style)](doc, r, design, finance, snapshot);
}
