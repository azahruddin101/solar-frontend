'use client';

// One won proposal's money: payments received (each with a receipt), the balance still to pay, and the invoice.
import { ArrowLeft, Download, PenLine, Plus, ReceiptText, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { PAYMENT_MODE_LABEL, generateInvoicePdf, generateReceiptPdf } from '@/lib/billingPdf';
import { buildInvoicePdfBlob } from '@/lib/invoicePdf';
import { openFile } from '@/lib/files';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, ConfirmDialog, EmptyState, FormField, FormModal, Input, LoadingBlock, NumField, Select, Table, Td, Th, Tr, formatDate, showError, toast, RowMenu } from '../kit';
import InvoiceGenerateModal from './InvoiceGenerateModal';
import { DesignStatusBadge, designHref } from './shared';

const today = () => new Date().toISOString().slice(0, 10);

function PaymentForm({ designId, balance, money, onClose, onSaved }) {
  const [form, setForm] = useState({ amount: balance, mode: 'upi', reference: '', receivedOn: today(), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!(form.amount > 0)) return setError('Enter the amount received');
    if (form.amount > balance + 0.001) return setError(`The amount is more than the balance due (${money(balance)})`);
    setBusy(true);
    setError('');
    try {
      onSaved(await api(`/api/billing/designs/${designId}/payments`, { method: 'POST', body: form }));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  const set = (patch) => setForm({ ...form, ...patch });
  const needsRef = form.mode !== 'cash';
  return (
    <FormModal open onClose={onClose} title="Record a payment" description={`Balance due: ${money(balance)}. A receipt is created for every payment.`} submitLabel="Save & create receipt" busy={busy} error={error} onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Amount received"><NumField min={0} step="any" value={form.amount} onValue={(v) => set({ amount: v })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></FormField>
        <FormField label="Payment date"><Input type="date" max={today()} value={form.receivedOn} onValue={(v) => set({ receivedOn: v })} /></FormField>
        <FormField label="Payment mode"><Select value={form.mode} onValue={(v) => set({ mode: v })}>{Object.entries(PAYMENT_MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></FormField>
        <FormField label={form.mode === 'cheque' ? 'Cheque number' : 'Reference / Transaction no.'} optional={!needsRef}><Input maxLength={80} value={form.reference} onValue={(v) => set({ reference: v })} placeholder={form.mode === 'upi' ? 'UPI transaction ID' : form.mode === 'bank_transfer' ? 'UTR / reference number' : ''} /></FormField>
      </div>
      <FormField label="Note" optional><Input maxLength={300} value={form.note} onValue={(v) => set({ note: v })} placeholder="e.g. Advance / 2nd instalment" /></FormField>
    </FormModal>
  );
}

export default function BillingDetail({ designId, basePath = '/dashboard/billing' }) {
  const company = useSession((s) => s.company);
  const params = useSearchParams();
  const { data, loading, error, reload } = useResource(`/api/billing/designs/${designId}`);
  const { data: catalog } = useResource('/api/catalog');
  const { data: packages } = useResource('/api/packages');
  // `?invoice=1` (from the Billing page's client → proposal picker) opens the invoice form as soon as the page is ready
  const [autoOpenUsed, setAutoOpenUsed] = useState(false);
  const [modalState, setModalState] = useState(null);
  const [busy, setBusy] = useState(false);
  const money = (v) => formatMoney(v, company?.currency);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <Alert>{error || 'Not found'}</Alert>;
  const { design, total, paid, balance, payments, invoices = [], invoice } = data;
  const won = design.status === 'won';
  const autoOpen = params.get('invoice') === '1' && !autoOpenUsed && won && total > 0;
  const modal = modalState ?? (autoOpen ? { type: 'invoice' } : null);
  const setModal = (m) => {
    if (autoOpen) setAutoOpenUsed(true);
    setModalState(m);
  };
  const settled = total > 0 && balance <= 0.001;
  const currency = company?.currency || 'INR';

  const downloadReceipt = async (p, i) => {
    try {
      await generateReceiptPdf({ payment: p, proposalName: design.name, total, history: payments.slice(0, i + 1), company, client: design.client, currency });
    } catch (e) {
      console.error(e);
      toast.error('The receipt could not be created. Please try again.');
    }
  };
  const invoicePdfParams = (inv) => ({
    invoice: inv,
    payments,
    company,
    client: design.client,
    currency,
    quote: design.quote,
    proposalPricing: design.pricing,
    catalog,
    packages,
  });

  const downloadInvoice = async (inv) => {
    const row = inv || invoice;
    if (!row) return;
    try {
      if (row.pdfName) {
        await openFile(`/uploads/${row.pdfName}`);
        return;
      }
      await generateInvoicePdf(invoicePdfParams(row));
    } catch (e) {
      console.error(e);
      toast.error('The invoice could not be opened. Please try again.');
    }
  };
  const saved = async (res) => {
    setModal(null);
    toast.success(`Receipt ${res.payment.receiptNo} created`);
    await reload();
    const all = res.payments;
    downloadReceipt(all.find((x) => x.id === res.payment.id) || res.payment, all.findIndex((x) => x.id === res.payment.id));
  };
  const generateInvoice = async (pricing, termsAndConditions) => {
    setBusy(true);
    try {
      const res = await api(`/api/billing/designs/${designId}/invoice`, { method: 'POST', body: { pricing, termsAndConditions } });
      const created = res.createdInvoice || res.invoice;
      const { blob, filename } = await buildInvoicePdfBlob(invoicePdfParams(created));
      const form = new FormData();
      form.append('file', blob, filename);
      await api(`/api/billing/invoices/${created.id}/pdf`, { method: 'POST', form });
      toast.success(`Invoice ${created.invoiceNo} generated and saved`);
      setModal(null);
      await reload();
      downloadBlobLocal(blob, filename);
    } catch (e) {
      showError(e, 'Invoice was not generated');
    }
    setBusy(false);
  };

  const downloadBlobLocal = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const removeLast = async () => {
    setBusy(true);
    try {
      await api(`/api/billing/payments/${modal.item.id}`, { method: 'DELETE' });
      toast.success('Receipt removed');
      setModal(null);
      await reload();
    } catch (e) {
      showError(e, 'Receipt was not removed');
    }
    setBusy(false);
  };

  return (
    <>
      <Link href={basePath} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Billing</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{design.name}</h1>
          <p className="text-sm text-slate-500">{design.client?.name} · <DesignStatusBadge status={design.status} /></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={designHref({ id: designId, type: design.type, summary: design })} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"><PenLine className="h-4 w-4" />Edit proposal</Link>
          {won && total > 0 && <Button variant="secondary" icon={ReceiptText} loading={busy} onClick={() => setModal({ type: 'invoice' })}>Generate invoice</Button>}
          {won && balance > 0 && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'pay' })}>Record payment</Button>}
        </div>
      </div>

      {!won && <Alert tone="warn" className="mb-5">Receipts can be created only after the proposal is marked as <b>Booked</b>. Change its status on the proposal, then come back here.</Alert>}
      {won && !(total > 0) && <Alert tone="warn" className="mb-5">This proposal has no price yet. Open it and add products or a package first.</Alert>}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[['Proposal total', money(total), ''], ['Received', money(paid), ''], ['Balance due', money(balance), settled ? 'text-emerald-700' : 'text-slate-900']].map(([k, v, c]) => (
          <Card key={k} className="p-4"><div className="text-xs font-medium text-slate-500">{k}</div><div className={`mt-1 text-xl font-semibold ${c || 'text-slate-900'}`}>{v}</div></Card>
        ))}
      </div>

      <Card className="mb-5 overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-3 text-sm font-semibold text-slate-900">Receipts</div>
        {!payments.length ? (
          <EmptyState icon={ReceiptText} title="No payments yet" description={won ? 'Record the first payment to create a receipt.' : 'Mark the proposal as Booked to start recording payments.'} />
        ) : (
          <Table>
            <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Mode</Th><Th>Reference</Th><Th className="text-right">Amount</Th><Th className="text-right">Balance after</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {payments.map((p, i) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-slate-900">{p.receiptNo}</Td>
                  <Td>{formatDate(p.receivedOn)}</Td>
                  <Td>{PAYMENT_MODE_LABEL[p.mode]?.split(' (')[0] || p.mode}</Td>
                  <Td>{p.reference || '—'}</Td>
                  <Td className="text-right tabular-nums">{money(p.amount)}</Td>
                  <Td className="text-right tabular-nums">{money(p.balanceAfter)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label="Receipt actions"
                        items={[
                          { key: 'download', icon: Download, label: 'Download receipt', onClick: () => downloadReceipt(p, i) },
                          i === payments.length - 1 && { key: 'remove', icon: Trash2, label: 'Remove receipt', tone: 'danger', onClick: () => setModal({ type: 'remove', item: p }) },
                        ]}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Invoices</div>
            <p className="text-xs text-slate-500">Each generation is saved. Pick plain or tax invoice and edit lines each time.</p>
          </div>
          <Button variant="primary" icon={ReceiptText} disabled={!won || !(total > 0)} loading={busy} onClick={() => setModal({ type: 'invoice' })}>Generate invoice</Button>
        </div>
        {!invoices.length ? (
          <EmptyState icon={ReceiptText} title="No invoices yet" description={won && total > 0 ? 'Generate a plain or tax invoice, edit line items, and apply a discount.' : 'Add a price on the proposal first.'} />
        ) : (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Format</Th><Th className="text-right">Amount</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <Tr key={inv.id}>
                  <Td className="font-medium text-slate-900">{inv.invoiceNo}</Td>
                  <Td>{formatDate(inv.issuedOn)}</Td>
                  <Td>{inv.pricing?.invoiceGstMode === 'without_gst' ? 'Plain' : 'Tax (GST)'}</Td>
                  <Td className="text-right tabular-nums">{money(inv.total)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label="Invoice actions"
                        items={[
                          { key: 'download', icon: Download, label: inv.pdfName ? 'Open PDF' : 'Download PDF', onClick: () => downloadInvoice(inv) },
                        ]}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modal?.type === 'invoice' && (
        <InvoiceGenerateModal
          open
          onClose={() => setModal(null)}
          designId={designId}
          pricing={design.pricing}
          quote={design.quote}
          proposalTitle={design.name}
          contractTotal={total}
          currency={currency}
          busy={busy}
          onSubmit={(p, t) => generateInvoice(p, t)}
        />
      )}
      {modal?.type === 'pay' && <PaymentForm designId={designId} balance={balance} money={money} onClose={() => setModal(null)} onSaved={saved} />}
      <ConfirmDialog open={modal?.type === 'remove'} onClose={() => setModal(null)} onConfirm={removeLast} title="Remove this receipt?" confirmLabel="Remove" busy={busy}>
        Receipt {modal?.item?.receiptNo} of {money(modal?.item?.amount)} will be removed and the balance due goes back up. Its number is not reused.
      </ConfirmDialog>
    </>
  );
}
