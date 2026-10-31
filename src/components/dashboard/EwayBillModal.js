'use client';

// Generate an e-way bill: products picked from stock (the server takes the stock and prices each line from its batch),
// how the goods travel, and the GST portal's number if one was generated there. The first step of the sale chain.
import { Boxes, CircleCheck, ClipboardList, Plus, TriangleAlert, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { linesFromPricing, resolveProposalPricing, summarizeLinePricing } from '@/lib/pricing';
import { useResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import { TRANSPORT_MODE_LABEL, TRANSPORT_REASON_LABEL } from '@/lib/ewayBillPdf';
import StockPickModal from './StockPickModal';
import { PRICE_TYPES, productDetail, stockPreview, useStockCache } from './stockLines';
import { Alert, Button, ConfirmDialog, FormField, FormModal, Input, Select, Textarea, cx } from '../kit';

const today = () => new Date().toISOString().slice(0, 10);
let seq = 0;
const blankLine = () => ({ key: `l${++seq}`, productId: '', name: '', detail: '', hsn: '', unit: 'Nos', gstPercent: 18, priceType: 'retail', qty: 1, batch: '', serials: [] });

const KIND = [
  { id: 'plain', label: 'No GST' },
  { id: 'tax', label: 'GST' },
];

const cell = 'w-full bg-transparent text-xs outline-none';

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
  const { stock, loadStock } = useStockCache();
  const [lines, setLines] = useState([blankLine()]);
  const [kind, setKind] = useState('tax');
  const [transport, setTransport] = useState({ mode: 'road', vehicleNo: '', transporter: '', transporterId: '', docNo: '', docDate: '', fromPlace: company?.address || '', toPlace: clientAddress || '', distanceKm: '', reason: 'supply' });
  const [govtEwayNo, setGovtEwayNo] = useState('');
  const [issuedOn, setIssuedOn] = useState(today());
  const [note, setNote] = useState('');
  const [pickLine, setPickLine] = useState(null);
  const [error, setError] = useState('');
  const money = (v) => formatMoney(v, currency);
  const withGst = kind === 'tax';
  const list = useMemo(() => (Array.isArray(products) ? products : []), [products]);
  const inStock = useMemo(() => list.filter((p) => p.stock > 0), [list]);

  const effective = useMemo(
    () => lines.map((l) => (l.productId ? { ...l, rate: stockPreview(l, stock[l.productId]).rate } : l)),
    [lines, stock],
  );
  const summary = useMemo(() => summarizeLinePricing({ lines: effective.filter((l) => l.productId), gstIncluded: false, withGst }), [effective, withGst]);

  // the proposal's items, matched to inventory, with what earlier e-way bills already sent and what this one carries
  const proposalItems = useMemo(() => {
    if (!proposal) return [];
    const hasLines = proposal.pricing?.lines?.some((l) => l?.name) || proposal.quote?.items?.length || proposal.quote?.extraItems?.length;
    if (!hasLines) return [];
    const resolved = resolveProposalPricing({ pricing: proposal.pricing, quote: proposal.quote, total: proposal.total, title: proposal.title });
    const sent = new Map(); // productId or normalised name → qty on earlier (not cancelled) e-way bills
    for (const e of ewayBills || []) {
      if (e.status === 'cancelled') continue;
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
  /** From the side panel: put this proposal item on the e-way bill with what is still left to send (capped by stock). */
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
    if (!used.length) return setError('Add at least one product from stock');
    for (const l of effective) {
      if (!l.productId) continue;
      const product = list.find((p) => p.id === l.productId);
      const { available } = stockPreview(l, stock[l.productId]);
      if (product?.isSerialized && !l.serials?.length) return setError(`Choose the serial numbers of ${l.name}`);
      if (!(Number(l.qty) > 0)) return setError(`Enter the quantity of ${l.name}`);
      if (stock[l.productId] && !l.batch && !product?.isSerialized && Number(l.qty) > available) return setError(`Only ${available} ${l.unit} of ${l.name} in stock`);
    }
    const digits = govtEwayNo.replace(/\D/g, '');
    if (digits && digits.length !== 12) return setError('The e-way bill number from the GST portal has 12 digits');
    setError('');
    onSubmit({
      ...party,
      lines: used.map((l) => ({ productId: l.productId, priceType: l.priceType, qty: l.serials?.length ? l.serials.length : Number(l.qty) || 0, batch: l.batch || '', serials: l.serials || [], detail: l.detail })),
      withGst,
      transport: { ...transport, distanceKm: transport.distanceKm === '' ? null : Number(transport.distanceKm) },
      govtEwayNo: digits,
      issuedOn,
      note,
    });
  };

  const setT = (patch) => setTransport((t) => ({ ...t, ...patch }));

  return (
    <>
      <FormModal
        open={open}
        onClose={onClose}
        title={`E-way bill · ${partyName}`}
        description={proposal ? 'Pick the products leaving stock and how they travel; the panel on the right shows what the proposal promised and what is still to send. Stock is reduced when the e-way bill is generated.' : 'Pick the products leaving stock and how they travel. Stock is reduced when the e-way bill is generated; the client pays on a bill afterwards.'}
        submitLabel="Generate e-way bill"
        busy={busy}
        error={error}
        onSubmit={submit}
        size="96"
        noValidate
      >
        <div className="absolute top-4 right-12">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/80 p-1">
            {KIND.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => setKind(id)} className={cx('h-8 rounded-md px-3 text-xs font-semibold transition', kind === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900')}>{label}</button>
            ))}
          </div>
        </div>

        {productsError && <Alert>{productsError}</Alert>}
        {!productsError && products && !inStock.length && <Alert tone="warn">Nothing is in stock. Receive stock on a product first (Inventory › product › Stock).</Alert>}

        <div className={cx(proposalItems.length > 0 && 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start')}>
        <div className="min-w-0 space-y-4">
        <div className="rounded-xl border border-sky-200 bg-sky-50/40">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-900"><Boxes className="h-4 w-4" />Goods from stock</div>
            <div className="text-xs text-slate-600">Value <b className="text-slate-900">{money(summary.total)}</b>{withGst && summary.gstTotal > 0 && <span className="text-slate-500"> · includes {money(summary.gstTotal)} GST</span>}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-white/70 text-slate-600">
                <tr className="border-b border-sky-100">
                  <th className="px-3 py-2 text-left font-semibold">Product</th>
                  <th className="w-24 px-3 py-2 text-center font-semibold">Qty</th>
                  <th className="w-36 px-3 py-2 text-left font-semibold">Price</th>
                  <th className="w-28 px-3 py-2 text-right font-semibold">Rate</th>
                  {withGst && <th className="w-16 px-3 py-2 text-center font-semibold">GST%</th>}
                  <th className="w-28 px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="w-8 px-1 py-2" />
                </tr>
              </thead>
              <tbody className="bg-white">
                {lines.map((l, i) => {
                  const product = l.productId ? list.find((p) => p.id === l.productId) : null;
                  const entry = l.productId ? stock[l.productId] : null;
                  const preview = l.productId ? stockPreview(l, entry) : null;
                  return (
                    <Fragment key={l.key}>
                      <tr className={cx(!l.productId && 'border-b border-slate-100')}>
                        <td className="px-3 py-2 align-top">
                          <Select aria-label="Product" value={l.productId} onValue={(v) => chooseProduct(i, v)} className="h-9 text-xs">
                            <option value="">— Choose a product —</option>
                            {list.map((p) => <option key={p.id} value={p.id} disabled={!(p.stock > 0) && p.id !== l.productId}>{p.name}{p.brand ? ` · ${p.brand}` : ''} · {p.stock ?? 0} {p.unit} in stock</option>)}
                          </Select>
                          {l.detail && <p className="mt-1 line-clamp-1 text-[11px] text-slate-500" title={l.detail}>{l.detail}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="number" min={0} step="any" value={l.qty} readOnly={Boolean(product?.isSerialized)} title={product?.isSerialized ? 'The number of serial numbers chosen' : undefined} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} className={cx(cell, 'h-9 rounded-md border border-slate-200 px-2 text-center', product?.isSerialized && 'bg-slate-50 text-slate-500')} />
                          <div className="mt-1 text-center text-[11px] text-slate-500">{l.unit || 'Nos'}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Select aria-label="Price type" value={l.priceType} onValue={(v) => setLine(i, { priceType: v })} className="h-9 text-xs" disabled={!l.productId}>
                            {PRICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums text-slate-700"><div className="h-9 leading-9">{preview ? money(preview.rate) : '—'}</div></td>
                        {withGst && <td className="px-3 py-2 text-center align-top text-slate-700"><div className="h-9 leading-9">{l.productId ? `${l.gstPercent}%` : '—'}</div></td>}
                        <td className="px-3 py-2 text-right align-top font-semibold tabular-nums text-slate-900"><div className="h-9 leading-9">{l.productId ? money((Number(l.qty) || 0) * (preview?.rate || 0)) : '—'}</div></td>
                        <td className="px-1 py-2 text-center align-top">
                          <button type="button" aria-label="Remove line" onClick={() => removeLine(i)} className="mt-2 rounded p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                      {l.productId && (
                        <tr className="border-b border-slate-100 bg-sky-50/40">
                          <td colSpan={withGst ? 7 : 6} className="px-3 pb-2.5 pt-1">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                              <Boxes className="h-3.5 w-3.5 text-sky-700" />
                              <span>
                                {product?.isSerialized
                                  ? `${l.serials?.length || 0} serial number${l.serials?.length === 1 ? '' : 's'} selected`
                                  : l.batch ? 'From the chosen batch' : 'Oldest batch first'}
                                {` · ${PRICE_TYPES.find((t) => t.id === l.priceType)?.label} price`}
                              </span>
                              <button type="button" onClick={() => setPickLine(i)} className="rounded-md border border-sky-300 bg-white px-2 py-1 font-medium text-sky-800 hover:bg-sky-50">
                                {product?.isSerialized ? 'Choose serial numbers' : 'Choose batch'}
                              </button>
                              {!entry && <span className="text-slate-500">Loading stock…</span>}
                              {entry?.error && <span className="text-red-600">{entry.error}</span>}
                              {preview && entry && !entry.error && !l.batch && !product?.isSerialized && Number(l.qty) > preview.available && (
                                <span className="flex items-center gap-1 text-red-600"><TriangleAlert className="h-3 w-3" /> Only {preview.available} {l.unit} in stock</span>
                              )}
                              {preview?.split && <span className="flex items-center gap-1 text-amber-700"><TriangleAlert className="h-3 w-3" /> Comes from {preview.used.length} batches at different prices: one line per batch, at its own price.</span>}
                            </div>
                            {product?.isSerialized && l.serials?.length > 0 && <p className="mt-1.5 line-clamp-2 break-all font-mono text-[11px] text-slate-500">S/N {l.serials.join(', ')}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5">
            <Button size="sm" icon={Plus} onClick={() => setLines((rows) => [...rows, blankLine()])}>Add product</Button>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="mb-3 text-sm font-semibold text-amber-900">Transport</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Mode">
              <Select value={transport.mode} onValue={(v) => setT({ mode: v })}>{Object.entries(TRANSPORT_MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </FormField>
            <FormField label="Vehicle number" optional><Input maxLength={20} value={transport.vehicleNo} onValue={(v) => setT({ vehicleNo: v.toUpperCase() })} placeholder="MH12AB1234" className="uppercase" /></FormField>
            <FormField label="Transporter" optional><Input maxLength={120} value={transport.transporter} onValue={(v) => setT({ transporter: v })} placeholder="Name of the transporter" /></FormField>
            <FormField label="Transporter GSTIN / ID" optional><Input maxLength={15} value={transport.transporterId} onValue={(v) => setT({ transporterId: v.toUpperCase() })} className="uppercase" /></FormField>
            <FormField label="Transport doc no." optional hint="LR / RR / airway bill"><Input maxLength={80} value={transport.docNo} onValue={(v) => setT({ docNo: v })} /></FormField>
            <FormField label="Transport doc date" optional><Input type="date" value={transport.docDate} onValue={(v) => setT({ docDate: v })} /></FormField>
            <FormField label="Distance (km)" optional><Input type="number" min={0} step="1" value={transport.distanceKm} onValue={(v) => setT({ distanceKm: v })} /></FormField>
            <FormField label="Reason">
              <Select value={transport.reason} onValue={(v) => setT({ reason: v })}>{Object.entries(TRANSPORT_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </FormField>
            <FormField label="Dispatch from" optional className="sm:col-span-2"><Textarea rows={2} maxLength={200} value={transport.fromPlace} onValue={(v) => setT({ fromPlace: v })} placeholder="Your warehouse / shop address" /></FormField>
            <FormField label="Deliver to" optional className="sm:col-span-2"><Textarea rows={2} maxLength={200} value={transport.toPlace} onValue={(v) => setT({ toPlace: v })} placeholder="The site address" /></FormField>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Date"><Input type="date" max={today()} value={issuedOn} onValue={setIssuedOn} /></FormField>
          <FormField label="E-way bill no. from the GST portal" optional hint="12 digits, if you generated one on ewaybillgst.gov.in"><Input maxLength={14} inputMode="numeric" value={govtEwayNo} onValue={setGovtEwayNo} placeholder="1234 5678 9012" /></FormField>
          <FormField label="Note" optional><Input maxLength={300} value={note} onValue={setNote} placeholder="Printed under the declaration" /></FormField>
        </div>
        </div>

        {proposalItems.length > 0 && (
          <aside className="rounded-xl border border-emerald-200 bg-emerald-50/40 lg:sticky lg:top-0">
            <div className="border-b border-emerald-100 px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><ClipboardList className="h-4 w-4" />In the proposal</div>
              <p className="mt-0.5 text-[11px] text-slate-600">{doneItems} of {goodsItems.length} item{goodsItems.length === 1 ? '' : 's'} fully dispatched. “Add” puts what is left on this e-way bill.</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${goodsItems.length ? Math.round((doneItems / goodsItems.length) * 100) : 0}%` }} /></div>
            </div>
            <ul className="max-h-[60dvh] divide-y divide-emerald-100 overflow-y-auto bg-white">
              {proposalItems.map((it) => (
                <li key={it.key} className={cx('px-4 py-2.5 text-xs', (it.service || (!it.service && it.left <= 0)) && 'bg-slate-50/60')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={cx('truncate font-medium', it.service ? 'text-slate-500' : 'text-slate-900')} title={it.line.name}>{it.line.name}</div>
                      {it.line.detail && <div className="line-clamp-2 text-[11px] text-slate-500" title={it.line.detail}>{[...new Set(String(it.line.detail).split(' · ').map((x) => x.trim()).filter(Boolean))].join(' · ')}</div>}
                    </div>
                    <div className="shrink-0 text-right tabular-nums text-slate-700">{it.needed} {it.line.unit || 'Nos'}</div>
                  </div>
                  {it.service ? (
                    <div className="mt-1 text-[11px] text-slate-500">Service · goes on the bill, not the e-way bill</div>
                  ) : (
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-600">
                        {it.already > 0 && <span>sent {it.already}</span>}
                        {it.already > 0 && (it.here > 0 || it.left > 0) && ' · '}
                        {it.here > 0 && <span className="text-sky-700">here {it.here}</span>}
                        {it.here > 0 && it.left > 0 && ' · '}
                        {it.left > 0 ? <span className="font-semibold text-amber-700">{it.already > 0 || it.here > 0 ? `left ${it.left}` : 'not sent yet'}</span> : <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CircleCheck className="h-3 w-3" />all sent</span>}
                      </div>
                      {it.left > 0 && (it.product ? (
                        it.product.stock > 0 ? (
                          <span className="flex shrink-0 items-center gap-2">
                            {it.product.stock < it.left && <span className="text-[11px] text-amber-700">only {it.product.stock} {it.product.unit} in stock</span>}
                            <button type="button" onClick={() => addFromProposal(it)} className="inline-flex h-6 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 font-semibold text-emerald-800 hover:bg-emerald-50"><Plus className="h-3 w-3" />Add</button>
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200"><TriangleAlert className="h-3 w-3" />Out of stock</span>
                        )
                      ) : (
                        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Not in inventory</span>
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

/** "Cancel this e-way bill?" — the goods go back into stock. `onConfirm(reason)`. */
export function CancelEwayBillDialog({ ewayBill, open, onClose, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog open={open} onClose={onClose} onConfirm={() => onConfirm(reason)} title={`Cancel e-way bill ${ewayBill?.ewayNo}?`} confirmLabel="Cancel e-way bill" busy={busy}>
      <p>Its {ewayBill?.itemCount ?? ''} item{ewayBill?.itemCount === 1 ? '' : 's'} go back into stock and the number {ewayBill?.ewayNo} is not reused. Only an e-way bill that is not on a bill yet can be cancelled.</p>
      <div className="mt-3">
        <Input maxLength={300} value={reason} onValue={setReason} placeholder="Reason (optional)" />
      </div>
    </ConfirmDialog>
  );
}
