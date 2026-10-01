'use client';

import { Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { buildPricing, linesFromPricing, resolveProposalPricing, roundMoney, summarizeLinePricing } from '@/lib/pricing';
import { useResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import { invoiceBillToSchema, useValidation } from '@/lib/validation';
import { FormField, FormModal, Input, NumField, PhoneInput, Select, Textarea, RichTextEditor } from '../kit';

const emptyLine = (gst = 18) => ({ name: '', detail: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, gstPercent: gst });

const INVOICE_KIND = [
  { id: 'plain', label: 'No GST', hint: 'No GST breakdown. Line prices are the final amounts.' },
  { id: 'tax', label: 'GST', hint: 'Enter price before GST and GST % per line. GST is added on top.' },
];

const EMPTY_BILL_TO = { name: '', phone: '', email: '', address: '', gstNumber: '' };

/**
 * Line-item editor for an invoice. With `designId` it is seeded from the proposal; without one it is a "direct"
 * invoice: the buyer is typed in (or picked from existing clients) and `onSubmit` also receives
 * `{ billTo, client, title }`.
 */
export default function InvoiceGenerateModal({ open, onClose, designId, pricing, quote, proposalTitle, contractTotal, currency = 'INR', onSubmit, busy }) {
  const { company } = useSession();
  const direct = !designId;
  const { data: fullDesign } = useResource(open && designId ? `/api/designs/${designId}` : null);
  const { data: nextNo } = useResource(open && direct ? '/api/billing/invoices/next-number' : null);
  const { data: clientList } = useResource(open && direct ? '/api/clients?limit=200' : null);
  const [billTo, setBillTo] = useState(EMPTY_BILL_TO);
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const billToV = useValidation(invoiceBillToSchema, billTo);
  const pickClient = (id) => {
    setClientId(id);
    const c = (clientList?.items || []).find((x) => x.id === id);
    if (c) setBillTo({ name: c.name || '', phone: c.phone || '', email: c.email || '', address: c.address || '', gstNumber: c.gstNumber || '' });
  };
  const { data: designerCatalog } = useResource(open && designId ? '/api/catalog' : null);
  const { data: packages } = useResource(open && designId ? '/api/packages' : null);
  const { data: designBilling, loading: billingLoading } = useResource(open && designId ? `/api/billing/designs/${designId}` : null);
  const resolvedPricing = fullDesign?.summary?.pricing ?? pricing;
  const resolvedQuote = fullDesign?.data?.quote ?? quote;
  const resolvedTitle = fullDesign?.name ?? proposalTitle;
  const [lines, setLines] = useState([emptyLine()]);
  const [discount, setDiscount] = useState(0);
  const [discountIsPercent, setDiscountIsPercent] = useState(false);
  const [discountRemark, setDiscountRemark] = useState('');
  const [kind, setKind] = useState('plain');
  const [editedTerms, setEditedTerms] = useState(null);
  const [discountActive, setDiscountActive] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !designId) return; // a direct invoice starts empty
    const resolved = resolveProposalPricing({ pricing: resolvedPricing, quote: resolvedQuote, total: contractTotal, title: resolvedTitle });
    const seeded = linesFromPricing(resolved, designerCatalog, packages);
    setLines(seeded.length ? seeded : [emptyLine(resolvedPricing?.gstRate || 18)]);
    setDiscount(resolved.discount ?? resolvedPricing?.discount ?? 0);
    setDiscountIsPercent(Boolean(resolved.discountIsPercent ?? resolvedPricing?.discountIsPercent));
    setDiscountRemark(resolved.discountRemark ?? resolvedPricing?.discountRemark ?? '');
    const proposalTax = resolved.withGst !== false || (resolved.gstTotal ?? 0) > 0.001;
    setKind(proposalTax ? 'tax' : 'plain');
    setError('');
  }, [open, designId, resolvedPricing, resolvedQuote, contractTotal, resolvedTitle, designerCatalog, packages]);

  const seedTerms = designBilling?.previousTermsAndConditions || company?.pdfTerms || '';
  const termsAndConditions = editedTerms ?? seedTerms;
  const taxInvoice = kind === 'tax';
  const money = (v) => formatMoney(v, currency);

  const summary = useMemo(
    () => summarizeLinePricing({ lines, gstIncluded: false, discount, discountIsPercent, withGst: taxInvoice }),
    [lines, discount, discountIsPercent, taxInvoice],
  );
  const differsFromProposal = !direct && Math.abs(summary.total - contractTotal) > 0.02;

  const setLine = (i, patch) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addLine = () => setLines((rows) => [...rows, emptyLine(rows[0]?.gstPercent ?? 18)]);
  const removeLine = (i) => setLines((rows) => (rows.length <= 1 ? [emptyLine()] : rows.filter((_, j) => j !== i)));

  const submit = () => {
    let extra;
    if (direct) {
      const bt = billToV.validate();
      if (!bt) return setError('Check the details of who the invoice is for');
      extra = { billTo: bt, client: clientId || null, title: title.trim() };
    }
    if (!lines.some((l) => l.name?.trim())) return setError('Add at least one line item');
    if (!(summary.total > 0)) return setError('Invoice total must be greater than zero');
    const built = buildPricing({
      lines: lines.filter((l) => l.name?.trim()).map((l) => ({ ...l, rate: roundMoney(l.rate), amount: roundMoney((Number(l.qty) || 0) * (Number(l.rate) || 0)) })),
      gstIncluded: false,
      gstPercent: 18,
      discount,
      discountIsPercent,
      discountRemark,
      withGst: taxInvoice,
      invoiceGstMode: taxInvoice ? 'with_gst' : 'without_gst',
    });
    setError('');
    onSubmit(built, termsAndConditions, extra);
  };

  return (
    <FormModal
      open
      onClose={onClose}
      title={direct ? 'Direct invoice' : 'Invoice'}
      description={direct ? 'An invoice without a proposal: say who it is for, add the products or services, and generate.' : 'Configure invoice items, discounts, and terms. The total will auto-calculate based on your entries.'}
      submitLabel="Generate invoice"
      busy={busy}
      error={error}
      onSubmit={submit}
      size="xl"
    >
      <div className="absolute top-4 right-12">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/80 p-1">
          {INVOICE_KIND.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={`h-8 rounded-md px-3 text-xs font-semibold transition ${kind === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {direct && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Existing client" optional hint="Fills in the details below; leave as is to type a new name." className="sm:col-span-2">
              <Select value={clientId} onValue={pickClient}>
                <option value="">— Not a saved client —</option>
                {(clientList?.items || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
              </Select>
            </FormField>
            <FormField label="Client name" error={billToV.error('name')}><Input maxLength={120} value={billTo.name} onValue={(x) => setBillTo((b) => ({ ...b, name: x }))} placeholder="Who is this invoice for?" /></FormField>
            <FormField label="Phone" optional error={billToV.error('phone')}><PhoneInput maxLength={20} value={billTo.phone} onValue={(x) => setBillTo((b) => ({ ...b, phone: x }))} /></FormField>
            <FormField label="Email" optional error={billToV.error('email')}><Input type="email" maxLength={200} value={billTo.email} onValue={(x) => setBillTo((b) => ({ ...b, email: x }))} /></FormField>
            <FormField label="GSTIN" optional error={billToV.error('gstNumber')}><Input maxLength={15} value={billTo.gstNumber} onValue={(x) => setBillTo((b) => ({ ...b, gstNumber: x.replace(/[^A-Za-z0-9]/g, '').toUpperCase() }))} className="uppercase" placeholder="27ABCDE1234F1Z5" /></FormField>
            <FormField label="Address" optional className="sm:col-span-2" error={billToV.error('address')}><Textarea rows={2} maxLength={400} value={billTo.address} onValue={(x) => setBillTo((b) => ({ ...b, address: x }))} /></FormField>
            <FormField label="Reference / title" optional hint="Printed as the reference on the invoice. Defaults to the client name." className="sm:col-span-2"><Input maxLength={160} value={title} onValue={setTitle} placeholder="e.g. 5 kW rooftop system — supply only" /></FormField>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        {(designBilling?.nextInvoiceNo || nextNo?.nextInvoiceNo) && <span className="text-slate-500">Invoice no. <b className="font-mono text-slate-900">{designBilling?.nextInvoiceNo || nextNo?.nextInvoiceNo}</b></span>}
        {!direct && <span className="text-slate-500">Proposal: <b className="text-slate-900">{money(contractTotal)}</b></span>}
        <span className={differsFromProposal ? 'text-amber-700' : 'text-emerald-700'}>Invoice: <b>{money(summary.total)}</b></span>
        {taxInvoice && summary.gstTotal > 0 && <span className="text-slate-500">(includes {money(summary.gstTotal)} GST)</span>}
        {differsFromProposal && <span className="text-xs text-amber-700">Totals differ — OK for revised invoices.</span>}
      </div>

      <div className="mb-3 border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className="px-3 py-2 text-left font-semibold text-slate-600 w-36">Name</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 flex-1">Details</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600 w-14">HSN</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600 w-18">Qty</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-600 w-18">Unit</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Price</th>
              {taxInvoice && <th className="px-3 py-2 text-center font-semibold text-slate-600 w-16">GST%</th>}
              <th className="px-3 py-2 text-right font-semibold text-slate-600 w-20">Total</th>
              <th className="px-1 py-2 w-4"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 w-36">
                  <input
                    type="text"
                    maxLength={70}
                    value={l.name}
                    onChange={(e) => setLine(i, { name: e.target.value })}
                    placeholder="Product/Service"
                    className="w-full bg-transparent outline-none text-slate-900 text-xs"
                  />
                </td>
                <td className="px-3 py-2 flex-1">
                  <input
                    type="text"
                    maxLength={80}
                    value={l.detail}
                    onChange={(e) => setLine(i, { detail: e.target.value })}
                    placeholder="Details"
                    className="w-full bg-transparent outline-none text-slate-700 text-xs"
                  />
                </td>
                <td className="px-3 py-2 w-14">
                  <input
                    type="text"
                    maxLength={12}
                    value={l.hsn}
                    onChange={(e) => setLine(i, { hsn: e.target.value })}
                    placeholder="-"
                    className="w-full bg-transparent outline-none text-center text-xs"
                  />
                </td>
                <td className="px-3 py-2 w-18">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={l.qty}
                    onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })}
                    className="w-full bg-transparent outline-none text-center text-xs"
                  />
                </td>
                <td className="px-3 py-2 w-18">
                  <input
                    type="text"
                    maxLength={10}
                    value={l.unit}
                    onChange={(e) => setLine(i, { unit: e.target.value })}
                    placeholder="Nos"
                    className="w-full bg-transparent outline-none text-center text-xs"
                  />
                </td>
                <td className="px-3 py-2 w-20">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.rate}
                    onChange={(e) => setLine(i, { rate: roundMoney(Number(e.target.value) || 0) })}
                    className="w-full bg-transparent outline-none text-right text-xs"
                  />
                </td>
                {taxInvoice && (
                  <td className="px-3 py-2 w-16">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={l.gstPercent}
                      onChange={(e) => setLine(i, { gstPercent: Number(e.target.value) || 0 })}
                      className="w-full bg-transparent outline-none text-center text-xs"
                    />
                  </td>
                )}
                <td className="px-3 py-2 w-20 text-right font-semibold text-slate-900 text-xs">
                  {money(summary.lines[i]?.lineTotal ?? (Number(l.qty) || 0) * (Number(l.rate) || 0))}
                </td>
                <td className="px-1 py-2 w-4 text-center">
                  <button
                    type="button"
                    aria-label="Remove line"
                    onClick={() => removeLine(i)}
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5 transition"
                    title="Delete this line"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {discountActive && (
              <tr className="border-b border-slate-100 hover:bg-slate-50 bg-slate-50/50">
                <td className="px-3 py-2 w-36">
                  <span className="text-xs font-semibold text-slate-600">Discount</span>
                </td>
                <td className="px-3 py-2 flex-1">
                  <input
                    type="text"
                    maxLength={80}
                    value={discountRemark}
                    onChange={(e) => setDiscountRemark(e.target.value)}
                    placeholder="Reason (e.g. festival offer, referral)"
                    className="w-full bg-transparent outline-none text-slate-700 text-xs"
                  />
                </td>
                <td colSpan={taxInvoice ? 5 : 4} className="px-3 py-2"></td>
                <td className="px-3 py-2 w-20">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={discount}
                    onChange={(e) => {
                      const val = e.target.value;
                      const num = val === '' ? 0 : Number(val);
                      if (!isNaN(num)) setDiscount(num);
                    }}
                    className="w-full bg-transparent outline-none text-right text-xs font-semibold"
                    placeholder="0"
                  />
                </td>
                <td className="px-3 py-2 w-20 text-right font-semibold text-slate-900 text-xs">
                  -{money(summary.discountAmount)}
                </td>
                <td className="px-1 py-2 w-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscount(0);
                      setDiscountActive(false);
                      setDiscountRemark('');
                    }}
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5 transition"
                    title="Remove discount"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            )}
            <tr className="bg-slate-50 font-semibold text-slate-900 border-t-2 border-slate-300">
              <td colSpan={taxInvoice ? 8 : 7} className="px-3 py-2 text-xs text-right">Subtotal</td>
              <td className="px-3 py-2 w-16 text-right text-xs">{money(summary.subtotal ?? summary.total)}</td>
              <td className="px-3 py-2 w-8"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-9 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Product/Service
        </button>
        <button
          type="button"
          onClick={() => {
            setDiscountActive(true);
            if (discount === 0) setDiscount(100);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 h-9 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {discount > 0 ? 'Edit Discount' : 'Add Discount'}
        </button>
        <select
          value={discountIsPercent ? 'percent' : 'flat'}
          onChange={(e) => setDiscountIsPercent(e.target.value === 'percent')}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <option value="flat">Flat</option>
          <option value="percent">%</option>
        </select>
      </div>


      {discount > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <FormField label="Discount Type">
            <Select value={discountIsPercent ? 'percent' : 'flat'} onValue={(v) => setDiscountIsPercent(v === 'percent')}>
              <option value="flat">Flat amount</option>
              <option value="percent">Percentage (%)</option>
            </Select>
          </FormField>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-200">
        <FormField label="Terms & Conditions" hint="Will appear on the invoice PDF. Use the editor to format text.">
          {/* The editor is seeded once on mount, so wait for the previous-invoice lookup before rendering it */}
          {billingLoading ? (
            <div className="animate-pulse rounded-lg border border-slate-300 bg-slate-50" style={{ minHeight: 182 }} />
          ) : (
            <RichTextEditor
              value={seedTerms}
              onChange={setEditedTerms}
              placeholder="Enter terms and conditions for this invoice..."
              maxLength={3000}
              minHeight={140}
            />
          )}
        </FormField>
      </div>
    </FormModal>
  );
}
