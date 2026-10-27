'use client';

// One proposal: system summary, price breakdown, client response (accept / reject / changes), and billing when won.
import { ArrowLeft, Box, CalendarClock, Check, Download, MessageSquare, X } from 'lucide-react';
import PortalAmcPackagesCard from './PortalAmcPackagesCard';
import Link from 'next/link';
import { useState } from 'react';
import { PAYMENT_MODE_LABEL, generateInvoicePdf, generateReceiptPdf } from '@/lib/billingPdf';
import { invoiceTax } from '@/lib/pricing';
import { formatMoney } from '@/lib/energy';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, FormField, IconButton, LoadingBlock, Modal, RichTextContent, Table, Td, Textarea, Th, Tr, buttonClass, formatDate, toast } from '../kit';
import { DesignStatusBadge } from '../dashboard/shared';

const RESPONSE_COPY = {
  accepted: {
    title: 'Accept this proposal',
    description: 'Tell your provider why you are accepting — for example timing, budget confirmation, or next steps you expect.',
    label: 'Why are you accepting?',
    submit: 'Confirm acceptance',
    success: 'Thank you — your acceptance has been recorded.',
  },
  rejected: {
    title: 'Decline this proposal',
    description: 'Share why this proposal does not work for you so they can improve or close the file.',
    label: 'Why are you declining?',
    submit: 'Confirm decline',
    success: 'Your response has been recorded.',
  },
  changes_requested: {
    title: 'Request changes',
    description: 'Describe what you would like changed in the proposal, pricing, or scope.',
    label: 'What changes would you like?',
    submit: 'Send change request',
    success: 'Your change request has been sent.',
  },
};

const RESPONSE_BADGE = {
  accepted: { label: 'You accepted', tone: 'green' },
  rejected: { label: 'You declined', tone: 'red' },
  changes_requested: { label: 'Changes requested', tone: 'amber' },
};

export default function PortalProposal({ id }) {
  const company = useSession((s) => s.company);
  const { data, loading, error, setData } = useResource(`/api/portal/proposals/${id}`);
  const [responseModal, setResponseModal] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [amcSavingPackage, setAmcSavingPackage] = useState(null);

  const money = (v) => formatMoney(v, company?.currency, { decimals: 2 });
  if (loading) return <LoadingBlock />;
  if (error || !data) return <Alert>{error || 'Not found'}</Alert>;

  const { proposal: p, client, total, paid, balance, payments, invoice, amc, amcPackages } = data;
  const currency = company?.currency || 'INR';
  const pricing = p.pricing;
  const tax = pricing ? invoiceTax(pricing, total) : null;
  const won = p.status === 'won';
  const response = p.clientResponse;
  const reviewInvite = p.reviewInvite;
  const canRespond = p.canRespond;

  const openResponse = (decision) => {
    setNote('');
    setResponseModal(decision);
  };

  const closeResponse = () => {
    if (submitting) return;
    setResponseModal(null);
    setNote('');
  };

  const submitResponse = async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      toast.error('Please add a note before continuing.');
      return;
    }
    setSubmitting(true);
    try {
      const next = await api(`/api/portal/proposals/${id}/response`, {
        method: 'POST',
        body: { decision: responseModal, note: trimmed },
      });
      setData(next);
      toast.success(RESPONSE_COPY[responseModal].success);
      closeResponse();
    } catch (e) {
      toast.error(e.message);
    }
    setSubmitting(false);
  };

  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast.error('The document could not be created. Please try again.');
    }
  };

  const modalCopy = responseModal ? RESPONSE_COPY[responseModal] : null;
  const amcPriceLabel = (price) => (Number(price) > 0 ? money(price) : 'Free');
  const hasAmcCatalog = Boolean(amcPackages?.hasCatalog);

  const submitAmcRequest = async (packageName, requestedDate, note, requestId) => {
    setAmcSavingPackage(packageName);
    try {
      const next = await api(`/api/portal/proposals/${id}/amc-requests`, {
        method: 'POST',
        body: { packageName, requestedDate, note, requestId },
      });
      setData(next);
      toast.success(requestId ? 'Request updated' : 'AMC visit requested');
    } catch (e) {
      toast.error(e.message);
    }
    setAmcSavingPackage(null);
  };

  return (
    <>
      <Link href="/portal" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />My proposals</Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900">{p.name}</h1>
        <DesignStatusBadge status={p.status} />
        {response?.decision && (
          <Badge tone={RESPONSE_BADGE[response.decision]?.tone || 'slate'}>{RESPONSE_BADGE[response.decision]?.label || response.decision}</Badge>
        )}
        {p.type !== 'quick' && p.summary?.panels > 0 && <Link href={`/view/${p.id}`} className={buttonClass({ variant: 'primary', size: 'sm', className: 'ml-auto' })}><Box className="mr-1.5 h-4 w-4" />View 3D proposal</Link>}
      </div>

      {canRespond && (
        <Card className={`mb-5 p-5 ${reviewInvite ? 'border-brand/25 bg-brand/5' : 'border-brand/20 bg-brand/5'}`}>
          <h2 className="text-sm font-semibold text-slate-900">
            {reviewInvite ? 'Updated proposal — please review' : 'This proposal is waiting for your decision'}
          </h2>
          {reviewInvite?.message && (
            <p className="mt-2 rounded-lg border border-white/80 bg-white/60 px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap">{reviewInvite.message}</p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            {reviewInvite
              ? 'Review the details below, then accept, decline, or ask for further changes. Please include a note with your response.'
              : 'Review the details below, then accept, decline, or ask for changes. You will be asked for a short note either way.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" icon={Check} onClick={() => openResponse('accepted')}>Accept proposal</Button>
            <Button variant="secondary" icon={MessageSquare} onClick={() => openResponse('changes_requested')}>Ask for changes</Button>
            <Button variant="ghost" icon={X} className="text-red-700 hover:bg-red-50" onClick={() => openResponse('rejected')}>Decline</Button>
          </div>
        </Card>
      )}

      {response?.decision === 'changes_requested' && p.status === 'proposed' && (
        <Alert className="mb-5">
          <span className="font-medium">Change request sent.</span> {company?.name || 'Your provider'} will update the proposal and notify you. Your note: “{response.note}”
        </Alert>
      )}

      {response && response.decision !== 'changes_requested' && (
        <Card className="mb-5 p-4">
          <div className="text-xs font-medium text-slate-500">Your note{response.respondedAt ? ` · ${formatDate(response.respondedAt)}` : ''}</div>
          <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{response.note}</p>
        </Card>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[['System size', p.summary?.kwp ? `${p.summary.kwp.toFixed(2)} kWp` : '—'], ['Solar panels', p.summary?.panels || '—'], ['Expected energy', p.summary?.annualKwh ? `${p.summary.annualKwh.toLocaleString('en-IN')} kWh / year` : '—'], ['Total price', total ? money(total) : '—']].map(([k, v]) => (
          <Card key={k} className="p-4"><div className="text-xs font-medium text-slate-500">{k}</div><div className="mt-1 text-lg font-semibold text-slate-900">{v}</div></Card>
        ))}
      </div>
      {p.summary?.address && <p className="mb-5 text-sm text-slate-500">Site: {p.summary.address}</p>}

      {hasAmcCatalog && (
        <PortalAmcPackagesCard
          id="maintenance"
          amcPackages={amcPackages}
          amcPriceLabel={amcPriceLabel}
          savingPackage={amcSavingPackage}
          onSubmitRequest={submitAmcRequest}
        />
      )}

      <Card className="mb-5 overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-3 text-sm font-semibold text-slate-900">Price breakdown</div>
        {!pricing?.lines?.length ? (
          <p className="px-6 py-5 text-sm text-slate-500">{total ? `Total price: ${money(total)}. The itemised breakdown is not available yet.` : 'The price has not been set yet.'}</p>
        ) : (
          <Table>
            <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {pricing.lines.map((l, i) => (
                <Tr key={i}>
                  <Td><div className="font-medium text-slate-900">{l.name}</div>{l.detail && <div className="max-w-xl text-xs text-slate-500">{l.detail}</div>}</Td>
                  <Td className="text-right tabular-nums">{l.qty}{l.unit ? ` ${l.unit}` : ''}</Td>
                  <Td className="text-right tabular-nums">{money(l.rate)}</Td>
                  <Td className="text-right tabular-nums">{money(l.amount)}</Td>
                </Tr>
              ))}
              {tax?.rate > 0 && [['Taxable value', tax.taxable], [`CGST @ ${tax.rate / 2}%`, tax.cgst], [`SGST @ ${tax.rate / 2}%`, tax.sgst]].map(([k, v]) => (
                <Tr key={k}><Td className="text-slate-600" colSpan={3}>{k}</Td><Td className="text-right tabular-nums">{money(v)}</Td></Tr>
              ))}
              <Tr><Td className="font-semibold text-slate-900" colSpan={3}>Total{pricing.withGst !== false && tax?.gst ? ' (incl. GST)' : ''}</Td><Td className="text-right font-semibold tabular-nums text-slate-900">{money(total)}</Td></Tr>
            </tbody>
          </Table>
        )}
      </Card>

      {won && (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            {[['Proposal total', money(total)], ['Paid', money(paid)], ['Balance due', money(balance)]].map(([k, v]) => (
              <Card key={k} className="p-4"><div className="text-xs font-medium text-slate-500">{k}</div><div className="mt-1 text-lg font-semibold text-slate-900">{v}</div></Card>
            ))}
          </div>
          <Card className="mb-5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3"><span className="text-sm font-semibold text-slate-900">Payments & receipts</span>{invoice && <button type="button" onClick={() => run(() => generateInvoicePdf({ invoice, payments, company, client, currency }))} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"><Download className="h-4 w-4" />Invoice {invoice.invoiceNo}</button>}</div>
            {!payments.length ? <p className="px-6 py-5 text-sm text-slate-500">No payments recorded yet.</p> : (
              <Table>
                <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Mode</Th><Th>Reference</Th><Th className="text-right">Amount</Th><Th className="text-right">Receipt</Th></tr></thead>
                <tbody>
                  {payments.map((x, i) => (
                    <Tr key={x.id}>
                      <Td className="font-medium text-slate-900">{x.receiptNo}</Td>
                      <Td>{formatDate(x.receivedOn)}</Td>
                      <Td>{PAYMENT_MODE_LABEL[x.mode]?.split(' (')[0] || x.mode}</Td>
                      <Td>{x.reference || '—'}</Td>
                      <Td className="text-right tabular-nums">{money(x.amount)}</Td>
                      <Td className="text-right"><IconButton icon={Download} label="Download receipt" onClick={() => run(() => generateReceiptPdf({ payment: x, proposalName: p.name, total, history: payments.slice(0, i + 1), company, client, currency }))} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          {amc?.visits?.length > 0 && (
            <Card className="mb-5 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-3">
                <CalendarClock className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-900">AMC maintenance schedule</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {amc.visits.map((v) => (
                  <li key={v.id} className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{v.name}</span>
                      <Badge tone={v.kind === 'optional' ? 'brand' : 'slate'}>{v.kind === 'optional' ? 'Optional' : 'Mandatory'}</Badge>
                      <span className="text-xs font-medium text-slate-600">{amcPriceLabel(v.price)}</span>
                      <Badge tone={v.status === 'completed' ? 'green' : 'slate'}>
                        {v.status === 'completed' ? 'Completed' : (v.dueDate ? `Due ${formatDate(v.dueDate)}` : 'Unscheduled')}
                      </Badge>
                    </div>
                    <RichTextContent html={v.description} className="mt-1" />
                    {v.criteria?.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm text-slate-700">
                        {v.criteria.map((c) => (
                          <li key={c.id} className="flex gap-2">
                            <span className={c.checked ? 'text-emerald-600' : 'text-slate-400'}>{c.checked ? '✓' : '○'}</span>
                            <span>{c.label}{c.note ? ` — ${c.note}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {v.status === 'completed' && v.completedAt && (
                      <p className="mt-2 text-xs text-slate-500">Completed {formatDate(v.completedAt)}{v.completionNote ? ` · ${v.completionNote}` : ''}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      {!canRespond && !won && (
        <p className="text-xs text-slate-500">Questions about this proposal? Contact {company?.name}{company?.phone ? ` on ${company.phone}` : ''}.</p>
      )}

      <Modal
        open={Boolean(responseModal)}
        onClose={closeResponse}
        title={modalCopy?.title}
        description={modalCopy?.description}
        footer={(
          <>
            <Button variant="ghost" onClick={closeResponse} disabled={submitting}>Cancel</Button>
            <Button variant="primary" loading={submitting} onClick={submitResponse}>{modalCopy?.submit}</Button>
          </>
        )}
      >
        <FormField label={modalCopy?.label} htmlFor="proposal-response-note">
          <Textarea id="proposal-response-note" rows={4} value={note} onValue={setNote} placeholder="Write your note here…" maxLength={2000} />
        </FormField>
      </Modal>
    </>
  );
}
