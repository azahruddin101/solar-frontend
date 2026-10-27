'use client';

// One proposal's loan: bank, amount and status, and the loan steps with a remark the client sees on each and the
// company's documents for it (PDF, images, Excel), which open through a signed link (lib/files.js): PDFs and images in
// the in-page viewers, Excel as a download.
import { ArrowLeft, Check, Download, Eye, FileImage, FileSpreadsheet, FileText, ListPlus, Paperclip, Pencil, Trash2, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { signedFileUrl, useSignedUrl } from '@/lib/files';
import { useResource } from '@/lib/useResource';
import { useCan } from '@/lib/useCan';
import { Alert, Button, Card, CardHeader, ConfirmDialog, EmptyState, FormField, IconButton, Input, LoadingBlock, PageHeader, Select, TablePagination, Textarea, cx, openImage, openPdfViewer, showError, timeAgo, toast, UploadProgress, useUploadQueue } from '../kit';
import { Progress, STEP_STATUSES } from '../installations/shared';
import { LOAN_STATUSES, LoanStatusBadge, LoanTimeline } from './shared';

const LOG_TEXT = {
  opened: () => 'opened the loan',
  status_changed: (l) => `marked the loan ${LOAN_STATUSES.find((s) => s.id === l.message)?.label.toLowerCase() || l.message}`,
  step_done: (l) => `completed “${l.stepName}”`,
  step_in_progress: (l) => `started “${l.stepName}”`,
  step_pending: (l) => `reopened “${l.stepName}”`,
  steps_added: (l) => `added steps: ${l.message}`,
  document_added: (l) => `added “${l.message}” to “${l.stepName}”`,
  document_removed: (l) => `removed “${l.message}” from “${l.stepName}”`,
  document_renamed: (l) => {
    const [from, to] = String(l.message).split(' → ');
    return to ? `renamed “${from}” to “${to}” in “${l.stepName}”` : `renamed a document in “${l.stepName}”`;
  },
};

const MAX_STEP_DOCUMENTS = 20;
const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
const ALLOWED = /\.(pdf|png|jpe?g|webp|xlsx|xls)$/i;

const sizeLabel = (bytes) => {
  const n = Number(bytes) || 0;
  if (!n) return '';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

// What a document is comes from its stored file (`url`), never its name, which the company may change.
const extOf = (d) => (String(d.url || d.name).match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
const kindOf = (d) => {
  const ext = extOf(d);
  if (/^\.xlsx?$/.test(ext)) return 'sheet';
  if (/^\.(png|jpe?g|webp)$/.test(ext)) return 'image';
  return 'pdf';
};
const KIND = {
  pdf: { Icon: FileText, tone: 'bg-red-50 text-red-600', label: 'PDF' },
  image: { Icon: FileImage, tone: 'bg-sky-50 text-sky-600', label: 'Image' },
  sheet: { Icon: FileSpreadsheet, tone: 'bg-emerald-50 text-emerald-600', label: 'Excel' },
};
/** The name without the extension (what is edited); the extension stays with the file. */
const baseName = (d) => {
  const ext = extOf(d);
  return ext && d.name.toLowerCase().endsWith(ext) ? d.name.slice(0, -ext.length) : d.name;
};

/** The stored file's signed link; `download` makes the browser save it under the document's name instead of showing it. */
async function documentLink(d, { download } = {}) {
  const link = new URL(await signedFileUrl(d.url), window.location.href);
  if (download) link.searchParams.set('download', d.name);
  return link.href;
}

/** Saves a document under its own name, as an ordinary browser download (with its progress) rather than in the page. */
async function downloadDocument(d) {
  try {
    const a = document.createElement('a');
    a.href = await documentLink(d, { download: true });
    a.rel = 'noopener';
    a.click();
  } catch (e) {
    showError(e, 'The document could not be downloaded');
  }
}

/** PDFs and images open in the in-page viewer; Excel downloads. */
async function viewDocument(d) {
  const kind = kindOf(d);
  if (kind === 'sheet') return downloadDocument(d);
  try {
    if (kind === 'image') openImage(await documentLink(d), d.name);
    else openPdfViewer({ title: d.name, src: await documentLink(d), downloadSrc: await documentLink(d, { download: true }), downloadName: d.name });
  } catch (e) {
    showError(e, 'The document could not be opened');
  }
}

/** A small preview: the picture itself for images, the file-type icon otherwise. */
function DocThumb({ doc, className }) {
  const kind = kindOf(doc);
  const src = useSignedUrl(kind === 'image' ? doc.url : '');
  const { Icon, tone } = KIND[kind];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cx('shrink-0 rounded-md object-cover ring-1 ring-slate-200', className)} />;
  }
  return <span className={cx('grid shrink-0 place-items-center rounded-md', tone, className)}><Icon className="h-4 w-4" /></span>;
}

/** One document: open it, and with `canEdit` rename (in place) or remove it. */
function DocumentRow({ loanId, step, doc, canEdit, busy, setBusy, onChanged, onRemove }) {
  const [name, setName] = useState(null); // the name being edited, null when not editing
  const kind = kindOf(doc);
  const ext = extOf(doc);

  const rename = async () => {
    const next = name.trim();
    if (!next) return toast.error('Give the document a name');
    if (next === baseName(doc)) return setName(null);
    setBusy(doc.id);
    try {
      onChanged(await api(`/api/loans/${loanId}/steps/${step.id}/documents/${doc.id}`, { method: 'PUT', body: { name: `${next}${ext}` } }));
      toast.success('Document renamed');
      setName(null);
    } catch (e) {
      showError(e, 'The document was not renamed');
    }
    setBusy('');
  };

  return (
    <li className="flex items-center gap-3 py-2.5">
      <DocThumb doc={doc} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        {name !== null ? (
          <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); rename(); }}>
            <div className="flex min-w-0 flex-1 items-center rounded-md border border-slate-300 bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-muted/60">
              <input
                autoFocus
                aria-label="Document name"
                maxLength={200 - ext.length}
                value={name}
                disabled={busy === doc.id}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setName(null); } }}
                style={{ outline: 'none' }} // the box around it shows the focus
                className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm text-slate-900"
              />
              {ext && <span className="pr-2 text-xs text-slate-400">{ext}</span>}
            </div>
            <IconButton type="submit" icon={Check} label="Save name" disabled={busy === doc.id} className="text-emerald-600" />
            <IconButton icon={X} label="Cancel" disabled={busy === doc.id} onClick={() => setName(null)} />
          </form>
        ) : (
          <button type="button" onClick={() => viewDocument(doc)} className="block max-w-full truncate text-left text-sm font-medium text-slate-900 hover:text-brand hover:underline" title={kind === 'sheet' ? `Download ${doc.name}` : `View ${doc.name}`}>{doc.name}</button>
        )}
        <span className="block truncate text-xs text-slate-500">{[KIND[kind].label, sizeLabel(doc.size), doc.byName, doc.uploadedAt && timeAgo(doc.uploadedAt)].filter(Boolean).join(' · ')}</span>
      </div>
      {name === null && (
        <div className="flex shrink-0 items-center">
          {kind !== 'sheet' && <IconButton icon={Eye} label={`View ${doc.name}`} onClick={() => viewDocument(doc)} />}
          <IconButton icon={Download} label={`Download ${doc.name}`} onClick={() => downloadDocument(doc)} />
          {canEdit && <IconButton icon={Pencil} label={`Rename ${doc.name}`} disabled={Boolean(busy)} onClick={() => setName(baseName(doc))} />}
          {canEdit && <IconButton icon={Trash2} label={`Remove ${doc.name}`} tone="danger" disabled={Boolean(busy)} onClick={() => onRemove(doc)} />}
        </div>
      )}
    </li>
  );
}

/** A step's documents: view, download; with `canEdit`, upload (several at once, or dropped on it), rename or remove. */
function StepDocuments({ loanId, step, canEdit, onChanged }) {
  const input = useRef(null);
  const [busy, setBusy] = useState('');
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(null);
  const queue = useUploadQueue();
  const documents = step.documents || [];
  const room = MAX_STEP_DOCUMENTS - documents.length;
  const canAdd = canEdit && room > 0 && !busy;

  const upload = async (fileList) => {
    const all = Array.from(fileList || []);
    const valid = all.filter((f) => ALLOWED.test(f.name) && f.size <= MAX_BYTES);
    if (valid.length < all.length) toast.error('Only PDF, PNG, JPG, WebP or Excel files up to 20 MB can be added');
    if (valid.length > room) toast.error(`A step can keep up to ${MAX_STEP_DOCUMENTS} documents`);
    const files = valid.slice(0, Math.max(0, room));
    if (!files.length) return;
    setBusy('upload');
    try {
      const added = await queue.run(files, async (file, progress) => {
        const form = new FormData();
        form.append('file', file);
        onChanged(await api(`/api/loans/${loanId}/steps/${step.id}/documents`, { method: 'POST', form, ...progress }));
      });
      toast.success(added > 1 ? `${added} documents added` : 'Document added');
    } catch (e) {
      const added = e.uploaded ? `${e.uploaded} of ${files.length} documents were added` : '';
      if (e.name === 'AbortError') toast.success(added ? `${added} before the upload was cancelled` : 'Upload cancelled');
      else showError(e, added || 'The document was not uploaded');
    }
    setBusy('');
  };

  const remove = async () => {
    const doc = removing;
    setBusy(doc.id);
    try {
      onChanged(await api(`/api/loans/${loanId}/steps/${step.id}/documents/${doc.id}`, { method: 'DELETE' }));
      toast.success('Document removed');
      setRemoving(null);
    } catch (e) {
      showError(e, 'The document was not removed');
    }
    setBusy('');
  };

  const drop = canEdit
    ? {
        onDragOver: (e) => { e.preventDefault(); if (canAdd) setDragging(true); },
        onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
        onDrop: (e) => { e.preventDefault(); setDragging(false); if (canAdd) upload(e.dataTransfer.files); },
      }
    : {};
  const picker = canEdit && <input ref={input} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />;

  if (!documents.length) {
    if (!canEdit) return null;
    return (
      <div {...drop} className="mt-2">
        {picker}
        {queue.progress ? (
          <UploadProgress progress={queue.progress} onCancel={queue.cancel} />
        ) : (
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => input.current?.click()}
            className={cx('flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[13px] transition-colors', dragging ? 'border-brand bg-brand/5 text-brand' : 'border-slate-200 text-slate-500 hover:border-brand hover:text-brand')}
          >
            <Paperclip className="h-4 w-4" />
            {dragging ? 'Drop to attach' : 'Attach documents'}
            <span className="ml-auto text-xs text-slate-400">PDF, image or Excel · drop files here</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div {...drop} className={cx('mt-2 rounded-lg border transition-colors', dragging ? 'border-brand bg-brand/5' : 'border-slate-200')}>
      {picker}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 pr-1.5 pl-3">
        <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <Paperclip className="h-3.5 w-3.5" /> Documents
          <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{documents.length}</span>
        </span>
        {canEdit && (
          <Button size="sm" variant="ghost" icon={Upload} disabled={!canAdd} onClick={() => input.current?.click()} title={room > 0 ? 'Attach PDF, image or Excel files (or drop them here)' : `Up to ${MAX_STEP_DOCUMENTS} documents per step`}>
            {dragging ? 'Drop to attach' : 'Attach'}
          </Button>
        )}
      </div>
      {queue.progress && <UploadProgress progress={queue.progress} onCancel={queue.cancel} className="mx-3 mt-2.5" />}
      <ul className="divide-y divide-slate-100 px-3">
        {documents.map((d) => (
          <DocumentRow key={d.id} loanId={loanId} step={step} doc={d} canEdit={canEdit} busy={busy} setBusy={setBusy} onChanged={onChanged} onRemove={setRemoving} />
        ))}
      </ul>
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} title="Remove document?" confirmLabel="Remove" busy={Boolean(removing) && busy === removing.id}>
        <p className="text-sm text-slate-600">“{removing?.name}” will be removed from “{step.name}” and the file deleted. This can’t be undone.</p>
      </ConfirmDialog>
    </div>
  );
}

/** Every document of the loan, grouped by step, so they can be found without scrolling the steps. */
function DocumentsOverview({ steps }) {
  const groups = steps.map((s, i) => ({ step: s, n: i + 1, docs: s.documents || [] })).filter((g) => g.docs.length);
  if (!groups.length) return null;
  const total = groups.reduce((sum, g) => sum + g.docs.length, 0);
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Documents</h3>
        <span className="text-xs text-slate-500">{total} {total === 1 ? 'file' : 'files'} · {groups.length} {groups.length === 1 ? 'step' : 'steps'}</span>
      </div>
      <div className="space-y-4">
        {groups.map(({ step, n, docs }) => (
          <div key={step.id}>
            <p className="mb-1 truncate text-xs font-medium tracking-wide text-slate-400 uppercase">{n}. {step.name}</p>
            <ul className="space-y-0.5">
              {docs.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => viewDocument(d)} title={kindOf(d) === 'sheet' ? `Download ${d.name}` : `View ${d.name}`} className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-slate-50">
                    <DocThumb doc={d} className="h-7 w-7" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">{d.name}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{sizeLabel(d.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StepControls({ step, disabled, onSave }) {
  const [remark, setRemark] = useState(step.remark || '');
  const [busy, setBusy] = useState(false);
  const save = async (body) => {
    setBusy(true);
    await onSave(step, body);
    setBusy(false);
  };
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr_auto]">
      <Select aria-label={`${step.name} status`} value={step.status} disabled={disabled || busy} onValue={(status) => save({ status })}>
        {STEP_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </Select>
      <Input aria-label={`${step.name} remark`} maxLength={500} value={remark} disabled={disabled} onValue={setRemark} placeholder="Remark for the client (optional)" />
      <Button size="sm" disabled={disabled || remark === (step.remark || '')} loading={busy} onClick={() => save({ remark })}>Save remark</Button>
    </div>
  );
}

const ACTIVITY_PAGE = 5;

/** The loan's history, newest first, a page at a time. */
function LoanActivity({ logs = [] }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(logs.length / ACTIVITY_PAGE));
  const current = Math.min(page, pages); // stays in range when entries come or go
  if (!logs.length) return null;
  const shown = [...logs].reverse().slice((current - 1) * ACTIVITY_PAGE, current * ACTIVITY_PAGE);
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Activity</h3>
      <ul className="space-y-2.5">
        {shown.map((l) => (
          <li key={l.id} className="text-[13px] text-slate-600">
            <span className="font-medium text-slate-800">{l.byName}</span> {(LOG_TEXT[l.action] || (() => l.action))(l)}
            <span className="block text-xs text-slate-400">{timeAgo(l.at)}</span>
          </li>
        ))}
      </ul>
      <TablePagination page={current} total={logs.length} pageSize={ACTIVITY_PAGE} onPageChange={setPage} className="-mx-5 mt-4 -mb-5 px-5" />
    </Card>
  );
}

export default function LoanDetail({ id, basePath = '/dashboard/loans', clientsPath = '/dashboard/clients', designsPath = '/dashboard/designs' }) {
  const may = useCan();
  const canEdit = may('loans', 'update');
  const { data: loan, setData, loading, error } = useResource(`/api/loans/${id}`);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loan) setForm({ lender: loan.lender || '', amount: loan.amount ?? '', status: loan.status, notes: loan.notes || '' });
  }, [loan]);

  const saveDetails = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setData(await api(`/api/loans/${id}`, { method: 'PUT', body: { ...form, amount: form.amount === '' ? null : Number(form.amount) } }));
      toast.success('Loan saved');
    } catch (err) {
      showError(err, 'The loan was not saved');
    }
    setBusy(false);
  };

  const saveStep = async (step, body) => {
    try {
      setData(await api(`/api/loans/${id}/steps/${step.id}`, { method: 'PUT', body }));
      toast.success(body.status ? `“${step.name}” updated` : 'Remark saved');
    } catch (err) {
      showError(err, 'The step was not updated');
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      setData(await api(`/api/loans/${id}/sync-steps`, { method: 'POST' }));
      toast.success('New steps added');
    } catch (err) {
      showError(err, 'No steps were added');
    }
    setSyncing(false);
  };

  if (loading) return <LoadingBlock />;
  if (error || !loan) return <Alert>{error || 'Loan not found'}</Alert>;

  return (
    <>
      <Link href={basePath} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> All loans</Link>
      <PageHeader title={`Loan — ${loan.design?.name || 'Proposal'}`} description={[loan.client?.name, loan.client?.phone, loan.client?.email].filter(Boolean).join(' · ')}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LoanStatusBadge status={loan.status} />
          {loan.design?.id && may('proposals', 'view') && <Link href={`${designsPath}/${loan.design.id}`} className="text-sm font-medium text-brand hover:underline">Open proposal</Link>}
          {loan.client?.id && may('clients', 'view') && <Link href={`${clientsPath}/${loan.client.id}`} className="text-sm font-medium text-brand hover:underline">Open client</Link>}
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Loan steps"
            description={loan.steps.length ? <Progress project={loan} className="mt-1 max-w-xs" /> : 'This loan has no steps yet.'}
            action={canEdit && <Button size="sm" icon={ListPlus} loading={syncing} onClick={sync}>Add new template steps</Button>}
          />
          <div className="px-6 py-5">
            {loan.steps.length ? (
              <LoanTimeline
                steps={loan.steps}
                renderExtra={(s) => (
                  <>
                    {canEdit ? <StepControls key={`${s.id}:${s.remark}`} step={s} onSave={saveStep} /> : s.remark ? <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">{s.remark}</p> : null}
                    <StepDocuments loanId={id} step={s} canEdit={canEdit} onChanged={setData} />
                  </>
                )}
              />
            ) : (
              <EmptyState icon={ListPlus} title="No steps" description="Set up your loan steps under Manage Masters → Loan steps, then add them to this loan." />
            )}
          </div>
        </Card>

        <div className="space-y-6">
          {form && (
            <Card className="p-5">
              <form onSubmit={saveDetails} className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Loan details</h3>
                <FormField label="Bank / lender" optional>
                  <Input maxLength={120} value={form.lender} disabled={!canEdit} onValue={(v) => setForm((f) => ({ ...f, lender: v }))} placeholder="e.g. State Bank of India" />
                </FormField>
                <FormField label="Loan amount" optional>
                  <Input type="number" min={0} step="any" value={form.amount} disabled={!canEdit} onValue={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="e.g. 250000" />
                </FormField>
                <FormField label="Status" hint="Completing every step marks the loan completed automatically.">
                  <Select value={form.status} disabled={!canEdit} onValue={(v) => setForm((f) => ({ ...f, status: v }))}>
                    {LOAN_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Notes" optional hint="Private to your company — the client doesn’t see these.">
                  <Textarea rows={3} maxLength={1000} value={form.notes} disabled={!canEdit} onValue={(v) => setForm((f) => ({ ...f, notes: v }))} />
                </FormField>
                {canEdit && <Button type="submit" variant="primary" loading={busy} className="w-full">Save details</Button>}
              </form>
            </Card>
          )}

          <DocumentsOverview steps={loan.steps} />

          <LoanActivity logs={loan.logs} />
        </div>
      </div>
    </>
  );
}
