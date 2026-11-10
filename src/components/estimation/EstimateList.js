'use client';

// Saved estimates: search, open, delete, or start a new one.
import { Calculator, Download, Eye, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { fmtPdfDate } from '@/lib/billingPdfShared';
import { useSession } from '@/lib/session';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, LoadingBlock, PageHeader, closePdfViewer, openPdfViewer, openPdfViewerLoading, toast } from '../kit';
import { taxName } from '@/lib/tax';

export default function EstimateList() {
  const may = useCan();
  const company = useSession((s) => s.company);
  const currency = company?.currency || 'INR';
  const [pdfBusy, setPdfBusy] = useState(''); // id of the estimate whose PDF is being made
  const { data, loading, error, setData } = useResource('/api/estimates');
  const [q, setQ] = useState('');
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data || []).filter((e) => !needle || `${e.client?.name} ${e.client?.phone}`.toLowerCase().includes(needle));
  }, [data, q]);

  /** The list leaves out the lines, so fetch the estimate, then draw its PDF here in the browser. `view` shows it in the PDF viewer modal. */
  const makePdf = async (e, view) => {
    if (view) openPdfViewerLoading(`Estimate — ${e.client?.name || 'client'}`);
    setPdfBusy(e.id);
    try {
      const full = await api(`/api/estimates/${e.id}`);
      const { buildEstimatePdfBlob } = await import('@/lib/estimationPdf');
      const { blob, filename } = await buildEstimatePdfBlob({ estimate: full, company, currency });
      if (view) {
        openPdfViewer({ title: `Estimate — ${e.client?.name || 'client'}`, blob, downloadName: filename });
      } else {
        const { downloadBlob } = await import('@/lib/invoicePdf');
        downloadBlob(blob, filename);
      }
    } catch (err) {
      if (view) closePdfViewer();
      console.error(err);
      toast.error('Sorry, the PDF could not be created. Please try again.');
    }
    setPdfBusy('');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/estimates/${removing.id}`, { method: 'DELETE' });
      setData((list) => list.filter((e) => e.id !== removing.id));
      toast.success('Estimate deleted');
      setRemoving(null);
    } catch (e) {
      toast.error(e.message || 'Could not delete the estimate');
    }
    setBusy(false);
  };

  const newButton = may('proposals', 'create') && <Link href="/dashboard/estimation/new"><Button variant="primary" icon={Plus}>New estimate</Button></Link>;

  return (
    <div className="space-y-6">
      <PageHeader title="Estimation" description="Quick price estimates for clients, from packages, products and services — with or without tax.">{newButton}</PageHeader>
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Card><LoadingBlock /></Card> : !data?.length ? (
        <Card>
          <EmptyState icon={Calculator} title="No estimates yet" description="Create one by picking products, packages and services for a client.">{newButton}</EmptyState>
        </Card>
      ) : (
        <Card>
          <div className="border-b border-slate-100 p-4">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input aria-label="Search estimates" placeholder="Search by client…" value={q} onValue={setQ} className="pl-9" />
            </div>
          </div>
          {!rows.length ? <p className="p-6 text-sm text-slate-500">No estimate matches your search.</p> : (
            <ul className="divide-y divide-slate-100">
              {rows.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-6">
                  <Link href={`/dashboard/estimation/${e.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{e.client?.name || 'Client'}</div>
                    <div className="truncate text-xs text-slate-500">{fmtPdfDate(e.date || e.createdAt)}{e.createdByName ? ` · ${e.createdByName}` : ''}{e.client?.phone ? ` · ${e.client.phone}` : ''}</div>
                  </Link>
                  <Badge tone={e.withGst ? 'blue' : 'slate'}>{e.withGst ? `With ${taxName()}` : `No ${taxName()}`}</Badge>
                  <div className="w-28 text-right text-sm font-semibold tabular-nums text-slate-900">{formatMoney(e.total, currency, { decimals: 2 })}</div>
                  <div className="flex shrink-0 items-center">
                    <IconButton icon={Eye} label={`View PDF for ${e.client?.name}`} title="View PDF" loading={pdfBusy === e.id} disabled={Boolean(pdfBusy)} onClick={() => makePdf(e, true)} className="h-9 w-9" />
                    <IconButton icon={Download} label={`Download PDF for ${e.client?.name}`} title="Download PDF" loading={pdfBusy === e.id} disabled={Boolean(pdfBusy)} onClick={() => makePdf(e, false)} className="h-9 w-9" />
                  </div>
                  {may('proposals', 'delete') && (
                    <button type="button" aria-label={`Delete estimate for ${e.client?.name}`} onClick={() => setRemoving(e)} className="grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <ConfirmDialog open={Boolean(removing)} title="Delete this estimate?" confirmLabel="Delete" busy={busy} onConfirm={remove} onClose={() => setRemoving(null)}>
        The estimate for {removing?.client?.name || 'this client'} will be removed for good.
      </ConfirmDialog>
    </div>
  );
}
