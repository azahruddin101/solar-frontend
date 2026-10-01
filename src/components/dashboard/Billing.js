'use client';

// Billing overview: won proposals with what has been received, plus every receipt and invoice issued.
// Invoices can be started from here: pick a client and a booked proposal, or make a "direct" invoice for anyone.
import { Download, FileText, Receipt, ReceiptText, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { openFile } from '@/lib/files';
import { buildInvoicePdfBlob, downloadBlob, generateInvoicePdf } from '@/lib/invoicePdf';
import { useResource, usePaginatedResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdf';
import { Alert, Badge, Button, Card, EmptyState, FormField, FormModal, LoadingBlock, PageHeader, Select, Table, TablePagination, Tabs, Td, Th, Tr, buttonClass, formatDate, showError, toast } from '../kit';
import InvoiceGenerateModal from './InvoiceGenerateModal';

const PAGE_SIZE = 10;

const proposalTotal = (d) => Number(d.summary?.pricing?.total ?? d.summary?.cost ?? 0);

/** Step 1: client. Step 2: one of their booked, priced proposals. Then the proposal's billing page opens with the invoice form. */
function ProposalPicker({ basePath, money, onClose }) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [designId, setDesignId] = useState('');
  const [error, setError] = useState('');
  const clients = useResource('/api/clients?limit=200');
  const designs = useResource(clientId ? `/api/designs?client=${clientId}&limit=200` : null);
  const invoiceable = (designs.data?.items || []).filter((d) => d.status === 'won' && proposalTotal(d) > 0);
  const submit = () => {
    if (!clientId) return setError('Choose a client');
    if (!designId) return setError('Choose a proposal');
    router.push(`${basePath}/${designId}?invoice=1`);
  };
  return (
    <FormModal open onClose={onClose} title="Generate invoice" description="Choose the client, then the booked proposal to invoice." submitLabel="Continue" error={error} onSubmit={submit} noValidate>
      <FormField label="Client">
        <Select value={clientId} onValue={(v) => { setClientId(v); setDesignId(''); setError(''); }}>
          <option value="">{clients.loading ? 'Loading clients…' : 'Choose a client'}</option>
          {(clients.data?.items || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
        </Select>
      </FormField>
      <FormField label="Proposal" hint={clientId && !designs.loading && !invoiceable.length ? 'This client has no booked proposal with a price. Mark the proposal as Booked first, or make a direct invoice.' : 'Only booked proposals with a price can be invoiced.'}>
        <Select value={designId} onValue={(v) => { setDesignId(v); setError(''); }} disabled={!clientId || designs.loading}>
          <option value="">{!clientId ? 'Choose a client first' : designs.loading ? 'Loading proposals…' : invoiceable.length ? 'Choose a proposal' : 'No booked proposals'}</option>
          {invoiceable.map((d) => <option key={d.id} value={d.id}>{d.name} · {money(proposalTotal(d))}</option>)}
        </Select>
      </FormField>
      {designs.error && <Alert>{designs.error}</Alert>}
    </FormModal>
  );
}

export default function Billing({ basePath = '/dashboard/billing' }) {
  const company = useSession((s) => s.company);
  const [tab, setTab] = useState('proposals');
  const [proposalPage, setProposalPage] = useState(1);
  const overview = useResource('/api/billing/overview');
  const receipts = usePaginatedResource('/api/billing/payments', { limit: PAGE_SIZE });
  const invoices = usePaginatedResource('/api/billing/invoices', { limit: PAGE_SIZE });
  const money = (v) => formatMoney(v, company?.currency);
  const currency = company?.currency || 'INR';
  const [modal, setModal] = useState(null); // 'pick' | 'direct'
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
      showError(e, 'Invoice was not generated');
    }
    setBusy(false);
  };

  /** A direct invoice has no proposal page to open: show its archived PDF, or rebuild it from the frozen pricing. */
  const openDirectInvoice = async (inv) => {
    try {
      if (inv.pdfName) await openFile(`/uploads/${inv.pdfName}`);
      else await generateInvoicePdf({ invoice: inv, company, client: inv.billTo, currency });
    } catch (e) {
      console.error(e);
      toast.error('The invoice could not be opened. Please try again.');
    }
  };

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
        <Button variant="secondary" icon={Zap} onClick={() => setModal('direct')}>Direct invoice</Button>
        <Button variant="primary" icon={ReceiptText} onClick={() => setModal('pick')}>Generate invoice</Button>
      </PageHeader>
      {overview.data && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[['Booked proposals', proposals.length], ['Received', money(received)], ['Outstanding', money(outstanding)]].map(([k, v]) => (
            <Card key={k} className="p-4"><div className="text-xs font-medium text-slate-500">{k}</div><div className="mt-1 text-xl font-semibold text-slate-900">{v}</div></Card>
          ))}
        </div>
      )}
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ id: 'proposals', label: 'Booked proposals', icon: FileText, count: proposals.length }, { id: 'receipts', label: 'Receipts', icon: Receipt, count: receipts.total }, { id: 'invoices', label: 'Invoices', icon: ReceiptText, count: invoices.total }]} />
      {cur.error && <Alert className="mb-4">{cur.error}</Alert>}

      <Card className="overflow-hidden">
        {cur.loading ? <LoadingBlock /> : !cur.data?.length ? (
          <EmptyState icon={tab === 'invoices' ? ReceiptText : Receipt} title={tab === 'proposals' ? 'No booked proposals yet' : tab === 'receipts' ? 'No receipts yet' : 'No invoices yet'} description={tab === 'proposals' ? 'Mark a proposal as Booked and it will appear here, ready for payments.' : 'They appear here as you record payments.'} />
        ) : tab === 'proposals' ? (
          <Table>
            <thead><tr><Th>Proposal</Th><Th>Client</Th><Th className="text-right">Total</Th><Th className="text-right">Received</Th><Th className="text-right">Balance</Th><Th>Status</Th><Th className="text-right">Action</Th></tr></thead>
            <tbody>
              {cur.data.map((d) => (
                <Tr key={d.id}>
                  <Td className="font-medium text-slate-900">{d.name}</Td>
                  <Td><div className="max-w-[160px] truncate" title={d.client?.name}>{d.client?.name}</div></Td>
                  <Td className="text-right tabular-nums">{money(d.total)}</Td>
                  <Td className="text-right tabular-nums">{money(d.paid)}</Td>
                  <Td className="text-right tabular-nums">{money(d.balance)}</Td>
                  <Td>{d.invoiceNo ? <Badge tone="green">Invoiced · {d.invoiceNo}</Badge> : d.total > 0 ? <Badge tone="brand">Invoice pending</Badge> : d.paid > 0 ? <Badge tone="amber">Part paid</Badge> : <Badge tone="slate">No payment</Badge>}</Td>
                  <Td className="text-right"><Link href={`${basePath}/${d.id}`} className={buttonClass({ size: 'sm' })}>Manage</Link></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : tab === 'receipts' ? (
          <Table>
            <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Client</Th><Th>Proposal</Th><Th>Mode</Th><Th className="text-right">Amount</Th><Th className="text-right">Balance after</Th><Th className="text-right">Action</Th></tr></thead>
            <tbody>
              {cur.data.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-slate-900">{p.receiptNo}</Td>
                  <Td>{formatDate(p.receivedOn)}</Td>
                  <Td><div className="max-w-[160px] truncate" title={p.client?.name}>{p.client?.name}</div></Td>
                  <Td>{p.design?.name}</Td>
                  <Td>{PAYMENT_MODE_LABEL[p.mode]?.split(' (')[0] || p.mode}</Td>
                  <Td className="text-right tabular-nums">{money(p.amount)}</Td>
                  <Td className="text-right tabular-nums">{money(p.balanceAfter)}</Td>
                  <Td className="text-right"><Link href={`${basePath}/${p.design?.id}`} className={buttonClass({ size: 'sm', variant: 'ghost' })}>Open</Link></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Client</Th><Th>Proposal</Th><Th className="text-right">Total</Th><Th className="text-right">Action</Th></tr></thead>
            <tbody>
              {cur.data.map((i) => (
                <Tr key={i.id}>
                  <Td className="font-medium text-slate-900">{i.invoiceNo}</Td>
                  <Td>{formatDate(i.issuedOn)}</Td>
                  <Td><div className="max-w-[160px] truncate" title={i.client?.name || i.billTo?.name}>{i.client?.name || i.billTo?.name}</div></Td>
                  <Td>{i.design ? i.title : <span className="inline-flex items-center gap-1.5">{i.title}<Badge tone="slate">Direct</Badge></span>}</Td>
                  <Td className="text-right tabular-nums">{money(i.total)}</Td>
                  <Td className="text-right">
                    {i.design ? (
                      <Link href={`${basePath}/${i.design}`} className={buttonClass({ size: 'sm', variant: 'ghost' })}>Open</Link>
                    ) : (
                      <Button size="sm" variant="ghost" icon={Download} onClick={() => openDirectInvoice(i)}>PDF</Button>
                    )}
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

      {modal === 'pick' && <ProposalPicker basePath={basePath} money={money} onClose={() => setModal(null)} />}
      {modal === 'direct' && <InvoiceGenerateModal open onClose={() => setModal(null)} currency={currency} busy={busy} onSubmit={generateDirect} />}
    </>
  );
}
