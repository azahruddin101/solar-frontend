'use client';

// Catalog categories and their products. A category says how the designer uses its products — not at all,
// as solar panels (watt, size) or as mounting poles (shape, per foot) — and the product form follows it.
// Each category defines the attributes its products carry. Prices and stock come from the product's batches
// (received on the product page), so the list shows them read-only.
import { ChevronDown, Download, FileSpreadsheet, Package, Plus, Search, Tags, Upload } from 'lucide-react';
import Link from 'next/link';
import { num as zNum, productSchema, textRequired, useValidation } from '@/lib/validation';
import { useId, useMemo, useRef, useState } from 'react';
import { ProductDocumentsField, applyDocumentChanges } from './ProductDocuments';
import { AttributeChips, AttributeFields, attributeErrors, attributePayload, attributeRows, sortedDefs } from './attributes';
import { api } from '@/lib/api';
import { DEFAULT_PRODUCT_UNITS, normalizeProductUnit, PILLAR_SHAPES } from '@/lib/catalog';
import { exportPanels, importPanels } from '@/lib/excel';
import { useResource } from '@/lib/useResource';
import { useCan } from '@/lib/useCan';
import { Alert, Badge, Button, Card, EmptyState, FormField, Input, LoadingBlock, Modal, Select, Table, Td, Textarea, Th, Tr, cx, showError, toast } from '../kit';

// first letter upper-case as it is typed (the rest is left alone, spaces included)
const upperFirst = (v) => v.replace(/^\s+/, '').replace(/^./, (c) => c.toUpperCase());
const num = (v) => (v === '' ? '' : Number(v)); // number inputs: keep '' while the field is empty
const BLANK = (units) => ({
  name: '',
  brand: '',
  model: '',
  sku: '',
  hsnCode: '',
  unit: normalizeProductUnit('', units),
  gstPercent: 18,
  warrantyMonths: 0,
  reorderLevel: 0,
  isSerialized: false,
  description: '',
  attributes: {},
});
// starting values of the designer fields in a panel / pole category
const TYPE_DEFAULTS = {
  general: {},
  panels: { watts: 550, length: 2.28, width: 1.13 },
  poles: { shape: 'square' },
};

/** How the designer uses a category's products. */
export const PRODUCT_TYPES = [
  { id: 'general', label: 'Not used', hint: 'Catalog items only — inverters, batteries, cables, services…' },
  { id: 'panels', label: 'Solar panels', hint: 'Products here also ask for watt and size, and can be picked in the designer.' },
  { id: 'poles', label: 'Poles', hint: 'Products here are priced per foot and used for structure costs in the designer.' },
];
export const typeOf = (category) => (PRODUCT_TYPES.some((t) => t.id === category?.type) ? category.type : 'general');

/** "25 years", "18 months", "2 years 6 months" */
export function warrantyLabel(months) {
  const m = Number(months) || 0;
  if (!m) return '';
  const y = Math.floor(m / 12);
  const r = m % 12;
  return [y && `${y} year${y > 1 ? 's' : ''}`, r && `${r} month${r > 1 ? 's' : ''}`].filter(Boolean).join(' ');
}

/* ───────────── product form ───────────── */

const NO_DOC_CHANGES = { added: [], removed: [] };

const DETAILS = ['brand', 'model', 'sku', 'hsnCode', 'description'];

function categoryIdOf(value) {
  if (!value) return '';
  return typeof value === 'object' ? value.id : value;
}

/**
 * Kept short on purpose: name, unit and the category's attributes up front; brand, SKU, warranty… behind "More details".
 * No price or quantity here: those come in with each stock receipt (a batch) on the product page.
 * "Save & add another" keeps the form open for entering a whole list.
 */
export function ProductForm({ product, category, categories, brands, units, onClose, onSaved }) {
  const editing = Boolean(product?.id);
  const catalogUnits = units?.length ? units : DEFAULT_PRODUCT_UNITS;
  const blank = () => ({ ...BLANK(catalogUnits), category: category.id });
  const [form, setForm] = useState(() => {
    const catId = categoryIdOf(product?.category) || category.id;
    const base = blank();
    return {
      ...base,
      ...product,
      category: catId,
      unit: normalizeProductUnit(product?.unit ?? base.unit, catalogUnits),
      attributes: { ...(product?.attributes || {}) },
    };
  });
  const unitOptions = catalogUnits;
  const [more, setMore] = useState(true);
  // switching serial-number tracking after stock was received would break the unit records (the server refuses it)
  const trackingLocked = editing && (product.stock > 0 || product.hasBatches);
  const [busy, setBusy] = useState('');
  const [docChanges, setDocChanges] = useState(NO_DOC_CHANGES); // applied once the product itself is saved
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const formId = useId();
  const brandsId = useId();
  const nameRef = useRef(null);
  // the category decides whether the designer fields (watt + size, pole type) are asked, and which attributes
  const formCategory = categories.find((c) => c.id === form.category) || category;
  const type = typeOf(formCategory);
  const value = (k) => form[k] ?? TYPE_DEFAULTS[type][k] ?? '';

  const { stock, price, lowStock, hasBatches, documents, ...fields } = form; // read-only: from the batches / own endpoints
  const payload = { ...TYPE_DEFAULTS[type], ...fields, attributes: attributePayload(formCategory, form.attributes) };
  // panels are named from brand + model when the name is blank, but need watt and size; every other product needs a name
  const schema = useMemo(() => (type === 'panels'
    ? productSchema.extend({ watts: zNum({ min: 1, max: 2000, label: 'Watt' }), length: zNum({ min: 0.2, max: 5, label: 'Length' }), width: zNum({ min: 0.2, max: 5, label: 'Width' }) })
    : productSchema.extend({ name: textRequired(120, 'Product name') })), [type]);
  const v = useValidation(schema, payload);

  const attrErrors = attributeErrors(formCategory, form.attributes);
  const [attrsChecked, setAttrsChecked] = useState(false);
  const pickCategory = (nextId) => {
    if (String(nextId) === String(form.category)) return;
    const nextCat = categories.find((c) => String(c.id) === String(nextId));
    const nextType = typeOf(nextCat);
    setForm((f) => {
      const next = { ...f, category: nextId, attributes: {} };
      if (nextType === 'panels') return { ...next, ...TYPE_DEFAULTS.panels, shape: undefined };
      if (nextType === 'poles') return { ...next, ...TYPE_DEFAULTS.poles, watts: undefined, length: undefined, width: undefined };
      return { ...next, watts: undefined, length: undefined, width: undefined, shape: undefined };
    });
    setAttrsChecked(false);
    v.reset();
  };
  const submit = async (another) => {
    setAttrsChecked(true);
    const body = v.validate();
    if (!body || Object.keys(attrErrors).length) return;
    setBusy(another ? 'another' : 'save');
    try {
      let saved = editing ? await api(`/api/products/${product.id}`, { method: 'PUT', body }) : await api('/api/products', { method: 'POST', body });
      try {
        saved = await applyDocumentChanges(saved, docChanges);
      } catch (e) {
        showError(e, 'The product was saved, but a PDF was not uploaded');
      }
      setDocChanges(NO_DOC_CHANGES);
      onSaved(saved, another);
      if (another) {
        // same kind of product again: keep the category, designer use and unit
        setForm({ ...blank(), category: form.category, unit: normalizeProductUnit(form.unit, catalogUnits) });
        setAttrsChecked(false);
        v.reset();
        nameRef.current?.focus();
      }
    } catch (e) {
      showError(e, 'The product was not saved');
    }
    setBusy('');
  };
  // which button submitted the form
  const onSubmit = (e) => {
    e.preventDefault();
    submit(e.nativeEvent.submitter?.value === 'another');
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={editing ? 'Edit product' : 'Add product'}
      description={!editing ? `Adding to ${formCategory.name}. Change the category below if needed.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{editing ? 'Cancel' : 'Close'}</Button>
          {!editing && <Button type="submit" form={formId} value="another" loading={busy === 'another'} disabled={Boolean(busy)}>Save &amp; add another</Button>}
          <Button type="submit" form={formId} value="save" variant="primary" loading={busy === 'save'} disabled={Boolean(busy)}>{editing ? 'Save changes' : 'Add product'}</Button>
        </>
      }
    >
      <form id={formId} noValidate className="space-y-4" onSubmit={onSubmit}>
        <FormField label="Category" hint={categories.length > 1 ? 'Pick the catalog category first — it controls designer fields and attributes.' : 'Products in this category share the same attribute list.'}>
          <Select required value={form.category} onValue={pickCategory} disabled={categories.length < 2}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Product name" error={v.error('name')}><Input ref={nameRef} maxLength={120} value={form.name} onValue={(x) => set({ name: upperFirst(x) })} placeholder="e.g. Waaree 550 W mono panel" /></FormField>
        <div className="grid grid-cols-[130px_100px_130px] gap-3">
          <FormField label="Unit">
            <Select required value={form.unit} onValue={(v) => set({ unit: v })}>
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </FormField>
          <FormField label="GST %" error={v.error('gstPercent')} hint=""><Input type="number" min={0} max={100} step="any" value={form.gstPercent ?? 18} onValue={(x) => set({ gstPercent: num(x) })} /></FormField>
          <FormField label="Reorder level" error={v.error('reorderLevel')}><Input type="number" min={0} step="any" value={form.reorderLevel ?? 0} onValue={(x) => set({ reorderLevel: num(x) })} /></FormField>
        </div>
        <label className={cx('flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5', trackingLocked && 'opacity-70')}>
          <input type="checkbox" className="mt-0.5" checked={Boolean(form.isSerialized)} disabled={trackingLocked} onChange={(e) => set({ isSerialized: e.target.checked })} />
          <span>
            <span className="block text-[13px] font-medium text-slate-800">Track by serial number</span>
            <span className="block text-xs text-slate-500">{trackingLocked ? 'Stock of this product has been received, so this can no longer change.' : 'For items tracked one by one — panels, inverters, batteries. Each receipt then asks for the serial numbers; cables, poles and boxes are tracked by batch quantity.'}</span>
          </span>
        </label>
        <p className="text-xs text-slate-500">Prices, quantity and manufacture date are entered when stock is received, on the product page.</p>

        {type === 'panels' && (
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Watt (Wp)" error={v.error('watts')}><Input type="number" min={1} max={2000} value={value('watts')} onValue={(x) => set({ watts: num(x) })} /></FormField>
            <FormField label="Length (m)" error={v.error('length')}><Input type="number" min={0.2} max={5} step="any" value={value('length')} onValue={(x) => set({ length: num(x) })} /></FormField>
            <FormField label="Width (m)" error={v.error('width')}><Input type="number" min={0.2} max={5} step="any" value={value('width')} onValue={(x) => set({ width: num(x) })} /></FormField>
          </div>
        )}
        {type === 'poles' && <FormField label="Pole type" className="max-w-xs"><Select value={value('shape')} onValue={(v) => set({ shape: v })}>{PILLAR_SHAPES.map((sh) => <option key={sh.id} value={sh.id}>{sh.label}</option>)}</Select></FormField>}

        <fieldset className="border-t border-slate-100 pt-4">
          <legend className="sr-only">Attributes</legend>
          <div className="mb-2 text-[13px] font-medium text-slate-700">{formCategory.name} attributes</div>
          <AttributeFields category={formCategory} values={form.attributes} onChange={(attributes) => set({ attributes })} errors={attrsChecked ? attrErrors : {}} />
          {editing && sortedDefs(formCategory).length > 0 && attributeRows({ attributes: [] }, Object.fromEntries(Object.entries(form.attributes || {}).filter(([k]) => !sortedDefs(formCategory).some((d) => d.key === k)))).length > 0 && (
            <p className="mt-2 text-xs text-slate-500">This product also keeps values for attributes no longer in the category; they are left as they are.</p>
          )}
        </fieldset>

        <div className="border-t border-slate-100 pt-3">
          <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900">
            <ChevronDown className={cx('h-4 w-4 transition-transform', more && 'rotate-180')} /> More details <span className="font-normal text-slate-400">— brand, model, SKU, HSN, warranty, notes</span>
          </button>
          {more && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FormField label="Brand">
                <Input maxLength={60} list={brandsId} value={form.brand} onValue={(v) => set({ brand: upperFirst(v) })} />
                <datalist id={brandsId}>{brands.map((b) => <option key={b} value={b} />)}</datalist>
              </FormField>
              <FormField label="Model" error={v.error('model')}><Input maxLength={60} value={form.model} onValue={(v) => set({ model: v })} /></FormField>
              <FormField label="SKU / item code" error={v.error('sku')}><Input maxLength={60} value={form.sku} onValue={(x) => set({ sku: x })} /></FormField>
              <FormField label="HSN Code" error={v.error('hsnCode')}><Input inputMode="numeric" maxLength={8} value={form.hsnCode || ''} onValue={(x) => set({ hsnCode: x.replace(/\D/g, '') })} placeholder="e.g. 854140" /></FormField>
              <FormField label="Warranty (months)" error={v.error('warrantyMonths')} hint={form.warrantyMonths ? `${warrantyLabel(form.warrantyMonths)}, counted from the install date` : 'Counted from the install date'}><Input type="number" min={0} max={720} step="1" value={form.warrantyMonths ?? 0} onValue={(x) => set({ warrantyMonths: num(x) })} /></FormField>
              <FormField label="Notes" className="sm:col-span-2"><Textarea rows={2} maxLength={1000} value={form.description} onValue={(v) => set({ description: v })} placeholder="Inclusions, compatibility…" /></FormField>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="mb-2 text-[13px] font-medium text-slate-700">Documents <span className="font-normal text-slate-400">— PDFs, up to 20 MB each</span></div>
          <ProductDocumentsField documents={product?.documents} value={docChanges} onChange={setDocChanges} />
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── one category's tab ───────────── */

/** `modal` / `setModal` come from the Catalog page so its header button can open the form too. */
export function CategoryProducts({ category, categories, money, units, excelImport, modal, setModal, onCount, catalogPath = '/dashboard/catalog' }) {
  const may = useCan();
  const { data, setData, loading, error, reload } = useResource(`/api/products?category=${category.id}`);
  const [query, setQuery] = useState('');
  const [importNote, setImportNote] = useState(null);
  const fileRef = useRef(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((p) => !q || `${p.name} ${p.brand} ${p.model} ${p.sku} ${p.hsnCode || ''} ${p.watts || ''} ${attributeRows(category, p.attributes).map((r) => `${r.label} ${r.value}`).join(' ')}`.toLowerCase().includes(q));
  }, [data, query, category]);
  const brands = useMemo(() => [...new Set((data || []).map((p) => p.brand).filter(Boolean))].sort(), [data]);
  const type = typeOf(category);
  const panels = data || [];
  const panelTools = type === 'panels'; // Excel import / export

  const saved = (item, another) => {
    const next = item.category !== category.id ? data.filter((x) => x.id !== item.id) : data.some((x) => x.id === item.id) ? data.map((x) => (x.id === item.id ? item : x)) : [...data, item];
    setData(next);
    onCount(category.id, next.length, item.category !== category.id ? item.category : null);
    toast.success(another ? `${item.name} added` : 'Saved');
    if (!another) setModal(null);
  };
  const onImport = async (file) => {
    setImportNote(null);
    try {
      const { items, errors } = await importPanels(file);
      if (!items.length) throw new Error(errors[0] || 'No panels found in the file.');
      const { added, updated } = await api('/api/products/import', { method: 'POST', body: { category: category.id, items } });
      await reload();
      onCount(category.id, (data?.length || 0) + added);
      setImportNote({ tone: errors.length ? 'warn' : 'success', text: `Imported ${file.name}: ${added} added, ${updated} updated${errors.length ? ` · skipped — ${errors.slice(0, 3).join('; ')}` : ''}.` });
    } catch (e) {
      setImportNote({ tone: 'error', text: e.message });
    }
  };

  return (
    <>
      {importNote && <Alert tone={importNote.tone} className="mb-4">{importNote.text}</Alert>}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0 flex-1 basis-56">
            <h2 className="truncate text-[15px] font-semibold text-slate-900">{category.name}</h2>
            {category.description && <p className="truncate text-[13px] text-slate-500">{category.description}</p>}
          </div>
          <div className="relative w-64 max-w-full">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input aria-label={`Search ${category.name}`} placeholder="Search name, brand, SKU, HSN or attribute" value={query} onValue={setQuery} className="pl-9" />
          </div>
          {panelTools && (
            <>
              {excelImport && may('inventory', 'create') && may('inventory', 'update') && (
                <>
                  <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
                  <Button icon={Upload} onClick={() => fileRef.current?.click()}>Import panels</Button>
                </>
              )}
              <Button icon={Download} onClick={() => exportPanels(panels)}>{panels.length ? 'Export panels' : 'Excel template'}</Button>
            </>
          )}
        </div>
        {loading ? <LoadingBlock /> : error ? <p className="px-6 py-8 text-sm text-red-700">{error}</p> : !rows.length ? (
          <EmptyState icon={Package} title={data?.length ? 'No products match' : `Nothing in ${category.name} yet`} description={data?.length ? 'Try a different search.' : 'Add a product and its attributes, then receive stock on its page.'}>
            {!data?.length && may('inventory', 'create') && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'product' })}>Add product</Button>}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Attributes</Th>
                <Th>Warranty</Th>
                <Th className="text-right">In stock</Th>
                <Th className="text-right"><span title="Retail price of the batch sold next (oldest with stock), else the newest batch">Price · from batches</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const subtitle = [p.brand, p.model, type === 'panels' && p.watts ? `${p.watts} W` : null].filter(Boolean).join(' · ');
                return (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`${catalogPath}/${p.id}`} className="block max-w-[320px] truncate font-medium text-slate-900 hover:text-brand hover:underline" title={p.description || undefined}>{p.name}</Link>
                      <div className="max-w-[320px] truncate text-xs text-slate-500">{subtitle || '—'}</div>
                    </Td>
                    <Td><AttributeChips category={category} attributes={p.attributes} /></Td>
                    <Td className="text-[13px] whitespace-nowrap text-slate-500">{warrantyLabel(p.warrantyMonths) || '—'}</Td>
                    <Td className="text-right whitespace-nowrap tabular-nums text-slate-700">
                      {p.stock ?? 0}<span className="text-xs text-slate-500"> {p.unit}</span>
                      {p.lowStock && <div><Badge tone="amber">{p.stock > 0 ? 'Low stock' : 'Out of stock'}</Badge></div>}
                      {p.isSerialized && <div className="text-[11px] text-slate-400">by serial no.</div>}
                    </Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">{p.price ? <>{money(p.price)}<span className="text-xs text-slate-500"> / {p.unit}</span></> : <span className="text-slate-400">No batch yet</span>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {panelTools && excelImport && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" /> Excel columns: Brand, Model, Watt, Warranty (years), Length (m), Width (m). Matching brand + model + watt rows in this category are updated; prices and stock are received as batches on each product’s page.</p>}
      {category.attributes?.length > 0 && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Tags className="h-4 w-4 shrink-0" /> Attributes: {sortedDefs(category).map((a) => `${a.label}${a.isRequired ? ' (required)' : ''}`).join(', ')}</p>}

      {modal?.type === 'product' && data && <ProductForm product={modal.item} category={category} categories={categories} brands={brands} units={units} onClose={() => setModal(null)} onSaved={saved} />}
    </>
  );
}
