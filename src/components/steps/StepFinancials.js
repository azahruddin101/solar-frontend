'use client';

import { Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/energy';
import { useStore } from '@/lib/store';
import { FormPage, inputCls, Label, Num } from './common';

export default function StepFinancials({ design }) {
  const f = useStore((s) => s.finance);
  const project = useStore((s) => s.project);
  const patch = useStore((s) => s.patch);
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
      <div className="rounded-2xl border border-slate-200 p-4 text-sm">
        <div className="mb-2 font-semibold">Price breakdown</div>
        {[[`${design.totals.count} × ${design.spec.name} @ ${money(design.spec.price)}`, design.cost.panels], [`Pillars (${design.pillar.name}) ${Math.round(design.cost.pillarFt)} ft @ ${money(design.pillar.pricePerFt)}/ft`, design.cost.pillars], ['Inverter, wiring, installation', design.cost.other]].map(([l, v]) => (
          <div key={l} className="flex justify-between py-1"><span className="text-slate-600">{l}</span><b>{money(v)}</b></div>
        ))}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base"><span className="font-semibold">Total</span><b>{money(design.cost.total)}</b></div>
        <p className="mt-1 text-xs text-slate-400">Electricity price {money(design.catalog.tariff)}/unit. Prices are set by the admin.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {kpis.map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">{l}</div>
            <div className="mt-1 text-lg font-bold">{v}</div>
          </div>
        ))}
      </div>
    </FormPage>
  );
}
