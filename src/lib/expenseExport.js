'use client';

// Download expense data as .xlsx (project line items or all-projects summary).
import { exportRows } from './excel.js';

const safeName = (s) => String(s || 'export').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'export';
const isoDate = (d) => (d ? String(d).slice(0, 10) : '');
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Aggregate totals for every project row from GET /api/expenses. */
export function allProjectsTotals(items = []) {
  const budgeted = items.filter((r) => r.budget !== null);
  return {
    totalExpenditure: round2(items.reduce((a, r) => a + r.spent, 0)),
    overallBudget: budgeted.length ? round2(budgeted.reduce((a, r) => a + r.budget, 0)) : null,
    budgetLeft: budgeted.length ? round2(budgeted.reduce((a, r) => a + r.profit, 0)) : null,
    budgetedCount: budgeted.length,
    projectCount: items.length,
  };
}

/** Every expense on one project, with a short summary at the top. */
export async function exportProjectExpenses({ design, items, total, budget, profit }) {
  const title = safeName(design?.name);
  const rows = [
    ['Project expenses', design?.name || ''],
    ['Client', design?.client?.name || ''],
    ['Exported on', isoDate(new Date())],
    ['', ''],
    ['Budget', budget?.amount ?? ''],
    ['Total expenditure', round2(total)],
    ['Budget left (+/-)', profit ?? ''],
    ['', ''],
    ['Date', 'Reason', 'Amount', 'Note', 'Entered by', 'Bill'],
  ];
  const bold = [0, 4, 5, 6, 8];
  items.forEach((e) => {
    rows.push([
      isoDate(e.spentOn),
      e.reason,
      round2(e.amount),
      e.note || '',
      e.createdByName || '',
      e.billName || (e.billUrl ? 'Attached' : ''),
    ]);
  });
  const totalRow = rows.length;
  rows.push(['Total', '', round2(total), '', '', '']);
  bold.push(totalRow);
  await exportRows(rows, `${title} - expenses.xlsx`, { boldRows: bold });
}

/** One row per project: budget, expenditure and budget left (+/−), with totals. */
export async function exportAllProjectsSummary(items = []) {
  const sorted = [...items].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const rows = [
    ['All projects — budget & expenditure', ''],
    ['Exported on', isoDate(new Date())],
    ['', ''],
    ['Project', 'Client', 'Budget', 'Expenditure', 'Budget left (+/-)'],
  ];
  const bold = [0, 3];
  sorted.forEach((p) => {
    rows.push([
      p.name,
      p.client?.name || '',
      p.budget ?? '',
      round2(p.spent),
      p.profit ?? '',
    ]);
  });
  const { totalExpenditure, overallBudget, budgetLeft, budgetedCount } = allProjectsTotals(items);
  const totalRow = rows.length;
  rows.push([
    'Total',
    '',
    budgetedCount ? overallBudget : '',
    totalExpenditure,
    budgetLeft ?? '',
  ]);
  bold.push(totalRow);
  await exportRows(rows, `all-projects-expenses-${isoDate(new Date())}.xlsx`, { boldRows: bold });
}
