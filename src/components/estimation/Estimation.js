'use client';

// Estimation: pick products, packages and services (or type your own lines), choose with or without GST, and
// download a simple PDF. Isolated on purpose — nothing is saved, and the PDF is built here in the browser.
// Layout: the catalog on the left (one tap adds, a stepper changes the quantity), the estimate on the right.
import { ArrowLeft, Download, FileOutput, Minus, PackageOpen, Plus, Save, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { estimateTotals, newLine } from '@/lib/estimation';
import { useSession } from '@/lib/session';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, CardHeader, FormField, Input, LoadingBlock, NumField, PageHeader, Select, Textarea, Toggle, cx, toast } from '../kit';
import { defaultTaxRate, taxName } from '@/lib/tax';
import ConvertEstimateDialog from './ConvertEstimateDialog';

const today = () => new Date().toISOString().slice(0, 10);
const TABS = [
  { id: 'packages', label: 'Packages' },
  { id: 'products', label: 'Products' },
  { id: 'services', label: 'Services' },
];
const KIND = { packages: 'package', products: 'product', services: 'service' };
const cell = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand-muted/60';

/** `/dashboard/estimation/new` starts an estimate; `/dashboard/estimation/<id>` opens a saved one. */
export default function Estimation({ id }) {
  const saved = useResource(id && id !== 'new' ? `/api/estimates/${id}` : null);
  if (id && id !== 'new') {
    if (saved.loading) return <LoadingBlock />;
    if (saved.error || !saved.data) return <Alert tone="error">{saved.error || 'Estimate not found'}</Alert>;
  }
  return <Editor key={saved.data?.id || 'new'} initial={saved.data} />;
}

function Editor({ initial }) {
  const router = useRouter();
  const company = useSession((s) => s.company);
  const currency = company?.currency || 'INR';
  const money = (v) => formatMoney(v, currency, { decimals: 2 });

  const clients = useResource('/api/clients?limit=500');
  const products = useResource('/api/products');
  const packages = useResource('/api/packages');
  const charges = useResource('/api/installation-charges');
  const categories = useResource('/api/categories');

  const [savedId, setSavedId] = useState(initial?.id || '');
  const [clientMode, setClientMode] = useState(initial && !initial.client?.clientId ? 'manual' : 'existing'); // existing | manual
  const [clientId, setClientId] = useState(initial?.client?.clientId || '');
  const [manual, setManual] = useState({ name: initial?.client?.clientId ? '' : initial?.client?.name || '', phone: initial?.client?.clientId ? '' : initial?.client?.phone || '', address: initial?.client?.clientId ? '' : initial?.client?.address || '' });
  const [date, setDate] = useState(initial?.date || today);
  const [withGst, setWithGst] = useState(initial ? initial.withGst !== false : true);
  const [lines, setLines] = useState(() => (initial?.lines || []).map((l) => newLine(l.kind, l)));
  const [notes, setNotes] = useState(initial?.notes || '');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const may = useCan();

  const clientList = useMemo(() => clients.data?.items || [], [clients.data]);
  const client = useMemo(() => {
    if (clientMode === 'manual') return manual;
    const c = clientList.find((x) => x.id === clientId);
    if (c) return { clientId: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address };
    return initial?.client?.clientId === clientId ? initial.client : { name: '' }; // a saved client the list has not loaded (yet)
  }, [clientMode, manual, clientList, clientId, initial]);

  const totals = useMemo(() => estimateTotals(lines, withGst), [lines, withGst]);
  const productName = useMemo(() => new Map((products.data || []).map((p) => [p.id, p.name])), [products.data]);

  const setLine = (key, patch) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const removeLine = (key) => setLines((l) => l.filter((x) => x.key !== key));
  /** Adds the catalog entry, or one more of it when it is already in the estimate. */
  const addEntry = (kind, refId, fields) => setLines((l) => (refId && l.some((x) => x.kind === kind && x.refId === refId) ? l.map((x) => (x.kind === kind && x.refId === refId ? { ...x, qty: (Number(x.qty) || 0) + 1 } : x)) : [...l, newLine(kind, { refId, ...fields })]));
  const stepEntry = (kind, refId, by) => setLines((l) => l.flatMap((x) => {
    if (x.kind !== kind || x.refId !== refId) return [x];
    const qty = (Number(x.qty) || 0) + by;
    return qty > 0 ? [{ ...x, qty }] : [];
  }));

  const fieldsFor = {
    packages: (p) => ({ name: p.name, detail: [p.kw ? `${p.kw} kW` : '', p.description, (p.items || []).length && `Includes: ${(p.items || []).map((i) => `${i.qty} × ${productName.get(String(i.productId?.id || i.productId)) || 'item'}`).join(', ')}`].filter(Boolean).join(' · '), unit: 'Set', rate: Number(p.price) || 0 }),
    products: (p) => ({ name: p.name, detail: [p.brand, p.model].filter(Boolean).join(' '), hsn: p.hsnCode || '', unit: p.unit || 'Nos', rate: Number(p.price) || 0, gstPercent: p.gstPercent ?? defaultTaxRate() }),
    services: (s) => ({ name: s.name, detail: s.description || '', hsn: s.sac || '', unit: 'Job', rate: Number(s.defaultPrice) || 0, gstPercent: s.gstPercent ?? defaultTaxRate() }),
  };

  const canDownload = Boolean(client.name?.trim()) && lines.length > 0;
  const save = async () => {
    setSaving(true);
    try {
      const body = { client, date, withGst, lines: lines.map(({ key, ...l }) => l), notes };
      const doc = savedId ? await api(`/api/estimates/${savedId}`, { method: 'PUT', body }) : await api('/api/estimates', { method: 'POST', body });
      toast.success('Estimate saved');
      if (!savedId) {
        setSavedId(doc.id);
        router.replace(`/dashboard/estimation/${doc.id}`);
      }
      setSaving(false);
      return true;
    } catch (e) {
      toast.error(e.message || 'Could not save the estimate');
    }
    setSaving(false);
    return false;
  };
  /** The proposal is made from the saved estimate, so what is on screen is saved first. */
  const convert = async () => {
    if (await save()) setConverting(true);
  };
  const download = async () => {
    setBusy(true);
    try {
      const { downloadEstimatePdf } = await import('@/lib/estimationPdf'); // jsPDF only loads when needed
      await downloadEstimatePdf({ estimate: { client, date, withGst, lines, notes }, company, currency });
    } catch (e) {
      console.error(e);
      toast.error('Sorry, the PDF could not be created. Please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <Link href="/dashboard/estimation" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />All estimates</Link>
      <PageHeader title={savedId ? 'Edit estimate' : 'New estimate'} description="Pick packages, products and services, type your own, then save it or download it as a PDF.">
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant="secondary" icon={Download} loading={busy} disabled={!canDownload} onClick={download}>Download PDF</Button>
          {savedId && may('proposals', 'create') && <Button variant="secondary" icon={FileOutput} disabled={!canDownload || saving} onClick={convert}>Convert to proposal</Button>}
          <Button variant="primary" icon={Save} loading={saving} disabled={!canDownload} onClick={save}>{savedId ? 'Save changes' : 'Save estimate'}</Button>
        </div>
      </PageHeader>

      {converting && <ConvertEstimateDialog estimate={{ id: savedId, client, design: initial?.design }} onClose={() => setConverting(false)} />}

      <Card>
        <CardHeader title="Client" description="Choose an existing client or type the details." />
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
              {[['existing', 'Existing client'], ['manual', 'Enter manually']].map(([id, name]) => (
                <button key={id} type="button" onClick={() => setClientMode(id)} className={cx('rounded-md px-3 py-1.5', clientMode === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>{name}</button>
              ))}
            </div>
          </div>
          {clientMode === 'existing' ? (
            <FormField label="Client" hint={clients.error || (clients.loading ? 'Loading clients…' : !clientList.length ? 'No clients yet — enter the details manually.' : '')}>
              <Select value={clientId} onValue={setClientId}>
                <option value="">Select a client…</option>
                {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
              </Select>
            </FormField>
          ) : (
            <>
              <FormField label="Name"><Input maxLength={120} value={manual.name} onValue={(v) => setManual((m) => ({ ...m, name: v }))} /></FormField>
              <FormField label="Phone" optional><Input maxLength={40} value={manual.phone} onValue={(v) => setManual((m) => ({ ...m, phone: v }))} /></FormField>
              <FormField label="Address" optional className="sm:col-span-2"><Input maxLength={400} value={manual.address} onValue={(v) => setManual((m) => ({ ...m, address: v }))} /></FormField>
            </>
          )}
          <FormField label="Date"><Input type="date" value={date} onValue={setDate} /></FormField>
        </div>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Catalog categories={categories.data} sources={{ packages, products, services: charges }} fieldsFor={fieldsFor} lines={lines} onAdd={addEntry} onStep={stepEntry} />

        <Card>
          <CardHeader
            title={`Estimate${lines.length ? ` · ${lines.length} item${lines.length === 1 ? '' : 's'}` : ''}`}
            action={<Button variant="secondary" size="sm" icon={Plus} onClick={() => setLines((l) => [...l, newLine('custom')])}>Custom line</Button>}
          />
          <div className="space-y-4 p-4 sm:p-6">
            <Toggle checked={withGst} onChange={setWithGst} label={`Add ${taxName()}`} description={withGst ? `Each line has its own ${taxName()} rate that you can change. Prices are before ${taxName()}.` : 'Shown without GST.'} />

            {!lines.length ? (
              <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center">
                <PackageOpen className="h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-700">Nothing added yet</p>
                <p className="mt-0.5 text-xs text-slate-500">Tap <span className="font-semibold">Add</span> next to a package, product or service.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className={cx('hidden gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase md:grid', withGst ? 'md:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_4.5rem_6.5rem_2rem]' : 'md:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem_2rem]')}>
                  <span>Item</span><span className="text-right">Qty</span><span className="text-right">Rate</span>
                  {withGst && <span className="text-right">{taxName()} %</span>}
                  <span className="text-right">Amount</span><span />
                </div>
                <ul className="divide-y divide-slate-100">
                  {lines.map((l) => {
                    const row = totals.rows.find((r) => r.key === l.key);
                    return (
                      <li key={l.key} className={cx('grid gap-2 px-3 py-3 md:items-start', withGst ? 'md:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_4.5rem_6.5rem_2rem]' : 'md:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem_2rem]')}>
                        <div className="min-w-0 space-y-1">
                          <input aria-label="Item name" placeholder="Item name" maxLength={140} value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} className={cx(cell, 'font-medium')} />
                          <input aria-label="Details" placeholder="Details (optional)" maxLength={400} value={l.detail} onChange={(e) => setLine(l.key, { detail: e.target.value })} className="h-7 w-full rounded border border-transparent bg-transparent px-2 text-xs text-slate-500 outline-none hover:border-slate-200 focus:border-brand focus:bg-white" />
                        </div>
                        <div className="grid grid-cols-3 gap-2 md:contents">
                          <Field label={`Qty${l.unit ? ` (${l.unit})` : ''}`}><NumField min={0} step="any" value={l.qty} onValue={(v) => setLine(l.key, { qty: v })} className={cx(cell, 'text-right')} /></Field>
                          <Field label="Rate"><NumField min={0} step="any" value={l.rate} onValue={(v) => setLine(l.key, { rate: v })} className={cx(cell, 'text-right')} /></Field>
                          {withGst && <Field label={`${taxName()} %`}><NumField min={0} max={100} step="any" value={l.gstPercent} onValue={(v) => setLine(l.key, { gstPercent: v })} className={cx(cell, 'text-right')} /></Field>}
                        </div>
                        <div className="flex items-center justify-between md:contents">
                          <span className="text-xs font-medium text-slate-500 md:hidden">Amount</span>
                          <span className="text-sm font-semibold text-slate-900 tabular-nums md:flex md:h-9 md:items-center md:justify-end">{money(withGst ? row?.total : row?.amount)}</span>
                          <button type="button" aria-label={`Remove ${l.name || 'item'}`} onClick={() => removeLine(l.key)} className="grid h-9 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{money(totals.subtotal)}</dd></div>
              {withGst && totals.gstGroups.map((g) => (
                <div key={g.rate} className="flex justify-between"><dt className="text-slate-500">{taxName()} @ {g.rate}%</dt><dd className="tabular-nums">{money(g.gst)}</dd></div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900"><dt>Total</dt><dd className="tabular-nums">{money(totals.total)}</dd></div>
            </dl>

            <FormField label="Notes" optional hint="Printed on the PDF."><Textarea rows={3} maxLength={1000} value={notes} onValue={setNotes} placeholder="e.g. Validity, payment terms, what is not included" /></FormField>
            {!canDownload && <p className="text-xs text-slate-500">Choose a client and add at least one item to save or download.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block text-[10px] font-medium text-slate-500 md:hidden">{label}</span>
      {children}
    </label>
  );
}

/** A service that is not in the catalog: type its name and price and add it. */
function ManualService({ onAdd }) {
  const [name, setName] = useState('');
  const [rate, setRate] = useState(0);
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), rate);
    setName('');
    setRate(0);
  };
  return (
    <form onSubmit={submit} className="rounded-xl border border-dashed border-slate-300 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-600">Write your own service</div>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Service name" placeholder="e.g. Roof cleaning" maxLength={140} value={name} onValue={setName} className="h-9 min-w-[9rem] flex-1" />
        <NumField aria-label="Service price" min={0} step="any" placeholder="Price" value={rate} onValue={setRate} className={cx(cell, 'w-28 text-right')} />
        <Button type="submit" variant="secondary" size="sm" icon={Plus} disabled={!name.trim()}>Add</Button>
      </div>
    </form>
  );
}

/** The catalog: tabs, search, and a row per entry with Add — or a quantity stepper once it is in the estimate. */
const categoryOf = (p) => String(p.category?.id || p.category || '');

function Catalog({ sources, categories, fieldsFor, lines, onAdd, onStep }) {
  const [tab, setTab] = useState('packages');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(''); // products only: '' = all categories
  // categories that have products, with how many
  const catChips = useMemo(() => {
    const counts = new Map();
    for (const p of Array.isArray(sources.products.data) ? sources.products.data : []) counts.set(categoryOf(p), (counts.get(categoryOf(p)) || 0) + 1);
    return (Array.isArray(categories) ? categories : []).filter((c) => counts.has(c.id)).map((c) => ({ id: c.id, name: c.name, n: counts.get(c.id) }));
  }, [sources.products.data, categories]);
  const source = sources[tab];
  const kind = KIND[tab];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (Array.isArray(source.data) ? source.data : []).filter((r) => (tab !== 'products' || !cat || categoryOf(r) === cat) && (!needle || [r.name, r.brand, r.model, r.hsnCode].filter(Boolean).join(' ').toLowerCase().includes(needle)));
  }, [source.data, q, tab, cat]);
  const qtyOf = (id) => Number(lines.find((l) => l.kind === kind && l.refId === id)?.qty) || 0;
  const countIn = (t) => lines.filter((l) => l.kind === KIND[t]).length;

  return (
    <Card className="xl:sticky xl:top-4">
      <CardHeader title="Catalog" description="Tap Add to put it in the estimate." />
      <div className="space-y-3 p-4 sm:p-6">
        <div role="tablist" className="grid grid-cols-3 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)} className={cx('flex items-center justify-center gap-1.5 rounded-md py-1.5', tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              {t.label}
              {countIn(t.id) > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] leading-4 font-semibold text-brand-fg">{countIn(t.id)}</span>}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input aria-label={`Search ${tab}`} placeholder={`Search ${tab}…`} value={q} onValue={setQ} className="pl-9" />
        </div>
        {tab === 'products' && catChips.length > 0 && (
          <div role="group" aria-label="Filter by category" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {[{ id: '', name: 'All', n: (sources.products.data || []).length }, ...catChips].map((c) => (
              <button key={c.id || 'all'} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={cx('shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', cat === c.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
                {c.name} <span className={cat === c.id ? 'text-white/70' : 'text-slate-400'}>{c.n}</span>
              </button>
            ))}
          </div>
        )}
        {tab === 'services' && <ManualService onAdd={(name, rate) => onAdd('service', '', { name, unit: 'Job', rate, gstPercent: defaultTaxRate() })} />}
        <div className="max-h-[32rem] overflow-y-auto rounded-xl ring-1 ring-slate-200">
          {source.loading ? <p className="p-5 text-sm text-slate-500">Loading…</p> : source.error ? <p className="p-5 text-sm text-red-600">{source.error}</p> : !rows.length ? (
            <p className="p-5 text-sm text-slate-500">{q || cat ? 'Nothing matches your search or category.' : `No ${tab} yet.`}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const qty = qtyOf(r.id);
                const price = tab === 'services' ? r.defaultPrice : r.price;
                const sub = tab === 'packages' ? [r.kw ? `${r.kw} kW` : '', r.description].filter(Boolean).join(' · ') : tab === 'products' ? [r.brand, r.model].filter(Boolean).join(' ') : r.description;
                return (
                  <li key={r.id} className={cx('flex items-center gap-3 px-3 py-2.5', qty > 0 && 'bg-brand-muted/30')}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{r.name}</div>
                      <div className="truncate text-xs text-slate-500"><span className="tabular-nums">{formatMoney(price || 0, 'INR')}</span>{sub ? ` · ${sub}` : ''}</div>
                    </div>
                    {qty > 0 ? (
                      <div className="flex shrink-0 items-center rounded-lg bg-white ring-1 ring-slate-300">
                        <button type="button" aria-label={`Remove one ${r.name}`} onClick={() => onStep(kind, r.id, -1)} className="grid h-8 w-8 place-items-center text-slate-600 hover:text-red-600"><Minus className="h-4 w-4" /></button>
                        <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                        <button type="button" aria-label={`Add one more ${r.name}`} onClick={() => onStep(kind, r.id, 1)} className="grid h-8 w-8 place-items-center text-slate-600 hover:text-brand"><Plus className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <Button variant="secondary" size="sm" icon={Plus} onClick={() => onAdd(kind, r.id, fieldsFor[tab](r))}>Add</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
