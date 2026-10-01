// The price breakdown saved with every proposal (design.summary.pricing). Receipts and the invoice are built from it.
import { computeGst } from './energy.js';

const n = (v) => Number(v) || 0;
const round2 = (v) => Math.round(n(v) * 100) / 100;

/** SAC for installation / labour lines when no product HSN is set. */
export const DEFAULT_INSTALL_HSN = '998714';

/** Default GST % on installation / labour charges when not set on the charge row. */
export const DEFAULT_CHARGE_GST = 18;

export function installChargeGstPercent(charge, fallback = DEFAULT_CHARGE_GST) {
  const v = charge?.gstPercent;
  if (v === null || v === undefined || v === '') return fallback;
  const pct = Number(v);
  return Number.isNaN(pct) ? fallback : Math.max(0, Math.min(100, pct));
}

/** Per-line GST % from the line or a fallback (used for catalog rates on proposals & invoices). */
export function lineGstPercent(line, fallback = null) {
  const v = line?.gstPercent;
  if (v === null || v === undefined || v === '') {
    return fallback != null ? fallback : 0;
  }
  const pct = Number(v);
  if (Number.isNaN(pct)) return fallback != null ? fallback : 0;
  return Math.max(0, Math.min(100, pct));
}

function lineHsn(l) {
  const code = String(l.hsn || l.hsnCode || '').trim();
  return code ? code.slice(0, 20) : '';
}

/** Split a turnkey package price into one invoice line per bundled product. */
export function packageToPricingLines(pkg, packageTotal, defGst = 18) {
  const items = pkg?.items || [];
  const total = round2(packageTotal);
  if (!items.length) {
    return [{
      name: pkg?.name || 'Solar package',
      detail: pkg?.description || '',
      qty: 1,
      unit: 'Set',
      rate: total,
      amount: total,
      gstPercent: defGst,
      hsn: '',
    }];
  }
  const weights = items.map((it) => {
    const qty = n(it.qty) || 1;
    const unit = n(it.price) || 0;
    return unit > 0 ? unit * qty : qty;
  });
  const weightSum = weights.reduce((a, w) => a + w, 0) || items.length;
  let allocated = 0;
  return items.map((it, i) => {
    const qty = n(it.qty) || 1;
    const lineAmount = i === items.length - 1
      ? round2(total - allocated)
      : round2(total * (weights[i] / weightSum));
    allocated = round2(allocated + lineAmount);
    const rate = qty > 0 ? roundMoney(lineAmount / qty) : lineAmount;
    const detail = [it.brand && `Brand: ${it.brand}`, it.model && `Model: ${it.model}`, it.spec, it.description].filter(Boolean).join(' · ');
    const pct = it.gstPercent != null && it.gstPercent !== '' ? n(it.gstPercent) : defGst;
    return {
      name: it.name || 'Product',
      detail,
      qty,
      unit: it.unit || 'Nos',
      rate,
      amount: lineAmount,
      gstPercent: pct,
      hsn: lineHsn(it),
    };
  });
}

/** Turn legacy single-line "Package: …" rows into per-product lines when packages are known. */
export function expandCollapsedPackageLines(lines, packages) {
  if (!lines?.length) return lines || [];
  const pkgs = Array.isArray(packages) ? packages : [];
  const out = [];
  for (const l of lines) {
    const m = /^Package:\s*(.+)$/i.exec(String(l.name || '').trim());
    if (!m || !pkgs.length) {
      out.push(l);
      continue;
    }
    const pkgName = m[1].trim();
    const pkg = pkgs.find((p) => p.name === pkgName || pkgName.startsWith(p.name));
    if (!pkg?.items?.length) {
      out.push(l);
      continue;
    }
    const lineTotal = n(l.amount) || round2(n(l.rate) * (n(l.qty) || 1)) || n(pkg.price);
    out.push(...packageToPricingLines(pkg, lineTotal, l.gstPercent ?? pkg.gstPercent ?? 18));
  }
  return out;
}

/** Rupee amounts — always two decimal places (avoids float noise in forms and PDFs). */
export function roundMoney(v) {
  return round2(v);
}

/** State code (first 2 digits) from a GSTIN, if present. */
export function stateFromGstin(gstin) {
  const m = /^(\d{2})/.exec(String(gstin || '').trim());
  return m ? m[1] : '';
}

/** Inter-state supply → IGST; same state → CGST + SGST. */
export function gstSupplyType(companyTaxId, clientGstin) {
  const a = stateFromGstin(companyTaxId);
  const b = stateFromGstin(clientGstin);
  if (a && b && a !== b) return 'igst';
  return 'cgst_sgst';
}

function lineAmount(l) {
  if (l.amount != null && !Number.isNaN(l.amount)) return round2(n(l.amount));
  return round2((n(l.qty) || 1) * n(l.rate));
}

/** Qty × rate, with per-line GST added on top when `gstIncluded` is false. */
export function lineTotalWithGst({ qty = 1, rate = 0, gstPercent = 0, gstIncluded = true }) {
  const base = round2((n(qty) || 1) * n(rate));
  const pct = Math.max(0, Math.min(100, n(gstPercent)));
  if (gstIncluded !== false || pct <= 0) return base;
  return round2(base * (1 + pct / 100));
}

/** Catalog material rows: unit price is ex-GST; line total always includes that line's GST %. */
export function catalogMaterialLineTotal({ qty = 1, rate = 0, gstPercent = 0 }) {
  return lineTotalWithGst({ qty, rate, gstPercent, gstIncluded: false });
}

function normalizeLine(l) {
  const qty = n(l.qty) || 1;
  const rate = round2(l.rate);
  const amount = lineAmount(l);
  return {
    name: String(l.name || '').slice(0, 160),
    detail: String(l.detail || '').slice(0, 300),
    hsn: String(l.hsn || l.hsnCode || '').slice(0, 20),
    qty,
    unit: l.unit || 'Nos',
    rate,
    amount,
    gstPercent: l.gstPercent != null && l.gstPercent !== ''
      ? Math.max(0, Math.min(100, n(l.gstPercent)))
      : undefined,
  };
}

/**
 * Per-line GST with optional discount on the pre-tax/pre-gross line subtotal.
 * `gstIncluded`: line rates already include that line's GST%; otherwise GST is added on top.
 */
export function summarizeLinePricing({ lines = [], gstIncluded = true, discount = 0, discountIsPercent = false, withGst = true }) {
  const raw = (lines || []).map((l) => normalizeLine({ ...l, gstPercent: lineGstPercent(l, 18) })).filter((l) => l.name);
  const gross = raw.reduce((a, l) => a + l.amount, 0);
  let discountAmount = discountIsPercent ? gross * (n(discount) / 100) : n(discount);
  discountAmount = round2(Math.min(gross, Math.max(0, discountAmount)));
  const ratio = gross > 0 ? (gross - discountAmount) / gross : 1;

  const processed = raw.map((l) => {
    const lineGross = round2(l.amount * ratio);
    const catalogPct = l.gstPercent ?? 18;
    const pct = withGst ? catalogPct : 0;
    if (gstIncluded && pct > 0) {
      const taxable = round2(lineGross / (1 + pct / 100));
      const gst = round2(lineGross - taxable);
      return { ...l, gstPercent: catalogPct, amount: lineGross, taxable, gstAmount: gst, lineTotal: lineGross };
    }
    if (!gstIncluded && pct > 0) {
      const taxable = lineGross;
      const gst = round2(taxable * (pct / 100));
      return { ...l, gstPercent: catalogPct, amount: lineGross, taxable, gstAmount: gst, lineTotal: round2(taxable + gst) };
    }
    return { ...l, gstPercent: catalogPct, amount: lineGross, taxable: lineGross, gstAmount: 0, lineTotal: lineGross };
  });

  const subtotal = round2(processed.reduce((a, l) => a + l.amount, 0));
  const taxableTotal = round2(processed.reduce((a, l) => a + l.taxable, 0));
  const gstTotal = round2(processed.reduce((a, l) => a + l.gstAmount, 0));
  const total = gstIncluded ? subtotal : round2(taxableTotal + gstTotal);

  const byHsn = new Map();
  for (const l of processed) {
    const key = l.hsn || '—';
    const row = byHsn.get(key) || { hsn: key, taxable: 0, gst: 0, rates: new Set() };
    row.taxable = round2(row.taxable + l.taxable);
    row.gst = round2(row.gst + l.gstAmount);
    if (l.gstPercent) row.rates.add(l.gstPercent);
    byHsn.set(key, row);
  }
  const taxByHsn = [...byHsn.values()].map((r) => ({
    hsn: r.hsn,
    taxable: r.taxable,
    gst: r.gst,
    rate: r.rates.size === 1 ? [...r.rates][0] : null,
  }));

  const maxRate = processed.reduce((m, l) => Math.max(m, lineGstPercent(l, 0)), 0);

  return {
    lines: processed,
    subtotal,
    discountAmount,
    discountIsPercent: Boolean(discountIsPercent),
    discount,
    taxableTotal,
    gstTotal,
    gstIncluded: gstIncluded !== false,
    gstRate: maxRate,
    taxByHsn,
    total,
    sgst: round2(gstTotal / 2),
    cgst: round2(gstTotal / 2),
    igst: gstTotal,
  };
}

export function buildPricing({ lines = [], floorPlacement = 0, floorCost = 0, charges = [], gstIncluded = true, gstPercent = 18, discount = 0, discountIsPercent = false, discountRemark = '', defaultGstPercent = null, withGst = true, invoiceGstMode = null, paymentTerms = '' }) {
  const applyGst = withGst !== false && invoiceGstMode !== 'without_gst';
  const defGst = applyGst ? (defaultGstPercent != null ? n(defaultGstPercent) : n(gstPercent)) : 0;
  const all = lines.map((l) => normalizeLine({ ...l, gstPercent: applyGst ? (l.gstPercent ?? defGst) : 0 }));
  if (n(floorCost) > 0) {
    all.push(normalizeLine({ name: 'Floor placement', detail: `Floor ${floorPlacement} installation surcharge`, qty: 1, unit: 'Nos', rate: n(floorCost), amount: n(floorCost), gstPercent: defGst, hsn: DEFAULT_INSTALL_HSN }));
  }
  for (const c of charges || []) {
    if (c?.name) {
      all.push(normalizeLine({
        name: c.name,
        detail: 'Installation charge',
        qty: 1,
        unit: 'Nos',
        rate: n(c.price),
        amount: n(c.price),
        gstPercent: applyGst ? installChargeGstPercent(c, defGst) : 0,
        hsn: lineHsn(c) || DEFAULT_INSTALL_HSN,
      }));
    }
  }
  const summary = summarizeLinePricing({ lines: all, gstIncluded, discount, discountIsPercent, withGst: applyGst });
  const mode = invoiceGstMode || (applyGst ? 'with_gst' : 'without_gst');
  return {
    lines: summary.lines,
    subtotal: summary.subtotal,
    discountAmount: summary.discountAmount,
    discount: summary.discount,
    discountIsPercent: summary.discountIsPercent,
    discountRemark: String(discountRemark || '').slice(0, 200),
    taxableTotal: summary.taxableTotal,
    gstTotal: summary.gstTotal,
    taxByHsn: summary.taxByHsn,
    gstIncluded: summary.gstIncluded,
    gstRate: summary.gstRate,
    total: summary.total,
    invoiceGstMode: mode,
    withGst: applyGst,
    paymentTerms: String(paymentTerms || '').slice(0, 120),
  };
}

function quoteItemLines(it, defGst) {
  if (it.kind === 'package') {
    const items = (it.bundle || []).map((b) => ({
      name: b.name,
      brand: b.brand,
      model: b.model,
      spec: b.detail,
      description: b.category,
      qty: b.qty,
      unit: b.unit,
      price: b.price,
      hsnCode: b.hsn || b.hsnCode,
      gstPercent: b.gstPercent,
    }));
    if (items.length) {
      return packageToPricingLines({ name: it.name, items }, n(it.price), it.gstPercent ?? defGst);
    }
    return [{
      name: it.name || 'Solar package',
      detail: it.detail || 'Package price',
      hsn: it.hsn || it.hsnCode,
      qty: it.qty || 1,
      unit: it.unit || 'Set',
      rate: it.price,
      amount: n(it.qty) * n(it.price),
      gstPercent: it.gstPercent ?? defGst,
    }];
  }
  return [{
    name: it.category || it.name,
    detail: it.category ? [it.name, it.detail].filter(Boolean).join(' · ') : it.detail,
    hsn: it.hsn || it.hsnCode,
    qty: it.qty,
    unit: it.unit,
    rate: it.price,
    amount: n(it.qty) * n(it.price),
    gstPercent: it.gstPercent ?? defGst,
  }];
}

/** A proposal without a 3D design. */
export function pricingFromQuote(quote) {
  const defGst = n(quote.gstPercent) || 18;
  const lines = (quote.items || []).flatMap((it) => quoteItemLines(it, defGst));
  for (const it of quote.extraItems || []) {
    if (!it?.name) continue;
    lines.push({
      name: it.name,
      detail: it.detail || '',
      hsn: it.hsn,
      qty: it.qty,
      unit: it.unit || 'Nos',
      rate: it.price,
      amount: n(it.qty) * n(it.price),
      gstPercent: it.gstPercent ?? defGst,
    });
  }
  return buildPricing({
    lines,
    floorPlacement: quote.floorPlacement,
    floorCost: quote.floorCost,
    charges: quote.installationCharges,
    gstIncluded: false,
    gstPercent: quote.gstPercent,
    discount: quote.discount,
    discountIsPercent: quote.discountIsPercent,
    defaultGstPercent: defGst,
    withGst: quote.withGst !== false,
  });
}

/** A design made in the 3D designer. */
export function pricingFrom3D(design, config) {
  const defGst = n(config.gstPercent) || 18;
  const { cost, totals, spec } = design;
  let lines;
  if (cost.isPackage) {
    lines = packageToPricingLines(cost.package, cost.packagePrice, defGst);
  } else {
    lines = [
      { name: 'Solar modules', detail: `${totals.count} x ${spec.name}`, qty: totals.count, unit: 'nos', rate: spec.price, amount: cost.panels, gstPercent: spec.gstPercent ?? defGst, hsn: spec.hsnCode || '' },
      { name: 'Mounting structure', detail: design.pillar?.name || '', qty: 1, unit: 'Nos', rate: cost.pillars, amount: cost.pillars, gstPercent: design.pillar?.gstPercent ?? defGst, hsn: design.pillar?.hsnCode || '7308' },
    ];
    if (cost.hasChosenMaterials) {
      for (const m of cost.categoryMaterials || []) {
        lines.push({
          name: m.categoryName,
          detail: m.productName,
          qty: m.qty,
          unit: m.unit,
          rate: m.price,
          amount: m.baseTotal ?? m.qty * m.price,
          gstPercent: m.gstPercent ?? defGst,
          hsn: m.hsnCode,
        });
      }
    } else {
      lines.push({ name: 'Balance of system', detail: 'Inverter, cabling, protection devices, installation and commissioning', qty: 1, unit: 'Set', rate: cost.other, amount: cost.other, gstPercent: defGst, hsn: '85049090' });
    }
  }
  return buildPricing({
    lines,
    floorPlacement: cost.floorPlacement,
    floorCost: cost.floorCost,
    charges: cost.installationCharges,
    gstIncluded: false,
    gstPercent: config.gstPercent,
    discount: config.discount,
    discountIsPercent: config.discountIsPercent,
    defaultGstPercent: defGst,
    withGst: config.withGst !== false,
  });
}

/** Legacy helper — prefers stored line-level totals when available. */
export function invoiceTax(pricing, total) {
  if (pricing?.invoiceGstMode === 'without_gst' || pricing?.withGst === false) {
    const t = n(total);
    return { rate: 0, taxable: t, gst: 0, cgst: 0, sgst: 0, igst: 0, taxByHsn: [] };
  }
  if (pricing?.taxByHsn?.length || pricing?.gstTotal != null) {
    const gst = n(pricing.gstTotal);
    const taxable = n(pricing.taxableTotal) || n(pricing.subtotal);
    const rate = n(pricing.gstRate);
    return { rate, taxable, gst, cgst: gst / 2, sgst: gst / 2, igst: gst, taxByHsn: pricing.taxByHsn || [] };
  }
  const rate = Number(pricing?.gstRate) || 0;
  const t = n(total);
  if (!rate) return { rate: 0, taxable: t, gst: 0, cgst: 0, sgst: 0, igst: 0, taxByHsn: [] };
  const taxable = pricing.gstIncluded ? t / (1 + rate / 100) : Number(pricing.subtotal) || t;
  const gst = pricing.gstIncluded ? t - taxable : taxable * (rate / 100);
  return { rate, taxable, gst, cgst: gst / 2, sgst: gst / 2, igst: gst, taxByHsn: [] };
}

/** Fill missing HSN on invoice lines from catalog products (detail / name match). */
export function enrichLinesHsn(lines, catalog) {
  if (!catalog || !lines?.length) return lines || [];
  const codes = new Map();
  const add = (p) => {
    const code = String(p.hsnCode || '').trim();
    if (!code) return;
    for (const key of [p.name, p.model, p.brand, [p.brand, p.model].filter(Boolean).join(' ')].filter(Boolean)) {
      codes.set(String(key).toLowerCase(), code);
    }
  };
  for (const p of catalog.panels || []) add(p);
  for (const p of catalog.pillars || []) add(p);
  for (const cat of catalog.materialCategories || []) {
    for (const p of cat.products || []) add(p);
  }
  const match = (line) => {
    const hay = `${line.detail || ''} ${line.name || ''}`.toLowerCase();
    for (const [key, code] of codes) {
      if (key.length > 2 && hay.includes(key)) return code;
    }
    if ((line.name || '').toLowerCase().includes('solar module')) {
      const panel = (catalog.panels || []).find((p) => hay.includes((p.model || '').toLowerCase()) || hay.includes((p.brand || '').toLowerCase()));
      if (panel?.hsnCode) return panel.hsnCode;
    }
    if ((line.name || '').toLowerCase().includes('mounting')) {
      const pole = (catalog.pillars || []).find((p) => hay.includes((p.name || '').toLowerCase()));
      if (pole?.hsnCode) return pole.hsnCode;
    }
    if ((line.detail || '').toLowerCase().includes('installation charge')) return DEFAULT_INSTALL_HSN;
    return '';
  };
  return lines.map((l) => {
    const hsn = lineHsn(l) || match(l);
    return hsn ? { ...l, hsn } : l;
  });
}

/** Fill missing or zero GST % on invoice lines from catalog / package items. */
export function enrichLinesGst(lines, catalog, packages = null, defGst = 18) {
  if (!lines?.length) return lines || [];
  const rates = new Map();
  const add = (p) => {
    const pct = lineGstPercent(p, 0);
    if (!pct) return;
    for (const key of [p.name, p.model, p.brand, [p.brand, p.model].filter(Boolean).join(' ')].filter(Boolean)) {
      rates.set(String(key).toLowerCase(), pct);
    }
  };
  if (catalog) {
    for (const p of catalog.panels || []) add(p);
    for (const p of catalog.pillars || []) add(p);
    for (const cat of catalog.materialCategories || []) {
      for (const p of cat.products || []) add(p);
    }
  }
  for (const pkg of packages || []) {
    for (const it of pkg.items || []) add(it);
  }
  const matchPct = (line) => {
    const hay = `${line.detail || ''} ${line.name || ''}`.toLowerCase();
    if ((line.detail || '').toLowerCase().includes('installation charge')) return DEFAULT_CHARGE_GST;
    if ((line.name || '').toLowerCase().includes('floor placement')) return defGst;
    if ((line.name || '').toLowerCase().includes('balance of system')) return defGst;
    for (const [key, pct] of rates) {
      if (key.length > 2 && hay.includes(key)) return pct;
    }
    if ((line.name || '').toLowerCase().includes('solar module') && catalog?.panels?.length) {
      const panel = catalog.panels.find((p) => hay.includes((p.model || '').toLowerCase()) || hay.includes((p.brand || '').toLowerCase()));
      if (panel) return lineGstPercent(panel, defGst);
    }
    return 0;
  };
  return lines.map((l) => {
    const kept = lineGstPercent(l, 0);
    if (kept > 0) return { ...l, gstPercent: kept };
    const fromCat = matchPct(l);
    return { ...l, gstPercent: fromCat > 0 ? fromCat : defGst };
  });
}

/** Build editable invoice lines from saved proposal pricing. */
export function linesFromPricing(pricing, catalog = null, packages = null) {
  if (!pricing?.lines?.length) return [];
  const defGst = lineGstPercent(pricing, 0) || n(pricing.gstRate) || 18;
  const raw = pricing.lines.map((l) => {
    const qty = l.qty ?? 1;
    const rate = round2(l.rate ?? (l.taxable != null && qty ? l.taxable / qty : 0));
    return {
      name: l.name,
      detail: l.detail || '',
      hsn: lineHsn(l),
      qty,
      unit: l.unit || 'Nos',
      rate,
      gstPercent: lineGstPercent(l, 0),
    };
  });
  const expanded = expandCollapsedPackageLines(raw, packages);
  const withHsn = enrichLinesHsn(expanded, catalog);
  return enrichLinesGst(withHsn, catalog, packages, defGst);
}

/** Prefer stored pricing lines; otherwise rebuild from the proposal quote or a single summary line. */
export function resolveProposalPricing({ pricing, quote, total, title } = {}) {
  const hasLines = (p) => Array.isArray(p?.lines) && p.lines.some((l) => l?.name);
  if (hasLines(pricing)) return pricing;
  if (quote && (quote.items?.length || quote.extraItems?.length)) {
    const built = pricingFromQuote(quote);
    if (hasLines(built)) {
      return {
        ...built,
        gstIncluded: false,
        invoiceGstMode: pricing?.invoiceGstMode,
        withGst: pricing?.withGst,
        paymentTerms: pricing?.paymentTerms,
      };
    }
  }
  if (n(total) > 0) {
    return buildPricing({
      lines: [{ name: 'Solar power system', detail: title ? `As per proposal ${title}` : '', qty: 1, unit: 'Nos', rate: total, amount: total }],
      gstIncluded: false,
      gstPercent: pricing?.gstRate || 18,
      discount: pricing?.discount,
      discountIsPercent: pricing?.discountIsPercent,
    });
  }
  return pricing || {};
}
