'use client';

// Opened from an invoice line: pick the product from stock and, for a serialized one, tick the serial numbers sold.
// Nothing changes on the line until "Use selection". Rendered next to (not inside) the invoice form, so Enter and
// Esc here don't submit or close the invoice behind it.
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select } from '../kit';

const PRICE_TYPES = [{ id: 'retail', label: 'Retail' }, { id: 'wholesale', label: 'Wholesale' }, { id: 'base', label: 'Base' }];
const PRICE_FIELD = { base: 'basePrice', wholesale: 'wholesalePrice', retail: 'retailPrice' };
const shortDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The in-stock serialized product a line most likely means (same name, or one contains the other), or undefined. */
export function guessSerializedProduct(line, serialProducts) {
  const name = norm(line.name);
  const hay = norm(`${line.name} ${line.detail}`);
  if (!name) return undefined;
  return serialProducts.find((p) => {
    if (!(p.stock > 0)) return false;
    const pn = norm(p.name);
    return pn && (name.includes(pn) || pn.includes(name) || (p.model && hay.includes(norm(p.model)) && hay.includes(norm(p.brand))));
  });
}

const guessProduct = (line, products) => line.productId || guessSerializedProduct(line, products)?.id || '';

/**
 * `line` is the invoice line being edited; `wantQty` the quantity it already has (so "Select first N" can fill it).
 * `onApply({ productId, priceType, batch, serials })` is called with the choice.
 */
export default function StockPickModal({ line, wantQty, products, stock, loadStock, money, onApply, onClose }) {
  const [productId, setProductId] = useState(() => guessProduct(line, products));
  const [priceType, setPriceType] = useState(line.priceType || 'retail');
  const [batch, setBatch] = useState(line.batch || '');
  const [serials, setSerials] = useState(() => (line.productId ? line.serials || [] : []));
  const [query, setQuery] = useState('');
  const product = products.find((p) => p.id === productId);
  const entry = productId ? stock[productId] : null;
  const units = useMemo(() => entry?.units || [], [entry]);
  const field = PRICE_FIELD[priceType] || 'retailPrice';

  useEffect(() => {
    if (product) loadStock(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Esc closes only this dialog (capture phase beats the invoice dialog's own listener)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const choose = (id) => {
    setProductId(id);
    setSerials([]);
    setBatch('');
    setQuery('');
  };

  const q = query.trim().toLowerCase();
  const shown = q ? units.filter((u) => u.serialNo.toLowerCase().includes(q) || (u.batch?.batchNo || '').toLowerCase().includes(q)) : units;
  const limit = Number(wantQty) > 0 ? Number(wantQty) : Infinity; // the quantity written on the invoice line
  const full = serials.length >= limit;
  const toggle = (no) => setSerials((s) => (s.includes(no) ? s.filter((x) => x !== no) : s.length >= limit ? s : [...s, no]));
  const priceOf = (u) => Number(entry?.batches?.find((b) => b.id === u.batch?.id)?.[field]) || 0;
  const total = serials.reduce((a, no) => a + priceOf(units.find((u) => u.serialNo === no) || {}), 0);
  const first = Number.isFinite(limit) ? Math.min(limit - serials.length, shown.filter((u) => !serials.includes(u.serialNo)).length) : 0;
  const serialized = Boolean(product?.isSerialized);
  const ready = product && (serialized ? (Number.isFinite(limit) ? serials.length === limit : serials.length > 0) : true);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Pick from stock"
      description="Choose the product, then tick the serial numbers being sold on this invoice line. Only products tracked by serial number are listed."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ready} onClick={() => onApply({ productId, priceType, batch: serialized ? '' : batch, serials: serialized ? serials : [] })}>
            {serialized ? `Use ${serials.length} serial number${serials.length === 1 ? '' : 's'}` : 'Use selection'}
          </Button>
        </>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
        <Select aria-label="Product" value={productId} onValue={choose}>
          <option value="">— Choose a product —</option>
          {products.map((p) => <option key={p.id} value={p.id} disabled={!(p.stock > 0) && p.id !== productId}>{p.name} · {p.stock ?? 0} {p.unit} in stock</option>)}
        </Select>
        <Select aria-label="Price type" value={priceType} onValue={setPriceType}>
          {PRICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} price</option>)}
        </Select>
      </div>

      {product && !entry && <p className="mt-4 text-sm text-slate-500">Loading stock…</p>}
      {entry?.error && <p className="mt-4 text-sm text-red-600">{entry.error}</p>}

      {serialized && entry && !entry.error && (
        <div className="mt-4">
          {units.length === 0 ? (
            <p className="text-sm text-amber-700">No units of this product in stock.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input aria-label="Search serial numbers" value={query} onValue={setQuery} placeholder="Search serial or batch number" className="pl-9" />
                </div>
                {first > 0 && <Button size="sm" onClick={() => setSerials((s) => [...s, ...shown.filter((u) => !s.includes(u.serialNo)).slice(0, first).map((u) => u.serialNo)])}>Select {serials.length ? 'next' : 'first'} {first}</Button>}
                <Button size="sm" variant="ghost" disabled={!serials.length} onClick={() => setSerials([])}>Clear</Button>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span><b className="text-slate-800">{serials.length}</b> of {units.length} in stock selected{Number.isFinite(limit) ? ` · select exactly ${limit} (the quantity on the invoice line)` : ''}</span>
                {serials.length > 0 && <span className="font-medium tabular-nums text-slate-800">{money(total)}</span>}
              </div>
              <div className="max-h-[46dvh] overflow-y-auto rounded-xl border border-slate-200">
                {shown.length === 0 ? (
                  <p className="p-4 text-center text-sm text-slate-500">No serial number matches “{query}”.</p>
                ) : shown.map((u) => (
                  <label key={u.id} className={`flex ${full && !serials.includes(u.serialNo) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50`}>
                    <input type="checkbox" disabled={full && !serials.includes(u.serialNo)} checked={serials.includes(u.serialNo)} onChange={() => toggle(u.serialNo)} className="h-4 w-4 accent-[var(--color-brand,#0F6E56)]" />
                    <span className="font-mono text-[13px] text-slate-900">{u.serialNo}</span>
                    <span className="ml-auto text-xs text-slate-500">{u.batch?.batchNo ? `Batch ${u.batch.batchNo}` : 'No batch no.'}</span>
                    <span className="w-24 text-right text-xs tabular-nums text-slate-700">{money(priceOf(u))}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {product && !serialized && entry && !entry.error && (
        <div className="mt-4">
          <Select aria-label="Batch" value={batch} onValue={setBatch}>
            <option value="">Oldest first (FIFO)</option>
            {(entry.batches || []).map((b) => <option key={b.id} value={b.id}>{b.batchNo || 'No batch no.'} · {shortDate(b.receivedDate)} · {b.qtyRemaining} left · {money(b[field])}</option>)}
          </Select>
          <p className="mt-2 text-xs text-slate-500">This product has no serial numbers; the quantity on the invoice line is taken from the batch you choose.</p>
        </div>
      )}
    </Modal>
  );
}
