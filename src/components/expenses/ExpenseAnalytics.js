'use client';

// Profit & loss across projects, kept simple: each project's budget minus what was spent on it. What's left is profit,
// spending over the budget is a loss. Also spending per month and by reason, and a project-wise table to download.
import { ArrowDown, ArrowUp, ChartColumn, Download, Search, Table2, Target, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { exportRows } from '@/lib/excel';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, CardHeader, EmptyState, Input, LoadingBlock, PageHeader, Select, StatCard, Table, Td, Th, Tr, cx, toast } from '../kit';
import { BudgetMeter, ExpenseTabs, compactMoney } from './shared';

// one series (spending) in categorical slot 1; profit ⇄ loss is the blue–red diverging pair
const SPENT = '#2a78d6';
const PROFIT = '#2a78d6';
const LOSS = '#e34948';

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const monthLabel = (key, opts = { month: 'short' }) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

/** Four even steps from zero that cover `max`, on round numbers (1, 2, 2.5, 5 × 10ⁿ). */
function niceTicks(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
  return [0, 1, 2, 3, 4].map((i) => i * step);
}

/** Spending per month as columns, with a tooltip per month, or the same figures as a table. */
function MonthlyChart({ monthly, money, currency, asTable }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...monthly.map((m) => m.spent));
  if (!(max > 0)) return <EmptyState icon={ChartColumn} title="Nothing spent in this period" description="Expenses entered on projects show up here by month." />;

  if (asTable) {
    return (
      <Table>
        <thead><tr><Th>Month</Th><Th className="text-right">Spent</Th></tr></thead>
        <tbody>
          {monthly.map((m) => (
            <Tr key={m.month}>
              <Td className="text-slate-600">{monthLabel(m.month, { month: 'long', year: 'numeric' })}</Td>
              <Td className="text-right font-medium text-slate-900 tabular-nums">{money(m.spent)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    );
  }

  const ticks = niceTicks(max);
  const top = ticks.at(-1);
  const n = monthly.length;
  const sparse = n > 12; // label every other month when there are many
  const m = hover !== null ? monthly[hover] : null;

  return (
    <div className="px-6 pt-5 pb-5">
      <div className="relative">
        <div className="relative h-56">
          {ticks.map((t) => (
            <div key={t} className="absolute right-0 left-14 border-t border-slate-100" style={{ bottom: `${(t / top) * 100}%` }}>
              <span className="absolute right-full mr-2 -translate-y-1/2 text-[11px] whitespace-nowrap text-slate-400 tabular-nums">{compactMoney(t, currency)}</span>
            </div>
          ))}
          <div className="absolute inset-y-0 right-0 left-14 flex" onMouseLeave={() => setHover(null)}>
            {monthly.map((row, i) => (
              <div
                key={row.month}
                tabIndex={0}
                aria-label={`${monthLabel(row.month, { month: 'long', year: 'numeric' })}: spent ${money(row.spent)}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className={cx('flex min-w-0 flex-1 items-end justify-center rounded-t-md px-1 outline-none', hover === i && 'bg-slate-50')}
              >
                <div className="max-w-6 flex-1 rounded-t" style={{ height: row.spent > 0 ? `max(2px, ${(row.spent / top) * 100}%)` : 0, background: SPENT }} />
              </div>
            ))}
          </div>
          {m && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-40 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg"
              style={{ left: `calc(3.5rem + (100% - 3.5rem) * ${Math.min(Math.max((hover + 0.5) / n, 0.1), 0.9)})` }}
            >
              <div className="mb-1 font-semibold text-slate-900">{monthLabel(m.month, { month: 'long', year: 'numeric' })}</div>
              <div className="flex justify-between gap-2 text-slate-600"><span>Spent</span><span className="text-slate-900 tabular-nums">{money(m.spent)}</span></div>
            </div>
          )}
        </div>
        <div className="mt-2 ml-14 flex">
          {monthly.map((row, i) => (
            <div key={row.month} className="flex-1 text-center text-[11px] text-slate-500">
              {(!sparse || i % 2 === 0) && (
                <>
                  {monthLabel(row.month)}
                  {(i === 0 || row.month.endsWith('-01')) && <div className="text-slate-400">{row.month.slice(0, 4)}</div>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Spending by reason, largest first: one hue, each bar labelled with its amount and share. */
function ReasonBars({ byReason, money }) {
  if (!byReason.length) return <EmptyState icon={WalletCards} title="No expenses in this period" description="Expenses entered on projects are grouped here by their reason." />;
  const total = byReason.reduce((a, r) => a + r.amount, 0);
  const max = Math.max(...byReason.map((r) => r.amount));
  return (
    <ul className="space-y-3 px-6 py-5">
      {byReason.map((r) => (
        <li key={r.reason} title={`${r.count} entr${r.count === 1 ? 'y' : 'ies'}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className={cx('min-w-0 truncate', r.other ? 'text-slate-500' : 'text-slate-800')}>{r.reason}</span>
            <span className="shrink-0 text-slate-600 tabular-nums"><span className="font-medium text-slate-900">{money(r.amount)}</span> · {Math.round((r.amount / total) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `max(4px, ${(r.amount / max) * 100}%)`, background: r.other ? '#94a3b8' : SPENT }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const PROFIT_ROWS = 8;

/** Budgeted projects with the largest profit or loss, as bars either side of zero. */
function ProfitBars({ projects, money, currency, basePath }) {
  const withBudget = projects.filter((p) => p.profit !== null);
  if (!withBudget.length) return <EmptyState icon={Target} title="No budgets set yet" description="Open a project and choose “Set budget”. Its profit or loss is the budget minus the expenses." />;
  const rows = [...withBudget].sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit)).slice(0, PROFIT_ROWS).sort((a, b) => b.profit - a.profit);
  const max = Math.max(...rows.map((p) => Math.abs(p.profit))) || 1;
  const hasLoss = rows.some((p) => p.profit < 0);
  return (
    <div className="px-6 py-5">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: PROFIT }} aria-hidden />Profit (under budget)</span>
        {hasLoss && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: LOSS }} aria-hidden />Loss (over budget)</span>}
      </div>
      <ul className="mt-4 space-y-2.5">
        {rows.map((p) => {
          const w = `max(3px, ${(Math.abs(p.profit) / max) * 100}%)`;
          return (
            <li key={p.id} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
              <Link href={`${basePath}/${p.id}`} className="truncate text-[13px] text-slate-800 hover:text-brand" title={p.name}>{p.name}</Link>
              <div className={cx('grid items-center', hasLoss ? 'grid-cols-2' : 'grid-cols-1')} title={`${p.name}: ${p.profit < 0 ? 'loss' : 'profit'} ${money(Math.abs(p.profit))}`}>
                {hasLoss && (
                  <div className="flex items-center justify-end gap-1.5 border-r border-slate-300 pr-px">
                    {p.profit < 0 && <><span className="text-[11px] whitespace-nowrap text-slate-600 tabular-nums">{compactMoney(p.profit, currency)}</span><div className="h-3.5 rounded-l" style={{ width: w, background: LOSS }} /></>}
                  </div>
                )}
                <div className={cx('flex items-center gap-1.5 pl-px', !hasLoss && 'border-l border-slate-300')}>
                  {p.profit > 0 && <><div className="h-3.5 rounded-r" style={{ width: w, background: PROFIT }} /><span className="text-[11px] whitespace-nowrap text-slate-600 tabular-nums">{compactMoney(p.profit, currency)}</span></>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {withBudget.length > PROFIT_ROWS && <p className="mt-4 text-xs text-slate-500">The {PROFIT_ROWS} projects with the largest profit or loss. Every project is in the table below.</p>}
    </div>
  );
}

const COLUMNS = [
  { key: 'name', label: 'Project' },
  { key: 'budget', label: 'Budget', numeric: true },
  { key: 'spent', label: 'Expenses', numeric: true },
  { key: 'profit', label: 'Profit / loss', numeric: true },
  { key: 'budgetUsed', label: 'Budget used' },
];

const ProfitText = ({ value, money }) => (value === null ? <span className="text-slate-400">—</span> : <span className={value < 0 ? 'text-red-700' : undefined}>{value < 0 ? '−' : ''}{money(Math.abs(value))}</span>);

function ProjectTable({ projects, money, basePath }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'profit', dir: 'desc' });
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => !q || `${p.name} ${p.client?.name || ''}`.toLowerCase().includes(q));
    const val = (p) => (sort.key === 'name' ? p.name.toLowerCase() : p[sort.key] ?? -Infinity); // no budget sorts last
    return [...list].sort((a, b) => {
      const [x, y] = [val(a), val(b)];
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
  }, [projects, query, sort]);
  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  // totals of the rows shown; profit / loss only over the projects that have a budget
  const budgeted = rows.filter((p) => p.budget !== null);
  const tot = {
    budget: round2(budgeted.reduce((a, p) => a + p.budget, 0)),
    spent: round2(rows.reduce((a, p) => a + p.spent, 0)),
    budgetSpent: round2(budgeted.reduce((a, p) => a + p.spent, 0)),
    profit: budgeted.length ? round2(budgeted.reduce((a, p) => a + p.profit, 0)) : null,
  };

  const download = async () => {
    setBusy(true);
    try {
      const head = ['Project', 'Client', 'Budget', 'Expenses', 'Profit / loss', 'Budget used (%)'];
      const body = rows.map((p) => [p.name, p.client?.name || '', p.budget ?? '', p.spent, p.profit ?? '', p.budgetUsed ?? '']);
      const total = ['Total', '', budgeted.length ? tot.budget : '', tot.spent, tot.profit ?? '', ''];
      await exportRows([head, ...body, total], `project-profit-and-loss-${new Date().toISOString().slice(0, 10)}.xlsx`, { boldRows: [body.length + 1] });
    } catch (e) {
      toast.error(e.message || 'Could not create the sheet');
    }
    setBusy(false);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Project-wise profit & loss"
        description="Budget minus expenses for each project. Open a project to set its budget or see its statement."
        action={rows.length ? <Button size="sm" icon={Download} loading={busy} onClick={download}>Download</Button> : null}
      />
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
          <Input aria-label="Search projects" placeholder="Search by proposal or client" value={query} onValue={setQuery} className="pl-9" />
        </div>
      </div>
      {!rows.length ? (
        <EmptyState icon={WalletCards} title={query ? 'No projects match' : 'No projects yet'} description={query ? 'Try a different search.' : 'Booked proposals appear here, ready for a budget and expenses.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <Th key={c.key} className={c.numeric ? 'text-right' : undefined} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggle(c.key)} className={cx('inline-flex items-center gap-1 uppercase hover:text-slate-900', c.numeric && 'flex-row-reverse')}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <Link href={`${basePath}/${p.id}`} className="block max-w-[300px] truncate font-medium text-slate-900 hover:text-brand">{p.name}</Link>
                  <div className="max-w-[300px] truncate text-xs text-slate-500">{p.client?.name || '—'}</div>
                </Td>
                <Td className="text-right text-slate-700 tabular-nums">{p.budget !== null ? money(p.budget) : <span className="text-slate-400">Not set</span>}</Td>
                <Td className="text-right text-slate-700 tabular-nums">{money(p.spent)}</Td>
                <Td className="text-right font-medium text-slate-900 tabular-nums"><ProfitText value={p.profit} money={money} /></Td>
                <Td><BudgetMeter spent={p.spent} budget={p.budget} compact /></Td>
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50/70 font-semibold text-slate-900">
              <Td>Total{query ? ' (shown)' : ''} · {rows.length} project{rows.length === 1 ? '' : 's'}</Td>
              <Td className="text-right tabular-nums">{budgeted.length ? money(tot.budget) : '—'}</Td>
              <Td className="text-right tabular-nums">{money(tot.spent)}</Td>
              <Td className="text-right tabular-nums"><ProfitText value={tot.profit} money={money} /></Td>
              <Td className="font-normal">{budgeted.length ? <BudgetMeter spent={tot.budgetSpent} budget={tot.budget} compact /> : <span className="text-slate-400">—</span>}</Td>
            </tr>
          </tfoot>
        </Table>
      )}
    </Card>
  );
}

export default function ExpenseAnalytics({ basePath = '/dashboard/expenses' }) {
  const currency = useSession((s) => s.company?.currency) || 'INR';
  const money = (v) => formatMoney(v, currency);
  const [months, setMonths] = useState('12');
  const [monthlyTable, setMonthlyTable] = useState(false);
  const { data, loading, error } = useResource(`/api/expenses/analytics?months=${months}`);

  const header = (
    <>
      <PageHeader title="Expenses" description="Profit & loss per project: its budget minus what was spent on it." />
      <ExpenseTabs basePath={basePath} current="pnl" />
    </>
  );
  if (error) return <>{header}<Alert>{error}</Alert></>;
  if (loading || !data) return <>{header}<LoadingBlock /></>;
  const { totals: t, projects, monthly, byReason } = data;
  const loss = t.profit < 0;

  return (
    <>
      {header}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total budget" value={money(t.budget)} icon={Target} hint={t.budgeted ? `${t.budgeted} of ${t.projects} project${t.projects === 1 ? '' : 's'} have a budget` : 'No budgets set yet'} />
        <StatCard label="Total spent" value={money(t.spent)} icon={WalletCards} hint={`Across ${t.projects} project${t.projects === 1 ? '' : 's'}`} />
        <StatCard label={loss ? 'Net loss' : 'Net profit'} value={t.budgeted ? `${loss ? '−' : ''}${money(Math.abs(t.profit))}` : '—'} icon={loss ? TrendingDown : TrendingUp} hint="Budget minus expenses, on budgeted projects" />
        <StatCard label="Over budget" value={t.overBudget} hint={t.budgeted ? `of ${t.budgeted} budgeted project${t.budgeted === 1 ? '' : 's'}` : undefined} />
      </div>

      <Card className="mb-5 overflow-hidden">
        <CardHeader
          title="Spending by month"
          description="Expenses entered on projects."
          action={
            <div className="flex items-center gap-2">
              <Select aria-label="Period" value={months} onValue={setMonths} className="w-40">
                <option value="6">Last 6 months</option>
                <option value="12">Last 12 months</option>
                <option value="24">Last 24 months</option>
              </Select>
              <Button size="sm" icon={monthlyTable ? ChartColumn : Table2} onClick={() => setMonthlyTable((v) => !v)}>{monthlyTable ? 'Chart' : 'Table'}</Button>
            </div>
          }
        />
        <MonthlyChart monthly={monthly} money={money} currency={currency} asTable={monthlyTable} />
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Where the money goes" description={`Expenses by reason, last ${data.months} months.`} />
          <ReasonBars byReason={byReason} money={money} />
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Profit / loss by project" description="Budget minus expenses." />
          <ProfitBars projects={projects} money={money} currency={currency} basePath={basePath} />
        </Card>
      </div>

      <ProjectTable projects={projects} money={money} basePath={basePath} />
    </>
  );
}
