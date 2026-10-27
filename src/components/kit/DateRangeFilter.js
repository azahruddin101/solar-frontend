'use client';

import { cx } from './cx';

const inputClass =
  'h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand-muted/60';

/** Set both dates to filter lists on the server; clear both to show all. Values are `YYYY-MM-DD`. */
export function DateRangeFilter({ from = '', to = '', onChange, className }) {
  const active = Boolean(from && to);

  return (
    <div className={cx('flex flex-wrap items-center gap-3 text-sm text-slate-600', className)}>
      <label className="flex items-center gap-2">
        <span className="whitespace-nowrap">From</span>
        <input
          type="date"
          aria-label="From date"
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-2">
        <span>to</span>
        <input
          type="date"
          aria-label="Added to"
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className={inputClass}
        />
      </label>
      {active && (
        <button type="button" onClick={() => onChange({ from: '', to: '' })} className="font-medium text-brand hover:underline">
          Clear dates
        </button>
      )}
    </div>
  );
}
