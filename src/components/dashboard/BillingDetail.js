'use client';

// One party's money — a won proposal's, or a client's with no proposal: bills (materials and services with tax; each
// comes with its delivery challan) and receipts (money received). Older invoices stay read-only. Every document is
// generated from here.
import { ArrowLeft, Ban, Eye, FileText, HandCoins, Loader2, PenLine, ReceiptText, Trash2, Truck, Undo2, Wallet } from 'lucide-react';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdf';
import { downloadBlob } from '@/lib/invoicePdf';
import { buildChallanPdfBlob, buildEwayBillPdfBlob, challanNoOf, hasChallan } from '@/lib/ewayBillPdf';
import { buildReceiptPdfBlob } from '@/lib/receiptPdf';
import { archiveBillPdf, archiveCreditNotePdf, archiveEwayBillPdf, archiveInvoicePdf, uploadBillingPdf, viewBillDocument, viewChallanDocument, viewCreditNoteDocument, viewEwayBillDocument, viewInvoiceDocument, viewReceiptDocument } from '@/lib/billingDocuments';
import { shareBillOnWhatsApp, shareInvoiceOnWhatsApp } from '@/lib/billingWhatsApp';
import { formatMoney } from '@/lib/energy';
import { BILL_STATUS, EWAY_STATUS } from '@/lib/saleChain';
import { useCan } from '@/lib/useCan';
import { useSession } from '@/lib/session';
import { hasBranchOwnerAccess } from '@/lib/tenant';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, LoadingBlock, Table, Td, Th, Tr, capName, cx, formatDate, showError, toast } from '../kit';
import EwayBillModal, { CancelEwayBillDialog } from './EwayBillModal';
import VoidDocumentDialog from './VoidDocumentDialog';
import PartialReturnEwayModal from './PartialReturnEwayModal';
import ReceiptModal from './ReceiptModal';
import { DesignStatusBadge, designHref } from './shared';
import { useBreadcrumb } from '@/lib/breadcrumbs';
import { taxIdName, taxName } from '@/lib/tax';

/** One colour per step of the chain, so the sections read in order. */
const TONE = {
  eway: { band: 'bg-sky-50/80 border-sky-100', chip: 'bg-sky-600 text-white', title: 'text-sky-950' },
  receipts: { band: 'bg-emerald-50/80 border-emerald-100', chip: 'bg-emerald-600 text-white', title: 'text-emerald-950' },
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

/** A random key for one create request: repeating the request with it returns the first result, never a second document. */
const newRequestKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** Either `designId` (a won proposal) or `clientId` (a client with no proposal). */
export default function BillingDetail({ designId, clientId, basePath = '/dashboard/billing' }) {
  const company = useSession((s) => s.company);
  const may = useCan();
  const canEway = may('finances', 'create_eway_bill');
  const canReceipt = may('finances', 'create_bill'); // the permission that used to make the paid invoice
  const canInvoice = may('finances', 'create_invoice');
  const isOwner = hasBranchOwnerAccess(useSession((s) => s.user));
  const params = useSearchParams();
  const { data, loading, error, reload } = useResource(designId ? `/api/billing/designs/${designId}` : `/api/billing/clients/${clientId}`);
  useBreadcrumb(capName(data?.design?.name || data?.client?.name));
  const { data: catalog } = useResource(designId ? '/api/catalog' : null);
  const { data: packages } = useResource(designId ? '/api/packages' : null);
  // `?eway=1`, `?receipt=1` (from the Billing page's picker) open that form as soon as the page is ready
  const [autoUsed, setAutoUsed] = useState(false);
  const [modalState, setModalState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pdfOpening, setPdfOpening] = useState(null);
  const requestKeys = useRef({}); // one key per kind of document, kept until that document is created
  const pdfBackfill = useRef(new Set());
  const money = (v) => formatMoney(v, company?.currency);

  useEffect(() => {
    if (loading || error || !data || !company) return;
    const partyClient = data.design ? data.design.client : data.client;
    if (!partyClient) return;
    const currency = company.currency || 'INR';
    const design = data.design || null;
    let cancelled = false;
    (async () => {
      let touched = false;
      const run = async (key, fn) => {
        if (pdfBackfill.current.has(key)) return;
        pdfBackfill.current.add(key);
        try {
          await fn();
          touched = true;
        } catch (e) {
          pdfBackfill.current.delete(key);
          console.error(e);
        }
      };
      for (const e of data.ewayBills || []) {
        if (cancelled || e.pdfName || e.status === 'cancelled') continue;
        await run(`eway:${e.id}`, () => archiveEwayBillPdf(e, company, partyClient, currency));
      }
      for (const b of data.bills || []) {
        if (cancelled || b.pdfName) continue;
        await run(`bill:${b.id}`, () => archiveBillPdf(b, company, partyClient, currency));
      }
      for (const c of data.creditNotes || []) {
        if (cancelled || c.pdfName) continue;
        await run(`credit:${c.id}`, () => archiveCreditNotePdf(c, company, partyClient, currency));
      }
      for (const inv of data.invoices || []) {
        if (cancelled || inv.pdfName) continue;
        const params = {
          invoice: inv,
          payments: inv.payments,
          company,
          client: inv.billTo || partyClient,
          currency,
          quote: design?.quote,
          proposalPricing: design?.pricing,
          catalog,
          packages,
        };
        await run(`inv:${inv.id}`, () => archiveInvoicePdf(inv, params));
      }
      if (touched && !cancelled) reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, error, data, company, catalog, packages, reload]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <Alert>{error || 'Not found'}</Alert>;
  const { design = null, total, paid, billed = 0, due = 0, invoices = [], ewayBills = [], bills = [], receipts = [], creditNotes = [] } = data;
  const client = design ? design.client : data.client;
  const party = design ? { design: designId } : { client: clientId };
  const partyName = design ? design.name : client?.name;
  const won = design ? design.status === 'won' : true;
  const auto = ['eway', 'receipt'].find((k) => params.get(k) === '1');
  const autoAllowed = auto && !autoUsed && won && ({ eway: canEway, receipt: canReceipt })[auto];
  const modal = modalState ?? (autoAllowed ? { type: auto } : null);
  const setModal = (m) => {
    if (auto) setAutoUsed(true);
    setModalState(m);
  };
  const settled = billed > 0 && due <= 0.005;
  const currency = company?.currency || 'INR';

  /* ── PDFs ── */
  const invoicePdfParams = (inv) => ({ invoice: inv, pdfName: inv?.pdfName, company, client: inv.billTo || client, currency, quote: design?.quote, proposalPricing: design?.pricing, catalog, packages });
  const ewayPdfParams = (e) => ({ ewayBill: e, pdfName: e.pdfName, company, client, currency });
  const billPdfParams = (b) => ({ bill: b, pdfName: b.pdfName, company, client, currency });
  const receiptPdfParams = (r) => ({ receipt: r, pdfName: r.pdfName, company, client, currency });
  const creditPdfParams = (c) => ({ note: c, pdfName: c.pdfName, company, client, currency });
  const attempt = async (fn, failed) => {
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast.error(failed);
    }
  };
  const runPdfView = (key, fn, failed) => attempt(async () => {
    if (pdfOpening) return;
    setPdfOpening(key);
    try {
      await fn();
    } finally {
      setPdfOpening(null);
    }
  }, failed);
  const viewEwayPdf = (e) => runPdfView(`eway:${e.id}`, async () => {
    const hadPdf = Boolean(e.pdfName);
    await viewEwayBillDocument(ewayPdfParams(e));
    if (!hadPdf) await reload();
  }, 'The bill could not be opened.');
  const viewChallanPdf = (e) => runPdfView(`challan:${e.id}`, () => viewChallanDocument(ewayPdfParams(e)), 'The challan could not be opened.');
  const viewReceiptPdf = (r) => runPdfView(`receipt:${r.id}`, async () => {
    const hadPdf = Boolean(r.pdfName);
    await viewReceiptDocument(receiptPdfParams(r));
    if (!hadPdf) await reload();
  }, 'The receipt could not be opened.');
  const viewBillPdf = (b) => runPdfView(`bill:${b.id}`, async () => {
    const hadPdf = Boolean(b.pdfName);
    await viewBillDocument(billPdfParams(b));
    if (!hadPdf) await reload();
  }, 'The invoice could not be opened.');
  const viewCreditPdf = (c) => runPdfView(`credit:${c.id}`, async () => {
    const hadPdf = Boolean(c.pdfName);
    await viewCreditNoteDocument(creditPdfParams(c));
    if (!hadPdf) await reload();
  }, 'The credit note could not be opened.');
  const viewLegacyInvoicePdf = (inv) => runPdfView(`inv:${inv.id}`, async () => {
    const hadPdf = Boolean(inv.pdfName);
    await viewInvoiceDocument(invoicePdfParams(inv));
    if (!hadPdf) await reload();
  }, 'The invoice could not be opened.');
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
  const issueDocument = async ({ kind, path, body, failed, docOf, build, uploadPath, saved, label, extra }) => {
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
      await uploadBillingPdf(uploadPath(doc), file.blob, file.filename);
      archived = true;
    } catch (e) {
      console.error(e);
    }
    setModal(null);
    await reload();
    if (archived) toast.success(saved(created));
    else toast.error(`${label(doc)} was generated, but its PDF could not be saved. View or download the row to retry archiving.`);
    if (file) downloadBlob(file.blob, file.filename);
    // a second document made from the same record (the bill's delivery challan): printed, not stored
    if (extra) {
      try {
        const second = await extra(doc);
        if (second) downloadBlob(second.blob, second.filename);
      } catch (e) {
        console.error(e);
      }
    }
    setBusy(false);
  };
  const generateEway = (body) => issueDocument({
    kind: 'eway',
    path: '/api/billing/eway-bills',
    body,
    failed: (e) => (e?.status === 409 ? 'Stock not available' : 'Bill was not generated'), // 409: not enough stock, or a unit was just sold
    docOf: (created) => created,
    build: (created) => buildEwayBillPdfBlob({ ewayBill: created, company, client, currency }),
    uploadPath: (created) => `/api/billing/eway-bills/${created.id}/pdf`,
    saved: (created) => `Bill ${created.ewayNo}${hasChallan(created) ? ` and challan ${challanNoOf(created.ewayNo)}` : ''} generated · ${created.paid?.amount > 0 ? `${money(created.paid.amount)} received` : 'paid from the advance'}`,
    label: (created) => `Bill ${created.ewayNo}`,
    extra: (created) => (hasChallan(created) ? buildChallanPdfBlob({ ewayBill: created, company, client, currency }) : null),
  });
  const generateReceipt = (body) => issueDocument({
    kind: 'receipt',
    path: '/api/billing/receipts',
    body,
    failed: () => 'Receipt was not saved',
    docOf: (created) => created,
    build: (created) => buildReceiptPdfBlob({ receipt: created, company, client, currency }),
    uploadPath: (created) => `/api/billing/receipts/${created.id}/pdf`,
    saved: (created) => `Receipt ${created.receiptNo} saved · ${money(created.amount)} received`,
    label: (created) => `Receipt ${created.receiptNo}`,
  });
  const removeReceipt = async () => {
    setBusy(true);
    try {
      await api(`/api/billing/receipts/${modal.item.id}`, { method: 'DELETE' });
      toast.success(`Receipt ${modal.item.receiptNo} removed`);
      setModal(null);
      await reload();
    } catch (e) {
      showError(e, 'Receipt was not removed');
    }
    setBusy(false);
  };
  const cancelEway = async (reason) => {
    setBusy(true);
    try {
      await api(`/api/billing/eway-bills/${modal.item.id}/cancel`, { method: 'POST', body: { reason } });
      toast.success(`Bill ${modal.item.ewayNo} cancelled — stock is back`);
      setModal(null);
      await reload();
    } catch (e) {
      showError(e, 'Bill was not cancelled');
    }
    setBusy(false);
  };
  const reviseEway = async (body) => {
    setBusy(true);
    try {
      const res = await api(`/api/billing/eway-bills/${modal.item.id}/revise`, { method: 'POST', body });
      if (res.replacement) {
        await archiveEwayBillPdf(res.replacement, company, client, currency);
      }
      if (res.superseded && !res.superseded.pdfName) {
        await archiveEwayBillPdf(res.superseded, company, client, currency).catch(() => {});
      }
      setModal(null);
      await reload();
      if (res.replacement) toast.success(`Bill ${res.superseded.ewayNo} revised · new bill ${res.replacement.ewayNo} (${money(res.replacement.total)})`);
      else toast.success(`Bill ${res.superseded.ewayNo} closed — all products returned to stock`);
    } catch (e) {
      showError(e, 'Bill was not revised');
    }
    setBusy(false);
  };
  /** Void an invoice or an older invoice (owner only): it stays as the record, its payment or bills are released. */
  const voidDocument = async (body) => {
    const { kind, item } = modal;
    setBusy(true);
    try {
      await api(`/api/billing/${kind === 'bill' ? 'bills' : 'invoices'}/${item.id}/void`, { method: 'POST', body });
      toast.success(kind === 'bill' ? `Invoice ${item.billNo} voided` : `Invoice ${item.invoiceNo} voided`);
      setModal(null);
      await reload();
    } catch (e) {
      showError(e, 'Invoice was not voided');
    }
    setBusy(false);
  };
  const billHasLegacyCredits = (b) => (b.creditedTotal ?? 0) > 0;
  const dueCard = due < -0.005 ? ['Advance held', money(-due), 'text-slate-900'] : ['Balance due', money(due), settled ? 'text-emerald-700' : 'text-slate-900'];

  return (
    <>
      <Link href={basePath} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Billing</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{partyName}</h1>
          <p className="text-sm text-slate-500">{design ? <>{client?.name} · <DesignStatusBadge status={design.status} /></> : <>{[client?.phone, client?.gstNumber && `${taxIdName()} ${client.gstNumber}`].filter(Boolean).join(' · ') || 'Client'} · <Badge tone="slate">No proposal</Badge></>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {design && may('proposals', 'view') && <Link href={designHref({ id: designId, type: design.type, summary: design })} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"><PenLine className="h-4 w-4" />{may('proposals', 'update') ? 'Edit proposal' : 'Open proposal'}</Link>}
          {!design && (may('clients', 'view') || may('clients', 'view_team')) && <Link href={`${basePath.replace(/\/billing$/, '')}/clients/${clientId}`} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"><PenLine className="h-4 w-4" />Open client</Link>}
          {canEway && won && <Button variant="secondary" icon={FileText} onClick={() => setModal({ type: 'eway' })}>Bill</Button>}
          {canReceipt && won && <Button variant="secondary" icon={HandCoins} onClick={() => setModal({ type: 'receipt' })}>Receipt</Button>}
        </div>
      </div>

      {!won && <Alert tone="warn" className="mb-5">Bills and receipts can be created only after the proposal is marked as <b>Booked</b>. Change its status on the proposal, then come back here.</Alert>}

      <div className={`mb-5 grid gap-3 ${design ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        {[...(design ? [['Proposal total', money(total), '']] : []), ['Billed', money(billed), ''], ['Received', money(paid), ''], dueCard].map(([k, v, c]) => (
          <Card key={k} className="p-4"><div className="text-xs font-medium text-slate-500">{k}</div><div className={`mt-1 text-xl font-semibold ${c || 'text-slate-900'}`}>{v}</div></Card>
        ))}
      </div>

      <Section tone="eway" icon={FileText} title="Bills & challans" sub="Each bill lists the materials and services with tax, is paid when it is made, and has a delivery challan for its materials. If some materials come back, use Return: the old bill stays visible (revised) and a new bill is made with what remains.">
        {!ewayBills.length ? (
          <EmptyState icon={FileText} title="No bills yet" description={won ? 'Make a bill for the materials and services. Its delivery challan is made with it.' : 'Mark the proposal as Booked first.'} />
        ) : (
          <Table>
            <thead><tr><Th>Bill</Th><Th>Date</Th><Th>Materials & services</Th><Th>Delivery</Th><Th className="text-right">Total</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {ewayBills.map((e) => {
                const ewayPdfBusy = pdfOpening === `eway:${e.id}`;
                return (
                <Tr key={e.id} className={cx(e.status === 'cancelled' || e.status === 'superseded' ? 'opacity-55' : '')}>
                  <Td className="font-medium text-slate-900">
                    <button type="button" disabled={Boolean(pdfOpening)} className="inline-flex items-center gap-1.5 text-left font-medium hover:text-brand-600 hover:underline disabled:cursor-wait disabled:no-underline" onClick={() => viewEwayPdf(e)}>
                      {ewayPdfBusy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" aria-hidden />}
                      {e.ewayNo}
                    </button>
                    {hasChallan(e) && <div className="text-xs font-normal text-slate-500">Challan {challanNoOf(e.ewayNo)}</div>}
                    {e.status === 'superseded' && e.supersededByNo && <div className="text-xs font-normal text-slate-500">Replaced by {e.supersededByNo}</div>}
                    {e.supersedesNo && e.status === 'open' && <div className="text-xs font-normal text-slate-500">Revises {e.supersedesNo}</div>}
                    {e.cancelReason && (e.status === 'superseded' || e.status === 'cancelled') && <div className="max-w-[200px] truncate text-xs font-normal text-slate-500" title={e.cancelReason}>{e.cancelReason}</div>}
                  </Td>
                  <Td>{formatDate(e.issuedOn)}</Td>
                  <Td><div className="max-w-[260px] truncate" title={[(e.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', '), ...(e.services || []).map((s) => s.name)].filter(Boolean).join(', ')}>{[(e.lines || []).filter((l) => l.kind !== 'service').map((l) => `${l.qty} × ${l.name}`), ...(e.services || []).map((s) => `${s.qty || 1} × ${s.name}`)].flat().filter(Boolean).join(', ') || (e.pricing?.lines || []).filter((l) => l.kind === 'service').map((l) => `${l.qty} × ${l.name}`).join(', ') || '—'}</div></Td>
                  <Td>{e.transport?.vehicleNo || e.transport?.transporter || '—'}</Td>
                  <Td className="text-right tabular-nums">{money(e.total)}</Td>
                  <Td><Badge tone={EWAY_STATUS[e.status]?.tone}>{e.status === 'open' && e.paid?.settled ? `Paid · ${PAYMENT_MODE_LABEL[e.paid.mode]?.split(' (')[0] || e.paid.mode}` : EWAY_STATUS[e.status]?.label || e.status}{e.bill?.billNo ? ` · ${e.bill.billNo}` : ''}</Badge></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View bill" className="text-slate-500" loading={ewayPdfBusy} onClick={() => viewEwayPdf(e)} />
                      {hasChallan(e) && <IconButton icon={Truck} label={`View delivery challan ${challanNoOf(e.ewayNo)}`} className="text-slate-500" loading={pdfOpening === `challan:${e.id}`} onClick={() => viewChallanPdf(e)} />}
                      {canEway && e.status === 'open' && (e.lines || []).some((l) => l.productId) && <IconButton icon={Undo2} label="Return products (partial)" className="text-slate-500" onClick={() => setModal({ type: 'reviseEway', item: e })} />}
                      {canEway && e.status === 'open' && <IconButton icon={Ban} tone="danger" label="Cancel entire bill (all stock back)" className="text-red-500" onClick={() => setModal({ type: 'cancelEway', item: e })} />}
                    </div>
                  </Td>
                </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Section>

      <Section tone="receipts" icon={HandCoins} title="Receipts" sub="Other money the client has paid, apart from bills — an advance or a part payment. An advance is taken off the next bill automatically.">
        {!receipts.length ? (
          <EmptyState icon={HandCoins} title="No receipts yet" description={won ? 'When the client pays any amount, record it with the Receipt button.' : 'Mark the proposal as Booked first.'} />
        ) : (
          <Table>
            <thead><tr><Th>Receipt</Th><Th>Date</Th><Th className="text-right">Amount</Th><Th>Paid by</Th><Th>Received by</Th><Th>Reason</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {receipts.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-slate-900"><button type="button" className="text-left font-medium hover:text-brand-600 hover:underline" onClick={() => viewReceiptPdf(r)}>{r.receiptNo}</button></Td>
                  <Td>{formatDate(r.receivedOn)}</Td>
                  <Td className="text-right tabular-nums">{money(r.amount)}</Td>
                  <Td>{PAYMENT_MODE_LABEL[r.mode]?.split(' (')[0] || r.mode}{r.reference && <div className="max-w-[140px] truncate text-xs text-slate-500">{r.reference}</div>}</Td>
                  <Td><div className="max-w-[160px] truncate" title={r.receivedByName || r.createdByName}>{r.receivedByName || r.createdByName || '—'}</div></Td>
                  <Td><div className="max-w-[220px] truncate text-slate-600" title={r.reason || r.note}>{r.reason || r.note || '—'}</div></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View receipt" className="text-slate-500" loading={pdfOpening === `receipt:${r.id}`} onClick={() => viewReceiptPdf(r)} />
                      {isOwner && <IconButton icon={Trash2} tone="danger" label="Remove receipt…" className="text-red-500" onClick={() => setModal({ type: 'removeReceipt', item: r })} />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {bills.length > 0 && (
      <Section tone="bills" icon={Wallet} title="Invoices" sub="Invoices made before bills and receipts replaced them. They are kept as they are: view or share them, or void one made by mistake (its bills become plain bills again and its payment is removed).">
        {(
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Covers</Th><Th>Paid by</Th><Th className="text-right">Total</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {bills.map((b) => (
                <Tr key={b.id} className={b.status === 'void' ? 'opacity-60' : ''}>
                  <Td className="font-medium text-slate-900">
                    <button type="button" className="text-left font-medium hover:text-brand-600 hover:underline" onClick={() => viewBillPdf(b)}>{b.billNo}</button>
                    {b.status === 'void' && b.voidReason && <div className="max-w-[180px] truncate text-xs font-normal text-slate-500" title={b.voidReason}>{b.voidReason}</div>}
                  </Td>
                  <Td>{formatDate(b.issuedOn)}</Td>
                  <Td>
                    {b.ewayBills?.length ? b.ewayBills.map((e) => e.ewayNo).join(', ') : <span className="text-slate-500">Services only</span>}
                    {b.services?.length > 0 && <div className="max-w-[240px] truncate text-xs text-slate-500" title={b.services.map((s) => s.name).join(', ')}>{b.services.map((s) => s.name).join(', ')}</div>}
                  </Td>
                  <Td>{PAYMENT_MODE_LABEL[b.paid?.mode]?.split(' (')[0] || b.paid?.mode}{b.paid?.reference && <div className="max-w-[140px] truncate text-xs text-slate-500">{b.paid.reference}</div>}</Td>
                  <Td className="text-right tabular-nums">
                    {money(b.total)}
                    {b.creditedTotal > 0 && b.status !== 'void' && <div className="text-xs text-slate-500">{money(b.creditedTotal)} returned</div>}
                  </Td>
                  <Td><Badge tone={BILL_STATUS[b.status]?.tone}>{BILL_STATUS[b.status]?.label || b.status}{b.invoice?.invoiceNo ? ` · ${b.invoice.invoiceNo}` : ''}</Badge></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View PDF" className="text-slate-500" loading={pdfOpening === `bill:${b.id}`} onClick={() => viewBillPdf(b)} />
                      {isOwner && b.status !== 'void' && (b.pdfName || canReceipt) && <IconButton icon={WhatsAppIcon} label="Share on WhatsApp" className="text-slate-500" onClick={() => shareBill(b)} />}
                      {isOwner && b.status === 'paid' && !billHasLegacyCredits(b) && <IconButton icon={Ban} tone="danger" label="Void invoice…" className="text-red-500" onClick={() => setModal({ type: 'void', kind: 'bill', item: b })} />}
                      {isOwner && b.status === 'paid' && billHasLegacyCredits(b) && <IconButton icon={Ban} label="Has older credit notes — cannot void here" disabled className="cursor-not-allowed text-slate-300 hover:bg-transparent hover:text-slate-300" />}
                      {isOwner && b.status === 'invoiced' && <IconButton icon={Ban} label="On an older invoice: void that invoice first" disabled className="cursor-not-allowed text-slate-300 hover:bg-transparent hover:text-slate-300" />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
      )}

      {creditNotes.length > 0 && (
        <Section tone="bills" icon={Undo2} title="Credit notes" sub="Older records from when partial returns on invoices were allowed. Returns are now done on the bill itself.">
          <Table>
            <thead><tr><Th>Credit note</Th><Th>Date</Th><Th>Against</Th><Th>Goods returned</Th><Th>Reason</Th><Th className="text-right">Refunded</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {creditNotes.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-slate-900"><button type="button" className="text-left font-medium hover:text-brand-600 hover:underline" onClick={() => viewCreditPdf(c)}>{c.creditNo}</button></Td>
                  <Td>{formatDate(c.issuedOn)}</Td>
                  <Td>{c.bill?.billNo || '—'}</Td>
                  <Td><div className="max-w-[260px] truncate text-slate-700" title={(c.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', ')}>{(c.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', ')}</div></Td>
                  <Td><div className="max-w-[200px] truncate text-slate-600" title={c.reason}>{c.reason}</div></Td>
                  <Td className="text-right tabular-nums">{money(c.total)}<div className="text-xs text-slate-500">{PAYMENT_MODE_LABEL[c.refund?.mode]?.split(' (')[0] || c.refund?.mode}</div></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View PDF" className="text-slate-500" loading={pdfOpening === `credit:${c.id}`} onClick={() => viewCreditPdf(c)} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}

      {invoices.length > 0 && (
        <Section tone="invoices" icon={ReceiptText} title="Older invoices" sub="The oldest invoices, and AMC parts invoices. They are kept read-only: view, download or void them.">
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Format</Th><Th>Covers</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <Tr key={inv.id} className={inv.status === 'void' ? 'opacity-60' : ''}>
                  <Td className="font-medium text-slate-900">
                    <button type="button" className="text-left font-medium hover:text-brand-600 hover:underline" onClick={() => viewLegacyInvoicePdf(inv)}>{inv.invoiceNo}</button>
                    {inv.kind === 'amc_parts' && <> <Badge tone="slate">AMC parts</Badge></>}
                    {inv.status === 'void' && inv.voidReason && <div className="max-w-[180px] truncate text-xs font-normal text-slate-500" title={inv.voidReason}>{inv.voidReason}</div>}
                  </Td>
                  <Td>{formatDate(inv.issuedOn)}</Td>
                  <Td>{inv.pricing?.invoiceGstMode === 'without_gst' ? 'Plain' : `Tax (${taxName()})`}</Td>
                  <Td>{inv.billRefs?.length ? inv.billRefs.map((b) => b.billNo).join(', ') : <span className="text-slate-500">—</span>}</Td>
                  <Td className="text-right tabular-nums">{money(inv.total)}</Td>
                  <Td>{inv.status === 'void' ? <Badge tone="slate">Void</Badge> : <Badge tone="green">Issued</Badge>}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View PDF" className="text-slate-500" loading={pdfOpening === `inv:${inv.id}`} onClick={() => viewLegacyInvoicePdf(inv)} />
                      {inv.status !== 'void' && (inv.pdfName || canInvoice) && <IconButton icon={WhatsAppIcon} label="Share on WhatsApp" className="text-slate-500" onClick={() => shareInvoice(inv)} />}
                      {isOwner && inv.status !== 'void' && inv.bills?.length > 0 && <IconButton icon={Ban} tone="danger" label="Void invoice…" className="text-red-500" onClick={() => setModal({ type: 'void', kind: 'invoice', item: inv })} />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}

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
      {modal?.type === 'receipt' && <ReceiptModal open onClose={() => setModal(null)} party={party} partyName={partyName} due={due} currency={currency} busy={busy} onSubmit={generateReceipt} />}
      {modal?.type === 'removeReceipt' && (
        <ConfirmDialog open onClose={() => setModal(null)} onConfirm={removeReceipt} title={`Remove receipt ${modal.item.receiptNo}?`} confirmLabel="Remove receipt" busy={busy}>
          <p>{money(modal.item.amount)} comes off what this client has paid, and the number {modal.item.receiptNo} is not used again. Do this only for a receipt made by mistake.</p>
        </ConfirmDialog>
      )}
      {modal?.type === 'reviseEway' && <PartialReturnEwayModal open onClose={() => setModal(null)} ewayBill={modal.item} busy={busy} onSubmit={reviseEway} />}
      {modal?.type === 'void' && <VoidDocumentDialog kind={modal.kind} doc={modal.item} open onClose={() => setModal(null)} onConfirm={voidDocument} busy={busy} />}
      {modal?.type === 'cancelEway' && <CancelEwayBillDialog open ewayBill={modal.item} onClose={() => setModal(null)} onConfirm={cancelEway} busy={busy} />}
    </>
  );
}
