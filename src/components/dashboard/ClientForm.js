'use client';

// The "Add / edit client" modal, split out of Clients.js so that file stays focused on the list.
import { Eye, FileText, FileUp, Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSignedUrl } from '@/lib/files';
import { clientSchema, useValidation } from '@/lib/validation';
import { Alert, Button, CameraButton, FormField, IconButton, Input, NameInput, PhoneInput, LoadingBlock, Modal, Select, Textarea, toast } from '../kit';

const SOURCES = ['Website', 'Referral', 'Field / Direct Visit', 'Social Media', 'Channel Partner', 'Advertisement', 'Exhibition / Event', 'Other'];

const BLANK = {
  name: '',
  email: '',
  phone: '',
  pan: '',
  gstNumber: '',
  address: '',
  consumerNumber: '',
  kwRequired: '',
  notes: '',
  source: 'Website',
  referredBy: { name: '', phone: '' },
  documents: [],
};

/** Preview a client document (image or PDF) in a modal instead of a new tab. */
function DocPreviewModal({ doc, onClose }) {
  const signed = useSignedUrl(doc.url);
  const isImage = doc.mimetype?.startsWith('image/');
  return (
    <Modal open onClose={onClose} title={doc.name || 'Document'} size="2xl">
      <div className="flex h-[70vh] items-center justify-center bg-slate-50">
        {!signed ? (
          <LoadingBlock label="Opening…" />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signed} alt={doc.name || 'Document'} className="max-h-full max-w-full object-contain" />
        ) : (
          <iframe src={signed} title={doc.name || 'Document'} className="h-full w-full rounded-lg border border-slate-200 bg-white" />
        )}
      </div>
    </Modal>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function ClientForm({ client, onClose, onSaved }) {
  const editing = Boolean(client?.id);
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
  const renameDoc = (index, name) => {
    set({ documents: (form.documents || []).map((d, i) => (i === index ? { ...d, name } : d)) });
  };
  const [previewDoc, setPreviewDoc] = useState(null);

  const submit = async (e) => {
    if (e) e.preventDefault();
    const payload = v.validate();
    if (!payload) return;
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
      size="2xl"
      onClose={onClose}
      title={editing ? 'Edit client' : 'Add a client'}
      description="Fill in client details and attach relevant project documents."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={uploading}>
            {editing ? 'Save changes' : 'Add client'}
          </Button>
        </div>
      }
    >
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        <div className="space-y-4">
          <FormField label="Full name / business name" error={v.error('name')}>
            <NameInput kind="business" maxLength={120} value={form.name} onValue={(v) => set({ name: v.replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toUpperCase()) })} placeholder="Ravi Kumar" autoFocus />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Phone" optional error={v.error('phone')}>
              <PhoneInput value={form.phone} onValue={(x) => set({ phone: x })} maxLength={20} placeholder="+91 98765 43210" />
            </FormField>
            <FormField label="Email" optional error={v.error('email')} hint={editing ? undefined : ''}>
              <Input type="email" value={form.email} onValue={(x) => set({ email: x })} placeholder="ravi@example.com" />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Consumer number" optional hint="Electricity meter / DISCOM consumer no." error={v.error('consumerNumber')}>
              <Input value={form.consumerNumber} onValue={(x) => set({ consumerNumber: x })} maxLength={30} placeholder="e.g. 1029384756" />
            </FormField>
            <FormField label="KW Required" optional hint="Sanctioned load." error={v.error('kwRequired')}>
              <Input type="number" min={0} step="any" value={form.kwRequired ?? ''} onValue={(x) => set({ kwRequired: x })} placeholder="e.g. 5" />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="PAN" optional hint="10-character Permanent Account Number." error={v.error('pan')}>
              <Input value={form.pan || ''} onValue={(x) => set({ pan: x.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })} maxLength={10} placeholder="ABCDE1234F" autoCapitalize="characters" />
            </FormField>
            <FormField label="GST Number" optional hint="15-character GSTIN (commercial / industrial)." error={v.error('gstNumber')}>
              <Input value={form.gstNumber || ''} onValue={(x) => set({ gstNumber: x.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })} maxLength={15} placeholder="27ABCDE1234F1Z5" autoCapitalize="characters" />
            </FormField>
          </div>

          <FormField label="Address" optional error={v.error('address')}>
            <Textarea rows={2} maxLength={400} value={form.address} onValue={(v) => set({ address: v })} placeholder="House / street, city, state, PIN" />
          </FormField>

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

        <div className="space-y-4">
          <FormField label="Notes" optional hint="Private to your company.">
            <Textarea rows={2} maxLength={1000} value={form.notes} onValue={(v) => set({ notes: v })} placeholder="Any specific requirements, visit notes, or preferences" />
          </FormField>

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
              <span className="text-xs text-slate-400">PDFs, Images, Bills, ID Proofs (up to 30MB)</span>
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
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white p-4 transition-colors hover:border-brand hover:bg-brand-soft/30"
            >
              <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <FileUp className="h-4 w-4 text-brand" />}
              </div>
              <p className="mt-1.5 text-sm font-medium text-slate-800">
                {uploading ? 'Uploading documents...' : 'Click to select and upload documents'}
              </p>
              <p className="text-xs text-slate-500">Electricity bills, roof photos, GST, approvals, etc.</p>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <CameraButton disabled={uploading} onFile={(f) => handleFileUpload({ target: { files: [f] } })} />
              <span className="text-xs text-slate-400">Or pick a file / gallery image above</span>
            </div>

            {form.documents?.length > 0 && (
              <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                {form.documents.map((doc, idx) => (
                  <div key={doc.url || idx} className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        aria-label="File name"
                        value={doc.name || ''}
                        onChange={(e) => renameDoc(idx, e.target.value)}
                        maxLength={200}
                        placeholder="Document"
                        className="block w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 -mx-1 font-medium text-slate-800 hover:border-slate-200 focus:border-brand focus:bg-white focus:outline-none"
                      />
                      <span className="px-1 text-xs text-slate-400">{formatFileSize(doc.size)}</span>
                    </div>
                    <IconButton icon={Eye} label="Preview" onClick={() => setPreviewDoc(doc)} />
                    <IconButton icon={X} label="Remove" tone="danger" onClick={() => removeDoc(idx)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {previewDoc && <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </Modal>
  );
}
