'use client';

// Company-specific “per piece / per nos …” labels for catalog products (general categories).
import { Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MAX_PRODUCT_UNITS, productUnitsFor } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Input, PageHeader, showError, toast } from '../kit';

let seq = 0;

const toRows = (units) => units.map((u) => ({ id: ++seq, unit: u }));

export default function ProductUnitsPage() {
  const { company, setCompany } = useSession();
  const savedUnits = productUnitsFor(company);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => toRows(savedUnits));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setRows(toRows(productUnitsFor(company)));
  }, [company?.productUnits, editing]);

  const cancel = () => {
    setRows(toRows(productUnitsFor(company)));
    setEditing(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const productUnits = rows.map((r) => r.unit.trim()).filter(Boolean);
      setCompany(await api('/api/company', { method: 'PUT', body: { productUnits } }));
      toast.success('Units saved');
      setEditing(false);
    } catch (err) {
      showError(err, 'Units were not saved');
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        title="Product units"
        description="Names for the “Per” dropdown when you add catalog products (e.g. nos, piece, bundle)."
      >
        {!editing && (
          <Button variant="primary" icon={Pencil} onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </PageHeader>

      <Card className="max-w-2xl p-6">
        {editing ? (
          <form onSubmit={save} className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center">
                  <Input
                    aria-label="Unit name"
                    maxLength={20}
                    value={r.unit}
                    onValue={(v) => setRows(rows.map((x) => (x.id === r.id ? { ...x, unit: v.replace(/^\s+/, '').replace(/^./, (c) => c.toUpperCase()) } : x)))}
                    placeholder="e.g. Nos"
                    className="w-32 rounded-r-none sm:w-36"
                  />
                  <button
                    type="button"
                    aria-label="Remove unit"
                    disabled={rows.length <= 1}
                    onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                    className="grid h-10 w-9 place-items-center rounded-r-lg border border-l-0 border-slate-300 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" icon={Plus} disabled={rows.length >= MAX_PRODUCT_UNITS} onClick={() => setRows([...rows, { id: ++seq, unit: '' }])}>
                Add unit
              </Button>
              <Button type="submit" variant="primary" loading={busy}>Save</Button>
              <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {savedUnits.map((u) => (
              <Badge key={u}>{u}</Badge>
            ))}
          </div>
        )}

        <p className="mt-5 text-xs text-slate-500">Only these names appear in the “Per” dropdown when you add or edit products.</p>
      </Card>
    </>
  );
}
