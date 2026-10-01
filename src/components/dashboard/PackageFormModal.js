'use client';

// The "Create / edit package" modal, split out of Packages.js so that file stays focused on the list.
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { packageSchema, useValidation } from '@/lib/validation';
import { api } from '@/lib/api';
import { capFirst } from '@/lib/catalog';
import { useResource } from '@/lib/useResource';
import { Button, FormField, FormModal, IconButton, Input, Select, toast } from '../kit';

export const PACKAGE_ITEM_TYPES = [
  { id: 'panel', label: 'Solar Panel', defaultUnit: 'Nos', defaultSpec: '550W Mono PERC' },
  { id: 'inverter', label: 'Inverter', defaultUnit: 'Nos', defaultSpec: 'Grid-tied On-Grid' },
  { id: 'poles', label: 'Poles / Mounting Structure', defaultUnit: 'set', defaultSpec: 'GI Elevated / Flush' },
  { id: 'wire', label: 'Wire / Cabling', defaultUnit: 'm', defaultSpec: '4 sq.mm DC + AC Cabling' },
  { id: 'earthing', label: 'Earthing Kit', defaultUnit: 'sets', defaultSpec: 'Chemical Earthing Pits + Electrodes' },
  { id: 'acdb', label: 'ACDB', defaultUnit: 'Nos', defaultSpec: 'AC Distribution Box with MCB + SPD' },
  { id: 'dcdb', label: 'DCDB', defaultUnit: 'Nos', defaultSpec: 'DC Distribution Box with Fuse + SPD' },
  { id: 'other', label: 'Other Accessories', defaultUnit: 'Nos', defaultSpec: 'Connectors, fasteners & hardware' },
];

export default function PackageFormModal({ pkg, onClose, onSaved, currency }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const productsRes = useResource('/api/products');
  const categoriesRes = useResource('/api/categories');
  const catalogProducts = productsRes.data || [];
  const categories = categoriesRes.data || [];

  // Group products by category name for optgroups
  const productsByCategory = useMemo(() => {
    const map = new Map();
    for (const p of catalogProducts) {
      const cat = categories.find((c) => String(c.id) === String(p.category));
      const catName = cat ? cat.name : (p.type === 'panels' ? 'Solar Panels' : p.type === 'poles' ? 'Poles / Mounting Structure' : 'General Equipment');
      if (!map.has(catName)) map.set(catName, []);
      map.get(catName).push(p);
    }
    return map;
  }, [catalogProducts, categories]);

  const [form, setForm] = useState(() => ({
    name: pkg?.name || '',
    kw: pkg?.kw !== undefined ? pkg.kw : 5,
    price: pkg?.price !== undefined ? pkg.price : 250000,
    description: pkg?.description || '',
    items: pkg?.items?.length
      ? pkg.items.map((it) => ({ ...it }))
      : [],
  }));

  const updateItem = (index, patch) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], ...patch };
      return { ...prev, items };
    });
  };

  const handleProductSelect = (index, productId) => {
    const p = catalogProducts.find((item) => item.id === productId);
    if (!p) {
      updateItem(index, { productId: '' });
      return;
    }

    // Determine equipment type based on product type / category
    let inferredType = 'other';
    const cat = categories.find((c) => String(c.id) === String(p.category));
    const catNameLower = (cat?.name || '').toLowerCase();

    if (p.type === 'panels' || catNameLower.includes('panel')) inferredType = 'panel';
    else if (p.type === 'poles' || catNameLower.includes('pole') || catNameLower.includes('pillar') || catNameLower.includes('structure')) inferredType = 'poles';
    else if (catNameLower.includes('inverter')) inferredType = 'inverter';
    else if (catNameLower.includes('wire') || catNameLower.includes('cabling') || catNameLower.includes('cable')) inferredType = 'wire';
    else if (catNameLower.includes('earthing')) inferredType = 'earthing';
    else if (catNameLower.includes('acdb')) inferredType = 'acdb';
    else if (catNameLower.includes('dcdb')) inferredType = 'dcdb';

    const specsStr = Array.isArray(p.specs) && p.specs.length > 0
      ? p.specs.map((s) => `${s.key}: ${s.value}`).join(', ')
      : p.watts
      ? `${p.watts}W Mono PERC (${p.length}x${p.width}m)`
      : p.description || '';

    updateItem(index, {
      productId: p.id,
      itemType: inferredType,
      name: p.name,
      brand: p.brand || '',
      model: p.model || '',
      spec: specsStr,
      unit: p.unit || (p.type === 'poles' ? 'Set' : 'Nos'),
    });
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { productId: '', itemType: 'other', name: '', brand: '', model: '', spec: '', qty: 1, unit: 'Nos' },
      ],
    }));
  };

  const removeItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const v = useValidation(packageSchema, { name: form.name, kw: form.kw, price: form.price, description: form.description });
  const save = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!v.validate()) return;

    const validItems = form.items.filter((it) => it.productId);
    if (validItems.length === 0) {
      setError('Please add at least one product to the package');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        kw: Number(form.kw) || 0,
        price: Number(form.price),
        description: form.description.trim(),
        items: validItems
          .filter((it) => it.productId)
          .map((it) => ({
            productId: it.productId,
            qty: Number(it.qty) || 1,
            unit: capFirst(it.unit) || 'Nos',
          })),
      };
      const res = pkg?.id
        ? await api(`/api/packages/${pkg.id}`, { method: 'PUT', body: payload })
        : await api('/api/packages', { method: 'POST', body: payload });
      toast.success(pkg?.id ? 'Package updated' : 'Package created');
      onSaved(res);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save package');
    }
    setBusy(false);
  };

  return (
    <FormModal
      open
      onClose={onClose}
      onSubmit={save}
      busy={busy}
      error={error}
      title={pkg?.id ? 'Edit package' : 'Create solar package'}
      description="Select from your existing catalog products to bundle panels, inverters, poles, wire, earthing, ACDB and DCDB."
      submitLabel={pkg?.id ? 'Save changes' : 'Create package'}
      size="2xl"
      noValidate
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Package name" className="sm:col-span-2" error={v.error('name')}>
            <Input
              maxLength={120}
              value={form.name}
              onValue={(x) => setForm({ ...form, name: x.replace(/^\s+/, '').replace(/^./, (c) => c.toUpperCase()) })}
              placeholder="e.g. 5kW Complete Rooftop Package"
            />
          </FormField>
          <FormField label="Capacity (kW)" hint="System size in kW" error={v.error('kw')}>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.kw}
              onValue={(x) => setForm({ ...form, kw: x })}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={`Package price (${currency})`} hint="Total bundled price for client" error={v.error('price')}>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.price}
              onValue={(x) => setForm({ ...form, price: x })}
            />
          </FormField>
          <FormField label="Description / Highlights" optional className="sm:col-span-2" error={v.error('description')}>
            <Input
              maxLength={1000}
              value={form.description}
              onValue={(x) => setForm({ ...form, description: x })}
              placeholder="e.g. Complete turnkey solution with 5-year on-site warranty"
            />
          </FormField>
        </div>

        {/* Package components created by selecting existing catalog products */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Included Equipment & Scope</h4>
              <p className="text-xs text-slate-500">
                Select from your existing catalog products. Brand, model, and specs will be populated automatically.
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={addItem}>
              Add component
            </Button>
          </div>

          {form.items.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-200 bg-white p-6 text-center">
              <p className="text-xs text-slate-500 mb-3">No products added to this package yet.</p>
              <Button type="button" size="sm" variant="primary" icon={Plus} onClick={addItem}>
                Select First Product
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {form.items.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs shadow-2xs space-y-2.5"
                >
                  {/* Product picker from existing catalog products */}
                  <div className="grid grid-cols-12 gap-2.5 items-end">
                    <div className="col-span-12 sm:col-span-4">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1">
                        Select Existing Product <span className="text-brand font-bold">*</span>
                      </label>
                      <select
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none focus:border-brand"
                        value={item.productId || ''}
                        onChange={(e) => handleProductSelect(idx, e.target.value)}
                      >
                        <option value="">-- Choose from existing products --</option>
                        {Array.from(productsByCategory.entries()).map(([catTitle, prods]) => (
                          <optgroup key={catTitle} label={catTitle}>
                            {prods.map((prod) => (
                              <option key={prod.id} value={prod.id}>
                                {prod.name} {prod.brand ? `[${prod.brand}]` : ''} {prod.watts ? `(${prod.watts}W)` : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-12 sm:col-span-3">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">Equipment Type</label>
                      <Select
                        value={item.itemType}
                        onValue={(v) => {
                          const meta = PACKAGE_ITEM_TYPES.find((t) => t.id === v);
                          updateItem(idx, {
                            itemType: v,
                            unit: meta?.defaultUnit || item.unit,
                          });
                        }}
                      >
                        {PACKAGE_ITEM_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="col-span-6 sm:col-span-3">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-brand font-medium block mb-1">Brand Name</label>
                      <Input
                        placeholder="e.g. Tata / Waaree / Growatt"
                        value={item.brand || ''}
                        onValue={(v) => updateItem(idx, { brand: v })}
                      />
                    </div>

                    <div className="col-span-6 sm:col-span-2">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-brand font-medium block mb-1">Model Name</label>
                      <Input
                        placeholder="e.g. TSP101 550W / MIN 5000"
                        value={item.model || ''}
                        onValue={(v) => updateItem(idx, { model: v })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2.5 items-center pt-2 border-t border-slate-100">
                    <div className="col-span-12 sm:col-span-4">
                      <Input
                        required
                        placeholder="Item name (e.g. Solar Panels)"
                        value={item.name}
                        onValue={(v) => updateItem(idx, { name: v })}
                      />
                    </div>

                    <div className="col-span-12 sm:col-span-4">
                      <Input
                        placeholder="Specification / Details (e.g. Mono PERC 144 half-cut cells, Wi-Fi)"
                        value={item.spec}
                        onValue={(v) => updateItem(idx, { spec: v })}
                      />
                    </div>

                    <div className="col-span-5 sm:col-span-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qty"
                        value={item.qty}
                        onValue={(v) => updateItem(idx, { qty: v })}
                      />
                    </div>

                    <div className="col-span-5 sm:col-span-1">
                      <Input
                        placeholder="Unit"
                        value={item.unit}
                        onValue={(v) => updateItem(idx, { unit: v })}
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <IconButton
                        type="button"
                        icon={Trash2}
                        tone="danger"
                        title="Remove item"
                        onClick={() => removeItem(idx)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </FormModal>
  );
}
