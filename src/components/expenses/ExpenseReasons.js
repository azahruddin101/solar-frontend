'use client';

// The company's list of expense reasons — what staff pick when they record spending on a project.
import { Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DEFAULT_EXPENSE_REASONS, MAX_EXPENSE_REASONS, expenseReasonsFor } from '@/lib/expenses';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, Input, LoadingBlock, PageHeader, showError, toast } from '../kit';
import { ExpenseTabs } from './shared';

let seq = 0;
const toRows = (reasons) => reasons.map((r) => ({ id: ++seq, reason: r }));

export default function ExpenseReasons({ basePath = '/dashboard/expenses' }) {
  const { company, setCompany, user } = useSession();
  const isOwner = user?.role === 'company';
  const saved = useResource('/api/expenses/reasons');
  const { reload } = saved;
  const list = Array.isArray(saved.data) ? saved.data : expenseReasonsFor(company);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => toRows(list));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing && Array.isArray(saved.data)) setRows(toRows(saved.data));
  }, [saved.data, editing]);

  const cancel = () => {
    setRows(toRows(list));
    setEditing(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const reasons = rows.map((r) => r.reason.trim()).filter(Boolean);
      const updated = await api('/api/expenses/reasons', { method: 'PUT', body: { reasons } });
      setCompany({ ...company, expenseReasons: updated });
      setRows(toRows(updated));
      toast.success('Expense reasons saved');
      setEditing(false);
      reload();
    } catch (err) {
      showError(err, 'Reasons were not saved');
    }
    setBusy(false);
  };

  const useDefaults = () => setRows(toRows(DEFAULT_EXPENSE_REASONS));

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Manage the reasons staff choose when they record project spending."
      />
      <ExpenseTabs basePath={basePath} current="reasons" />
      {saved.error && <Alert className="mb-6">{saved.error}</Alert>}

      <Card className="max-w-2xl p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Expense reasons</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isOwner
                ? 'These appear in the reason dropdown when anyone adds or edits an expense. Each company has its own list.'
                : 'Your company chooses these reasons. Only the company owner can change them.'}
            </p>
          </div>
          {isOwner && !editing && (
            <Button variant="primary" icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>

        {saved.loading && !rows.length ? (
          <LoadingBlock />
        ) : editing ? (
          <form onSubmit={save} className="space-y-5">
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-0">
                  <Input
                    aria-label="Expense reason"
                    maxLength={300}
                    value={r.reason}
                    onValue={(v) => setRows(rows.map((x) => (x.id === r.id ? { ...x, reason: v } : x)))}
                    placeholder="e.g. Labour charges"
                    className="rounded-r-none"
                  />
                  <button
                    type="button"
                    aria-label="Remove reason"
                    disabled={rows.length <= 1}
                    onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                    className="grid h-10 w-9 shrink-0 place-items-center rounded-r-lg border border-l-0 border-slate-300 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" icon={Plus} disabled={rows.length >= MAX_EXPENSE_REASONS} onClick={() => setRows([...rows, { id: ++seq, reason: '' }])}>
                Add reason
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={useDefaults}>
                Reset to suggested list
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {list.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </div>
        )}

        <p className="mt-5 text-xs text-slate-500">Staff can still pick “Other…” and type a one-off reason when something does not fit the list.</p>
      </Card>
    </>
  );
}
