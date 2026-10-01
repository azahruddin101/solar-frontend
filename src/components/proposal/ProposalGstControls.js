'use client';

import { cx } from '../ui';

/** Top-level proposal GST mode (like plain vs tax invoice). */
export function ProposalGstModeToggle({ withGst, onChange, className }) {
  const on = withGst !== false;
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-medium text-slate-600">GST on proposal</p>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/80 p-1">
        {[[false, 'Without GST'], [true, 'With GST']].map(([v, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(v)}
            className={cx(
              'h-8 rounded-md text-xs font-semibold transition',
              on === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        {on ? 'Show GST breakdown on the quote and PDF.' : 'Prices are final — no GST lines on the quote.'}
      </p>
    </div>
  );
}
