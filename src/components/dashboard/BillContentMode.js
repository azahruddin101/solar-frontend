'use client';

import { Plus, X } from 'lucide-react';
import { useMemo } from 'react';
import { roundMoney, summarizeLinePricing } from '@/lib/pricing';
import { Button, Select, cx } from '../kit';
import { defaultTaxRate, taxName } from '@/lib/tax';

/** Shared CRM-style document chrome for product bills and invoices. */
export const billDoc = {
  card: 'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs',
  sectionBar: 'flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/90 px-4 py-3',
  sectionTitle: 'text-sm font-semibold text-slate-900',
  sectionHint: 'mt-0.5 text-xs leading-snug text-slate-500',
  tableWrap: 'overflow-x-auto',
  table: 'w-full min-w-[760px] text-[13px]',
  thead: 'border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500',
  th: 'px-3 py-2.5 text-left font-medium first:pl-4 last:pr-4',
  thCenter: 'px-3 py-2.5 text-center font-medium',
  thRight: 'px-3 py-2.5 text-right font-medium',
  td: 'px-3 py-2 align-top first:pl-4 last:pr-4',
  row: 'border-b border-slate-100 hover:bg-slate-50/40',
  subRow: 'border-b border-slate-100 bg-slate-50/80',
  field: 'h-8 w-full rounded border border-slate-200 bg-white px-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100',
  totalsInner: 'px-4 py-4',
  metaStrip: 'grid gap-3 sm:grid-cols-2',
};

/** One bordered block with a titled header — use for every major step of the bill / invoice form. */
export function BillSection({ title, hint, children, className, bodyClassName, action, flush }) {
  return (
    <section className={cx(billDoc.card, className)}>
      <div className={billDoc.sectionBar}>
        <div className="min-w-0 flex-1">
          <div className={billDoc.sectionTitle}>{title}</div>
          {hint ? <p className={billDoc.sectionHint}>{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cx(!flush && billDoc.totalsInner, bodyClassName)}>{children}</div>
    </section>
  );
}

const field = billDoc.field;

let seq = 0;
export const blankServiceRow = (gst = defaultTaxRate()) => ({ key: `s${++seq}`, chargeId: '', name: '', description: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, gstPercent: gst });

/** Service lines table + add row (used on product bills and tax invoices). */
export function ServiceLinesEditor({ services, setServices, charges, withGst, money, className, hideHeader }) {
  const setService = (i, patch) => setServices((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const pickCharge = (i, id) => {
    const c = (Array.isArray(charges) ? charges : []).find((x) => x.id === id);
    if (!c) return setService(i, { chargeId: '' });
    setService(i, { chargeId: c.id, name: c.name, description: c.description || '', rate: c.defaultPrice || 0, gstPercent: c.gstPercent ?? 18, hsn: c.sac || '' });
  };
  const serviceLines = useMemo(() => services.filter((s) => s.name.trim()).map((s) => ({
    kind: 'service', name: s.name, detail: s.description, hsn: s.hsn, qty: Number(s.qty) || 1, unit: s.unit, rate: Number(s.rate) || 0, gstPercent: Number(s.gstPercent) || 0,
  })), [services]);
  const servicesValue = useMemo(() => roundMoney(serviceLines.reduce((a, l) => a + l.qty * l.rate, 0)), [serviceLines]);

  return (
    <section className={cx(billDoc.card, className)}>
      {!hideHeader && (
        <div className={billDoc.sectionBar}>
          <div className="min-w-0 flex-1">
            <div className={billDoc.sectionTitle}>Services</div>
            <p className={billDoc.sectionHint}>
              {serviceLines.length ? <>Subtotal <span className="font-medium tabular-nums text-slate-800">{money(servicesValue)}</span></> : 'Labour, installation, and other charges (not from stock)'}
            </p>
          </div>
        </div>
      )}
      {services.length > 0 && (
        <div className={billDoc.tableWrap}>
          <table className={cx(billDoc.table, 'min-w-[800px]')}>
            <thead className={billDoc.thead}>
              <tr>
                <th className={billDoc.th}>Service</th>
                <th className={billDoc.th}>Description</th>
                <th className={cx(billDoc.thCenter, 'w-24')} title="Services Accounting Code">SAC</th>
                <th className={cx(billDoc.thCenter, 'w-16')}>Qty</th>
                <th className={cx(billDoc.thRight, 'w-28')}>Unit price</th>
                {withGst && <th className={cx(billDoc.thCenter, 'w-16')}>Tax %</th>}
                <th className={cx(billDoc.thRight, 'w-28')}>Amount</th>
                <th className="w-10 px-1 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <tr key={s.key} className={billDoc.row}>
                  <td className={billDoc.td}>
                    <Select aria-label="Service template" value={s.chargeId} onValue={(v) => pickCharge(i, v)} className="mb-1.5 h-8 text-xs">
                      <option value="">Custom service</option>
                      {(Array.isArray(charges) ? charges : []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.defaultPrice ? ` · ${money(c.defaultPrice)}` : ''}</option>)}
                    </Select>
                    <input type="text" maxLength={160} value={s.name} onChange={(e) => setService(i, { name: e.target.value })} placeholder="Service name" className={field} />
                  </td>
                  <td className={billDoc.td}><textarea rows={2} maxLength={300} value={s.description} onChange={(e) => setService(i, { description: e.target.value })} placeholder="Optional" className="w-full resize-none rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" /></td>
                  <td className={billDoc.td}><input type="text" inputMode="numeric" maxLength={8} value={s.hsn} onChange={(e) => setService(i, { hsn: e.target.value.replace(/\D/g, '') })} placeholder="—" className={cx(field, 'text-center font-mono text-xs')} /></td>
                  <td className={billDoc.td}><input type="number" min={0} step="any" value={s.qty} onChange={(e) => setService(i, { qty: e.target.value })} className={cx(field, 'text-center')} /></td>
                  <td className={billDoc.td}><input type="number" min={0} step="0.01" value={s.rate} onChange={(e) => setService(i, { rate: e.target.value })} className={cx(field, 'text-right tabular-nums')} /></td>
                  {withGst && <td className={billDoc.td}><input type="number" min={0} max={100} step="any" value={s.gstPercent} onChange={(e) => setService(i, { gstPercent: e.target.value })} className={cx(field, 'text-center tabular-nums')} /></td>}
                  <td className={cx(billDoc.td, 'text-right font-medium tabular-nums text-slate-900')}><div className="h-8 leading-8">{money((Number(s.qty) || 1) * (Number(s.rate) || 0))}</div></td>
                  <td className="px-1 py-2 text-center align-top"><button type="button" aria-label="Remove service" onClick={() => setServices((rows) => rows.filter((_, j) => j !== i))} className="mt-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-slate-100 px-4 py-2.5">
        <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setServices((rows) => [...rows, blankServiceRow()])}>Add line</Button>
      </div>
    </section>
  );
}

/** Discount row matching invoice pricing on the server. */
export function DiscountEditor({ active, setActive, discount, setDiscount, discountIsPercent, setDiscountIsPercent, discountRemark, setDiscountRemark, summary, money, withGst, proposalDiscount, onApplyProposal, goodsLabel = 'Products', goodsValue, servicesValue, totalLabel = 'Total', embedded = false }) {
  const body = (
    <dl className="space-y-2 text-sm">
        {goodsValue != null && <div className="flex justify-between gap-4"><dt className="text-slate-600">{goodsLabel}</dt><dd className="tabular-nums font-medium text-slate-900">{money(goodsValue)}</dd></div>}
        {servicesValue > 0 && <div className="flex justify-between gap-4"><dt className="text-slate-600">Services</dt><dd className="tabular-nums font-medium text-slate-900">{money(servicesValue)}</dd></div>}
        {active ? (
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-2.5">
            <div className="text-xs font-medium text-slate-600">Discount</div>
            <input type="text" maxLength={200} value={discountRemark} onChange={(e) => setDiscountRemark(e.target.value)} placeholder="Reason" className={cx(field, 'text-xs')} />
            <div className="flex flex-wrap items-center gap-2">
              <input type="number" min={0} step="any" value={discount || ''} placeholder="0" onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} className={cx(field, 'w-24 text-right tabular-nums')} aria-label="Discount amount" />
              <div className="inline-flex rounded border border-slate-200 bg-white p-0.5 text-[11px] font-medium">
                {[[false, money(0).replace(/[\d.,\s]+$/, '') || 'Flat'], [true, '%']].map(([pct, label]) => (
                  <button key={label} type="button" onClick={() => setDiscountIsPercent(pct)} className={cx('rounded px-2 py-0.5 tabular-nums', discountIsPercent === pct ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50')}>{label}</button>
                ))}
              </div>
              <span className="ml-auto text-sm font-medium tabular-nums text-slate-800">−{money(summary.discountAmount)}</span>
              <button type="button" onClick={() => { setActive(false); setDiscount(0); setDiscountRemark(''); }} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700" title="Remove discount"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" onClick={() => setActive(true)} className="text-xs font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline">Add discount</button>
            {proposalDiscount?.discount > 0 && onApplyProposal && (
              <button type="button" onClick={onApplyProposal} className="text-xs text-slate-500 hover:text-slate-800">
                Use proposal discount ({proposalDiscount.discountIsPercent ? `${proposalDiscount.discount}%` : money(proposalDiscount.discount)})
              </button>
            )}
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-slate-100 pt-2"><dt className="text-slate-600">{withGst ? 'Taxable amount' : 'Subtotal'}{active && summary.discountAmount > 0 ? ' (after discount)' : ''}</dt><dd className="tabular-nums text-slate-900">{money(summary.subtotal)}</dd></div>
        {withGst && summary.gstTotal > 0 && <div className="flex justify-between gap-4"><dt className="text-slate-600">Tax ({taxName()})</dt><dd className="tabular-nums text-slate-900">{money(summary.gstTotal)}</dd></div>}
        <div className="flex justify-between gap-4 border-t border-slate-200 pt-3"><dt className="text-base font-semibold text-slate-900">{totalLabel}</dt><dd className="text-base font-semibold tabular-nums text-slate-900">{money(summary.total)}</dd></div>
      </dl>
  );
  if (embedded) return body;
  return (
    <section className={billDoc.card}>
      <div className={billDoc.sectionBar}>
        <div>
          <div className={billDoc.sectionTitle}>Summary</div>
          <p className={billDoc.sectionHint}>Discount, tax, and total</p>
        </div>
      </div>
      <div className={billDoc.totalsInner}>{body}</div>
    </section>
  );
}

export function useBillPricing({ goodsLines, serviceRows, withGst, discountActive, discount, discountIsPercent }) {
  return useMemo(() => {
    const serviceLines = serviceRows.filter((s) => s.name.trim()).map((s) => ({
      kind: 'service', name: s.name, detail: s.description, hsn: s.hsn, qty: Number(s.qty) || 1, unit: s.unit, rate: Number(s.rate) || 0, gstPercent: Number(s.gstPercent) || 0,
    }));
    const lines = [...goodsLines, ...serviceLines];
    const base = summarizeLinePricing({ lines, gstIncluded: false, discount: 0, withGst }).subtotal;
    const asked = discountActive ? (discountIsPercent ? (base * (Number(discount) || 0)) / 100 : Number(discount) || 0) : 0;
    const amount = roundMoney(Math.min(base, Math.max(0, asked)));
    const summary = summarizeLinePricing({ lines, gstIncluded: false, discount: amount, discountIsPercent: false, withGst });
    return { serviceLines, summary, goodsValue: roundMoney(goodsLines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0)), servicesValue: roundMoney(serviceLines.reduce((a, l) => a + l.qty * l.rate, 0)) };
  }, [goodsLines, serviceRows, withGst, discountActive, discount, discountIsPercent]);
}

export function servicesPayload(services) {
  return services.map((s) => ({
    chargeId: s.chargeId || '',
    name: s.name.trim(),
    description: s.description,
    hsn: s.hsn,
    qty: Number(s.qty) || 1,
    unit: s.unit,
    rate: roundMoney(Number(s.rate) || 0),
    gstPercent: Number(s.gstPercent) || 0,
  }));
}

export function validateServices(services, setError) {
  for (const s of services) {
    if (!String(s.name ?? '').trim()) continue;
    if (!(Number(s.rate) >= 0)) return setError(`Enter the price of ${s.name}`), false;
  }
  return true;
}
