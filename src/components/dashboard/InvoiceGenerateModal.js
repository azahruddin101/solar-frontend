'use client';

import { Boxes, Plus, TriangleAlert, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { buildPricing, linesFromPricing, resolveProposalPricing, roundMoney, summarizeLinePricing } from '@/lib/pricing';
import { useResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import { invoiceBillToSchema, useValidation } from '@/lib/validation';
import { EMPTY_INVOICE_DETAILS, INVOICE_DETAIL_FIELDS } from '@/lib/invoiceDetails';
import StockPickModal, { guessSerializedProduct } from './StockPickModal';
import { attributeRows } from './attributes';
import { FormField, FormModal, Input, NumField, PhoneInput, Select, Textarea, RichTextEditor } from '../kit';

/** Everything the catalog knows about a product, for the invoice line's details: brand, model, then its attributes. */
const productDetail = (p, category) => [
  p.brand && `Brand: ${p.brand}`,
  p.model && `Model: ${p.model}`,
  ...attributeRows(category, p.attributes).map((a) => `${a.label}: ${a.value}`),
  p.description,
].filter(Boolean).join(' · ').slice(0, 600);

const emptyLine = (gst = 18) => ({ name: '', detail: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, gstPercent: gst });

const INVOICE_KIND = [
  { id: 'plain', label: 'No GST', hint: 'No GST breakdown. Line prices are the final amounts.' },
  { id: 'tax', label: 'GST', hint: 'Enter price before GST and GST % per line. GST is added on top.' },
];

const EMPTY_BILL_TO = { name: '', company: '', phone: '', email: '', address: '', gstNumber: '' };

// Lines sold from stock: the server takes the stock and prices them from their batch at the chosen price type.
const PRICE_TYPES = [{ id: 'retail', label: 'Retail' }, { id: 'wholesale', label: 'Wholesale' }, { id: 'base', label: 'Base' }];
const PRICE_FIELD = { base: 'basePrice', wholesale: 'wholesalePrice', retail: 'retailPrice' };
const shortDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * What a stock line will cost, from its product's in-stock batches (oldest first): the chosen batch, the batches of
 * the chosen serial units, or the batches FIFO would take. The rate is the qty-weighted price of those batches, so the
 * preview total matches the server, which stores one line per batch at that batch's own price.
 */
function stockPreview(line, entry) {
  const batches = entry?.batches || [];
  const field = PRICE_FIELD[line.priceType] || 'retailPrice';
  const available = batches.reduce((a, b) => a + (Number(b.qtyRemaining) || 0), 0);
  let used = []; // [batch, qty]
  if (line.serials?.length) {
    const perBatch = new Map();
    for (const u of entry?.units || []) if (line.serials.includes(u.serialNo)) perBatch.set(u.batch?.id, (perBatch.get(u.batch?.id) || 0) + 1);
    used = batches.filter((b) => perBatch.has(b.id)).map((b) => [b, perBatch.get(b.id)]);
  } else if (line.batch) {
    used = batches.filter((b) => b.id === line.batch).map((b) => [b, Number(line.qty) || 0]);
  } else {
    let left = Number(line.qty) || 0;
    for (const b of batches) {
      if (left <= 0) break;
      const take = Math.min(left, Number(b.qtyRemaining) || 0);
      used.push([b, take]);
      left -= take;
    }
  }
  const qty = used.reduce((a, [, q]) => a + q, 0);
  const amount = used.reduce((a, [b, q]) => a + q * (Number(b[field]) || 0), 0);
  const rate = qty ? roundMoney(amount / qty) : roundMoney(Number(used[0]?.[0]?.[field] ?? batches[0]?.[field]) || 0);
  return { rate, available, used, split: new Set(used.map(([b]) => Number(b[field]) || 0)).size > 1 };
}

/**
 * Line-item editor for an invoice. With `designId` it is seeded from the proposal; without one it is a "direct"
 * invoice: the buyer is typed in (or picked from existing clients) and `onSubmit` also receives
 * `{ billTo, client, title }`.
 */
export default function InvoiceGenerateModal({ open, onClose, designId, pricing, quote, proposalTitle, contractTotal, currency = 'INR', onSubmit, busy }) {
  const { company } = useSession();
  const direct = !designId;
  const { data: fullDesign } = useResource(open && designId ? `/api/designs/${designId}` : null);
  const { data: nextNo } = useResource(open && direct ? '/api/billing/invoices/next-number' : null);
  const { data: clientList } = useResource(open && direct ? '/api/clients?limit=200' : null);
  const [billTo, setBillTo] = useState(EMPTY_BILL_TO);
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const billToV = useValidation(invoiceBillToSchema, billTo);
  const pickClient = (id) => {
    setClientId(id);
    const c = (clientList?.items || []).find((x) => x.id === id);
    if (c) setBillTo((b) => ({ ...EMPTY_BILL_TO, name: c.name || '', company: b.company || '', phone: c.phone || '', email: c.email || '', address: c.address || '', gstNumber: c.gstNumber || '' })); // a saved client has no company name: keep what was typed
  };
  const { data: designerCatalog } = useResource(open && designId ? '/api/catalog' : null);
  const { data: packages } = useResource(open && designId ? '/api/packages' : null);
  const { data: designBilling, loading: billingLoading } = useResource(open && designId ? `/api/billing/designs/${designId}` : null);
  const resolvedPricing = fullDesign?.summary?.pricing ?? pricing;
  const resolvedQuote = fullDesign?.data?.quote ?? quote;
  const resolvedTitle = fullDesign?.name ?? proposalTitle;
  const [lines, setLines] = useState([emptyLine()]);
  const [discount, setDiscount] = useState(0);
  const [discountIsPercent, setDiscountIsPercent] = useState(false);
  const [discountRemark, setDiscountRemark] = useState('');
  const [kind, setKind] = useState('plain');
  const [editedTerms, setEditedTerms] = useState(null);
  const [editedCompany, setEditedCompany] = useState(null); // proposal invoices: the buyer's company name (optional), seeded from the last invoice
  const [details, setDetails] = useState(EMPTY_INVOICE_DETAILS); // optional reference & delivery details
  const [discountActive, setDiscountActive] = useState(false);
  const [error, setError] = useState('');
  // products for "from stock" lines; a user who can't read the catalog (403) just gets plain lines
  const { data: products, error: productsError } = useResource(open ? '/api/products' : null);
  const { data: categories } = useResource(open ? '/api/categories' : null);
  const serialProducts = useMemo(() => (Array.isArray(products) ? products.filter((p) => p.isSerialized) : []), [products]);
  const stockEnabled = serialProducts.length > 0 && !productsError;
  const [stock, setStock] = useState({}); // productId → { batches (oldest first), units, error }
  const [pickLine, setPickLine] = useState(null); // index of the line whose stock / serial numbers are being picked

  useEffect(() => {
    if (!open || !designId) return; // a direct invoice starts empty
    const resolved = resolveProposalPricing({ pricing: resolvedPricing, quote: resolvedQuote, total: contractTotal, title: resolvedTitle });
    const seeded = [...linesFromPricing(resolved, designerCatalog, packages), ...[]];
    setLines(seeded.length ? seeded : [emptyLine(resolvedPricing?.gstRate || 18)]);
    setDiscount(resolved.discount ?? resolvedPricing?.discount ?? 0);
    setDiscountIsPercent(Boolean(resolved.discountIsPercent ?? resolvedPricing?.discountIsPercent));
    setDiscountRemark(resolved.discountRemark ?? resolvedPricing?.discountRemark ?? '');
    const proposalTax = resolved.withGst !== false || (resolved.gstTotal ?? 0) > 0.001;
    setKind(proposalTax ? 'tax' : 'plain');
    setError('');
  }, [open, designId, resolvedPricing, resolvedQuote, contractTotal, resolvedTitle, designerCatalog, packages, designBilling]);

  const seedTerms = designBilling?.previousTermsAndConditions || company?.pdfTerms || '';
  const termsAndConditions = editedTerms ?? seedTerms;
  const buyerCompany = editedCompany ?? designBilling?.previousBillToCompany ?? '';
  const taxInvoice = kind === 'tax';
  const money = (v) => formatMoney(v, currency);

  // stock lines take their rate (and, for serialized products, their quantity) from the stock choice
  const effectiveLines = useMemo(
    () => lines.map((l) => {
      return l.productId ? { ...l, rate: stockPreview(l, stock[l.productId]).rate } : l;
    }),
    [lines, stock],
  );
  const summary = useMemo(
    () => summarizeLinePricing({ lines: effectiveLines, gstIncluded: false, discount, discountIsPercent, withGst: taxInvoice }),
    [effectiveLines, discount, discountIsPercent, taxInvoice],
  );
  const differsFromProposal = !direct && Math.abs(summary.total - contractTotal) > 0.02;

  const setLine = (i, patch) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addLine = () => setLines((rows) => [...rows, emptyLine(rows[0]?.gstPercent ?? 18)]);
  const removeLine = (i) => setLines((rows) => (rows.length <= 1 ? [emptyLine()] : rows.filter((_, j) => j !== i)));

  const loadStock = async (product) => {
    if (stock[product.id] && !stock[product.id].error) return;
    try {
      const [batches, units] = await Promise.all([
        api(`/api/stock/products/${product.id}/batches?inStock=true`),
        product.isSerialized ? api(`/api/stock/products/${product.id}/units?status=inStock`) : Promise.resolve([]),
      ]);
      setStock((s) => ({ ...s, [product.id]: { batches, units } }));
    } catch (e) {
      setStock((s) => ({ ...s, [product.id]: { batches: [], units: [], error: e.message } }));
    }
  };
  /** Link line i to a catalog product (or unlink with ''): name, HSN, unit and GST come from the product. */
  const chooseProduct = (i, id) => {
    const p = (products || []).find((x) => x.id === id);
    if (!p) return setLine(i, { productId: undefined, priceType: undefined, batch: undefined, serials: undefined, serialQty: undefined });
    setLine(i, {
      productId: p.id,
      name: p.name,
      detail: productDetail(p, (categories || []).find((c) => String(c.id) === String(p.category))),
      hsn: p.hsnCode || '',
      unit: p.unit || 'Nos',
      gstPercent: p.gstPercent ?? lines[i]?.gstPercent ?? 18,
      priceType: lines[i]?.priceType || 'retail',
      batch: '',
      serials: [],
      qty: p.isSerialized ? 0 : lines[i]?.qty || 1,
    });
    loadStock(p);
  };
  const toggleSerial = (i, serialNo) => setLines((rows) => rows.map((r, j) => {
    if (j !== i) return r;
    const serials = r.serials?.includes(serialNo) ? r.serials.filter((s) => s !== serialNo) : [...(r.serials || []), serialNo];
    return { ...r, serials, qty: serials.length };
  }));
  /** The picker's choice: link the line to the product (name, HSN, unit, GST from it) with the chosen serials / batch. */
  const applyPick = (i, pick) => {
    chooseProduct(i, pick.productId);
    const p = (products || []).find((x) => x.id === pick.productId);
    setLine(i, { priceType: pick.priceType, batch: pick.batch, serials: pick.serials, ...(p?.isSerialized ? { qty: pick.serials.length, serialQty: lines[i]?.serialQty ?? (Number(lines[i]?.qty) || undefined) } : {}) });
    setPickLine(null);
  };
  const unlink = (i) => setLine(i, { productId: undefined, priceType: undefined, batch: undefined, serials: undefined, serialQty: undefined });

  const submit = () => {
    let extra = { details, ...(direct ? {} : { billToCompany: buyerCompany.trim() }) };
    if (direct) {
      const bt = billToV.validate();
      if (!bt) return setError('Check the details of who the invoice is for');
      extra = { ...extra, billTo: bt, client: clientId || null, title: title.trim() };
    }
    if (!lines.some((l) => l.name?.trim())) return setError('Add at least one line item');
    for (const l of effectiveLines) {
      if (!l.productId) continue;
      const product = (products || []).find((p) => p.id === l.productId);
      const { available } = stockPreview(l, stock[l.productId]);
      if (product?.isSerialized && !l.serials?.length) return setError(`Choose the serial numbers of ${l.name}`);
      if (!(Number(l.qty) > 0)) return setError(`Enter the quantity of ${l.name}`);
      if (stock[l.productId] && !l.batch && Number(l.qty) > available) return setError(`Only ${available} ${l.unit} of ${l.name} in stock`);
    }
    if (!(summary.total > 0)) return setError('Invoice total must be greater than zero');
    const built = buildPricing({
      lines: effectiveLines.filter((l) => l.name?.trim()).map((l) => ({ ...l, rate: roundMoney(l.rate), amount: roundMoney((Number(l.qty) || 0) * (Number(l.rate) || 0)) })),
      gstIncluded: false,
      gstPercent: 18,
      discount,
      discountIsPercent,
      discountRemark,
      withGst: taxInvoice,
      invoiceGstMode: taxInvoice ? 'with_gst' : 'without_gst',
    });
    setError('');
    onSubmit(built, termsAndConditions, extra);
  };

  return (
    <>
    <FormModal
      open
      onClose={onClose}
      title={direct ? 'Direct invoice' : 'Invoice'}
      description={direct ? 'An invoice without a proposal: say who it is for, add the products or services, and generate.' : 'Configure invoice items, discounts, and terms. The total will auto-calculate based on your entries.'}
      submitLabel="Generate invoice"
      busy={busy}
      error={error}
      onSubmit={submit}
      size="96"
    >
      <div className="absolute top-4 right-12">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/80 p-1">
          {INVOICE_KIND.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={`h-8 rounded-md px-3 text-xs font-semibold transition ${kind === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {direct && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Existing client" optional hint="Fills in the details below; leave as is to type a new name." className="sm:col-span-2">
              <Select value={clientId} onValue={pickClient}>
                <option value="">— Not a saved client —</option>
                {(clientList?.items || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
              </Select>
            </FormField>
            <FormField label="Client name" error={billToV.error('name')}><Input maxLength={120} value={billTo.name} onValue={(x) => setBillTo((b) => ({ ...b, name: x }))} placeholder="Who is this invoice for?" /></FormField>
            <FormField label="Company name" optional error={billToV.error('company')}><Input maxLength={120} value={billTo.company || ''} onValue={(x) => setBillTo((b) => ({ ...b, company: x }))} placeholder="If billing a company" /></FormField>
            <FormField label="Phone" optional error={billToV.error('phone')}><PhoneInput maxLength={20} value={billTo.phone} onValue={(x) => setBillTo((b) => ({ ...b, phone: x }))} /></FormField>
            <FormField label="Email" optional error={billToV.error('email')}><Input type="email" maxLength={200} value={billTo.email} onValue={(x) => setBillTo((b) => ({ ...b, email: x }))} /></FormField>
            <FormField label="GSTIN" optional error={billToV.error('gstNumber')}><Input maxLength={15} value={billTo.gstNumber} onValue={(x) => setBillTo((b) => ({ ...b, gstNumber: x.replace(/[^A-Za-z0-9]/g, '').toUpperCase() }))} className="uppercase" placeholder="27ABCDE1234F1Z5" /></FormField>
            <FormField label="Address" optional className="sm:col-span-2" error={billToV.error('address')}><Textarea rows={2} maxLength={400} value={billTo.address} onValue={(x) => setBillTo((b) => ({ ...b, address: x }))} /></FormField>
            <FormField label="Reference / title" optional hint="Printed as the reference on the invoice. Defaults to the client name." className="sm:col-span-2"><Input maxLength={160} value={title} onValue={setTitle} placeholder="e.g. 5 kW rooftop system — supply only" /></FormField>
          </div>
        </div>
      )}

      {!direct && (
        <div className="mb-4 max-w-md">
          <FormField label="Company name (Bill to)" optional hint="Printed above the client's name on the invoice.">
            <Input maxLength={120} value={buyerCompany} onValue={setEditedCompany} placeholder="If billing a company" />
          </FormField>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        {(designBilling?.nextInvoiceNo || nextNo?.nextInvoiceNo) && <span className="text-slate-500">Invoice no. <b className="font-mono text-slate-900">{designBilling?.nextInvoiceNo || nextNo?.nextInvoiceNo}</b></span>}
        {!direct && <span className="text-slate-500">Proposal: <b className="text-slate-900">{money(contractTotal)}</b></span>}
        <span className={differsFromProposal ? 'text-amber-700' : 'text-emerald-700'}>Invoice: <b>{money(summary.total)}</b></span>
        {taxInvoice && summary.gstTotal > 0 && <span className="text-slate-500">(includes {money(summary.gstTotal)} GST)</span>}
        {differsFromProposal && <span className="text-xs text-amber-700">Totals differ — OK for revised invoices.</span>}
      </div>

      <div className="mb-3 border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-56 min-w-56">Name</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 min-w-[26rem]">Details</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">HSN</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Qty</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">Unit</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Price</th>
              {taxInvoice && <th className="px-3 py-2 text-center font-semibold text-slate-600 w-16">GST%</th>}
              <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">Total</th>
              <th className="px-1 py-2 w-4"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const product = l.productId ? (products || []).find((p) => p.id === l.productId) : null;
              const entry = l.productId ? stock[l.productId] : null;
              const preview = l.productId ? stockPreview(l, entry) : null;
              const field = PRICE_FIELD[l.priceType] || 'retailPrice';
              return (
              <Fragment key={i}>
              <tr className={`hover:bg-slate-50 ${l.productId ? '' : 'border-b border-slate-100'}`}>
                <td className="px-3 py-2 w-56 align-top">
                  <textarea
                    rows={2}
                    maxLength={160}
                    value={l.name}
                    onChange={(e) => setLine(i, { name: e.target.value })}
                    placeholder="Product/Service"
                    className="w-full resize-none bg-transparent outline-none text-slate-900 text-xs leading-snug"
                  />
                  {stockEnabled && !l.productId && guessSerializedProduct(l, serialProducts) && (
                    <button type="button" onClick={() => setPickLine(i)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline">
                      <Boxes className="h-3 w-3" /> Select serial numbers
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 min-w-[26rem] align-top">
                  <textarea
                    rows={2}
                    maxLength={600}
                    value={l.detail}
                    onChange={(e) => setLine(i, { detail: e.target.value })}
                    placeholder="Details"
                    className="w-full resize-none bg-transparent outline-none text-slate-700 text-xs leading-snug"
                  />
                </td>
                <td className="px-3 py-2 w-20">
                  <input
                    type="text"
                    maxLength={12}
                    value={l.hsn}
                    onChange={(e) => setLine(i, { hsn: e.target.value })}
                    placeholder="-"
                    className="w-full bg-transparent outline-none text-center text-xs"
                  />
                </td>
                <td className="px-3 py-2 w-20">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={l.qty}
                    readOnly={Boolean(product?.isSerialized)}
                    title={product?.isSerialized ? 'The number of serial numbers chosen' : undefined}
                    onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })}
                    className="w-full bg-transparent outline-none text-center text-xs"
                  />
                </td>
                <td className="px-3 py-2 w-20">
                  <input
                    type="text"
                    maxLength={10}
                    value={l.unit}
                    onChange={(e) => setLine(i, { unit: e.target.value })}
                    placeholder="Nos"
                    className="w-full bg-transparent outline-none text-center text-xs"
                  />
                </td>
                <td className="px-3 py-2 w-28">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={preview ? effectiveLines[i].rate : l.rate}
                    readOnly={Boolean(preview)}
                    title={preview ? 'Priced from the batch at the chosen price type' : undefined}
                    onChange={(e) => setLine(i, { rate: roundMoney(Number(e.target.value) || 0) })}
                    className={`w-full bg-transparent outline-none text-right text-xs ${preview ? 'text-slate-500' : ''}`}
                  />
                </td>
                {taxInvoice && (
                  <td className="px-3 py-2 w-16">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={l.gstPercent}
                      onChange={(e) => setLine(i, { gstPercent: Number(e.target.value) || 0 })}
                      className="w-full bg-transparent outline-none text-center text-xs"
                    />
                  </td>
                )}
                <td className="px-3 py-2 w-28 text-right font-semibold text-slate-900 text-xs">
                  {money(summary.lines[i]?.lineTotal ?? (Number(l.qty) || 0) * (Number(effectiveLines[i].rate) || 0))}
                </td>
                <td className="px-1 py-2 w-4 text-center">
                  <button
                    type="button"
                    aria-label="Remove line"
                    onClick={() => removeLine(i)}
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5 transition"
                    title="Delete this line"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
              {l.productId && (
                <tr className="border-b border-slate-100 bg-sky-50/40">
                  <td colSpan={taxInvoice ? 9 : 8} className="px-3 pb-2.5 pt-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                      <Boxes className="h-3.5 w-3.5 text-sky-700" />
                      <span>
                        <b className="font-medium text-sky-800">From stock</b>
                        {product?.isSerialized
                          ? ` · ${l.serials?.length || 0} serial number${l.serials?.length === 1 ? '' : 's'} selected`
                          : ` · ${l.batch ? 'chosen batch' : 'oldest batch first'}`}
                        {` · ${PRICE_TYPES.find((t) => t.id === (l.priceType || 'retail'))?.label} price`}
                      </span>
                      <button type="button" onClick={() => setPickLine(i)} className="rounded-md border border-sky-300 bg-white px-2 py-1 font-medium text-sky-800 hover:bg-sky-50">
                        {product?.isSerialized ? 'Change serial numbers' : 'Change'}
                      </button>
                      <button type="button" onClick={() => unlink(i)} className="ml-auto font-medium text-slate-500 hover:text-red-600">Not from stock</button>
                    </div>
                    {!entry && <p className="mt-1.5 text-[11px] text-slate-500">Loading stock…</p>}
                    {entry?.error && <p className="mt-1.5 text-[11px] text-red-600">{entry.error}</p>}
                    {product?.isSerialized && l.serials?.length > 0 && (
                      <p className="mt-1.5 line-clamp-2 break-all font-mono text-[11px] text-slate-500">S/N {l.serials.join(', ')}</p>
                    )}
                    {preview && entry && !entry.error && (
                      <div className="mt-1.5 space-y-0.5 text-[11px]">
                        {!l.batch && !product?.isSerialized && Number(l.qty) > preview.available && (
                          <p className="flex items-center gap-1 text-red-600"><TriangleAlert className="h-3 w-3" /> Only {preview.available} {l.unit} in stock</p>
                        )}
                        {preview.split && (
                          <p className="flex items-center gap-1 text-amber-700"><TriangleAlert className="h-3 w-3" /> Comes from {preview.used.length} batches at different prices: the invoice will show one line per batch, at its own price.</p>
                        )}
                        {!preview.split && preview.used.length === 1 && (
                          <p className="text-slate-500">Priced from batch {preview.used[0][0].batchNo || '(no number)'} at its {l.priceType || 'retail'} price.</p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
            {discountActive && (
              <tr className="border-b border-slate-100 hover:bg-slate-50 bg-slate-50/50">
                <td className="px-3 py-2 w-36">
                  <span className="text-xs font-semibold text-slate-600">Discount</span>
                </td>
                <td className="px-3 py-2 flex-1">
                  <input
                    type="text"
                    maxLength={80}
                    value={discountRemark}
                    onChange={(e) => setDiscountRemark(e.target.value)}
                    placeholder="Reason (e.g. festival offer, referral)"
                    className="w-full bg-transparent outline-none text-slate-700 text-xs"
                  />
                </td>
                <td colSpan={taxInvoice ? 5 : 4} className="px-3 py-2"></td>
                <td className="px-3 py-2 w-20">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={discount}
                    onChange={(e) => {
                      const val = e.target.value;
                      const num = val === '' ? 0 : Number(val);
                      if (!isNaN(num)) setDiscount(num);
                    }}
                    className="w-full bg-transparent outline-none text-right text-xs font-semibold"
                    placeholder="0"
                  />
                </td>
                <td className="px-3 py-2 w-20 text-right font-semibold text-slate-900 text-xs">
                  -{money(summary.discountAmount)}
                </td>
                <td className="px-1 py-2 w-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscount(0);
                      setDiscountActive(false);
                      setDiscountRemark('');
                    }}
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5 transition"
                    title="Remove discount"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            )}
            <tr className="bg-slate-50 font-semibold text-slate-900 border-t-2 border-slate-300">
              <td colSpan={taxInvoice ? 8 : 7} className="px-3 py-2 text-xs text-right">Subtotal</td>
              <td className="px-3 py-2 w-16 text-right text-xs">{money(summary.subtotal ?? summary.total)}</td>
              <td className="px-3 py-2 w-8"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-9 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Product/Service
        </button>
        <button
          type="button"
          onClick={() => {
            setDiscountActive(true);
            if (discount === 0) setDiscount(100);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-9 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {discount > 0 ? 'Edit Discount' : 'Add Discount'}
        </button>
        <select
          value={discountIsPercent ? 'percent' : 'flat'}
          onChange={(e) => setDiscountIsPercent(e.target.value === 'percent')}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <option value="flat">Flat</option>
          <option value="percent">%</option>
        </select>
      </div>


      {discount > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <FormField label="Discount Type">
            <Select value={discountIsPercent ? 'percent' : 'flat'} onValue={(v) => setDiscountIsPercent(v === 'percent')}>
              <option value="flat">Flat amount</option>
              <option value="percent">Percentage (%)</option>
            </Select>
          </FormField>
        </div>
      )}

      <details className="group mt-4 border-t border-slate-200 pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
          <span>Reference &amp; delivery details <span className="font-normal text-slate-400">· optional</span></span>
          <span className="text-xs text-slate-400 group-open:hidden">Show</span><span className="hidden text-xs text-slate-400 group-open:inline">Hide</span>
        </summary>
        <p className="mt-1 text-xs text-slate-500">Anything you fill in is printed on the invoice. Leave the rest blank.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {INVOICE_DETAIL_FIELDS.map((f) => (
            <FormField key={f.key} label={f.label} optional className={f.full ? 'sm:col-span-2' : undefined}>
              <Input type={f.type === 'date' ? 'date' : 'text'} maxLength={f.key === 'termsOfDelivery' ? 300 : 120} value={details[f.key]} onValue={(v) => setDetails((d) => ({ ...d, [f.key]: v }))} placeholder={f.placeholder} />
            </FormField>
          ))}
        </div>
      </details>

      <div className="mt-4 pt-4 border-t border-slate-200">
        <FormField label="Terms & Conditions" hint="Will appear on the invoice PDF. Use the editor to format text.">
          {/* The editor is seeded once on mount, so wait for the previous-invoice lookup before rendering it */}
          {billingLoading ? (
            <div className="animate-pulse rounded-lg border border-slate-300 bg-slate-50" style={{ minHeight: 182 }} />
          ) : (
            <RichTextEditor
              value={seedTerms}
              onChange={setEditedTerms}
              placeholder="Enter terms and conditions for this invoice..."
              maxLength={3000}
              minHeight={140}
            />
          )}
        </FormField>
      </div>
    </FormModal>
    {pickLine !== null && lines[pickLine] && (
      <StockPickModal
        line={lines[pickLine]}
        wantQty={Number(lines[pickLine].serialQty ?? lines[pickLine].qty) || 0}
        products={serialProducts}
        stock={stock}
        loadStock={loadStock}
        money={money}
        onApply={(pick) => applyPick(pickLine, pick)}
        onClose={() => setPickLine(null)}
      />
    )}
    </>
  );
}
