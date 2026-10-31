'use client';

// Generate the invoice that settles a party's bills: every paid bill not yet on an invoice goes on it, exactly as it
// was paid — goods, services, discounts and GST. Here you add the buyer's company name, the optional reference &
// delivery details and the terms; nothing is re-priced and nothing is left out.
import { CircleCheck, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { EMPTY_INVOICE_DETAILS, INVOICE_DETAIL_FIELDS } from '@/lib/invoiceDetails';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdfShared';
import { roundMoney } from '@/lib/pricing';
import { useSession } from '@/lib/session';
import { Alert, FormField, FormModal, Input, RichTextEditor, formatDate } from '../kit';

const taxed = (b) => b.pricing?.withGst !== false && b.pricing?.invoiceGstMode !== 'without_gst';

/**
 * `party` is `{ design }` or `{ client }` (ids); `bills` every bill of that party (the paid ones go on the invoice, the
 * invoiced ones are listed for reference). `seed` carries what the billing page already knows: nextInvoiceNo,
 * previousTermsAndConditions, previousBillToCompany. `onSubmit(body)` posts to /api/billing/invoices/from-bills.
 */
export default function InvoiceFromBillsModal({ open, onClose, party, partyName, bills = [], seed = {}, currency = 'INR', busy, onSubmit }) {
  const company = useSession((s) => s.company);
  const [billToCompany, setBillToCompany] = useState(seed.previousBillToCompany || '');
  const [details, setDetails] = useState(EMPTY_INVOICE_DETAILS);
  const [editedTerms, setEditedTerms] = useState(null);
  const [error, setError] = useState('');
  const money = (v) => formatMoney(v, currency);
  const chosen = useMemo(() => bills.filter((b) => b.status === 'paid').sort((a, b) => new Date(a.issuedOn) - new Date(b.issuedOn)), [bills]);
  const earlier = useMemo(() => bills.filter((b) => b.status === 'invoiced'), [bills]);
  const withGst = chosen.some(taxed);
  const totals = useMemo(() => ({
    subtotal: roundMoney(chosen.reduce((a, b) => a + (Number(b.pricing?.subtotal) || 0), 0)),
    discount: roundMoney(chosen.reduce((a, b) => a + (Number(b.pricing?.discountAmount) || 0), 0)),
    gst: roundMoney(chosen.reduce((a, b) => a + (Number(b.pricing?.gstTotal) || 0), 0)),
    total: roundMoney(chosen.reduce((a, b) => a + (Number(b.total) || 0), 0)),
  }), [chosen]);
  const seedTerms = seed.previousTermsAndConditions || company?.pdfTerms || '';
  const termsAndConditions = editedTerms ?? seedTerms;

  const submit = () => {
    if (!chosen.length) return setError('There is no paid bill to invoice yet');
    setError('');
    // no `bills`: the server puts every paid bill of the party on the invoice, so nothing made since this page loaded is missed
    onSubmit({ ...party, billToCompany: billToCompany.trim(), details, termsAndConditions });
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Invoice · ${partyName}`}
      description="The invoice settles every paid bill below: their goods, services, discounts and GST go on it exactly as they were paid."
      submitLabel={`Generate invoice · ${money(totals.total)}`}
      busy={busy}
      error={error}
      onSubmit={submit}
      size="xl"
      noValidate
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {seed.nextInvoiceNo && <span className="text-slate-500">Invoice no. <b className="font-mono text-slate-900">{seed.nextInvoiceNo}</b></span>}
        <span className="text-slate-500">{withGst ? 'Tax invoice (GST)' : 'Invoice without GST'}</span>
        <span className="text-slate-500">{chosen.length} bill{chosen.length === 1 ? '' : 's'} · {money(totals.total)}</span>
      </div>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/40">
        <div className="flex items-center justify-between gap-2 border-b border-emerald-100 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><ReceiptText className="h-4 w-4" />Bills on this invoice</div>
          <span className="text-xs text-slate-600">all paid bills not invoiced yet</span>
        </div>
        {!chosen.length ? (
          <p className="px-4 py-3 text-sm text-slate-600">Every bill is already on an invoice. Generate a bill first.</p>
        ) : (
          <ul className="divide-y divide-emerald-100 bg-white">
            {chosen.map((b) => (
              <li key={b.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 font-medium text-slate-900">{b.billNo}<span className="text-xs font-normal text-slate-500">{formatDate(b.issuedOn)} · paid by {PAYMENT_MODE_LABEL[b.paid?.mode]?.split(' (')[0] || b.paid?.mode}{b.ewayBills?.length ? ` · ${b.ewayBills.map((e) => e.ewayNo).join(', ')}` : ''}</span></span>
                  <span className="block truncate text-xs text-slate-500">{(b.pricing?.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', ')}</span>
                </span>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{money(b.total)}<span className="block text-[11px] font-normal text-slate-500">{taxed(b) ? 'incl. GST' : 'no GST'}</span></span>
              </li>
            ))}
          </ul>
        )}
        {earlier.length > 0 && (
          <div className="border-t border-emerald-100 bg-slate-50/70 px-4 py-2 text-xs text-slate-500">
            Already invoiced: {earlier.map((b) => `${b.billNo}${b.invoice?.invoiceNo ? ` (${b.invoice.invoiceNo})` : ''}`).join(', ')}
          </div>
        )}
      </section>
      {chosen.length > 1 && new Set(chosen.map(taxed)).size > 1 && <Alert tone="warn">Some of these bills were made without GST. Their lines go on the tax invoice at 0 % GST, as they were paid.</Alert>}

      {chosen.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="w-16 px-3 py-2 text-center font-semibold">HSN/SAC</th>
                <th className="w-20 px-3 py-2 text-center font-semibold">Qty</th>
                <th className="w-28 px-3 py-2 text-right font-semibold">Rate</th>
                {withGst && <th className="w-14 px-3 py-2 text-center font-semibold">GST</th>}
                <th className="w-28 px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {chosen.map((b) => (
                <BillRows key={b.id} bill={b} withGst={withGst} money={money} />
              ))}
              {totals.discount > 0 && <tr className="border-t border-slate-200 bg-slate-50"><td colSpan={withGst ? 5 : 4} className="px-3 py-1.5 text-right text-slate-700">Subtotal</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{money(totals.subtotal + totals.discount)}</td></tr>}
              {totals.discount > 0 && <tr className="bg-amber-50/40"><td colSpan={withGst ? 5 : 4} className="px-3 py-1.5 text-right text-slate-700">Discounts on the bills</td><td className="px-3 py-1.5 text-right font-semibold tabular-nums text-amber-800">−{money(totals.discount)}</td></tr>}
              <tr className="border-t border-slate-200 bg-slate-50"><td colSpan={withGst ? 5 : 4} className="px-3 py-1.5 text-right text-slate-700">{withGst ? 'Taxable value' : 'Subtotal'}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{money(totals.subtotal)}</td></tr>
              {withGst && <tr className="bg-slate-50"><td colSpan={5} className="px-3 py-1.5 text-right text-slate-700">GST</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{money(totals.gst)}</td></tr>}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900"><td colSpan={withGst ? 5 : 4} className="px-3 py-2 text-right">Invoice total · already paid on the bills</td><td className="px-3 py-2 text-right tabular-nums">{money(totals.total)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <div className="max-w-md">
        <FormField label="Company name (Bill to)" optional hint="Printed above the client’s name on the invoice.">
          <Input maxLength={120} value={billToCompany} onValue={setBillToCompany} placeholder="If billing a company" />
        </FormField>
      </div>

      <details className="group border-t border-slate-200 pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
          <span>Reference &amp; delivery details <span className="font-normal text-slate-400">· optional</span></span>
          <span className="text-xs text-slate-400 group-open:hidden">Show</span><span className="hidden text-xs text-slate-400 group-open:inline">Hide</span>
        </summary>
        <p className="mt-1 text-xs text-slate-500">Anything you fill in is printed on the invoice. Leave the rest blank.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {INVOICE_DETAIL_FIELDS.map((f) => (
            <FormField key={f.key} label={f.label} optional className={f.full ? 'sm:col-span-2' : undefined}>
              <Input type={f.type === 'date' ? 'date' : 'text'} maxLength={f.key === 'termsOfDelivery' ? 300 : 120} value={details[f.key]} onValue={(v) => setDetails((d) => ({ ...d, [f.key]: v }))} placeholder={f.placeholder} />
            </FormField>
          ))}
        </div>
      </details>

      <div className="border-t border-slate-200 pt-4">
        <FormField label="Terms & Conditions" hint="Will appear on the invoice PDF.">
          <RichTextEditor value={seedTerms} onChange={setEditedTerms} placeholder="Enter terms and conditions for this invoice..." maxLength={3000} minHeight={120} />
        </FormField>
      </div>
    </FormModal>
  );
}

function BillRows({ bill, withGst, money }) {
  const lines = (bill.pricing?.lines || []).filter((l) => l?.name);
  return (
    <>
      <tr className="bg-emerald-50/50">
        <td colSpan={withGst ? 6 : 5} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900">{bill.billNo} · {formatDate(bill.issuedOn)}{bill.ewayBills?.length ? ` · ${bill.ewayBills.map((e) => e.ewayNo).join(', ')}` : ''}</td>
      </tr>
      {lines.map((l, i) => (
        <tr key={`${bill.id}-${i}`} className="border-b border-slate-100">
          <td className="w-full max-w-0 px-3 py-1.5">
            <span className="font-medium text-slate-900">{l.name}</span>
            {l.kind === 'service' && <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700">Service</span>}
            {(l.batchNo || l.serials?.length > 0) && <span className="block truncate text-[11px] text-slate-500">{[l.batchNo ? `Batch ${l.batchNo}` : '', l.serials?.length ? `S/N ${l.serials.join(', ')}` : ''].filter(Boolean).join(' · ')}</span>}
          </td>
          <td className="px-3 py-1.5 text-center text-slate-600">{l.hsn || '—'}</td>
          <td className="px-3 py-1.5 text-center text-slate-700">{l.qty} {l.unit}</td>
          <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{money(l.rate)}</td>
          {withGst && <td className="px-3 py-1.5 text-center text-slate-600">{l.gstPercent ? `${l.gstPercent}%` : '—'}</td>}
          <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900">{money(l.gross ?? (Number(l.qty) || 1) * (Number(l.rate) || 0))}</td>
        </tr>
      ))}
    </>
  );
}
