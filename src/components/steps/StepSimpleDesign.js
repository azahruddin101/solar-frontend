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
    if (design.sections.length && !useStore.getState().objects.some((o) => o.type === 'zone' || o.type === 'array')) autoGroups(design);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.sections.length]);

  const obstacleKey = JSON.stringify(objects.filter((o) => o.type === 'tree' || o.type === 'block'));
  const maxFit = useMemo(() => {
    const keep = JSON.parse(obstacleKey);
    const zones = design.sections.map((sec) => ({ id: `fit-${sec.id}`, type: 'zone', points: sec.poly, tilt: config.tilt, azimuth: design.defaultAzimuth, frontLeg: config.frontLeg, rowsPerTable: config.rowsPerTable, orientation: config.orientation, rowGap: config.rowGap }));
    return buildDesign({ sections, objects: [...keep, ...zones], config: { ...config, maxPanels: 0 }, lat: design.lat }).modules.length;
  }, [sections, config, design.sections, design.lat, design.defaultAzimuth, obstacleKey]);
  const count = totals.count;
  const setCount = (n) => {
    const v = Math.max(1, Math.min(Math.max(maxFit, 1), Math.round(n)));
    autoGroups(design, v >= maxFit ? 0 : v);
  };
  const applyAll = (patch) => s.set({ config: { ...config, ...patch }, objects: objects.map((o) => (o.type === 'zone' || o.type === 'array' ? { ...o, ...patch } : o)) });

  const opt = Math.round(design.yieldModel.optimal.tilt);
  const perPanelMonth = count ? totals.acKwh / count / 12 : (spec.watts / 1000) * 120;
  const recommend = () => {
    const units = Number(bill) / (finance.tariff || 1);
    if (units > 0) setCount(Math.ceil(units / perPanelMonth));
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
          <div className="mt-3 flex gap-2">
            <input inputMode="numeric" value={bill} onChange={(e) => setBill(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && recommend()} placeholder={`Monthly electricity bill (${finance.currency})`} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600" />
            <button type="button" onClick={recommend} disabled={!bill} className="flex h-11 items-center gap-1.5 rounded-xl bg-[#f5a524] px-3 text-sm font-semibold text-white disabled:bg-slate-200"><Sparkles className="h-4 w-4" /> Suggest</button>
          </div>
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
            <li>• <b>{structure.columns}</b> iron columns ({structure.columnM.toFixed(0)} m / {Math.round(structure.columnM * FT)} ft of pipe in total)</li>
            {structure.cutList.map((c) => (
              <li key={c.len} className="pl-4 text-slate-500">{c.qty} pieces of {c.len.toFixed(2)} m ({(c.len * FT).toFixed(1)} ft)</li>
            ))}
            <li>• {structure.basePlates} base plates with {structure.anchorBolts} bolts</li>
            <li>• 1 inverter of about {design.electrical.acKw || 0} kW</li>
            <li>• Shade loss from walls and trees: {totals.shadeLossPct.toFixed(1)}%</li>
          </ul>
        </div>

        <button type="button" onClick={() => autoGroups(design, 0)} className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Re-arrange panels automatically</button>
      </aside>
    </>
  );
}
