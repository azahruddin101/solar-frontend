'use client';

// One product: its details and attributes, its stock (batches with their prices) and, when tracked by serial number,
// its units with warranty ends.
import { ArrowLeft, Boxes, Hash, Package, PanelsTopLeft, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { PILLAR_SHAPES, productUnitsFor } from '@/lib/catalog';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { useCan } from '@/lib/useCan';
import { Alert, Badge, Button, Card, ConfirmDialog, IconButton, LoadingBlock, capName, toast } from '@/components/kit';
import { attributeRows } from './attributes';
import { ProductForm, typeOf, warrantyLabel } from './CatalogProducts';
import { ProductDocumentsCard } from './ProductDocuments';
import { BatchesCard, UnitsCard } from './ProductStock';
import { useBreadcrumb } from '@/lib/breadcrumbs';

function Fact({ label, children }) {
  return (
    <div>
      <span className="text-xs text-slate-400">{label}</span>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{children || '—'}</p>
    </div>
  );
}

export default function ProductDetail({ id, catalogPath = '/dashboard/catalog' }) {
  const router = useRouter();
  const company = useSession((s) => s.company);
  const may = useCan();
  const productResource = useResource(`/api/products/${id}`);
  useBreadcrumb(capName(productResource.data?.name));
  const categoriesResource = useResource('/api/categories');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const product = productResource.data;
  const categories = categoriesResource.data || [];
  const category = product?.category && typeof product.category === 'object'
    ? product.category
    : categories.find((c) => c.id === product?.category);
  const type = typeOf(category);
  const catalogHref = category?.id ? `${catalogPath}?category=${category.id}` : catalogPath;
  const money = (v) => formatMoney(v, company.currency);
  const shapeLabel = PILLAR_SHAPES.find((sh) => sh.id === product?.shape)?.label || product?.shape;
  const batches = useResource(`/api/stock/products/${id}/batches`);
  const attrs = useMemo(() => attributeRows(category, product?.attributes), [category, product?.attributes]);
  // stock and prices change when a batch is received or a unit goes back into stock
  const refreshStock = () => {
    batches.reload();
    productResource.reload();
  };
  const brands = useMemo(() => [product?.brand].filter(Boolean), [product?.brand]);
  const productUnits = productUnitsFor(company);

  const close = () => {
    setModal(null);
    setModalError('');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/products/${id}`, { method: 'DELETE' });
      toast.success('Product deleted');
      router.replace(catalogHref);
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  if (productResource.loading) return <LoadingBlock />;
  if (productResource.error) {
    return (
      <div className="space-y-4">
        <Link href={catalogPath} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to catalog
        </Link>
        <Alert>{productResource.error}</Alert>
      </div>
    );
  }
  if (!product) return null;

  const TypeIcon = type === 'panels' ? PanelsTopLeft : type === 'poles' ? Boxes : Package;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={catalogHref}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50"
            title="Back to catalog"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
              {category?.name && (
                <Badge>
                  <TypeIcon className="h-3 w-3" /> {category.name}
                </Badge>
              )}
              {type === 'panels' && product.watts ? <Badge tone="brand">{product.watts} W</Badge> : null}
              {product.warrantyMonths ? (
                <Badge tone="green">
                  <ShieldCheck className="h-3 w-3" /> {warrantyLabel(product.warrantyMonths)} warranty
                </Badge>
              ) : null}
              {product.isSerialized && <Badge tone="violet"><Hash className="h-3 w-3" /> By serial number</Badge>}
            </div>
            <p className="text-xs text-slate-500">{[product.brand, product.model].filter(Boolean).join(' · ') || 'Catalog product'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {may('inventory', 'update') && (
            <Button variant="primary" icon={Pencil} onClick={() => setModal({ type: 'edit' })}>
              Edit
            </Button>
          )}
          {may('inventory', 'delete') && <IconButton icon={Trash2} label="Delete product" tone="danger" onClick={() => setModal({ type: 'delete' })} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <h2 className="mb-4 text-sm font-semibold tracking-wider text-slate-500 uppercase">Product information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Fact label="Brand">{product.brand}</Fact>
              <Fact label="Model">{product.model}</Fact>
              <Fact label="SKU / item code">{product.sku}</Fact>
              <Fact label="HSN Code">{product.hsnCode}</Fact>
              <Fact label="GST %">{product.gstPercent != null ? `${product.gstPercent}%` : '18%'}</Fact>
              <Fact label="Unit">{product.unit}</Fact>
              {type === 'panels' && (
                <>
                  <Fact label="Watt (Wp)">{product.watts ? `${product.watts} W` : ''}</Fact>
                  <Fact label="Size">{product.length && product.width ? `${product.length} × ${product.width} m` : ''}</Fact>
                </>
              )}
              {type === 'poles' && <Fact label="Pole type">{shapeLabel}</Fact>}
              <Fact label="Warranty">{product.warrantyMonths ? `${warrantyLabel(product.warrantyMonths)} from installation` : ''}</Fact>
              <Fact label="Reorder level">{product.reorderLevel ? `${product.reorderLevel} ${product.unit}` : ''}</Fact>
              {product.description && (
                <div className="sm:col-span-2 rounded-lg border border-slate-100 bg-slate-50 p-3.5">
                  <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Notes</span>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{product.description}</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-sm font-semibold tracking-wider text-slate-500 uppercase">Attributes</h2>
            {!attrs.length ? (
              <p className="text-sm text-slate-400">No attributes filled in.</p>
            ) : (
              <dl className="divide-y divide-slate-100">
                {attrs.map((a) => (
                  <div key={a.key} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-slate-500">{a.label}</dt>
                    <dd className="text-sm font-medium text-slate-900">{a.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">Inventory</h3>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">{product.stock ?? 0}</p>
            <p className="mt-1 text-sm text-slate-500">{product.unit} in stock{batches.data ? ` across ${batches.data.filter((b) => b.qtyRemaining > 0).length} batch${batches.data.filter((b) => b.qtyRemaining > 0).length === 1 ? '' : 'es'}` : ''}</p>
            {product.lowStock && <p className="mt-3 text-xs font-medium text-amber-700">{(product.stock ?? 0) > 0 ? `Low stock — at or below the reorder level of ${product.reorderLevel} ${product.unit}.` : 'Out of stock — receive a new batch.'}</p>}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-400">Selling price on proposals</span>
              <p className="mt-0.5 text-sm font-medium text-slate-900">{product.price ? <>{money(product.price)}<span className="font-normal text-slate-500"> / {product.unit}</span></> : '—'}</p>
              <p className="mt-1 text-xs text-slate-500">Retail price of the batch sold next (the oldest with stock), else of the newest batch.</p>
            </div>
          </Card>
          <ProductDocumentsCard product={product} canEdit={may('inventory', 'update')} onChanged={(saved) => productResource.setData(saved)} />
        </div>
      </div>

      <BatchesCard product={product} batches={batches} money={money} currency={company.currency} onChanged={refreshStock} />
      {product.isSerialized && <UnitsCard product={product} onChanged={refreshStock} />}

      {modal?.type === 'edit' && category && (
        <ProductForm
          product={{ ...product, hasBatches: Boolean(batches.data?.length) }}
          category={category}
          categories={categories.length ? categories : [category]}
          brands={brands}
          units={productUnits}
          onClose={close}
          onSaved={(saved) => {
            productResource.setData(saved);
            toast.success('Saved');
            close();
          }}
        />
      )}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this product?" confirmLabel="Delete product">
        <b className="text-slate-900">{product.name}</b> will be removed from your catalog. A product that stock was received for can’t be deleted.{type !== 'general' && ' Designs already using it fall back to another product.'}
      </ConfirmDialog>
    </div>
  );
}
