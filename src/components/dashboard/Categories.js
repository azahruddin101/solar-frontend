'use client';

// Category management: the company's own catalog categories — name, how the designer uses their products,
// the usual specification names, and the order of the catalog tabs — and the parent categories they are
// filed under (parent category → category → products), which group the proposal's bill of materials.
import { ArrowDown, ArrowUp, Boxes, FolderPlus, FolderTree, Package, PanelsTopLeft, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { categorySchema, parentCategorySchema, useValidation } from '@/lib/validation';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, FormField, FormModal, IconButton, Input, LoadingBlock, PageHeader, Select, Table, Td, Th, Tr, buttonClass, cx, toast, RowMenu } from '../kit';
import { MAX_SPECS, PRODUCT_TYPES, typeOf } from './CatalogProducts';

let seq = 0;
const USE = {
  general: { label: 'Not used', tone: 'slate', icon: Package },
  panels: { label: 'Solar panels', tone: 'brand', icon: PanelsTopLeft },
  poles: { label: 'Poles', tone: 'violet', icon: Boxes },
};


function ParentForm({ parent, onClose, onSaved }) {
  const editing = Boolean(parent?.id);
  const [form, setForm] = useState({ name: parent?.name || '', description: parent?.description || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const v = useValidation(parentCategorySchema, form);
  const submit = async () => {
    const body = v.validate();
    if (!body) return;
    setBusy(true);
    setError('');
    try {
      onSaved(editing ? await api(`/api/parent-categories/${parent.id}`, { method: 'PUT', body }) : await api('/api/parent-categories', { method: 'POST', body }));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={editing ? 'Edit parent category' : 'New parent category'} description="A heading for several categories — Structures, Electricals… The bill of materials on the proposal is printed under these headings." submitLabel={editing ? 'Save changes' : 'Create parent category'} busy={busy} error={error} onSubmit={submit} noValidate>
      <FormField label="Parent category name" error={v.error('name')}><Input maxLength={60} value={form.name} onValue={(x) => setForm({ ...form, name: x.replace(/^\s+/, '').replace(/^./, (c) => c.toUpperCase()) })} placeholder="e.g. Electricals" /></FormField>
      <FormField label="Description" optional error={v.error('description')}><Input maxLength={300} value={form.description} onValue={(x) => setForm({ ...form, description: x })} /></FormField>
    </FormModal>
  );
}

function CategoryForm({ category, parents, onClose, onSaved }) {
  const editing = Boolean(category?.id);
  const [form, setForm] = useState({ name: category?.name || '', description: category?.description || '', type: typeOf(category), parent: category?.parent || '' });
  const [keys, setKeys] = useState(() => (category?.specKeys || []).map((k) => ({ id: ++seq, key: k })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const v = useValidation(categorySchema, { ...form, specKeys: keys.map((k) => k.key) });
  const submit = async () => {
    const body = v.validate();
    if (!body) return;
    setBusy(true);
    setError('');
    try {
      const saved = editing ? await api(`/api/categories/${category.id}`, { method: 'PUT', body }) : await api('/api/categories', { method: 'POST', body });
      onSaved({ products: category?.products || 0, ...saved });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={editing ? 'Edit category' : 'New category'} description="Group what you sell your way — panels, poles, inverters, wire, earthing, ACDB, DCDB…" submitLabel={editing ? 'Save changes' : 'Create category'} busy={busy} error={error} onSubmit={submit} size="lg" noValidate>
      <FormField label="Category name" error={v.error('name')}><Input maxLength={60} value={form.name} onValue={(x) => setForm({ ...form, name: x.replace(/^\s+/, '').replace(/^./, (c) => c.toUpperCase()) })} placeholder="e.g. Inverters" /></FormField>
      <FormField label="Description" optional error={v.error('description')}><Input maxLength={300} value={form.description} onValue={(x) => setForm({ ...form, description: x })} /></FormField>
      <FormField label="Parent category" optional hint={parents.length ? 'The heading this category is printed under in the bill of materials.' : 'Create a parent category first (Structures, Electricals…) to group your categories.'}>
        <Select value={form.parent} onValue={(x) => setForm({ ...form, parent: x })} disabled={!parents.length}>
          <option value="">No parent category</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </FormField>
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-slate-700">Used in the designer as</div>
        <div role="radiogroup" aria-label="Used in the designer as" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {PRODUCT_TYPES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={form.type === t.id} onClick={() => setForm({ ...form, type: t.id })} className={cx('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', form.type === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>{t.label}</button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">{PRODUCT_TYPES.find((t) => t.id === form.type)?.hint || ''}{editing && form.type === 'panels' && category.type !== 'panels' && category.products > 0 ? ' Existing products join the designer once you add their watt and size.' : ''}</p>
      </div>

      <fieldset>
        <legend className="mb-1.5 flex w-full items-baseline justify-between text-[13px] font-medium text-slate-700">Usual specifications <span className="text-xs font-normal text-slate-400">Optional</span></legend>
        <p className="mb-2.5 text-xs text-slate-500">Names that most products here share. They are pre-filled when you add a product, so you only type the values.</p>
        <div className="mb-2.5 flex flex-wrap gap-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center">
              <Input aria-label="Specification name" maxLength={60} value={k.key} onValue={(v) => setKeys(keys.map((x) => (x.id === k.id ? { ...x, key: v } : x)))} placeholder="e.g. Capacity (kW)" className="w-44 rounded-r-none" />
              <button type="button" aria-label="Remove" onClick={() => setKeys(keys.filter((x) => x.id !== k.id))} className="grid h-10 w-9 place-items-center rounded-r-lg border border-l-0 border-slate-300 text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <Button size="sm" icon={Plus} disabled={keys.length >= MAX_SPECS} onClick={() => setKeys([...keys, { id: ++seq, key: '' }])}>Add name</Button>
      </fieldset>
    </FormModal>
  );
}

export default function Categories({ catalogPath = '/dashboard/catalog' }) {
  const { data, setData, loading, error } = useResource('/api/categories');
  const parentsResource = useResource('/api/parent-categories');
  const parents = parentsResource.data || [];
  const parentName = new Map(parents.map((p) => [p.id, p.name]));
  const childrenOf = (id) => (data || []).filter((c) => c.parent === id);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const close = () => { setModal(null); setModalError(''); };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/categories/${modal.item.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.item.id));
      toast.success('Category deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };
  /** The categories under it stay, with their products; they only lose the heading. */
  const removeParent = async () => {
    setBusy(true);
    try {
      await api(`/api/parent-categories/${modal.item.id}`, { method: 'DELETE' });
      parentsResource.setData((list) => list.filter((x) => x.id !== modal.item.id));
      setData((list) => list.map((c) => (c.parent === modal.item.id ? { ...c, parent: null } : c)));
      toast.success('Parent category deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };
  const moveParent = async (i, by) => {
    const before = parents;
    const next = [...parents];
    next.splice(i + by, 0, next.splice(i, 1)[0]);
    parentsResource.setData(next);
    try {
      await api('/api/parent-categories/reorder', { method: 'POST', body: { ids: next.map((p) => p.id) } });
    } catch (e) {
      parentsResource.setData(before);
      toast.error(e.message);
    }
  };
  /** Move right away, save in the background; put it back if saving fails. */
  const move = async (i, by) => {
    const before = data;
    const next = [...data];
    next.splice(i + by, 0, next.splice(i, 1)[0]);
    setData(next);
    try {
      await api('/api/categories/reorder', { method: 'POST', body: { ids: next.map((c) => c.id) } });
    } catch (e) {
      setData(before);
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader title="Catalog categories" description="Group what you sell your way. The order here is the order of the tabs in your product catalog.">
        <Link href={catalogPath} className={buttonClass()}>Open catalog</Link>
        <Button icon={FolderTree} onClick={() => setModal({ type: 'parent' })}>New parent category</Button>
        <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>New category</Button>
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      {parentsResource.error && <Alert className="mb-6">{parentsResource.error}</Alert>}

      <Card className="mb-6 overflow-hidden">
        <CardHeader title="Parent categories" description="Headings your categories are filed under. The bill of materials on the proposal is printed in these groups, in this order." />
        {parentsResource.loading ? <LoadingBlock /> : !parents.length ? (
          <EmptyState icon={FolderTree} title="No parent categories yet" description="Create headings such as Structures and Electricals, then choose one for each category below.">
            <Button variant="primary" icon={FolderTree} onClick={() => setModal({ type: 'parent' })}>New parent category</Button>
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th className="w-10">#</Th><Th>Parent category</Th><Th>Categories</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {parents.map((p, i) => {
                const children = childrenOf(p.id);
                return (
                  <Tr key={p.id}>
                    <Td className="text-slate-400 tabular-nums">{i + 1}</Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><FolderTree className="h-[18px] w-[18px]" /></span>
                        <div className="min-w-0"><div className="max-w-[240px] truncate font-medium text-slate-900">{p.name}</div>{p.description && <div className="max-w-[240px] truncate text-xs text-slate-500">{p.description}</div>}</div>
                      </div>
                    </Td>
                    <Td>
                      {children.length ? <div className="flex max-w-[460px] flex-wrap gap-1">{children.slice(0, 6).map((c) => <Badge key={c.id}>{c.name}</Badge>)}{children.length > 6 && <span title={children.slice(6).map((c) => c.name).join(', ')}><Badge>+{children.length - 6}</Badge></span>}</div> : <span className="text-slate-400">No categories yet</span>}
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} className="disabled:opacity-30" onClick={() => moveParent(i, -1)} />
                        <IconButton icon={ArrowDown} label="Move down" disabled={i === parents.length - 1} className="disabled:opacity-30" onClick={() => moveParent(i, 1)} />
                        <RowMenu
                          label={`Actions for ${p.name}`}
                          items={[
                            { key: 'edit', icon: Pencil, label: 'Edit parent category', onClick: () => setModal({ type: 'parent', item: p }) },
                            { key: 'delete', icon: Trash2, label: 'Delete parent category', tone: 'danger', onClick: () => setModal({ type: 'deleteParent', item: p }) },
                          ]}
                        />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Categories" description="Each category holds products and can sit under one parent category." />
        {loading ? <LoadingBlock /> : !data?.length ? (
          <EmptyState icon={Tags} title="No categories yet" description="Create a category — solar panels, poles, inverters, batteries… — then add your products to it.">
            <Button variant="primary" icon={FolderPlus} onClick={() => setModal({ type: 'form' })}>New category</Button>
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th className="w-10">#</Th><Th>Category</Th><Th>Parent category</Th><Th>Used in the designer as</Th><Th>Usual specifications</Th><Th className="text-right">Products</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {data.map((c, i) => {
                const use = USE[typeOf(c)];
                return (
                  <Tr key={c.id}>
                    <Td className="text-slate-400 tabular-nums">{i + 1}</Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><use.icon className="h-[18px] w-[18px]" /></span>
                        <div className="min-w-0"><div className="max-w-[240px] truncate font-medium text-slate-900">{c.name}</div>{c.description && <div className="max-w-[240px] truncate text-xs text-slate-500">{c.description}</div>}</div>
                      </div>
                    </Td>
                    <Td>{parentName.has(c.parent) ? <Badge tone="blue">{parentName.get(c.parent)}</Badge> : <span className="text-slate-400">—</span>}</Td>
                    <Td><Badge tone={use.tone}>{use.label}</Badge></Td>
                    <Td>
                      {c.specKeys.length ? <div className="flex max-w-[320px] flex-wrap gap-1">{c.specKeys.slice(0, 4).map((k) => <Badge key={k}>{k}</Badge>)}{c.specKeys.length > 4 && <span title={c.specKeys.slice(4).join(', ')}><Badge>+{c.specKeys.length - 4}</Badge></span>}</div> : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td className="text-right tabular-nums"><Link href={`${catalogPath}?category=${c.id}`} className="font-medium text-brand hover:underline">{c.products}</Link></Td>
                    <Td>
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} className="disabled:opacity-30" onClick={() => move(i, -1)} />
                        <IconButton icon={ArrowDown} label="Move down" disabled={i === data.length - 1} className="disabled:opacity-30" onClick={() => move(i, 1)} />
                        <RowMenu
                          label={`Actions for ${c.name}`}
                          items={[
                            { key: 'products', icon: Package, label: 'View products', href: `${catalogPath}?category=${c.id}` },
                            { key: 'edit', icon: Pencil, label: 'Edit category', onClick: () => setModal({ type: 'form', item: c }) },
                            { key: 'delete', icon: Trash2, label: 'Delete category', tone: 'danger', onClick: () => setModal({ type: 'delete', item: c }) },
                          ]}
                        />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {modal?.type === 'form' && (
        <CategoryForm
          category={modal.item}
          parents={parents}
          onClose={close}
          onSaved={(c) => {
            setData((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]));
            toast.success(modal.item ? 'Category updated' : 'Category created');
            close();
          }}
        />
      )}
      {modal?.type === 'parent' && (
        <ParentForm
          parent={modal.item}
          onClose={close}
          onSaved={(p) => {
            parentsResource.setData((list) => ((list || []).some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...(list || []), p]));
            toast.success(modal.item ? 'Parent category updated' : 'Parent category created');
            close();
          }}
        />
      )}
      <ConfirmDialog open={modal?.type === 'deleteParent'} onClose={close} onConfirm={removeParent} busy={busy} error={modalError} title="Delete this parent category?" confirmLabel="Delete parent category">
        <b className="text-slate-900">{modal?.item?.name}</b> will be deleted. Its categories and their products are kept — they just no longer sit under a parent category.
      </ConfirmDialog>
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this category?" confirmLabel="Delete category">
        <b className="text-slate-900">{modal?.item?.name}</b> will be deleted{modal?.item?.products ? <>, together with <b className="text-slate-900">its {modal.item.products} product{modal.item.products > 1 ? 's' : ''}</b></> : ''}.{typeOf(modal?.item) !== 'general' && ' Designs using its products fall back to another product.'}
      </ConfirmDialog>
    </>
  );
}
