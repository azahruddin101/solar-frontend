'use client';

// The company's product catalog: every tab is one of the company's own categories (see CatalogProducts.js),
// plus the pricing used by the designer.
import { Boxes, Package, PackageCheck, PanelsTopLeft, Plus, Settings2, Tags, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { productUnitsFor } from '@/lib/catalog';
import { CURRENCIES, formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, CardHeader, ConfirmDialog, EmptyState, FormField, Input, LoadingBlock, PageHeader, Select, Tabs, buttonClass, showError, toast } from '../kit';
import { CategoryProducts } from './CatalogProducts';
import Packages from './Packages';


const num = (v) => (v === '' ? '' : Number(v));

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
      showError(err, 'Pricing was not saved');
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
  const categories = useResource('/api/categories');
  const designer = useResource('/api/catalog'); // which of the products the designer picks up
  const [picked, setPicked] = useState(useSearchParams().get('category')); // ?category=<id> from the categories page
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const money = (v) => formatMoney(v, company.currency);
  const productUnits = productUnitsFor(company);

  const list = categories.data || [];
  // the first category until a tab is picked (or after the picked one is deleted)
  const tab = picked === 'pricing' || picked === 'packages' || list.some((c) => c.id === picked) ? picked : list[0]?.id || 'packages';
  const category = list.find((c) => c.id === tab);
  const missing = designer.data ? [!designer.data.panels.length && 'solar panel', !designer.data.pillars.length && 'pole'].filter(Boolean) : [];

  const close = () => { setModal(null); setModalError(''); };
  /** A category tab reports its product count (and the category a product moved to) so the tab badges stay right. */
  const onCount = (id, n, movedTo) => {
    designer.reload();
    categories.setData((cats) => cats.map((c) => (c.id === id ? { ...c, products: n } : c.id === movedTo ? { ...c, products: c.products + 1 } : c)));
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/products/${modal.item.id}`, { method: 'DELETE' });
      modal.done();
      toast.success('Deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Product catalog" description="Everything your company sells, in your own categories and with your prices.">
        {category && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'product' })}>Add product</Button>}
      </PageHeader>
      {categories.error && <Alert className="mb-6">{categories.error}</Alert>}
      {missing.length > 0 && (
        <Alert tone="info" className="mb-6">
          The designer has no {missing.join(' or ')} of yours yet, so it uses built-in samples. Under <Link href="/dashboard/categories" className="font-medium underline">Manage categories</Link>, set a category’s <b>Used in the designer as</b>, then add products to it.
        </Alert>
      )}
      <div className="mb-6 flex items-end gap-2">
        <Tabs
          className="min-w-0 flex-1"
          value={tab}
          onChange={setPicked}
          tabs={[
            ...list.map((c) => ({ id: c.id, label: c.name, icon: c.type === 'panels' ? PanelsTopLeft : c.type === 'poles' ? Boxes : Package, count: c.products })),
            // { id: 'packages', label: 'Packages', icon: PackageCheck },
            // { id: 'pricing', label: 'Pricing', icon: Wallet },
          ]}
        />
        <Link href="/dashboard/categories" className={buttonClass({ size: 'sm', className: 'mb-1.5' })}><Settings2 className="h-3.5 w-3.5" /> Manage categories</Link>
      </div>

      {categories.loading && <Card><LoadingBlock /></Card>}
      {category && (
        <CategoryProducts
          key={category.id}
          category={category}
          categories={list}
          money={money}
          currency={company.currency}
          units={productUnits}
          excelImport={company.features.excelImport}
          modal={modal}
          setModal={setModal}
          onCount={onCount}
        />
      )}
      {tab === 'packages' && (
        <Packages money={money} currency={company.currency} />
      )}
      {tab === 'pricing' && !categories.loading && (
        <>
          {!list.length && <Card className="mb-6"><EmptyState icon={Tags} title="No categories yet" description="Create a category — solar panels, poles, inverters… — then add your products to it."><Link href="/dashboard/categories" className={buttonClass({ variant: 'primary' })}>Create a category</Link></EmptyState></Card>}
          <Pricing />
        </>
      )}


      <ConfirmDialog open={modal?.type === 'delete-product'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this product?">
        <b className="text-slate-900">{modal?.item?.name}</b> will be removed from your catalog.{modal?.item?.type && modal.item.type !== 'general' && ' Designs already using it fall back to another product.'}
      </ConfirmDialog>
    </>
  );
}
