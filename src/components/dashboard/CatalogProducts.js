'use client';

// Catalog categories and their products. A category says how the designer uses its products — not at all,
// as solar panels (watt, size) or as mounting poles (shape, per foot) — and the product form follows it.
// Every product can carry key/value specifications.
import { ChevronDown, Download, FileSpreadsheet, Package, Plus, Search, Tags, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { num as zNum, productSchema, textRequired, useValidation } from '@/lib/validation';
import { useId, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { DEFAULT_PRODUCT_UNITS, normalizeProductUnit, PILLAR_SHAPES } from '@/lib/catalog';
import { exportPanels, importPanels } from '@/lib/excel';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, EmptyState, FormField, IconButton, Input, LoadingBlock, Modal, Select, Table, Td, Textarea, Th, Tr, cx, showError, toast } from '../kit';

export const MAX_SPECS = 40;
const THIS_YEAR = new Date().getFullYear();
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
  price: 0,
  quantity: 0,
  warrantyYears: 0,
  description: '',
});
// starting values of the designer fields in a panel / pole category
const TYPE_DEFAULTS = {
  general: {},
  panels: { watts: 550, manufactureYear: THIS_YEAR, length: 2.28, width: 1.13 },
  poles: { shape: 'square' },
};

/** How the designer uses a category's products. */
export const PRODUCT_TYPES = [
  { id: 'general', label: 'Not used', hint: 'Catalog items only — inverters, batteries, cables, services…' },
  { id: 'panels', label: 'Solar panels', hint: 'Products here also ask for watt and size, and can be picked in the designer.' },
  { id: 'poles', label: 'Poles', hint: 'Products here are priced per foot and used for structure costs in the designer.' },
];
// specification names people usually want; offered as suggestions while typing
export const typeOf = (category) => (PRODUCT_TYPES.some((t) => t.id === category?.type) ? category.type : 'general');
const USUAL_KEYS = {
  general: [],
  panels: ['Cell type', 'Efficiency (%)', 'Voc (V)', 'Isc (A)', 'Weight (kg)', 'Frame', 'Certification', 'Country of origin'],
  poles: ['Material', 'Thickness (mm)', 'Coating', 'Standard length (ft)'],
};



/* ───────────── specifications (key/value rows) ───────────── */

let rowSeq = 0;
/** Form rows keep a local id so inputs don't lose focus when a row above is removed. */
export const toSpecRows = (specs, suggestedKeys = []) => {
  const rows = (specs || []).map((s) => ({ id: ++rowSeq, key: s.key, value: s.value }));
  const have = new Set(rows.map((r) => r.key.toLowerCase()));
  for (const key of suggestedKeys) if (!have.has(key.toLowerCase())) rows.push({ id: ++rowSeq, key, value: '' });
  return rows;
};
/** Rows without a name, and suggested names left without a value, are not saved. */
export const fromSpecRows = (rows) => rows.filter((r) => r.key.trim() && r.value.trim()).map((r) => ({ key: r.key.trim(), value: r.value.trim() }));

export function SpecsEditor({ rows, onChange, knownKeys = [] }) {
  const listId = useId();
  const patch = (id, p) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <fieldset>
      <legend className="mb-1.5 flex w-full items-baseline justify-between text-[13px] font-medium text-slate-700">Specifications <span className="text-xs font-normal text-slate-400">Optional</span></legend>
      <p className="mb-2.5 text-xs text-slate-500">Anything particular to this product, as name / value pairs.</p>
      {rows.length > 0 && (
        <div className="mb-2.5 space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <Input aria-label="Specification name" list={listId} maxLength={60} value={r.key} onValue={(v) => patch(r.id, { key: v })} placeholder="Name, e.g. Efficiency" className="w-2/5" />
              <Input aria-label={`Value of ${r.key || 'specification'}`} maxLength={200} value={r.value} onValue={(v) => patch(r.id, { value: v })} placeholder="Value, e.g. 21.3 %" className="min-w-0 flex-1" />
              <IconButton icon={X} label="Remove specification" tone="danger" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} />
            </div>
          ))}
        </div>
      )}
      <datalist id={listId}>{knownKeys.map((k) => <option key={k} value={k} />)}</datalist>
      <Button size="sm" icon={Plus} disabled={rows.length >= MAX_SPECS} onClick={() => onChange([...rows, { id: ++rowSeq, key: '', value: '' }])}>Add specification</Button>
    </fieldset>
  );
}

/** Up to three specs as chips, for table cells. */
export function SpecChips({ specs }) {
  if (!specs?.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex max-w-[320px] flex-wrap gap-1">
      {specs.slice(0, 3).map((s) => <Badge key={s.key} className="max-w-[200px]"><span className="truncate"><span className="text-slate-500">{s.key}:</span> {s.value}</span></Badge>)}
      {specs.length > 3 && <span title={specs.slice(3).map((s) => `${s.key}: ${s.value}`).join('\n')}><Badge>+{specs.length - 3}</Badge></span>}
    </div>
  );
}

/* ───────────── product form ───────────── */

const DETAILS = ['brand', 'model', 'sku', 'hsnCode', 'description'];

function categoryIdOf(value) {
  if (!value) return '';
  return typeof value === 'object' ? value.id : value;
}

/**
 * Kept short on purpose: name, price and specifications up front; brand, SKU, warranty… behind "More details".
 * "Save & add another" keeps the form open for entering a whole list.
 */
export function ProductForm({ product, category, categories, categoryKeys, brands, units, currency, onClose, onSaved }) {
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
    };
  });
  const unitOptions = catalogUnits;
  // new products start with the category's usual specification names
  const [specs, setSpecs] = useState(() => toSpecRows(product?.specs, editing ? [] : category.specKeys));
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const formId = useId();
  const brandsId = useId();
  const nameRef = useRef(null);
  // the category decides whether the designer fields (watt + size, pole type) are asked
  const type = typeOf(categories.find((c) => c.id === form.category) || category);
  const knownKeys = [...new Set([...categoryKeys, ...USUAL_KEYS[type]])];
  const value = (k) => form[k] ?? TYPE_DEFAULTS[type][k] ?? '';

  const payload = { ...TYPE_DEFAULTS[type], ...form, specs: fromSpecRows(specs) };
  // panels are named from brand + model when the name is blank, but need watt and size; every other product needs a name
  const schema = useMemo(() => (type === 'panels'
    ? productSchema.extend({ watts: zNum({ min: 1, max: 2000, label: 'Watt' }), length: zNum({ min: 0.2, max: 5, label: 'Length' }), width: zNum({ min: 0.2, max: 5, label: 'Width' }) })
    : productSchema.extend({ name: textRequired(120, 'Product name') })), [type]);
  const v = useValidation(schema, payload);

  const submit = async (another) => {
    const body = v.validate();
    if (!body) return;
    setBusy(another ? 'another' : 'save');
    try {
      const saved = editing ? await api(`/api/products/${product.id}`, { method: 'PUT', body }) : await api('/api/products', { method: 'POST', body });
      onSaved(saved, another);
      if (another) {
        // same kind of product again: keep the category, designer use and unit
        setForm({ ...blank(), category: form.category, unit: normalizeProductUnit(form.unit, catalogUnits) });
        setSpecs(toSpecRows([], category.specKeys));
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
      title={editing ? 'Edit product' : `Add to ${category.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{editing ? 'Cancel' : 'Close'}</Button>
          {!editing && <Button type="submit" form={formId} value="another" loading={busy === 'another'} disabled={Boolean(busy)}>Save &amp; add another</Button>}
          <Button type="submit" form={formId} value="save" variant="primary" loading={busy === 'save'} disabled={Boolean(busy)}>{editing ? 'Save changes' : 'Add product'}</Button>
        </>
      }
    >
      <form id={formId} noValidate className="space-y-4" onSubmit={onSubmit}>
        <FormField label="Product name" error={v.error('name')}><Input ref={nameRef} maxLength={120} value={form.name} onValue={(x) => set({ name: upperFirst(x) })} placeholder="e.g. Waaree 550 W mono panel" /></FormField>
        <div className="grid grid-cols-[1fr_130px_130px] gap-3">
          <FormField label={`Price (${currency})`} error={v.error('price')}><Input type="number" min={0} step="any" value={form.price} onValue={(x) => set({ price: num(x) })} /></FormField>
          <FormField label="Per">
            <Select required value={form.unit} onValue={(v) => set({ unit: v })}>
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </FormField>
          <FormField label="Quantity" error={v.error('quantity')}><Input type="number" min={0} step="any" value={form.quantity ?? 0} onValue={(x) => set({ quantity: num(x) })} /></FormField>
        </div>

        {type === 'panels' && (
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Watt (Wp)" error={v.error('watts')}><Input type="number" min={1} max={2000} value={value('watts')} onValue={(x) => set({ watts: num(x) })} /></FormField>
            <FormField label="Length (m)" error={v.error('length')}><Input type="number" min={0.2} max={5} step="any" value={value('length')} onValue={(x) => set({ length: num(x) })} /></FormField>
            <FormField label="Width (m)" error={v.error('width')}><Input type="number" min={0.2} max={5} step="any" value={value('width')} onValue={(x) => set({ width: num(x) })} /></FormField>
          </div>
        )}
        {type === 'poles' && <FormField label="Pole type" className="max-w-xs"><Select value={value('shape')} onValue={(v) => set({ shape: v })}>{PILLAR_SHAPES.map((sh) => <option key={sh.id} value={sh.id}>{sh.label}</option>)}</Select></FormField>}

        <div className="border-t border-slate-100 pt-4"><SpecsEditor rows={specs} onChange={setSpecs} knownKeys={knownKeys} /></div>

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
              <FormField label="Warranty (years)" error={v.error('warrantyYears')}><Input type="number" min={0} max={60} step="1" value={form.warrantyYears} onValue={(x) => set({ warrantyYears: num(x) })} /></FormField>
              {type === 'panels' && <FormField label="Manufacture year" error={v.error('manufactureYear')}><Input type="number" min={1990} max={2100} value={value('manufactureYear')} onValue={(x) => set({ manufactureYear: num(x) })} /></FormField>}
              {categories.length > 1 && <FormField label="Category"><Select value={form.category} onValue={(v) => set({ category: v })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField>}
              <FormField label="Notes" className="sm:col-span-2"><Textarea rows={2} maxLength={1000} value={form.description} onValue={(v) => set({ description: v })} placeholder="Inclusions, compatibility…" /></FormField>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── one category's tab ───────────── */

/** `modal` / `setModal` come from the Catalog page so its header button can open the form too. */
export function CategoryProducts({ category, categories, money, currency, units, excelImport, modal, setModal, onCount }) {
  const { data, setData, loading, error, reload } = useResource(`/api/products?category=${category.id}`);
  const [query, setQuery] = useState('');
  const [importNote, setImportNote] = useState(null);
  const fileRef = useRef(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((p) => !q || `${p.name} ${p.brand} ${p.model} ${p.sku} ${p.hsnCode || ''} ${p.watts || ''} ${p.specs.map((s) => `${s.key} ${s.value}`).join(' ')}`.toLowerCase().includes(q));
  }, [data, query]);
  const categoryKeys = useMemo(() => [...new Set([...category.specKeys, ...(data || []).flatMap((p) => p.specs.map((s) => s.key))])], [category.specKeys, data]);
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
            <Input aria-label={`Search ${category.name}`} placeholder="Search name, brand, SKU, HSN or specification" value={query} onValue={setQuery} className="pl-9" />
          </div>
          {panelTools && (
            <>
              {excelImport && (
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
          <EmptyState icon={Package} title={data?.length ? 'No products match' : `Nothing in ${category.name} yet`} description={data?.length ? 'Try a different search.' : 'Add a product with its price and any specifications that matter.'}>
            {!data?.length && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'product' })}>Add product</Button>}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Warranty</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Price</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const subtitle = [p.brand, p.model, type === 'panels' && p.watts ? `${p.watts} W` : null].filter(Boolean).join(' · ');
                return (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/dashboard/catalog/${p.id}`} className="block max-w-[320px] truncate font-medium text-slate-900 hover:text-brand hover:underline" title={p.description || undefined}>{p.name}</Link>
                      <div className="max-w-[320px] truncate text-xs text-slate-500">{subtitle || '—'}</div>
                    </Td>
                    <Td className="text-[13px] whitespace-nowrap text-slate-500">{p.warrantyYears || '—'}</Td>
                    <Td className="text-right whitespace-nowrap tabular-nums text-slate-700">{p.quantity ?? 0}<span className="text-xs text-slate-500"> {p.unit}</span></Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">{money(p.price)}<span className="text-xs text-slate-500"> / {p.unit}</span></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {panelTools && excelImport && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" /> Excel columns: Brand, Model, Watt, Manufacture year, Warranty (years), Length (m), Width (m), Price per panel. Matching brand + model + watt rows in this category are updated.</p>}
      {category.specKeys.length > 0 && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Tags className="h-4 w-4 shrink-0" /> Usual specifications: {category.specKeys.join(', ')}</p>}

      {modal?.type === 'product' && data && <ProductForm product={modal.item} category={category} categories={categories} categoryKeys={categoryKeys} brands={brands} units={units} currency={currency} onClose={() => setModal(null)} onSaved={saved} />}
    </>
  );
}
