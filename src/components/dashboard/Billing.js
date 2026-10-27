'use client';

// Billing overview: won proposals with what has been received, plus every receipt and invoice issued.
// Invoices can be started from here: pick a client and a booked proposal, or make a "direct" invoice for anyone.
import { Download, Eye, ExternalLink, FileText, Receipt, ReceiptText, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { downloadInvoiceDocument, downloadReceiptDocument, viewInvoiceDocument, viewReceiptDocument } from '@/lib/billingDocuments';
import { buildReceiptPdfBlob } from '@/lib/billingPdf';
import { buildInvoicePdfBlob, downloadBlob } from '@/lib/invoicePdf';
import { useResource, usePaginatedResource } from '@/lib/useResource';
import { useCan } from '@/lib/useCan';
import { useSession } from '@/lib/session';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdf';
import { withDateRange } from '@/lib/listDates';
import { Alert, Badge, Button, Card, DateRangeFilter, EmptyState, FormField, FormModal, LoadingBlock, openPdfViewer, PageHeader, RowMenu, Select, Table, TablePagination, Tabs, Td, Th, Tr, buttonClass, formatDate, showError, toast } from '../kit';
import InvoiceGenerateModal from './InvoiceGenerateModal';
import ReceiptDirectModal from './ReceiptDirectModal';

const PAGE_SIZE = 10;

const proposalTotal = (d) => Number(d.summary?.pricing?.total ?? d.summary?.cost ?? 0);

/** Receipt / invoice quick actions — grouped so four buttons don’t wrap awkwardly. */
function BillingHeaderActions({ canReceipt, canInvoice, onReceiptDirect, onReceiptGenerate, onInvoiceDirect, onInvoiceGenerate }) {
  if (!canReceipt && !canInvoice) return null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
      {canReceipt && (
        <div className="flex min-w-[min(100%,280px)] flex-1 flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/90 p-2 sm:min-w-0 sm:flex-none">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Receipts</span>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="secondary" icon={Zap} className="w-full justify-center" onClick={onReceiptDirect}>
              Direct
            </Button>
            <Button size="sm" variant="primary" icon={Receipt} className="w-full justify-center" onClick={onReceiptGenerate}>
              Generate
            </Button>
          </div>
        </div>
      )}
      {canInvoice && (
        <div className="flex min-w-[min(100%,280px)] flex-1 flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50/90 p-2 sm:min-w-0 sm:flex-none">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Invoices</span>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="secondary" icon={Zap} className="w-full justify-center" onClick={onInvoiceDirect}>
              Direct
            </Button>
            <Button size="sm" variant="primary" icon={ReceiptText} className="w-full justify-center" onClick={onInvoiceGenerate}>
              Generate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Step 1: client. Step 2: booked proposal. Then open billing for invoice or payment. */
function ProposalPicker({ basePath, money, onClose, mode = 'invoice' }) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [designId, setDesignId] = useState('');
  const [error, setError] = useState('');
  const clients = useResource('/api/clients?limit=200');
  const designs = useResource(clientId ? `/api/designs?client=${clientId}&limit=200` : null);
  const invoiceable = (designs.data?.items || []).filter((d) => d.status === 'won' && proposalTotal(d) > 0);
  const receiptable = invoiceable;
  const options = mode === 'receipt' ? receiptable : invoiceable;
  const submit = () => {
    if (!clientId) return setError('Choose a client');
    if (!designId) return setError('Choose a proposal');
    router.push(`${basePath}/${designId}?${mode === 'receipt' ? 'pay=1' : 'invoice=1'}`);
  };
  const isReceipt = mode === 'receipt';
  return (
    <FormModal
      open
      onClose={onClose}
      title={isReceipt ? 'Generate receipt' : 'Generate invoice'}
      description={isReceipt ? 'Choose the client and booked proposal to record a payment for.' : 'Choose the client, then the booked proposal to invoice.'}
      submitLabel="Continue"
      error={error}
      onSubmit={submit}
      noValidate
    >
      <FormField label="Client">
        <Select value={clientId} onValue={(v) => { setClientId(v); setDesignId(''); setError(''); }}>
          <option value="">{clients.loading ? 'Loading clients…' : 'Choose a client'}</option>
          {(clients.data?.items || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
        </Select>
      </FormField>
      <FormField
        label="Proposal"
        hint={
          clientId && !designs.loading && !options.length
            ? (isReceipt ? 'No booked proposal with a balance to pay. Mark a proposal as Booked first, or use a direct receipt.' : 'This client has no booked proposal with a price. Mark the proposal as Booked first, or make a direct invoice.')
            : (isReceipt ? 'Only booked proposals can receive payments.' : 'Only booked proposals with a price can be invoiced.')
        }
      >
        <Select value={designId} onValue={(v) => { setDesignId(v); setError(''); }} disabled={!clientId || designs.loading}>
          <option value="">{!clientId ? 'Choose a client first' : designs.loading ? 'Loading proposals…' : options.length ? 'Choose a proposal' : 'No booked proposals'}</option>
          {options.map((d) => <option key={d.id} value={d.id}>{d.name} · {money(proposalTotal(d))}</option>)}
        </Select>
      </FormField>
      {designs.error && <Alert>{designs.error}</Alert>}
    </FormModal>
  );
}

export default function Billing({ basePath = '/dashboard/billing' }) {
  const company = useSession((s) => s.company);
  const may = useCan();
  const [tab, setTab] = useState('proposals');
  const [proposalPage, setProposalPage] = useState(1);
  const [addedFrom, setAddedFrom] = useState('');
  const [addedTo, setAddedTo] = useState('');
  const overviewPath = useMemo(() => withDateRange('/api/billing/overview', addedFrom, addedTo), [addedFrom, addedTo]);
  const paymentsPath = useMemo(() => withDateRange('/api/billing/payments', addedFrom, addedTo), [addedFrom, addedTo]);
  const invoicesPath = useMemo(() => withDateRange('/api/billing/invoices', addedFrom, addedTo), [addedFrom, addedTo]);
  const overview = useResource(overviewPath);
  const receipts = usePaginatedResource(paymentsPath, { limit: PAGE_SIZE });
  const invoices = usePaginatedResource(invoicesPath, { limit: PAGE_SIZE });
  const catalog = useResource('/api/catalog');
  const packages = useResource('/api/packages');
  const money = (v) => formatMoney(v, company?.currency);
  const currency = company?.currency || 'INR';
  const [modal, setModal] = useState(null); // 'pick' | 'direct' | 'pickReceipt' | 'directReceipt'
  const [busy, setBusy] = useState(false);

  /** Direct invoice: create it, render the PDF in the browser, archive it on the server, hand it to the user. */
  const generateDirect = async (pricing, termsAndConditions, extra) => {
    setBusy(true);
    try {
      const { createdInvoice: created } = await api('/api/billing/invoices', { method: 'POST', body: { ...extra, pricing, termsAndConditions } });
      const { blob, filename } = await buildInvoicePdfBlob({ invoice: created, company, client: created.billTo, currency });
      const form = new FormData();
      form.append('file', blob, filename);
      await api(`/api/billing/invoices/${created.id}/pdf`, { method: 'POST', form });
      toast.success(`Invoice ${created.invoiceNo} generated and saved`);
      setModal(null);
      setTab('invoices');
      invoices.reload();
      downloadBlob(blob, filename);
    } catch (e) {
      showError(e, e?.status === 409 ? 'Stock not available' : 'Invoice was not generated'); // 409: not enough stock, or a unit was just sold
    }
    setBusy(false);
  };

  const saveDirectReceipt = async (body) => {
    setBusy(true);
    try {
      const { payment } = await api('/api/billing/payments/direct', { method: 'POST', body });
      const client = payment.billTo || body.billTo;
      const { blob, filename } = await buildReceiptPdfBlob({
        payment,
        proposalName: payment.title || body.title || 'Payment received',
        total: payment.contractTotal || payment.amount,
        history: [payment],
        company,
        client,
        currency,
      });
      const form = new FormData();
      form.append('file', blob, filename);
      await api(`/api/billing/payments/${payment.id}/pdf`, { method: 'POST', form });
      toast.success(`Receipt ${payment.receiptNo} created`);
      setModal(null);
      setTab('receipts');
      receipts.reload();
      openPdfViewer({ title: `Receipt ${payment.receiptNo}`, blob, downloadName: filename });
    } catch (e) {
      showError(e, 'Receipt was not created');
    }
    setBusy(false);
  };

  const receiptPdf = async (p, action) => {
    try {
      const designId = p.design?.id || p.design;
      if (!designId) {
        const params = {
          payment: p,
          pdfName: p.pdfName,
          proposalName: p.title || 'Payment received',
          total: p.contractTotal || p.amount,
          history: [p],
          company,
          client: p.billTo || p.client,
          currency,
        };
        if (action === 'view') await viewReceiptDocument(params);
        else await downloadReceiptDocument(params);
        return;
      }
      const ledger = await api(`/api/billing/designs/${designId}`);
      const list = ledger.payments || [];
      const i = list.findIndex((x) => x.id === p.id);
      const payment = i >= 0 ? list[i] : p;
      const params = {
        payment,
        pdfName: payment.pdfName,
        proposalName: ledger.design.name,
        total: ledger.total,
        history: list.slice(0, Math.max(i, 0) + 1),
        company,
        client: ledger.design.client,
        currency,
      };
      if (action === 'view') await viewReceiptDocument(params);
      else await downloadReceiptDocument(params);
    } catch (e) {
      console.error(e);
      toast.error(action === 'view' ? 'The receipt could not be opened.' : 'The receipt could not be downloaded.');
    }
  };

  const invoicePdf = async (inv, action) => {
    try {
      let params = { invoice: inv, pdfName: inv.pdfName, company, currency };
      if (inv.design) {
        const ledger = await api(`/api/billing/designs/${inv.design}`);
        params = {
          ...params,
          payments: ledger.payments,
          client: ledger.design.client || inv.client,
          quote: ledger.design.quote,
          proposalPricing: ledger.design.pricing,
          catalog: catalog.data,
          packages: packages.data,
        };
      } else {
        params.client = inv.billTo || inv.client;
      }
      if (action === 'view') await viewInvoiceDocument(params);
      else await downloadInvoiceDocument(params);
    } catch (e) {
      console.error(e);
      toast.error(action === 'view' ? 'The invoice could not be opened.' : 'The invoice could not be downloaded.');
    }
  };

  const dateFiltered = Boolean(addedFrom && addedTo);

  useEffect(() => {
    setProposalPage(1);
    receipts.setPage(1);
    invoices.setPage(1);
  }, [tab]);

  const proposals = overview.data || [];
  const proposalPages = Math.max(1, Math.ceil(proposals.length / PAGE_SIZE) || 1);
  const proposalRows = useMemo(
    () => proposals.slice((proposalPage - 1) * PAGE_SIZE, proposalPage * PAGE_SIZE),
    [proposals, proposalPage],
  );

  const cur = {
    proposals: { data: proposalRows, loading: overview.loading, error: overview.error, total: proposals.length, page: proposalPage, totalPages: proposalPages, setPage: setProposalPage },
    receipts: { data: receipts.items, loading: receipts.loading, error: receipts.error, total: receipts.total, page: receipts.page, totalPages: receipts.totalPages, setPage: receipts.setPage },
    invoices: { data: invoices.items, loading: invoices.loading, error: invoices.error, total: invoices.total, page: invoices.page, totalPages: invoices.totalPages, setPage: invoices.setPage },
  }[tab];

  const outstanding = proposals.reduce((a, d) => a + d.balance, 0);
  const received = proposals.reduce((a, d) => a + d.paid, 0);

  return (
    <>
      <PageHeader title="Billing" description="Generate plain or tax invoices, record payments, and issue receipts for booked proposals.">
        <BillingHeaderActions
          canReceipt={may('finances', 'create_receipt')}
          canInvoice={may('finances', 'create_invoice')}
          onReceiptDirect={() => setModal('directReceipt')}
          onReceiptGenerate={() => setModal('pickReceipt')}
          onInvoiceDirect={() => setModal('direct')}
          onInvoiceGenerate={() => setModal('pick')}
        />
      </PageHeader>
      {overview.data && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[['Booked proposals', proposals.length], ['Received', money(received)], ['Outstanding', money(outstanding)]].map(([k, v]) => (
            <Card key={k} className="p-4"><div className="text-xs font-medium text-slate-500">{k}</div><div className="mt-1 text-xl font-semibold text-slate-900">{v}</div></Card>
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <DateRangeFilter
          from={addedFrom}
          to={addedTo}
          onChange={({ from, to }) => {
            setAddedFrom(from);
            setAddedTo(to);
            setProposalPage(1);
            receipts.setPage(1);
            invoices.setPage(1);
          }}
        />
        <Tabs className="shrink-0" value={tab} onChange={setTab} tabs={[{ id: 'proposals', label: 'Booked proposals', icon: FileText, count: proposals.length }, { id: 'receipts', label: 'Receipts', icon: Receipt, count: receipts.total }, { id: 'invoices', label: 'Invoices', icon: ReceiptText, count: invoices.total }]} />
      </div>
      {cur.error && <Alert className="mb-4">{cur.error}</Alert>}

      <Card className="overflow-hidden">
        {cur.loading ? <LoadingBlock /> : !cur.data?.length ? (
          <EmptyState
            icon={tab === 'invoices' ? ReceiptText : Receipt}
            title={dateFiltered ? 'Nothing in this date range' : tab === 'proposals' ? 'No booked proposals yet' : tab === 'receipts' ? 'No receipts yet' : 'No invoices yet'}
            description={dateFiltered ? 'Try different dates or clear the range.' : tab === 'proposals' ? 'Mark a proposal as Booked and it will appear here, ready for payments.' : 'They appear here as you record payments.'}
          />
        ) : tab === 'proposals' ? (
          <Table>
            <thead><tr><Th>Proposal</Th><Th>Client</Th><Th className="text-right">Total</Th><Th className="text-right">Received</Th><Th className="text-right">Balance</Th><Th>Status</Th></tr></thead>
            <tbody>
              {cur.data.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium text-slate-900 hover:underline "><Link href={`${basePath}/${d.id}`} className='hover:text-brand-600'>{d.name}</Link></Td>
                  <Td><div className="max-w-[160px] truncate" title={d.client?.name}>{d.client?.name}</div></Td>
                  <Td className="text-right tabular-nums">{money(d.total)}</Td>
                  <Td className="text-right tabular-nums">{money(d.paid)}</Td>
                  <Td className="text-right tabular-nums">{money(d.balance)}</Td>
                  <Td>{d.invoiceNo ? <Badge tone="green">Invoiced · {d.invoiceNo}</Badge> : d.total > 0 ? <Badge tone="brand">Invoice pending</Badge> : d.paid > 0 ? <Badge tone="amber">Part paid</Badge> : <Badge tone="slate">No payment</Badge>}</Td>
                  {/* <Td className="text-right"><Link href={`${basePath}/${d.id}`} className={buttonClass({ size: 'sm' })}>Manage</Link></Td> */}
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : tab === 'receipts' ? (
          <Table>
            <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Client</Th><Th>Proposal</Th><Th>Mode</Th><Th className="text-right">Amount</Th><Th className="text-right">Balance after</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {cur.data.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-slate-900">{p.receiptNo}</Td>
                  <Td>{formatDate(p.receivedOn)}</Td>
                  <Td><div className="max-w-[160px] truncate" title={p.client?.name}>{p.client?.name}</div></Td>
                  <Td>
                    {p.design?.name || (
                      <span className="inline-flex items-center gap-1.5">
                        {p.title || 'Direct'}
                        <Badge tone="slate">Direct</Badge>
                      </span>
                    )}
                  </Td>
                  <Td>{PAYMENT_MODE_LABEL[p.mode]?.split(' (')[0] || p.mode}</Td>
                  <Td className="text-right tabular-nums">{money(p.amount)}</Td>
                  <Td className="text-right tabular-nums">{money(p.balanceAfter)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${p.receiptNo}`}
                        items={[
                          { key: 'view', icon: Eye, label: 'View PDF', onClick: () => receiptPdf(p, 'view') },
                          { key: 'download', icon: Download, label: 'Download PDF', onClick: () => receiptPdf(p, 'download') },
                          p.design?.id && { key: 'open', icon: ExternalLink, label: 'Open proposal billing', href: `${basePath}/${p.design.id}` },
                        ]}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Client</Th><Th>Proposal</Th><Th className="text-right">Total</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {cur.data.map((i) => (
                <Tr key={i.id}>
                  <Td className="font-medium text-slate-900">{i.invoiceNo}</Td>
                  <Td>{formatDate(i.issuedOn)}</Td>
                  <Td><div className="max-w-[160px] truncate" title={i.client?.name || i.billTo?.name}>{i.client?.name || i.billTo?.name}</div></Td>
                  <Td>{i.design ? i.title : <span className="inline-flex items-center gap-1.5">{i.title}<Badge tone="slate">Direct</Badge></span>}</Td>
                  <Td className="text-right tabular-nums">{money(i.total)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${i.invoiceNo}`}
                        items={[
                          { key: 'view', icon: Eye, label: 'View PDF', onClick: () => invoicePdf(i, 'view') },
                          { key: 'download', icon: Download, label: 'Download PDF', onClick: () => invoicePdf(i, 'download') },
                          (i.design?.id || i.design) && {
                            key: 'open',
                            icon: ExternalLink,
                            label: 'Open proposal billing',
                            href: `${basePath}/${i.design?.id || i.design}`,
                          },
                        ]}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {cur.data?.length > 0 && (
          <TablePagination
            page={cur.page}
            totalPages={cur.totalPages}
            total={cur.total}
            pageSize={PAGE_SIZE}
            onPageChange={cur.setPage}
          />
        )}
      </Card>

      {modal === 'pick' && <ProposalPicker basePath={basePath} money={money} onClose={() => setModal(null)} mode="invoice" />}
      {modal === 'pickReceipt' && <ProposalPicker basePath={basePath} money={money} onClose={() => setModal(null)} mode="receipt" />}
      {modal === 'direct' && <InvoiceGenerateModal open onClose={() => setModal(null)} currency={currency} busy={busy} onSubmit={generateDirect} />}
      {modal === 'directReceipt' && <ReceiptDirectModal open onClose={() => setModal(null)} currency={currency} busy={busy} onSubmit={saveDirectReceipt} />}
    </>
  );
}
