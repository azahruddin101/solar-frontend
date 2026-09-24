'use client';

import { cx } from '../ui';

/** Below the price subtotal: GST included toggle, optional % + SGST/CGST, grand total. */
export function GstSummary({ cost, config, onConfig, money, compact = false }) {
  const included = config.gstIncluded !== false;
  const showGstLines = !included && (Number(config.gstPercent) || 0) > 0 && cost.gstAmount > 0;

  return (
    <div className={cx('space-y-2.5', compact ? 'mt-2 pt-2 border-t border-slate-200' : 'mt-3 border-t border-slate-200 pt-3')}>
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-600">Is GST included in the total above?</p>
        <div className="flex flex-wrap gap-2">
          {[
            [true, 'Yes, included'],
            [false, 'No, add GST'],
          ].map(([v, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => onConfig({ gstIncluded: v })}
              className={cx(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                included === v ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!included && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span className="shrink-0 font-medium">GST rate</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={config.gstPercent ?? 18}
            onChange={(e) => onConfig({ gstPercent: Number(e.target.value) })}
            className="h-8 w-16 rounded-md border border-slate-300 px-2 text-sm tabular-nums"
          />
          <span>%</span>
        </label>
      )}

      {showGstLines && (
        <div className="space-y-0.5 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>SGST ({(cost.gstPercent / 2).toFixed(2)}%)</span>
            <b>{money(cost.sgst)}</b>
          </div>
          <div className="flex justify-between">
            <span>CGST ({(cost.gstPercent / 2).toFixed(2)}%)</span>
            <b>{money(cost.cgst)}</b>
          </div>
        </div>
      )}

      {showGstLines && (
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
          <span className="font-semibold">Grand total</span>
          <b className="text-brand">{money(cost.total)}</b>
        </div>
      )}

      {included && <p className="text-[11px] text-slate-400">The total above already includes GST.</p>}
    </div>
  );
}
