'use client';
import { ProposalGstModeToggle } from '../proposal/ProposalGstControls';

import { cx } from '../ui';

/** With/without GST on the proposal; tax amounts come from each line's product GST %. */
export function GstSummary({ cost, config, onConfig, money, compact = false }) {
  const withGst = config.withGst !== false;
  const gstAmount = Number(cost.gstAmount) || 0;
  const showGstLines = withGst && gstAmount > 0.001;

  return (
    <div className={cx('space-y-2.5', compact ? 'mt-2 pt-2 border-t border-slate-200' : 'mt-3 border-t border-slate-200 pt-3')}>
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

      {withGst && showGstLines && (
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
          <span className="font-semibold">Grand total</span>
          <b className="text-brand">{money(cost.total)}</b>
        </div>
      )}
    </div>
  );
}
