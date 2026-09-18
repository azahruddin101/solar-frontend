'use client';

// One friendly screen for home owners: see the roof in 3D, pick how many panels, done.

import { Box, Minus, Move, Plus, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { autoGroups } from '@/lib/autofill';
import { formatMoney } from '@/lib/energy';
import { buildDesign } from '@/lib/model';
import { useStore } from '@/lib/store';
import Editor2D from '../editor/Editor2D';
import { cx } from '../ui';
import { Adjust } from './DesignPanel';
import GroupList from './GroupList';

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

function Chips({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button key={label} type="button" onClick={() => onChange(v)} className={cx('rounded-full border px-3 py-1 text-xs font-medium', Math.abs(value - v) < 0.01 ? 'border-[#f5a524] bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
          {label}
        </button>
      ))}
    </div>
  );
}

function PillarIcon({ shape }) {
  if (shape === 'cylindrical') return <svg viewBox="0 0 24 24" className="h-6 w-6"><circle cx="12" cy="12" r="8" fill="none" stroke="#334155" strokeWidth="3" /></svg>;
  if (shape === 'l-shape') return <svg viewBox="0 0 24 24" className="h-6 w-6"><path d="M5 4v16h15" fill="none" stroke="#334155" strokeWidth="3.5" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-6 w-6"><rect x="4.5" y="4.5" width="15" height="15" fill="none" stroke="#334155" strokeWidth="3" /></svg>;
}

const Q = ({ n, children }) => (
  <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
    {n > 0 && <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-xs text-white">{n}</span>}
    {children}
  </div>
);

export default function StepSimpleDesign({ design }) {
  const s = useStore();
  const { config, objects, sections, finance } = s;
  const [view, setView] = useState('3d');
  const [bill, setBill] = useState('');
  const [useMode, setUseMode] = useState('units');
  const { totals, structure, spec, fin } = design;
  const main = sections[0];

  // place panels automatically the first time
  useEffect(() => {
    if (design.sections.length && !useStore.getState().objects.some((o) => o.type === 'zone' || o.type === 'array')) autoGroups(design);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.sections.length]);

  const obstacleKey = JSON.stringify(objects.filter((o) => o.type === 'tree' || o.type === 'block'));
  const maxFit = useMemo(() => {
    const keep = JSON.parse(obstacleKey);
    const zones = design.sections.map((sec) => ({ id: `fit-${sec.id}`, type: 'zone', points: sec.poly, tilt: config.tilt, azimuth: design.defaultAzimuth, frontLeg: config.frontLeg, rowsPerTable: config.rowsPerTable, orientation: config.orientation, rowGap: config.rowGap }));
    return buildDesign({ sections, objects: [...keep, ...zones], config: { ...config, maxPanels: 0 }, lat: design.lat, spec: design.spec }).modules.length;
  }, [sections, config, design.sections, design.lat, design.defaultAzimuth, design.spec, obstacleKey]);
  const count = totals.count;
  const setCount = (n) => {
    const v = Math.max(1, Math.min(Math.max(maxFit, 1), Math.round(n)));
    autoGroups(design, v >= maxFit ? 0 : v);
  };
  const applyAll = (patch) => s.set({ config: { ...config, ...patch }, objects: objects.map((o) => (o.type === 'zone' || o.type === 'array' ? { ...o, ...patch } : o)) });

  const opt = Math.round(design.yieldModel.optimal.tilt);
  const perPanelMonth = count ? totals.acKwh / count / 12 : (spec.watts / 1000) * 120;
  const needUnits = useMode === 'units' ? Number(bill) || 0 : (Number(bill) || 0) / (design.catalog.tariff || 1);
  const needPanels = needUnits > 0 ? Math.ceil(needUnits / perPanelMonth) : 0;
  const recommend = () => needPanels > 0 && setCount(needPanels);
  const pickPanel = (specId) => {
    s.patch('config', { specId });
    // panel size changed → re-arrange with the same count on the next tick
    setTimeout(() => document.getElementById('rearrange')?.click(), 50);
  };
  const money = (v) => formatMoney(v, finance.currency);
  const slopeLen = (config.orientation === 'landscape' ? spec.width : spec.length) * config.rowsPerTable;
  const backLeg = config.frontLeg + slopeLen * Math.sin((config.tilt * Math.PI) / 180);

  return (
    <>
      <div className="absolute inset-y-0 left-0 right-[380px]">
        {view === '3d' ? <Scene3D design={design} /> : <Editor2D design={design} />}
        <div className="absolute left-4 top-4 flex rounded-full bg-white p-1 shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
          {[['3d', Box, '3D view'], ['2d', Move, 'Top view']].map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setView(k)} className={cx('flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium', view === k ? 'bg-slate-900 text-white' : 'text-slate-600')}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {view === '3d' && <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-white/15 px-4 py-1.5 text-xs text-white">Drag a panel group to move it · drag empty space to look around · scroll to zoom</div>}
      </div>

      <aside className="absolute inset-y-0 right-0 w-[380px] space-y-5 overflow-y-auto border-l border-slate-200 bg-white p-5">
        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold">{totals.kwp.toFixed(1)} kW</span>
            <span className="text-sm text-slate-300">{count} panels × {spec.watts} W</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
            <div><span className="text-slate-400">Makes </span><b>{Math.round(totals.acKwh / 12).toLocaleString()} units/mo</b></div>
            <div><span className="text-slate-400">Saves </span><b>{money(fin.firstYearSavings / 12)}/mo</b></div>
            <div><span className="text-slate-400">Cost </span><b>{money(fin.cost)}</b></div>
            <div><span className="text-slate-400">Payback </span><b>{fin.payback ? `${fin.payback.toFixed(1)} yrs` : '25+ yrs'}</b></div>
          </div>
        </div>

        <div>
          <Q n={1}>How many panels?</Q>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setCount(count - 1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Minus className="h-5 w-5" /></button>
            <div className="flex-1 text-center">
              <div className="text-3xl font-bold tabular-nums">{count}</div>
              <div className="text-xs text-slate-500">auto layout fits up to {maxFit} · changing this re-arranges groups</div>
            </div>
            <button type="button" onClick={() => setCount(count + 1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Plus className="h-5 w-5" /></button>
          </div>
          <input type="range" min={1} max={Math.max(1, maxFit)} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-3 h-2 w-full cursor-pointer accent-[#f5a524]" />
        </div>

        <div className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold">Or tell us your electricity use</div>
          <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium">
            {[['units', 'Units (kWh) per month'], ['bill', `Monthly bill (${finance.currency})`]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setUseMode(k)} className={cx('h-7 flex-1 rounded-md', useMode === k ? 'bg-white shadow-sm' : 'text-slate-500')}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input inputMode="numeric" value={bill} onChange={(e) => setBill(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && recommend()} placeholder={useMode === 'units' ? 'e.g. 450' : 'e.g. 3500'} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600" />
            <button type="button" onClick={recommend} disabled={!bill} className="flex h-11 items-center gap-1.5 rounded-xl bg-[#f5a524] px-3 text-sm font-semibold text-white disabled:bg-slate-200"><Sparkles className="h-4 w-4" /> Suggest</button>
          </div>
          {needUnits > 0 && (
            <p className="mt-2 text-xs text-slate-600">
              You use about <b>{Math.round(needUnits)} units/month</b> → you need <b>{needPanels} panels</b> of {spec.watts} W ({((needPanels * spec.watts) / 1000).toFixed(1)} kW).
              {needPanels > maxFit ? ` Your roof fits only ${maxFit}, covering ${Math.round((maxFit / needPanels) * 100)}% of your use.` : ' Panels placed ✓'}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">Your {count} panels make <b>{Math.round(totals.acKwh / 12).toLocaleString()} units/month</b> ({Math.round(totals.acKwh).toLocaleString()} kWh/year){needUnits > 0 ? ` = ${Math.min(999, Math.round((totals.acKwh / 12 / needUnits) * 100))}% of your use` : ''}.</p>
        </div>

        <div>
          <Q n={0}>Choose your panel</Q>
          <div className="space-y-1.5">
            {design.catalog.panels.map((p) => (
              <button key={p.id} type="button" onClick={() => pickPanel(p.id)} className={cx('flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left', p.id === spec.id ? 'border-[#f5a524] bg-amber-50 ring-2 ring-[#f5a524]/30' : 'border-slate-200 hover:bg-slate-50')}>
                <span><span className="block text-sm font-semibold">{p.watts} W · {p.brand}</span><span className="block text-xs text-slate-500">{p.model} · {p.length} × {p.width} m</span></span>
                <span className="text-sm font-semibold">{money(p.price)}<span className="text-xs font-normal text-slate-400"> /panel</span></span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Q n={0}>Choose the pillar (stand)</Q>
          <div className="grid grid-cols-3 gap-2">
            {design.catalog.pillars.map((p) => (
              <button key={p.id} type="button" onClick={() => s.patch('config', { pillarId: p.id })} className={cx('rounded-xl border px-2 py-2 text-center', p.id === design.pillar.id ? 'border-[#f5a524] bg-amber-50 ring-2 ring-[#f5a524]/30' : 'border-slate-200 hover:bg-slate-50')}>
                <div className="mx-auto mb-1 grid h-7 w-7 place-items-center"><PillarIcon shape={p.shape} /></div>
                <div className="text-xs font-semibold capitalize">{p.shape.replace('-', ' ')}</div>
                <div className="text-[11px] text-slate-500">{money(p.pricePerFt)}/ft</div>
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">{design.pillar.name}</p>
        </div>

        <div>
          <Q n={2}>Height of all groups</Q>
          <Adjust label={`Front leg · ${(config.frontLeg * FT).toFixed(1)} ft`} value={config.frontLeg} min={0.2} max={4} step={0.05} suffix="m" onChange={(frontLeg) => applyAll({ frontLeg })} />
          <div className="mt-2"><Chips value={config.frontLeg} onChange={(frontLeg) => applyAll({ frontLeg })} options={[[0.4, 'Low'], [1, 'Medium'], [2.4, 'High · walk under']]} /></div>
          <p className="mt-1.5 text-xs text-slate-500">Back leg becomes <b>{backLeg.toFixed(2)} m ({(backLeg * FT).toFixed(1)} ft)</b> at this tilt.</p>
        </div>

        <div>
          <Q n={3}>Tilt of all groups</Q>
          <Adjust label="Tilt angle" value={config.tilt} min={0} max={45} step={1} suffix="°" onChange={(tilt) => applyAll({ tilt })} />
          <div className="mt-2"><Chips value={config.tilt} onChange={(tilt) => applyAll({ tilt })} options={[[5, 'Flat'], [opt, `Best ${opt}°`], [30, 'Steep']]} /></div>
          <p className="mt-1.5 text-xs text-slate-500">This tilt gives <b>{(design.yieldModel.factor(config.tilt, design.defaultAzimuth) * 100).toFixed(0)}%</b> of the best possible output.</p>
        </div>

        <div>
          <Q n={4}>Panel groups ({objects.filter((o) => o.type === 'array').length})</Q>
          <p className="mb-2 text-xs text-slate-500">Tap a group here or on the roof to give it its own tilt, height and size. Drag a group directly on the roof to move it.</p>
          <GroupList design={design} />
        </div>

        {main && (
          <div>
            <Q n={5}>Your building</Q>
            <Adjust label={`Roof height · ${Math.round(main.height * FT)} ft`} value={main.height} min={2.5} max={60} step={0.5} suffix="m" onChange={(height) => s.updateSection(main.id, { height })} />
            <div className="mt-2"><Chips value={main.height} onChange={(height) => s.updateSection(main.id, { height })} options={[[3, '1 floor'], [6, '2 floors'], [9, '3 floors'], [12, '4 floors']]} /></div>
            <div className="mt-3"><Adjust label="Boundary wall (parapet) height" value={main.parapetH} min={0} max={2.5} step={0.1} suffix="m" onChange={(parapetH) => s.updateSection(main.id, { parapetH })} /></div>
          </div>
        )}

        <div className="rounded-2xl bg-amber-50 p-4 text-sm">
          <div className="mb-1.5 font-semibold">What you will need</div>
          <ul className="space-y-1 text-slate-700">
            <li>• <b>{count}</b> solar panels of {spec.watts} W = <b>{(count * spec.watts).toLocaleString()} W</b></li>
            <li>• <b>{structure.columns}</b> pillars — {design.pillar.shape.replace('-', ' ')} ({structure.columnM.toFixed(0)} m / {Math.round(structure.columnM * FT)} ft of pipe in total)</li>
            {structure.cutList.map((c) => (
              <li key={c.len} className="pl-4 text-slate-500">{c.qty} pieces of {c.len.toFixed(2)} m ({(c.len * FT).toFixed(1)} ft)</li>
            ))}
            <li>• {structure.basePlates} base plates with {structure.anchorBolts} bolts</li>
            <li>• 1 inverter of about {design.electrical.acKw || 0} kW</li>
            <li>• Shade loss from walls and trees: {totals.shadeLossPct.toFixed(1)}%</li>
          </ul>
          <div className="mt-3 space-y-1 border-t border-amber-200 pt-2">
            <div className="flex justify-between"><span>{count} panels × {money(spec.price)}</span><b>{money(design.cost.panels)}</b></div>
            <div className="flex justify-between"><span>Pillars {Math.round(design.cost.pillarFt)} ft × {money(design.pillar.pricePerFt)}</span><b>{money(design.cost.pillars)}</b></div>
            <div className="flex justify-between"><span>Inverter, wiring, installation</span><b>{money(design.cost.other)}</b></div>
            <div className="flex justify-between border-t border-amber-200 pt-1 text-base"><span className="font-semibold">Total</span><b>{money(design.cost.total)}</b></div>
          </div>
        </div>

        <button id="rearrange" type="button" onClick={() => autoGroups(design, count >= maxFit ? 0 : count)} className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Re-arrange panels automatically</button>
      </aside>
    </>
  );
}
