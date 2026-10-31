'use client';

// One party's money — a won proposal's, or a client's with no proposal — in the order the sale chain runs:
// e-way bills (goods out of stock) → bills (paid) → invoices (settling the bills). Every document is generated from here.
import { ArrowLeft, Ban, Download, Eye, PenLine, ReceiptText, Save, Truck, Undo2, Wallet } from 'lucide-react';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdf';
import { buildInvoicePdfBlob, downloadBlob } from '@/lib/invoicePdf';
import { buildEwayBillPdfBlob } from '@/lib/ewayBillPdf';
import { buildBillPdfBlob } from '@/lib/billPdf';
import { buildCreditNotePdfBlob } from '@/lib/creditNotePdf';
import { downloadBillDocument, downloadCreditNoteDocument, downloadEwayBillDocument, downloadInvoiceDocument, viewBillDocument, viewCreditNoteDocument, viewEwayBillDocument, viewInvoiceDocument } from '@/lib/billingDocuments';
import { shareBillOnWhatsApp, shareInvoiceOnWhatsApp } from '@/lib/billingWhatsApp';
import { formatMoney } from '@/lib/energy';
import { BILL_STATUS, EWAY_STATUS } from '@/lib/saleChain';
import { useCan } from '@/lib/useCan';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, EmptyState, IconButton, LoadingBlock, Table, Td, Th, Tr, capName, cx, formatDate, showError, toast } from '../kit';
import EwayBillModal, { CancelEwayBillDialog } from './EwayBillModal';
import VoidDocumentDialog from './VoidDocumentDialog';
import ReturnGoodsModal from './ReturnGoodsModal';
import BillModal from './BillModal';
import InvoiceFromBillsModal from './InvoiceFromBillsModal';
import { DesignStatusBadge, designHref } from './shared';
import { useBreadcrumb } from '@/lib/breadcrumbs';

/** One colour per step of the chain, so the sections read in order. */
const TONE = {
  eway: { band: 'bg-sky-50/80 border-sky-100', chip: 'bg-sky-600 text-white', title: 'text-sky-950' },
  bills: { band: 'bg-violet-50/80 border-violet-100', chip: 'bg-violet-600 text-white', title: 'text-violet-950' },
  invoices: { band: 'bg-indigo-50/80 border-indigo-100', chip: 'bg-indigo-600 text-white', title: 'text-indigo-950' },
};

function Section({ tone, icon: Icon, title, sub, action, children }) {
  const t = TONE[tone];
  return (
    <Card className="mb-5 overflow-hidden">
      <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3', t.band)}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg shadow-sm', t.chip)}><Icon className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className={cx('text-sm font-semibold', t.title)}>{title}</div>
            {sub && <p className="text-xs text-slate-600">{sub}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

const upload = async (path, blob, filename) => {
  const form = new FormData();
  form.append('file', blob, filename);
  await api(path, { method: 'POST', form });
};

/** Archive a PDF; one retry after a short pause, because a dropped connection is the usual reason it fails. */
const uploadWithRetry = async (path, blob, filename) => {
  try {
    await upload(path, blob, filename);
  } catch (first) {
    if (first?.status === 409) return; // already archived: nothing more to do
    await new Promise((resolve) => setTimeout(resolve, 800));
    await upload(path, blob, filename);
  }
};

/** A random key for one create request: repeating the request with it returns the first result, never a second document. */
const newRequestKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** Either `designId` (a won proposal) or `clientId` (a client with no proposal). */
export default function BillingDetail({ designId, clientId, basePath = '/dashboard/billing' }) {
  const company = useSession((s) => s.company);
  const may = useCan();
  const canEway = may('finances', 'create_eway_bill');
  const canBill = may('finances', 'create_bill');
  const canInvoice = may('finances', 'create_invoice');
  const isOwner = useSession((s) => s.user)?.role === 'company'; // voiding is the owner's alone
  const params = useSearchParams();
  const { data, loading, error, reload } = useResource(designId ? `/api/billing/designs/${designId}` : `/api/billing/clients/${clientId}`);
  useBreadcrumb(capName(data?.design?.name || data?.client?.name));
  const { data: catalog } = useResource(designId ? '/api/catalog' : null);
  const { data: packages } = useResource(designId ? '/api/packages' : null);
  // `?eway=1`, `?bill=1`, `?invoice=1` (from the Billing page's picker) open that form as soon as the page is ready
  const [autoUsed, setAutoUsed] = useState(false);
  const [modalState, setModalState] = useState(null);
  const [busy, setBusy] = useState(false);
  const requestKeys = useRef({}); // one key per kind of document, kept until that document is created
  const money = (v) => formatMoney(v, company?.currency);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <Alert>{error || 'Not found'}</Alert>;
  const { design = null, total, paid, balance, invoices = [], ewayBills = [], bills = [], creditNotes = [], openEwayBills = 0, uninvoicedBills = 0 } = data;
  const client = design ? design.client : data.client;
  const party = design ? { design: designId } : { client: clientId };
  const partyName = design ? design.name : client?.name;
  const won = design ? design.status === 'won' : true;
  const auto = ['eway', 'bill', 'invoice'].find((k) => params.get(k) === '1');
  const autoAllowed = auto && !autoUsed && won && ({ eway: canEway, bill: canBill, invoice: canInvoice && uninvoicedBills > 0 })[auto];
  const modal = modalState ?? (autoAllowed ? { type: auto } : null);
  const setModal = (m) => {
    if (auto) setAutoUsed(true);
    setModalState(m);
  };
  const settled = total > 0 && balance <= 0.001;
  const currency = company?.currency || 'INR';

  /* ── PDFs ── */
  const invoicePdfParams = (inv) => ({ invoice: inv, pdfName: inv?.pdfName, company, client: inv.billTo || client, currency, quote: design?.quote, proposalPricing: design?.pricing, catalog, packages });
  const ewayPdfParams = (e) => ({ ewayBill: e, pdfName: e.pdfName, company, client, currency });
  const billPdfParams = (b) => ({ bill: b, pdfName: b.pdfName, company, client, currency });
  const creditPdfParams = (c) => ({ note: c, pdfName: c.pdfName, company, client, currency });
  const attempt = async (fn, failed) => {
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast.error(failed);
    }
  };
  const shareBill = async (b) => {
    if (!client?.phone) return toast.error('Add a mobile number on the client profile to share on WhatsApp.');
    try {
      const pdfName = await shareBillOnWhatsApp(billPdfParams(b));
      if (pdfName && !b.pdfName) await reload();
    } catch (e) {
      showError(e, 'Could not share on WhatsApp');
    }
  };
  const shareInvoice = async (inv) => {
    if (!client?.phone) return toast.error('Add a mobile number on the client profile to share on WhatsApp.');
    try {
      const pdfName = await shareInvoiceOnWhatsApp({ ...invoicePdfParams(inv), invoice: inv });
      if (pdfName && !inv.pdfName) await reload();
    } catch (e) {
      showError(e, 'Could not share on WhatsApp');
    }
  };

  /* ── generating ── */
  // A document exists as soon as the create call returns (stock taken, payment recorded). Building and archiving its PDF
  // comes after and can fail on its own: that must never look like "not generated", or the user submits the sale again.
  // The request key makes even a repeated submit return the first document.
  const issueDocument = async ({ kind, path, body, failed, docOf, build, uploadPath, saved, label }) => {
    setBusy(true);
    let created;
    try {
      requestKeys.current[kind] ??= newRequestKey();
      created = await api(path, { method: 'POST', body: { ...body, idempotencyKey: requestKeys.current[kind] } });
    } catch (e) {
      showError(e, failed(e));
      setBusy(false);
      return;
    }
    delete requestKeys.current[kind];
    const doc = docOf(created);
    let file = null;
    let archived = false;
    try {
      file = await build(doc);
      await uploadWithRetry(uploadPath(doc), file.blob, file.filename);
      archived = true;
    } catch (e) {
      console.error(e);
    }
    setModal(null);
    await reload();
    if (archived) toast.success(saved(created));
    else toast.error(`${label(doc)} was generated, but its PDF could not be saved. Do not generate it again: use “Save PDF” in its row menu.`);
    if (file) downloadBlob(file.blob, file.filename);
    setBusy(false);
  };
  const generateEway = (body) => issueDocument({
    kind: 'eway',
    path: '/api/billing/eway-bills',
    body,
    failed: (e) => (e?.status === 409 ? 'Stock not available' : 'E-way bill was not generated'), // 409: not enough stock, or a unit was just sold
    docOf: (created) => created,
    build: (created) => buildEwayBillPdfBlob({ ewayBill: created, company, client, currency }),
    uploadPath: (created) => `/api/billing/eway-bills/${created.id}/pdf`,
    saved: (created) => `E-way bill ${created.ewayNo} generated — stock updated`,
    label: (created) => `E-way bill ${created.ewayNo}`,
  });
  const generateBill = (body) => issueDocument({
    kind: 'bill',
    path: '/api/billing/bills',
    body,
    failed: () => 'Bill was not generated',
    docOf: ({ bill }) => bill,
    build: (bill) => buildBillPdfBlob({ bill, company, client, currency }),
    uploadPath: (bill) => `/api/billing/bills/${bill.id}/pdf`,
    saved: ({ bill, payment }) => `Bill ${bill.billNo} generated · ${money(payment.amount)} received`,
    label: (bill) => `Bill ${bill.billNo}`,
  });
  const generateInvoice = (body) => issueDocument({
    kind: 'invoice',
    path: '/api/billing/invoices/from-bills',
    body,
    failed: () => 'Invoice was not generated',
    docOf: ({ createdInvoice }) => createdInvoice,
    build: (created) => buildInvoicePdfBlob(invoicePdfParams(created)),
    uploadPath: (created) => `/api/billing/invoices/${created.id}/pdf`,
    saved: ({ createdInvoice }) => `Invoice ${createdInvoice.invoiceNo} generated and saved`,
    label: (created) => `Invoice ${created.invoiceNo}`,
  });
  /** Goods back on a paid bill (owner only): a credit note, its PDF, and the stock and refund done by the server. */
  const generateCreditNote = (body) => issueDocument({
    kind: `credit-${modal.item.id}`,
    path: `/api/billing/bills/${modal.item.id}/credit-notes`,
    body,
    failed: (e) => (e?.status === 409 ? e.message : 'The credit note was not made'),
    docOf: (created) => created,
    build: (created) => buildCreditNotePdfBlob({ note: created, billNo: modal.item.billNo, company, client, currency }),
    uploadPath: (created) => `/api/billing/credit-notes/${created.id}/pdf`,
    saved: (created) => `Credit note ${created.creditNo} made · ${money(created.total)} refunded, goods back in stock`,
    label: (created) => `Credit note ${created.creditNo}`,
  });
  /** Build and archive the PDF of a document that was generated without one (its upload failed). */
  const savePdf = (kind, row) => attempt(async () => {
    const built = {
      eway: () => buildEwayBillPdfBlob(ewayPdfParams(row)),
      bill: () => buildBillPdfBlob(billPdfParams(row)),
      invoice: () => buildInvoicePdfBlob(invoicePdfParams(row)),
      credit: () => buildCreditNotePdfBlob(creditPdfParams(row)),
    }[kind];
    const path = { eway: 'eway-bills', bill: 'bills', invoice: 'invoices', credit: 'credit-notes' }[kind];
    const { blob, filename } = await built();
    await uploadWithRetry(`/api/billing/${path}/${row.id}/pdf`, blob, filename);
    toast.success('PDF saved');
    await reload();
  }, 'The PDF could not be saved. Try again.');
  const cancelEway = async (reason) => {
    setBusy(true);
    try {
      await api(`/api/billing/eway-bills/${modal.item.id}/cancel`, { method: 'POST', body: { reason } });
      toast.success(`E-way bill ${modal.item.ewayNo} cancelled — stock is back`);
      setModal(null);
      await reload();
    } catch (e) {
      showError(e, 'E-way bill was not cancelled');
    }
    setBusy(false);
  };
  /** Void a bill or an invoice (owner only): it stays as the record, its payment or bills are released. */
  const voidDocument = async (body) => {
    const { kind, item } = modal;
    setBusy(true);
    try {
      await api(`/api/billing/${kind === 'bill' ? 'bills' : 'invoices'}/${item.id}/void`, { method: 'POST', body });
      toast.success(kind === 'bill' ? `Bill ${item.billNo} voided` : `Invoice ${item.invoiceNo} voided`);
      setModal(null);
      await reload();
    } catch (e) {
      showError(e, `${kind === 'bill' ? 'Bill' : 'Invoice'} was not voided`);
    }
    setBusy(false);
  };
  const proposalDiscount = design?.pricing?.discount > 0 ? { discount: design.pricing.discount, discountIsPercent: design.pricing.discountIsPercent, discountRemark: design.pricing.discountRemark } : null;
  const steps = [
    { key: 'eway', label: 'E-way bills', n: ewayBills.filter((e) => e.status !== 'cancelled').length, note: openEwayBills ? `${openEwayBills} open` : '' },
    { key: 'bills', label: 'Bills', n: bills.length, note: uninvoicedBills ? `${uninvoicedBills} to invoice` : '' },
    { key: 'invoices', label: 'Invoices', n: invoices.length, note: '' },
  ];

  return (
    <>
      <Link href={basePath} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Billing</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{partyName}</h1>
          <p className="text-sm text-slate-500">{design ? <>{client?.name} · <DesignStatusBadge status={design.status} /></> : <>{[client?.phone, client?.gstNumber && `GSTIN ${client.gstNumber}`].filter(Boolean).join(' · ') || 'Client'} · <Badge tone="slate">No proposal</Badge></>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {design && may('proposals', 'view') && <Link href={designHref({ id: designId, type: design.type, summary: design })} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"><PenLine className="h-4 w-4" />{may('proposals', 'update') ? 'Edit proposal' : 'Open proposal'}</Link>}
          {!design && may('clients', 'view') && <Link href={`${basePath.replace(/\/billing$/, '')}/clients/${clientId}`} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"><PenLine className="h-4 w-4" />Open client</Link>}
          {canEway && won && <Button variant="secondary" icon={Truck} onClick={() => setModal({ type: 'eway' })}>E-way bill</Button>}
          {canBill && won && <Button variant="secondary" icon={Wallet} onClick={() => setModal({ type: 'bill' })} title={openEwayBills ? `${openEwayBills} open e-way bill${openEwayBills === 1 ? '' : 's'}` : 'No open e-way bill: a bill for services only'}>Bill{openEwayBills ? ` (${openEwayBills})` : ''}</Button>}
          {canInvoice && won && <Button variant="primary" icon={ReceiptText} disabled={!uninvoicedBills} title={uninvoicedBills ? `${uninvoicedBills} paid bill${uninvoicedBills === 1 ? '' : 's'} to invoice` : 'Generate a bill first'} onClick={() => setModal({ type: 'invoice' })}>Invoice{uninvoicedBills ? ` (${uninvoicedBills})` : ''}</Button>}
        </div>
      </div>

      {!won && <Alert tone="warn" className="mb-5">E-way bills, bills and invoices can be created only after the proposal is marked as <b>Booked</b>. Change its status on the proposal, then come back here.</Alert>}

      <div className={`mb-5 grid gap-3 ${design ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
        {(design
          ? [['Proposal total', money(total), ''], ['Billed & received', money(paid), ''], balance < -0.005 ? ['Billed above quote', money(-balance), 'text-slate-900'] : ['Yet to bill', money(balance), settled ? 'text-emerald-700' : 'text-slate-900']]
          : [['Billed & received', money(paid), '']]
        ).map(([k, v, c]) => (
          <Card key={k} className="p-4"><div className="text-xs font-medium text-slate-500">{k}</div><div className={`mt-1 text-xl font-semibold ${c || 'text-slate-900'}`}>{v}</div></Card>
        ))}
      </div>

      <ol className="mb-5 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key} className={cx('flex items-center gap-3 rounded-xl border px-4 py-2.5', TONE[s.key].band)}>
            <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', TONE[s.key].chip)}>{i + 1}</span>
            <span className="min-w-0"><span className={cx('block text-sm font-semibold', TONE[s.key].title)}>{s.label} <span className="font-normal text-slate-500">· {s.n}</span></span>{s.note && <span className="block text-xs text-slate-600">{s.note}</span>}</span>
          </li>
        ))}
      </ol>

      <Section tone="eway" icon={Truck} title="E-way bills" sub="Goods that left stock for this job. An open e-way bill waits for a bill; cancelling one puts the goods back.">
        {!ewayBills.length ? (
          <EmptyState icon={Truck} title="No e-way bills yet" description={won ? 'Generate an e-way bill to send goods out of stock.' : 'Mark the proposal as Booked first.'} />
        ) : (
          <Table>
            <thead><tr><Th>E-way bill</Th><Th>Date</Th><Th>Goods</Th><Th>Transport</Th><Th className="text-right">Value</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {ewayBills.map((e) => (
                <Tr key={e.id} className={e.status === 'cancelled' ? 'opacity-60' : ''}>
                  <Td className="font-medium text-slate-900">{e.ewayNo}{e.govtEwayNo && <div className="text-xs font-normal text-slate-500">EWB {e.govtEwayNo}</div>}</Td>
                  <Td>{formatDate(e.issuedOn)}</Td>
                  <Td><div className="max-w-[260px] truncate" title={(e.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', ')}>{(e.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', ')}</div></Td>
                  <Td>{e.transport?.vehicleNo || e.transport?.transporter || '—'}</Td>
                  <Td className="text-right tabular-nums">{money(e.total)}</Td>
                  <Td><Badge tone={EWAY_STATUS[e.status]?.tone}>{EWAY_STATUS[e.status]?.label || e.status}{e.bill?.billNo ? ` · ${e.bill.billNo}` : ''}</Badge></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View PDF" className="text-slate-500" onClick={() => attempt(() => viewEwayBillDocument(ewayPdfParams(e)), 'The e-way bill could not be opened.')} />
                      <IconButton icon={Download} label="Download PDF" className="text-slate-500" onClick={() => attempt(() => downloadEwayBillDocument(ewayPdfParams(e)), 'The e-way bill could not be downloaded.')} />
                      {canEway && !e.pdfName && e.status !== 'cancelled' && <IconButton icon={Save} label="Save PDF (not saved yet)" className="text-slate-500" onClick={() => savePdf('eway', e)} />}
                      {canEway && e.status === 'open' && <IconButton icon={Ban} tone="danger" label="Cancel (stock goes back)" className="text-red-500" onClick={() => setModal({ type: 'cancelEway', item: e })} />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section tone="bills" icon={Wallet} title="Bills" sub="Each bill covers one or more e-way bills plus services and records the payment taken for them. Paid bills wait for the invoice.">
        {!bills.length ? (
          <EmptyState icon={Wallet} title="No bills yet" description={openEwayBills ? `${openEwayBills} open e-way bill${openEwayBills === 1 ? '' : 's'} can be billed.` : 'Generate an e-way bill, then bill it.'} />
        ) : (
          <Table>
            <thead><tr><Th>Bill</Th><Th>Date</Th><Th>Covers</Th><Th>Paid by</Th><Th className="text-right">Total</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {bills.map((b) => (
                <Tr key={b.id} className={b.status === 'void' ? 'opacity-60' : ''}>
                  <Td className="font-medium text-slate-900">{b.billNo}{b.status === 'void' && b.voidReason && <div className="max-w-[180px] truncate text-xs font-normal text-slate-500" title={b.voidReason}>{b.voidReason}</div>}</Td>
                  <Td>{formatDate(b.issuedOn)}</Td>
                  <Td>
                    {b.ewayBills?.length ? b.ewayBills.map((e) => e.ewayNo).join(', ') : <span className="text-slate-500">Services only</span>}
                    {b.services?.length > 0 && <div className="max-w-[240px] truncate text-xs text-slate-500" title={b.services.map((s) => s.name).join(', ')}>{b.services.map((s) => s.name).join(', ')}</div>}
                  </Td>
                  <Td>{PAYMENT_MODE_LABEL[b.paid?.mode]?.split(' (')[0] || b.paid?.mode}{b.paid?.reference && <div className="max-w-[140px] truncate text-xs text-slate-500">{b.paid.reference}</div>}</Td>
                  <Td className="text-right tabular-nums">{money(b.total)}</Td>
                  <Td><Badge tone={BILL_STATUS[b.status]?.tone}>{BILL_STATUS[b.status]?.label || b.status}{b.invoice?.invoiceNo ? ` · ${b.invoice.invoiceNo}` : ''}</Badge></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View PDF" className="text-slate-500" onClick={() => attempt(() => viewBillDocument(billPdfParams(b)), 'The bill could not be opened.')} />
                      <IconButton icon={Download} label="Download PDF" className="text-slate-500" onClick={() => attempt(() => downloadBillDocument(billPdfParams(b)), 'The bill could not be downloaded.')} />
                      {canBill && !b.pdfName && <IconButton icon={Save} label="Save PDF (not saved yet)" className="text-slate-500" onClick={() => savePdf('bill', b)} />}
                      {b.status !== 'void' && (b.pdfName || canBill) && <IconButton icon={WhatsAppIcon} label="Share on WhatsApp" className="text-slate-500" onClick={() => shareBill(b)} />}
                      {isOwner && b.status !== 'void' && b.ewayBills?.length > 0 && <IconButton icon={Undo2} label="Return goods… (credit note)" className="text-slate-500" onClick={() => setModal({ type: 'return', item: b })} />}
                      {isOwner && b.status === 'paid' && !(b.creditedTotal > 0) && <IconButton icon={Ban} tone="danger" label="Void bill…" className="text-red-500" onClick={() => setModal({ type: 'void', kind: 'bill', item: b })} />}
                      {isOwner && b.status === 'invoiced' && <IconButton icon={Ban} label="On an invoice: void the invoice first" disabled className="cursor-not-allowed text-slate-300 hover:bg-transparent hover:text-slate-300" />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {creditNotes.length > 0 && (
        <Section tone="bills" icon={Undo2} title="Credit notes" sub="Goods that came back on a paid bill. Each one put its goods back into stock and refunded the amount shown; the bill itself stands.">
          <Table>
            <thead><tr><Th>Credit note</Th><Th>Date</Th><Th>Against</Th><Th>Goods returned</Th><Th>Reason</Th><Th className="text-right">Refunded</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {creditNotes.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-slate-900">{c.creditNo}</Td>
                  <Td>{formatDate(c.issuedOn)}</Td>
                  <Td>{c.bill?.billNo || '—'}</Td>
                  <Td><div className="max-w-[260px] truncate text-slate-700" title={(c.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', ')}>{(c.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', ')}</div></Td>
                  <Td><div className="max-w-[200px] truncate text-slate-600" title={c.reason}>{c.reason}</div></Td>
                  <Td className="text-right tabular-nums">{money(c.total)}<div className="text-xs text-slate-500">{PAYMENT_MODE_LABEL[c.refund?.mode]?.split(' (')[0] || c.refund?.mode}</div></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View PDF" className="text-slate-500" onClick={() => attempt(() => viewCreditNoteDocument(creditPdfParams(c)), 'The credit note could not be opened.')} />
                      <IconButton icon={Download} label="Download PDF" className="text-slate-500" onClick={() => attempt(() => downloadCreditNoteDocument(creditPdfParams(c)), 'The credit note could not be downloaded.')} />
                      {isOwner && !c.pdfName && <IconButton icon={Save} label="Save PDF (not saved yet)" className="text-slate-500" onClick={() => savePdf('credit', c)} />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}

      <Section tone="invoices" icon={ReceiptText} title="Invoices" sub="Each invoice settles every bill paid since the last one, with their goods, services, discounts and GST exactly as paid.">
        {!invoices.length ? (
          <EmptyState icon={ReceiptText} title="No invoices yet" description={uninvoicedBills ? `${uninvoicedBills} paid bill${uninvoicedBills === 1 ? '' : 's'} can be invoiced.` : 'Generate a bill first; the invoice is made from paid bills.'} />
        ) : (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Format</Th><Th>Bills</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <Tr key={inv.id} className={inv.status === 'void' ? 'opacity-60' : ''}>
                  <Td className="font-medium text-slate-900">{inv.invoiceNo}{inv.kind === 'amc_parts' && <> <Badge tone="slate">AMC parts</Badge></>}{inv.status === 'void' && inv.voidReason && <div className="max-w-[180px] truncate text-xs font-normal text-slate-500" title={inv.voidReason}>{inv.voidReason}</div>}</Td>
                  <Td>{formatDate(inv.issuedOn)}</Td>
                  <Td>{inv.pricing?.invoiceGstMode === 'without_gst' ? 'Plain' : 'Tax (GST)'}</Td>
                  <Td>{inv.billRefs?.length ? inv.billRefs.map((b) => b.billNo).join(', ') : <span className="text-slate-500">—</span>}</Td>
                  <Td className="text-right tabular-nums">{money(inv.total)}</Td>
                  <Td>{inv.status === 'void' ? <Badge tone="slate">Void</Badge> : <Badge tone="green">Issued</Badge>}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View PDF" className="text-slate-500" onClick={() => attempt(() => viewInvoiceDocument(invoicePdfParams(inv)), 'The invoice could not be opened.')} />
                      <IconButton icon={Download} label="Download PDF" className="text-slate-500" onClick={() => attempt(() => downloadInvoiceDocument(invoicePdfParams(inv)), 'The invoice could not be downloaded.')} />
                      {canInvoice && !inv.pdfName && <IconButton icon={Save} label="Save PDF (not saved yet)" className="text-slate-500" onClick={() => savePdf('invoice', inv)} />}
                      {inv.status !== 'void' && (inv.pdfName || canInvoice) && <IconButton icon={WhatsAppIcon} label="Share on WhatsApp" className="text-slate-500" onClick={() => shareInvoice(inv)} />}
                      {isOwner && inv.status !== 'void' && inv.bills?.length > 0 && <IconButton icon={Ban} tone="danger" label="Void invoice…" className="text-red-500" onClick={() => setModal({ type: 'void', kind: 'invoice', item: inv })} />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {modal?.type === 'eway' && (
        <EwayBillModal
          open
          onClose={() => setModal(null)}
          party={party}
          partyName={partyName}
          clientAddress={client?.address || ''}
          proposal={design ? { pricing: design.pricing, quote: design.quote, total, title: design.name } : null}
          ewayBills={ewayBills}
          catalog={catalog}
          packages={packages}
          currency={currency}
          busy={busy}
          onSubmit={generateEway}
        />
      )}
      {modal?.type === 'bill' && <BillModal open onClose={() => setModal(null)} party={party} partyName={partyName} proposalDiscount={proposalDiscount} currency={currency} busy={busy} onSubmit={generateBill} />}
      {modal?.type === 'invoice' && <InvoiceFromBillsModal open onClose={() => setModal(null)} party={party} partyName={partyName} bills={bills} seed={{ nextInvoiceNo: data.nextInvoiceNo, previousTermsAndConditions: data.previousTermsAndConditions, previousBillToCompany: data.previousBillToCompany }} currency={currency} busy={busy} onSubmit={generateInvoice} />}
      {modal?.type === 'return' && <ReturnGoodsModal open onClose={() => setModal(null)} bill={modal.item} currency={currency} busy={busy} onSubmit={generateCreditNote} />}
      {modal?.type === 'void' && <VoidDocumentDialog kind={modal.kind} doc={modal.item} open onClose={() => setModal(null)} onConfirm={voidDocument} busy={busy} />}
      {modal?.type === 'cancelEway' && <CancelEwayBillDialog open ewayBill={modal.item} onClose={() => setModal(null)} onConfirm={cancelEway} busy={busy} />}
    </>
  );
}
