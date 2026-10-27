'use client';

// Pieces shared by the expenses screens: the Projects / Profit & loss switch, the budget meter and short money labels.
import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { CURRENCIES } from '@/lib/energy';
import { cx } from '../kit';

// status colours (good / warning / critical); they always travel with an icon and a word, never alone
export const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' };

/** "₹1.2L", "$34K": money for chart axes and tight labels. */
export function compactMoney(value, code) {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  const n = Number(value || 0);
  return `${n < 0 ? '−' : ''}${c.symbol}${Math.abs(n).toLocaleString(c.locale, { notation: 'compact', maximumFractionDigits: 1 })}`;
}

/** Where a project stands against its budget. */
export function budgetStatus(spent, budget) {
  if (!(budget > 0)) return null;
  const used = spent / budget;
  if (used > 1) return { key: 'critical', label: 'Over budget', icon: CircleAlert };
  if (used >= 0.9) return { key: 'warning', label: 'Near budget', icon: AlertTriangle };
  return { key: 'good', label: 'Within budget', icon: CheckCircle2 };
}

/** A slim track filled to the share of the budget spent (capped at the end), with the percentage and its status. */
export function BudgetMeter({ spent, budget, compact = false }) {
  const status = budgetStatus(spent, budget);
  if (!status) return <span className="text-slate-400">—</span>;
  const pct = Math.round((spent / budget) * 1000) / 10;
  const Icon = status.icon;
  return (
    <div className={cx('min-w-[120px]', compact ? 'max-w-[160px]' : '')}>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} aria-label={`${pct}% of budget used`}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: STATUS[status.key] }} />
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs text-slate-600">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: STATUS[status.key] }} aria-hidden />
        <span className="tabular-nums">{pct}%</span>
        {!compact && <span className="text-slate-500">· {status.label}</span>}
      </div>
    </div>
  );
}

/** Projects ⇄ Profit & loss. */
export function ExpenseTabs({ basePath, current }) {
  const tabs = [
    { id: 'projects', label: 'Projects', href: basePath },
    { id: 'pnl', label: 'Profit & loss', href: `${basePath}/analytics` },
  ];
  return (
    <nav aria-label="Expenses sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={current === t.id ? 'page' : undefined}
          className={cx('-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors', current === t.id ? 'border-brand text-brand-ink' : 'border-transparent text-slate-500 hover:text-slate-800')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
