'use client';

// One friendly screen for home owners: see the roof in 3D, pick how many panels, done.

import { Box, ChevronDown, ChevronRight, FileText, Minus, Move, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { autoGroups } from '@/lib/autofill';
import { capFirst } from '@/lib/catalog';
import { formatMoney } from '@/lib/energy';
import { buildDesign, zonesForSection } from '@/lib/model';
import { sceneApi } from '../scene/Scene3D';
import { useStore } from '@/lib/store';
import Editor2D from '../editor/Editor2D';
import { cx } from '../ui';
import { Adjust } from './DesignPanel';
import GroupList from './GroupList';
import ShadowReportModal from './ShadowReportModal';
import BuildingBreakdown from './BuildingBreakdown';
import { catalogMaterialLineTotal } from '@/lib/pricing';
import { GstSummary } from './GstSummary';
import ChargePicker from '../dashboard/ChargePicker';
import { api } from '@/lib/api';
import { validUntilInput } from '@/lib/validity';
import { Modal, NumField } from '../kit';

const Scene3D = dynamic(() => import('../scene/Scene3D'), { ssr: false });
const FT = 3.281;

function Pills({ value, options, onChange }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button key={o.label} type="button" onClick={() => onChange(o.value)} className={cx('rounded-md border px-2 py-2.5 text-center transition', value === o.value ? 'border-brand bg-brand-soft ring-2 ring-brand/20' : 'border-slate-200 hover:bg-slate-50')}>
          <div className="text-base font-semibold">{o.label}</div>
          {o.sub && <div className="text-[13px] text-slate-700">{o.sub}</div>}
        </button>
      ))}
    </div>
  );
}

function Chips({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button key={label} type="button" onClick={() => onChange(v)} className={cx('rounded-full border px-3 py-1 text-sm font-medium', Math.abs(value - v) < 0.01 ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
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

/** Collapsible sidebar section: a bold heading, and its current setting shown as a colored chip. */
function Section({ id, title, summary, open, onToggle, children }) {
  return (
    <section className="border-b border-slate-200">
      <button type="button" aria-expanded={open} aria-controls={`sec-${id}`} onClick={() => onToggle(id)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
        <span className="text-[18px] font-bold text-slate-900">{title}</span>
        <span className="ml-auto truncate rounded-full bg-brand-soft px-2.5 py-1 text-sm font-semibold text-brand-ink">{summary}</span>
        <ChevronDown className={cx('h-5 w-5 shrink-0 text-slate-600 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={`sec-${id}`} className="space-y-4 px-5 pb-5 text-[17px] text-slate-700">
          {children}
        </div>
      )}
    </section>
  );
}

const Big = ({ children }) => <h2 className="text-[25px] font-bold leading-tight">{children}</h2>;
const Sub = ({ children }) => <p className="mt-1 text-base text-slate-700">{children}</p>;

const Q = ({ n, children }) => (
  <div className="mb-2 flex items-center gap-2 text-[17px] font-semibold">
    {n > 0 && <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-sm text-white">{n}</span>}
    {children}
  </div>
);

export default function StepSimpleDesign({ design }) {
  const s = useStore();
  const { config, objects, sections, finance } = s;
  const [chosenView, setView] = useState('3d');
  const [page, setPage] = useState(0);
  // sidebar sections: one open at a time
  const [openSec, setOpenSec] = useState(null);
  const toggleSec = (id) => setOpenSec((cur) => (cur === id ? null : id));
  // Materials & cost breakdown moved out of the sidebar accordion into their own popup — it's a lot to scroll
  // through inline, and most people only need to check it occasionally, not keep it open while designing.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // the header's Export menu asks for the shadow report; it needs the live 3D scene, so the view is
  // 3D while it runs, and the dialog opens once the scene is up (it starts generating on open)
  const wantShadow = useStore((st) => st.shadowReport);
  const view = wantShadow ? '3d' : chosenView;
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    if (!wantShadow) return undefined;
    let id = 0;
    const wait = () => (sceneApi.getScene ? setSceneReady(true) : (id = requestAnimationFrame(wait)));
    id = requestAnimationFrame(wait);
    return () => {
      cancelAnimationFrame(id);
      setSceneReady(false);
    };
  }, [wantShadow]);
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
  const { azimuthFor, buildings: designBuildings } = design;
  const maxFit = useMemo(() => {
    const keep = JSON.parse(obstacleKey);
    const zones = design.sections.flatMap((sec) => zonesForSection(sec, config, azimuthFor(sec), design.lat, 'fit'));
    return buildDesign({ sections, buildings: designBuildings, objects: [...keep, ...zones], config: { ...config, maxPanels: 0 }, lat: design.lat, spec: design.spec }).modules.length;
  }, [sections, config, design.sections, designBuildings, design.lat, azimuthFor, design.spec, obstacleKey]);
  const count = totals.count;
  const setCount = (n) => {
    const v = Math.max(1, Math.min(Math.max(maxFit, 1), Math.round(n)));
    const kw = ((v * spec.watts) / 1000).toFixed(2);
    s.patch('config', {
      pricingMode: 'custom',
      sizeBy: 'kw',
      sizeKw: kw,
      sizeBill: String(Math.floor(v * perPanelMonth * tariff)),
    });
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
    s.patch('config', { sizeBy: mode, sizeValue: undefined, sizeBill: mode === 'bill' ? v : other, sizeKw: mode === 'kw' ? v : other, pricingMode: 'custom' });
    const n = panelsFor(mode, v);
    settle.current = 2;
    autoGroups(design, n > 0 ? Math.min(maxFit, Math.max(1, n)) : 0, { atLeast: true });
  };

  // Selecting a package: place the exact number of panels defined in the package.
  // Priority: 1) panel item qty  2) compute from pkg.kw + panel watts  3) keep current count.
  // We read directly from design.catalog so there are no stale closure issues.
  const pickPackage = (pkgId) => {
    const pkg = (design.catalog.packages || []).find((p) => p.id === pkgId);
    const pkgKw = pkg ? Number(pkg.kw) || 0 : 0;

    // Find the panel line-item in this package
    const panelItem = pkg?.items?.find((it) => it.itemType === 'panel' || it.name?.toLowerCase().includes('panel'));

    // Panel count: use the exact qty from the package item if set
    const exactQty = panelItem ? Number(panelItem.qty) || 0 : 0;

    // Panel watts: try to resolve from catalog first (most reliable),
    // then fall back to regex on name/model/spec, then current spec.
    let panelWatts = spec.watts;
    if (panelItem) {
      // 1. Match by brand + model in the catalog
      const catalogMatch = design.catalog.panels.find(
        (p) =>
          p.brand?.toLowerCase() === panelItem.brand?.toLowerCase() &&
          p.model?.toLowerCase() === panelItem.model?.toLowerCase(),
      );
      if (catalogMatch) {
        panelWatts = catalogMatch.watts;
      } else {
        // 2. Regex: look for patterns like "575W", "575 W", or a bare 3-4 digit number at end of name
        const searchStr = `${panelItem.model || ''} ${panelItem.spec || ''} ${panelItem.name || ''}`;
        const wattsMatch = searchStr.match(/(\d{3,4})\s*w\b/i) || searchStr.match(/\b(\d{3,4})\s*$/);
        if (wattsMatch) panelWatts = Number(wattsMatch[1]);
      }
    }

    // Determine the panel count to lay out
    const n = exactQty > 0
      ? exactQty                                                          // exact qty wins
      : pkgKw > 0 && panelWatts > 0
        ? Math.ceil((pkgKw * 1000) / panelWatts - 1e-9)                  // derive from kW
        : 0;

    if (n > 0) {
      const clamped = Math.min(maxFit, Math.max(1, n));
      // Compute effective kW from the panels that will actually be placed
      const effectiveKw = ((clamped * panelWatts) / 1000).toFixed(2);
      s.patch('config', {
        packageId: pkgId,
        sizeBy: 'kw',
        sizeValue: undefined,
        sizeKw: pkgKw > 0 ? String(pkgKw) : effectiveKw,
        sizeBill: String(Math.floor(clamped * perPanelMonth * tariff)),
      });
      settle.current = 2;
      autoGroups(design, clamped, { atLeast: true });
    } else {
      // No panel count info — just record the package, keep current layout
      s.patch('config', { packageId: pkgId });
    }
  };

  // Auto-apply the package layout in two additional situations:
  //  A) On page load: packages arrive from the API after the design is already open → trigger once.
  //  B) When the user switches back to package mode (pricingMode changes to 'package').
  // Guard with a ref so we don't re-run on every render.
  const pkgApplied = useRef('');
  const pkgsAvailable = (design.catalog.packages || []).length > 0;
  useEffect(() => {
    if (config.pricingMode !== 'package') {
      pkgApplied.current = ''; // reset when leaving package mode
      return;
    }
    const pkgId = config.packageId || design.catalog.packages?.[0]?.id || '';
    if (!pkgId || !pkgsAvailable) return;
    // Only fire once per (pricingMode + packageId + packages-loaded) combination
    const key = `${pkgId}:${pkgsAvailable}`;
    if (pkgApplied.current === key) return;
    pkgApplied.current = key;
    pickPackage(pkgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.pricingMode, config.packageId, pkgsAvailable]);

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
      <div className="absolute inset-y-0 left-0 right-[430px]">
        {view === '3d' ? <Scene3D design={design} /> : <Editor2D design={design} />}
        <div className="absolute left-4 top-4 flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex rounded-full bg-white p-1 shadow-lg">
            {[['3d', Box, '3D'], ['2d', Move, 'Plan view']].map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => { if (view === '3d' && k !== '3d') s.set({ snapshot: sceneApi.capture?.() || s.snapshot }); setView(k); }} className={cx('flex items-center gap-1.5 rounded-full px-4 py-2 text-base font-medium', view === k ? 'bg-slate-900 text-white' : 'text-slate-600')}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>
        {view === '2d' && (
          <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-slate-900/85 px-5 py-2 text-base text-white shadow-lg">
            {s.tool === 'add-array' ? 'Tap on the roof where you want panels' : 'Drag panels to move · pull the ⤡ corner to add or remove panels · orange dot turns them'}
          </div>
        )}
        {view === '3d' && <div className="pointer-events-none absolute left-1/2 top-6 hidden -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 text-[13px] text-white/85 backdrop-blur-sm lg:block">Drag to orbit · scroll to zoom · click a panel group for details, drag it to move</div>}
      </div>

      <aside className="absolute inset-y-0 right-0 flex w-[430px] flex-col border-l border-slate-200 bg-white">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 px-5 py-4">
          {/* 2 — result */}
          <div className="rounded-2xl bg-slate-900 p-5 text-white" aria-live="polite">
            <div className="text-3xl font-extrabold">{count} panels <span className="text-xl font-medium text-slate-300">· {totals.kwp.toFixed(1)} kW</span></div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              <div><div className="text-base font-semibold text-slate-300">Generates</div><div className="text-2xl font-bold text-white">{Math.round(totals.acKwh / 12).toLocaleString()} units<span className="text-base font-normal text-slate-300"> / month</span></div><div className="text-base text-slate-300">{Math.round(totals.acKwh).toLocaleString()} kWh / year</div></div>
              <div><div className="text-base font-semibold text-slate-300">Saves</div><div className="text-2xl font-bold text-white">{money(fin.firstYearSavings / 12)}<span className="text-base font-normal text-slate-300"> / month</span></div></div>
              <div><div className="text-base font-semibold text-slate-300">Total price</div><div className="text-2xl font-bold text-white">{money(design.cost.total)}</div>{design.cost.withGst !== false && design.cost.gstAmount > 0 && <div className="text-sm text-slate-300">incl. GST</div>}</div>
              <div><div className="text-base font-semibold text-slate-300">Payback</div><div className="text-2xl font-bold text-white">{fin.payback ? `${fin.payback.toFixed(1)} years` : `${fin.rows.length}+ years`}</div></div>
            </div>
          </div>

          {/* 1 — the only question: size by bill or by kW */}
          <div>
            <div className="text-[19px] font-bold text-slate-900">Size the system by</div>
            <div role="radiogroup" aria-label="Size the system by" className="mt-2.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              {[['bill', 'Monthly bill'], ['kw', 'Kilowatt (kW)']].map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={sizeBy === k} onClick={() => switchTo(k)} className={cx('h-10 rounded-md text-[17px] font-semibold whitespace-nowrap transition', sizeBy === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700 hover:text-slate-900')}>{label}</button>
              ))}
            </div>
            <label htmlFor="size" className="mt-3.5 block text-base font-semibold text-slate-600">{sizeBy === 'bill' ? `Monthly electricity bill (${finance.currency})` : 'System size required (kW)'}</label>
            <div className="relative mt-1.5">
              <input id="size" inputMode="decimal" value={sizeValue} onChange={(e) => sizeFor(sizeBy, e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder={sizeBy === 'bill' ? 'e.g. 3500' : 'e.g. 5'} className="h-12 w-full rounded-md border border-slate-300 pr-14 pl-3 text-2xl font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-lg font-semibold text-slate-600">{sizeBy === 'bill' ? finance.currency : 'kW'}</span>
            </div>
            <p className="mt-2 text-base text-slate-600">
              {needPanels > 0
                ? <>
                    {sizeBy === 'bill' ? <>About <b className="text-slate-900">{Math.round(needUnits)} units</b>/month → </> : <><b className="text-slate-900">{amount} kW</b> → </>}
                    <b className="text-slate-900">{needPanels} panels</b> of {spec.watts} W needed
                    {needPanels > maxFit ? `; the roof fits ${maxFit} (${sizeBy === 'bill' ? `${Math.round((maxFit / needPanels) * 100)}% of the bill` : `${((maxFit * spec.watts) / 1000).toFixed(1)} kW`})` : ''}.
                  </>
                : 'Leave empty to fill the whole roof.'}
            </p>
          </div>

          {totals.invalid > 0 && <p className="rounded-md bg-red-50 px-3 py-2 text-base text-red-700">{totals.invalid} red group{totals.invalid > 1 ? 's are' : ' is'} overlapping something and not counted. Drag it to a free place.</p>}

          </div>
          <div className="border-t border-slate-200">
          <Section id="equipment" title="Panels & poles" summary={config.pricingMode === 'package' ? 'From the package' : [brandOf(spec), `${spec.watts} W`].join(' · ')} open={openSec === 'equipment'} onToggle={toggleSec}>
            {config.pricingMode === 'package' ? <p className="text-sm text-slate-700">Panels and poles are set by the selected package (see Materials).</p> : null}
          {/* 3 — dropdowns for panels, poles and custom materials (Only shown in Custom mode; package mode manages these via the package) */}
          {config.pricingMode !== 'package' && (
            <div className="grid gap-3">
              <div className="grid gap-3">
                <label className="text-sm font-medium text-slate-700">Panel brand
                  <select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-base text-slate-900" value={brandOf(spec)} onChange={(e) => pickBrand(e.target.value)}>
                    {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Model
                  <select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-base text-slate-900" value={spec.id} onChange={(e) => pickPanel(e.target.value)}>
                    {models.map((p) => <option key={p.id} value={p.id}>{p.model || `${p.watts} W`} · {p.watts} W</option>)}
                  </select>
                </label>
              </div>
              <p className="-mt-1 text-sm text-slate-700">
                {spec.watts} W · {spec.length} × {spec.width} m · {money(spec.price)} per panel
                {spec.manufactureYear ? ` · made ${spec.manufactureYear}` : ''}{spec.warrantyYears != null ? ` · ${spec.warrantyYears}-year warranty` : ''}
              </p>
              {/* poles only exist on flat roofs; flush-mounted panels use roof hooks */}
              {(structure.columns > 0 || !structure.hooks) && (
                <label className="text-sm font-medium text-slate-700">Mounting pole
                  <select className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-base text-slate-900" value={design.pillar.id} onChange={(e) => s.patch('config', { pillarId: e.target.value })}>
                    {design.catalog.pillars.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.shape.replace('-', ' ')}) · {money(p.pricePerFt)}/ft</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          </Section>
          <Section id="adjust" title="Adjust layout" summary={`${count} panels · ${config.tilt}° tilt`} open={openSec === 'adjust'} onToggle={toggleSec}>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button type="button" aria-label="One panel less" onClick={() => setCount(count - 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                <div className="flex-1 text-center text-base"><b className="text-xl">{count}</b> panels <span className="text-sm text-slate-600">(max {maxFit})</span></div>
                <button type="button" aria-label="One panel more" onClick={() => setCount(count + 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
              </div>
              {design.sections.some((sec) => sec.frame) && <p className="rounded-md bg-brand-soft px-3 py-2 text-sm text-brand-ink">On the sloped roof, panels lie flat on the slope: their tilt and facing follow the roof, so the height and tilt sliders below only affect flat areas.</p>}
              <Adjust label={`Panel height · ${(config.frontLeg * FT).toFixed(1)} ft`} value={config.frontLeg} min={0.2} max={4} step={0.05} suffix="m" onChange={(frontLeg) => applyAll({ frontLeg })} />
              <Adjust label={`Tilt (best ${opt}°)`} value={config.tilt} min={0} max={45} suffix="°" onChange={(tilt) => applyAll({ tilt })} />
              <p className="text-sm text-slate-700">Back pole {backLeg.toFixed(2)} m ({(backLeg * FT).toFixed(1)} ft). Cut list: {structure.cutList.map((c) => `${c.qty} × ${(c.len * FT).toFixed(1)} ft`).join(', ') || '—'}</p>
              <div className="text-base font-semibold">Panel groups</div>
              <GroupList design={design} />
              <button type="button" onClick={() => { setView('2d'); s.set({ tool: 'add-array', selectedId: null }); }} className="w-full rounded-md border border-slate-300 py-2.5 text-base font-medium hover:bg-slate-50">Add panels manually (plan view)</button>
            </div>
          </Section>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"
          >
            <span className="text-[18px] font-bold text-slate-900">Materials &amp; cost breakdown</span>
            <span className="ml-auto flex items-center gap-1.5 truncate rounded-full bg-brand-soft px-2.5 py-1 text-sm font-semibold text-brand-ink">{money(design.cost.total)}</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-600" />
          </button>
          </div>
        </div>
        {/* after a panel change: re-size to the bill / kW if one is set, otherwise keep the same number of panels */}
        <button id="rearrange" type="button" hidden onClick={() => (amount > 0 ? sizeFor(sizeBy, sizeValue) : autoGroups(design, count >= maxFit ? 0 : count))} />
      </aside>

      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Materials & cost breakdown" size="lg" footer={<button type="button" onClick={() => setDetailsOpen(false)} className="h-10 rounded-lg bg-brand px-5 text-base font-semibold text-brand-fg hover:bg-brand-600">Done</button>}>
        <div className="space-y-8 text-[17px] text-slate-700">
        <div>
          <h3 className="mb-3 text-[18px] font-bold text-slate-900">Materials</h3>
          <div className="space-y-4">
          {/* Pricing mode selection: Package vs Custom */}
          <div>
            <div className="mb-1.5 text-sm font-medium text-slate-700">Pricing mode</div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/70 p-1">
              {[
                ['package', 'Package'],
                ['custom', 'Custom'],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (mode === (config.pricingMode || 'custom')) return; // already active
                    s.patch('config', { pricingMode: mode });
                    // When switching TO package mode, immediately apply the selected/default package
                    if (mode === 'package') {
                      const pkgId = config.packageId || design.catalog.packages?.[0]?.id || '';
                      if (pkgId) setTimeout(() => pickPackage(pkgId), 0);
                    }
                  }}
                  className={cx(
                    'h-8 rounded-md text-sm font-semibold transition',
                    (config.pricingMode || 'custom') === mode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {config.pricingMode === 'package' && (
              <div className="mt-3 space-y-2">
                <label className="text-sm font-medium text-slate-700 block">
                  Select Package
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-900 focus:border-brand outline-none"
                    value={design.cost.package?.id || config.packageId || ''}
                    onChange={(e) => pickPackage(e.target.value)}
                  >
                    {!design.catalog.packages?.length && (
                      <option value="">No packages in catalog yet (using standard)</option>
                    )}
                    {(design.catalog.packages || []).map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.kw ? `${pkg.kw} kW · ` : ''}{money(pkg.price)})
                      </option>
                    ))}
                  </select>
                </label>

                {design.cost.package && (
                  <div className="rounded-md border border-slate-200 bg-white p-2.5 text-sm text-slate-600">
                    <div className="flex justify-between items-center font-semibold text-slate-900">
                      <span>{design.cost.package.name}</span>
                      <span className="text-brand font-bold">{money(design.cost.package.price)}</span>
                    </div>
                    {design.cost.package.description && (
                      <p className="text-[13px] text-slate-700 mt-0.5">{design.cost.package.description}</p>
                    )}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1">
                      <span className="text-[13px] font-semibold uppercase tracking-wider text-slate-600 block mb-1">
                        Bundled Scope & Equipment
                      </span>
                      {design.cost.package.items?.length ? (
                        design.cost.package.items.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[13px] text-slate-600">
                            <span className="truncate">
                              <span className="font-medium text-slate-900">{it.name}</span>
                              {(it.brand || it.model) && (
                                <span className="text-slate-700 ml-1">
                                  ({[it.brand, it.model].filter(Boolean).join(' ')})
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[13px] text-slate-600 shrink-0 ml-2">
                              {it.qty} {it.unit}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[13px] text-slate-600">
                          Panels, inverter, poles, cabling, earthing, ACDB/DCDB bundled
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Floor Placement Surcharge */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Floor placement</span>
              {Number(config.floorPlacement || 0) === 0 ? (
                <span className="text-sm text-emerald-600 font-medium">Ground (₹0)</span>
              ) : (
                <span className="text-sm text-slate-600 font-medium">Floor {config.floorPlacement}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-600">
                Installation level
                <select
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                  value={config.floorPlacement ?? 0}
                  onChange={(e) => {
                    const fl = Number(e.target.value);
                    // default standard floor charges: Ground is 0, each floor above adds default increment (e.g. 5000/floor) unless user customized
                    const defaultCost = fl === 0 ? 0 : fl * 5000;
                    s.patch('config', { floorPlacement: fl, floorCost: defaultCost });
                  }}
                >
                  <option value={0}>Ground Floor (0)</option>
                  <option value={1}>1st Floor</option>
                  <option value={2}>2nd Floor</option>
                  <option value={3}>3rd Floor</option>
                  <option value={4}>4th Floor</option>
                  <option value={5}>5th Floor+</option>
                </select>
              </label>

              <label className="text-sm text-slate-600">
                Placement cost ({finance.currency})
                <NumField
                  min={0}
                  step="any"
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                  value={config.floorCost ?? 0}
                  onValue={(v) => s.patch('config', { floorCost: v })}
                />
              </label>
            </div>
          </div>

          <label className="block text-sm text-slate-600">
            Valid until
            <input type="date" className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" value={validUntilInput(s.validUntil)} onChange={(e) => { const v = e.target.value; s.set({ validUntil: v ? new Date(`${v}T23:59:59`).toISOString() : null }); api(`/api/designs/${useStore.getState().designId}`, { method: 'PUT', body: { validUntil: v || null } }).catch(() => {}); }} />
            <span className="mt-1 block text-[13px] text-slate-700">Printed on the proposal PDF next to its date.</span>
          </label>

          <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm text-slate-600">
            Financial outlook (years)
            <NumField min={1} max={30} step={1} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" value={config.outlookYears ?? 10} onValue={(v) => s.patch('config', { outlookYears: Math.round(v) })} />
          </label>
          <label className="block text-sm text-slate-600">
            Electricity rate ({finance.currency}/kWh)
            <NumField min={0} step="any" className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" value={design.catalog.tariff} onValue={(v) => s.patch('config', { tariff: v })} />
          </label>
          </div>
          <p className="-mt-2 text-[13px] text-slate-700">The PDF lists savings month by month ({(config.outlookYears ?? 10) * 12} months) at this rate, held flat.</p>

          <ChargePicker value={config.installationCharges} onChange={(installationCharges) => s.patch('config', { installationCharges })} currency={finance.currency} />

          {/* Custom Mode Other Materials (Dynamically rendered from company's own categories) */}
          {config.pricingMode !== 'package' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Electrical & BOS materials</span>
                  <span className="text-[13px] text-slate-600">From company catalog</span>
                </div>

                {(!design.catalog.materialCategories || design.catalog.materialCategories.length === 0) ? (
                  <p className="text-sm text-slate-700 py-1">
                    No custom material categories added yet (using baseline Balance of System). Add products to your categories in the Product Catalog to select specific inverters, wire, earthing, etc.
                  </p>
                ) : (
                  design.catalog.materialCategories.map((cat) => {
                    const isWire = cat.name.toLowerCase().includes('wire') || cat.name.toLowerCase().includes('cable');
                    const entry = config.customMaterials?.[cat.id] || {};
                    const selectedProd = cat.products?.find((p) => p.id === entry.productId);
                    const qty = entry.qty ?? 1;
                    const unitPrice = selectedProd ? (entry.price != null && entry.price !== '' ? Number(entry.price) : Number(selectedProd.price) || 0) : 0;
                    const gstPct = entry.gstPercent != null && entry.gstPercent !== '' ? Number(entry.gstPercent) : (Number(selectedProd?.gstPercent) >= 0 ? Number(selectedProd.gstPercent) : Number(config.gstPercent) || 18);
                    const lineTotal = selectedProd ? catalogMaterialLineTotal({ qty, rate: unitPrice, gstPercent: gstPct }) : 0;

                    const updateCategory = (patch) => {
                      const prevCM = config.customMaterials || {};
                      const currentEntry = prevCM[cat.id] || {};
                      s.patch('config', {
                        customMaterials: {
                          ...prevCM,
                          [cat.id]: { ...currentEntry, ...patch },
                        },
                      });
                    };

                    return (
                      <div key={cat.id}>
                        <div className="flex justify-between text-sm font-medium text-slate-700 mb-1">
                          <span>{cat.name}</span>
                          {selectedProd && (
                            <span className="text-slate-900 font-semibold">{money(lineTotal)}</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <select
                            className="h-9 flex-1 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                            value={entry.productId || ''}
                            onChange={(e) => {
                              const p = cat.products.find((x) => x.id === e.target.value);
                              updateCategory({
                                productId: e.target.value,
                                gstPercent: p ? (Number(p.gstPercent) >= 0 ? Number(p.gstPercent) : 18) : undefined,
                              });
                            }}
                          >
                            <option value="">Default BOS {cat.name}</option>
                            {cat.products.map((p) => (
                              <option key={p.id} value={p.id} >
                                {p.name} ({money(p.price)}{isWire ? `/${capFirst(p.unit) || 'Bundle'}` : ''})
                              </option>
                            ))}
                          </select>

                          {isWire ? (
                            <div className="relative flex items-center">
                              <NumField
                                min={1}
                                title="Number of bundles"
                                placeholder="Bundles"
                                className="h-9 w-20 rounded-md border border-slate-300 bg-white pr-6 pl-2 text-center text-sm"
                                value={qty}
                                onValue={(v) => updateCategory({ qty: v })}
                              />
                              <span className="pointer-events-none absolute right-1.5 text-[13px] text-slate-600">bdl</span>
                            </div>
                          ) : (
                            <NumField
                              min={1}
                              title="Quantity"
                              className="h-9 w-14 rounded-md border border-slate-300 bg-white px-1.5 text-center text-sm"
                              value={qty}
                              onValue={(v) => updateCategory({ qty: v })}
                            />
                          )}
                        </div>
                        {selectedProd && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="text-xs text-slate-600">
                              Price per unit
                              <NumField min={0} step="any" className="mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-xs" value={entry.price ?? selectedProd.price} onValue={(v) => updateCategory({ price: v })} />
                            </label>
                            <label className="text-xs text-slate-600">
                              GST % <span className="text-slate-400">(on unit price)</span>
                              <NumField min={0} max={100} step="any" className="mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-xs" value={entry.gstPercent ?? selectedProd.gstPercent ?? 18} onValue={(v) => updateCategory({ gstPercent: v })} />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            </div>
        </div>

        <div>
          <h3 className="mb-3 text-[18px] font-bold text-slate-900">Cost breakdown</h3>
          {/* Cost breakdown card */}
          <div className="text-[17px]">
            {config.pricingMode === 'package' ? (
              <>
                <div className="flex justify-between py-0.5">
                  <span className="font-medium text-slate-900">
                    Package ({design.cost.package?.name || 'Selected package'})
                  </span>
                  <b>{money(design.cost.packagePrice)}</b>
                </div>
                <div className="text-[13px] text-slate-600 pb-1 border-b border-slate-100">
                  Bundled: {count} modules, structure, BOS & installation
                </div>
                {Number(design.cost.floorCost) > 0 && (
                  <div className="flex justify-between py-1 text-sm text-slate-600">
                    <span>Floor placement (Floor {config.floorPlacement})</span>
                    <b>{money(design.cost.floorCost)}</b>
                  </div>
                )}
                {(design.cost.installationCharges || []).map((c, i) => (
                  <div key={i} className="flex justify-between py-0.5 text-sm text-slate-600"><span>{c.name}</span><b>{money(c.price)}</b></div>
                ))}
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-lg">
                  <span className="font-semibold">{(design.cost.gstAmount || 0) > 0.001 ? 'Subtotal (ex-GST)' : 'Total'}</span>
                  <b>{money(design.cost.subtotal ?? design.cost.total)}</b>
                </div>
                <GstSummary cost={design.cost} config={config} onConfig={(p) => s.patch('config', p)} money={money} />
              </>
            ) : (
              <>
                <div className="flex justify-between py-0.5">
                  <span>{count} × {spec.watts} W panel</span>
                  <b>{money(design.cost.panels)}</b>
                </div>
                {structure.columns > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span>{structure.columns} poles · {Math.round(design.cost.pillarFt)} ft</span>
                    <b>{money(design.cost.pillars)}</b>
                  </div>
                )}
                {structure.hooks > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span>{structure.hooks} roof hooks (flush mount)</span>
                    <span className="text-slate-600">in installation</span>
                  </div>
                )}

                {design.cost.hasChosenMaterials ? (
                  <>
                    {(design.cost.categoryMaterials || []).map((m) => (
                      <div key={m.categoryId} className="flex justify-between py-0.5 text-sm text-slate-600">
                        <span>{m.categoryName}: {m.productName} (×{m.qty} {m.unit})</span>
                        <b>{money(m.total)}</b>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="flex justify-between py-0.5">
                    <span>Inverter, wiring, installation (BOS)</span>
                    <b>{money(design.cost.other)}</b>
                  </div>
                )}


                {Number(design.cost.floorCost) > 0 && (
                  <div className="flex justify-between py-0.5 text-sm text-slate-600">
                    <span>Floor placement (Floor {config.floorPlacement})</span>
                    <b>{money(design.cost.floorCost)}</b>
                  </div>
                )}
                {(design.cost.installationCharges || []).map((c, i) => (
                  <div key={i} className="flex justify-between py-0.5 text-sm text-slate-600"><span>{c.name}</span><b>{money(c.price)}</b></div>
                ))}
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-lg">
                  <span className="font-semibold">{(design.cost.gstAmount || 0) > 0.001 ? 'Subtotal (ex-GST)' : 'Total'}</span>
                  <b>{money(design.cost.subtotal ?? design.cost.total)}</b>
                </div>
                <GstSummary cost={design.cost} config={config} onConfig={(p) => s.patch('config', p)} money={money} />
              </>
            )}
            <BuildingBreakdown design={design} money={money} compact />
          </div>
        </div>
        </div>
      </Modal>
      <ShadowReportModal open={Boolean(wantShadow) && sceneReady} mode={wantShadow || 'report'} onClose={() => useStore.getState().set({ shadowReport: false })} design={design} />
    </>
  );
}
