'use client';

// One friendly screen for home owners: see the roof in 3D, pick how many panels, done.

import { Box, ChevronDown, Minus, Move, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { autoGroups } from '@/lib/autofill';
import { formatMoney } from '@/lib/energy';
import { buildDesign, zonesForSection } from '@/lib/model';
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
        <button key={o.label} type="button" onClick={() => onChange(o.value)} className={cx('rounded-md border px-2 py-2.5 text-center transition', value === o.value ? 'border-brand bg-brand-soft ring-2 ring-brand/20' : 'border-slate-200 hover:bg-slate-50')}>
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
        <button key={label} type="button" onClick={() => onChange(v)} className={cx('rounded-full border px-3 py-1 text-xs font-medium', Math.abs(value - v) < 0.01 ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
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
  const [page, setPage] = useState(0);
  const [tune, setTune] = useState(false);
  const { totals, structure, spec, fin } = design;
  const main = sections[0];

  // place panels automatically the first time
  const catalogReady = Boolean(s.catalog);
  const layoutKey = JSON.stringify([sections, objects.filter((o) => o.type === 'tree' || o.type === 'block')]);
  useEffect(() => {
    const st = useStore.getState();
    // wait for the company's catalog: laying out with the placeholder panel gives groups sized for
    // the wrong module, which no longer fit once the real one arrives
    if (!design.sections.length || !catalogReady) return;
    if (st.layoutKey !== layoutKey || !st.objects.some((o) => o.type === 'array')) {
      autoGroups(design);
      st.set({ layoutKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, design.sections.length, catalogReady]);

  const obstacleKey = JSON.stringify(objects.filter((o) => o.type === 'tree' || o.type === 'block'));
  const maxFit = useMemo(() => {
    const keep = JSON.parse(obstacleKey);
    const zones = design.sections.flatMap((sec) => zonesForSection(sec, config, design.defaultAzimuth, design.lat, 'fit'));
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
  // The one sizing question: the client's monthly bill, or the system size they asked for.
  // Both figures are stored: the one that was typed, and its equivalent in the other unit, so
  // switching between them shows the same system instead of starting over.
  const sizeBy = config.sizeBy === 'kw' ? 'kw' : 'bill';
  const legacy = config.sizeValue ?? ''; // designs saved before both values were kept
  const sizeValue = (sizeBy === 'kw' ? config.sizeKw : config.sizeBill) ?? legacy;
  const amount = Number(sizeValue) || 0;
  const tariff = design.catalog.tariff || 1;
  const needUnits = sizeBy === 'bill' ? amount / tariff : 0;
  const panelsFor = (mode, v) => {
    const n = Number(v) || 0;
    if (n <= 0) return 0;
    return mode === 'kw' ? Math.ceil((n * 1000) / spec.watts - 1e-9) : Math.ceil(n / tariff / perPanelMonth);
  };
  const needPanels = panelsFor(sizeBy, sizeValue);
  /** The same number of panels, expressed in the other unit. */
  const equivalent = (mode, v) => {
    const n = panelsFor(mode, v);
    if (!n) return '';
    // kW → bill rounds down so that converting back gives the same panel count
    return mode === 'bill' ? String(Number(((n * spec.watts) / 1000).toFixed(2))) : String(Math.floor(n * perPanelMonth * tariff));
  };
  const settle = useRef(0);
  const sizeFor = (mode, v) => {
    const other = equivalent(mode, v);
    s.patch('config', { sizeBy: mode, sizeValue: undefined, sizeBill: mode === 'bill' ? v : other, sizeKw: mode === 'kw' ? v : other });
    const n = panelsFor(mode, v);
    settle.current = 2;
    autoGroups(design, n > 0 ? Math.min(maxFit, Math.max(1, n)) : 0, { atLeast: true });
  };
  // switching the unit only changes how the requirement is shown — the layout stays as it is
  const switchTo = (mode) => {
    if (mode === sizeBy) return;
    const current = sizeBy === 'kw' ? { sizeKw: sizeValue } : { sizeBill: sizeValue };
    const shown = (mode === 'kw' ? config.sizeKw : config.sizeBill) || equivalent(sizeBy, sizeValue);
    s.patch('config', { sizeBy: mode, sizeValue: undefined, ...current, [mode === 'kw' ? 'sizeKw' : 'sizeBill']: shown });
  };
  // The yield per panel is re-estimated once the new layout is known (shading changes with it), which
  // can raise the number of panels the bill needs. Top up after a sizing change — never on manual edits.
  useEffect(() => {
    if (!settle.current) return;
    const target = Math.min(maxFit, needPanels);
    if (needPanels > 0 && target > count) {
      settle.current -= 1;
      autoGroups(design, target, { atLeast: true });
    } else settle.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needPanels, count, maxFit]);
  // panel choice in two steps: brand first, then one of that brand's models
  const brandOf = (p) => p.brand || 'Other';
  const brands = [...new Set(design.catalog.panels.map(brandOf))].sort((a, b) => a.localeCompare(b));
  const models = design.catalog.panels.filter((p) => brandOf(p) === brandOf(spec)).sort((a, b) => a.watts - b.watts);
  const pickBrand = (brand) => {
    // keep the power class the designer had: the new brand's model closest in watt
    const options = design.catalog.panels.filter((p) => brandOf(p) === brand);
    const next = options.reduce((best, p) => (Math.abs(p.watts - spec.watts) < Math.abs(best.watts - spec.watts) ? p : best), options[0]);
    if (next) pickPanel(next.id);
  };
  const pickPanel = (specId) => {
    s.patch('config', { specId });
    // panel size changed → re-arrange with the same count on the next tick
    setTimeout(() => document.getElementById('rearrange')?.click(), 50);
  };
  const money = (v) => formatMoney(v, finance.currency);
  const slopeLen = (config.orientation === 'landscape' ? spec.width : spec.length) * config.rowsPerTable;
  const backLeg = config.frontLeg + slopeLen * Math.sin((config.tilt * Math.PI) / 180);

  const card = (on) => cx('w-full rounded-lg border-2 px-4 py-3 text-left transition', on ? 'border-brand bg-brand-soft' : 'border-slate-200 hover:border-slate-300');
  const TITLES = ['Consumption', 'Panel', 'Structure', 'Proposal'];

  return (
    <>
      <div className="absolute inset-y-0 left-0 right-[400px]">
        {view === '3d' ? <Scene3D design={design} /> : <Editor2D design={design} />}
        <div className="absolute left-4 top-4 flex rounded-full bg-white p-1 shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
          {[['3d', Box, '3D'], ['2d', Move, 'Plan view']].map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => { if (view === '3d' && k !== '3d') s.set({ snapshot: sceneApi.capture?.() || s.snapshot }); setView(k); }} className={cx('flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium', view === k ? 'bg-slate-900 text-white' : 'text-slate-600')}>
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
          {/* 1 — the only question: size by bill or by kW */}
          <div>
            <div className="text-base font-semibold">Size the system by</div>
            <div role="radiogroup" aria-label="Size the system by" className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              {[['bill', 'Monthly bill'], ['kw', 'Kilowatt (kW)']].map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={sizeBy === k} onClick={() => switchTo(k)} className={cx('h-9 rounded-md text-sm font-medium whitespace-nowrap transition', sizeBy === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>{label}</button>
              ))}
            </div>
            <label htmlFor="size" className="mt-3 block text-sm font-medium text-slate-600">{sizeBy === 'bill' ? `Monthly electricity bill (${finance.currency})` : 'System size required (kW)'}</label>
            <div className="relative mt-1.5">
              <input id="size" inputMode="decimal" value={sizeValue} onChange={(e) => sizeFor(sizeBy, e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder={sizeBy === 'bill' ? 'e.g. 3500' : 'e.g. 5'} className="h-14 w-full rounded-md border-2 border-slate-300 pr-14 pl-4 text-2xl font-semibold outline-none focus:border-brand" />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-medium text-slate-400">{sizeBy === 'bill' ? finance.currency : 'kW'}</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              {needPanels > 0
                ? <>
                    {sizeBy === 'bill' ? <>About <b>{Math.round(needUnits)} units</b>/month → </> : <><b>{amount} kW</b> → </>}
                    <b>{needPanels} panels</b> of {spec.watts} W needed
                    {needPanels > maxFit ? `; the roof fits ${maxFit} (${sizeBy === 'bill' ? `${Math.round((maxFit / needPanels) * 100)}% of the bill` : `${((maxFit * spec.watts) / 1000).toFixed(1)} kW`})` : ''}.
                  </>
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

          {totals.invalid > 0 && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{totals.invalid} red group{totals.invalid > 1 ? 's are' : ' is'} overlapping something and not counted. Drag it to a free place.</p>}

          {/* 3 — two dropdowns */}
          <div className="grid gap-3">
            <div className="grid gap-3">
              <label className="text-sm font-medium">1. Panel brand
                <select className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm" value={brandOf(spec)} onChange={(e) => pickBrand(e.target.value)}>
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">2. Model
                <select className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm" value={spec.id} onChange={(e) => pickPanel(e.target.value)}>
                  {models.map((p) => <option key={p.id} value={p.id}>{p.model || `${p.watts} W`} · {p.watts} W</option>)}
                </select>
              </label>
            </div>
            <p className="-mt-1 text-xs text-slate-500">
              {spec.watts} W · {spec.length} × {spec.width} m · {money(spec.price)} per panel
              {spec.manufactureYear ? ` · made ${spec.manufactureYear}` : ''}{spec.warrantyYears != null ? ` · ${spec.warrantyYears}-year warranty` : ''}
            </p>
            {/* poles only exist on flat roofs; flush-mounted panels use roof hooks */}
            {(structure.columns > 0 || !structure.hooks) && (
            <label className="text-sm font-medium">Mounting pole
                <select className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm" value={design.pillar.id} onChange={(e) => s.patch('config', { pillarId: e.target.value })}>
                  {design.catalog.pillars.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.shape.replace('-', ' ')}) · {money(p.pricePerFt)}/ft</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-4 text-sm">
            <div className="flex justify-between py-0.5"><span>{count} × {spec.watts} W panel</span><b>{money(design.cost.panels)}</b></div>
            {structure.columns > 0 && <div className="flex justify-between py-0.5"><span>{structure.columns} poles · {Math.round(design.cost.pillarFt)} ft</span><b>{money(design.cost.pillars)}</b></div>}
            {structure.hooks > 0 && <div className="flex justify-between py-0.5"><span>{structure.hooks} roof hooks (flush mount)</span><span className="text-slate-400">in installation</span></div>}
            <div className="flex justify-between py-0.5"><span>Inverter, wiring, installation</span><b>{money(design.cost.other)}</b></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-base"><span className="font-semibold">Total</span><b>{money(design.cost.total)}</b></div>
          </div>

          {/* everything else is optional */}
          <button type="button" aria-expanded={tune} onClick={() => setTune(!tune)} className="flex w-full items-center justify-between border-t border-slate-200 pt-4 text-sm font-medium text-slate-600">
            Adjust design <ChevronDown className={cx('h-4 w-4 transition', tune && 'rotate-180')} />
          </button>
          {tune && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button type="button" aria-label="One panel less" onClick={() => setCount(count - 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                <div className="flex-1 text-center text-sm"><b className="text-lg">{count}</b> panels <span className="text-xs text-slate-400">(max {maxFit})</span></div>
                <button type="button" aria-label="One panel more" onClick={() => setCount(count + 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
              </div>
              {design.sections.some((sec) => sec.frame) && <p className="rounded-md bg-brand-soft px-3 py-2 text-xs text-brand-ink">On the sloped roof, panels lie flat on the slope: their tilt and facing follow the roof, so the height and tilt sliders below only affect flat areas.</p>}
              <Adjust label={`Panel height · ${(config.frontLeg * FT).toFixed(1)} ft`} value={config.frontLeg} min={0.2} max={4} step={0.05} suffix="m" onChange={(frontLeg) => applyAll({ frontLeg })} />
              <Adjust label={`Tilt (best ${opt}°)`} value={config.tilt} min={0} max={45} suffix="°" onChange={(tilt) => applyAll({ tilt })} />
              <p className="text-xs text-slate-500">Back pole {backLeg.toFixed(2)} m ({(backLeg * FT).toFixed(1)} ft). Cut list: {structure.cutList.map((c) => `${c.qty} × ${(c.len * FT).toFixed(1)} ft`).join(', ') || '—'}</p>
              <div className="text-sm font-semibold">Panel groups</div>
              <GroupList design={design} />
              <button type="button" onClick={() => { setView('2d'); s.set({ tool: 'add-array', selectedId: null }); }} className="w-full rounded-md border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50">Add panels manually (plan view)</button>
            </div>
          )}
        </div>
        {/* after a panel change: re-size to the bill / kW if one is set, otherwise keep the same number of panels */}
        <button id="rearrange" type="button" hidden onClick={() => (amount > 0 ? sizeFor(sizeBy, sizeValue) : autoGroups(design, count >= maxFit ? 0 : count))} />
      </aside>
    </>
  );
}
