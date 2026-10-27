'use client';

// One project's expenses: add an amount with the reason, correct or remove an entry, and see the running total against
// the project's budget — profit is what's left of the budget, loss is going over it.
import { ArrowLeft, Pencil, Plus, Target, Trash2, WalletCards } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { useCan } from '@/lib/useCan';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, CardHeader, ConfirmDialog, EmptyState, FormField, FormModal, IconButton, Input, LoadingBlock, NumField, PageHeader, Select, Table, Td, Th, Tr, cx, formatDate, toast } from '../kit';
import ExpenseForm from './ExpenseForm';
import ProjectPnl from './ProjectPnl';
import { BudgetMeter } from './shared';

const today = () => new Date().toISOString().slice(0, 10);

function BudgetForm({ budget, designId, onClose, onSaved }) {
  const [amount, setAmount] = useState(budget?.amount ?? '');
  const [note, setNote] = useState(budget?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!(Number(amount) > 0)) return setError('Enter the budget for this project');
    setBusy(true);
    setError('');
    try {
      await api(`/api/expenses/design/${designId}/budget`, { method: 'PUT', body: { amount: Number(amount), note } });
      toast.success(budget ? 'Budget updated' : 'Budget set');
      onSaved();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <FormModal open onClose={onClose} size="md" title={budget ? 'Edit budget' : 'Set a budget'} description="What this project should cost in total. Expenses are measured against it." submitLabel={budget ? 'Save budget' : 'Set budget'} busy={busy} error={error} onSubmit={submit}>
      <FormField label="Budget">
        <NumField min={0} step="any" value={amount} onValue={setAmount} placeholder="e.g. 150000" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" autoFocus />
      </FormField>
      <FormField label="Note (optional)">
        <Input maxLength={300} value={note} onValue={setNote} placeholder="e.g. Estimate from the site survey" />
      </FormField>
    </FormModal>
  );
}

function Tile({ label, value, hint, tone, children }) {
  return (
    <Card className="p-4">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className={cx('mt-2 text-2xl font-semibold tracking-tight tabular-nums', tone === 'loss' ? 'text-red-700' : 'text-slate-900')}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      {children}
    </Card>
  );
}

export default function ExpenseDetail({ id, basePath = '/dashboard/expenses' }) {
  const may = useCan();
  const currency = useSession((s) => s.company?.currency) || 'INR';
  const money = (v) => formatMoney(v, currency, { decimals: 2 });
  const { data, loading, error, reload } = useResource(`/api/expenses/design/${id}`);
  const [editing, setEditing] = useState(null); // an expense, or {} for a new one
  const [budgeting, setBudgeting] = useState(false);
  const [clearingBudget, setClearingBudget] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <Alert>{error || 'Project not found'}</Alert>;
  const { design, items, total, budget, profit } = data;

  const clearBudget = async () => {
    setBusy(true);
    try {
      await api(`/api/expenses/design/${id}/budget`, { method: 'DELETE' });
      toast.success('Budget removed');
      setClearingBudget(false);
      await reload();
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/expenses/${removing.id}`, { method: 'DELETE' });
      toast.success('Expense deleted');
      setRemoving(null);
      await reload();
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <Link href={basePath} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> All projects</Link>
      <PageHeader title={design.name} description={design.client?.name ? `Expenses for ${design.client.name}’s project` : 'Expenses for this project'}>
        {may('expenses', 'update') && <Button icon={Target} onClick={() => setBudgeting(true)}>{budget ? 'Edit budget' : 'Set budget'}</Button>}
        {may('expenses', 'create') && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Add expense</Button>}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Total spent" value={money(total)} hint={`${items.length} entr${items.length === 1 ? 'y' : 'ies'}`} />
        <Tile label="Budget" value={budget ? money(budget.amount) : '—'} hint={budget ? budget.note || (budget.updatedByName ? `Set by ${budget.updatedByName}` : undefined) : 'No budget set'}>
          {budget && may('expenses', 'update') && <button type="button" onClick={() => setClearingBudget(true)} className="mt-1 text-xs font-medium text-slate-500 hover:text-red-600">Remove budget</button>}
        </Tile>
        <Tile label={profit !== null && profit < 0 ? 'Loss' : 'Profit'} value={profit !== null ? money(Math.abs(profit)) : '—'} tone={profit !== null && profit < 0 ? 'loss' : undefined} hint={profit === null ? 'Set a budget to see it' : profit < 0 ? 'Over budget' : 'Budget left'} />
        <Card className="p-4">
          <div className="text-[13px] font-medium text-slate-500">Budget used</div>
          <div className="mt-3">{budget ? <BudgetMeter spent={total} budget={budget.amount} /> : <span className="text-sm text-slate-400">Set a budget to track it</span>}</div>
        </Card>
      </div>

      <ProjectPnl design={design} items={items} total={total} budget={budget} profit={profit} money={money} />

      <Card className="overflow-hidden">
        <CardHeader title="Expenses" description="Newest first." />
        {!items.length ? (
          <EmptyState icon={WalletCards} title="No expenses yet" description="Add what was spent on this project and why.">
            {may('expenses', 'create') && <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Add expense</Button>}
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Reason</Th><Th>Entered by</Th><Th className="text-right">Amount</Th><Th className="text-right"><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {items.map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(e.spentOn)}</Td>
                  <Td className="max-w-[420px] text-slate-900">
                    {e.reason}
                    {e.note && <div className="mt-0.5 text-xs text-slate-500">{e.note}</div>}
                  </Td>
                  <Td className="text-slate-500">{e.createdByName || '—'}</Td>
                  <Td className="text-right font-medium text-slate-900 tabular-nums">{money(e.amount)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      {may('expenses', 'update') && <IconButton icon={Pencil} label="Edit expense" onClick={() => setEditing(e)} />}
                      {may('expenses', 'delete') && <IconButton icon={Trash2} label="Delete expense" tone="danger" onClick={() => setRemoving(e)} />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {budgeting && <BudgetForm budget={budget} designId={id} onClose={() => setBudgeting(false)} onSaved={() => { setBudgeting(false); reload(); }} />}
      <ConfirmDialog open={clearingBudget} onClose={() => setClearingBudget(false)} onConfirm={clearBudget} busy={busy} confirmLabel="Remove budget" title="Remove this project’s budget?">
        The expenses stay; only the budget of {budget ? money(budget.amount) : ''} is removed.
      </ConfirmDialog>
      {editing && <ExpenseForm expense={editing.id ? editing : null} designId={id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} busy={busy} title="Delete this expense?">
        {removing && <>“{removing.reason}” — {money(removing.amount)} will be removed from this project’s total.</>}
      </ConfirmDialog>
    </>
  );
}
