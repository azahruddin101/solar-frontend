'use client';

// Parts replaced on an AMC visit (a fuse, a length of cable, an MCB…): picked from stock and invoiced to the client
// as one invoice on the proposal. The server takes the stock and prices each line from its batch; the browser then
// builds the PDF the way Billing does and archives it on the invoice.
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { buildInvoicePdfBlob } from '@/lib/invoicePdf';
import { roundMoney } from '@/lib/pricing';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Button, FormModal, IconButton, Input, Select, Toggle, cx, showError, toast } from '../kit';

const PRICE_TYPES = [{ id: 'retail', label: 'Retail' }, { id: 'wholesale', label: 'Wholesale' }, { id: 'base', label: 'Base' }];
const PRICE_FIELD = { base: 'basePrice', wholesale: 'wholesalePrice', retail: 'retailPrice' };
let seq = 0;
const blankLine = () => ({ key: `l${++seq}`, productId: '', qty: 1, priceType: 'retail', serials: [] });

/** What a line will cost from its product's in-stock batches, oldest first — the same order the server takes them. */
function preview(line, entry) {
  const batches = entry?.batches || [];
  const field = PRICE_FIELD[line.priceType] || 'retailPrice';
  const available = batches.reduce((a, b) => a + (Number(b.qtyRemaining) || 0), 0);
  let qty = 0;
  let amount = 0;
  if (line.serials.length) {
    for (const u of entry?.units || []) {
      if (!line.serials.includes(u.serialNo)) continue;
      const b = batches.find((x) => x.id === u.batch?.id);
      qty += 1;
      amount += Number(b?.[field]) || 0;
    }
  } else {
    let left = Number(line.qty) || 0;
    for (const b of batches) {
      if (left <= 0) break;
      const take = Math.min(left, Number(b.qtyRemaining) || 0);
      qty += take;
      amount += take * (Number(b[field]) || 0);
      left -= take;
    }
  }
  return { available, qty, amount: roundMoney(amount) };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** `base`: `/api/projects` or `/api/my/projects`. `onDone` is called with the created invoice after the PDF is archived. */
export default function AmcPartsInvoiceModal({ visit, base, currency = 'INR', onClose, onDone }) {
  const company = useSession((s) => s.company);
  const { data: products, error: productsError } = useResource('/api/products');
  const [lines, setLines] = useState(() => [blankLine()]);
  const [stock, setStock] = useState({}); // productId → { batches, units }
  const [withGst, setWithGst] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const money = (v) => formatMoney(v, currency, { decimals: 2 });
  const productOf = (id) => (products || []).find((p) => p.id === id);

  const setLine = (key, patch) => setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const loadStock = async (product) => {
    if (stock[product.id]) return;
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

  const choose = (key, id) => {
    const p = productOf(id);
    setLine(key, { productId: id, serials: [], qty: p?.isSerialized ? 0 : 1 });
    if (p) loadStock(p);
  };
  const toggleSerial = (key, serialNo) => setLines((rows) => rows.map((r) => {
    if (r.key !== key) return r;
    const serials = r.serials.includes(serialNo) ? r.serials.filter((s) => s !== serialNo) : [...r.serials, serialNo];
    return { ...r, serials, qty: serials.length };
  }));

  const rows = lines.map((l) => ({ ...l, product: productOf(l.productId), ...(l.productId ? preview(l, stock[l.productId]) : { available: 0, qty: 0, amount: 0 }) }));
  const subtotal = roundMoney(rows.reduce((a, r) => a + r.amount, 0));
  const complete = rows.filter((r) => r.productId && r.qty > 0);
  const short = rows.find((r) => r.productId && stock[r.productId] && !r.serials.length && Number(r.qty) > r.available);

  const submit = async () => {
    if (!complete.length) return setError('Add at least one part with a quantity');
    if (short) return setError(`Only ${short.available} ${short.product?.unit || ''} of ${short.product?.name} in stock`);
    setBusy(true);
    setError('');
    try {
      const body = { lines: complete.map((r) => ({ productId: r.productId, qty: r.serials.length ? undefined : Number(r.qty), serials: r.serials.length ? r.serials : undefined, priceType: r.priceType })), withGst, note };
      const res = await api(`${base}/${visit.projectId}/amc/${visit.id}/invoice`, { method: 'POST', body });
      const { blob, filename } = await buildInvoicePdfBlob({ invoice: res.invoice, company, client: res.client, currency });
      const form = new FormData();
      form.append('file', blob, filename);
      await api(`${base}/${visit.projectId}/amc/${visit.id}/invoice/pdf`, { method: 'POST', form });
      toast.success(`Invoice ${res.invoice.invoiceNo} generated`);
      downloadBlob(blob, filename);
      onDone(res);
    } catch (e) {
      showError(e, e?.status === 409 ? 'Stock not available' : 'The invoice was not generated');
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} size="2xl" title={`Invoice parts — ${visit.name}`} description={`Parts replaced at ${visit.client?.name || 'the client'}’s site, taken from stock and billed on the proposal.`} submitLabel="Generate invoice" busy={busy} error={error} onSubmit={submit}>
      {productsError && <Alert className="mb-4">{productsError}</Alert>}
      <div className="space-y-3">
        {rows.map((r) => {
          const entry = stock[r.productId];
          return (
            <div key={r.key} className="rounded-xl border border-slate-200 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_90px_130px_auto]">
                <Select aria-label="Part" value={r.productId} onValue={(id) => choose(r.key, id)}>
                  <option value="">Choose a product…</option>
                  {(products || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.brand ? ` · ${p.brand}` : ''}</option>)}
                </Select>
                <Input aria-label="Quantity" type="number" min={0} step="any" value={r.qty} disabled={Boolean(r.product?.isSerialized)} onValue={(v) => setLine(r.key, { qty: v })} placeholder="Qty" />
                <Select aria-label="Price" value={r.priceType} onValue={(v) => setLine(r.key, { priceType: v })}>
                  {PRICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} price</option>)}
                </Select>
                <IconButton icon={Trash2} label="Remove part" tone="danger" disabled={lines.length === 1} onClick={() => setLines((rows2) => rows2.filter((x) => x.key !== r.key))} />
              </div>
              {r.product && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {entry?.error ? <span className="text-red-600">{entry.error}</span> : !entry ? 'Checking stock…' : r.product.isSerialized ? `${entry.units.length} unit${entry.units.length === 1 ? '' : 's'} in stock — pick the serial numbers used` : `${r.available} ${r.product.unit || ''} in stock`}
                  </span>
                  <span className="font-medium text-slate-800 tabular-nums">{r.qty > 0 ? money(r.amount) : '—'}</span>
                </div>
              )}
              {r.product?.isSerialized && entry?.units?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.units.map((u) => {
                    const on = r.serials.includes(u.serialNo);
                    return <button key={u.id} type="button" aria-pressed={on} onClick={() => toggleSerial(r.key, u.serialNo)} className={cx('rounded-md border px-2 py-1 font-mono text-[11px]', on ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>{u.serialNo}</button>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Button size="sm" icon={Plus} className="mt-3" disabled={lines.length >= 50} onClick={() => setLines((rows2) => [...rows2, blankLine()])}>Add another part</Button>

      <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
        <Toggle checked={withGst} onChange={setWithGst} label="GST invoice" description="GST is added at each product’s rate. Switch off for a plain invoice." />
        <Input maxLength={300} value={note} onValue={setNote} placeholder="Note for the activity log (optional)" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Parts total{withGst ? ' before GST' : ''}</span>
          <span className="text-lg font-semibold text-slate-900 tabular-nums">{money(subtotal)}</span>
        </div>
        <p className="text-xs text-slate-500">Prices are taken from the batches in stock, oldest first; the invoice shows one line per batch at that batch’s price.</p>
      </div>
    </FormModal>
  );
}
