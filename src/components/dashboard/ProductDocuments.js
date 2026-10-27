'use client';

// PDFs kept with a product (datasheet, warranty card, manual…). They open through a signed link (lib/files.js).
// The product form only collects changes (files to add, documents to remove) and applies them after the product is
// saved, so a new product can get its PDFs too; the product page uploads and removes them straight away.
import { FileText, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { openFile } from '@/lib/files';
import { Button, Card, IconButton, cx, showError, toast } from '../kit';

export const MAX_PRODUCT_DOCUMENTS = 10;
const MAX_BYTES = 20 * 1024 * 1024;

const sizeLabel = (bytes) => {
  const n = Number(bytes) || 0;
  if (!n) return '';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};
const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** Keeps PDFs only, up to 20 MB each and `room` in all; says which were skipped. */
function pickPdfs(fileList, room) {
  const files = Array.from(fileList || []);
  const valid = files.filter((f) => isPdf(f) && f.size <= MAX_BYTES);
  if (valid.length < files.length) toast.error('Only PDF files up to 20 MB can be added');
  if (valid.length > room) toast.error(`A product can keep up to ${MAX_PRODUCT_DOCUMENTS} PDFs`);
  return valid.slice(0, Math.max(0, room));
}

/** Uploads one PDF to a product; returns the product with its documents. */
export function uploadProductDocument(productId, file) {
  const form = new FormData();
  form.append('file', file);
  return api(`/api/products/${productId}/documents`, { method: 'POST', form });
}

/** Applies the form's document changes to a saved product. Returns the latest product (or `product` if nothing changed). */
export async function applyDocumentChanges(product, { added, removed }) {
  let latest = product;
  for (const docId of removed) latest = await api(`/api/products/${product.id}/documents/${docId}`, { method: 'DELETE' });
  for (const file of added) latest = await uploadProductDocument(product.id, file);
  return latest;
}

function DocRow({ name, size, onOpen, onRemove, removeLabel, pending }) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-red-50 text-red-600"><FileText className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-sm font-medium text-slate-900 hover:text-brand hover:underline" title={name}>{name}</button>
        ) : (
          <span className="block truncate text-sm font-medium text-slate-900" title={name}>{name}</span>
        )}
        <span className="text-xs text-slate-500">{[sizeLabel(size), pending && 'uploads when you save'].filter(Boolean).join(' · ')}</span>
      </div>
      {onRemove && <IconButton icon={pending ? X : Trash2} label={removeLabel} tone="danger" onClick={onRemove} />}
    </li>
  );
}

/** In the product form: `value` = { added: File[], removed: docId[] }. */
export function ProductDocumentsField({ documents = [], value, onChange }) {
  const input = useRef(null);
  const kept = documents.filter((d) => !value.removed.includes(d.id));
  const room = MAX_PRODUCT_DOCUMENTS - kept.length - value.added.length;
  const add = (files) => {
    const picked = pickPdfs(files, room);
    if (picked.length) onChange({ ...value, added: [...value.added, ...picked] });
  };
  return (
    <div>
      {(kept.length > 0 || value.added.length > 0) && (
        <ul className="mb-2 divide-y divide-slate-100 rounded-lg border border-slate-200 px-3">
          {kept.map((d) => <DocRow key={d.id} name={d.name} size={d.size} onOpen={() => openFile(d.url)} onRemove={() => onChange({ ...value, removed: [...value.removed, d.id] })} removeLabel={`Remove ${d.name}`} />)}
          {value.added.map((f, i) => <DocRow key={`${f.name}-${i}`} pending name={f.name.replace(/\.pdf$/i, '')} size={f.size} onRemove={() => onChange({ ...value, added: value.added.filter((_, j) => j !== i) })} removeLabel={`Don’t add ${f.name}`} />)}
        </ul>
      )}
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <button
        type="button"
        disabled={room <= 0}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        className={cx('flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-3 py-3 text-[13px] text-slate-600 transition-colors', room > 0 ? 'hover:border-brand hover:text-brand' : 'cursor-not-allowed opacity-60')}
      >
        <Paperclip className="h-4 w-4" />
        {room > 0 ? 'Attach PDFs — datasheet, warranty card, manual…' : `Up to ${MAX_PRODUCT_DOCUMENTS} PDFs per product`}
      </button>
    </div>
  );
}

/** On the product page: list, open, and (with `canEdit`) upload or remove straight away. */
export function ProductDocumentsCard({ product, canEdit, onChanged }) {
  const input = useRef(null);
  const [busy, setBusy] = useState('');
  const documents = product.documents || [];
  const room = MAX_PRODUCT_DOCUMENTS - documents.length;

  const upload = async (fileList) => {
    const files = pickPdfs(fileList, room);
    if (!files.length) return;
    setBusy('upload');
    try {
      let latest = product;
      for (const file of files) latest = await uploadProductDocument(product.id, file);
      onChanged(latest);
      toast.success(files.length > 1 ? `${files.length} PDFs added` : 'PDF added');
    } catch (e) {
      showError(e, 'The PDF was not uploaded');
    }
    setBusy('');
  };
  const remove = async (doc) => {
    setBusy(doc.id);
    try {
      onChanged(await api(`/api/products/${product.id}/documents/${doc.id}`, { method: 'DELETE' }));
      toast.success('PDF removed');
    } catch (e) {
      showError(e, 'The PDF was not removed');
    }
    setBusy('');
  };

  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Documents</h3>
        {canEdit && room > 0 && (
          <>
            <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            <Button size="sm" icon={Upload} loading={busy === 'upload'} disabled={Boolean(busy)} onClick={() => input.current?.click()}>Upload PDF</Button>
          </>
        )}
      </div>
      {!documents.length ? (
        <p className="text-sm text-slate-400">No PDFs yet.{canEdit ? ' Add a datasheet, warranty card or manual.' : ''}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {documents.map((d) => (
            <DocRow key={d.id} name={d.name} size={d.size} onOpen={() => openFile(d.url)} onRemove={canEdit && busy !== d.id ? () => remove(d) : undefined} removeLabel={`Remove ${d.name}`} />
          ))}
        </ul>
      )}
    </Card>
  );
}
