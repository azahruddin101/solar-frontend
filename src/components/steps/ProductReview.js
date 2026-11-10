'use client';

// The exact lines the proposal PDF prints in its price table, with how each one is worked out, so
// nothing on the PDF is a surprise. Read-only: the products are changed in the form above.
import { bomHow, proposalBomRows } from '@/lib/proposalBom';
import { cx } from '../ui';

export default function ProductReview({ design, money }) {
  const rows = proposalBomRows(design);

  // the same grouping and numbering as the PDF
  const groups = new Map();
  for (const r of rows) {
    const name = String(r.group || '').trim();
    if (!groups.has(name)) groups.set(name, { name, order: name ? Number(r.order) || 0 : Infinity, rows: [] });
    groups.get(name).rows.push(r);
  }
  const ordered = [...groups.values()].sort((a, b) => a.order - b.order);
  const numberOf = new Map(ordered.flatMap((g) => g.rows).map((r, i) => [r.key, i + 1]));

  return (
    <div className="-mx-5 -my-4 divide-y divide-slate-100">
      {ordered.map((g) => (
        <div key={g.name || 'other'}>
          {(ordered.length > 1 || g.name) && (
            <div className="bg-slate-50 px-5 py-2 text-xs font-bold tracking-wide text-slate-600 uppercase">{g.name || 'Other items'} ({g.rows.length})</div>
          )}
          {g.rows.map((r) => {
            const how = bomHow(r, design, money);
            return (
              <div key={r.key} className="flex items-start gap-3 px-5 py-3">
                <span className="w-6 shrink-0 pt-0.5 text-right text-sm text-slate-400 tabular-nums">{numberOf.get(r.key)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-slate-900">{r.item}</span>
                  {r.spec && r.spec !== '-' && <span className="block text-sm text-slate-600">{r.spec}</span>}
                  {how && <span className="mt-0.5 block text-xs text-slate-500">↳ {how}</span>}
                </span>
                <span className="w-24 shrink-0 pt-0.5 text-right text-sm text-slate-700 tabular-nums"><b className="text-slate-900">{r.qty}</b> {r.unit}</span>
                <span className={cx('w-28 shrink-0 pt-0.5 text-right text-sm tabular-nums', r.amount == null ? 'text-slate-500' : 'font-semibold text-slate-900')}>{r.amount == null ? 'Included' : money(r.amount)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
