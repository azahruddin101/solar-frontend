'use client';

// One project's profit & loss: its budget, less the expenses by reason, leaves the profit (or the loss when spending
// went over). Downloadable as a branded PDF statement (lib/pnlPdf.js) or as a sheet.
import { FileDown, Sheet } from 'lucide-react';
import { useState } from 'react';
import { exportRows } from '@/lib/excel';
import { useSession } from '@/lib/session';
import { Button, Card, CardHeader, cx, showError, toast } from '../kit';

function Line({ label, value, hint, strong, indent, border }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 py-2 text-sm', border && 'border-t border-slate-200', indent && 'pl-4')}>
      <span className={cx('min-w-0', strong ? 'font-semibold text-slate-900' : 'text-slate-600')}>
        {label}
        {hint && <span className="ml-1.5 text-xs text-slate-400">{hint}</span>}
      </span>
      <span className={cx('shrink-0 text-slate-900 tabular-nums', strong && 'font-semibold')}>{value}</span>
    </div>
  );
}

export default function ProjectPnl({ design, items, total, budget, profit, money }) {
  const { company, user } = useSession();
  const [busy, setBusy] = useState(''); // 'pdf' | 'sheet' while one is being made
  const loss = profit !== null && profit < 0;
  const neg = (v) => (v > 0 ? `(${money(v)})` : money(0)); // amounts taken away, accounting style

  // expenses by reason, largest first
  const byReason = Object.values(
    items.reduce((acc, e) => {
      const r = (acc[e.reason] ||= { reason: e.reason, amount: 0, count: 0 });
      r.amount += e.amount;
      r.count += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.amount - a.amount);

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      const { downloadPnlPdf } = await import('@/lib/pnlPdf'); // jsPDF loads only when a PDF is asked for
      await downloadPnlPdf({ expense: { design, items, total, budget, profit }, company: company || {}, currency: company?.currency || 'INR', preparedBy: user?.name || '' });
    } catch (e) {
      showError(e, 'The PDF was not created');
    }
    setBusy('');
  };

  const downloadSheet = async () => {
    setBusy('sheet');
    try {
      const rows = [['Profit & loss', design.name], ['Client', design.client?.name || ''], ['', '']];
      const bold = [];
      const add = (label, amount, isBold) => {
        if (isBold) bold.push(rows.length);
        rows.push([label, amount]);
      };
      add('Budget', budget ? budget.amount : '', true);
      byReason.forEach((r) => add(r.reason, -Math.round(r.amount * 100) / 100));
      add('Total expenses', -total, true);
      add(loss ? 'Loss' : 'Profit', profit ?? '', true);
      await exportRows(rows, `${design.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'project'} - P&L.xlsx`, { boldRows: bold });
    } catch (e) {
      toast.error(e.message || 'Could not create the sheet');
    }
    setBusy('');
  };

  return (
    <Card className="mb-5 overflow-hidden">
      <CardHeader
        title="Profit & loss"
        description="Budget minus expenses. What’s left of the budget is profit; spending over it is a loss."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={Sheet} loading={busy === 'sheet'} disabled={Boolean(busy)} onClick={downloadSheet}>Excel</Button>
            <Button size="sm" icon={FileDown} loading={busy === 'pdf'} disabled={Boolean(busy)} onClick={downloadPdf}>Download PDF</Button>
          </div>
        }
      />
      <div className="max-w-2xl px-6 py-5">
        <Line label="Budget" value={budget ? money(budget.amount) : 'Not set'} strong />
        <div className="mt-2 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Less: expenses</div>
        {byReason.length ? (
          byReason.map((r) => <Line key={r.reason} label={r.reason} hint={r.count > 1 ? `${r.count} entries` : undefined} value={neg(r.amount)} indent />)
        ) : (
          <p className="py-2 pl-4 text-sm text-slate-400">No expenses yet</p>
        )}
        <Line label="Total expenses" value={neg(total)} strong border />

        <div className={cx('mt-4 flex items-baseline justify-between gap-4 rounded-lg px-4 py-3', loss ? 'bg-red-50' : 'bg-slate-50')}>
          <span className="font-semibold text-slate-900">{loss ? 'Loss' : 'Profit'}</span>
          {profit !== null ? (
            <span className={cx('text-xl font-semibold tracking-tight tabular-nums', loss ? 'text-red-700' : 'text-slate-900')}>{loss ? '−' : ''}{money(Math.abs(profit))}</span>
          ) : (
            <span className="text-sm text-slate-500">Set a budget to see it</span>
          )}
        </div>
      </div>
    </Card>
  );
}
