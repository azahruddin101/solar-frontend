'use client';

// Read-only overview of one design: its current summary plus every quotation PDF ever downloaded for it,
// each snapshotting the design's data/summary at that moment so previous versions stay traceable and restorable.
import { ArrowLeft, Clock, Eye, History, Loader2, PenLine, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useSignedUrl } from '@/lib/files';
import { formatMoney, formatNumber } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useStore } from '@/lib/store';
import { useResource } from '@/lib/useResource';
import { Alert, Card, CardHeader, EmptyState, LoadingBlock, Modal, Table, Td, Th, Tr, formatDate, toast, buttonClass } from '../kit';
import { DesignStatusBadge, designHref } from './shared';

const formatDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—');

function PdfPreviewModal({ url, onClose }) {
  const signed = useSignedUrl(url);
  return (
    <Modal open onClose={onClose} title="Quotation PDF" size="2xl">
      <div className="h-[78vh]">
        {signed ? (
          <iframe src={signed} title="Quotation PDF" className="h-full w-full rounded-lg border border-slate-200" />
        ) : (
          <LoadingBlock label="Opening PDF…" />
        )}
      </div>
    </Modal>
  );
}

export default function DesignDetail({ designId, basePath = '/dashboard/designs' }) {
  const router = useRouter();
  const company = useSession((s) => s.company);
  const { data: design, loading, error } = useResource(`/api/designs/${designId}`);
  const versions = useResource(`/api/designs/${designId}/versions`);
  const money = (v) => formatMoney(v || 0, company?.currency);
  const [preview, setPreview] = useState(null); // /uploads/<name> of the PDF being viewed
  const [restoringId, setRestoringId] = useState(null); // the version currently being restored

  if (loading) return <LoadingBlock />;
  if (error || !design) return <Alert>{error || 'Proposal not found'}</Alert>;

  const s = design.summary || {};
  const stats = [
    ['System size', s.kwp ? `${s.kwp.toFixed(2)} kWp` : '—'],
    ['Panels', s.panels || '—'],
    ['Annual energy', s.annualKwh ? `${formatNumber(s.annualKwh)} kWh` : '—'],
    ['Proposal value', money(s.cost)],
  ];

  /** Restores this version's data, then opens the editor straight away so the change is obvious. */
  const restore = async (v) => {
    setRestoringId(v.id);
    try {
      const updated = await api(`/api/designs/${designId}/versions/${v.id}/restore`, { method: 'POST' });
      // the builder skips re-fetching a design it already has loaded — force a fresh load of the restored data
      if (useStore.getState().designId === designId) useStore.getState().reset();
      router.push(designHref(updated));
    } catch (e) {
      toast.error(e.message);
      setRestoringId(null);
    }
  };

  return (
    <>
      <Link href={basePath} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Proposals</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{design.name}</h1>
          <p className="text-sm text-slate-500">
            {design.client?.name} · <DesignStatusBadge status={design.status} /> · {design.type === 'quick' ? 'Quick proposal' : '3D proposal'}
          </p>
        </div>
        <Link href={designHref(design)} className={buttonClass({ variant: 'primary' })}><PenLine className="h-4 w-4" />Edit proposal</Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([l, v]) => (
          <Card key={l} className="p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">{l}</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{v}</div>
          </Card>
        ))}
      </div>

      <Card className="mb-6 overflow-hidden">
        <CardHeader title="Details" />
        <div className="grid gap-4 border-t border-slate-100 px-6 py-4 text-sm sm:grid-cols-2">
          <div><span className="text-slate-400">Address</span><div className="text-slate-800">{s.address || '—'}</div></div>
          <div><span className="text-slate-400">Valid until</span><div className="text-slate-800">{design.validUntil ? formatDate(design.validUntil) : '—'}</div></div>
          <div><span className="text-slate-400">Created</span><div className="text-slate-800">{formatDate(design.createdAt)}</div></div>
          <div><span className="text-slate-400">Last updated</span><div className="text-slate-800">{formatDate(design.updatedAt)}</div></div>
          <div><span className="text-slate-400">Billing name</span><div className="text-slate-800">{design.billingName || design.client?.name || '—'}</div></div>
          <div><span className="text-slate-400">Grid type</span><div className="text-slate-800">{design.gridType === 'off_grid' ? 'Off Grid' : 'On Grid'}</div></div>
          <div><span className="text-slate-400">Loan</span><div className="text-slate-800">{design.loanRequired ? 'Yes' : 'No'}</div></div>
          <div><span className="text-slate-400">Cleaning</span><div className="text-slate-800">{design.cleaningFrequency ? `${design.cleaningFrequency}/year${design.cleaningCharge ? ` · ${money(design.cleaningCharge)} each` : ''}` : '—'}</div></div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Version history" description="Every quotation PDF downloaded for this proposal, archived so previous versions stay traceable. Restoring one brings the proposal back to that snapshot." />
        {versions.loading ? (
          <LoadingBlock />
        ) : versions.error ? (
          <Alert className="m-6">{versions.error}</Alert>
        ) : !versions.data?.length ? (
          <EmptyState icon={History} title="No versions yet" description="A version is saved automatically every time the quotation PDF is downloaded." />
        ) : (
          <Table>
            <thead><tr><Th>Downloaded</Th><Th>By</Th><Th className="text-right">System</Th><Th className="text-right">Value</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {versions.data.map((v) => (
                <Tr key={v.id}>
                  <Td className="whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-slate-700"><Clock className="h-3.5 w-3.5 text-slate-400" />{formatDateTime(v.createdAt)}</span></Td>
                  <Td>{v.createdBy?.name || v.createdBy?.email || 'System'}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{v.summary?.kwp ? `${v.summary.kwp.toFixed(2)} kWp · ${v.summary.panels || 0} panels` : '—'}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{money(v.summary?.cost)}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => setPreview(`/uploads/${v.pdfName}`)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
                        <Eye className="h-4 w-4" />View
                      </button>
                      <button type="button" onClick={() => restore(v)} disabled={Boolean(restoringId)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline disabled:opacity-50">
                        {restoringId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Restore & edit
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {preview && <PdfPreviewModal url={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
