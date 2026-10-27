'use client';

// Every proposal's project with what has been spent on it against its budget. Add an expense to any of them from
// here, or open one to see and correct its expenses.
import { ExternalLink, Plus, Search, Target, WalletCards } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, EmptyState, Input, LoadingBlock, PageHeader, StatCard, Table, Td, Th, Tr, buttonClass, cx, formatDate } from '../kit';
import ExpenseForm from './ExpenseForm';
import { BudgetMeter, ExpenseTabs } from './shared';

export default function Expenses({ basePath = '/dashboard/expenses' }) {
  const currency = useSession((s) => s.company?.currency) || 'INR';
  const money = (v) => formatMoney(v, currency, { decimals: 2 });
  const may = useCan();
  const { data, loading, error, reload } = useResource('/api/expenses');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || []).filter((r) => !q || `${r.name} ${r.client?.name || ''} ${r.address}`.toLowerCase().includes(q));
  }, [data, query]);
  const total = rows.reduce((a, r) => a + r.spent, 0);
  const budgeted = rows.filter((r) => r.budget !== null);
  const budget = budgeted.reduce((a, r) => a + r.budget, 0);
  const overBudget = budgeted.filter((r) => r.spent > r.budget).length;

  return (
    <>
      <PageHeader title="Expenses" description="What each project has cost against its budget. Add an expense to any project, or open one to set its budget and see its entries.">
        {may('expenses', 'create') && <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add expense</Button>}
      </PageHeader>
      <ExpenseTabs basePath={basePath} current="projects" />
      {error && <Alert className="mb-6">{error}</Alert>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={query ? 'Spent (shown)' : 'Total spent'} value={money(total)} icon={WalletCards} />
        <StatCard label="Projects" value={rows.length} />
        <StatCard label="Budgeted" value={money(budget)} icon={Target} hint={budgeted.length ? `${budgeted.length} project${budgeted.length === 1 ? '' : 's'} with a budget` : 'No budgets set yet'} />
        <StatCard label="Over budget" value={overBudget} hint={budgeted.length ? `of ${budgeted.length} budgeted` : undefined} />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input aria-label="Search projects" placeholder="Search by proposal, client or address" value={query} onValue={setQuery} className="pl-9" />
          </div>
        </div>
        {loading ? <LoadingBlock /> : !rows.length ? (
          <EmptyState icon={WalletCards} title={query ? 'No projects match' : 'No projects yet'} description={query ? 'Try a different search.' : 'Booked proposals appear here, ready for their expenses.'} />
        ) : (
          <Table>
            <thead><tr><Th>Project</Th><Th>Entries</Th><Th>Last expense</Th><Th className="text-right">Spent</Th><Th className="text-right">Budget</Th><Th className="text-right">Profit / loss</Th><Th>Budget used</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`${basePath}/${r.id}`} className="block max-w-[320px] truncate font-medium text-slate-900 hover:text-brand">{r.name}</Link>
                    <div className="max-w-[320px] truncate text-xs text-slate-500">{[r.client?.name, r.address].filter(Boolean).join(' · ')}</div>
                  </Td>
                  <Td className="tabular-nums text-slate-600">{r.count}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{r.lastExpenseOn ? formatDate(r.lastExpenseOn) : '—'}</Td>
                  <Td className="text-right font-medium text-slate-900 tabular-nums">{money(r.spent)}</Td>
                  <Td className="text-right text-slate-600 tabular-nums">{r.budget !== null ? money(r.budget) : '—'}</Td>
                  <Td className={cx('text-right font-medium tabular-nums', r.profit < 0 ? 'text-red-700' : 'text-slate-900')}>{r.profit !== null ? `${r.profit < 0 ? '−' : ''}${money(Math.abs(r.profit))}` : '—'}</Td>
                  <Td><BudgetMeter spent={r.spent} budget={r.budget} compact /></Td>
                  {/* <Td><div className="flex justify-end"><Link href={`${basePath}/${r.id}`} className={buttonClass({ size: 'sm' })}><ExternalLink className="h-3.5 w-3.5" /> Open</Link></div></Td> */}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {adding && <ExpenseForm projects={data?.items || []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </>
  );
}
