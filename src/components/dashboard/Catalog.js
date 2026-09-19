'use client';

// The company's own products: solar panels, mounting poles and the pricing used by the designer.
import { Boxes, Download, FileSpreadsheet, PanelsTopLeft, Pencil, Plus, Search, ShieldCheck, Trash2, Upload, Wallet } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { PILLAR_SHAPES } from '@/lib/catalog';
import { CURRENCIES, formatMoney } from '@/lib/energy';
import { exportPanels, importPanels } from '@/lib/excel';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, FormField, FormModal, IconButton, Input, LoadingBlock, PageHeader, Select, Table, Tabs, Td, Th, Tr, toast } from '../kit';

const THIS_YEAR = new Date().getFullYear();
const BLANK_PANEL = { brand: '', model: '', watts: 550, manufactureYear: THIS_YEAR, warrantyYears: 25, length: 2.28, width: 1.13, price: 0 };
const BLANK_POLE = { name: '', shape: 'square', pricePerFt: 0 };
const num = (v) => (v === '' ? '' : Number(v));

function useSaver(path, item, onSaved) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (form) => {
    setBusy(true);
    setError('');
    try {
      onSaved(item?.id ? await api(`${path}/${item.id}`, { method: 'PUT', body: form }) : await api(path, { method: 'POST', body: form }));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return { busy, error, save };
}

function PanelForm({ panel, brands, currency, onClose, onSaved }) {
  const [form, setForm] = useState({ ...BLANK_PANEL, ...panel });
  const { busy, error, save } = useSaver('/api/panels', panel, onSaved);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  return (
    <FormModal open onClose={onClose} title={panel?.id ? 'Edit solar panel' : 'Add a solar panel'} description="Available in the designer and printed on proposals." submitLabel={panel?.id ? 'Save changes' : 'Add panel'} busy={busy} error={error} onSubmit={() => save(form)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Brand">
          <Input required maxLength={60} list="panel-brands" value={form.brand} onValue={(v) => set({ brand: v })} placeholder="Waaree" />
          <datalist id="panel-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
        </FormField>
        <FormField label="Model"><Input required maxLength={60} value={form.model} onValue={(v) => set({ model: v })} placeholder="WSMD-550" /></FormField>
        <FormField label="Watt (Wp)"><Input type="number" required min={1} max={2000} value={form.watts} onValue={(v) => set({ watts: num(v) })} /></FormField>
        <FormField label={`Price per panel (${currency})`}><Input type="number" min={0} step="any" value={form.price} onValue={(v) => set({ price: num(v) })} /></FormField>
        <FormField label="Manufacture year"><Input type="number" required min={1990} max={2100} value={form.manufactureYear} onValue={(v) => set({ manufactureYear: num(v) })} /></FormField>
        <FormField label="Warranty (years)"><Input type="number" required min={0} max={60} step="any" value={form.warrantyYears} onValue={(v) => set({ warrantyYears: num(v) })} /></FormField>
        <FormField label="Length (m)" hint="Used to fit panels on the roof."><Input type="number" required min={0.2} max={5} step="any" value={form.length} onValue={(v) => set({ length: num(v) })} /></FormField>
        <FormField label="Width (m)"><Input type="number" required min={0.2} max={5} step="any" value={form.width} onValue={(v) => set({ width: num(v) })} /></FormField>
      </div>
    </FormModal>
  );
}

function PoleForm({ pole, currency, onClose, onSaved }) {
  const [form, setForm] = useState({ ...BLANK_POLE, ...pole });
  const { busy, error, save } = useSaver('/api/pillars', pole, onSaved);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  return (
    <FormModal open onClose={onClose} size="sm" title={pole?.id ? 'Edit pole' : 'Add a pole'} submitLabel={pole?.id ? 'Save changes' : 'Add pole'} busy={busy} error={error} onSubmit={() => save(form)}>
      <FormField label="Name / material"><Input required maxLength={60} value={form.name} onValue={(v) => set({ name: v })} placeholder="GI square tube 60×60" /></FormField>
      <FormField label="Type"><Select value={form.shape} onValue={(v) => set({ shape: v })}>{PILLAR_SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></FormField>
      <FormField label={`Price per foot (${currency})`}><Input type="number" min={0} step="any" value={form.pricePerFt} onValue={(v) => set({ pricePerFt: num(v) })} /></FormField>
    </FormModal>
  );
}

function Pricing() {
  const { company, setCompany } = useSession();
  const [form, setForm] = useState({ currency: company.currency, tariff: company.tariff, otherCostPerKw: company.otherCostPerKw });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setCompany(await api('/api/company', { method: 'PUT', body: form }));
      toast.success('Pricing saved');
    } catch (err) {
      toast.error(err.message);
    }
    setBusy(false);
  };
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Pricing settings" description="Applied to every new calculation in the designer." />
      <form onSubmit={save} className="grid gap-4 p-6 sm:grid-cols-2">
        <FormField label="Currency"><Select value={form.currency} onValue={(v) => setForm({ ...form, currency: v })}>{Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}</Select></FormField>
        <FormField label="Electricity price per unit (kWh)" hint="Converts a client’s bill into units and savings."><Input type="number" required min={0} step="any" value={form.tariff} onValue={(v) => setForm({ ...form, tariff: num(v) })} /></FormField>
        <FormField label="Balance-of-system cost per kW" hint="Inverter, cabling, protection and labour — added on top of panels and poles." className="sm:col-span-2"><Input type="number" required min={0} step="any" value={form.otherCostPerKw} onValue={(v) => setForm({ ...form, otherCostPerKw: num(v) })} /></FormField>
        <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy}>Save pricing</Button></div>
      </form>
    </Card>
  );
}

export default function Catalog() {
  const company = useSession((s) => s.company);
  const panels = useResource('/api/panels');
  const poles = useResource('/api/pillars');
  const [tab, setTab] = useState('panels');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [importNote, setImportNote] = useState(null);
  const fileRef = useRef(null);
  const money = (v) => formatMoney(v, company.currency);

  const brands = useMemo(() => [...new Set((panels.data || []).map((p) => p.brand))].sort(), [panels.data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (panels.data || []).filter((p) => !q || `${p.brand} ${p.model} ${p.watts}`.toLowerCase().includes(q));
  }, [panels.data, query]);

  const close = () => { setModal(null); setModalError(''); };
  const upsertInto = (res) => (item) => {
    res.setData((list) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]));
    toast.success('Saved');
    close();
  };
  const remove = async () => {
    const isPanel = modal.type === 'delete-panel';
    setBusy(true);
    try {
      await api(`/api/${isPanel ? 'panels' : 'pillars'}/${modal.item.id}`, { method: 'DELETE' });
      (isPanel ? panels : poles).setData((list) => list.filter((x) => x.id !== modal.item.id));
      toast.success('Deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };
  const onImport = async (file) => {
    setImportNote(null);
    try {
      const { items, errors } = await importPanels(file);
      if (!items.length) throw new Error(errors[0] || 'No panels found in the file.');
      const { added, updated } = await api('/api/panels/import', { method: 'POST', body: { items } });
      await panels.reload();
      setImportNote({ tone: errors.length ? 'warn' : 'success', text: `Imported ${file.name}: ${added} added, ${updated} updated${errors.length ? ` · skipped — ${errors.slice(0, 3).join('; ')}` : ''}.` });
    } catch (e) {
      setImportNote({ tone: 'error', text: e.message });
    }
  };

  return (
    <>
      <PageHeader title="Product catalog" description="The solar panels and mounting poles your company sells, with your prices.">
        {tab === 'panels' && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'panel' })}>Add panel</Button>}
        {tab === 'poles' && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'pole' })}>Add pole</Button>}
      </PageHeader>
      {(panels.error || poles.error) && <Alert className="mb-6">{panels.error || poles.error}</Alert>}
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ id: 'panels', label: 'Solar panels', icon: PanelsTopLeft, count: panels.data?.length }, { id: 'poles', label: 'Poles / pillars', icon: Boxes, count: poles.data?.length }, { id: 'pricing', label: 'Pricing', icon: Wallet }]} />

      {tab === 'panels' && (
        <>
          {importNote && <Alert tone={importNote.tone} className="mb-4">{importNote.text}</Alert>}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
                <Input aria-label="Search panels" placeholder="Search by brand, model or watt" value={query} onValue={setQuery} className="pl-9" />
              </div>
              {company.features.excelImport && (
                <>
                  <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
                  <Button icon={Upload} onClick={() => fileRef.current?.click()}>Import Excel</Button>
                </>
              )}
              <Button icon={Download} onClick={() => exportPanels(panels.data || [])}>{panels.data?.length ? 'Export' : 'Template'}</Button>
            </div>
            {panels.loading ? <LoadingBlock /> : !rows.length ? (
              <EmptyState icon={PanelsTopLeft} title={panels.data?.length ? 'No panels match' : 'No solar panels yet'} description={panels.data?.length ? 'Try a different search.' : 'Add the panels you sell so they can be used in designs.'}>
                {!panels.data?.length && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'panel' })}>Add panel</Button>}
              </EmptyState>
            ) : (
              <Table>
                <thead><tr><Th>Brand &amp; model</Th><Th className="text-right">Watt</Th><Th>Mfg. year</Th><Th>Warranty</Th><Th>Size</Th><Th className="text-right">Price / panel</Th><Th className="text-right">Actions</Th></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <Tr key={p.id}>
                      <Td><div className="font-medium text-slate-900">{p.brand}</div><div className="text-xs text-slate-500">{p.model || '—'}</div></Td>
                      <Td className="text-right font-medium whitespace-nowrap tabular-nums">{p.watts} W</Td>
                      <Td className="tabular-nums">{p.manufactureYear || '—'}</Td>
                      <Td><Badge tone="green"><ShieldCheck className="h-3 w-3" /> {p.warrantyYears} yr</Badge></Td>
                      <Td className="text-[13px] whitespace-nowrap text-slate-500 tabular-nums">{p.length} × {p.width} m</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">{money(p.price)}</Td>
                      <Td><div className="flex justify-end gap-0.5"><IconButton icon={Pencil} label="Edit" onClick={() => setModal({ type: 'panel', item: p })} /><IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setModal({ type: 'delete-panel', item: p })} /></div></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          {company.features.excelImport && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel columns: Brand, Model, Watt, Manufacture year, Warranty (years), Length (m), Width (m), Price per panel. Matching brand + model + watt rows are updated.</p>}
        </>
      )}

      {tab === 'poles' && (
        <Card className="overflow-hidden">
          {poles.loading ? <LoadingBlock /> : !poles.data?.length ? (
            <EmptyState icon={Boxes} title="No poles yet" description="Add the mounting poles you use so structure costs can be priced."><Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'pole' })}>Add pole</Button></EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Name / material</Th><Th>Type</Th><Th className="text-right">Price / foot</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {poles.data.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium text-slate-900">{p.name}</Td>
                    <Td>{PILLAR_SHAPES.find((s) => s.id === p.shape)?.label || p.shape}</Td>
                    <Td className="text-right tabular-nums">{money(p.pricePerFt)}</Td>
                    <Td><div className="flex justify-end gap-0.5"><IconButton icon={Pencil} label="Edit" onClick={() => setModal({ type: 'pole', item: p })} /><IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setModal({ type: 'delete-pole', item: p })} /></div></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'pricing' && <Pricing />}

      {modal?.type === 'panel' && <PanelForm panel={modal.item} brands={brands} currency={company.currency} onClose={close} onSaved={upsertInto(panels)} />}
      {modal?.type === 'pole' && <PoleForm pole={modal.item} currency={company.currency} onClose={close} onSaved={upsertInto(poles)} />}
      <ConfirmDialog open={Boolean(modal?.type?.startsWith('delete'))} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this product?">
        <b className="text-slate-900">{modal?.item?.name || `${modal?.item?.brand} ${modal?.item?.model}`}</b> will be removed from your catalog. Designs already using it fall back to another product.
      </ConfirmDialog>
    </>
  );
}
