'use client';
import { ProposalGstModeToggle } from '../proposal/ProposalGstControls';

import { cx } from '../ui';
import { useStore } from '@/lib/store';
import { netAfterSubsidy, subsidyOf } from '@/lib/subsidy';

/** With/without GST on the proposal; tax amounts come from each line's product GST %. */
export function GstSummary({ cost, config, onConfig, money, compact = false }) {
  const withGst = config.withGst !== false;
  const gstAmount = Number(cost.gstAmount) || 0;
  const showGstLines = withGst && gstAmount > 0.001;
  const sub = subsidyOf(useStore((st) => st.subsidy)); // the proposal's government subsidy, taken off the total

  return (
    <div className={cx('space-y-2.5', compact ? 'mt-2 pt-2 border-t border-slate-200' : 'mt-3 border-t border-slate-200 pt-3')}>
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
        <div className="mb-1.5 text-sm font-medium text-emerald-900">Discount</div>
        <div className="flex gap-2">
          <input type="number" min={0} step="any" value={config.discount || ''} placeholder="0" onChange={(e) => onConfig({ discount: Math.max(0, Number(e.target.value) || 0) })} className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm" aria-label="Discount" />
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-semibold">
            {[[false, 'Flat'], [true, '%']].map(([pct, label]) => (
              <button key={label} type="button" onClick={() => onConfig({ discountIsPercent: pct })} className={cx('rounded px-3', Boolean(config.discountIsPercent) === pct ? 'bg-emerald-600 text-white' : 'text-slate-600')}>{label}</button>
            ))}
          </div>
        </div>
        <input type="text" maxLength={200} value={config.discountRemark || ''} placeholder="Reason, e.g. Festive offer" onChange={(e) => onConfig({ discountRemark: e.target.value })} className="mt-2 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" aria-label="Discount description" />
        {cost.discountAmount > 0 && <div className="mt-1.5 flex justify-between text-sm text-emerald-800"><span>Discount{config.discountIsPercent ? ` (${config.discount}%)` : ''}{config.discountRemark ? ` · ${config.discountRemark}` : ''}</span><b>− {money(cost.discountAmount)}</b></div>}
      </div>

      <ProposalGstModeToggle withGst={withGst} onChange={(v) => onConfig({ withGst: v })} />

      {showGstLines && (
        <div className="space-y-0.5 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>Taxable value</span>
            <b>{money(cost.subtotal ?? cost.taxableTotal)}</b>
          </div>
          <div className="flex justify-between">
            <span>SGST</span>
            <b>{money(cost.sgst)}</b>
          </div>
          <div className="flex justify-between">
            <span>CGST</span>
            <b>{money(cost.cgst)}</b>
          </div>
        </div>
      )}

      {((withGst && showGstLines) || cost.discountAmount > 0) && (
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
          <span className="font-semibold">Grand total</span>
          <b className="text-brand">{money(cost.total)}</b>
        </div>
      )}

      {sub.on && (
        <div className="space-y-1 rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-2 text-sm">
          {sub.central > 0 && <div className="flex justify-between text-slate-600"><span>Central government subsidy</span><span>− {money(sub.central)}</span></div>}
          {sub.state > 0 && <div className="flex justify-between text-slate-600"><span>State government subsidy</span><span>− {money(sub.state)}</span></div>}
          <div className="flex justify-between border-t border-violet-100 pt-1 text-base"><span className="font-semibold text-violet-900">Net payable after subsidy</span><b className="text-violet-900">{money(netAfterSubsidy(cost.total, { enabled: true, central: sub.central, state: sub.state }))}</b></div>
        </div>
      )}
    </div>
  );
}
