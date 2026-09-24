'use client';

import { Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/energy';
import { useStore } from '@/lib/store';
import { FormPage, inputCls, Label, Num } from './common';
import { GstSummary } from './GstSummary';

export default function StepFinancials({ design }) {
  const f = useStore((s) => s.finance);
  const project = useStore((s) => s.project);
  const patch = useStore((s) => s.patch);
  const config = useStore((s) => s.config);
  const u = (p) => patch('finance', { ...p, init: true });
  const money = (v) => formatMoney(v, f.currency);
  const fin = design.fin;
  const kpis = [['System cost', money(fin.cost)], ['Year-1 savings', money(fin.firstYearSavings)], ['Payback', fin.payback ? `${fin.payback.toFixed(1)} yrs` : '> 25 yrs'], ['25-yr savings', money(fin.lifetimeSavings)], ['ROI', `${fin.roi.toFixed(0)}%`], ['Energy / yr', `${Math.round(design.totals.acKwh).toLocaleString()} kWh`]];
  return (
    <FormPage icon={Wallet} title="Project & Financials">
      <div className="grid grid-cols-2 gap-4">
        {[['name', 'Project name'], ['customer', 'Customer'], ['preparedBy', 'Prepared by']].map(([k, l]) => (
          <label key={k} className={k === 'name' ? 'col-span-2' : ''}>
            <Label>{l}</Label>
            <input className={inputCls} value={project[k]} onChange={(e) => patch('project', { [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Num label="System efficiency (PR)" value={f.efficiency} step={1} min={50} max={100} suffix="%" onChange={(efficiency) => u({ efficiency })} />
        <Num label="Tariff escalation" value={f.escalation} step={0.5} max={20} suffix="%/yr" onChange={(escalation) => u({ escalation })} />
        <Num label="Module degradation" value={f.degradation} step={0.1} max={3} suffix="%/yr" onChange={(degradation) => u({ degradation })} />
      </div>
      <div className="rounded-lg border border-slate-200 p-4 text-sm">
        <div className="mb-2 font-semibold">Price breakdown</div>
        {design.cost.isPackage ? (
          <>
            <div className="flex justify-between py-1">
              <span className="text-slate-600">Package: {design.cost.package?.name || 'Solar Package'}</span>
              <b>{money(design.cost.packagePrice)}</b>
            </div>
            {design.cost.floorCost > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Floor placement (Floor {design.cost.floorPlacement})</span>
                <b>{money(design.cost.floorCost)}</b>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-between py-1"><span className="text-slate-600">{design.totals.count} × {design.spec.name} @ {money(design.spec.price)}</span><b>{money(design.cost.panels)}</b></div>
            {design.structure.columns > 0 && (
              <div className="flex justify-between py-1"><span className="text-slate-600">Pillars ({design.pillar.name}) {Math.round(design.cost.pillarFt)} ft</span><b>{money(design.cost.pillars)}</b></div>
            )}
            {design.cost.hasChosenMaterials ? (
              <>
                {(design.cost.categoryMaterials || []).map((m) => (
                  <div key={m.categoryId} className="flex justify-between py-1">
                    <span className="text-slate-600">{m.categoryName}: {m.productName} (×{m.qty} {m.unit})</span>
                    <b>{money(m.total)}</b>
                  </div>
                ))}
              </>
            ) : (
              <div className="flex justify-between py-1"><span className="text-slate-600">Inverter, wiring, installation (BOS)</span><b>{money(design.cost.other)}</b></div>
            )}

            {design.cost.floorCost > 0 && (
              <div className="flex justify-between py-1"><span className="text-slate-600">Floor placement (Floor {design.cost.floorPlacement})</span><b>{money(design.cost.floorCost)}</b></div>
            )}
          </>
        )}

        <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base"><span className="font-semibold">Total</span><b>{money(design.cost.subtotal ?? design.cost.total)}</b></div>
        <GstSummary cost={design.cost} config={config} onConfig={(p) => patch('config', p)} money={money} compact />
        <p className="mt-1 text-xs text-slate-400">Electricity price {money(design.catalog.tariff)}/unit. Prices are set by the company.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {kpis.map(([l, v]) => (
          <div key={l} className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">{l}</div>
            <div className="mt-1 text-lg font-bold">{v}</div>
          </div>
        ))}
      </div>
    </FormPage>
  );
}
