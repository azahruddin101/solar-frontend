'use client';

// A product's stock on its page: the batches it was received in (each with its own prices), receiving more, and —
// for products tracked by serial number — every physical unit with its status and warranty end.
// Selling (invoices) and issuing to an installation take stock out elsewhere; here only receipts and corrections.
import { FileText, PackagePlus, Pencil, Plus, ShieldCheck, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { openFile } from '@/lib/files';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { batchUpdateSchema, stockReceiveSchema, useValidation } from '@/lib/validation';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, FormField, FormModal, IconButton, Input, LoadingBlock, Select, Table, TablePagination, Td, Textarea, Th, Tr, formatDate, toast } from '../kit';
import { SupplierForm } from './Suppliers';

const today = () => new Date().toISOString().slice(0, 10);
const dateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const num = (v) => (v === '' ? '' : Number(v));
const BILL_TYPES = 'application/pdf,image/png,image/jpeg,image/webp';
const MAX_BILL = 20 * 1024 * 1024;
const PRICES = [
  { key: 'basePrice', label: 'Base price' },
  { key: 'wholesalePrice', label: 'Wholesale price' },
  { key: 'retailPrice', label: 'Retail price' },
];

/** One serial number per line (commas and tabs from a pasted sheet work too); blanks dropped. */
const parseSerials = (text) => text.split(/[\n,\t]+/).map((s) => s.trim()).filter(Boolean);

/* ───────────── batches ───────────── */

/** Receive stock (a new batch) or, with `batch`, correct an existing batch's details and prices. */
function BatchForm({ product, batch, currency, onClose, onSaved }) {
  const editing = Boolean(batch?.id);
  const suppliersResource = useResource('/api/suppliers');
  const suppliers = suppliersResource.data || [];
  const may = useCan();
  const [form, setForm] = useState(() => ({
    supplier: batch?.supplier?.id || batch?.supplier || '',
    batchNo: batch?.batchNo || '',
    receivedDate: dateInput(batch?.receivedDate) || today(),
    mfgDate: dateInput(batch?.mfgDate),
    mfgYear: batch?.mfgYear ?? '',
    purchasePrice: batch?.purchasePrice ?? '',
    basePrice: batch?.basePrice ?? '',
    wholesalePrice: batch?.wholesalePrice ?? '',
    retailPrice: batch?.retailPrice ?? '',
    note: batch?.note || '',
    qtyReceived: '',
  }));
  const [serialText, setSerialText] = useState('');
  const [addSupplier, setAddSupplier] = useState(false);
  const [bill, setBill] = useState(null); // the supplier's bill to upload with this receipt
  const billInput = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const serials = useMemo(() => parseSerials(serialText), [serialText]);
  const repeated = useMemo(() => serials.filter((s, i) => serials.findIndex((x) => x.toLowerCase() === s.toLowerCase()) !== i), [serials]);

  const { qtyReceived, ...details } = form;
  const values = editing ? details : { ...form, ...(product.isSerialized ? { qtyReceived: undefined, serials } : { qtyReceived }) };
  const v = useValidation(editing ? batchUpdateSchema : stockReceiveSchema, values);

  const [billError, setBillError] = useState('');
  const pickBill = (file) => {
    if (!file) return;
    if (file.size > MAX_BILL) return setBillError('The bill is larger than 20 MB');
    if (!BILL_TYPES.split(',').includes(file.type)) return setBillError('Upload a PDF or a PNG, JPG or WebP image');
    setBillError('');
    setBill(file);
  };

  const submit = async () => {
    const body = v.validate();
    if (!body) return;
    if (!editing && product.isSerialized && (!serials.length || repeated.length)) return setError(repeated.length ? `Listed twice: ${[...new Set(repeated)].slice(0, 5).join(', ')}` : 'Enter the serial number of every item received');
    if (!editing && !product.isSerialized && !(Number(qtyReceived) > 0)) return setError('Enter the quantity received');
    setBusy(true);
    setError('');
    let saved;
    try {
      saved = await api(editing ? `/api/stock/batches/${batch.id}` : `/api/stock/products/${product.id}/batches`, { method: editing ? 'PUT' : 'POST', body });
    } catch (e) {
      setError(e.message);
      setBusy(false);
      return;
    }
    if (bill) {
      try {
        const form = new FormData();
        form.append('file', bill);
        await api(`/api/stock/batches/${saved.id}/bill`, { method: 'POST', form });
      } catch (e) {
        toast.error(`${editing ? 'Batch saved' : 'Stock received'}, but the bill was not uploaded: ${e.message}. Edit the batch to try again.`);
      }
    }
    onSaved(saved);
  };

  return (
    <>
      <FormModal
        open
        size="lg"
        onClose={onClose}
        title={editing ? `Edit batch ${batch.batchNo || ''}`.trim() : `Receive stock — ${product.name}`}
        description={editing ? 'Correct the details and prices of this batch. Invoices already issued keep the prices they were billed at; quantities change only by receiving, selling and issuing.' : 'One receipt of stock, with its own prices. Sales take the oldest batch first unless another is chosen.'}
        submitLabel={editing ? 'Save changes' : 'Receive stock'}
        busy={busy}
        error={error}
        onSubmit={submit}
        noValidate
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <FormField label="Supplier" error={v.error('supplier')} hint={suppliersResource.error || (!suppliersResource.loading && !suppliers.length ? 'Add your first supplier.' : '')}>
            <Select value={form.supplier} onValue={(x) => set({ supplier: x })}>
              <option value="">Choose the supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>
          {may('inventory', 'create') && <Button className="self-start sm:mt-6" icon={Plus} onClick={() => setAddSupplier(true)}>New supplier</Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Batch / lot number" optional error={v.error('batchNo')}><Input maxLength={60} value={form.batchNo} onValue={(x) => set({ batchNo: x })} /></FormField>
          <FormField label="Received on" error={v.error('receivedDate')}><Input type="date" value={form.receivedDate} onValue={(x) => set({ receivedDate: x })} /></FormField>
          <FormField label="Manufactured" optional error={v.error('mfgDate') || v.error('mfgYear')} hint="The date, or just the year">
            <div className="flex gap-2">
              <Input type="date" aria-label="Manufacture date" value={form.mfgDate} onValue={(x) => set({ mfgDate: x, mfgYear: x ? Number(x.slice(0, 4)) : form.mfgYear })} className="min-w-0 flex-1" />
              <Input type="number" aria-label="Manufacture year" min={1990} max={2100} placeholder="Year" value={form.mfgYear} onValue={(x) => set({ mfgYear: num(x), mfgDate: '' })} className="w-20" />
            </div>
          </FormField>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-slate-700">Prices per {product.unit} before GST ({currency})</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Purchase price" optional error={v.error('purchasePrice')}><Input type="number" min={0} step="any" value={form.purchasePrice} onValue={(x) => set({ purchasePrice: num(x) })} /></FormField>
            {PRICES.map((p) => (
              <FormField key={p.key} label={p.label} error={v.error(p.key)}><Input type="number" min={0} step="any" value={form[p.key]} onValue={(x) => set({ [p.key]: num(x) })} /></FormField>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">An invoice line picks one of the three selling prices; the purchase price is what an installation’s material costs.</p>
        </fieldset>
        {!editing && (product.isSerialized ? (
          <FormField label={`Serial numbers — ${serials.length} ${product.unit}`} error={repeated.length ? `Listed twice: ${[...new Set(repeated)].slice(0, 5).join(', ')}` : undefined} hint="One per line (or paste a column from a sheet). Each becomes one unit you can sell, install and track for warranty.">
            <Textarea rows={6} value={serialText} onValue={setSerialText} placeholder={'WSMD540-0001\nWSMD540-0002'} className="font-mono text-[13px]" />
          </FormField>
        ) : (
          <FormField label={`Quantity received (${product.unit})`} className="max-w-xs"><Input type="number" min={0} step="any" value={form.qtyReceived} onValue={(x) => set({ qtyReceived: num(x) })} /></FormField>
        ))}
        {may('inventory', 'create') && (
          <FormField label="Supplier’s bill" optional={editing} error={billError} hint="PDF or image (PNG, JPG, WebP), up to 20 MB. Kept with this batch and listed under the supplier.">
            <input ref={billInput} type="file" accept={BILL_TYPES} className="hidden" onChange={(e) => { pickBill(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" icon={Upload} onClick={() => billInput.current?.click()}>{bill ? 'Choose another' : editing && batch.billUrl ? 'Replace bill' : 'Upload bill'}</Button>
              {bill ? (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700"><FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{bill.name}</span><button type="button" aria-label="Remove bill" onClick={() => setBill(null)} className="text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button></span>
              ) : editing && batch.billUrl ? (
                <button type="button" onClick={() => openFile(batch.billUrl)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink hover:underline"><FileText className="h-3.5 w-3.5" />{batch.billName || 'Current bill'}</button>
              ) : <span className="text-xs text-slate-500">No bill attached</span>}
            </div>
          </FormField>
        )}
        <FormField label="Note" optional error={v.error('note')}><Input maxLength={300} value={form.note} onValue={(x) => set({ note: x })} placeholder="Invoice / challan number, condition…" /></FormField>
      </FormModal>
      {addSupplier && (
        <SupplierForm
          supplier={{ categories: [product.category?.id || product.category].filter(Boolean) }}
          onClose={() => setAddSupplier(false)}
          onSaved={(s) => {
            suppliersResource.setData((list) => [...(list || []), s].sort((a, b) => a.name.localeCompare(b.name)));
            set({ supplier: s.id });
            setAddSupplier(false);
            toast.success('Supplier added');
          }}
        />
      )}
    </>
  );
}

export function BatchesCard({ product, batches, money, currency, onChanged }) {
  const may = useCan();
  const { data, loading, error } = batches;
  const [modal, setModal] = useState(null);
  const mfg = (b) => (b.mfgDate ? formatDate(b.mfgDate) : b.mfgYear || '—');

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Batches"
        description="Every receipt of stock with its own prices. Sales take the oldest batch with stock first unless another is chosen."
        action={may('inventory', 'create') && <Button variant="primary" icon={PackagePlus} onClick={() => setModal({ type: 'receive' })}>Receive stock</Button>}
      />
      {loading ? <LoadingBlock /> : error ? <Alert className="m-6">{error}</Alert> : !data?.length ? (
        <EmptyState icon={PackagePlus} title="No stock received yet" description="Receive the first batch with its supplier, prices and quantity. Until then this product has no price on proposals." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Batch</Th>
              <Th>Received</Th>
              <Th>Mfg.</Th>
              <Th className="text-right">Left / received</Th>
              <Th className="text-right">Purchase</Th>
              <Th className="text-right">Base</Th>
              <Th className="text-right">Wholesale</Th>
              <Th className="text-right">Retail</Th>
              <Th>Bill</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {data.map((b) => (
              <Tr key={b.id}>
                <Td>
                  <div className="font-medium text-slate-900">{b.batchNo || '—'}</div>
                  <div className="max-w-[180px] truncate text-xs text-slate-500" title={b.note || undefined}>{b.supplier?.name || ''}</div>
                </Td>
                <Td className="whitespace-nowrap text-[13px]">{formatDate(b.receivedDate)}</Td>
                <Td className="whitespace-nowrap text-[13px]">{mfg(b)}</Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  <span className={b.qtyRemaining > 0 ? 'font-medium text-slate-900' : 'text-slate-400'}>{b.qtyRemaining}</span>
                  <span className="text-slate-400"> / {b.qtyReceived}</span>
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums text-slate-500">{money(b.purchasePrice)}</Td>
                <Td className="text-right whitespace-nowrap tabular-nums">{money(b.basePrice)}</Td>
                <Td className="text-right whitespace-nowrap tabular-nums">{money(b.wholesalePrice)}</Td>
                <Td className="text-right whitespace-nowrap tabular-nums">{money(b.retailPrice)}</Td>
                <Td>{b.billUrl ? <button type="button" onClick={() => openFile(b.billUrl)} title={b.billName || 'Open the bill'} className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline"><FileText className="h-3.5 w-3.5" />View</button> : <span className="text-slate-300">—</span>}</Td>
                <Td>{may('inventory', 'update') && <IconButton icon={Pencil} label={`Edit batch ${b.batchNo || ''}`} onClick={() => setModal({ type: 'edit', item: b })} />}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {modal && (
        <BatchForm
          product={product}
          batch={modal.item}
          currency={currency}
          onClose={() => setModal(null)}
          onSaved={() => {
            toast.success(modal.item ? 'Batch updated' : 'Stock received');
            setModal(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

/* ───────────── serial units ───────────── */

export const UNIT_STATUS = {
  inStock: { label: 'In stock', tone: 'green' },
  sold: { label: 'Sold', tone: 'blue' },
  installed: { label: 'Installed', tone: 'violet' },
  returned: { label: 'Returned', tone: 'amber' },
};
// the moves that are made here by hand (selling and issuing go through invoices and installations)
const MANUAL = {
  sold: [{ to: 'installed', label: 'Mark installed' }, { to: 'returned', label: 'Mark returned' }],
  installed: [{ to: 'returned', label: 'Mark returned' }],
  returned: [{ to: 'inStock', label: 'Back in stock' }],
};

function UnitStatusForm({ unit, to, onClose, onSaved }) {
  const projects = useResource(to === 'installed' ? '/api/projects?limit=200' : null);
  const [form, setForm] = useState({ project: '', installDate: today() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = {
    installed: 'Where it was installed. Its warranty runs from the install date.',
    returned: 'The unit came back from the customer or site. It stays out of stock until you put it back.',
    inStock: 'The unit goes back into its batch and can be sold or issued again.',
  }[to];

  const submit = async () => {
    if (to === 'installed' && !form.project) return setError('Choose the installation');
    setBusy(true);
    setError('');
    try {
      onSaved(await api(`/api/stock/units/${unit.id}/status`, { method: 'PUT', body: { status: to, ...(to === 'installed' ? form : {}) } }));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={`${unit.serialNo}: ${UNIT_STATUS[to].label.toLowerCase()}`} description={text} submitLabel="Save" busy={busy} error={error} onSubmit={submit} noValidate>
      {to === 'installed' && (
        <>
          <FormField label="Installation" hint={projects.error || ''}>
            <Select value={form.project} onValue={(x) => setForm({ ...form, project: x })} disabled={projects.loading}>
              <option value="">{projects.loading ? 'Loading…' : 'Choose the installation'}</option>
              {(projects.data?.items || []).map((p) => <option key={p.id} value={p.id}>{p.design?.name || p.client?.name || p.id}</option>)}
            </Select>
          </FormField>
          <FormField label="Install date"><Input type="date" value={form.installDate} onValue={(x) => setForm({ ...form, installDate: x })} /></FormField>
        </>
      )}
    </FormModal>
  );
}

const UNIT_PAGE_SIZES = [10, 25, 50, 100];

export function UnitsCard({ product, onChanged }) {
  const may = useCan();
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(''); // `query` once typing pauses
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(UNIT_PAGE_SIZES[0]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  // paged and searched on the server: a product can have thousands of units
  const params = new URLSearchParams({ page: String(page), limit: String(pageSize), ...(status ? { status } : {}), ...(search ? { q: search } : {}) });
  const { data, error, reload } = useResource(`/api/stock/products/${product.id}/units?${params}`);
  // keep the current page on screen while the next one loads, so paging doesn't flash a spinner
  const [shown, setShown] = useState(null);
  if (data && data !== shown) setShown(data);
  const view = data || shown;
  const rows = view?.items || [];
  const [modal, setModal] = useState(null);
  // the last page emptied (its units changed status under this filter): step back to the page before
  if (data && !data.items.length && data.page > 1 && page === data.page) setPage(data.page - 1);
  // a filter or page size change starts again at page 1
  const refilter = (fn) => (v) => {
    fn(v);
    setPage(1);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Units"
        description="Each physical item by serial number. Warranty ends a set time after the install date."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Find serial number" placeholder="Find serial number" value={query} onValue={refilter(setQuery)} className="w-48" />
            <Select aria-label="Status" value={status} onValue={refilter(setStatus)} className="w-36">
              <option value="">All statuses</option>
              {Object.entries(UNIT_STATUS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
            </Select>
          </div>
        }
      />
      {error ? <Alert className="m-6">{error}</Alert> : !view ? <LoadingBlock /> : !rows.length ? (
        <p className="px-6 py-8 text-sm text-slate-400">{search ? 'No unit matches.' : status ? 'No units with this status.' : 'No units yet — receive stock with serial numbers.'}</p>
      ) : (
        <Table>
          <thead><tr><Th>Serial number</Th><Th>Batch</Th><Th>Status</Th><Th>Installed</Th><Th>Warranty ends</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <Tr key={u.id}>
                <Td className="font-mono text-[13px] text-slate-900">{u.serialNo}</Td>
                <Td className="text-[13px]">{u.batch?.batchNo || '—'}</Td>
                <Td><Badge tone={UNIT_STATUS[u.status]?.tone}>{UNIT_STATUS[u.status]?.label || u.status}</Badge></Td>
                <Td className="whitespace-nowrap text-[13px]">{u.installDate ? formatDate(u.installDate) : '—'}</Td>
                <Td className="whitespace-nowrap text-[13px]">{u.warrantyEnd ? <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />{formatDate(u.warrantyEnd)}</span> : <span className="text-slate-400">{u.status === 'sold' ? 'Starts at install' : '—'}</span>}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    {may('inventory', 'update') && (MANUAL[u.status] || []).map((m) => <Button key={m.to} size="sm" onClick={() => setModal({ unit: u, to: m.to })}>{m.label}</Button>)}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {view && (
        <TablePagination
          page={view.page}
          total={view.total}
          pageSize={view.limit}
          onPageChange={setPage}
          pageSizeOptions={UNIT_PAGE_SIZES}
          onPageSizeChange={refilter(setPageSize)}
        />
      )}
      {modal && (
        <UnitStatusForm
          unit={modal.unit}
          to={modal.to}
          onClose={() => setModal(null)}
          onSaved={() => {
            toast.success('Unit updated');
            setModal(null);
            reload();
            onChanged();
          }}
        />
      )}
    </Card>
  );
}
