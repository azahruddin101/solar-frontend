'use client';

// The company's suppliers: who each batch of stock was bought from, and which of the company's product categories they
// sell. Picked when stock is received on a product's page.
import { FileText, Pencil, Plus, Receipt, Trash2, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { openFile } from '@/lib/files';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { supplierSchema, useValidation } from '@/lib/validation';
import { Alert, Button, Card, ConfirmDialog, EmptyState, FormField, FormModal, Input, LoadingBlock, Modal, MultiSelect, PageHeader, Select, Table, Td, Textarea, Th, Tr, formatDate, toast, RowMenu } from '../kit';

const EMPTY = { name: '', phone: '', email: '', gstNumber: '', address: '', notes: '', categories: [] };

/**
 * Create or edit one supplier; also opened from the "Receive stock" form to add one on the spot (`supplier` without an
 * id then only presets fields, e.g. the product's category).
 */
export function SupplierForm({ supplier, onClose, onSaved }) {
  const editing = Boolean(supplier?.id);
  const categoriesResource = useResource('/api/categories');
  const categories = categoriesResource.data || [];
  const [form, setForm] = useState(() => ({ ...EMPTY, ...supplier, categories: (supplier?.categories || []).map(String) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const v = useValidation(supplierSchema, form);

  const submit = async () => {
    const body = v.validate();
    if (!body) return;
    setBusy(true);
    setError('');
    try {
      onSaved(await api(editing ? `/api/suppliers/${supplier.id}` : '/api/suppliers', { method: editing ? 'PUT' : 'POST', body }), editing);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={editing ? 'Edit supplier' : 'New supplier'} description="Who you buy stock from. Each stock receipt (batch) records its supplier." submitLabel={editing ? 'Save changes' : 'Add supplier'} busy={busy} error={error} onSubmit={submit} noValidate>
      <FormField label="Supplier name" error={v.error('name')}><Input maxLength={120} value={form.name} onValue={(x) => set({ name: x.replace(/^\s+/, '') })} placeholder="e.g. Sunrise Solar Distributors" /></FormField>
      <FormField
        label="Categories"
        optional
        error={v.error('categories')}
        hint={categoriesResource.error || (categoriesResource.loading ? 'Loading your product categories…' : categories.length ? 'The product categories you buy from them.' : 'You have no product categories yet — add them in your catalog.')}
      >
        <MultiSelect
          aria-label="Categories"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          value={form.categories}
          onValue={(categories) => set({ categories })}
          disabled={categoriesResource.loading || !categories.length}
          placeholder="Choose categories"
          searchPlaceholder="Search categories"
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Phone" optional error={v.error('phone')}><Input inputMode="tel" maxLength={20} value={form.phone} onValue={(x) => set({ phone: x })} /></FormField>
        <FormField label="Email" optional error={v.error('email')}><Input type="email" maxLength={200} value={form.email} onValue={(x) => set({ email: x })} /></FormField>
      </div>
      <FormField label="GSTIN" optional error={v.error('gstNumber')}><Input maxLength={15} value={form.gstNumber} onValue={(x) => set({ gstNumber: x.toUpperCase() })} placeholder="e.g. 27ABCDE1234F1Z5" /></FormField>
      <FormField label="Address" optional error={v.error('address')}><Textarea rows={2} maxLength={400} value={form.address} onValue={(x) => set({ address: x })} /></FormField>
      <FormField label="Notes" optional error={v.error('notes')}><Input maxLength={500} value={form.notes} onValue={(x) => set({ notes: x })} /></FormField>
    </FormModal>
  );
}

/** A supplier's categories in the table: the first few, then how many more. */
function CategoryChips({ ids = [], names }) {
  const known = ids.map((id) => names.get(String(id))).filter(Boolean);
  if (!known.length) return <span className="text-[13px] text-slate-400">—</span>;
  const more = known.length - 2;
  return (
    <div className="flex max-w-[260px] flex-wrap gap-1" title={known.join(', ')}>
      {known.slice(0, 2).map((n) => <span key={n} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs whitespace-nowrap text-slate-700">{n}</span>)}
      {more > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">+{more}</span>}
    </div>
  );
}

/** Everything received from one supplier, with the bill of each receipt. */
function PurchasesModal({ supplier, onClose }) {
  const { data, loading, error } = useResource(`/api/suppliers/${supplier.id}/purchases`);
  return (
    <Modal open onClose={onClose} size="xl" title={`Purchases — ${supplier.name}`} description="Stock received from this supplier, newest first, with the bill uploaded for each receipt.">
      {loading ? <LoadingBlock /> : error ? <Alert>{error}</Alert> : !data?.length ? (
        <EmptyState icon={Receipt} title="Nothing received yet" description="Stock received from this supplier shows here, with its bill." />
      ) : (
        <Table>
          <thead><tr><Th>Received</Th><Th>Product</Th><Th>Batch</Th><Th className="text-right">Quantity</Th><Th>Bill</Th></tr></thead>
          <tbody>
            {data.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap text-[13px]">{formatDate(r.receivedDate)}</Td>
                <Td className="max-w-[260px] truncate font-medium text-slate-900">{r.productName || '—'}</Td>
                <Td className="text-[13px] text-slate-600">{r.batchNo || '—'}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums">{r.qtyReceived} {r.unit}</Td>
                <Td>{r.billUrl ? <button type="button" onClick={() => openFile(r.billUrl)} title={r.billName || undefined} className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline"><FileText className="h-3.5 w-3.5" />View bill</button> : <span className="text-xs text-slate-400">No bill</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}

export default function Suppliers() {
  const may = useCan();
  const { data, setData, loading, error } = useResource('/api/suppliers');
  // categories are read with inventory or proposals access; staff who see suppliers only for finances or tasks go without
  const { data: categoryList } = useResource(may('inventory', 'view') || may('proposals', 'view') ? '/api/categories' : null);
  const categoryName = useMemo(() => new Map((categoryList || []).map((c) => [String(c.id), c.name])), [categoryList]);
  const [category, setCategory] = useState('');
  const shown = useMemo(() => (category ? (data || []).filter((s) => (s.categories || []).map(String).includes(category)) : data || []), [data, category]);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const close = () => { setModal(null); setModalError(''); };

  const saved = (item, editing) => {
    setData((list) => (editing ? list.map((x) => (x.id === item.id ? item : x)) : [...(list || []), item].sort((a, b) => a.name.localeCompare(b.name))));
    toast.success(editing ? 'Supplier updated' : 'Supplier added');
    close();
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/suppliers/${modal.item.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.item.id));
      toast.success('Supplier deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Suppliers" description="Everyone you buy stock from, with the bills of what you received. Choose one each time you receive stock of a product.">
        {may('inventory', 'create') && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>New supplier</Button>}
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      {categoryName.size > 0 && data?.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <Select aria-label="Filter by category" value={category} onValue={setCategory} className="w-60">
            <option value="">All categories</option>
            {[...categoryName].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
          {category && <span className="text-sm text-slate-500">{shown.length} of {data.length} suppliers</span>}
        </div>
      )}
      <Card className="overflow-hidden">
        {loading ? <LoadingBlock /> : !data?.length ? (
          <EmptyState icon={Truck} title="No suppliers yet" description="Add the distributors and manufacturers you buy panels, inverters, cables and structures from.">
            {may('inventory', 'create') && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>New supplier</Button>}
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Supplier</Th><Th>Categories</Th><Th>Contact</Th><Th>GSTIN</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {!shown.length && (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">No supplier sells {categoryName.get(category) || 'this category'} yet.</td></tr>
              )}
              {shown.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <div className="max-w-[280px] truncate font-medium text-slate-900">{s.name}</div>
                    {(s.address || s.notes) && <div className="max-w-[280px] truncate text-xs text-slate-500">{s.address || s.notes}</div>}
                  </Td>
                  <Td><CategoryChips ids={s.categories} names={categoryName} /></Td>
                  <Td className="text-[13px] text-slate-600">{[s.phone, s.email].filter(Boolean).join(' · ') || '—'}</Td>
                  <Td className="text-[13px] tabular-nums text-slate-600">{s.gstNumber || '—'}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${s.name}`}
                        items={[
                          { key: 'purchases', icon: Receipt, label: 'Purchases & bills', onClick: () => setModal({ type: 'purchases', item: s }) },
                          may('inventory', 'update') && { key: 'edit', icon: Pencil, label: 'Edit supplier', onClick: () => setModal({ type: 'form', item: s }) },
                          may('inventory', 'delete') && { key: 'delete', icon: Trash2, label: 'Delete supplier', tone: 'danger', onClick: () => setModal({ type: 'delete', item: s }) },
                        ]}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {modal?.type === 'purchases' && <PurchasesModal supplier={modal.item} onClose={close} />}
      {modal?.type === 'form' && <SupplierForm supplier={modal.item} onClose={close} onSaved={saved} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this supplier?" confirmLabel="Delete supplier">
        <b className="text-slate-900">{modal?.item?.name}</b> will be deleted. A supplier that stock was received from can’t be deleted.
      </ConfirmDialog>
    </>
  );
}
