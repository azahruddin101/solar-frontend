'use client';

// Excel / CSV import-export for a company's product catalog.
import { PILLAR_SHAPES } from './catalog.js';

export const PANEL_COLUMNS = ['Brand', 'Model', 'Watt', 'Manufacture year', 'Warranty (years)', 'Length (m)', 'Width (m)', 'Price per panel'];
export const POLE_COLUMNS = ['Name / material', 'Type (L-shape | Cylindrical | Square)', 'Price per foot'];

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

async function readRows(file) {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(/,|;|\t/).map((c) => c.replace(/^"|"$/g, '').trim()));
  }
  const { readSheet } = await import('read-excel-file/browser');
  return readSheet(file);
}

/** Map header names loosely so "Watt", "Watts", "Power (W)" all work. */
function mapper(header, aliases) {
  const idx = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [key, list] of Object.entries(aliases)) if (idx[key] === undefined && list.some((a) => n.includes(a))) idx[key] = i;
  });
  return idx;
}

export async function importPanels(file) {
  const rows = await readRows(file);
  if (rows.length < 2) throw new Error('The sheet is empty. Row 1 must be the header.');
  const m = mapper(rows[0], { brand: ['brand', 'make', 'company'], model: ['model', 'series'], watts: ['watt', 'power', 'wp'], manufactureYear: ['manufactur', 'mfg', 'yearofm', 'madein'], warrantyYears: ['warranty', 'guarantee'], length: ['length', 'height'], width: ['width'], price: ['price', 'cost', 'rate', 'mrp'] });
  for (const k of ['brand', 'watts']) if (m[k] === undefined) throw new Error(`Column "${k}" not found. Expected headers: ${PANEL_COLUMNS.join(', ')}`);
  const out = [];
  const errors = [];
  rows.slice(1).forEach((r, i) => {
    const watts = Number(r[m.watts]);
    const price = Number(String(r[m.price] ?? '').replace(/[^\d.]/g, ''));
    if (!r[m.brand] || !(watts > 0)) return errors.push(`Row ${i + 2}: brand or watt missing`);
    out.push({ brand: String(r[m.brand]), model: String(r[m.model] ?? ''), watts, manufactureYear: Number(r[m.manufactureYear]) || undefined, warrantyYears: Number.parseFloat(r[m.warrantyYears]) || undefined, length: Number(r[m.length]) || undefined, width: Number(r[m.width]) || undefined, price: price || undefined });
  });
  return { items: out, errors };
}

export async function importPoles(file) {
  const rows = await readRows(file);
  if (rows.length < 2) throw new Error('The sheet is empty. Row 1 must be the header.');
  const m = mapper(rows[0], { name: ['name', 'material', 'pole', 'pillar'], shape: ['type', 'shape', 'section'], price: ['price', 'cost', 'rate'] });
  for (const k of ['name', 'price']) if (m[k] === undefined) throw new Error(`Column "${k}" not found. Expected headers: ${POLE_COLUMNS.join(', ')}`);
  const out = [];
  const errors = [];
  rows.slice(1).forEach((r, i) => {
    if (!r[m.name]) return errors.push(`Row ${i + 2}: name missing`);
    const s = norm(r[m.shape]);
    const shape = s.startsWith('l') || s.includes('angle') ? 'l-shape' : s.includes('cyl') || s.includes('round') || s.includes('pipe') ? 'cylindrical' : 'square';
    out.push({ name: String(r[m.name]), shape, pricePerFt: Number(String(r[m.price]).replace(/[^\d.]/g, '')) || 0 });
  });
  return { items: out, errors };
}

async function download(rows, fileName) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = rows.map((r, i) => r.map((v) => ({ value: v, fontWeight: i === 0 ? 'bold' : undefined, type: typeof v === 'number' ? Number : String })));
  await writeXlsxFile(data).toFile(fileName);
}

export const exportPanels = (panels) => download([PANEL_COLUMNS, ...panels.map((p) => [p.brand, p.model, p.watts, p.manufactureYear, p.warrantyYears, p.length, p.width, p.price])], 'solar-panels.xlsx');
export const exportPoles = (poles) =>
  download([POLE_COLUMNS, ...poles.map((p) => [p.name, PILLAR_SHAPES.find((s) => s.id === p.shape)?.label.split(' ')[0] || p.shape, p.pricePerFt])], 'poles.xlsx');
