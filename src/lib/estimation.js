// Estimation (Dashboard → Estimation): a quick price estimate built from products, packages and services.
// Nothing here is saved anywhere — the page keeps it in memory and the PDF is drawn in the browser.
import { defaultTaxRate } from './tax.js';

// new lines start at the company's usual tax rate (Settings → Company profile); kept for imports
export const DEFAULT_ESTIMATE_GST = 18;

const money2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nonNegative = (v) => Math.max(0, Number(v) || 0);

let seq = 0;
/** A fresh line. `kind`: product | package | service | custom. Prices are before GST. */
export function newLine(kind, fields = {}) {
  seq += 1;
  return { key: `l${Date.now().toString(36)}${seq}`, kind, name: '', detail: '', hsn: '', unit: 'Nos', qty: 1, rate: 0, gstPercent: defaultTaxRate(), ...fields };
}

/**
 * Lines with their amounts, GST grouped by rate, and the totals. With `withGst` off nothing is taxed and the lines
 * add up as they are.
 */
export function estimateTotals(lines, withGst) {
  const rows = (lines || []).map((l) => {
    const amount = money2(nonNegative(l.qty) * nonNegative(l.rate));
    const rate = withGst ? nonNegative(l.gstPercent) : 0;
    const gst = money2((amount * rate) / 100);
    return { ...l, amount, gstRate: rate, gst, total: money2(amount + gst) };
  });
  const subtotal = money2(rows.reduce((a, r) => a + r.amount, 0));
  const byRate = new Map();
  for (const r of rows) {
    if (!withGst || !(r.gstRate > 0)) continue;
    const g = byRate.get(r.gstRate) || { rate: r.gstRate, taxable: 0, gst: 0 };
    g.taxable = money2(g.taxable + r.amount);
    g.gst = money2(g.gst + r.gst);
    byRate.set(r.gstRate, g);
  }
  const gstGroups = [...byRate.values()].sort((a, b) => a.rate - b.rate);
  const gstTotal = money2(gstGroups.reduce((a, g) => a + g.gst, 0));
  return { rows, subtotal, gstGroups, gstTotal, total: money2(subtotal + gstTotal) };
}
