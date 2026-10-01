'use client';

// Installation charges on a proposal: pick from the company catalog or type a custom name and price.
// value = [{ chargeId?, name, price }]; the name is copied so the proposal survives a later rename or delete.
import { Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useResource } from '@/lib/useResource';
import { Input, NumField } from '../kit';

export const chargesTotal = (list) => (Array.isArray(list) ? list : []).reduce((a, c) => a + (Number(c.price) || 0), 0);

const DEFAULT_GST = 18;

const emptyRow = () => ({ chargeId: '', name: '', price: 0, gstPercent: DEFAULT_GST });

const withDefaultGst = (row) => ({
  ...row,
  gstPercent: row.gstPercent != null && row.gstPercent !== '' ? row.gstPercent : DEFAULT_GST,
});

export default function ChargePicker({ value = [], onChange, currency = '₹' }) {
  const { data: options, loading, error } = useResource('/api/installation-charges');
  const catalog = Array.isArray(options) ? options : [];
  const rows = (Array.isArray(value) ? value : []).map(withDefaultGst);
  const setRow = (i, patch) => onChange(rows.map((r, j) => (j === i ? withDefaultGst({ ...r, ...patch }) : r)));
  const pick = (i, id) => {
    const o = catalog.find((x) => x.id === id);
    if (!o) return setRow(i, { chargeId: '', name: rows[i]?.name || '' });
    setRow(i, {
      chargeId: o.id,
      name: o.name,
      price: rows[i]?.price != null && rows[i].price !== '' ? rows[i].price : o.defaultPrice || 0,
      gstPercent: o.gstPercent != null && o.gstPercent !== '' ? o.gstPercent : DEFAULT_GST,
    });
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Installation charges</span>
          <p className="text-[10px] text-slate-400">Ex-GST price; {DEFAULT_GST}% GST applied by default</p>
        </div>
        <button type="button" onClick={() => onChange([...rows, emptyRow()])} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:underline"><Plus className="h-3.5 w-3.5" />Add</button>
      </div>
      {error && <p className="mb-2 text-[11px] text-red-600">Could not load charge list: {error}</p>}
      {!rows.length && (
        <p className="text-[11px] text-slate-500">
          None added. {loading ? 'Loading catalog…' : catalog.length ? 'Click Add, then type a name or choose from the catalog.' : <>Create reusable charges in <Link href="/dashboard/masters?tab=installation-charges" className="font-medium text-brand hover:underline">Manage Masters → Installation charges</Link>, or type a custom name below.</>}
        </p>
      )}
      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 bg-slate-50/50 p-2">
            {catalog.length > 0 && (
              <select aria-label="Pick from catalog" value={r.chargeId || ''} onChange={(e) => pick(i, e.target.value)} className="h-9 min-w-[8rem] flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs">
                <option value="">From catalog…</option>
                {catalog.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            <Input aria-label="Charge name" maxLength={80} placeholder="e.g. Inverter installation" value={r.name || ''} onValue={(v) => setRow(i, { name: v })} className="h-9 min-w-[10rem] flex-[2] text-xs" />
            <NumField aria-label={`Price (${currency})`} min={0} step="any" placeholder="Price" value={r.price} onValue={(v) => setRow(i, { price: v })} className="h-9 w-28 rounded-md border border-slate-300 bg-white px-2 text-right text-xs" />
            <button type="button" aria-label="Remove charge" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="grid h-9 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
