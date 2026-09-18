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
  const [useMode, setUseMode] = useState('bill');
  const [page, setPage] = useState(0);
  const [tune, setTune] = useState(false);
  const [busy, setBusy] = useState(false);
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
  const card = (on) => cx('w-full rounded-2xl border-2 px-4 py-3 text-left transition', on ? 'border-[#f5a524] bg-amber-50' : 'border-slate-200 hover:border-slate-300');
  const TITLES = ['Your electricity', 'Panel', 'Stand', 'Your plan'];

  return (
    <>
      <div className="absolute inset-y-0 left-0 right-[400px]">
        {view === '3d' ? <Scene3D design={design} /> : <Editor2D design={design} />}
        <div className="absolute left-4 top-4 flex rounded-full bg-white p-1 shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
          {[['3d', Box, '3D view'], ['2d', Move, 'Top view']].map(([k, Icon, label]) => (
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
        {view === '3d' && <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-white/15 px-4 py-1.5 text-xs text-white">This is your roof · drag to look around · you can drag the panels too</div>}
      </div>

      <aside className="absolute inset-y-0 right-0 flex w-[400px] flex-col border-l border-slate-200 bg-white">
        {/* progress */}
        <div className="flex items-center gap-1.5 px-6 pt-5">
          {TITLES.map((t, i) => (
            <button key={t} type="button" onClick={() => setPage(i)} className="flex-1 text-left">
              <div className={cx('h-1.5 rounded-full', i <= page ? 'bg-[#f5a524]' : 'bg-slate-200')} />
              <div className={cx('mt-1 text-[11px] font-medium', i === page ? 'text-slate-900' : 'text-slate-400')}>{t}</div>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {page === 0 && (
            <>
              <Big>How much is your electricity bill every month?</Big>
              <Sub>We will suggest how many solar panels you need. Not sure? Just skip.</Sub>
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
                {[['bill', `Bill amount (${finance.currency})`], ['units', 'Units (kWh)']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setUseMode(k)} className={cx('h-9 flex-1 rounded-lg', useMode === k ? 'bg-white shadow-sm' : 'text-slate-500')}>{l}</button>
                ))}
              </div>
              <input autoFocus inputMode="numeric" value={bill} onChange={(e) => setBill(e.target.value.replace(/[^\d.]/g, ''))} placeholder={useMode === 'bill' ? 'e.g. 3500' : 'e.g. 450'} className="h-16 w-full rounded-2xl border-2 border-slate-300 px-5 text-2xl font-semibold outline-none focus:border-[#f5a524]" />
              <div className="flex flex-wrap gap-2">
                {(useMode === 'bill' ? [1500, 3000, 5000, 8000] : [150, 300, 500, 800]).map((v) => (
                  <button key={v} type="button" onClick={() => setBill(String(v))} className="rounded-full border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50">{useMode === 'bill' ? money(v) : `${v} units`}</button>
                ))}
              </div>
              {needUnits > 0 && (
                <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
                  You use about <b>{Math.round(needUnits)} units</b> a month.<br />
                  You need <b className="text-lg">{needPanels} panels</b> ({((needPanels * spec.watts) / 1000).toFixed(1)} kW).
                  {needPanels > maxFit && <div className="mt-1 text-amber-800">Your roof has space for {maxFit} panels — that covers about {Math.round((maxFit / needPanels) * 100)}% of your bill.</div>}
                </div>
              )}
            </>
          )}

          {page === 1 && (
            <>
              <Big>Choose your solar panel</Big>
              <Sub>Bigger watt = more electricity from each panel.</Sub>
              {design.catalog.panels.map((p) => (
                <button key={p.id} type="button" onClick={() => pickPanel(p.id)} className={card(p.id === spec.id)}>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold">{p.watts} W</span>
                    <span className="text-base font-semibold">{money(p.price)} <span className="text-xs font-normal text-slate-400">each</span></span>
                  </div>
                  <div className="text-sm text-slate-500">{p.brand} · {p.model}</div>
                </button>
              ))}
            </>
          )}

          {page === 2 && (
            <>
              <Big>Choose the stand for your panels</Big>
              <Sub>Panels stand on iron pillars fixed to your roof.</Sub>
              <div className="grid grid-cols-3 gap-2">
                {design.catalog.pillars.map((p) => (
                  <button key={p.id} type="button" onClick={() => s.patch('config', { pillarId: p.id })} className={cx(card(p.id === design.pillar.id), 'px-2 text-center')}>
                    <div className="mx-auto mb-1 grid h-8 w-8 place-items-center"><PillarIcon shape={p.shape} /></div>
                    <div className="text-sm font-semibold capitalize">{p.shape.replace('-', ' ')}</div>
                    <div className="text-xs text-slate-500">{money(p.pricePerFt)} / ft</div>
                  </button>
                ))}
              </div>
              <div className="pt-2 text-[15px] font-semibold">How high above the roof?</div>
              <Pills value={config.frontLeg < 0.7 ? 0.4 : config.frontLeg < 1.8 ? 1 : 2.4} onChange={(frontLeg) => applyAll({ frontLeg })} options={[{ value: 0.4, label: 'Low', sub: 'cheapest' }, { value: 1, label: 'Medium', sub: '3 ft' }, { value: 2.4, label: 'High', sub: 'walk under it' }]} />
              <p className="text-xs text-slate-400">Look at the 3D picture — it changes as you choose.</p>
            </>
          )}

          {page === 3 && (
            <>
              <div className="rounded-2xl bg-slate-900 p-5 text-white">
                <div className="text-sm text-slate-300">Your solar system</div>
                <div className="text-4xl font-bold">{count} panels <span className="text-xl font-medium text-slate-300">· {totals.kwp.toFixed(1)} kW</span></div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div><div className="text-slate-400">Electricity made</div><div className="text-lg font-bold">{Math.round(totals.acKwh / 12).toLocaleString()} units<span className="text-xs font-normal"> / month</span></div><div className="text-xs text-slate-400">{Math.round(totals.acKwh).toLocaleString()} kWh a year</div></div>
                  <div><div className="text-slate-400">You save</div><div className="text-lg font-bold">{money(fin.firstYearSavings / 12)}<span className="text-xs font-normal"> / month</span></div>{needUnits > 0 && <div className="text-xs text-slate-400">covers {Math.min(100, Math.round((totals.acKwh / 12 / needUnits) * 100))}% of your bill</div>}</div>
                  <div><div className="text-slate-400">Total price</div><div className="text-lg font-bold">{money(design.cost.total)}</div></div>
                  <div><div className="text-slate-400">Money back in</div><div className="text-lg font-bold">{fin.payback ? `${fin.payback.toFixed(1)} years` : '25+ years'}</div></div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
                <button type="button" onClick={() => setCount(count - 1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Minus className="h-5 w-5" /></button>
                <div className="flex-1 text-center text-sm"><b className="text-lg">{count}</b> panels<div className="text-xs text-slate-400">roof fits up to {maxFit}</div></div>
                <button type="button" onClick={() => setCount(count + 1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Plus className="h-5 w-5" /></button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setView('2d'); s.set({ tool: 'add-array', selectedId: null }); }} className="rounded-xl border-2 border-slate-200 py-2.5 text-sm font-semibold hover:border-slate-300">＋ Add panels myself</button>
                <button type="button" onClick={() => autoGroups(design, 0)} className="rounded-xl border-2 border-slate-200 py-2.5 text-sm font-semibold hover:border-slate-300">✨ Fill roof for me</button>
              </div>
              {totals.invalid > 0 && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{totals.invalid} red group{totals.invalid > 1 ? 's are' : ' is'} touching a wall, tank or another group and is not counted. Drag it to a free place.</p>}

              <div className="rounded-2xl bg-amber-50 p-4 text-sm">
                <div className="mb-1.5 font-semibold">Price details</div>
                <div className="flex justify-between py-0.5"><span>{count} × {spec.watts} W panel ({spec.brand})</span><b>{money(design.cost.panels)}</b></div>
                <div className="flex justify-between py-0.5"><span>{structure.columns} pillars · {Math.round(design.cost.pillarFt)} ft {design.pillar.shape.replace('-', ' ')}</span><b>{money(design.cost.pillars)}</b></div>
                <div className="flex justify-between py-0.5"><span>Inverter, wiring, fitting</span><b>{money(design.cost.other)}</b></div>
                <div className="mt-1 flex justify-between border-t border-amber-200 pt-1.5 text-base"><span className="font-semibold">Total</span><b>{money(design.cost.total)}</b></div>
              </div>

              <button type="button" onClick={download} disabled={busy || !count} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Download my solar plan (PDF)
              </button>

              <button type="button" onClick={() => setTune(!tune)} className="flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-medium text-slate-600">
                Change tilt, height or move panel groups <ChevronDown className={cx('h-4 w-4 transition', tune && 'rotate-180')} />
              </button>
              {tune && (
                <div className="space-y-4 border-t border-slate-100 pt-3">
                  <Adjust label={`Height of all panels · ${(config.frontLeg * FT).toFixed(1)} ft`} value={config.frontLeg} min={0.2} max={4} step={0.05} suffix="m" onChange={(frontLeg) => applyAll({ frontLeg })} />
                  <Adjust label={`Tilt of all panels (best is ${opt}°)`} value={config.tilt} min={0} max={45} suffix="°" onChange={(tilt) => applyAll({ tilt })} />
                  <p className="text-xs text-slate-500">Back pillar becomes {backLeg.toFixed(2)} m ({(backLeg * FT).toFixed(1)} ft).</p>
                  {main && <Adjust label={`Building height · ${Math.round(main.height * FT)} ft`} value={main.height} min={2.5} max={60} step={0.5} suffix="m" onChange={(height) => s.updateSection(main.id, { height })} />}
                  {main && <Adjust label="Boundary wall height" value={main.parapetH} min={0} max={2.5} step={0.1} suffix="m" onChange={(parapetH) => s.updateSection(main.id, { parapetH })} />}
                  <div className="text-sm font-semibold">Panel groups</div>
                  <GroupList design={design} />
                  <div className="text-xs text-slate-500">Pillar cutting list: {structure.cutList.map((c) => `${c.qty} × ${(c.len * FT).toFixed(1)} ft`).join(', ') || '—'}</div>
                  <button id="rearrange" type="button" onClick={() => autoGroups(design, count >= maxFit ? 0 : count)} className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Arrange panels again automatically</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* footer navigation */}
        <div className="flex gap-2 border-t border-slate-200 p-4">
          {page > 0 && (
            <button type="button" onClick={() => setPage(page - 1)} className="flex h-12 items-center gap-1.5 rounded-xl border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Back</button>
          )}
          {page < 3 && (
            <button
              type="button"
              onClick={() => {
                if (page === 0 && needPanels > 0) setCount(needPanels);
                setPage(page + 1);
              }}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white hover:bg-slate-800"
            >
              {page === 0 && !needUnits ? 'Skip — fill my whole roof' : page === 2 ? <>See my plan <Check className="h-5 w-5" /></> : <>Next <ArrowRight className="h-5 w-5" /></>}
            </button>
          )}
        </div>
        {!tune && <button id="rearrange" type="button" hidden onClick={() => autoGroups(design, count >= maxFit ? 0 : count)} />}
      </aside>
    </>
  );
}
