'use client';

// The one price of a campus design, split by building. Shown only when the design has several buildings.
import { Building2 } from 'lucide-react';
import { formatNumber } from '@/lib/energy';

export default function BuildingBreakdown({ design, money, compact }) {
  const rows = design.cost.buildings || [];
  if (rows.length < 2) return null;
  const inverterOf = (id) => {
    const el = design.electrical.buildings?.find((b) => b.id === id);
    return el ? `${el.inverterCount} × ${el.inverter.kw} kW` : '—';
  };
  return (
    <div className={compact ? 'mt-3 border-t border-slate-200 pt-3' : 'rounded-lg border border-slate-200 p-4'}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-slate-500" /> Breakdown by building</div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[11px] tracking-wide text-slate-400 uppercase">
              <th className="pb-1 pr-2 font-medium">Building</th>
              <th className="pb-1 pr-2 text-right font-medium">Panels</th>
              <th className="pb-1 pr-2 text-right font-medium">kWp</th>
              {!compact && <th className="pb-1 pr-2 text-right font-medium">kWh / year</th>}
              {!compact && <th className="pb-1 pr-2 font-medium">Inverter</th>}
              <th className="pb-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="max-w-[160px] truncate py-1.5 pr-2 font-medium text-slate-800" title={b.name}>{b.name}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{b.count}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{b.kwp.toFixed(2)}</td>
                {!compact && <td className="py-1.5 pr-2 text-right tabular-nums">{formatNumber(b.acKwh)}</td>}
                {!compact && <td className="py-1.5 pr-2 whitespace-nowrap text-slate-600">{inverterOf(b.id)}</td>}
                <td className="py-1.5 text-right font-semibold tabular-nums">{money(b.total)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-300 font-semibold">
              <td className="py-1.5 pr-2">All buildings</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{design.totals.count}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{design.totals.kwp.toFixed(2)}</td>
              {!compact && <td className="py-1.5 pr-2 text-right tabular-nums">{formatNumber(design.totals.acKwh)}</td>}
              {!compact && <td className="py-1.5 pr-2 whitespace-nowrap">{design.electrical.inverterCount} inverters</td>}
              <td className="py-1.5 text-right tabular-nums">{money(design.cost.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">Each building carries its own panels and structure, plus its share (by capacity) of the items the buildings have in common.</p>
    </div>
  );
}
