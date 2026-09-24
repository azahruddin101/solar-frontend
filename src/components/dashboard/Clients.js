'use client';

// Clients never sign in — the company keeps their name, email and address here.
import { Check, ChevronRight, FileText, FileUp, Loader2, Mail, MapPin, PenTool, Pencil, Phone, Plus, Search, Trash2, Upload, User, Users, X, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, assetUrl } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { checkForm, clientSchema, useValidation } from '@/lib/validation';
import { Alert, Avatar, Badge, Button, CameraButton, Card, ConfirmDialog, EmptyState, FormField, IconButton, Input, NameInput, PhoneInput, LoadingBlock, Modal, PageHeader, Select, Table, Td, Textarea, Th, Tr, buttonClass, cx, formatDate, openStoredFile, toast } from '../kit';
import { NewDesignModal } from './shared';

const SOURCES = ['Website', 'Referral', 'Field / Direct Visit', 'Social Media', 'Channel Partner', 'Advertisement', 'Exhibition / Event', 'Other'];

const BLANK = {
  name: '',
  email: '',
  phone: '',
  pan: '',
  address: '',
  consumerNumber: '',
  kwRequired: '',
  notes: '',
  source: 'Website',
  referredBy: { name: '', phone: '' },
  documents: [],
};

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const STEP1_FIELDS = ['name', 'email', 'phone', 'pan', 'consumerNumber', 'kwRequired', 'address', 'notes'];

function ClientForm({ client, onClose, onSaved }) {
  const editing = Boolean(client?.id);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => ({
    ...BLANK,
    ...client,
    referredBy: { ...BLANK.referredBy, ...(client?.referredBy || {}) },
    documents: client?.documents || [],
  }));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const v = useValidation(clientSchema, form);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setReferredBy = (patch) => setForm((f) => ({ ...f, referredBy: { ...f.referredBy, ...patch } }));

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const uploadedDocs = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api('/api/clients/upload-document', { method: 'POST', form: formData });
        uploadedDocs.push(res);
      }
      set({ documents: [...(form.documents || []), ...uploadedDocs] });
      toast.success(`${files.length} document${files.length > 1 ? 's' : ''} uploaded`);
    } catch (err) {
      setError(err.message || 'File upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDoc = (index) => {
    set({ documents: (form.documents || []).filter((_, i) => i !== index) });
  };

  const nextStep = (e) => {
    e.preventDefault();
    v.validate();
    if (STEP1_FIELDS.some((k) => checkForm(clientSchema, form).errors[k])) return;
    setError('');
    setStep(2);
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    const payload = v.validate();
    if (!payload) {
      setStep(Object.keys(checkForm(clientSchema, form).errors).some((k) => STEP1_FIELDS.includes(k)) ? 1 : 2);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = editing ? await api(`/api/clients/${client.id}`, { method: 'PUT', body: payload }) : await api('/api/clients', { method: 'POST', body: payload });
      onSaved({ designs: client?.designs || 0, ...saved });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={editing ? 'Edit client' : 'Add a client'}
      description="Fill in client details and attach relevant project documents."
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {step === 2 && (
              <Button variant="ghost" onClick={() => setStep(1)} disabled={busy}>
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            {step === 1 ? (
              <Button variant="primary" onClick={nextStep}>
                Next: Referral &amp; Docs <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={submit} loading={busy} disabled={uploading}>
                {editing ? 'Save changes' : 'Add client'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* Stepper Navigation */}
      <div className="mb-6 border-b border-slate-100 pb-4">
        <nav aria-label="Progress" className="flex items-center justify-center gap-2 sm:gap-6">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={cx(
              'flex items-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors',
              step === 1 ? 'text-brand' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <span
              className={cx(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition',
                step === 1 ? 'bg-brand text-white' : 'bg-slate-200 text-slate-700'
              )}
            >
              1
            </span>
            <span>Client &amp; Power Info</span>
          </button>

          <ChevronRight className="h-4 w-4 text-slate-300" />

          <button
            type="button"
            onClick={() => {
              if (form.name?.trim()) setStep(2);
              else setError('Full name is required before proceeding to Step 2');
            }}
            className={cx(
              'flex items-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors',
              step === 2 ? 'text-brand' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <span
              className={cx(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition',
                step === 2 ? 'bg-brand text-white' : 'bg-slate-200 text-slate-700'
              )}
            >
              2
            </span>
            <span>Referral &amp; Documents</span>
          </button>
        </nav>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}

      {step === 1 && (
        <div className="space-y-4 animate-fade">
          <FormField label="Full name / business name" error={v.error('name')}>
            <NameInput kind="business" maxLength={120} value={form.name} onValue={(v) => set({ name: v.replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toUpperCase()) })} placeholder="Ravi Kumar" autoFocus />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Phone" optional error={v.error('phone')}>
              <PhoneInput value={form.phone} onValue={(x) => set({ phone: x })} maxLength={20} placeholder="+91 98765 43210" />
            </FormField>
            <FormField label="Email" optional error={v.error('email')}>
              <Input type="email" value={form.email} onValue={(x) => set({ email: x })} placeholder="ravi@example.com" />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Consumer number" optional hint="Electricity meter / DISCOM consumer no." error={v.error('consumerNumber')}>
              <Input value={form.consumerNumber} onValue={(x) => set({ consumerNumber: x })} maxLength={30} placeholder="e.g. 1029384756" />
            </FormField>
            <FormField label="KW Required" optional hint="Sanctioned load or proposed solar capacity." error={v.error('kwRequired')}>
              <Input type="number" min={0} step="any" value={form.kwRequired ?? ''} onValue={(x) => set({ kwRequired: x })} placeholder="e.g. 5" />
            </FormField>
          </div>

          <FormField label="PAN" optional hint="10-character Permanent Account Number." error={v.error('pan')}>
            <Input value={form.pan || ''} onValue={(x) => set({ pan: x.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })} maxLength={10} placeholder="ABCDE1234F" autoCapitalize="characters" />
          </FormField>

          <FormField label="Address" optional error={v.error('address')}>
            <Textarea rows={2} maxLength={400} value={form.address} onValue={(v) => set({ address: v })} placeholder="House / street, city, state, PIN" />
          </FormField>

          <FormField label="Notes" optional hint="Private to your company.">
            <Textarea rows={2} maxLength={1000} value={form.notes} onValue={(v) => set({ notes: v })} placeholder="Any specific requirements, visit notes, or preferences" />
          </FormField>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5 animate-fade">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Source">
              <Select value={form.source} onValue={(v) => set({ source: v })}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-600">Referred by (Optional)</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Referrer name" optional error={v.error('referredBy.name')}>
                <NameInput value={form.referredBy?.name || ''} onValue={(x) => setReferredBy({ name: x })} maxLength={120} placeholder="Person or Partner name" />
              </FormField>
              <FormField label="Referrer phone" optional error={v.error('referredBy.phone')}>
                <PhoneInput value={form.referredBy?.phone || ''} onValue={(x) => setReferredBy({ phone: x })} maxLength={20} placeholder="+91 98765 00000" />
              </FormField>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-slate-700">Documents</span>
              <span className="text-xs text-slate-400">PDFs, Images, Bills, ID Proofs (up to 10MB)</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileUpload}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white p-6 transition-colors hover:border-brand hover:bg-brand-soft/30"
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin text-brand" /> : <FileUp className="h-5 w-5 text-brand" />}
              </div>
              <p className="mt-2 text-sm font-medium text-slate-800">
                {uploading ? 'Uploading documents...' : 'Click to select and upload documents'}
              </p>
              <p className="text-xs text-slate-500">Supports electricity bills, roof photos, GST, approvals, etc.</p>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <CameraButton disabled={uploading} onFile={(f) => handleFileUpload({ target: { files: [f] } })} />
              <span className="text-xs text-slate-400">Or pick a file / gallery image above</span>
            </div>

            {form.documents?.length > 0 && (
              <div className="mt-3 space-y-2">
                {form.documents.map((doc, idx) => (
                  <div key={doc.url || idx} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <a
                          href={assetUrl(doc.url)}
                          onClick={(e) => { e.preventDefault(); openStoredFile(doc.url, { mimetype: doc.mimetype, name: doc.name }); }}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate font-medium text-slate-800 hover:text-brand hover:underline"
                        >
                          {doc.name || 'Document'}
                        </a>
                        <span className="text-xs text-slate-400">{formatFileSize(doc.size)}</span>
                      </div>
                    </div>
                    <IconButton icon={X} label="Remove" tone="danger" onClick={() => removeDoc(idx)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Clients() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, setData, loading, error } = useResource('/api/clients');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (params.get('new')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal({ type: 'form' });
      router.replace('/dashboard/clients');
    }
  }, [params, router]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter(
      (c) =>
        !q ||
        `${c.name} ${c.email} ${c.phone} ${c.address} ${c.consumerNumber || ''} ${c.source || ''} ${c.referredBy?.name || ''}`
          .toLowerCase()
          .includes(q)
    );
  }, [data, query]);

  const close = () => {
    setModal(null);
    setModalError('');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/clients/${modal.client.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.client.id));
      toast.success('Client deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Clients" description="The people and businesses you design solar for.">
        <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>
          Add client
        </Button>
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input
              aria-label="Search clients"
              placeholder="Search by name, email, phone, consumer no. or source"
              value={query}
              onValue={setQuery}
              className="pl-9"
            />
          </div>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : !rows.length ? (
          <EmptyState
            icon={Users}
            title={data?.length ? 'No clients match' : 'No clients yet'}
            description={data?.length ? 'Try a different search.' : 'Add a client to start creating designs and proposals for them.'}
          >
            {!data?.length && (
              <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>
                Add client
              </Button>
            )}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Contact</Th>
                <Th>Requirement</Th>
                <Th className="text-right">Designs</Th>
                <Th>Added</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/clients/${c.id}`}
                          className="font-medium text-slate-900 hover:text-brand hover:underline block truncate max-w-[220px]"
                        >
                          {c.name}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          {c.source && <span>{c.source}</span>}
                          {c.documents?.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-brand font-medium">{c.documents.length} doc{c.documents.length > 1 ? 's' : ''}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-[13px]">
                    {c.phone && <div className="font-medium text-slate-800">{c.phone}</div>}
                    {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                    {!c.phone && !c.email && <span className="text-slate-400">—</span>}
                  </Td>
                  <Td className="text-[13px]">
                    {c.kwRequired ? (
                      <Badge tone="brand">
                        <Zap className="h-3 w-3" /> {c.kwRequired} kW
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {c.designs ? (
                      <button
                        type="button"
                        className="font-medium text-brand hover:underline"
                        onClick={() => router.push(`/dashboard/designs?client=${c.id}`)}
                      >
                        {c.designs}
                      </button>
                    ) : (
                      0
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(c.createdAt)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-0.5">
                      <Link
                        href={`/dashboard/clients/${c.id}`}
                        className={buttonClass({ size: 'sm', variant: 'secondary', className: 'mr-1' })}
                      >
                        View
                      </Link>
                      <IconButton icon={Pencil} label="Edit" onClick={() => setModal({ type: 'form', client: c })} />
                      <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setModal({ type: 'delete', client: c })} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modal?.type === 'form' && (
        <ClientForm
          client={modal.client}
          onClose={close}
          onSaved={(c) => {
            setData((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]));
            toast.success(modal.client ? 'Client updated' : 'Client added');
            close();
          }}
        />
      )}
      {modal?.type === 'design' && <NewDesignModal clients={data} clientId={modal.client.id} onClose={close} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this client?" confirmLabel="Delete client">
        <b className="text-slate-900">{modal?.client?.name}</b> will be permanently deleted
        {modal?.client?.designs ? (
          <>
            , together with their <b className="text-slate-900">{modal.client.designs} design{modal.client.designs > 1 ? 's' : ''}</b>
          </>
        ) : (
          ''
        )}
      </ConfirmDialog>
    </>
  );
}

