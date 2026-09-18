'use client';

// One friendly screen for home owners: see the roof in 3D, pick how many panels, done.

import { Box, Minus, Move, Plus, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { autoFillRoof } from '@/lib/autofill';
import { formatMoney } from '@/lib/energy';
import { buildDesign } from '@/lib/model';
import { useStore } from '@/lib/store';
import Editor2D from '../editor/Editor2D';
import { cx } from '../ui';

const Scene3D = dynamic(() => import('../scene/Scene3D'), { ssr: false });
const FT = 3.281;

function Pills({ value, options, onChange }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button key={o.label} type="button" onClick={() => onChange(o.value)} className={cx('rounded-xl border px-2 py-2.5 text-center transition', value === o.value ? 'border-[#f5a524] bg-amber-50 ring-2 ring-[#f5a524]/40' : 'border-slate-200 hover:bg-slate-50')}>
          <div className="text-sm font-semibold">{o.label}</div>
          {o.sub && <div className="text-[11px] text-slate-500">{o.sub}</div>}
        </button>
      ))}
    </div>
  );
}

const Q = ({ n, children }) => (
  <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
    <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-xs text-white">{n}</span>
    {children}
  </div>
);

export default function StepSimpleDesign({ design }) {
  const s = useStore();
  const { config, objects, sections, finance } = s;
  const [view, setView] = useState('3d');
  const [bill, setBill] = useState('');
  const { totals, structure, spec, fin } = design;
  const main = sections[0];

  // place panels automatically the first time
  useEffect(() => {
    if (design.sections.length && !useStore.getState().objects.some((o) => o.type === 'zone' || o.type === 'array')) autoFillRoof(design);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.sections.length]);

  const maxFit = useMemo(() => buildDesign({ sections, objects, config: { ...config, maxPanels: 0 }, lat: design.lat }).modules.length, [sections, objects, config, design.lat]);
  const count = totals.count;
  const setCount = (n) => {
    const v = Math.max(1, Math.min(maxFit, Math.round(n)));
    s.patch('config', { maxPanels: v >= maxFit ? 0 : v, targetKw: 0 });
  };
  const applyAll = (patch) => s.set({ config: { ...config, ...patch }, objects: objects.map((o) => (o.type === 'zone' || (o.type === 'array' && !o.elevated) ? { ...o, ...patch } : o)) });

  const opt = Math.round(design.yieldModel.optimal.tilt);
  const perPanelMonth = count ? totals.acKwh / count / 12 : (spec.watts / 1000) * 120;
  const recommend = () => {
    const units = Number(bill) / (finance.tariff || 1);
    if (units > 0) setCount(Math.ceil(units / perPanelMonth));
  };
  const money = (v) => formatMoney(v, finance.currency);
  const floors = main ? Math.max(1, Math.round(main.height / 3)) : 1;
  const legChoice = config.frontLeg < 0.7 ? 0.4 : config.frontLeg < 1.8 ? 1 : 2.4;
  const tiltChoice = config.tilt <= 7 ? 5 : config.tilt >= 27 ? 30 : opt;

  return (
    <>
      <div className="absolute inset-y-0 left-0 right-[380px]">
        {view === '3d' ? <Scene3D design={design} /> : <Editor2D design={design} />}
        <div className="absolute left-4 top-4 flex rounded-full bg-white p-1 shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
          {[['3d', Box, '3D view'], ['2d', Move, 'Move panels']].map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setView(k)} className={cx('flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium', view === k ? 'bg-slate-900 text-white' : 'text-slate-600')}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {view === '3d' && <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-white/15 px-4 py-1.5 text-xs text-white">Drag to look around · scroll to zoom · press ▶ to watch the sun and shadows</div>}
      </div>

      <aside className="absolute inset-y-0 right-0 w-[380px] space-y-6 overflow-y-auto border-l border-slate-200 bg-white p-5">
        <div className="rounded-2xl bg-slate-900 p-4 text-white">
          <div className="text-xs uppercase tracking-wide text-slate-400">Your solar system</div>
          <div className="mt-1 text-3xl font-bold">{totals.kwp.toFixed(1)} kW</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-slate-400">Makes every month</div><b>{Math.round(totals.acKwh / 12).toLocaleString()} units</b></div>
            <div><div className="text-slate-400">Saves every month</div><b>{money(fin.firstYearSavings / 12)}</b></div>
            <div><div className="text-slate-400">Approx. cost</div><b>{money(fin.cost)}</b></div>
            <div><div className="text-slate-400">Pays back in</div><b>{fin.payback ? `${fin.payback.toFixed(1)} years` : '25+ years'}</b></div>
          </div>
        </div>

        <div>
          <Q n={1}>How many panels?</Q>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setCount(count - 1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Minus className="h-5 w-5" /></button>
            <div className="flex-1 text-center">
              <div className="text-4xl font-bold tabular-nums">{count}</div>
              <div className="text-xs text-slate-500">of {maxFit} that fit on your roof</div>
            </div>
            <button type="button" onClick={() => setCount(count + 1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Plus className="h-5 w-5" /></button>
          </div>
          <input type="range" min={1} max={Math.max(1, maxFit)} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-3 h-2 w-full cursor-pointer accent-[#f5a524]" />
          <div className="mt-3 flex gap-2">
            <input inputMode="numeric" value={bill} onChange={(e) => setBill(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && recommend()} placeholder={`Monthly electricity bill (${finance.currency})`} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600" />
            <button type="button" onClick={recommend} disabled={!bill} className="flex h-11 items-center gap-1.5 rounded-xl bg-[#f5a524] px-3 text-sm font-semibold text-white disabled:bg-slate-200"><Sparkles className="h-4 w-4" /> Suggest</button>
          </div>
          <p className="mt-1 text-xs text-slate-400">Type your bill and we&apos;ll pick the number of panels that covers it.</p>
        </div>

        {main && (
          <div>
            <Q n={2}>How tall is your building?</Q>
            <Pills value={Math.min(floors, 4)} onChange={(f) => s.updateSection(main.id, { height: f * 3 })} options={[1, 2, 3, 4].map((f) => ({ value: f, label: f === 4 ? '4+' : String(f), sub: f === 1 ? 'floor' : 'floors' }))} />
          </div>
        )}

        <div>
          <Q n={3}>How high should panels stand?</Q>
          <Pills value={legChoice} onChange={(frontLeg) => applyAll({ frontLeg })} options={[{ value: 0.4, label: 'Low', sub: 'cheapest' }, { value: 1, label: 'Medium', sub: `${Math.round(1 * FT)} ft` }, { value: 2.4, label: 'High', sub: 'walk under' }]} />
        </div>

        <div>
          <Q n={4}>Panel slope</Q>
          <Pills value={tiltChoice} onChange={(tilt) => applyAll({ tilt })} options={[{ value: 5, label: 'Flat', sub: 'fits more' }, { value: opt, label: 'Best', sub: `${opt}° · most power` }, { value: 30, label: 'Steep', sub: 'self-cleaning' }]} />
        </div>

        <div className="rounded-2xl bg-amber-50 p-4 text-sm">
          <div className="mb-1.5 font-semibold">What you will need</div>
          <ul className="space-y-1 text-slate-700">
            <li>• <b>{count}</b> solar panels of {spec.watts} W = <b>{(count * spec.watts).toLocaleString()} W</b></li>
            <li>• <b>{structure.columns}</b> iron columns ({structure.columnM.toFixed(0)} m / {Math.round(structure.columnM * FT)} ft of pipe in total)</li>
            {structure.cutList.map((c) => (
              <li key={c.len} className="pl-4 text-slate-500">{c.qty} pieces of {c.len.toFixed(2)} m ({(c.len * FT).toFixed(1)} ft)</li>
            ))}
            <li>• {structure.basePlates} base plates with {structure.anchorBolts} bolts</li>
            <li>• 1 inverter of about {design.electrical.acKw || 0} kW</li>
            <li>• Shade loss from walls and trees: {totals.shadeLossPct.toFixed(1)}%</li>
          </ul>
        </div>

        <button type="button" onClick={() => autoFillRoof(design)} className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Re-arrange panels automatically</button>
      </aside>
    </>
  );
}
