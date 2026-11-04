'use client';

// Generate an invoice (backend Bill): the party's open bills (one or more), any service charges, GST, an optional
// discount, the optional buyer company, reference & delivery details and terms — and the payment, because an invoice is
// paid when it is made. The server freezes the pricing and records the payment. It is a GST tax invoice (goods and services).
import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdfShared';
import { EMPTY_INVOICE_DETAILS, INVOICE_DETAIL_FIELDS } from '@/lib/invoiceDetails';
import { useSession } from '@/lib/session';
import { partyQuery } from '@/lib/saleChain';
import { useResource } from '@/lib/useResource';
import { Alert, FormField, FormModal, Input, RichTextEditor, Select, cx, formatDate } from '../kit';
import { DiscountEditor, ServiceLinesEditor, billDoc, servicesPayload, useBillPricing, validateServices } from './BillContentMode';

const today = () => new Date().toISOString().slice(0, 10);

/** GST applies to goods and services; per-line rates come from the catalog or each service row. */
const withGst = true;

/**
 * `party` is `{ design }` or `{ client }` (ids). `proposalDiscount` ({ discount, discountIsPercent, discountRemark }) is
 * shown as a hint so the proposal's agreed discount can be applied here. `seed` carries what the billing page knows:
 * nextInvoiceNo, previousTermsAndConditions, previousBillToCompany. `onSubmit(body)` posts to /api/billing/bills.
 */
export default function BillModal({ open, onClose, party, partyName, seed = {}, proposalDiscount = null, currency = 'INR', busy, onSubmit }) {
  const company = useSession((s) => s.company);
  const [billToCompany, setBillToCompany] = useState(seed.previousBillToCompany || '');
  const [details, setDetails] = useState(EMPTY_INVOICE_DETAILS);
  const [editedTerms, setEditedTerms] = useState(null);
  const seedTerms = seed.previousTermsAndConditions || company?.pdfTerms || '';
  const termsAndConditions = editedTerms ?? seedTerms;
  const { data: openEways, loading, error: loadError } = useResource(open ? `/api/billing/eway-bills/open?${partyQuery(party)}` : null);
  const { data: charges } = useResource(open ? '/api/installation-charges' : null);
  const [unticked, setUnticked] = useState([]); // every open bill is on the invoice unless unticked
  const [services, setServices] = useState([]);
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

  const goods = useMemo(() => chosen.flatMap((e) => (e.pricing?.lines || e.lines || []).map((l) => ({ ...l, kind: l.kind || 'goods', ewayNo: e.ewayNo }))), [chosen]);
  const { summary, goodsValue, servicesValue } = useBillPricing({
    goodsLines: goods,
    serviceRows: services,
    withGst,
    discountActive,
    discount,
    discountIsPercent,
  });

  const toggle = (id) => setUnticked((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
  const applyProposalDiscount = () => {
    setDiscountActive(true);
    setDiscount(Number(proposalDiscount.discount) || 0);
    setDiscountIsPercent(Boolean(proposalDiscount.discountIsPercent));
    setDiscountRemark(proposalDiscount.discountRemark || 'As agreed in the proposal');
  };

  const submit = () => {
    const hasProducts = chosen.length > 0;
    const hasServices = services.some((s) => s.name.trim());
    if (!hasProducts && !hasServices) return setError('Choose at least one product bill or add a service');
    if (!validateServices(services, setError)) return;
    if (!(summary.total > 0)) return setError('The invoice total must be greater than zero');
    setError('');
    onSubmit({
      ...party,
      ewayBills: chosen.map((e) => e.id),
      services: servicesPayload(services),
      withGst,
      discount: discountActive ? discount : 0,
      discountIsPercent,
      discountRemark: discountActive ? discountRemark : '',
      issuedOn,
      payment,
      billToCompany: billToCompany.trim(),
      details,
      termsAndConditions,
    });
  };

  const needsRef = payment.mode !== 'cash';
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Invoice · ${partyName}`}
      description="Select product bills and service lines, then record payment. Totals include GST where applicable."
      submitLabel={`Confirm · ${money(summary.total)}`}
      busy={busy}
      error={error}
      onSubmit={submit}
      size="xl"
      noValidate
      bodyClassName="gap-5"
    >
      {loadError && <Alert>{loadError}</Alert>}

      <div className={billDoc.card}>
        <div className={billDoc.sectionBar}>
          <div>
            <div className={billDoc.sectionTitle}>Order lines</div>
            <p className={billDoc.sectionHint}>Open product bills and additional services on this invoice</p>
          </div>
        </div>
        <div className="border-b border-slate-200">
        <div className={billDoc.sectionBar}>
          <span className={billDoc.sectionTitle}>Product bills</span>
          <span className={billDoc.sectionHint}>{chosen.length} of {eways.length} selected · {money(goodsValue)}</span>
        </div>
        {loading ? <p className="px-4 py-3 text-sm text-slate-500">Loading…</p> : !eways.length ? (
          <p className="px-4 py-3 text-sm text-slate-600">No open product bills. Add services below or create a product bill first.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {eways.map((e) => {
              const on = !unticked.includes(e.id);
              return (
                <li key={e.id}>
                  <label className={cx('flex cursor-pointer items-start gap-3 px-4 py-3 text-sm transition hover:bg-slate-50', on && 'bg-slate-50/80')}>
                    <input type="checkbox" checked={on} onChange={() => toggle(e.id)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-800" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 font-medium text-slate-900">{e.ewayNo}<span className="text-xs font-normal text-slate-500">{formatDate(e.issuedOn)}{e.transport?.vehicleNo ? ` · ${e.transport.vehicleNo}` : ''}</span></span>
                      <span className="block truncate text-xs text-slate-500">{[(e.lines || []).filter((l) => l.kind !== 'service').map((l) => `${l.qty} × ${l.name}`), ...(e.services || []).map((s) => `${s.qty || 1} × ${s.name}`), ...(e.pricing?.lines || []).filter((l) => l.kind === 'service').map((l) => `${l.qty} × ${l.name}`)].flat().filter(Boolean).join(', ') || '—'}</span>
                    </span>
                    <span className="shrink-0 text-right text-sm font-medium tabular-nums text-slate-900">{money(e.total)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        </div>
        <ServiceLinesEditor services={services} setServices={setServices} charges={charges} withGst={withGst} money={money} className="rounded-none border-0 border-t border-slate-200 shadow-none" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_min(100%,320px)] lg:items-start">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payment</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
          <FormField label="Payment mode"><Select value={payment.mode} onValue={(v) => setPayment((p) => ({ ...p, mode: v }))}>{Object.entries(PAYMENT_MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
          <FormField label={payment.mode === 'cheque' ? 'Cheque number' : 'Reference / transaction'} optional={!needsRef}><Input maxLength={80} value={payment.reference} onValue={(v) => setPayment((p) => ({ ...p, reference: v }))} placeholder={payment.mode === 'upi' ? 'UPI transaction ID' : payment.mode === 'bank_transfer' ? 'UTR / reference number' : ''} /></FormField>
          <FormField label="Paid on"><Input type="date" max={today()} value={payment.receivedOn} onValue={(v) => setPayment((p) => ({ ...p, receivedOn: v }))} /></FormField>
          <FormField label="Invoice date"><Input type="date" max={today()} value={issuedOn} onValue={setIssuedOn} /></FormField>
          <FormField label="Payment note" optional className="sm:col-span-2"><Input maxLength={300} value={payment.note} onValue={(v) => setPayment((p) => ({ ...p, note: v }))} placeholder="Optional" /></FormField>
        </div>
        {seed.nextInvoiceNo && (
          <p className="mt-4 text-xs text-slate-500">
            Next number <span className="font-mono font-medium text-slate-800">{seed.nextInvoiceNo}</span> · Tax invoice
          </p>
        )}
      </section>

      <DiscountEditor
        active={discountActive}
        setActive={setDiscountActive}
        discount={discount}
        setDiscount={setDiscount}
        discountIsPercent={discountIsPercent}
        setDiscountIsPercent={setDiscountIsPercent}
        discountRemark={discountRemark}
        setDiscountRemark={setDiscountRemark}
        summary={summary}
        money={money}
        withGst={withGst}
        goodsLabel="Product bills"
        goodsValue={goodsValue}
        servicesValue={servicesValue}
        totalLabel="Total due"
        proposalDiscount={proposalDiscount}
        onApplyProposal={applyProposalDiscount}
      />
      </div>

      <details className="group rounded-lg border border-slate-200 bg-white px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
          <span>More details <span className="font-normal text-slate-400">· buyer company, reference &amp; delivery, terms · optional</span></span>
          <span className="text-xs text-slate-400 group-open:hidden">Show</span><span className="hidden text-xs text-slate-400 group-open:inline">Hide</span>
        </summary>
        <div className="mt-3 max-w-md">
          <FormField label="Company name (Bill to)" optional hint="Printed above the client’s name on the invoice.">
            <Input maxLength={120} value={billToCompany} onValue={setBillToCompany} placeholder="If billing a company" />
          </FormField>
        </div>
        <p className="mt-4 text-sm font-medium text-slate-800">Reference &amp; delivery details</p>
        <p className="mt-1 text-xs text-slate-500">Anything you fill in is printed on the invoice. Leave the rest blank.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {INVOICE_DETAIL_FIELDS.map((f) => (
            <FormField key={f.key} label={f.label} optional className={f.full ? 'sm:col-span-2' : undefined}>
              <Input type={f.type === 'date' ? 'date' : 'text'} maxLength={f.key === 'termsOfDelivery' ? 300 : 120} value={details[f.key]} onValue={(v) => setDetails((d) => ({ ...d, [f.key]: v }))} placeholder={f.placeholder} />
            </FormField>
          ))}
        </div>
        <div className="mt-4">
          <FormField label="Terms & Conditions" hint="Will appear on the invoice PDF.">
            <RichTextEditor value={seedTerms} onChange={setEditedTerms} placeholder="Enter terms and conditions for this invoice..." maxLength={3000} minHeight={120} />
          </FormField>
        </div>
      </details>
    </FormModal>
  );
}
