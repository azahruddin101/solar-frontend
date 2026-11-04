'use client';

// Partial return on an open product bill: chosen products go back to stock; the bill is superseded and a new open bill
// is created with what remains. `onSubmit(body)` posts to /api/billing/eway-bills/:id/revise.
import { useMemo, useState } from 'react';
import { useResource } from '@/lib/useResource';
import { Alert, FormField, FormModal, Input, LoadingBlock } from '../kit';

export default function PartialReturnEwayModal({ open, onClose, ewayBill, busy, onSubmit }) {
  const { data, loading, error: loadError } = useResource(open ? `/api/billing/eway-bills/${ewayBill.id}/returnable` : null);
  const [qty, setQty] = useState({});
  const [picked, setPicked] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const lines = useMemo(() => (data?.lines || []).filter((l) => l.qtyLeft > 0), [data]);
  const chosen = useMemo(() => lines.map((l) => {
    const serialized = l.serials.length > 0;
    const count = serialized ? (picked[l.line] || []).length : Number(qty[l.line]) || 0;
    return { l, serialized, count };
  }).filter((c) => c.count > 0), [lines, qty, picked]);

  const toggle = (line, serial) => setPicked((p) => {
    const have = new Set(p[line] || []);
    if (have.has(serial)) have.delete(serial); else have.add(serial);
    return { ...p, [line]: [...have] };
  });

  const submit = () => {
    if (!chosen.length) return setError('Choose at least one product to return to stock');
    for (const c of chosen) if (!c.serialized && c.count > c.l.qtyLeft) return setError(`Only ${c.l.qtyLeft} ${c.l.unit} of ${c.l.name} can be returned`);
    if (!reason.trim()) return setError('Say why the products came back');
    setError('');
    onSubmit({
      lines: chosen.map((c) => (c.serialized ? { line: c.l.line, serials: picked[c.l.line] } : { line: c.l.line, qty: c.count })),
      reason: reason.trim(),
    });
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Return products · ${ewayBill.ewayNo}`}
      description="Returned items are added back to inventory. This bill is kept for reference (grayed out) and a new bill is created with the remaining products."
      submitLabel="Return & create new bill"
      busy={busy}
      error={error || loadError}
      onSubmit={submit}
      size="lg"
      noValidate
    >
      {loading ? <LoadingBlock /> : !lines.length ? (
        <Alert tone="warn">This bill has no products left to return, or it is no longer open.</Alert>
      ) : (
        <section className="space-y-3">
          <div className="text-sm font-medium text-slate-800">Products returning to stock</div>
          {lines.map((l) => (
            <div key={l.line} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-900">{l.name}</div>
                  <div className="text-xs text-slate-500">{[l.batchNo && `Batch ${l.batchNo}`, `${l.qtyLeft} ${l.unit} on this bill`].filter(Boolean).join(' · ')}</div>
                </div>
                {l.serials.length === 0 && (
                  <div className="w-36">
                    <Input type="number" min={0} max={l.qtyLeft} step="any" aria-label={`Quantity of ${l.name} returned`} value={qty[l.line] ?? ''} onValue={(v) => setQty((q) => ({ ...q, [l.line]: v }))} placeholder={`up to ${l.qtyLeft}`} />
                  </div>
                )}
              </div>
              {l.serials.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {l.serials.map((s) => {
                    const on = (picked[l.line] || []).includes(s);
                    return (
                      <label key={s} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-mono ${on ? 'border-slate-800 bg-slate-100 text-slate-900' : 'border-slate-300 bg-white text-slate-700'}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(l.line, s)} className="h-3.5 w-3.5 rounded border-slate-300" />
                        {s}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <FormField label="Reason">
            <Input maxLength={300} value={reason} onValue={setReason} placeholder="e.g. Wrong item dispatched, damaged in transit" />
          </FormField>
        </section>
      )}
    </FormModal>
  );
}
