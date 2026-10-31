'use client';

// Generate a bill: the party's open e-way bills (one or more), any service charges, GST, an optional discount — and
// the payment, because a bill is paid when it is made. The server freezes the pricing and records the payment.
import { BadgePercent, Plus, Truck, Wrench, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdfShared';
import { roundMoney, summarizeLinePricing } from '@/lib/pricing';
import { partyQuery } from '@/lib/saleChain';
import { useResource } from '@/lib/useResource';
import { Alert, FormField, FormModal, Input, Select, cx, formatDate } from '../kit';

const today = () => new Date().toISOString().slice(0, 10);
let seq = 0;
const blankService = (gst = 18) => ({ key: `s${++seq}`, chargeId: '', name: '', description: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, gstPercent: gst });

const KIND = [
  { id: 'plain', label: 'No GST' },
  { id: 'tax', label: 'GST' },
];

const field = 'h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand';

/**
 * `party` is `{ design }` or `{ client }` (ids). `proposalDiscount` ({ discount, discountIsPercent, discountRemark }) is
 * shown as a hint so the proposal's agreed discount can be applied here. `onSubmit(body)` posts to /api/billing/bills.
 */
export default function BillModal({ open, onClose, party, partyName, proposalDiscount = null, currency = 'INR', busy, onSubmit }) {
  const { data: openEways, loading, error: loadError } = useResource(open ? `/api/billing/eway-bills/open?${partyQuery(party)}` : null);
  const { data: charges } = useResource(open ? '/api/installation-charges' : null);
  const [unticked, setUnticked] = useState([]); // every open e-way bill is on the bill unless unticked
  const [services, setServices] = useState([]);
  const [kind, setKind] = useState(null); // null: follow the e-way bills
  const [discountActive, setDiscountActive] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [discountIsPercent, setDiscountIsPercent] = useState(false);
  const [discountRemark, setDiscountRemark] = useState('');
  const [payment, setPayment] = useState({ mode: 'upi', reference: '', receivedOn: today(), note: '' });
  const [issuedOn, setIssuedOn] = useState(today());
  const [error, setError] = useState('');
  const money = (v) => formatMoney(v, currency);
  const eways = useMemo(() => (Array.isArray(openEways) ? openEways : []), [openEways]);
  const chosen = useMemo(() => eways.filter((e) => !unticked.includes(e.id)), [eways, unticked]);
  const ewaysTaxed = chosen.length ? chosen.some((e) => e.pricing?.withGst !== false) : true;
  const withGst = kind ? kind === 'tax' : ewaysTaxed;

  const goods = useMemo(() => chosen.flatMap((e) => (e.pricing?.lines || e.lines || []).map((l) => ({ ...l, kind: 'goods', ewayNo: e.ewayNo }))), [chosen]);
  const serviceLines = useMemo(() => services.filter((s) => s.name.trim()).map((s) => ({ kind: 'service', name: s.name, detail: s.description, hsn: s.hsn, qty: Number(s.qty) || 1, unit: s.unit, rate: Number(s.rate) || 0, gstPercent: Number(s.gstPercent) || 0 })), [services]);
  const summary = useMemo(
    () => summarizeLinePricing({ lines: [...goods, ...serviceLines], gstIncluded: false, discount: discountActive ? discount : 0, discountIsPercent, withGst }),
    [goods, serviceLines, discountActive, discount, discountIsPercent, withGst],
  );
  const goodsValue = useMemo(() => roundMoney(goods.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0)), [goods]);
  const servicesValue = useMemo(() => roundMoney(serviceLines.reduce((a, l) => a + l.qty * l.rate, 0)), [serviceLines]);

  const toggle = (id) => setUnticked((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
  const setService = (i, patch) => setServices((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const pickCharge = (i, id) => {
    const c = (Array.isArray(charges) ? charges : []).find((x) => x.id === id);
    if (!c) return setService(i, { chargeId: '' });
    setService(i, { chargeId: c.id, name: c.name, description: c.description || '', rate: c.defaultPrice || 0, gstPercent: c.gstPercent ?? 18, hsn: c.sac || '' });
  };
  const applyProposalDiscount = () => {
    setDiscountActive(true);
    setDiscount(Number(proposalDiscount.discount) || 0);
    setDiscountIsPercent(Boolean(proposalDiscount.discountIsPercent));
    setDiscountRemark(proposalDiscount.discountRemark || 'As agreed in the proposal');
  };

  const submit = () => {
    if (!chosen.length && !serviceLines.length) return setError('Choose at least one e-way bill or add a service');
    for (const s of services) {
      if (!s.name.trim()) return setError('Give every service a name, or remove the empty row');
      if (!(Number(s.rate) >= 0)) return setError(`Enter the price of ${s.name}`);
    }
    if (!(summary.total > 0)) return setError('The bill total must be greater than zero');
    setError('');
    onSubmit({
      ...party,
      ewayBills: chosen.map((e) => e.id),
      services: services.map((s) => ({ chargeId: s.chargeId || '', name: s.name.trim(), description: s.description, hsn: s.hsn, qty: Number(s.qty) || 1, unit: s.unit, rate: roundMoney(Number(s.rate) || 0), gstPercent: Number(s.gstPercent) || 0 })),
      withGst,
      discount: discountActive ? discount : 0,
      discountIsPercent,
      discountRemark: discountActive ? discountRemark : '',
      issuedOn,
      payment,
    });
  };

  const needsRef = payment.mode !== 'cash';
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Bill · ${partyName}`}
      description="Tick the e-way bills this bill covers, add services if any, and record how it was paid. A bill is paid when it is generated and is the client’s payment document."
      submitLabel={`Generate bill · ${money(summary.total)}`}
      busy={busy}
      error={error}
      onSubmit={submit}
      size="xl"
      noValidate
    >
      <div className="absolute top-4 right-12">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/80 p-1">
          {KIND.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setKind(id)} className={cx('h-8 rounded-md px-3 text-xs font-semibold transition', (kind ? kind === id : (id === 'tax') === ewaysTaxed) ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900')}>{label}</button>
          ))}
        </div>
      </div>

      {loadError && <Alert>{loadError}</Alert>}

      <section className="rounded-xl border border-sky-200 bg-sky-50/40">
        <div className="flex items-center justify-between gap-2 border-b border-sky-100 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-900"><Truck className="h-4 w-4" />E-way bills</div>
          <span className="text-xs text-slate-600">{chosen.length} of {eways.length} chosen · goods <b className="text-slate-900">{money(goodsValue)}</b></span>
        </div>
        {loading ? <p className="px-4 py-3 text-sm text-slate-500">Loading…</p> : !eways.length ? (
          <p className="px-4 py-3 text-sm text-slate-600">No open e-way bills. Generate one first, or make a bill for services only.</p>
        ) : (
          <ul className="divide-y divide-sky-100 bg-white">
            {eways.map((e) => {
              const on = !unticked.includes(e.id);
              return (
                <li key={e.id}>
                  <label className={cx('flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm hover:bg-sky-50/60', on && 'bg-sky-50/40')}>
                    <input type="checkbox" checked={on} onChange={() => toggle(e.id)} className="mt-1 h-4 w-4 accent-[var(--color-brand,#0F6E56)]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 font-medium text-slate-900">{e.ewayNo}<span className="text-xs font-normal text-slate-500">{formatDate(e.issuedOn)}{e.transport?.vehicleNo ? ` · ${e.transport.vehicleNo}` : ''}{e.govtEwayNo ? ` · EWB ${e.govtEwayNo}` : ''}</span></span>
                      <span className="block truncate text-xs text-slate-500">{(e.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', ')}</span>
                    </span>
                    <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{money(e.total)}<span className="block text-[11px] font-normal text-slate-500">{e.pricing?.withGst === false ? 'no GST' : 'incl. GST'}</span></span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50/40">
        <div className="flex items-center justify-between gap-2 border-b border-violet-100 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-900"><Wrench className="h-4 w-4" />Services</div>
          <span className="text-xs text-slate-600">{serviceLines.length ? <>services <b className="text-slate-900">{money(servicesValue)}</b></> : 'optional'}</span>
        </div>
        {services.length > 0 && (
          <div className="overflow-x-auto bg-white">
            <table className="w-full min-w-[800px] text-xs">
              <thead className="text-slate-600">
                <tr className="border-b border-violet-100">
                  <th className="px-3 py-2 text-left font-semibold">Service</th>
                  <th className="px-3 py-2 text-left font-semibold">Description</th>
                  <th className="w-24 px-3 py-2 text-center font-semibold" title="Services Accounting Code (optional)">SAC</th>
                  <th className="w-16 px-3 py-2 text-center font-semibold">Qty</th>
                  <th className="w-28 px-3 py-2 text-right font-semibold">Price</th>
                  {withGst && <th className="w-16 px-3 py-2 text-center font-semibold">GST%</th>}
                  <th className="w-28 px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="w-8 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {services.map((s, i) => (
                  <tr key={s.key} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      <Select aria-label="Service" value={s.chargeId} onValue={(v) => pickCharge(i, v)} className="mb-1 h-8 text-xs">
                        <option value="">Custom service</option>
                        {(Array.isArray(charges) ? charges : []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.defaultPrice ? ` · ${money(c.defaultPrice)}` : ''}</option>)}
                      </Select>
                      <input type="text" maxLength={160} value={s.name} onChange={(e) => setService(i, { name: e.target.value })} placeholder="Service name" className={field} />
                    </td>
                    <td className="px-3 py-2 align-top"><textarea rows={2} maxLength={300} value={s.description} onChange={(e) => setService(i, { description: e.target.value })} placeholder="Details (optional)" className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand" /></td>
                    <td className="px-3 py-2 align-top"><input type="text" inputMode="numeric" maxLength={8} value={s.hsn} onChange={(e) => setService(i, { hsn: e.target.value.replace(/\D/g, '') })} placeholder="—" className={cx(field, 'text-center font-mono')} /></td>
                    <td className="px-3 py-2 align-top"><input type="number" min={0} step="any" value={s.qty} onChange={(e) => setService(i, { qty: e.target.value })} className={cx(field, 'text-center')} /></td>
                    <td className="px-3 py-2 align-top"><input type="number" min={0} step="0.01" value={s.rate} onChange={(e) => setService(i, { rate: e.target.value })} className={cx(field, 'text-right')} /></td>
                    {withGst && <td className="px-3 py-2 align-top"><input type="number" min={0} max={100} step="any" value={s.gstPercent} onChange={(e) => setService(i, { gstPercent: e.target.value })} className={cx(field, 'text-center')} /></td>}
                    <td className="px-3 py-2 text-right align-top font-semibold tabular-nums text-slate-900"><div className="h-8 leading-8">{money((Number(s.qty) || 1) * (Number(s.rate) || 0))}</div></td>
                    <td className="px-1 py-2 text-center align-top"><button type="button" aria-label="Remove service" onClick={() => setServices((rows) => rows.filter((_, j) => j !== i))} className="mt-1.5 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2.5">
          <button type="button" onClick={() => setServices((rows) => [...rows, blankService()])} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 text-xs font-semibold text-violet-800 hover:bg-violet-50"><Plus className="h-3.5 w-3.5" />Add service</button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-600">Goods</dt><dd className="tabular-nums text-slate-900">{money(goodsValue)}</dd></div>
          {servicesValue > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-600">Services</dt><dd className="tabular-nums text-slate-900">{money(servicesValue)}</dd></div>}
          {discountActive ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2">
              <BadgePercent className="h-4 w-4 text-amber-700" />
              <input type="text" maxLength={200} value={discountRemark} onChange={(e) => setDiscountRemark(e.target.value)} placeholder="Reason (e.g. as agreed in the proposal)" className={cx(field, 'min-w-[160px] flex-1')} />
              <input type="number" min={0} step="any" value={discount || ''} placeholder="0" onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} className={cx(field, 'w-28 text-right font-semibold')} aria-label="Discount" />
              <div className="inline-flex shrink-0 rounded-md border border-slate-300 bg-white p-0.5 text-[11px] font-semibold">
                {[[false, '₹'], [true, '%']].map(([pct, label]) => (
                  <button key={label} type="button" onClick={() => setDiscountIsPercent(pct)} className={cx('rounded px-2 py-0.5', discountIsPercent === pct ? 'bg-amber-500 text-white' : 'text-slate-600')}>{label}</button>
                ))}
              </div>
              <span className="w-24 text-right text-sm font-semibold tabular-nums text-amber-800">−{money(summary.discountAmount)}</span>
              <button type="button" onClick={() => { setDiscountActive(false); setDiscount(0); setDiscountRemark(''); }} className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove the discount"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 py-0.5">
              <button type="button" onClick={() => setDiscountActive(true)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"><BadgePercent className="h-3.5 w-3.5" />Add discount</button>
              {proposalDiscount?.discount > 0 && (
                <button type="button" onClick={applyProposalDiscount} className="text-xs text-emerald-700 hover:underline">
                  Apply the proposal’s discount: {proposalDiscount.discountIsPercent ? `${proposalDiscount.discount}%` : money(proposalDiscount.discount)}{proposalDiscount.discountRemark ? ` · ${proposalDiscount.discountRemark}` : ''}
                </button>
              )}
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5"><dt className="text-slate-600">{withGst ? 'Taxable value' : 'Subtotal'}{discountActive && summary.discountAmount > 0 ? ' (after discount)' : ''}</dt><dd className="tabular-nums text-slate-900">{money(summary.subtotal)}</dd></div>
          {withGst && <div className="flex justify-between gap-3"><dt className="text-slate-600">GST</dt><dd className="tabular-nums text-slate-900">{money(summary.gstTotal)}</dd></div>}
          <div className="flex justify-between gap-3 border-t border-slate-300 pt-1.5 text-base font-semibold"><dt className="text-slate-900">Total · paid now</dt><dd className="tabular-nums text-emerald-700">{money(summary.total)}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <div className="mb-3 text-sm font-semibold text-emerald-900">Payment received</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Payment mode"><Select value={payment.mode} onValue={(v) => setPayment((p) => ({ ...p, mode: v }))}>{Object.entries(PAYMENT_MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
          <FormField label={payment.mode === 'cheque' ? 'Cheque number' : 'Reference / Transaction no.'} optional={!needsRef}><Input maxLength={80} value={payment.reference} onValue={(v) => setPayment((p) => ({ ...p, reference: v }))} placeholder={payment.mode === 'upi' ? 'UPI transaction ID' : payment.mode === 'bank_transfer' ? 'UTR / reference number' : ''} /></FormField>
          <FormField label="Paid on"><Input type="date" max={today()} value={payment.receivedOn} onValue={(v) => setPayment((p) => ({ ...p, receivedOn: v }))} /></FormField>
          <FormField label="Bill date"><Input type="date" max={today()} value={issuedOn} onValue={setIssuedOn} /></FormField>
          <FormField label="Note" optional className="sm:col-span-2 lg:col-span-4"><Input maxLength={300} value={payment.note} onValue={(v) => setPayment((p) => ({ ...p, note: v }))} placeholder="e.g. Paid by the client’s brother" /></FormField>
        </div>
      </section>
    </FormModal>
  );
}
