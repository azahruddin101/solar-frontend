// Turning a saved estimate into a 2D proposal (a "quick" proposal: products and prices, no 3D design).
// The proposal is made in its Custom mode so every line keeps the price, quantity and tax typed on the estimate:
// a catalog product becomes that category's material (one per category, as the proposal editor has it) and every
// other line — packages, services, typed lines, a second product of a category — becomes an extra item.
import { api } from './api.js';
import { pricingFromQuote } from './pricing.js';
import { DEFAULT_SYSTEM, wattsFrom } from './quoteModel.js';
import { defaultTaxRate } from './tax.js';

const num = (v) => Math.max(0, Number(v) || 0);

/** The priced lines of a quick proposal: the chosen package, or one product per category. The PDF and totals read these. */
export function buildItems(q, packages) {
  if (q.pricingMode === 'package') {
    const pkg = (packages || []).find((p) => p.id === q.packageId);
    if (!q.packageId) return [];
    const price = pkg ? num(pkg.price) : num(q.packagePrice);
    return [{ kind: 'package', refId: q.packageId, name: pkg?.name || 'Solar package', detail: [pkg?.kw ? `${pkg.kw} kW` : '', pkg?.description].filter(Boolean).join(' · '), unit: 'Set', qty: 1, kw: Number(pkg?.kw) || 0, price, gstPercent: num(q.packageGstPercent) || num(q.gstPercent) || 18, bundle: q.bundle || [] }];
  }
  return Object.values(q.materials || {}).filter((m) => m.productId).map((m) => ({ kind: 'product', refId: m.productId, name: m.name, detail: m.detail, category: m.category, panel: m.panel, unit: m.unit, qty: num(m.qty), price: num(m.price), hsn: m.hsn, gstPercent: num(m.gstPercent) || num(q.gstPercent) || 18 }));
}

/** The quote (`design.data.quote`) of a quick proposal that says what the estimate says. */
export function quoteFromEstimate(estimate, { products = [], categories = [] } = {}) {
  const rate = defaultTaxRate();
  const byId = new Map((products || []).map((p) => [String(p.id), p]));
  const catOf = (p) => (categories || []).find((c) => String(c.id) === String(p.category?.id || p.category));
  const materials = {};
  const extraItems = [];
  for (const l of estimate.lines || []) {
    if (!String(l.name || '').trim()) continue;
    const gstPercent = l.gstPercent ?? rate;
    const p = l.kind === 'product' ? byId.get(String(l.refId)) : null;
    const cat = p ? catOf(p) : null;
    if (p && cat && !materials[cat.id] && num(l.qty) > 0) {
      const isPanel = p.type === 'panels' || cat.type === 'panels';
      materials[cat.id] = {
        productId: p.id,
        name: l.name,
        detail: l.detail || [p.brand, p.model].filter(Boolean).join(' '),
        category: cat.name,
        hsn: l.hsn || p.hsnCode || '',
        panel: isPanel ? { brand: p.brand, model: p.model, watts: Number(p.watts) || wattsFrom(p.model, p.name), length: p.length, width: p.width, warrantyYears: p.warrantyMonths != null ? Math.floor(p.warrantyMonths / 12) : p.warrantyYears, manufactureYear: p.manufactureYear } : undefined,
        unit: l.unit || p.unit || 'Nos',
        qty: num(l.qty),
        price: num(l.rate),
        gstPercent,
      };
    } else {
      extraItems.push({ name: l.name, detail: String(l.detail || '').slice(0, 300), qty: num(l.qty), unit: l.unit || 'Nos', price: num(l.rate), gstPercent, hsn: l.hsn || '' });
    }
  }
  const quote = { pricingMode: 'custom', packageId: '', packagePrice: 0, packageGstPercent: rate, bundle: [], materials, extraItems, system: { ...DEFAULT_SYSTEM }, items: [], withGst: estimate.withGst !== false, gstPercent: rate, discount: 0, discountIsPercent: false, floorPlacement: 0, floorCost: 0, outlookYears: 10, installationCharges: [] };
  return { ...quote, items: buildItems(quote, []) };
}

/**
 * Make a 2D proposal for `clientId` from a saved estimate (with its lines) and note it on the estimate.
 * Returns the new proposal. The estimate itself is not changed.
 */
export async function convertEstimateToProposal(estimate, clientId) {
  const [products, categories] = await Promise.all([api('/api/products'), api('/api/categories')]);
  const quote = quoteFromEstimate(estimate, { products, categories });
  const pricing = pricingFromQuote(quote);
  const design = await api('/api/designs', { method: 'POST', body: { client: clientId, type: 'quick' } });
  await api(`/api/designs/${design.id}`, { method: 'PUT', body: { data: { quote }, summary: { cost: Math.round(pricing.total), pricing: { ...pricing, grandTotal: pricing.total } } } });
  await api(`/api/estimates/${estimate.id}/converted`, { method: 'POST', body: { design: design.id } }).catch(() => {}); // only a note on the estimate
  return design;
}
