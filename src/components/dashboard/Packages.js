'use client';

import { CheckCircle2, PackageCheck, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, LoadingBlock, toast } from '../kit';
import PackageFormModal from './PackageFormModal';

export default function Packages({ money: propMoney, currency: propCurrency }) {
  const session = useSession();
  const currency = propCurrency || session?.company?.currency || 'INR';
  const money = propMoney || ((v) => formatMoney(v, currency));
  const packages = useResource('/api/packages');
  const [modal, setModal] = useState(null); // { type: 'create' | 'edit' | 'delete', pkg }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const list = packages.data || [];

  const remove = async () => {
    if (!modal?.pkg) return;
    setBusy(true);
    try {
      await api(`/api/packages/${modal.pkg.id}`, { method: 'DELETE' });
      packages.setData((prev) => prev.filter((p) => p.id !== modal.pkg.id));
      toast.success('Package removed');
      setModal(null);
    } catch (err) {
      setError(err.message || 'Could not delete package');
    }
    setBusy(false);
  };

  const handleSaved = () => {
    packages.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Solar Packages</h3>
          <p className="text-xs text-slate-500">
            Bundled rooftop solar packages with all equipment included. When creating a design, choose between Package or Custom calculation mode.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'create' })}>
          Create package
        </Button>
      </div>

      {packages.loading && (
        <Card>
          <LoadingBlock />
        </Card>
      )}

      {packages.error && <Alert tone="danger">{packages.error}</Alert>}

      {!packages.loading && !packages.error && list.length === 0 && (
        <Card>
          <EmptyState
            icon={PackageCheck}
            title="No packages created yet"
            description="Create all-inclusive packages (Panels, Inverter, Poles, Cabling, Earthing, ACDB, DCDB) with fixed client pricing."
          >
            <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'create' })}>
              Create your first package
            </Button>
          </EmptyState>
        </Card>
      )}

      {!packages.loading && list.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.map((pkg) => (
            <div
              key={pkg.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">{pkg.name}</h4>
                    {pkg.description && (
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{pkg.description}</p>
                    )}
                  </div>
                  {pkg.kw ? (
                    <Badge tone="brand">
                      <Zap className="h-3 w-3" /> {pkg.kw} kW
                    </Badge>
                  ) : null}
                </div>

                <div className="my-3 rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <span className="text-xs text-slate-400 font-medium block">All-inclusive Package Price</span>
                  <span className="text-xl font-bold text-slate-900">{money(pkg.price)}</span>
                </div>

                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                    Included Components ({pkg.items?.length || 0})
                  </span>
                  <div className="space-y-1">
                    {(pkg.items || []).slice(0, 5).map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-slate-600">
                        <span className="flex items-center gap-1.5 truncate">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate font-medium">{it.name}</span>
                          {(it.brand || it.model) && (
                            <span className="truncate text-[11px] text-slate-400">
                              ({[it.brand, it.model].filter(Boolean).join(' ')})
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 shrink-0 ml-2">
                          {it.qty} {it.unit}
                        </span>
                      </div>
                    ))}
                    {(pkg.items?.length || 0) > 5 && (
                      <p className="text-[11px] text-slate-400 pl-5 pt-0.5">
                        +{pkg.items.length - 5} more items (wire, earthing, boxes...)
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Pencil}
                  onClick={() => setModal({ type: 'edit', pkg })}
                >
                  Edit
                </Button>
                <IconButton
                  size="sm"
                  tone="danger"
                  icon={Trash2}
                  title="Delete package"
                  onClick={() => setModal({ type: 'delete', pkg })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <PackageFormModal
          pkg={modal.pkg}
          currency={currency}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={modal?.type === 'delete'}
        onClose={() => setModal(null)}
        onConfirm={remove}
        busy={busy}
        error={error}
        title="Delete package?"
      >
        Are you sure you want to delete <b className="text-slate-900">{modal?.pkg?.name}</b>?
      </ConfirmDialog>
    </div>
  );
}
