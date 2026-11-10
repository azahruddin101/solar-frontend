'use client';

// Generate a bill: materials picked from stock (the server takes the stock and prices each line from its batch),
// services, tax and an optional discount, plus the delivery details. The delivery challan is printed from the same
// bill, so nothing more is asked for it. A bill is paid when it is generated: the form asks only how it was paid.
// Other money (an advance, a part payment) is recorded separately, on receipts.
import { CircleCheck, ClipboardList, Plus, TriangleAlert, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { linesFromPricing, resolveProposalPricing } from '@/lib/pricing';
import { useResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import { TRANSPORT_MODE_LABEL, TRANSPORT_REASON_LABEL } from '@/lib/ewayBillPdf';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdfShared';
import StockPickModal from './StockPickModal';
import { PRICE_TYPES, productDetail, stockPreview, useStockCache } from './stockLines';
import { Alert, Button, ConfirmDialog, FormField, FormModal, Input, Select, Textarea, cx } from '../kit';
import { DiscountEditor, ServiceLinesEditor, BillSection, billDoc, blankServiceRow, servicesPayload, useBillPricing, validateServices } from './BillContentMode';
import { defaultTaxRate, taxIdName, taxName } from '@/lib/tax';

const today = () => new Date().toISOString().slice(0, 10);
let seq = 0;
const blankLine = () => ({ key: `l${++seq}`, productId: '', name: '', detail: '', hsn: '', unit: 'Nos', gstPercent: defaultTaxRate(), priceType: 'retail', qty: 1, batch: '', serials: [] });

const cell = billDoc.field;

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** A proposal line that is work, not goods: installation charges, floor surcharge, services. */
const isServiceLine = (l) => /installation charge|floor placement|labour|labor|commissioning|service/i.test(`${l.name} ${l.detail}`) || String(l.hsn || '').startsWith('9987');

/**
 * The catalog product a proposal line most likely means: its name appears in the line's name or detail, or both its
 * brand and model do. The longest name wins when several match (a 10 sq.mm cable over a 4-core cable).
 */
export function matchProduct(line, products) {
  const hay = norm(`${line.name} ${line.detail}`);
  if (!hay) return null;
  let best = null;
  for (const p of products) {
    const pn = norm(p.name);
    const keys = [p.brand, p.model].filter(Boolean).map(norm).filter((k) => k.length > 1);
    const byName = pn.length > 2 && hay.includes(pn);
    const byModel = p.model && keys.length === 2 && keys.every((k) => hay.includes(k));
    if (!byName && !byModel) continue;
    const score = (byName ? pn.length : 0) + (byModel ? 5 : 0);
    if (!best || score > best.score) best = { p, score };
  }
  return best?.p || null;
}

/**
 * `party` is `{ design }` or `{ client }` (ids); `partyName` the proposal's or client's name shown in the title.
 * With a proposal, `proposal` ({ pricing, quote, total, title }) and the party's `ewayBills` so far feed the side
 * panel of items still to dispatch (`catalog` and `packages` expand package lines). `onSubmit(body)` posts to
 * /api/billing/eway-bills.
 */
export default function EwayBillModal({ open, onClose, party, partyName, clientAddress = '', proposal = null, ewayBills = [], catalog = null, packages = null, currency = 'INR', busy, onSubmit }) {
  const company = useSession((s) => s.company);
  const { data: products, error: productsError } = useResource(open ? '/api/products' : null);
  const { data: categories } = useResource(open ? '/api/categories' : null);
  const { data: charges } = useResource(open ? '/api/installation-charges' : null);
  const { stock, loadStock } = useStockCache();
  const [lines, setLines] = useState([blankLine()]);
  const [services, setServices] = useState([]);
  const [discountActive, setDiscountActive] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [discountIsPercent, setDiscountIsPercent] = useState(false);
  const [discountRemark, setDiscountRemark] = useState('');
  const [transport, setTransport] = useState({ mode: 'road', vehicleNo: '', transporter: '', transporterId: '', docNo: '', docDate: '', fromPlace: company?.address || '', toPlace: clientAddress || '', distanceKm: '', reason: 'supply' });
  const [issuedOn, setIssuedOn] = useState(today());
  const [note, setNote] = useState('');
  const [payMode, setPayMode] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [pickLine, setPickLine] = useState(null);
  const [deliveryOpen, setDeliveryOpen] = useState(true);
  const [error, setError] = useState('');
  const money = (v) => formatMoney(v, currency);
  const withGst = true;
  const list = useMemo(() => (Array.isArray(products) ? products : []), [products]);
  const inStock = useMemo(() => list.filter((p) => p.stock > 0), [list]);

  const effective = useMemo(
    () => lines.map((l) => (l.productId ? { ...l, rate: stockPreview(l, stock[l.productId]).rate } : l)),
    [lines, stock],
  );
  const goodsPricingLines = useMemo(() => effective.filter((l) => l.productId).map((l) => ({
    kind: 'goods', name: l.name, detail: l.detail, hsn: l.hsn, qty: l.serials?.length ? l.serials.length : Number(l.qty) || 0, unit: l.unit, rate: Number(stockPreview(l, stock[l.productId])?.rate) || 0, gstPercent: l.gstPercent,
  })), [effective, stock]);
  const { summary, goodsValue, servicesValue } = useBillPricing({ goodsLines: goodsPricingLines, serviceRows: services, withGst, discountActive, discount, discountIsPercent });

  // the proposal's items, matched to inventory, with what earlier bills already sent and what this one carries
  const proposalItems = useMemo(() => {
    if (!proposal) return [];
    const hasLines = proposal.pricing?.lines?.some((l) => l?.name) || proposal.quote?.items?.length || proposal.quote?.extraItems?.length;
    if (!hasLines) return [];
    const resolved = resolveProposalPricing({ pricing: proposal.pricing, quote: proposal.quote, total: proposal.total, title: proposal.title });
    const sent = new Map(); // productId or normalised name → qty still on open or invoiced bills (not revised/cancelled)
    for (const e of ewayBills || []) {
      if (e.status !== 'open' && e.status !== 'billed') continue;
      for (const l of e.lines || []) {
        const q = Number(l.qty) || 0;
        if (l.productId) sent.set(l.productId, (sent.get(l.productId) || 0) + q);
        sent.set(`n:${norm(l.name)}`, (sent.get(`n:${norm(l.name)}`) || 0) + q);
      }
    }
    return linesFromPricing(resolved, catalog, packages).filter((l) => l.name?.trim()).map((l, i) => {
      const service = isServiceLine(l);
      const product = service ? null : matchProduct(l, list);
      const needed = Number(l.qty) || 1;
      const already = product ? sent.get(product.id) || 0 : sent.get(`n:${norm(l.name)}`) || 0;
      const here = product ? lines.filter((x) => x.productId === product.id).reduce((a, x) => a + (Number(x.qty) || 0), 0) : 0;
      return { key: `p${i}`, line: l, product, service, needed, already, here, left: Math.max(0, needed - already - here) };
    });
  }, [proposal, ewayBills, catalog, packages, list, lines]);
  const goodsItems = proposalItems.filter((it) => !it.service);
  const doneItems = goodsItems.filter((it) => it.left <= 0).length;

  const setLine = (i, patch) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeLine = (i) => setLines((rows) => (rows.length <= 1 ? [blankLine()] : rows.filter((_, j) => j !== i)));
  /** What a line carries once linked to product `p`: name, details, HSN, unit and GST from the catalog. */
  const linked = (p, qty) => ({
    productId: p.id,
    name: p.name,
    detail: productDetail(p, (categories || []).find((c) => String(c.id) === String(p.category))),
    hsn: p.hsnCode || '',
    unit: p.unit || 'Nos',
    gstPercent: p.gstPercent ?? 18,
    batch: '',
    serials: [],
    qty,
  });
  /** Link line i to a product (a serialized one opens the serial picker; the quantity becomes its target). */
  const chooseProduct = (i, id) => {
    const p = list.find((x) => x.id === id);
    if (!p) return setLine(i, { productId: '', name: '', detail: '', serials: [], batch: '' });
    setLine(i, linked(p, p.isSerialized ? 0 : lines[i]?.qty || 1));
    loadStock(p);
    if (p.isSerialized) setPickLine(i);
  };
  /** From the side panel: put this proposal item on the bill with what is still left to send (capped by stock). */
  const addFromProposal = (item) => {
    const p = item.product;
    const qty = Math.min(item.left || item.needed, p.stock > 0 ? p.stock : item.left || item.needed);
    const spare = lines.findIndex((l) => !l.productId);
    const at = spare >= 0 ? spare : lines.length;
    setLines((rows) => (spare >= 0 ? rows.map((r, j) => (j === spare ? { ...r, ...linked(p, qty) } : r)) : [...rows, { ...blankLine(), ...linked(p, qty) }]));
    loadStock(p);
    if (p.isSerialized) setPickLine(at);
  };
  const applyPick = (i, pick) => {
    const p = list.find((x) => x.id === pick.productId);
    if (p && p.id !== lines[i]?.productId) chooseProduct(i, p.id);
    setLine(i, { priceType: pick.priceType, batch: pick.batch, serials: pick.serials, ...(p?.isSerialized ? { qty: pick.serials.length } : {}) });
    setPickLine(null);
  };

  const submit = () => {
    const used = lines.filter((l) => l.productId);
    const hasProducts = used.length > 0;
    const hasServices = services.some((s) => s.name.trim());
    if (!hasProducts && !hasServices) return setError('Add at least one product from stock or at least one service');
    for (const l of effective) {
      if (!l.productId) continue;
      const product = list.find((p) => p.id === l.productId);
      const { available } = stockPreview(l, stock[l.productId]);
      if (product?.isSerialized && !l.serials?.length) return setError(`Choose the serial numbers of ${l.name}`);
      if (!(Number(l.qty) > 0)) return setError(`Enter the quantity of ${l.name}`);
      if (stock[l.productId] && !l.batch && !product?.isSerialized && Number(l.qty) > available) return setError(`Only ${available} ${l.unit} of ${l.name} in stock`);
    }
    if (!validateServices(services, setError)) return;
    if (!(summary.total > 0)) return setError('The bill total must be greater than zero');
    setError('');
    onSubmit({
      ...party,
      lines: used.map((l) => ({ productId: l.productId, priceType: l.priceType, qty: l.serials?.length ? l.serials.length : Number(l.qty) || 0, batch: l.batch || '', serials: l.serials || [], detail: l.detail })),
      services: servicesPayload(services),
      withGst,
      discount: discountActive ? discount : 0,
      discountIsPercent,
      discountRemark: discountActive ? discountRemark : '',
      transport: { ...transport, distanceKm: transport.distanceKm === '' ? null : Number(transport.distanceKm) },
      issuedOn,
      note,
      payment: { mode: payMode, reference: payReference.trim() },
    });
  };

  const setT = (patch) => setTransport((t) => ({ ...t, ...patch }));

  return (
    <>
      <FormModal
        open={open}
        onClose={onClose}
        title={`Bill · ${partyName}`}
        description="Materials, services, tax and delivery details. When you confirm, the bill and its delivery challan are made, the bill is marked paid and product stock is deducted."
        submitLabel={`Confirm · ${money(summary.total)}`}
        busy={busy}
        error={error}
        onSubmit={submit}
        size="96"
        noValidate
        bodyClassName="gap-5"
      >
        {productsError && <Alert>{productsError}</Alert>}
        {!productsError && products && !inStock.length && !services.some((s) => s.name.trim()) && (
          <Alert tone="warn">No stock on hand. Receive inventory or add service lines only.</Alert>
        )}

        <div className={cx(proposalItems.length > 0 && 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start')}>
        <div className="min-w-0 space-y-5">
        <BillSection title="Document details" hint="The bill date (also the challan date) and an optional note">
          <div className={billDoc.metaStrip}>
            <FormField label="Bill date"><Input type="date" max={today()} value={issuedOn} onValue={setIssuedOn} /></FormField>
            <FormField label="Note" optional hint="Printed on the bill and the challan"><Input maxLength={300} value={note} onValue={setNote} placeholder="Optional" /></FormField>
          </div>
        </BillSection>

        <BillSection
          title="Products"
          hint={goodsValue > 0 ? <>Line total <span className="font-medium tabular-nums text-slate-800">{money(goodsValue)}</span> · stock is deducted when you confirm</> : 'Pick items from inventory — quantities, batches, and serials'}
          flush
        >
          <div className={billDoc.tableWrap}>
            <table className={billDoc.table}>
              <thead className={billDoc.thead}>
                <tr>
                  <th className={billDoc.th}>Product</th>
                  <th className={cx(billDoc.thCenter, 'w-24')}>Qty</th>
                  <th className={cx(billDoc.th, 'w-32')}>Price list</th>
                  <th className={cx(billDoc.thRight, 'w-28')}>Unit price</th>
                  {withGst && <th className={cx(billDoc.thCenter, 'w-16')}>Tax %</th>}
                  <th className={cx(billDoc.thRight, 'w-28')}>Amount</th>
                  <th className="w-10 px-1 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const product = l.productId ? list.find((p) => p.id === l.productId) : null;
                  const entry = l.productId ? stock[l.productId] : null;
                  const preview = l.productId ? stockPreview(l, entry) : null;
                  return (
                    <Fragment key={l.key}>
                      <tr className={billDoc.row}>
                        <td className={billDoc.td}>
                          <Select aria-label="Product" value={l.productId} onValue={(v) => chooseProduct(i, v)} className="h-8 text-xs">
                            <option value="">Select product…</option>
                            {list.map((p) => <option key={p.id} value={p.id} disabled={!(p.stock > 0) && p.id !== l.productId}>{p.name}{p.brand ? ` · ${p.brand}` : ''} · {p.stock ?? 0} {p.unit}</option>)}
                          </Select>
                          {l.detail && <p className="mt-1 line-clamp-1 text-xs text-slate-500" title={l.detail}>{l.detail}</p>}
                        </td>
                        <td className={billDoc.td}>
                          <input type="number" min={0} step="any" value={l.qty} readOnly={Boolean(product?.isSerialized)} title={product?.isSerialized ? 'Set by serial selection' : undefined} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} className={cx(cell, 'text-center tabular-nums', product?.isSerialized && 'bg-slate-50 text-slate-600')} />
                          <div className="mt-0.5 text-center text-[11px] text-slate-400">{l.unit || 'Nos'}</div>
                        </td>
                        <td className={billDoc.td}>
                          <Select aria-label="Price type" value={l.priceType} onValue={(v) => setLine(i, { priceType: v })} className="h-8 text-xs" disabled={!l.productId}>
                            {PRICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </Select>
                        </td>
                        <td className={cx(billDoc.td, 'text-right tabular-nums text-slate-700')}><div className="h-8 leading-8">{preview ? money(preview.rate) : '—'}</div></td>
                        {withGst && <td className={cx(billDoc.td, 'text-center tabular-nums text-slate-600')}><div className="h-8 leading-8">{l.productId ? `${l.gstPercent}%` : '—'}</div></td>}
                        <td className={cx(billDoc.td, 'text-right font-medium tabular-nums text-slate-900')}><div className="h-8 leading-8">{l.productId ? money((Number(l.qty) || 0) * (preview?.rate || 0)) : '—'}</div></td>
                        <td className="px-1 py-2 text-center align-top">
                          <button type="button" aria-label="Remove line" onClick={() => removeLine(i)} className="mt-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                      {l.productId && (
                        <tr className={billDoc.subRow}>
                          <td colSpan={withGst ? 7 : 6} className="px-4 py-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                              <span>
                                {product?.isSerialized
                                  ? `${l.serials?.length || 0} serial${l.serials?.length === 1 ? '' : 's'}`
                                  : l.batch ? 'Batch selected' : 'FIFO batch'}
                                {' · '}{PRICE_TYPES.find((t) => t.id === l.priceType)?.label}
                              </span>
                              <button type="button" onClick={() => setPickLine(i)} className="font-medium text-slate-800 underline-offset-2 hover:underline">
                                {product?.isSerialized ? 'Select serials' : 'Select batch'}
                              </button>
                              {!entry && <span className="text-slate-400">Loading stock…</span>}
                              {entry?.error && <span className="text-red-600">{entry.error}</span>}
                              {preview && entry && !entry.error && !l.batch && !product?.isSerialized && Number(l.qty) > preview.available && (
                                <span className="flex items-center gap-1 text-red-600"><TriangleAlert className="h-3 w-3" /> {preview.available} {l.unit} available</span>
                              )}
                              {preview?.split && <span className="flex items-center gap-1 text-amber-700"><TriangleAlert className="h-3 w-3" /> Multiple batches — split pricing</span>}
                            </div>
                            {product?.isSerialized && l.serials?.length > 0 && <p className="mt-1 line-clamp-2 break-all font-mono text-[11px] text-slate-500">{l.serials.join(', ')}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 bg-slate-50/50 px-4 py-2.5">
            <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setLines((rows) => [...rows, blankLine()])}>Add product line</Button>
          </div>
        </BillSection>

        <ServiceLinesEditor services={services} setServices={setServices} charges={charges} withGst={withGst} money={money} />

        <BillSection
          title="Delivery & transport"
          hint="Printed on the delivery challan that is made with this bill — fill in what you know"
          action={(
            <button type="button" onClick={() => setDeliveryOpen((o) => !o)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
              {deliveryOpen ? 'Hide' : 'Show'}
            </button>
          )}
          bodyClassName={deliveryOpen ? undefined : 'hidden'}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Mode">
              <Select value={transport.mode} onValue={(v) => setT({ mode: v })}>{Object.entries(TRANSPORT_MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </FormField>
            <FormField label="Vehicle no." optional><Input maxLength={20} value={transport.vehicleNo} onValue={(v) => setT({ vehicleNo: v.toUpperCase() })} placeholder="MH12AB1234" className="uppercase" /></FormField>
            <FormField label="Transporter" optional><Input maxLength={120} value={transport.transporter} onValue={(v) => setT({ transporter: v })} /></FormField>
            <FormField label={`Transporter ${taxIdName()}`} optional><Input maxLength={20} value={transport.transporterId} onValue={(v) => setT({ transporterId: v.toUpperCase() })} className="uppercase" /></FormField>
            <FormField label="LR / doc no." optional><Input maxLength={80} value={transport.docNo} onValue={(v) => setT({ docNo: v })} /></FormField>
            <FormField label="Doc date" optional><Input type="date" value={transport.docDate} onValue={(v) => setT({ docDate: v })} /></FormField>
            <FormField label="Distance (km)" optional><Input type="number" min={0} step="1" value={transport.distanceKm} onValue={(v) => setT({ distanceKm: v })} /></FormField>
            <FormField label="Reason">
              <Select value={transport.reason} onValue={(v) => setT({ reason: v })}>{Object.entries(TRANSPORT_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </FormField>
            <FormField label="Dispatch from" optional className="sm:col-span-2 lg:col-span-3"><Textarea rows={2} maxLength={200} value={transport.fromPlace} onValue={(v) => setT({ fromPlace: v })} placeholder="Warehouse address" /></FormField>
            <FormField label="Deliver to" optional className="sm:col-span-2 lg:col-span-3"><Textarea rows={2} maxLength={200} value={transport.toPlace} onValue={(v) => setT({ toPlace: v })} placeholder="Site address" /></FormField>
          </div>
        </BillSection>

        <BillSection title="Summary" hint={`Discount, ${taxName()}, and amount due on this bill`}>
          <DiscountEditor
            embedded
            active={discountActive}
            setActive={setDiscountActive}
            discount={discount}
            setDiscount={setDiscount}
            discountIsPercent={discountIsPercent}
            setDiscountIsPercent={setDiscountIsPercent}
            discountRemark={discountRemark}
            setDiscountRemark={setDiscountRemark}
            summary={summary}
            money={money}
            withGst={withGst}
            goodsLabel="Products"
            goodsValue={goodsValue}
            servicesValue={servicesValue}
            totalLabel="Bill total"
          />
          <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <FormField label="Paid by" hint="The bill is marked paid when you confirm. An advance already received is taken off automatically.">
              <Select value={payMode} onValue={setPayMode}>{Object.entries(PAYMENT_MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </FormField>
            <FormField label="Reference no." optional hint="UPI / transaction id or cheque number"><Input maxLength={80} value={payReference} onValue={setPayReference} /></FormField>
          </div>
        </BillSection>
        </div>

        {proposalItems.length > 0 && (
          <aside className={cx(billDoc.card, 'xl:sticky xl:top-0')}>
            <div className={billDoc.sectionBar}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  <div className={billDoc.sectionTitle}>Proposal fulfillment</div>
                </div>
                <p className={billDoc.sectionHint}>{doneItems} of {goodsItems.length} product lines fully dispatched</p>
              </div>
            </div>
            <div className="border-b border-slate-200 px-4 py-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-700 transition-all" style={{ width: `${goodsItems.length ? Math.round((doneItems / goodsItems.length) * 100) : 0}%` }} /></div>
            </div>
            <ul className="max-h-[min(60dvh,520px)] divide-y divide-slate-100 overflow-y-auto">
              {proposalItems.map((it) => (
                <li key={it.key} className="px-4 py-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={cx('truncate font-medium text-slate-900', it.service && 'text-slate-600')} title={it.line.name}>{it.line.name}</div>
                      {it.line.detail && <div className="line-clamp-2 text-[11px] text-slate-500">{[...new Set(String(it.line.detail).split(' · ').map((x) => x.trim()).filter(Boolean))].join(' · ')}</div>}
                    </div>
                    <div className="shrink-0 tabular-nums text-slate-600">{it.needed} {it.line.unit || 'Nos'}</div>
                  </div>
                  {it.service ? (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-slate-500">Service</span>
                        <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setServices((rows) => [...rows, { ...blankServiceRow(), name: it.line.name, description: it.line.detail || '', rate: Number(it.line.rate) || 0, qty: it.needed, hsn: String(it.line.hsn || '').replace(/\D/g, ''), gstPercent: it.line.gstPercent ?? 18 }])}>Add</Button>
                      </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500">
                        {it.already > 0 && <span>Shipped {it.already}</span>}
                        {it.already > 0 && (it.here > 0 || it.left > 0) && ' · '}
                        {it.here > 0 && <span>On bill {it.here}</span>}
                        {it.here > 0 && it.left > 0 && ' · '}
                        {it.left > 0 ? <span className="font-medium text-slate-800">{it.already > 0 || it.here > 0 ? `${it.left} pending` : 'Pending'}</span> : <span className="inline-flex items-center gap-1 font-medium text-slate-700"><CircleCheck className="h-3 w-3" />Complete</span>}
                      </div>
                      {it.left > 0 && (it.product ? (
                        it.product.stock > 0 ? (
                          <span className="flex shrink-0 items-center gap-2">
                            {it.product.stock < it.left && <span className="text-[11px] text-amber-700">{it.product.stock} in stock</span>}
                            <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => addFromProposal(it)}>Add</Button>
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-red-600"><TriangleAlert className="h-3 w-3" />No stock</span>
                        )
                      ) : (
                        <span className="shrink-0 text-[11px] text-slate-400">Not in catalog</span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        )}
        </div>
      </FormModal>
      {pickLine !== null && lines[pickLine] && (
        <StockPickModal
          line={lines[pickLine]}
          wantQty={lines[pickLine].serials?.length ? 0 : Number(lines[pickLine].qty) || 0}
          products={inStock.length ? inStock : list}
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

/** "Cancel this bill?" — the goods go back into stock. `onConfirm(reason)`. */
export function CancelEwayBillDialog({ ewayBill, open, onClose, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog open={open} onClose={onClose} onConfirm={() => onConfirm(reason)} title={`Cancel bill ${ewayBill?.ewayNo}?`} confirmLabel="Cancel bill" busy={busy}>
      <p>Its {ewayBill?.itemCount ?? ''} item{ewayBill?.itemCount === 1 ? '' : 's'} go back into stock and the number {ewayBill?.ewayNo} is not reused. The delivery challan is cancelled with it and its payment comes off the books.</p>
      <div className="mt-3">
        <Input maxLength={300} value={reason} onValue={setReason} placeholder="Reason (optional)" />
      </div>
    </ConfirmDialog>
  );
}
