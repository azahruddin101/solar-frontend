'use client';

// Rasterises the stroke icons in pdfIconData.js to transparent PNGs for jsPDF (which cannot draw SVG
// paths). Rendered at 8× so they stay sharp when the PDF is zoomed or printed.
import { ICONS } from './pdfIconData.js';

const cache = new Map();
const css = (rgb) => `rgb(${rgb.join(',')})`;

/** Draw icon `name` into a canvas context, in a box of `size` px at (x, y). */
export function paintIcon(ctx, name, x, y, size, rgb, strokeWidth = 2) {
  const node = ICONS[name];
  if (!node) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = css(rgb);
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [tag, a] of node) {
    ctx.beginPath();
    if (tag === 'path') ctx.stroke(new Path2D(a.d));
    else if (tag === 'circle') {
      ctx.arc(Number(a.cx), Number(a.cy), Number(a.r), 0, Math.PI * 2);
      ctx.stroke();
    } else if (tag === 'rect') {
      ctx.roundRect(Number(a.x), Number(a.y), Number(a.width), Number(a.height), Number(a.rx || 0));
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function iconPng(name, rgb, strokeWidth = 2) {
  const key = `${name}|${rgb.join(',')}|${strokeWidth}`;
  if (!cache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 192;
    paintIcon(canvas.getContext('2d'), name, 0, 0, 192, rgb, strokeWidth);
    cache.set(key, canvas.toDataURL('image/png'));
  }
  return cache.get(key);
}

/** Place an icon on the page: (x, y) is the top-left corner, `size` in mm. */
export function drawIcon(doc, name, x, y, size, rgb, strokeWidth = 2) {
  doc.addImage(iconPng(name, rgb, strokeWidth), 'PNG', x, y, size, size, `icon-${name}-${rgb.join('-')}-${strokeWidth}`, 'FAST');
}
