'use client';

// A proposal without a 3D design: choose packages/products (qty and price), GST, floor placement and
// installation charges. Autosaves into the design document (`data.quote`) and exports a branded PDF.
import { ArrowLeft, Download, Plus, QrCode, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { normalizeCatalog } from '@/lib/catalog';
import { pricingFromQuote } from '@/lib/pricing';
import { toDateInput, validUntilInput } from '@/lib/validity';
import { generateQuotePdf } from '@/lib/pdf';
import { DEFAULT_SYSTEM, computeQuoteSystem, deriveQuoteSystem, wattsFrom } from '@/lib/quoteModel';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, FormField, Input, LoadingBlock, NumField, Select, toast } from '../kit';
import CoverPicker from '../kit/CoverPicker';
import AuthGuard from '../layout/AuthGuard';
import ChargePicker, { chargesTotal } from './ChargePicker';
import ClientChangeRequestPanel from './ClientChangeRequestPanel';
import ShareModal from './ShareModal';
import { ProposalGstModeToggle } from '../proposal/ProposalGstControls';
import { DESIGN_STATUSES } from './shared';

const EMPTY = { pricingMode: 'package', packageId: '', packagePrice: 0, packageGstPercent: 18, bundle: [], materials: {}, extraItems: [], system: { ...DEFAULT_SYSTEM }, items: [], withGst: true, gstPercent: 18, discount: 0, discountIsPercent: false, floorPlacement: 0, floorCost: 0, outlookYears: 10, installationCharges: [] };
const FLOORS = ['Ground floor', '1st floor', '2nd floor', '3rd floor', '4th floor', '5th floor+'];
const num = (v) => Math.max(0, Number(v) || 0);
const selectCls = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs';
const inputCls = 'mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs';

/** The priced lines of a proposal: the chosen package, or one product per category. The PDF and totals read these. */
function buildItems(q, packages) {
  if (q.pricingMode === 'package') {
    const pkg = (packages || []).find((p) => p.id === q.packageId);
    if (!q.packageId) return [];
    return [{ kind: 'package', refId: q.packageId, name: pkg?.name || 'Solar package', detail: [pkg?.kw ? `${pkg.kw} kW` : '', pkg?.description].filter(Boolean).join(' · '), unit: 'Set', qty: 1, kw: Number(pkg?.kw) || 0, price: num(q.packagePrice), gstPercent: num(q.packageGstPercent) || num(q.gstPercent) || 18, bundle: q.bundle || [] }];
  }
  return Object.values(q.materials || {}).filter((m) => m.productId).map((m) => ({ kind: 'product', refId: m.productId, name: m.name, detail: m.detail, category: m.category, panel: m.panel, unit: m.unit, qty: num(m.qty), price: num(m.price), hsn: m.hsn, gstPercent: num(m.gstPercent) || num(q.gstPercent) || 18 }));
}

function Editor({ designId }) {
  const company = useSession((s) => s.company);
  const { data: design, loading, error, setData } = useResource(`/api/designs/${designId}`);
  const { data: packages } = useResource('/api/packages');
  const { data: products } = useResource('/api/products');
  const { data: categories } = useResource('/api/categories');
  const { data: rawCatalog } = useResource('/api/catalog');
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('draft');
  const [validUntil, setValidUntil] = useState('');
  const [save, setSave] = useState('saved');
  const [exporting, setExporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (design && !quote) {
      const q = design.data?.quote || {};
      setQuote({ ...EMPTY, ...q, installationCharges: Array.isArray(q.installationCharges) ? q.installationCharges : [] });
      setStatus(design.status);
      setValidUntil(validUntilInput(design.validUntil));
    }
  }, [design, quote]);

  const currency = company?.currency || 'INR';
  const rate = Number(quote?.tariff) > 0 ? Number(quote.tariff) : Number(company?.tariff) || 8; // this proposal's rate, else the company's
  const tariff = rate;
  const panels = useMemo(() => normalizeCatalog(rawCatalog).panels, [rawCatalog]);
  const sysInfo = useMemo(() => (quote ? deriveQuoteSystem(quote, panels) : null), [quote, panels]);
  const spec = sysInfo?.spec;
  const money = (v) => formatMoney(v, currency);
  const totals = useMemo(() => {
    if (!quote) return null;
    const materialTotal = quote.items.reduce((a, it) => a + num(it.qty) * num(it.price), 0);
    const extra = (quote.extraItems || []).reduce((a, it) => a + num(it.qty) * num(it.price), 0);
    const pricing = pricingFromQuote(quote);
    return { materialTotal, extra, ...pricing, grandTotal: pricing.total };
  }, [quote]);

  const change = (patch) => {
    dirty.current = true;
    setSave('saving');
    setQuote((q) => {
      const next = { ...q, ...patch };
      return { ...next, items: buildItems(next, packages) };
    });
  };
  const groups = useMemo(() => (categories || []).map((c) => ({ ...c, products: (products || []).filter((p) => p.category === c.id || p.category?.id === c.id) })).filter((c) => c.products.length), [categories, products]);

  const choosePackage = (id) => {
    const pkg = packages.find((p) => p.id === id);
    change({ ...(pkg?.kw ? { system: { ...quote.system, kwp: Number(pkg.kw) } } : {}), packageId: id, packagePrice: pkg ? num(pkg.price) : 0, bundle: (pkg?.items || []).map((it) => ({ panel: it.itemType === 'panel' || it.type === 'panels' ? { brand: it.brand, model: it.model, watts: Number(it.watts) || wattsFrom(it.model, it.spec, it.name) } : undefined, name: it.name, brand: it.brand, model: it.model, category: it.categoryName, detail: [it.brand && `Brand: ${it.brand}`, it.model && `Model: ${it.model}`, it.watts ? `${it.watts} W` : '', it.spec].filter(Boolean).join(' · '), qty: it.qty, unit: it.unit, price: num(it.price), hsn: it.hsnCode || '', gstPercent: it.gstPercent != null ? num(it.gstPercent) : undefined })) });
  };
  const setMaterial = (cat, patch) => change({ materials: { ...quote.materials, [cat.id]: { ...(quote.materials[cat.id] || {}), ...patch } } });
  const chooseMaterial = (cat, productId) => {
    const p = cat.products.find((x) => x.id === productId);
    setMaterial(cat, p ? { productId, name: p.name || [p.brand, p.model].filter(Boolean).join(' '), detail: [p.brand, p.model].filter(Boolean).join(' '), category: cat.name, hsn: p.hsnCode || '', panel: p.type === 'panels' || cat.type === 'panels' ? { brand: p.brand, model: p.model, watts: Number(p.watts) || wattsFrom(p.model, p.name), length: p.length, width: p.width, warrantyYears: p.warrantyYears, manufactureYear: p.manufactureYear } : undefined, unit: p.unit || 'Nos', qty: quote.materials[cat.id]?.qty || 1, price: num(p.price), gstPercent: quote.materials[cat.id]?.gstPercent ?? (num(p.gstPercent) || num(quote.gstPercent) || 18) } : { productId: '' });
  };

  // debounced autosave
  useEffect(() => {
    if (!dirty.current || !quote) return undefined;
    const t = setTimeout(async () => {
      try {
        await api(`/api/designs/${designId}`, { method: 'PUT', body: { data: { quote }, validUntil: validUntil || null, summary: { cost: Math.round(totals.grandTotal), pricing: totals } } });
        dirty.current = false;
        setSave('saved');
      } catch {
        setSave('error');
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [quote, totals, designId, validUntil]);

  const model = useMemo(() => (quote && totals && sysInfo ? computeQuoteSystem(quote, sysInfo.spec, { count: sysInfo.count, years: quote.outlookYears, tariff, cost: totals.grandTotal }) : null), [quote, totals, sysInfo, tariff]);
  const changeStatus = async (v) => {
    setStatus(v);
    try {
      await api(`/api/designs/${designId}`, { method: 'PUT', body: { status: v } });
    } catch (e) {
      toast.error(e.message);
    }
  };
  const download = async (cover) => {
    setExporting(true);
    try {
      await generateQuotePdf({ quote, name: design.name, company, client: design.client, designId, currency, spec, count: sysInfo.count, tariff, validUntil: validUntil ? new Date(`${validUntil}T23:59:59`) : null, cover });
      setPicking(false);
    } catch (e) {
      console.error(e);
      toast.error('Sorry, the PDF could not be created. Please try again.');
    }
    setExporting(false);
  };

  if (loading || !quote) return error ? <Alert>{error}</Alert> : <LoadingBlock />;
  const client = design.client || {};

  return (
    <div className="h-dvh overflow-y-auto bg-slate-50"><div className="mx-auto max-w-6xl p-4 pb-16 sm:p-6">
      <Link href={client.id ? `/dashboard/clients/${client.id}` : '/dashboard/designs'} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{design.name}</h1>
          <p className="text-sm text-slate-500">Proposal for {client.name} · no 3D layout · <span>{save === 'saving' ? 'Saving…' : save === 'error' ? 'Not saved — retry by editing' : 'Saved'}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValue={changeStatus} aria-label="Status" className="w-36">{DESIGN_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
          <Button icon={QrCode} onClick={() => setShareOpen(true)}>Share</Button>
          <Button variant="primary" icon={Download} loading={exporting} disabled={!quote.items.length || !model?.ready} title={!model?.ready ? 'Choose a package with a solar panel, or a solar panel product, first' : undefined} onClick={() => setPicking(true)}>Download PDF</Button>
        </div>
      </div>

      <ClientChangeRequestPanel
        design={design}
        className="mb-5"
        onSent={(updated) => setData((prev) => ({ ...prev, clientResponse: updated.clientResponse, clientReviewInvite: updated.clientReviewInvite, updatedAt: updated.updatedAt }))}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Materials</h2>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/80 p-1">
                {[['package', 'Package'], ['custom', 'Custom']].map(([m, label]) => (
                  <button key={m} type="button" onClick={() => change({ pricingMode: m })} className={`h-7 rounded-md px-4 text-xs font-semibold transition ${quote.pricingMode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
                ))}
              </div>
            </div>

            {sysInfo && <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">System: {sysInfo.count} × {sysInfo.spec.watts} W = {((sysInfo.count * sysInfo.spec.watts) / 1000).toFixed(2)} kWp</p>}
            {!sysInfo && quote.items.length > 0 && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{quote.pricingMode === 'custom' ? 'Pick a solar panel product (and its quantity) to size the system — the PDF needs it.' : 'This package has no solar panel line, so the system size is unknown — the PDF needs it.'}</p>}
            {quote.pricingMode === 'package' ? (
              <div className="space-y-3">
                <Select value={quote.packageId} onValue={choosePackage} aria-label="Package">
                  <option value="">{packages?.length ? 'Choose a package…' : 'No packages yet — create one under Packages'}</option>
                  {(packages || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.kw ? ` (${p.kw} kW)` : ''}</option>)}
                </Select>
                {quote.packageId && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs text-slate-600">Package price ({currency})<NumField min={0} step="any" value={quote.packagePrice} onValue={(v) => change({ packagePrice: v })} className={inputCls} /></label>
                      <label className="block text-xs text-slate-600">GST on package (%)<NumField min={0} max={100} step="any" value={quote.packageGstPercent ?? quote.gstPercent} onValue={(v) => change({ packageGstPercent: v })} className={inputCls} /></label>
                    </div>
                    <div className="overflow-hidden rounded-md border border-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span>Products in this package</span><span>{quote.bundle?.length || 0} items</span></div>
                      {quote.bundle?.length ? (
                        <table className="w-full text-left text-xs">
                          <thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-1.5 font-medium">Product</th><th className="px-3 py-1.5 font-medium">Details</th><th className="px-3 py-1.5 text-right font-medium">Qty</th></tr></thead>
                          <tbody>
                            {quote.bundle.map((it, i) => (
                              <tr key={i} className="border-t border-slate-100 align-top">
                                <td className="px-3 py-2"><div className="font-medium text-slate-800">{it.name || '—'}</div>{it.category && <div className="text-[10px] text-slate-400">{it.category}</div>}</td>
                                <td className="px-3 py-2 text-slate-500">{it.detail || '—'}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-700">{it.qty} {it.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : <p className="px-3 py-3 text-[11px] text-slate-400">This package has no products listed. Add them under Packages.</p>}
                    </div>
                  </>
                )}
              </div>
            ) : !groups.length ? (
              <p className="text-xs text-slate-500">Add products to your catalog categories first, then pick them here.</p>
            ) : (
              <div className="space-y-3">
                {groups.map((cat) => {
                  const m = quote.materials[cat.id] || {};
                  return (
                    <div key={cat.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-1 flex justify-between text-xs font-medium text-slate-700"><span>{cat.name}</span>{m.productId && <span className="font-semibold text-slate-900">{money(num(m.qty) * num(m.price))}</span>}</div>
                      <select className={selectCls} value={m.productId || ''} onChange={(e) => chooseMaterial(cat, e.target.value)}>
                        <option value="">Not included</option>
                        {cat.products.map((p) => <option key={p.id} value={p.id}>{p.name || [p.brand, p.model].filter(Boolean).join(' ')} ({money(p.price)}{p.unit ? `/${p.unit}` : ''})</option>)}
                      </select>
                      {m.productId && (
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <label className="text-xs text-slate-600">Qty ({m.unit})<NumField min={0} step="any" value={m.qty} onValue={(v) => setMaterial(cat, { qty: v })} className={inputCls} /></label>
                          <label className="text-xs text-slate-600">Price each ({currency})<NumField min={0} step="any" value={m.price} onValue={(v) => setMaterial(cat, { price: v })} className={inputCls} /></label>
                          <label className="text-xs text-slate-600">GST (%)<NumField min={0} max={100} step="any" value={m.gstPercent ?? quote.gstPercent} onValue={(v) => setMaterial(cat, { gstPercent: v })} className={inputCls} /></label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Additional products & services</h2>
              <button type="button" onClick={() => change({ extraItems: [...(quote.extraItems || []), { name: '', detail: '', qty: 1, unit: 'Nos', price: 0, gstPercent: quote.gstPercent || 18, hsn: '' }] })} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"><Plus className="h-3.5 w-3.5" />Add</button>
            </div>
            {!(quote.extraItems || []).length ? <p className="text-xs text-slate-500">Optional extra line items (labour, transport, AMC, etc.) with their own price and GST.</p> : (
              <div className="space-y-3">
                {(quote.extraItems || []).map((it, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex gap-2">
                      <Input maxLength={160} value={it.name} onValue={(v) => change({ extraItems: quote.extraItems.map((x, j) => (j === i ? { ...x, name: v } : x)) })} placeholder="Name" className="flex-1" />
                      <button type="button" aria-label="Remove" onClick={() => change({ extraItems: quote.extraItems.filter((_, j) => j !== i) })} className="grid h-9 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <label className="text-[11px] text-slate-600">Qty<NumField min={0} step="any" value={it.qty} onValue={(v) => change({ extraItems: quote.extraItems.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} className={inputCls} /></label>
                      <label className="text-[11px] text-slate-600">Unit<Input maxLength={20} value={it.unit} onValue={(v) => change({ extraItems: quote.extraItems.map((x, j) => (j === i ? { ...x, unit: v } : x)) })} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-xs" /></label>
                      <label className="text-[11px] text-slate-600">Price ({currency})<NumField min={0} step="any" value={it.price} onValue={(v) => change({ extraItems: quote.extraItems.map((x, j) => (j === i ? { ...x, price: v } : x)) })} className={inputCls} /></label>
                      <label className="text-[11px] text-slate-600">GST %<NumField min={0} max={100} step="any" value={it.gstPercent ?? quote.gstPercent} onValue={(v) => change({ extraItems: quote.extraItems.map((x, j) => (j === i ? { ...x, gstPercent: v } : x)) })} className={inputCls} /></label>
                      <label className="text-[11px] text-slate-600">HSN<Input maxLength={20} value={it.hsn} onValue={(v) => change({ extraItems: quote.extraItems.map((x, j) => (j === i ? { ...x, hsn: v } : x)) })} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-xs" /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Floor placement">
                <Select value={String(quote.floorPlacement)} onValue={(v) => change({ floorPlacement: Number(v), floorCost: Number(v) * 5000 })}>{FLOORS.map((f, i) => <option key={f} value={i}>{f}</option>)}</Select>
              </FormField>
              <FormField label={`Placement cost (${currency})`}><NumField min={0} step="any" value={quote.floorCost} onValue={(v) => change({ floorCost: v })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></FormField>
            </div>
            <FormField label="Valid until" hint="The last day this proposal's price holds. It is printed on the PDF.">
              <input type="date" min={toDateInput(new Date())} value={validUntil} onChange={(e) => { dirty.current = true; setSave('saving'); setValidUntil(e.target.value); }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Financial outlook (years)"><NumField min={1} max={30} step={1} value={quote.outlookYears} onValue={(v) => change({ outlookYears: Math.round(v) })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></FormField>
              <FormField label={`Electricity rate (${currency}/kWh)`}><NumField min={0} step="any" value={rate} onValue={(v) => change({ tariff: v })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></FormField>
            </div>
            <p className="-mt-3 text-xs text-slate-500">The PDF lists savings month by month ({(Number(quote.outlookYears) || 0) * 12} months) at this rate, held flat.</p>
            <ChargePicker value={quote.installationCharges} onChange={(installationCharges) => change({ installationCharges })} currency={currency} />
          </Card>
        </div>

        <Card className="h-fit space-y-2 p-5 text-sm lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold text-slate-900">Price</h2>
          <div className="flex justify-between"><span className="text-slate-600">{quote.pricingMode === 'package' ? 'Package' : 'Materials'}</span><b>{money(totals.materialTotal)}</b></div>
          {num(quote.floorCost) > 0 && <div className="flex justify-between"><span className="text-slate-600">Floor placement</span><b>{money(num(quote.floorCost))}</b></div>}
          {(quote.extraItems || []).filter((c) => c.name).map((c, i) => <div key={i} className="flex justify-between"><span className="text-slate-600">{c.name}</span><b>{money(num(c.qty) * num(c.price))}</b></div>)}
          {(quote.installationCharges || []).filter((c) => c.name).map((c, i) => <div key={i} className="flex justify-between"><span className="text-slate-600">{c.name}</span><b>{money(c.price)}</b></div>)}
          <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-semibold">Subtotal</span><b>{money(totals.subtotal)}</b></div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600">Discount<NumField min={0} step="any" value={quote.discount || 0} onValue={(v) => change({ discount: v })} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-xs" /></label>
            <label className="text-xs text-slate-600">Type<Select value={quote.discountIsPercent ? 'percent' : 'flat'} onValue={(v) => change({ discountIsPercent: v === 'percent' })} className="mt-1 h-9 w-full text-xs">{[['flat', 'Flat'], ['percent', '%']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
          </div>
          {totals.discountAmount > 0 && <div className="flex justify-between text-xs text-emerald-700"><span>Discount</span><span>-{money(totals.discountAmount)}</span></div>}
          <ProposalGstModeToggle withGst={quote.withGst !== false} onChange={(v) => change({ withGst: v })} className="border-t border-slate-200 pt-2" />
          {quote.withGst !== false && totals.gstTotal > 0 && (
            <>
              <div className="flex justify-between text-xs text-slate-600"><span>Taxable value</span><span>{money(totals.taxableTotal)}</span></div>
              <div className="flex justify-between text-xs text-slate-600"><span>Total GST</span><span>{money(totals.gstTotal)}</span></div>
            </>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><span className="font-semibold">Total</span><b>{money(totals.grandTotal)}</b></div>
        </Card>
      </div>
      {shareOpen && <ShareModal designId={designId} onClose={() => setShareOpen(false)} />}
      <CoverPicker open={picking} onClose={() => setPicking(false)} onDownload={download} company={company} />
    </div></div>
  );
}

export default function QuickProposal({ designId }) {
  return (
    <AuthGuard role={['company', 'agent']} permission="designs:view">
      <Editor designId={designId} />
    </AuthGuard>
  );
}
