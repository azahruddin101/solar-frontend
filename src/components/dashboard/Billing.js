'use client';

// Billing overview: won proposals with what was billed and received, and every document — bills (materials and
// services; each prints its delivery challan) and receipts (money received). Older invoices stay read-only. New
// documents start from here: pick the client, then the booked proposal (or the client alone), and that billing page
// opens the form.
import { Ban, Download, Eye, ExternalLink, FileText, HandCoins, ReceiptText, ScrollText, Trash2, Truck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { downloadBillDocument, downloadChallanDocument, downloadEwayBillDocument, downloadInvoiceDocument, downloadReceiptDocument, viewBillDocument, viewChallanDocument, viewEwayBillDocument, viewInvoiceDocument, viewReceiptDocument } from '@/lib/billingDocuments';
import { challanNoOf, hasChallan } from '@/lib/ewayBillPdf';
import { hasBranchOwnerAccess } from '@/lib/tenant';
import { useResource, usePaginatedResource } from '@/lib/useResource';
import { useCan } from '@/lib/useCan';
import { useSession } from '@/lib/session';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdf';
import { withDateRange } from '@/lib/listDates';
import { BILL_STATUS, EWAY_STATUS, partyBillingHref } from '@/lib/saleChain';
import { Alert, Badge, Button, Card, ConfirmDialog, DateRangeFilter, EmptyState, FilterNotice, FormField, FormModal, LoadingBlock, PageHeader, RowMenu, Select, Table, TablePagination, Tabs, Td, Th, Tr, capName, formatDate, showError, toast } from '../kit';
import { CancelEwayBillDialog } from './EwayBillModal';
import { taxName } from '@/lib/tax';

const PAGE_SIZE = 10;

const proposalTotal = (d) => Number(d.summary?.pricing?.total ?? d.summary?.cost ?? 0);

/** What each "new document" button starts, and which page query opens its form. */
const DOCS = {
  eway: { label: 'Bill', icon: FileText, title: 'New bill', hint: 'A bill lists the materials and services with tax. Its delivery challan is made with it. Choose who it is for.', clientOnly: true },
  receipt: { label: 'Receipt', icon: HandCoins, title: 'New receipt', hint: 'A receipt records money the client paid. Choose who paid.', clientOnly: true },
};

/** The "new document" buttons, grouped so they don’t wrap awkwardly. */
function BillingHeaderActions({ canEway, canReceipt, onPick }) {
  const chain = [canEway && 'eway', canReceipt && 'receipt'].filter(Boolean);
  if (!chain.length) return null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
      {chain.length > 0 && (
        <div className="flex min-w-[min(100%,280px)] flex-1 flex-col gap-1.5 rounded-xl border border-brand/20 bg-brand-soft/30 p-2 sm:min-w-0 sm:flex-none">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-brand-ink">New</span>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${chain.length}, minmax(0, 1fr))` }}>
            {chain.map((k, i) => (
              <Button key={k} size="sm" variant={i === 0 ? 'primary' : 'secondary'} icon={DOCS[k].icon} className="w-full justify-center" onClick={() => onPick(k)}>{DOCS[k].label}</Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const CLIENT_ONLY = '__client';

/** Step 1: client. Step 2: booked proposal (or the client alone). Then the party's billing page opens the form. */
function PartyPicker({ basePath, money, mode, onClose }) {
  const router = useRouter();
  const doc = DOCS[mode];
  const [clientId, setClientId] = useState('');
  const [designId, setDesignId] = useState('');
  const [error, setError] = useState('');
  const clients = useResource('/api/clients?limit=200');
  const designs = useResource(clientId ? `/api/designs?client=${clientId}&limit=200` : null);
  const options = (designs.data?.items || []).filter((d) => d.status === 'won');
  const submit = () => {
    if (!clientId) return setError('Choose a client');
    if (!designId) return setError(doc.clientOnly ? 'Choose a proposal, or bill the client directly' : 'Choose a proposal');
    const href = designId === CLIENT_ONLY ? partyBillingHref(basePath, { client: clientId }) : partyBillingHref(basePath, { design: designId });
    router.push(`${href}?${mode}=1`);
  };
  return (
    <FormModal open onClose={onClose} title={doc.title} description={doc.hint} submitLabel="Continue" error={error} onSubmit={submit} noValidate>
      <FormField label="Client">
        <Select value={clientId} onValue={(v) => { setClientId(v); setDesignId(''); setError(''); }}>
          <option value="">{clients.loading ? 'Loading clients…' : 'Choose a client'}</option>
          {(clients.data?.items || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
        </Select>
      </FormField>
      <FormField
        label="Proposal"
        hint={clientId && !designs.loading && !options.length
          ? 'This client has no booked proposal. You can still bill the client directly.'
          : 'Documents on a booked proposal count towards its balance; a sale with no proposal is billed to the client directly.'}
      >
        <Select value={designId} onValue={(v) => { setDesignId(v); setError(''); }} disabled={!clientId || designs.loading}>
          <option value="">{!clientId ? 'Choose a client first' : designs.loading ? 'Loading proposals…' : 'Choose…'}</option>
          {options.map((d) => <option key={d.id} value={d.id}>{d.name} · {money(proposalTotal(d))}</option>)}
          {doc.clientOnly && clientId && !designs.loading && <option value={CLIENT_ONLY}>No proposal — bill this client directly</option>}
        </Select>
      </FormField>
      {designs.error && <Alert>{designs.error}</Alert>}
    </FormModal>
  );
}

/** The ready-made lists the dashboard links to (`?show=`), matched as the dashboard counts them. */
const SHOWS = {
  unbilled: { label: 'booked jobs not fully paid yet', match: (d) => d.total > 0 && d.balance > 0.001 },
  no_invoice: { label: 'booked jobs without a bill', match: (d) => d.total > 0 && !d.billNo && !d.invoiceNo },
};

const partyOf = (row) => ({ design: row.design?.id || (typeof row.design === 'string' ? row.design : null), client: row.client?.id || (typeof row.client === 'string' ? row.client : null) });

export default function Billing({ basePath = '/dashboard/billing' }) {
  const company = useSession((s) => s.company);
  const may = useCan();
  const router = useRouter();
  const params = useSearchParams();
  const show = SHOWS[params.get('show')] ? params.get('show') : '';
  const wanted = DOCS[params.get('new')] ? params.get('new') : '';
  const [tab, setTab] = useState('proposals');
  const [proposalPage, setProposalPage] = useState(1);
  const [addedFrom, setAddedFrom] = useState('');
  const [addedTo, setAddedTo] = useState('');
  const overviewPath = useMemo(() => withDateRange('/api/billing/overview', addedFrom, addedTo), [addedFrom, addedTo]);
  const invoicesPath = useMemo(() => withDateRange('/api/billing/invoices', addedFrom, addedTo), [addedFrom, addedTo]);
  const ewayPath = useMemo(() => withDateRange('/api/billing/eway-bills', addedFrom, addedTo), [addedFrom, addedTo]);
  const billsPath = useMemo(() => withDateRange('/api/billing/bills', addedFrom, addedTo), [addedFrom, addedTo]);
  const receiptsPath = useMemo(() => withDateRange('/api/billing/receipts', addedFrom, addedTo), [addedFrom, addedTo]);
  const overview = useResource(overviewPath);
  const invoices = usePaginatedResource(invoicesPath, { limit: PAGE_SIZE });
  const eways = usePaginatedResource(ewayPath, { limit: PAGE_SIZE });
  const bills = usePaginatedResource(billsPath, { limit: PAGE_SIZE });
  const receipts = usePaginatedResource(receiptsPath, { limit: PAGE_SIZE });
  const isOwner = hasBranchOwnerAccess(useSession((s) => s.user));
  const catalog = useResource('/api/catalog');
  const packages = useResource('/api/packages');
  const money = (v) => formatMoney(v, company?.currency);
  const currency = company?.currency || 'INR';
  const [modal, setModal] = useState(() => (wanted ? { type: 'pick', mode: wanted } : null)); // { type: 'pick', mode } | { type: 'cancelEway', item } | { type: 'removeReceipt', item }
  const [busy, setBusy] = useState(false);
  const canEway = may('finances', 'create_eway_bill');

  const cancelEway = async (reason) => {
    setBusy(true);
    try {
      await api(`/api/billing/eway-bills/${modal.item.id}/cancel`, { method: 'POST', body: { reason } });
      toast.success(`Bill ${modal.item.ewayNo} cancelled — stock is back`);
      setModal(null);
      eways.reload();
    } catch (e) {
      showError(e, 'Bill was not cancelled');
    }
    setBusy(false);
  };

  const removeReceipt = async () => {
    setBusy(true);
    try {
      await api(`/api/billing/receipts/${modal.item.id}`, { method: 'DELETE' });
      toast.success(`Receipt ${modal.item.receiptNo} removed`);
      setModal(null);
      receipts.reload();
      overview.reload?.();
    } catch (e) {
      showError(e, 'Receipt was not removed');
    }
    setBusy(false);
  };

  const invoicePdf = async (inv, action) => {
    try {
      let params = { invoice: inv, pdfName: inv.pdfName, company, currency };
      if (inv.design) {
        const ledger = await api(`/api/billing/designs/${inv.design?.id || inv.design}`);
        params = { ...params, payments: ledger.payments, client: ledger.design.client || inv.client, quote: ledger.design.quote, proposalPricing: ledger.design.pricing, catalog: catalog.data, packages: packages.data };
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

  // the list rows carry the client's name only; the PDF wants the full client record, which the single-document read populates
  const ewayPdf = async (row, action) => {
    try {
      const full = await api(`/api/billing/eway-bills/${row.id}`);
      const params = { ewayBill: full, pdfName: full.pdfName, company, client: full.client, currency };
      if (action === 'view') await viewEwayBillDocument(params);
      else await downloadEwayBillDocument(params);
    } catch (e) {
      console.error(e);
      toast.error(action === 'view' ? 'The bill could not be opened.' : 'The bill could not be downloaded.');
    }
  };
  const challanPdf = async (row, action) => {
    try {
      const full = await api(`/api/billing/eway-bills/${row.id}`);
      const params = { ewayBill: full, company, client: full.client, currency };
      if (action === 'view') await viewChallanDocument(params);
      else await downloadChallanDocument(params);
    } catch (e) {
      console.error(e);
      toast.error(action === 'view' ? 'The challan could not be opened.' : 'The challan could not be downloaded.');
    }
  };
  const receiptPdf = async (row, action) => {
    try {
      const params = { receipt: row, pdfName: row.pdfName, company, client: row.client || row.billTo, currency };
      if (action === 'view') await viewReceiptDocument(params);
      else await downloadReceiptDocument(params);
      if (!row.pdfName) receipts.reload();
    } catch (e) {
      console.error(e);
      toast.error(action === 'view' ? 'The receipt could not be opened.' : 'The receipt could not be downloaded.');
    }
  };
  const billPdf = async (row, action) => {
    try {
      const full = await api(`/api/billing/bills/${row.id}`);
      const params = { bill: full, pdfName: full.pdfName, company, client: full.client, currency };
      if (action === 'view') await viewBillDocument(params);
      else await downloadBillDocument(params);
    } catch (e) {
      console.error(e);
      toast.error(action === 'view' ? 'The invoice could not be opened.' : 'The invoice could not be downloaded.');
    }
  };

  const dateFiltered = Boolean(addedFrom && addedTo);

  const firstPages = () => {
    setProposalPage(1);
    invoices.setPage(1);
    eways.setPage(1);
    bills.setPage(1);
    receipts.setPage(1);
  };

  const allProposals = useMemo(() => overview.data || [], [overview.data]);
  const proposals = useMemo(() => (show ? allProposals.filter(SHOWS[show].match) : allProposals), [allProposals, show]);
  const proposalPages = Math.max(1, Math.ceil(proposals.length / PAGE_SIZE) || 1);
  const proposalRows = useMemo(() => proposals.slice((proposalPage - 1) * PAGE_SIZE, proposalPage * PAGE_SIZE), [proposals, proposalPage]);

  const paged = (r) => ({ data: r.items, loading: r.loading, error: r.error, total: r.total, page: r.page, totalPages: r.totalPages, setPage: r.setPage });
  const cur = {
    proposals: { data: proposalRows, loading: overview.loading, error: overview.error, total: proposals.length, page: proposalPage, totalPages: proposalPages, setPage: setProposalPage },
    eway: paged(eways),
    receipts: paged(receipts),
    bills: paged(bills),
    invoices: paged(invoices),
  }[tab];

  const billedSum = allProposals.reduce((a, d) => a + (d.billed || 0), 0);
  const dueSum = allProposals.reduce((a, d) => a + Math.max(0, d.due || 0), 0); // an advance on one proposal never hides what another owes
  const received = allProposals.reduce((a, d) => a + d.paid, 0);
  const EMPTY = {
    proposals: ['No booked proposals yet', 'Mark a proposal as Booked and it will appear here, ready for bills and receipts.', FileText],
    eway: ['No bills yet', 'A bill lists the materials and services with tax. Start one with the Bill button above.', FileText],
    receipts: ['No receipts yet', 'When a client pays an advance or any other amount, record it with the Receipt button above.', HandCoins],
    bills: ['No invoices', 'Invoices made before bills and receipts replaced them are listed here.', Wallet],
    invoices: ['No older invoices', 'Older invoices and AMC parts invoices are listed here.', ReceiptText],
  };
  const partyCell = (row) => (
    <>
      <div className="max-w-[160px] truncate" title={row.client?.name}>{capName(row.client?.name)}</div>
      {row.design?.name ? <div className="max-w-[160px] truncate text-xs text-slate-500" title={row.design.name}>{capName(row.design.name)}</div> : <Badge tone="slate">No proposal</Badge>}
    </>
  );

  return (
    <>
      <PageHeader title="Billing" description={`A bill lists the materials and services with ${taxName()}, and comes with its delivery challan. A bill is paid when it is made; a receipt records any other money the client pays.`}>
        <BillingHeaderActions
          canEway={canEway}
          canReceipt={may('finances', 'create_bill')}
          onPick={(mode) => setModal({ type: 'pick', mode })}
        />
      </PageHeader>
      {overview.data && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[['Billed', money(billedSum)], ['Received', money(received)], ['Balance due', money(dueSum)]].map(([k, v]) => (
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
            firstPages();
          }}
        />
        <Tabs
          className="shrink-0"
          value={tab}
          onChange={(t) => { setTab(t); firstPages(); }}
          tabs={[
            { id: 'proposals', label: 'Booked proposals', icon: FileText, count: proposals.length },
            { id: 'eway', label: 'Bills', icon: FileText, count: eways.total },
            { id: 'receipts', label: 'Receipts', icon: HandCoins, count: receipts.total },
            (bills.total > 0 || tab === 'bills') && { id: 'bills', label: 'Invoices', icon: Wallet, count: bills.total },
            (invoices.total > 0 || tab === 'invoices') && { id: 'invoices', label: 'Older invoices', icon: ReceiptText, count: invoices.total },
          ].filter(Boolean)}
        />
      </div>
      {cur.error && <Alert className="mb-4">{cur.error}</Alert>}
      {show && tab === 'proposals' && <FilterNotice className="mb-4" label={SHOWS[show].label} count={overview.loading ? null : `${proposals.length} of ${allProposals.length}`} onClear={() => router.replace(basePath)} />}

      <Card className="overflow-hidden">
        {cur.loading ? <LoadingBlock /> : !cur.data?.length ? (
          <EmptyState
            icon={EMPTY[tab][2]}
            title={dateFiltered ? 'Nothing in this date range' : tab === 'proposals' && show ? 'Nothing here right now' : EMPTY[tab][0]}
            description={dateFiltered ? 'Try different dates or clear the range.' : tab === 'proposals' && show ? 'Nothing matches this list. Use “Show all” to see every booked proposal.' : EMPTY[tab][1]}
          />
        ) : tab === 'proposals' ? (
          <Table>
            <thead><tr><Th>Proposal</Th><Th>Client</Th><Th className="text-right">Proposal total</Th><Th className="text-right">Billed</Th><Th className="text-right">Received</Th><Th className="text-right">Balance due</Th><Th>Status</Th></tr></thead>
            <tbody>
              {cur.data.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium text-slate-900 hover:underline "><Link href={`${basePath}/${d.id}`} className="hover:text-brand-600">{capName(d.name)}</Link></Td>
                  <Td><div className="max-w-[160px] truncate" title={d.client?.name}>{capName(d.client?.name)}</div></Td>
                  <Td className="text-right tabular-nums">{money(d.total)}</Td>
                  <Td className="text-right tabular-nums">{money(d.billed || 0)}</Td>
                  <Td className="text-right tabular-nums">{money(d.paid)}</Td>
                  <Td className="text-right tabular-nums">{d.due < -0.005 ? <span className="text-slate-500" title={`${money(-d.due)} received before billing`}>Advance {money(-d.due)}</span> : money(d.due || 0)}</Td>
                  <Td>{!(d.billed > 0) ? (d.paid > 0 ? <Badge tone="amber">Advance received</Badge> : <Badge tone="brand">Not billed yet</Badge>) : d.due > 0.005 ? (d.paid > 0 ? <Badge tone="amber">Part paid</Badge> : <Badge tone="amber">Payment due</Badge>) : <Badge tone="green">Paid</Badge>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : tab === 'eway' ? (
          <Table>
            <thead><tr><Th>Bill</Th><Th>Date</Th><Th>Client · Proposal</Th><Th>Goods</Th><Th>Delivery</Th><Th className="text-right">Value</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {cur.data.map((e) => (
                <Tr key={e.id}>
                  <Td className="font-medium text-slate-900">{e.ewayNo}</Td>
                  <Td>{formatDate(e.issuedOn)}</Td>
                  <Td>{partyCell(e)}</Td>
                  <Td><div className="max-w-[220px] truncate text-slate-700" title={(e.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', ')}>{e.itemCount} item{e.itemCount === 1 ? '' : 's'} · {(e.lines || []).map((l) => l.name).join(', ')}</div></Td>
                  <Td>{e.transport?.vehicleNo || e.transport?.transporter || '—'}</Td>
                  <Td className="text-right tabular-nums">{money(e.total)}</Td>
                  <Td><Badge tone={EWAY_STATUS[e.status]?.tone}>{e.status === 'open' && e.paid?.settled ? 'Paid' : EWAY_STATUS[e.status]?.label || e.status}{e.bill?.billNo ? ` · ${e.bill.billNo}` : ''}</Badge></Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${e.ewayNo}`}
                        items={[
                          { key: 'view', icon: Eye, label: 'View bill', onClick: () => ewayPdf(e, 'view') },
                          { key: 'download', icon: Download, label: 'Download bill', onClick: () => ewayPdf(e, 'download') },
                          hasChallan(e) && { key: 'challan', icon: ScrollText, label: `View challan ${challanNoOf(e.ewayNo)}`, onClick: () => challanPdf(e, 'view') },
                          hasChallan(e) && { key: 'challan-download', icon: Truck, label: 'Download challan', onClick: () => challanPdf(e, 'download') },
                          { key: 'open', icon: ExternalLink, label: 'Open billing', href: partyBillingHref(basePath, partyOf(e)) },
                          canEway && e.status === 'open' && { key: 'cancel', icon: Ban, label: 'Cancel (stock goes back)', tone: 'danger', onClick: () => setModal({ type: 'cancelEway', item: e }) },
                        ]}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : tab === 'receipts' ? (
          <Table>
            <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Client · Proposal</Th><Th className="text-right">Amount</Th><Th>Paid by</Th><Th>Received by</Th><Th>Reason</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {cur.data.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-slate-900">{r.receiptNo}</Td>
                  <Td>{formatDate(r.receivedOn)}</Td>
                  <Td>{partyCell(r)}</Td>
                  <Td className="text-right tabular-nums">{money(r.amount)}</Td>
                  <Td>{PAYMENT_MODE_LABEL[r.mode]?.split(' (')[0] || r.mode}{r.reference && <div className="max-w-[140px] truncate text-xs text-slate-500">{r.reference}</div>}</Td>
                  <Td><div className="max-w-[140px] truncate" title={r.receivedByName || r.createdByName}>{r.receivedByName || r.createdByName || '—'}</div></Td>
                  <Td><div className="max-w-[200px] truncate text-slate-600" title={r.reason || r.note}>{r.reason || r.note || '—'}</div></Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${r.receiptNo}`}
                        items={[
                          { key: 'view', icon: Eye, label: 'View PDF', onClick: () => receiptPdf(r, 'view') },
                          { key: 'download', icon: Download, label: 'Download PDF', onClick: () => receiptPdf(r, 'download') },
                          (r.design || r.client) && { key: 'open', icon: ExternalLink, label: 'Open billing', href: partyBillingHref(basePath, partyOf(r)) },
                          isOwner && { key: 'remove', icon: Trash2, label: 'Remove receipt', tone: 'danger', onClick: () => setModal({ type: 'removeReceipt', item: r }) },
                        ]}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : tab === 'bills' ? (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Client · Proposal</Th><Th>Bills</Th><Th>Paid by</Th><Th className="text-right">Total</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {cur.data.map((b) => (
                <Tr key={b.id}>
                  <Td className="font-medium text-slate-900">{b.billNo}</Td>
                  <Td>{formatDate(b.issuedOn)}</Td>
                  <Td>{partyCell(b)}</Td>
                  <Td>{b.ewayBills?.length ? b.ewayBills.map((e) => e.ewayNo).join(', ') : <span className="text-slate-500">Services only</span>}{b.services?.length ? <div className="text-xs text-slate-500">{b.services.length} service{b.services.length === 1 ? '' : 's'}</div> : null}</Td>
                  <Td>{PAYMENT_MODE_LABEL[b.paid?.mode]?.split(' (')[0] || b.paid?.mode}{b.paid?.reference && <div className="max-w-[140px] truncate text-xs text-slate-500">{b.paid.reference}</div>}</Td>
                  <Td className="text-right tabular-nums">{money(b.total)}</Td>
                  <Td><Badge tone={BILL_STATUS[b.status]?.tone}>{BILL_STATUS[b.status]?.label || b.status}{b.invoice?.invoiceNo ? ` · ${b.invoice.invoiceNo}` : ''}</Badge></Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${b.billNo}`}
                        items={[
                          { key: 'view', icon: Eye, label: 'View PDF', onClick: () => billPdf(b, 'view') },
                          { key: 'download', icon: Download, label: 'Download PDF', onClick: () => billPdf(b, 'download') },
                          { key: 'open', icon: ExternalLink, label: 'Open billing', href: partyBillingHref(basePath, partyOf(b)) },
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
                  <Td className="font-medium text-slate-900">{i.invoiceNo}{i.kind === 'amc_parts' && <> <Badge tone="slate">AMC parts</Badge></>}{i.status === 'void' && <> <Badge tone="slate">Void</Badge></>}{i.bills?.length > 0 && <div className="text-xs font-normal text-slate-500">from {i.bills.length} invoice{i.bills.length === 1 ? '' : 's'}</div>}</Td>
                  <Td>{formatDate(i.issuedOn)}</Td>
                  <Td><div className="max-w-[160px] truncate" title={i.client?.name || i.billTo?.name}>{capName(i.client?.name || i.billTo?.name)}</div></Td>
                  <Td>{i.design ? i.title : <span className="inline-flex items-center gap-1.5">{i.title}<Badge tone="slate">{i.bills?.length ? 'No proposal' : 'Direct'}</Badge></span>}</Td>
                  <Td className="text-right tabular-nums">{money(i.total)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${i.invoiceNo}`}
                        items={[
                          { key: 'view', icon: Eye, label: 'View PDF', onClick: () => invoicePdf(i, 'view') },
                          { key: 'download', icon: Download, label: 'Download PDF', onClick: () => invoicePdf(i, 'download') },
                          (i.design || (i.client && i.bills?.length)) && { key: 'open', icon: ExternalLink, label: 'Open billing', href: partyBillingHref(basePath, { design: i.design?.id || i.design, client: i.client?.id || i.client }) },
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
          <TablePagination page={cur.page} totalPages={cur.totalPages} total={cur.total} pageSize={PAGE_SIZE} onPageChange={cur.setPage} />
        )}
      </Card>

      {modal?.type === 'pick' && <PartyPicker basePath={basePath} money={money} mode={modal.mode} onClose={() => { setModal(null); if (wanted) router.replace(basePath); }} />}
      {modal?.type === 'cancelEway' && <CancelEwayBillDialog open ewayBill={modal.item} onClose={() => setModal(null)} onConfirm={cancelEway} busy={busy} />}
      {modal?.type === 'removeReceipt' && (
        <ConfirmDialog open onClose={() => setModal(null)} onConfirm={removeReceipt} title={`Remove receipt ${modal.item.receiptNo}?`} confirmLabel="Remove receipt" busy={busy}>
          <p>{money(modal.item.amount)} comes off what this client has paid, and the number {modal.item.receiptNo} is not used again. Do this only for a receipt made by mistake.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
