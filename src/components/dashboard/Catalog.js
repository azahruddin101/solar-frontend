'use client';

// The company's product catalog: every tab is one of the company's own categories (see CatalogProducts.js),
// plus the pricing used by the designer.
import { Boxes, Package, PackageCheck, PanelsTopLeft, Plus, Settings2, Tags, Truck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { productUnitsFor } from '@/lib/catalog';
import { CURRENCIES, formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { useCan } from '@/lib/useCan';
import { Alert, Button, Card, CardHeader, ConfirmDialog, EmptyState, FilterNotice, FormField, Input, LoadingBlock, PageHeader, Select, Table, TablePagination, Tabs, Td, Th, Tr, buttonClass, showError, toast, usePagedItems } from '../kit';
import { CategoryProducts } from './CatalogProducts';
import Packages from './Packages';


const num = (v) => (v === '' ? '' : Number(v));

/** Product lists across every category that the dashboard links to (?show=), counted as the dashboard counts them. */
const STOCK_SHOWS = {
  out: { label: 'products out of stock', match: (p) => p.stock <= 0 },
  low: { label: 'products running low (at or below the reorder level)', match: (p) => p.stock > 0 && p.stock <= (p.reorderLevel || 0) },
  reorder: { label: 'products out of stock or running low', match: (p) => p.stock <= (p.reorderLevel || 0) }, // the catalog's lowStock badge
};

function StockAlerts({ show, categories, onClear }) {
  const pathname = usePathname();
  const products = useResource('/api/products');
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const rows = (products.data || []).filter(STOCK_SHOWS[show].match).sort((a, b) => a.stock - b.stock);
  const { rows: page, pager } = usePagedItems(rows, 10);
  return (
    <>
      <FilterNotice className="mb-4" label={STOCK_SHOWS[show].label} count={products.loading ? null : `${rows.length} product${rows.length === 1 ? '' : 's'}`} onClear={onClear} />
      {products.error && <Alert className="mb-4">{products.error}</Alert>}
      <Card className="overflow-hidden">
        {products.loading ? <LoadingBlock /> : !rows.length ? (
          <EmptyState icon={PackageCheck} title="Nothing here right now" description="Stock levels are fine. Use “Show all” to see the whole catalog." />
        ) : (
          <Table>
            <thead><tr><Th>Product</Th><Th>Category</Th><Th className="text-right">In stock</Th><Th className="text-right">Reorder at</Th></tr></thead>
            <tbody>
              {page.map((p) => (
                <Tr key={p.id}>
                  <Td><Link href={`${pathname}/${p.id}`} className="font-medium text-slate-900 hover:text-brand hover:underline">{p.name}</Link>{(p.brand || p.model) && <div className="text-xs text-slate-500">{[p.brand, p.model].filter(Boolean).join(' · ')}</div>}</Td>
                  <Td className="text-slate-600">{nameOf.get(p.category?.id || p.category) || '—'}</Td>
                  <Td className={`text-right font-semibold tabular-nums ${p.stock <= 0 ? 'text-red-700' : 'text-amber-700'}`}>{`${p.stock} ${p.unit || ''}`}<div className="text-xs font-normal">{p.stock <= 0 ? 'Out of stock' : 'Low stock'}</div></Td>
                  <Td className="text-right text-slate-500 tabular-nums">{p.reorderLevel ? `${p.reorderLevel} ${p.unit || ''}` : '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <TablePagination {...pager} />
      </Card>
    </>
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
      const patch = await api('/api/company/catalog-settings', { method: 'PUT', body: form });
      setCompany({ ...company, ...patch });
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

export default function Catalog({ mastersPath = '/dashboard/masters?tab=catalog-categories' }) {
  const company = useSession((s) => s.company);
  const isOwner = useSession((s) => s.user?.role === 'company'); // pricing defaults are a company master
  const may = useCan();
  const categories = useResource('/api/categories');
  const designer = useResource('/api/catalog'); // which of the products the designer picks up
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [picked, setPicked] = useState(params.get('category')); // ?category=<id> from the categories page
  const stockShow = STOCK_SHOWS[params.get('show')] ? params.get('show') : ''; // ?show=low|out from the dashboard
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const money = (v) => formatMoney(v, company.currency);
  const productUnits = productUnitsFor(company);

  const list = categories.data || [];
  // the first category until a tab is picked (or after the picked one is deleted)
  const tab = picked === 'pricing' || picked === 'packages' || list.some((c) => c.id === picked) ? picked : list[0]?.id || 'packages';
  const category = list.find((c) => c.id === tab);
  // a few categories show as tabs; the rest sit in a dropdown, so nothing needs sideways scrolling.
  // The open category always stays visible as a tab, taking the last slot when it came from the dropdown.
  const MAX_TABS = 3;
  let shown = list.slice(0, MAX_TABS);
  if (category && !shown.includes(category)) shown = [...list.slice(0, MAX_TABS - 1), category];
  const more = list.filter((c) => !shown.includes(c));
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
        {may('finances', 'create_eway_bill') && <Link href="/dashboard/billing?new=eway" className={buttonClass({ variant: 'secondary' })}><Truck className="h-4 w-4" />E-way bill</Link>}
        {category && may('inventory', 'create') && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'product' })}>Add product</Button>}
      </PageHeader>
      {categories.error && <Alert className="mb-6">{categories.error}</Alert>}
      {missing.length > 0 && (
        <Alert tone="info" className="mb-6">
          The designer has no {missing.join(' or ')} of yours yet, so it uses built-in samples. Under <Link href={mastersPath} className="font-medium underline">Manage categories</Link>, set a category’s <b>Used in the designer as</b>, then add products to it.
        </Alert>
      )}
      {stockShow ? <StockAlerts show={stockShow} categories={list} onClear={() => router.replace(pathname)} /> : (<>
      <div className="mb-6 flex items-end gap-2">
        <Tabs
          className="min-w-0 flex-1"
          value={tab}
          onChange={setPicked}
          tabs={[
            ...shown.map((c) => ({
              id: c.id,
              label: c.name,
              icon: c.type === 'panels' ? PanelsTopLeft : c.type === 'poles' ? Boxes : Package,
              count: c.products,
            })),
            // { id: 'packages', label: 'Packages', icon: PackageCheck },
            // { id: 'pricing', label: 'Pricing', icon: Wallet },
          ]}
        />
        {more.length > 0 && (
          <Select aria-label="More categories" value="" onValue={setPicked} className="mb-1.5 h-8! w-auto max-w-[14rem] py-0! text-[13px]">
            <option value="">More categories ({more.length})</option>
            {more.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.products})</option>)}
          </Select>
        )}
        <Link href={mastersPath} className={buttonClass({ size: 'sm', className: 'mb-1.5 shrink-0' })}><Settings2 className="h-3.5 w-3.5" /> Manage categories</Link>
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
          {!list.length && <Card className="mb-6"><EmptyState icon={Tags} title="No categories yet" description="Create a category — solar panels, poles, inverters… — then add your products to it."><Link href={mastersPath} className={buttonClass({ variant: 'primary' })}>Create a category</Link></EmptyState></Card>}
          {isOwner ? <Pricing /> : <Alert tone="info">Pricing settings are managed by your company admin.</Alert>}
        </>
      )}
      </>)}


      <ConfirmDialog open={modal?.type === 'delete-product'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this product?">
        <b className="text-slate-900">{modal?.item?.name}</b> will be removed from your catalog.{modal?.item?.type && modal.item.type !== 'general' && ' Designs already using it fall back to another product.'}
      </ConfirmDialog>
    </>
  );
}
