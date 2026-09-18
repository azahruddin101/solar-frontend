'use client';

import { Wallet } from 'lucide-react';
import { useEffect } from 'react';
import { CURRENCIES, formatMoney, guessCurrency } from '@/lib/energy';
import { useStore } from '@/lib/store';
import { FormPage, inputCls, Label, Num } from './common';

export default function StepFinancials({ design }) {
  const f = useStore((s) => s.finance);
  const project = useStore((s) => s.project);
  const patch = useStore((s) => s.patch);
  const u = (p) => patch('finance', { ...p, init: true });
  useEffect(() => {
    if (f.init || !design.origin) return;
    const c = CURRENCIES[guessCurrency(design.solarData?.regionCode, design.origin.lat, design.origin.lng)];
    patch('finance', { currency: c.code, tariff: c.tariff, costPerKw: c.costPerKw, init: true });
  }, [f.init, design.origin, design.solarData, patch]);
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
        <label>
          <Label>Currency</Label>
          <select className={inputCls} value={f.currency} onChange={(e) => { const c = CURRENCIES[e.target.value]; u({ currency: c.code, tariff: c.tariff, costPerKw: c.costPerKw }); }}>
            {Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <Num label="Electricity tariff" value={f.tariff} step={0.01} max={1e6} suffix="/kWh" onChange={(tariff) => u({ tariff })} />
        <Num label="Installed cost" value={f.costPerKw} step={500} max={1e8} suffix="/kWp" onChange={(costPerKw) => u({ costPerKw })} />
        <Num label="System efficiency (PR)" value={f.efficiency} step={1} min={50} max={100} suffix="%" onChange={(efficiency) => u({ efficiency })} />
        <Num label="Tariff escalation" value={f.escalation} step={0.5} max={20} suffix="%/yr" onChange={(escalation) => u({ escalation })} />
        <Num label="Module degradation" value={f.degradation} step={0.1} max={3} suffix="%/yr" onChange={(degradation) => u({ degradation })} />
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
