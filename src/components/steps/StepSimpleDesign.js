'use client';

// One friendly screen for home owners: see the roof in 3D, pick how many panels, done.

import { ArrowLeft, ArrowRight, Box, Check, ChevronDown, Download, Loader2, Minus, Move, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { autoGroups } from '@/lib/autofill';
import { formatMoney } from '@/lib/energy';
import { buildDesign } from '@/lib/model';
import { generatePdf } from '@/lib/pdf';
import { sceneApi } from '../scene/Scene3D';
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
        <button key={o.label} type="button" onClick={() => onChange(o.value)} className={cx('rounded-md border px-2 py-2.5 text-center transition', value === o.value ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-700/20' : 'border-slate-200 hover:bg-slate-50')}>
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
        <button key={label} type="button" onClick={() => onChange(v)} className={cx('rounded-full border px-3 py-1 text-xs font-medium', Math.abs(value - v) < 0.01 ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
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

const Big = ({ children }) => <h2 className="text-[22px] font-bold leading-tight">{children}</h2>;
const Sub = ({ children }) => <p className="mt-1 text-sm text-slate-500">{children}</p>;

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
  const useMode = 'bill';
  const [page, setPage] = useState(0);
  const [tune, setTune] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState('All');
  const { totals, structure, spec, fin } = design;
  const main = sections[0];

  // place panels automatically the first time
  const layoutKey = JSON.stringify([sections, objects.filter((o) => o.type === 'tree' || o.type === 'block')]);
  useEffect(() => {
    const st = useStore.getState();
    if (!design.sections.length) return;
    if (st.layoutKey !== layoutKey || !st.objects.some((o) => o.type === 'array')) {
      autoGroups(design);
      st.set({ layoutKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, design.sections.length]);

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
  const sizeFor = (v) => {
    const units = (Number(v) || 0) / (design.catalog.tariff || 1);
    autoGroups(design, units > 0 ? Math.min(maxFit, Math.max(1, Math.ceil(units / perPanelMonth))) : 0);
  };
  const pickPanel = (specId) => {
    s.patch('config', { specId });
    // panel size changed → re-arrange with the same count on the next tick
    setTimeout(() => document.getElementById('rearrange')?.click(), 50);
  };
  const money = (v) => formatMoney(v, finance.currency);
  const slopeLen = (config.orientation === 'landscape' ? spec.width : spec.length) * config.rowsPerTable;
  const backLeg = config.frontLeg + slopeLen * Math.sin((config.tilt * Math.PI) / 180);

  const download = async () => {
    setBusy(true);
    try {
      const snapshot = sceneApi.capture?.() || s.snapshot;
      await generatePdf({ design, project: s.project, place: s.place, finance, snapshot });
    } catch (e) {
      console.error(e);
      window.alert('Sorry, the PDF could not be created. Please try again.');
    }
    setBusy(false);
  };
  const card = (on) => cx('w-full rounded-lg border-2 px-4 py-3 text-left transition', on ? 'border-blue-700 bg-blue-50' : 'border-slate-200 hover:border-slate-300');
  const TITLES = ['Consumption', 'Panel', 'Structure', 'Proposal'];

  return (
    <>
      <div className="absolute inset-y-0 left-0 right-[400px]">
        {view === '3d' ? <Scene3D design={design} /> : <Editor2D design={design} />}
        <div className="absolute left-4 top-4 flex rounded-full bg-white p-1 shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
          {[['3d', Box, '3D'], ['2d', Move, 'Plan view']].map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setView(k)} className={cx('flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium', view === k ? 'bg-slate-900 text-white' : 'text-slate-600')}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {view === '2d' && (
          <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-slate-900/85 px-5 py-2 text-sm text-white shadow-lg">
            {s.tool === 'add-array' ? 'Tap on the roof where you want panels' : 'Drag panels to move · pull the ⤡ corner to add or remove panels · orange dot turns them'}
          </div>
        )}
        {view === '3d' && <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-white/15 px-4 py-1.5 text-xs text-white">Drag to orbit · scroll to zoom · drag a panel group to move it</div>}
      </div>

      <aside className="absolute inset-y-0 right-0 flex w-[400px] flex-col border-l border-slate-200 bg-white">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* 1 — the only question */}
          <div>
            <label htmlFor="bill" className="text-base font-semibold">Monthly electricity bill ({finance.currency})</label>
            <input id="bill" inputMode="numeric" value={bill} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); setBill(v); sizeFor(v); }} placeholder="e.g. 3500" className="mt-2 h-14 w-full rounded-md border-2 border-slate-300 px-4 text-2xl font-semibold outline-none focus:border-blue-700" />
            <p className="mt-1.5 text-sm text-slate-500">
              {needUnits > 0
                ? <>About <b>{Math.round(needUnits)} units</b>/month → <b>{needPanels} panels</b> needed{needPanels > maxFit ? `; the roof fits ${maxFit} (${Math.round((maxFit / needPanels) * 100)}% of the bill)` : ''}.</>
                : 'Leave empty to fill the whole roof.'}
            </p>
          </div>

          {/* 2 — result */}
          <div className="rounded-lg bg-slate-900 p-5 text-white" aria-live="polite">
            <div className="text-3xl font-bold">{count} panels <span className="text-lg font-medium text-slate-300">· {totals.kwp.toFixed(1)} kW</span></div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-slate-400">Generates</div><div className="text-lg font-bold">{Math.round(totals.acKwh / 12).toLocaleString()} units<span className="text-xs font-normal"> / month</span></div><div className="text-xs text-slate-400">{Math.round(totals.acKwh).toLocaleString()} kWh / year</div></div>
              <div><div className="text-slate-400">Saves</div><div className="text-lg font-bold">{money(fin.firstYearSavings / 12)}<span className="text-xs font-normal"> / month</span></div></div>
              <div><div className="text-slate-400">Total price</div><div className="text-lg font-bold">{money(design.cost.total)}</div></div>
              <div><div className="text-slate-400">Payback</div><div className="text-lg font-bold">{fin.payback ? `${fin.payback.toFixed(1)} years` : '25+ years'}</div></div>
            </div>
          </div>

          <button type="button" onClick={download} disabled={busy || !count} className="flex h-14 w-full items-center justify-center gap-2 rounded-md bg-blue-700 text-base font-semibold text-white hover:bg-blue-800 disabled:bg-slate-300">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Download proposal (PDF)
          </button>
          {totals.invalid > 0 && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{totals.invalid} red group{totals.invalid > 1 ? 's are' : ' is'} overlapping something and not counted. Drag it to a free place.</p>}

          {/* 3 — two dropdowns */}
          <div className="grid gap-3">
            <label className="text-sm font-medium">Panel
              <select className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm" value={spec.id} onChange={(e) => pickPanel(e.target.value)}>
                {design.catalog.panels.map((p) => <option key={p.id} value={p.id}>{p.brand} {p.model} · {p.watts} W · {money(p.price)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Mounting pole
              <select className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm" value={design.pillar.id} onChange={(e) => s.patch('config', { pillarId: e.target.value })}>
                {design.catalog.pillars.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.shape.replace('-', ' ')}) · {money(p.pricePerFt)}/ft</option>)}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 text-sm">
            <div className="flex justify-between py-0.5"><span>{count} × {spec.watts} W panel</span><b>{money(design.cost.panels)}</b></div>
            <div className="flex justify-between py-0.5"><span>{structure.columns} poles · {Math.round(design.cost.pillarFt)} ft</span><b>{money(design.cost.pillars)}</b></div>
            <div className="flex justify-between py-0.5"><span>Inverter, wiring, installation</span><b>{money(design.cost.other)}</b></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-base"><span className="font-semibold">Total</span><b>{money(design.cost.total)}</b></div>
          </div>

          {/* everything else is optional */}
          <button type="button" aria-expanded={tune} onClick={() => setTune(!tune)} className="flex w-full items-center justify-between border-t border-slate-200 pt-4 text-sm font-medium text-slate-600">
            Adjust design (optional) <ChevronDown className={cx('h-4 w-4 transition', tune && 'rotate-180')} />
          </button>
          {tune && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button type="button" aria-label="One panel less" onClick={() => setCount(count - 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                <div className="flex-1 text-center text-sm"><b className="text-lg">{count}</b> panels <span className="text-xs text-slate-400">(max {maxFit})</span></div>
                <button type="button" aria-label="One panel more" onClick={() => setCount(count + 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
              </div>
              <Adjust label={`Panel height · ${(config.frontLeg * FT).toFixed(1)} ft`} value={config.frontLeg} min={0.2} max={4} step={0.05} suffix="m" onChange={(frontLeg) => applyAll({ frontLeg })} />
              <Adjust label={`Tilt (best ${opt}°)`} value={config.tilt} min={0} max={45} suffix="°" onChange={(tilt) => applyAll({ tilt })} />
              <p className="text-xs text-slate-500">Back pole {backLeg.toFixed(2)} m ({(backLeg * FT).toFixed(1)} ft). Cut list: {structure.cutList.map((c) => `${c.qty} × ${(c.len * FT).toFixed(1)} ft`).join(', ') || '—'}</p>
              <div className="text-sm font-semibold">Panel groups</div>
              <GroupList design={design} />
              <button type="button" onClick={() => { setView('2d'); s.set({ tool: 'add-array', selectedId: null }); }} className="w-full rounded-md border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50">Add panels manually (plan view)</button>
            </div>
          )}
        </div>
        <button id="rearrange" type="button" hidden onClick={() => autoGroups(design, count >= maxFit ? 0 : count)} />
      </aside>
    </>
  );
}
