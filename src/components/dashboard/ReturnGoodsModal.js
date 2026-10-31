'use client';

// Some of the goods on a paid bill came back: pick the products (how many, or which serial numbers), say why, and record
// the refund. The server prices the returned goods from the bill (with their share of GST and discount), puts them back
// into stock, takes the refund off the bill's payment and numbers a credit note. `onSubmit(body)` posts it.
import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdfShared';
import { useResource } from '@/lib/useResource';
import { Alert, FormField, FormModal, Input, LoadingBlock, Select } from '../kit';

const today = () => new Date().toISOString().slice(0, 10);

export default function ReturnGoodsModal({ open, onClose, bill, currency = 'INR', busy, onSubmit }) {
  const { data, loading, error: loadError } = useResource(open ? `/api/billing/bills/${bill.id}/returnable` : null);
  const [qty, setQty] = useState({}); // bill line → quantity typed
  const [picked, setPicked] = useState({}); // bill line → serial numbers ticked
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState({ mode: bill.paid?.mode || 'upi', reference: '', refundedOn: today(), note: '' });
  const [error, setError] = useState('');
  const money = (v) => formatMoney(v, currency);

  const lines = useMemo(() => (data?.lines || []).filter((l) => l.qtyLeft > 0), [data]);
  const chosen = useMemo(() => lines.map((l) => {
    const serialized = l.serials.length > 0;
    const count = serialized ? (picked[l.line] || []).length : Number(qty[l.line]) || 0;
    return { l, serialized, count };
  }).filter((c) => c.count > 0), [lines, qty, picked]);
  // an estimate: the line as billed (GST and discount included) spread over its quantity; the server works out the exact amount
  const estimate = chosen.reduce((a, c) => a + (Number(c.l.lineTotal) || 0) * (c.count / (Number(c.l.qty) || 1)), 0);

  const toggle = (line, serial) => setPicked((p) => {
    const have = new Set(p[line] || []);
    if (have.has(serial)) have.delete(serial); else have.add(serial);
    return { ...p, [line]: [...have] };
  });

  const submit = () => {
    if (!chosen.length) return setError('Choose at least one product that came back');
    for (const c of chosen) if (!c.serialized && c.count > c.l.qtyLeft) return setError(`Only ${c.l.qtyLeft} ${c.l.unit} of ${c.l.name} can still be returned`);
    if (!reason.trim()) return setError('Say why the goods came back');
    setError('');
    onSubmit({
      lines: chosen.map((c) => (c.serialized ? { line: c.l.line, serials: picked[c.l.line] } : { line: c.l.line, qty: c.count })),
      reason: reason.trim(),
      refund: { ...refund, reference: refund.reference.trim(), note: refund.note.trim() },
    });
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Return goods · ${bill.billNo}`}
      description="Only the products that came back. They go into stock, a credit note is made, and the refund comes off what was paid on this bill. The bill and its invoice stay as they are."
      submitLabel={`Make credit note${estimate > 0 ? ` · about ${money(estimate)}` : ''}`}
      busy={busy}
      error={error || loadError}
      onSubmit={submit}
      size="lg"
      noValidate
    >
      {loading ? <LoadingBlock /> : !lines.length ? (
        <Alert tone="warn">Nothing on this bill can be returned: it has no goods, or all of its goods have already been returned.</Alert>
      ) : (
        <>
          <section className="space-y-2">
            <div className="text-sm font-semibold text-slate-900">What came back</div>
            {lines.map((l) => (
              <div key={l.line} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">{l.name}</div>
                    <div className="text-xs text-slate-500">{[l.ewayNo, l.batchNo && `Batch ${l.batchNo}`, `${l.qty} ${l.unit} on the bill`, `${money(l.lineTotal)} with GST`].filter(Boolean).join(' · ')}</div>
                  </div>
                  {l.serials.length === 0 && (
                    <div className="w-36">
                      <Input type="number" min={0} max={l.qtyLeft} step="any" aria-label={`Quantity of ${l.name} returned`} value={qty[l.line] ?? ''} onValue={(v) => setQty((q) => ({ ...q, [l.line]: v }))} placeholder={`up to ${l.qtyLeft} ${l.unit}`} />
                    </div>
                  )}
                </div>
                {l.serials.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {l.serials.map((s) => {
                      const left = l.serialsLeft.includes(s);
                      const on = (picked[l.line] || []).includes(s);
                      return (
                        <label key={s} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono ${left ? (on ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-300 bg-white text-slate-700') : 'border-slate-200 bg-slate-50 text-slate-400 line-through'}`}>
                          <input type="checkbox" disabled={!left} checked={on} onChange={() => toggle(l.line, s)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand" />
                          {s}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="mb-3 text-sm font-semibold text-amber-900">Refund paid back</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Paid back by"><Select value={refund.mode} onValue={(v) => setRefund((r) => ({ ...r, mode: v }))}>{Object.entries(PAYMENT_MODE_LABEL).map(([k, lab]) => <option key={k} value={k}>{lab}</option>)}</Select></FormField>
              <FormField label={refund.mode === 'cheque' ? 'Cheque number' : 'Reference / Transaction no.'} optional><Input maxLength={80} value={refund.reference} onValue={(v) => setRefund((r) => ({ ...r, reference: v }))} /></FormField>
              <FormField label="Refunded on"><Input type="date" max={today()} value={refund.refundedOn} onValue={(v) => setRefund((r) => ({ ...r, refundedOn: v }))} /></FormField>
              <FormField label="Reason" className="sm:col-span-2 lg:col-span-3"><Input maxLength={300} value={reason} onValue={setReason} placeholder="e.g. Wrong size, damaged in transport" /></FormField>
              <FormField label="Note" optional className="sm:col-span-2 lg:col-span-3"><Input maxLength={300} value={refund.note} onValue={(v) => setRefund((r) => ({ ...r, note: v }))} /></FormField>
            </div>
          </section>
        </>
      )}
    </FormModal>
  );
}
