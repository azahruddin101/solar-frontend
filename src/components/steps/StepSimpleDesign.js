'use client';

// One friendly screen for home owners: see the roof in 3D, pick how many panels, done.

import { AlertCircle, Box, Boxes, Building2, CalendarDays, Check, ChevronDown, Cylinder, DoorOpen, Eraser, Fence, FileText, Grid2x2Plus, Grid2x2X, Keyboard, Landmark, Loader2, Minus, Move, Package, Plus, ReceiptText, Sparkles, SquareDashed, Trash2, TreePine, Undo2, Wrench } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SubsidyField } from '../dashboard/DesignDetail';
import { applyMaxLayout, autoGroups, basesCapacity, clearBases, designedBases, maxRoofLayout, packageCap, plantBases, plantedTotal, restorePanels, trimPanelsTo, userBases } from '@/lib/autofill';
import { capFirst } from '@/lib/catalog';
import { formatMoney } from '@/lib/energy';
import { buildingList, mainSection, sectionsOf } from '@/lib/buildings';
import { compassLabel, normalizeAzimuth } from '@/lib/geo';
import { edges } from '@/lib/geometry';
import { baseFit, baseFor, buildDesign, MAX_SUPPORTS, normSection, zonesForSection } from '@/lib/model';
import { sceneApi } from '../scene/Scene3D';
import { floorsOf, restyleRoof, ROOF_STYLES, roofStyleOf, setFloors } from '@/lib/solarModel';
import { SIMPLE_SLUGS, useStore } from '@/lib/store';
import { packagePanelSpec } from '@/lib/useDesign';
import Editor2D from '../editor/Editor2D';
import { cx } from '../ui';
import { Adjust, Stepper, SupportIcon } from './DesignPanel';
import GroupList from './GroupList';
import StringList from './StringList';
import { activeStringPath, allStringColors, dropEmptyStrings, finishString, undoLastPanel } from '@/lib/strings';
import ShadowReportModal from './ShadowReportModal';
import BuildingBreakdown from './BuildingBreakdown';
import { catalogMaterialLineTotal } from '@/lib/pricing';
import { GstSummary } from './GstSummary';
import ChargePicker from '../dashboard/ChargePicker';
import { api } from '@/lib/api';
import { validUntilInput } from '@/lib/validity';
import { NumField, toast } from '../kit';
import { defaultTaxRate, taxName } from '@/lib/tax';

const Scene3D = dynamic(() => import('../scene/Scene3D'), { ssr: false });

/** Before the roof exists: Google's measurement is loading, or Google has no data for this spot. */
function RoofPending() {
  const model = useStore((st) => st.solarModel);
  const back = () => useStore.getState().setStep(0);
  const failed = model.status === 'error';
  return (
    <div className="absolute inset-0 grid place-items-center bg-slate-50 px-6 text-center">
      <div className="max-w-md">
        <span className={cx('mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl', failed ? 'bg-amber-50 text-amber-600' : 'bg-brand-soft text-brand')}>
          {failed ? <AlertCircle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
        </span>
        <h2 className="text-lg font-semibold text-slate-900">{failed ? 'No roof measurement for this spot' : 'Measuring the roof from Google’s 3D data…'}</h2>
        <p className="mt-1 text-sm text-slate-500">{failed ? model.error || 'Google has no roof data here.' : 'The roof faces, their slope and the best panel spots come straight from Google. This takes a few seconds the first time.'}</p>
        {failed && <button type="button" onClick={back} className="mt-6 h-10 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-fg hover:bg-brand-600">Adjust the roof box</button>}
      </div>
    </div>
  );
}
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
const Big = ({ children }) => <h2 className="text-[25px] font-bold leading-tight">{children}</h2>;
// one product of the "my own choice" list: name, the pick, quantity and its price on one line
const TOOLS = ['add-base', 'add-panel', 'remove-panel'];

/** The mouse and keyboard shortcuts that apply on a step, for the shortcuts button: [section, [keys, what]…]. */
function shortcutsFor(stage, view) {
  const list = [
    ['Moving the view', view === '3d'
      ? [['Drag', 'turn the view'], ['Scroll', 'closer / further'], ['Right-drag', 'slide the view'], ['Double-click a spot', 'turn around that spot']]
      : [['Drag', 'slide the plan'], ['Scroll', 'closer / further']]],
  ];
  if (stage === 'building') {
    list.push(['Roof and things on it (Plan view)', [['Click a roof edge', 'make it the low edge'], ['Drag the ridge', 'move it'], ['Drag a thing', 'move it'], ['Drag its corner', 'resize it'], ['Delete', 'remove the selected thing']]]);
    list.push(['Drawing another building', [['Click', 'add a corner'], ['Enter', 'finish'], ['Backspace', 'undo the last corner'], ['Right-click a corner', 'delete it'], ['Esc', 'cancel']]]);
  }
  if (stage === 'panels') {
    list.push(['Tools', [['B', 'add a base'], ['P', 'add a panel'], ['R', 'take a panel off'], ['F', 'fill empty bases / clear all'], ['Esc', 'put the tool away']]]);
    list.push(['The selected block', [['Arrow keys', 'nudge (Shift: 1 m)'], ['[  ]', 'turn 5°'], ['Delete', 'remove it'], ['Alt while dragging', 'no snapping'], ['Shift while turning', '15° steps'], ['Ctrl/⌘ + C, V, D', 'copy, paste, duplicate']]]);
  }
  if (stage === 'strings') list.push(['Your own strings', [['Tap / drag across panels', 'add them in order'], ['Enter or Esc', 'close the string'], ['Backspace', 'take the last panel off']]]);
  list.push(['Always', [['Ctrl/⌘ + Z', 'undo'], ['Ctrl/⌘ + Shift + Z', 'redo']]]);
  return list;
}
const PICK = 'h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900';
const ProductRow = ({ label, children, qty, total, note }) => (
  <div className="px-4 py-3">
    <div className="grid grid-cols-[150px_minmax(0,1fr)_auto_96px] items-center gap-3">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      {children}
      <span className="text-sm text-slate-600">{qty}</span>
      <span className="text-right text-sm font-semibold text-slate-900 tabular-nums">{total}</span>
    </div>
    {note}
  </div>
);

// a fold-out section: closed by default, so a step shows only its main things; `open` turning
// true (e.g. a base was tapped in 3D) opens it
// `tight`: a fold inside another fold keeps less padding, so its content has the room it had before
function Fold({ title, hint, children, open = false, tight = false }) {
  const [isOpen, setOpen] = useState(open);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setOpen(true);
  }
  return (
    <details open={isOpen} onToggle={(e) => setOpen(e.currentTarget.open)} className="group/fold rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-base font-semibold text-slate-900">{title}</span>
          {hint && <span className="block text-sm text-slate-500">{hint}</span>}
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition [[open]>summary>&]:rotate-180" />
      </summary>
      <div className={cx('border-t border-slate-100', tight ? 'px-2 py-3' : 'px-5 py-4')}>{children}</div>
    </details>
  );
}
const Sub = ({ children }) => <p className="mt-1 text-base text-slate-700">{children}</p>;
// what the app has already done on this step, said first: the user only changes it if they want to
const Done = ({ children }) => (
  <p className="flex gap-2.5 rounded-xl bg-emerald-50 px-4 py-3 text-base text-emerald-900">
    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={3} aria-hidden />
    <span>{children}</span>
  </p>
);

const Q = ({ n, children }) => (
  <div className="mb-2 flex items-center gap-2 text-[17px] font-semibold">
    {n > 0 && <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-sm text-white">{n}</span>}
    {children}
  </div>
);

/**
 * The roof made from Google's measurements, in the style the user sees on the house: flat, four
 * slopes, two slopes or Kerala, and how steep. Changing it rebuilds the roof and lays the panels again.
 */
/**
 * The Strings step's bar over the roof: the open string with how many panels it has against what
 * the inverter takes, Undo and Done; with no string open, a nudge to tap a panel.
 */
function StringBar({ design }) {
  const picked = useStore((s) => s.electrical.strings || []);
  const activeId = useStore((s) => s.activeStringId);
  const el = design.electrical || {};
  const ps = picked.find((x) => x.id === activeId);
  const shown = ps && (el.strings || []).find((x) => x.id === ps.id);
  const n = ps?.modules?.length || 0;
  const { minLen = 0, maxLen = 0 } = el;
  const autoLeft = (el.strings || []).filter((x) => !x.manual).reduce((a, x) => a + (x.count || 0), 0);
  const stop = (e) => e.stopPropagation();
  if (!ps) {
    // every string automatic: nothing to pick until the user asks to make their own
    if (!picked.length) return null;
    return (
      <div onPointerDown={stop} className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-white px-5 py-3 text-base text-slate-700 shadow-xl">
        👆 Tap a panel to start string <b>{picked.length + 1}</b>
        {autoLeft > 0 && <span className="text-sm text-slate-500">· {autoLeft} panels left on automatic</span>}
      </div>
    );
  }
  const color = shown?.color || '#64748b';
  const name = ps.name || shown?.name || `String ${picked.indexOf(ps) + 1}`;
  const status = n === 0 ? 'Tap or drag across panels' : maxLen && n >= maxLen ? 'Full: the next panel starts a new string' : minLen && n < minLen ? `${minLen - n} more needed` : 'Good length';
  const ok = n >= minLen && (!maxLen || n <= maxLen);
  return (
    <div onPointerDown={stop} className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-white py-2.5 pl-4 pr-2.5 shadow-xl">
      <span className="h-5 w-5 shrink-0 rounded-full border-2 border-white shadow" style={{ background: color }} />
      <div className="min-w-[170px]">
        <div className="text-base font-bold text-slate-900">{name} · {n} panel{n === 1 ? '' : 's'}</div>
        {maxLen > 0 && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
              <div className={cx('h-full rounded-full transition-all', ok ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${Math.min(100, (n / maxLen) * 100)}%` }} />
            </div>
            <span className={cx('text-xs', n > 0 && !ok ? 'text-amber-700' : 'text-slate-500')}>{status}</span>
          </div>
        )}
      </div>
      <span className="hidden text-xs text-slate-400 xl:block">{minLen}–{maxLen} per string</span>
      <button type="button" title="Take the last panel off (Backspace)" disabled={!n} onClick={undoLastPanel} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
        <Undo2 className="h-4 w-4" /> Undo
      </button>
      <button type="button" title="Close this string; tap a panel to start the next (Enter)" onClick={finishString} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg hover:bg-brand-600">
        <Check className="h-4 w-4" /> Done
      </button>
    </div>
  );
}

// `part`: 'main' = shape, floors (and the low side of a single slope); 'slope' = the slope slider alone
function RoofShape({ section, part = 'main' }) {
  const style = roofStyleOf(section);
  const floors = Math.min(5, floorsOf(section));
  const [pitch, setPitch] = useState(section.pitch || section.auto?.pitch || 25);
  const apply = (next, p = pitch) => {
    const { sections, set } = useStore.getState();
    set({ sections: sections.map((sec) => (sec.id === section.id ? restyleRoof(sec, next, p) : sec)), layoutKey: '' });
  };
  // a single slope can fall towards any side of the house: one choice per compass direction, the longest such wall
  const facings = useMemo(() => {
    const by = {};
    for (const e of edges(normSection({ ...section, roofType: 'flat' }).poly)) {
      if (e.length < 1.5) continue;
      const az = Math.round(normalizeAzimuth((Math.atan2(e.outward.x, e.outward.y) * 180) / Math.PI));
      const label = compassLabel(az);
      if (!by[label] || e.length > by[label].len) by[label] = { az, len: e.length };
    }
    return Object.values(by).map((f) => f.az).sort((a, b) => a - b);
  }, [section]);
  const setLowSide = (slopeAz) => {
    const { sections, set } = useStore.getState();
    set({ sections: sections.map((sec) => (sec.id === section.id ? { ...sec, slopeAz } : sec)), layoutKey: '' });
  };
  if (part === 'slope') {
    if (style === 'flat') return null;
    return (
      <label className="block text-sm font-medium text-slate-700">
        Roof slope · <b className="text-slate-900">{pitch}°</b>
        <input type="range" min={10} max={45} step={1} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} onPointerUp={() => apply(style, pitch)} onKeyUp={() => apply(style, pitch)} className="mt-2 w-full accent-brand" />
        <span className="mt-1 flex justify-between text-xs text-slate-500"><span>Gentle</span><span>Steep</span></span>
      </label>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">If it does not match the house, pick the right shape.</p>
      <div role="radiogroup" aria-label="Roof shape" className="grid grid-cols-2 gap-2">
        {ROOF_STYLES.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={style === r.id}
            onClick={() => style !== r.id && apply(r.id)}
            className={cx('h-11 rounded-lg border-2 text-base font-semibold', style === r.id ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}
          >
            {r.label}
            {section.auto?.style === r.id && <span className="ml-1.5 text-xs font-medium text-slate-500">(found)</span>}
          </button>
        ))}
      </div>
      <div>
        <div className="mb-2 text-sm font-medium text-slate-700">How many floors?</div>
        <div role="radiogroup" aria-label="Floors" className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={floors === n}
              onClick={() => floors !== n && useStore.getState().set({ sections: useStore.getState().sections.map((sec) => (sec.id === section.id ? setFloors(sec, n) : sec)), layoutKey: '' })}
              className={cx('h-10 rounded-lg border-2 text-base font-semibold', floors === n ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}
            >
              {n === 5 ? '5+' : n}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {style === 'flat' ? 'Roof' : 'Walls up to the roof edge'} at {section.height.toFixed(1)} m ({Math.round(section.height * 3.28084)} ft)
          {!section.auto?.floors && ' · from the satellite measurements'}
        </p>
      </div>
      {style === 'shed' && facings.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Which side is the low edge?</div>
          <Chips value={section.slopeAz ?? -1} options={facings.map((az) => [az, `${compassLabel(az)} side`])} onChange={setLowSide} />
          <p className="mt-1.5 text-xs text-slate-500">The roof falls towards this wall. On the plan view, the low edge is marked in orange and can be clicked too.</p>
        </div>
      )}
    </div>
  );
}

// things on the roof the satellite measurements miss: the user marks each on the plan view
const ROOF_THINGS = [
  { key: 'tank', icon: Cylinder, label: 'Water tank', preset: { name: 'Water tank', w: 1.5, d: 1.5, h: 1.8 } },
  { key: 'stair', icon: DoorOpen, label: 'Staircase room', preset: { name: 'Staircase room', w: 3, d: 3, h: 2.7 } },
  { key: 'other', icon: Package, label: 'AC / dish / other', preset: { name: 'Other', w: 1, d: 1, h: 1 } },
  { key: 'tree', icon: TreePine, label: 'Tree near the roof' },
];

/** Obstacles on or near the roof: pick one, then tap where it is (3D or plan). Panels keep clear. */
function RoofObstacles() {
  const s = useStore();
  const armed = s.tool === 'mark-area' ? s.pendingKey : null;
  const things = s.objects.filter((o) => o.type === 'block' || o.type === 'tree');
  const pick = (it) => {
    if (armed === it.key) return s.set({ tool: 'select', pendingKey: null, pendingBlock: null });
    s.set({ tool: 'mark-area', pendingKey: it.key, pendingBlock: it.preset || null, selectedId: null });
  };
  const heights = (o) => (o.type === 'tree' ? [[4, '13 ft'], [6, '20 ft'], [9, '30 ft'], [12, '40 ft']] : [[1, '3 ft'], [1.8, '6 ft'], [2.7, '9 ft · one floor'], [5.4, '18 ft · two floors']]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{armed ? <b className="text-brand-ink">Now tap the spot on the roof where it is.</b> : 'Anything on the roof the satellite missed? Pick it, then tap where it is.'} A standard-size one appears and panels are kept away from it. Wrong size? On the Plan view, drag its corner.</p>
      <div className="grid grid-cols-2 gap-2">
        {ROOF_THINGS.map((it) => (
          <button key={it.key} type="button" onClick={() => pick(it)} className={cx('flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left text-sm font-semibold', armed === it.key ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>
            <it.icon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden /> {it.label}
          </button>
        ))}
      </div>
      {things.length > 0 && (
        <div className="space-y-2">
          {things.map((o) => (
            <div key={o.id} className={cx('rounded-lg border-2 p-3', o.id === s.selectedId ? 'border-brand' : 'border-slate-200')} onClick={() => s.set({ selectedId: o.id, tool: 'select' })}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">{o.type === 'tree' ? 'Tree' : o.name}</div>
                <span className="ml-auto text-xs text-slate-500">{o.type === 'tree' ? `${(o.r * 2 * FT).toFixed(0)} ft wide` : `${(o.w * FT).toFixed(0)} × ${(o.d * FT).toFixed(0)} ft`}</span>
                <button type="button" aria-label="Remove" onClick={(e) => { e.stopPropagation(); s.remove(o.id); }} className="grid h-8 w-8 place-items-center rounded-full text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {heights(o).map(([v, l]) => (
                  <button key={l} type="button" onClick={(e) => { e.stopPropagation(); s.updateObject(o.id, { h: v }); }} className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', Math.abs((o.h || 0) - v) < 0.01 ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>{l}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The design screen (3D / plan view + sidebar), one step of the flow at a time (`stage`):
 * 'building' — roof shape, floors, obstacles · 'panels' — size, structure, layout ·
 * 'products' — panel, pole, materials and price · 'proposal' — the summary and the PDF (`actions`).
 */
export default function StepSimpleDesign({ design, stage = 'panels', actions = [], proposalOnly: proposalOnlyProp = false, onDone = null, headerActions = null }) {
  const s = useStore();
  const { config, objects, sections, finance } = s;
  const [chosenView, setView] = useState('3d');
  const [help, setHelp] = useState(false);
  const [page, setPage] = useState(0);
  // a campus has several buildings (Google found more than one house in the marked area, or the user
  // added one by drawing its outline): the building step edits one at a time
  const buildingsHere = buildingList(s.buildings).filter((b) => sectionsOf(sections, s.buildings, b.id).length);
  const building = buildingsHere.find((b) => b.id === s.buildingId) || buildingsHere[0] || null;
  const pickBuilding = (id) => {
    s.set({ buildingId: id, selectedId: null, tool: 'select', pendingKey: null });
    sceneApi.focusBuilding?.(id);
  };
  // another building on the site: its roof outline is clicked corner by corner on the plan view
  const addingBuilding = s.tool === 'draw-section' && s.pendingKey === 'building';
  const toggleAddBuilding = () => {
    if (addingBuilding) return s.set({ tool: 'select', pendingKey: null });
    setView('2d');
    s.set({ tool: 'draw-section', pendingKey: 'building', pendingBlock: null, selectedId: null });
  };
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  // the main roof of the chosen building: made from Google's measurements or drawn here; its shape can be changed
  const roofSec = !s.readOnly && building ? mainSection(sections, s.buildings, building.id) : null;
  // "Edit proposal" (?edit=proposal): straight to materials, charges and subsidy — the roof layout stays as designed
  const editParam = useSearchParams().get('edit');
  const proposalOnly = proposalOnlyProp || editParam === 'proposal';
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

  const catalogReady = Boolean(s.catalog);
  const layoutKey = JSON.stringify([sections, objects.filter((o) => o.type === 'tree' || o.type === 'block')]);

  const obstacleKey = JSON.stringify(objects.filter((o) => o.type === 'tree' || o.type === 'block'));
  const { azimuthFor, buildings: designBuildings } = design;
  // a tool never outlives its step, and Escape always puts it away; the Strings step keeps the
  // string tool out the whole time (tap or drag across panels)
  useEffect(() => {
    const st = useStore.getState();
    const tool = stage === 'strings' && !st.readOnly ? 'string' : 'select';
    if (st.tool !== tool || st.activeStringId) st.set({ tool, pendingKey: null, pendingBlock: null, activeStringId: null });
    // a string started and left without a panel does not stay behind
    if (!st.readOnly) dropEmptyStrings(design.electrical);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the step changes
  }, [stage]);
  useEffect(() => {
    // keyboard: Esc puts a tool away; on the Panels step B / P / R arm the tools, F fills the
    // bases, arrows nudge the selected base (Shift = 1 m), [ ] turn it,
    // Delete removes it. Nothing fires while typing in a field.
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (e.metaKey || e.ctrlKey || e.altKey || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      const st = useStore.getState();
      const off = () => st.set({ tool: 'select', pendingKey: null, pendingBlock: null, activeStringId: null });
      if (stage === 'strings') {
        // Esc / Enter close the open string, Backspace takes its last panel off, N starts the next
        if (st.readOnly) return;
        if (e.key === 'Escape' || e.key === 'Enter') return finishString();
        if (e.key === 'Backspace') {
          e.preventDefault();
          return undoLastPanel();
        }
        if (e.key.toLowerCase() === 'n') return finishString();
        return;
      }
      if (e.key === 'Escape') {
        if (st.tool !== 'select' || st.activeStringId) off();
        return;
      }
      if (stage !== 'panels' || st.readOnly) return;
      const arm = (tool) => st.set(st.tool === tool ? { tool: 'select' } : { tool, selectedId: null });
      const k = e.key.toLowerCase();
      if (k === 'b') return arm('add-base');
      if (k === 'p') return arm('add-panel');
      if (k === 'r') return arm('remove-panel');
      if (k === 'f') return document.getElementById('fill-tool')?.click();
      const o = st.objects.find((x) => x.id === st.selectedId && x.type === 'array');
      if (!o) return;
      const step = e.shiftKey ? 1 : 0.1;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (move) {
        e.preventDefault();
        return st.updateObject(o.id, { x: o.x + move[0], y: o.y + move[1], auto: false });
      }
      if (e.key === '[' || e.key === ']') return st.updateObject(o.id, { azimuth: (o.azimuth + (e.key === ']' ? 5 : -5) + 360) % 360, auto: false });
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.remove(o.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);
  const bases = userBases(objects);
  const designed = designedBases(objects).length > 0; // the user placed or changed a base: sizing plants on the bases
  const emptyBases = bases.filter((o) => o.planted === false);
  const baseKey = JSON.stringify([designed, bases.map((o) => [o.w, o.len, o.orientation])]);
  // how many panels the whole roof takes (auto layout), whatever bases are drawn
  const roofFit = useMemo(() => {
    const keep = JSON.parse(obstacleKey);
    const zones = design.sections.flatMap((sec) => zonesForSection(sec, config, azimuthFor(sec), design.lat, 'fit'));
    return buildDesign({ sections, buildings: designBuildings, objects: [...keep, ...zones], config: { ...config, maxPanels: 0 }, lat: design.lat, spec: design.spec }).modules.length;
  }, [sections, config, design.sections, designBuildings, design.lat, azimuthFor, design.spec, obstacleKey]);
  // "Maximum panels": the most panels the roof physically takes (see maxRoofLayout); worked out on
  // the Panels step only, and again only when the roof, obstacles, panel or pole heights change
  const maxPlan = useMemo(() => {
    if ((stage !== 'panels' && stage !== 'system') || !design.sections.length) return null; // Package step too: a package's panels may need the roof edge to edge
    return maxRoofLayout({ sections: design.sections, buildings: designBuildings, objects: JSON.parse(obstacleKey), config, lat: design.lat, spec: design.spec, azimuthFor });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config/azimuthFor change on every edit; only these settings move the layout
  }, [stage, design.sections, designBuildings, obstacleKey, design.lat, design.spec, config.tilt, config.frontLeg, config.azimuthMode, config.azimuth]);
  const maxRoof = maxPlan?.count || 0;
  // panels go on the designed bases only (when the user drew them), otherwise anywhere on the roof
  // ONE limit for the whole step: panels may go up to the roof edge, so the roof holds what the
  // edge-to-edge layout holds (never less than the usual layout with its edge gap)
  const roofMax = Math.max(roofFit, maxRoof);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- baseKey stands for the bases (a new array each render)
  const maxFit = useMemo(() => (designed ? basesCapacity(bases, design.spec) : roofMax), [designed, roofMax, design.spec, baseKey]);
  // `v` panels on the roof (0 = as many as it holds): the usual layout while that has room, the
  // edge-to-edge one beyond it. Drawn bases are planted on instead (autoGroups does that).
  const layTo = (v, opts = {}) => {
    if (!designed && maxPlan?.count >= roofFit && maxPlan.count > 0 && (v <= 0 || v > roofFit)) return applyMaxLayout(maxPlan, v);
    autoGroups(design, v, opts);
  };
  // a fresh layout of `n` panels (0 = fill) for design `d`, whatever bases are there now; pricing untouched.
  // Edge to edge when the usual layout has no room for them (only when `d` has the panel maxPlan was made for).
  const layFresh = (d, n) => {
    const samePanel = d.spec.length === design.spec.length && d.spec.width === design.spec.width;
    if (samePanel && maxPlan?.count > roofFit && (n <= 0 || n > roofFit)) return applyMaxLayout(maxPlan, n);
    autoGroups(d, n > 0 ? Math.min(n, Math.max(1, roofFit)) : 0, { atLeast: n > 0, keepPricing: true, fresh: true });
  };
  const pkgCap = packageCap();
  const inPackage = config.pricingMode === 'package';
  const full = totals.count >= Math.min(Math.max(maxFit, 1), pkgCap ?? Infinity);
  const count = totals.count;
  const setCount = (n) => {
    // with a package: − / + move within the package's panels and the price stays the package's
    const cap = packageCap();
    if (cap && Math.round(n) > cap) return toast.error(`This package has ${cap} panels. For more, switch to Custom on the Package step.`);
    const v = Math.max(1, Math.min(Math.max(maxFit, 1), cap ?? Infinity, Math.round(n)));
    const kw = ((v * spec.watts) / 1000).toFixed(2);
    s.patch('config', {
      ...(cap ? {} : { pricingMode: 'custom', sizeMode: v >= maxFit ? 'fill' : 'kw' }),
      sizeBy: 'kw',
      sizeKw: kw,
      sizeBill: String(Math.floor(v * perPanelMonth * tariff)),
    });
    layTo(v >= maxFit && !cap ? 0 : v, { keepPricing: Boolean(cap) });
  };
  // the most panels the roof takes: a fresh layout over the whole roof (also when bases were drawn)
  const fillMax = () => {
    if (!maxPlan?.count) return;
    s.patch('config', { pricingMode: 'custom', sizeMode: 'fill', sizeBy: 'kw', sizeValue: undefined, sizeKw: ((maxRoof * spec.watts) / 1000).toFixed(2), sizeBill: String(Math.floor(maxRoof * perPanelMonth * tariff)) });
    applyMaxLayout(maxPlan);
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
    // kW is typed and stored to two decimals (17 × 575 W shows as 9.78): that rounding is not one more panel
    return mode === 'kw' ? Math.ceil((n * 1000) / spec.watts - 0.01) : Math.ceil(n / tariff / perPanelMonth);
  };
  const needPanels = panelsFor(sizeBy, sizeValue);
  // the one question on the Panels step: fill the roof, match the bill, or a typed size
  const sizeMode = ['fill', 'bill', 'kw'].includes(config.sizeMode) ? config.sizeMode : amount > 0 && !(count >= maxFit && !designed) ? sizeBy : 'fill';

  // place panels automatically the first time (and whenever the roof changes)
  useEffect(() => {
    const st = useStore.getState();
    // wait for the company's catalog: laying out with the placeholder panel gives groups sized for
    // the wrong module, which no longer fit once the real one arrives
    if (!design.sections.length || !catalogReady) return;
    if (st.layoutKey !== layoutKey || !st.objects.some((o) => o.type === 'array')) {
      // the requested size (bill or kW) decides how many panels go on — best roof spots first, as
      // Google's own sizing does; with no size asked for, the roof is filled
      const asked = panelsFor(sizeBy, sizeValue);
      if (asked > 0) autoGroups(design, asked, { atLeast: true, keepPricing: true });
      else autoGroups(design, 0, { keepPricing: true });
      st.set({ layoutKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, design.sections.length, catalogReady]);
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
    s.patch('config', { sizeBy: mode, sizeMode: mode, sizeValue: undefined, sizeBill: mode === 'bill' ? v : other, sizeKw: mode === 'kw' ? v : other, pricingMode: 'custom' });
    const n = panelsFor(mode, v);
    settle.current = 2;
    layTo(n > 0 && n < maxFit ? Math.max(1, n) : 0, { atLeast: true });
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

    // the package never moves the user's panels: only an empty roof is laid out for it; with more panels than the
    // package has, the extra ones come off (the last placed first); with fewer, the user places the rest
    const placedNow = plantedTotal(useStore.getState().objects, design.spec);
    // the panel the roof was laid out with until now: the previous package's, or the one chosen in Custom
    const custom = design.catalog.panels.find((p) => p.id === config.specId) || design.catalog.panels[0];
    const before = config.packageLaidOut ? packagePanelSpec(design.catalog, (design.catalog.packages || []).find((p) => p.id === config.packageLaidOut), custom) : custom;
    const now = packagePanelSpec(design.catalog, pkg, custom);
    const resized = Boolean(before && now) && (before.length !== now.length || before.width !== now.width);
    const size = (k) => ({ sizeBy: 'kw', sizeValue: undefined, sizeKw: pkgKw > 0 ? String(pkgKw) : ((k * panelWatts) / 1000).toFixed(2), sizeBill: String(Math.floor(k * perPanelMonth * tariff)) });
    s.patch('config', { packageId: pkgId, packageLaidOut: pkgId, ...(n > 0 ? size(n) : {}) });
    if (!(n > 0)) return;
    if (placedNow === 0) {
      settle.current = 2;
      layFresh({ ...design, spec: now }, n);
    } else if (resized) {
      // a panel of another size: the old layout was made for the other panel, so the package's panels are
      // laid out again
      settle.current = 2;
      // (`design` here may still carry the previous panel: the new one is passed explicitly)
      layFresh({ ...design, spec: now }, n);
    } else if (placedNow > n) trimPanelsTo(n, design.spec);
    else if (placedNow < n) restorePanels(n, design.spec); // panels a smaller package took off come back
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
      if (config.packageLaidOut) {
        // back to Custom from a package with a panel of another size: lay out again for the Custom panel
        const was = packagePanelSpec(design.catalog, (design.catalog.packages || []).find((p) => p.id === config.packageLaidOut), spec);
        if (was.length !== spec.length || was.width !== spec.width) setTimeout(() => document.getElementById('rearrange')?.click(), 50);
        s.patch('config', { packageLaidOut: '' }); // coming back re-sizes to the package
      }
      return;
    }
    const pkgId = config.packageId || design.catalog.packages?.[0]?.id || '';
    if (!pkgId || !pkgsAvailable) return;
    // the package was laid out already (saved with the design): keep the panels the user placed since
    if (config.packageLaidOut === pkgId) return;
    // Only fire once per (pricingMode + packageId + packages-loaded) combination
    const key = `${pkgId}:${pkgsAvailable}`;
    if (pkgApplied.current === key) return;
    pkgApplied.current = key;
    pickPackage(pkgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.pricingMode, config.packageId, pkgsAvailable]);

  // The layout always fits the panel in use. Every base is a whole number of panel slots, so its
  // footprint equals that of its rows × columns of panels; when it does not, the panel changed (another
  // package, Package ⇄ Custom, or a design saved with the other panel) and the old bases hold too few
  // panels or none. The roof is then laid out again for this panel, and the user is told (Undo restores).
  const specKey = `${spec.length}x${spec.width}`;
  const healed = useRef('');
  useEffect(() => {
    if (!catalogReady || s.readOnly || !design.sections.length) return;
    const stale = useStore.getState().objects.some((o) => {
      if (o.type !== 'array' || !(o.w > 0) || !(o.len > 0)) return false;
      // the slots this panel gives on the base must fill it exactly (2 cm of play)
      const fit = baseFit(o, spec);
      if (!fit.rows || !fit.cols) return true;
      const size = baseFor(fit.rows, fit.cols, o, spec);
      return Math.abs(size.w - o.w) > 0.02 || Math.abs(size.len - o.len) > 0.02;
    });
    if (!stale || healed.current === specKey) return; // once per panel size: never a loop
    healed.current = specKey;
    const cap = packageCap();
    const want = cap || (needPanels > 0 ? needPanels : 0);
    settle.current = 0;
    layFresh(design, want);
    toast.success(`Panels laid out again for the ${spec.watts} W panel. Undo brings the old layout back.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, catalogReady, objects, config.pricingMode]);

  const switchTo = (mode) => {
    if (mode === sizeBy) return;
    const current = sizeBy === 'kw' ? { sizeKw: sizeValue } : { sizeBill: sizeValue };
    const shown = (mode === 'kw' ? config.sizeKw : config.sizeBill) || equivalent(sizeBy, sizeValue);
    s.patch('config', { sizeBy: mode, sizeValue: undefined, ...current, [mode === 'kw' ? 'sizeKw' : 'sizeBill']: shown });
  };
  const pickSizeMode = (mode) => {
    if (mode === 'fill') {
      if (maxPlan?.count) return fillMax(); // a fresh layout, edge to edge
      s.patch('config', { sizeMode: 'fill' });
      return layTo(0);
    }
    s.patch('config', { sizeMode: mode });
    switchTo(mode);
  };
  // The yield per panel is re-estimated once the new layout is known (shading changes with it), which
  // can raise the number of panels the bill needs. Top up after a sizing change — never on manual edits.
  useEffect(() => {
    if (!settle.current) return;
    const target = Math.min(maxFit, needPanels);
    if (needPanels > 0 && target > count) {
      settle.current -= 1;
      layTo(target >= maxFit ? 0 : target, { atLeast: true, keepPricing: true });
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
  // every base is set by its front and back pole heights; the tilt is what the two heights give.
  // Designs saved with a tilt show the back height that tilt gives until a height is changed.
  const backShown = config.heightMode === 'heights' && config.backLeg >= 0 ? config.backLeg : Math.round(backLeg * 20) / 20;
  const tiltOf = (front, back) => (slopeLen > 0 ? Math.max(0, Math.asin(Math.max(-0.99, Math.min(0.99, (back - front) / slopeLen))) * (180 / Math.PI)) : config.tilt);
  const tiltShown = config.heightMode === 'heights' ? tiltOf(config.frontLeg, backShown) : config.tilt;
  // the design's tilt follows the heights too, so auto layouts and the yield use the same slope
  const setHeights = (frontLeg, back) => applyAll({ frontLeg, backLeg: back, heightMode: 'heights', tilt: Math.round(tiltOf(frontLeg, back) * 10) / 10 });
  // bases with panels planted one above the other: they are asked about a support between the rows
  const poleTables = design.tables.filter((t) => t.valid && !t.flush && t.kind !== 'zone');
  const supportsAll = Math.min(MAX_SUPPORTS, config.midSupport === true ? 1 : Number(config.midSupport) || 0);
  // vertical supports: the setting, or what the first base on poles got automatically
  const sideAll = config.midSupportV != null ? Math.min(MAX_SUPPORTS, Number(config.midSupportV) || 0) : (poleTables[0]?.vSupports ?? 0);

  const card = (on) => cx('w-full rounded-lg border-2 px-4 py-3 text-left transition', on ? 'border-brand bg-brand-soft' : 'border-slate-200 hover:border-slate-300');
  const TITLES = ['Consumption', 'Panel', 'Structure', 'Proposal'];

  // one colour per block of the pricing form: a tinted header band with an icon chip
  const band = (tone, Icon, title, hint) => {
    const t = {
      violet: ['bg-violet-50 border-violet-100', 'bg-violet-600', 'text-violet-950'],
      brand: ['bg-brand-soft border-brand/15', 'bg-brand', 'text-brand-ink'],
      sky: ['bg-sky-50 border-sky-100', 'bg-sky-600', 'text-sky-950'],
      amber: ['bg-amber-50 border-amber-100', 'bg-amber-500', 'text-amber-950'],
      emerald: ['bg-emerald-50 border-emerald-100', 'bg-emerald-600', 'text-emerald-950'],
    }[tone];
    return (
      <div className={cx('-mx-5 -mt-5 mb-4 flex items-center justify-between gap-3 rounded-t-xl border-b px-5 py-3', t[0])}>
        <div className="flex items-center gap-2.5">
          <span className={cx('grid h-8 w-8 place-items-center rounded-lg text-white shadow-sm', t[1])}><Icon className="h-4 w-4" /></span>
          <h3 className={cx('text-base font-semibold', t[2])}>{title}</h3>
        </div>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
    );
  };
  const subhead = (tone, Icon, title) => (
    <div className={cx('mt-6 mb-1 flex items-center gap-2 border-t border-slate-100 pt-5 text-sm font-semibold', tone)}>
      <Icon className="h-4 w-4" />{title}
    </div>
  );

  // the pricing form, in pieces: the Products step shows the main ones and folds the rest under
  // "More options"; "Edit proposal" shows them all
  const subsidyCard = s.designId ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
            {band('violet', Landmark, 'Subsidy', 'Optional')}
            <SubsidyField design={{ id: s.designId, subsidy: s.subsidy }} money={money} onChange={(subsidy) => s.set({ subsidy })} />
          </div>
  ) : null;
  const pricingBlock = (
    <>
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
                    // switching to package mode: the effect watching pricingMode applies the package (with the
                    // package's own panel, which is only known after this render)
                    s.patch('config', { pricingMode: mode });
                  }}
                  className={cx(
                    'h-10 rounded-md text-[15px] font-semibold transition',
                    (config.pricingMode || 'custom') === mode
                      ? 'bg-brand text-brand-fg shadow-sm'
                      : 'text-slate-700 hover:bg-white/70 hover:text-slate-900',
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
    </>
  );
  const floorBlock = (
    <>
          {/* Floor Placement Surcharge */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Floor placement</span>
              {Number(config.floorPlacement || 0) === 0 ? (
                <span className="text-sm text-emerald-600 font-medium">Ground ({money(0)})</span>
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
    </>
  );
  const termsBlock = (
    <>
          {subhead('text-sky-700', CalendarDays, 'Proposal terms')}
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
    </>
  );
  const chargesBlock = (
    <>
          {subhead('text-amber-700', Wrench, 'Installation charges')}
          <ChargePicker value={config.installationCharges} onChange={(installationCharges) => s.patch('config', { installationCharges })} currency={finance.currency} />
    </>
  );
  const bosBlock = (
    <>
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
                                gstPercent: p ? (Number(p.gstPercent) >= 0 ? Number(p.gstPercent) : defaultTaxRate()) : undefined,
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
                              {taxName()} % <span className="text-slate-400">(on unit price)</span>
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
    </>
  );
  const costBody = (
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
                  <span className="font-semibold">{(design.cost.gstAmount || 0) > 0.001 ? `Subtotal (before ${taxName()})` : 'Total'}</span>
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
                    <span title="Poles, rafters, purlins and bracing, all in the pole section">Structure · {structure.columns} poles · {Math.round(design.cost.pillarFt)} ft</span>
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
                        <b>{money(m.baseTotal ?? m.total)}</b>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="flex justify-between py-0.5">
                    <span>Standard inverter, wiring &amp; installation</span>
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
                  <span className="font-semibold">{(design.cost.gstAmount || 0) > 0.001 ? `Subtotal (before ${taxName()})` : 'Total'}</span>
                  <b>{money(design.cost.subtotal ?? design.cost.total)}</b>
                </div>
                <GstSummary cost={design.cost} config={config} onConfig={(p) => s.patch('config', p)} money={money} />
              </>
            )}
            <BuildingBreakdown design={design} money={money} compact />
          </div>
  );
  const detailsBody = (
    <div className="space-y-5 text-[15px] text-slate-700">
      {subsidyCard}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {band('brand', Boxes, 'Materials & terms', config.pricingMode === 'package' ? 'Package pricing' : 'Custom pricing')}
        <div className="space-y-4">
          {pricingBlock}
          {floorBlock}
          {termsBlock}
          {chargesBlock}
          {bosBlock}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {band('emerald', ReceiptText, 'Cost breakdown', 'Updates as you edit')}
        {costBody}
      </div>
    </div>
  );

  // the Products step: package or own choice
  const isPkg = config.pricingMode === 'package';
  const pkgs = design.catalog.packages || [];
  const chosenPkg = design.cost.package?.id || config.packageId || '';
  // a package's panel count: the quantity of its panel line
  const pkgPanels = (pkg) => {
    const it = pkg?.items?.find((x) => x.itemType === 'panel' || x.name?.toLowerCase().includes('panel'));
    return Number(it?.qty) || 0;
  };
  const want = isPkg ? pkgPanels(design.cost.package) : 0;
  const byBrand = brands.map((b) => [b, design.catalog.panels.filter((p) => brandOf(p) === b).sort((a, c) => a.watts - c.watts)]);

  // the products step gets a wider sidebar (package cards, prices)
  const sideW = stage === 'products' ? 'min(780px, 55vw)' : '430px';
  // the sidebar and the 3D area move together, with one timing, so the edge between them glides
  const glide = '340ms cubic-bezier(0.22, 1, 0.36, 1)';

  if (!sections.length && !proposalOnly) return <RoofPending />;

  // "Edit proposal": only the pricing — no 3D scene or layout tools
  if (proposalOnly) {
    return (
      <div className={onDone ? '' : 'absolute inset-0 overflow-y-auto bg-slate-50'}>
        <div className={onDone ? '' : 'mx-auto max-w-3xl px-5 py-8'}>
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Edit proposal</h2>
              <p className="text-sm text-slate-500">Materials, charges, {taxName()} and subsidy. The roof design stays as it is.</p>
            </div>
            <div className="flex items-center gap-2">
              {headerActions}
              <button type="button" onClick={() => { if (onDone) onDone(); else window.location.href = `/dashboard/designs/${s.designId}`; }} className="h-10 rounded-lg bg-brand px-5 text-base font-semibold text-brand-fg hover:bg-brand-600">Done</button>
            </div>
          </div>
          <div>{detailsBody}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ right: sideW, transition: `right ${glide}` }}>
        {view === '3d' ? <Scene3D design={design} /> : <Editor2D design={design} slopeEdit={stage === 'building'} stringColors={s.tool === 'string' ? allStringColors(design.electrical) : null} stringPath={activeStringPath(design, s.activeStringId, s.tool)} />}
        <div className="absolute left-4 top-4 flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex rounded-full bg-white p-1 shadow-lg">
            {[['3d', Box, '3D'], ['2d', Move, 'Plan view']].map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => { if (view === '3d' && k !== '3d') s.set({ snapshot: sceneApi.capture?.() || s.snapshot }); setView(k); }} className={cx('flex items-center gap-1.5 rounded-full px-4 py-2 text-base font-medium', view === k ? 'bg-slate-900 text-white' : 'text-slate-600')}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {/* everything a mouse or keyboard can also do here, in one place */}
          <div className="relative">
            <button type="button" title="Mouse and keyboard shortcuts" aria-label="Mouse and keyboard shortcuts" aria-expanded={help} onClick={() => setHelp((v) => !v)} className={cx('grid h-10 w-10 place-items-center rounded-full shadow-lg', help ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:text-slate-900')}><Keyboard className="h-5 w-5" /></button>
            {help && (
              <div className="absolute left-0 top-12 z-30 w-[340px] rounded-xl bg-white p-4 text-sm text-slate-700 shadow-2xl ring-1 ring-slate-900/10">
                {shortcutsFor(stage, view).map(([title, rows]) => (
                  <div key={title} className="mb-3 last:mb-0">
                    <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</div>
                    {rows.map(([keys, what]) => (
                      <div key={keys} className="flex justify-between gap-3 py-0.5"><span className="font-semibold text-slate-900">{keys}</span><span className="text-right text-slate-600">{what}</span></div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {view === '2d' && (
          <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-slate-900/85 px-5 py-2 text-base text-white shadow-lg">
            {s.tool === 'draw-section'
              ? 'Click each corner of the new building’s roof on the picture, then press Finish'
              : s.tool === 'mark-area'
              ? `Tap where the ${s.pendingKey === 'tree' ? 'tree' : (s.pendingBlock?.name || 'object').toLowerCase()} is, or press and drag across it`
              : s.tool === 'string' ? ((s.electrical.strings || []).length ? 'Tap panels in wiring order, or press and drag across them · drag on empty roof to move the plan' : 'The colours show which panels are wired together')
              : s.tool === 'add-panel' ? 'Tap a slot on a base to put a panel there (tap the button again to stop)' : s.tool === 'remove-panel' ? 'Tap a panel to take it off (tap the button again to stop)' : s.tool === 'add-base' ? 'Press and drag on the roof to draw the base · then plant panels on it' : s.tool === 'add-array' ? 'Tap on the roof where you want panels' : stage === 'building' ? 'Drag an obstacle to move it · pull its corner to resize' : 'Drag panels to move · pull the ⤡ corner to add or remove panels · orange dot turns them'}
          </div>
        )}
        {view === '2d' && s.tool === 'draw-section' && (
          <div className="absolute bottom-6 right-6 flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => key('Backspace')} className="h-12 rounded-md bg-white px-5 text-sm font-semibold shadow-lg hover:bg-slate-50">Undo last point</button>
            <button type="button" onClick={() => key('Escape')} className="h-12 rounded-md bg-white px-5 text-sm font-semibold shadow-lg hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={() => key('Enter')} className="h-12 rounded-md bg-brand px-6 text-sm font-semibold text-brand-fg shadow-lg hover:bg-brand-600">Finish</button>
          </div>
        )}
        {/* {view === '3d' && <div className="pointer-events-none absolute left-1/2 top-6 hidden -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 text-[13px] text-white/85 backdrop-blur-sm lg:block">{s.tool === 'string' ? 'Tap panels in wiring order, or press and drag across them · drag off the panels to orbit' : 'Drag to orbit · scroll to zoom · click a panel group for details, drag it to move'}</div>} */}
        {stage === 'strings' && s.tool === 'string' && <StringBar design={design} />}
      </div>

      <aside className="absolute inset-y-0 right-0 flex flex-col border-l border-slate-200 bg-white" style={{ width: sideW, transition: `width ${glide}` }}>
        {/* each step's sidebar slides in softly (a new key also starts it at the top) */}
        <div key={stage} className="min-h-0 flex-1 overflow-y-auto" style={{ animation: 'step-in 300ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
          {stage === 'building' && (
            <div className="space-y-6 px-5 py-5">
              <div>
                <Big>{buildingsHere.length > 1 ? 'Your buildings' : 'Your building'}</Big>
                {roofSec
                  ? <div className="mt-3"><Done>Found from the satellite: <b>{floorsOf(roofSec)} floor{floorsOf(roofSec) === 1 ? '' : 's'}</b>, <b>{(ROOF_STYLES.find((r) => r.id === roofStyleOf(roofSec))?.label || 'roof').toLowerCase()}</b> roof{count > 0 ? <>, with a first layout of <b>{count} panels</b></> : ''}. If it looks like the house, press Continue.</Done></div>
                  : <Sub>Check the shape and height the satellite found, and add anything on the roof it missed.</Sub>}
              </div>
              {building && (buildingsHere.length > 1 || addingBuilding) && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[17px] font-bold text-slate-900"><Building2 className="h-5 w-5 text-slate-500" aria-hidden /> {buildingsHere.length > 1 ? `${buildingsHere.length} buildings` : 'Buildings'}</div>
                    {!s.readOnly && (
                      <button type="button" onClick={toggleAddBuilding} className={cx('inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold', addingBuilding ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-300 text-slate-700 hover:bg-slate-50')}>
                        <Plus className="h-3.5 w-3.5" /> {addingBuilding ? 'Cancel' : 'Add building'}
                      </button>
                    )}
                  </div>
                  {buildingsHere.length > 1 ? (
                    <>
                      <div role="radiogroup" aria-label="Building" className="flex flex-wrap gap-1.5">
                        {buildingsHere.map((b) => (
                          <button key={b.id} type="button" role="radio" aria-checked={b.id === building.id} onClick={() => b.id !== building.id && pickBuilding(b.id)} className={cx('max-w-full truncate rounded-full border-2 px-3 py-1.5 text-sm font-semibold', b.id === building.id ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}>{b.name}</button>
                        ))}
                      </div>
                      {!s.readOnly && (
                        <div className="mt-3 flex items-end gap-2">
                          <label className="block min-w-0 flex-1 text-sm font-medium text-slate-700">
                            Name of this building
                            <input aria-label="Building name" value={building.name} maxLength={40} onChange={(e) => s.renameBuilding(building.id, e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-base font-semibold text-slate-900 outline-none focus:border-brand" />
                          </label>
                          <button type="button" aria-label={`Delete ${building.name}`} title="Delete this building and its roof" onClick={() => window.confirm(`Delete ${building.name} and its roof? Panels on it are removed too.`) && s.removeBuilding(building.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      )}
                      <p className="mt-1.5 text-xs text-slate-500">The roof settings below are for {building.name}. The 3D view turns to it.</p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-600">{addingBuilding ? 'On the plan view, click each corner of the other building’s roof, then press Finish.' : 'More than one building on the site? Add each one and mark its roof on the picture. The proposal gives one price with a breakdown per building.'}</p>
                  )}
                </div>
              )}
              {roofSec ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-3 text-[17px] font-bold text-slate-900">Roof type &amp; floors{buildingsHere.length > 1 && building ? ` · ${building.name}` : ''}</div>
                  <RoofShape key={`${roofSec.id}:${roofSec.pitch}:${roofSec.height}`} section={roofSec} />
                </div>
              ) : (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">This roof was drawn by hand: its shape and height stay as drawn.</p>
              )}
              <Fold title="More options" hint={`${roofSec && roofStyleOf(roofSec) !== 'flat' ? 'Roof slope, things' : 'Things'} on the roof${buildingsHere.length > 1 ? '' : ', another building'}`} open={addingBuilding || s.tool === 'mark-area' || objects.some((o) => o.type === 'tree' || o.type === 'block')}>
                <div className="space-y-6">
                  {roofSec && roofStyleOf(roofSec) !== 'flat' && <RoofShape key={`slope:${roofSec.id}:${roofSec.pitch}:${roofSec.height}`} section={roofSec} part="slope" />}
                  <div>
                    <div className="mb-2 text-base font-semibold text-slate-900">Things on the roof</div>
                    <RoofObstacles />
                  </div>
                  {building && buildingsHere.length <= 1 && !s.readOnly && (
                    <div>
                      <div className="mb-1 text-base font-semibold text-slate-900">Another building</div>
                      <p className="text-sm text-slate-600">More than one building on the site? Add each one and mark its roof on the picture. The proposal gives one price with a breakdown per building.</p>
                      <button type="button" onClick={toggleAddBuilding} className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-4 w-4" /> Add building</button>
                    </div>
                  )}
                </div>
              </Fold>
            </div>
          )}
          {stage === 'strings' && (
            <div className="space-y-4 px-5 py-4">
              <div>
                <Big>Strings</Big>
                <Sub>Which panels are wired together. They are worked out automatically, so you can skip this step.</Sub>
              </div>
              {count === 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-base text-amber-800">Place panels on the Panels step first.</p>
              ) : (
                <>
                  {!s.readOnly && (
                    (s.electrical.strings || []).length
                      ? <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700"><b>Tap panels</b> in wiring order, or <b>drag across</b> a row. A full string starts the next one by itself; <b>Enter</b> closes a string.</p>
                      : <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><b>Done automatically.</b> Nothing to do here. To choose the panels of each string yourself, press <b>Make my own strings</b> below.</p>
                  )}
                  <StringList design={design} />
                </>
              )}
            </div>
          )}
          {stage === 'panels' && (
            <div className="space-y-4 px-5 py-4">
              {count > 0 && totals.invalid === 0 && <Done><b>{count} panels</b> are placed for you ({totals.kwp.toFixed(1)} kW). Press Continue, or change the number below.</Done>}
          {/* 1 — the only question: size by bill or by kW */}
          {inPackage && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[19px] font-bold text-slate-900">Sized by the package</div>
              <p className="mt-1 text-base text-slate-600"><b className="text-slate-900">{design.cost.package?.name || 'The package'}</b>{pkgCap ? <> has <b className="text-slate-900">{pkgCap} panels</b></> : ''}. Place them where you like; the price stays the package&apos;s.</p>
              {!s.readOnly && (
                <button type="button" onClick={() => s.patch('config', { pricingMode: 'custom' })} className="mt-3 text-base font-semibold text-brand-ink underline hover:no-underline">Use my own size instead (switches to Custom)</button>
              )}
            </div>
          )}
          {!inPackage && (
          <div>
            <div className="text-[19px] font-bold text-slate-900">How many panels?</div>
            {/* one button; a different number is set with − / + just below */}
            {!s.readOnly && (
              <button type="button" onClick={() => pickSizeMode('fill')} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-brand bg-brand-soft px-4 py-2.5 text-base font-semibold text-brand-ink hover:bg-brand-soft/70">
                <Sparkles className="h-5 w-5" /> Fill the roof
              </button>
            )}
            <p className="mt-2 text-base text-slate-600">
              {designed ? 'Your bases hold' : 'The roof holds'} <b className="text-slate-900">{maxFit} panels</b> ({((maxFit * spec.watts) / 1000).toFixed(1)} kW){count < maxFit ? <>; {count} {count === 1 ? 'is' : 'are'} placed.</> : '.'} For another number, use − and + below.
            </p>
          </div>
          )}

          {totals.invalid > 0 && <p className="rounded-md bg-red-50 px-3 py-2 text-base text-red-700">{totals.invalid} red base{totals.invalid > 1 ? 's are' : ' is'} overlapping something and not counted. Drag it to a free place.</p>}
              {/* the answer, and the one handle on it: how many panels */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <button type="button" aria-label="One panel less" onClick={() => setCount(count - 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                  <div className="flex-1 text-center text-base"><b className="text-xl">{count}</b> panels</div>
                  <button type="button" aria-label="One panel more" title={full ? 'No room for another panel' : undefined} disabled={full} onClick={() => setCount(count + 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 hover:bg-slate-50 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                </div>
                <p className="mt-2.5 text-center text-sm text-slate-600">
                  {count === 0 ? 'No panels on the roof yet.' : <><b>{count}</b> of {Math.max(maxFit, count)} panels{full && !emptyBases.length ? (pkgCap && count >= pkgCap ? ' · all the package’s panels are placed' : designed ? ' · your bases are full' : ' · the roof is full') : ''}</>}
                  {emptyBases.length > 0 && <> · <b className="text-amber-700">{emptyBases.length} empty base{emptyBases.length > 1 ? 's' : ''}</b></>}
                </p>
                {count === 0 && !s.readOnly && !inPackage && maxRoof > 0 && (
                  <button type="button" onClick={fillMax} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-base font-semibold text-brand-fg hover:bg-brand-600"><Sparkles className="h-5 w-5" /> Fill the roof</button>
                )}
              </div>
              {/* everything by hand sits one level down: single panels, own bases, poles, each base's settings */}
              <Fold title="More options" hint="Add or take off single panels, draw your own base, poles, pathways" open={TOOLS.includes(s.tool) || emptyBases.length > 0 || bases.some((o) => o.id === s.selectedId)}>
                <div className="-mx-2 space-y-4">
                  <div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    ['add-base', SquareDashed, 'Add base', 'Tap the roof in 3D, or drag on the plan, to place a base (B)', 'B'],
                    ['add-panel', Grid2x2Plus, 'Add panel', 'Tap an empty slot on a base (P)', 'P'],
                    ['remove-panel', Grid2x2X, 'Remove', 'Tap a panel to take it off (R)', 'R'],
                  ].map(([tool, Icon, label, hint, key]) => (
                    <button key={tool} type="button" title={hint} aria-keyshortcuts={key} aria-pressed={s.tool === tool} onClick={() => { if (s.tool === tool) return s.set({ tool: 'select' }); s.set({ tool, selectedId: null }); }} className={cx('flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg text-xs font-semibold', s.tool === tool ? 'bg-brand text-brand-fg' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
                      <Icon className="h-6 w-6" /> {label}
                    </button>
                  ))}
                  <button id="fill-tool" type="button" title={emptyBases.length ? 'Put panels on every empty base (F)' : 'Take every panel off, the bases stay (F)'} aria-keyshortcuts="F" disabled={!bases.length} onClick={() => (emptyBases.length ? plantBases(design, emptyBases.map((o) => o.id)) : clearBases())} className="flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    {emptyBases.length ? <Sparkles className="h-6 w-6" /> : <Eraser className="h-6 w-6" />} {emptyBases.length ? 'Fill bases' : 'Clear all'}
                  </button>
                </div>
                    <p className="mt-2.5 min-h-[20px] text-sm text-slate-600">
                      {s.tool === 'add-base' ? (view === '3d' ? '👆 Tap the roof where the base goes (or switch to the plan to drag one out). Esc to cancel.' : '✏️ Press and drag on the roof to draw the base. Esc to cancel.')
                        : s.tool === 'add-panel' ? '👆 Tap an empty slot on a base, in 3D or on the plan. Tap the button again to stop.'
                        : s.tool === 'remove-panel' ? '👆 Tap a panel to take it off. Tap the button again to stop.'
                        : 'A base is the frame a block of panels sits on. Pick a tool, then tap the roof.'}
                    </p>
                  </div>
              {/* the poles under every base: two heights (they give the tilt) and the supports in between */}
              {poleTables.length > 0 && (
                <Fold tight title="Pole heights & supports" hint={<>Tilt {tiltShown.toFixed(1)}° (best {opt}°) · {structure.columns} poles</>}>
                  <div className="space-y-3">
                    <div className="text-[13px] font-semibold text-slate-800">Pole heights</div>
                    <Adjust label={<><span className="rounded bg-slate-800 px-1 text-[10px] font-bold text-white">F</span> Front pole · {(config.frontLeg * FT).toFixed(1)} ft</>} value={config.frontLeg} min={0.2} max={4} step={0.05} suffix="m" onChange={(frontLeg) => setHeights(frontLeg, backShown)} />
                    <Adjust label={<><span className="rounded bg-slate-800 px-1 text-[10px] font-bold text-white">B</span> Back pole · {(backShown * FT).toFixed(1)} ft</>} value={backShown} min={0.2} max={6} step={0.05} suffix="m" onChange={(back) => setHeights(config.frontLeg, back)} />
                    <div className="mt-1 text-[13px] font-semibold text-slate-800">Leg supports</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Stepper label={<><SupportIcon dir="h" /> Horizontal</>} name="Horizontal supports, between front and back" value={supportsAll} min={0} max={MAX_SUPPORTS} onChange={(midSupport) => applyAll({ midSupport })} />
                      <Stepper label={<><SupportIcon dir="v" /> Vertical</>} name="Vertical supports, between left and right" value={sideAll} min={0} max={MAX_SUPPORTS} onChange={(midSupportV) => applyAll({ midSupportV })} />
                    </div>
                    <p className="text-xs text-slate-500"><Fence className="mr-1 inline h-3.5 w-3.5 text-slate-400" />Horizontal: column rows between the front and back poles. Vertical: extra pole lines between the left and right edges (of each panel block, when pathways split a base). Both divide equally. {design.sections.some((sec) => sec.frame) ? 'Bases on a sloped roof lie flat on it and have no poles.' : ''}</p>
                  </div>
                </Fold>
              )}
              <Fold tight title="Bases" open={bases.some((o) => o.id === s.selectedId)} hint={`${bases.length} base${bases.length === 1 ? '' : 's'} · size, rows, pathways`}>
                <GroupList design={design} />
              </Fold>
                </div>
              </Fold>
            </div>
          )}
          {stage === 'system' && (
            <div className="space-y-5 px-5 py-4">
              <div>
                <Big>Package</Big>
                <Sub>A ready package, or your own panel and pole. They decide how the panels and the structure are laid out on the next step.</Sub>
              </div>

              {/* 1 — package or own choice: two big buttons */}
              <div role="radiogroup" aria-label="How to price" className="grid grid-cols-2 gap-2">
                {[['package', Package, 'Package', 'A ready kit with one price'], ['custom', Wrench, 'Custom', 'Pick the panel and pole']].map(([mode, Icon, label, hint]) => {
                  const on = (config.pricingMode || 'custom') === mode;
                  return (
                    <button key={mode} type="button" role="radio" aria-checked={on} disabled={s.readOnly} onClick={() => !on && s.patch('config', { pricingMode: mode })} className={cx('flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition', on ? 'border-brand bg-brand-soft' : 'border-slate-200 bg-white hover:border-slate-300')}>
                      <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-lg', on ? 'bg-brand text-brand-fg' : 'bg-slate-100 text-slate-500')}><Icon className="h-5 w-5" /></span>
                      <span>
                        <span className="block text-base font-semibold text-slate-900">{label}</span>
                        <span className="block text-sm text-slate-500">{hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 2 — the choice itself */}
              {isPkg ? (
                pkgs.length ? (
                  <div className="space-y-2">
                    {pkgs.map((pkg) => {
                      const on = pkg.id === chosenPkg;
                      const n = pkgPanels(pkg);
                      return (
                        <button key={pkg.id} type="button" disabled={s.readOnly} onClick={() => !on && s.patch('config', { packageId: pkg.id, packageLaidOut: '' })} className={cx('flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition', on ? 'border-brand bg-brand-soft' : 'border-slate-200 bg-white hover:border-slate-300')}>
                          <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', on ? 'border-brand bg-brand text-brand-fg' : 'border-slate-300')}>{on && <Check className="h-4 w-4" strokeWidth={3} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-semibold text-slate-900">{pkg.name}</span>
                            <span className="block text-sm text-slate-500">{[pkg.kw ? `${pkg.kw} kW` : '', n ? `${n} panels` : ''].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="shrink-0 text-base font-bold text-slate-900">{money(pkg.price)}</span>
                        </button>
                      );
                    })}
                    {design.cost.package?.items?.length > 0 && (
                      <Fold title={`What's included (${design.cost.package.items.length} items)`}>
                        <ul className="space-y-1.5 text-sm">
                          {design.cost.package.items.map((it, i) => (
                            <li key={i} className="flex justify-between gap-3"><span className="text-slate-800">{it.name}</span><span className="shrink-0 text-slate-500">{it.qty} {it.unit}</span></li>
                          ))}
                        </ul>
                      </Fold>
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">No packages yet. Add them in the product catalog, or use <b>Custom</b>.</p>
                )
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-700">Panel
                    <select disabled={s.readOnly} className={cx(PICK, 'mt-1 h-11')} value={spec.id} onChange={(e) => pickPanel(e.target.value)}>
                      {byBrand.map(([b, list]) => (
                        <optgroup key={b} label={b}>
                          {list.map((p) => <option key={p.id} value={p.id}>{b} {p.model || ''} · {p.watts} W · {money(p.price)}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <p className="-mt-1 text-xs text-slate-500">{spec.watts} W · {spec.length} × {spec.width} m · {money(spec.price)} per panel</p>
                  {(structure.columns > 0 || !structure.hooks) && (
                    <label className="block text-sm font-semibold text-slate-700">Pole &amp; structure
                      <select disabled={s.readOnly} className={cx(PICK, 'mt-1 h-11')} value={design.pillar.id} onChange={(e) => s.patch('config', { pillarId: e.target.value })}>
                        {design.catalog.pillars.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.pricePerFt)}/ft</option>)}
                      </select>
                    </label>
                  )}
                  <p className="text-xs text-slate-500">The other materials, services and the price are on the Products step.</p>
                </div>
              )}
            </div>
          )}
          {stage === 'products' && (
            <div className="space-y-5 px-5 py-4">
              <div>
                <Big>Products</Big>
                <Sub>What goes into the proposal, and the price. Change a row only if this customer needs something different.</Sub>
              </div>

              {/* what was chosen on the Package step (changed there: it decides the layout) */}
              {isPkg ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase">Package</div>
                      <div className="text-base font-semibold text-slate-900">{design.cost.package?.name || 'No package chosen'}</div>
                    </div>
                    <b className="shrink-0 text-base text-slate-900">{money(design.cost.packagePrice || 0)}</b>
                  </div>
                  {design.cost.package?.items?.length > 0 && (
                    <Fold title={`What's included (${design.cost.package.items.length} items)`}>
                      <ul className="space-y-1.5 text-sm">
                        {design.cost.package.items.map((it, i) => (
                          <li key={i} className="flex justify-between gap-3"><span className="text-slate-800">{it.name}</span><span className="shrink-0 text-slate-500">{it.qty} {it.unit}</span></li>
                        ))}
                      </ul>
                    </Fold>
                  )}
                  {!s.readOnly && <button type="button" onClick={() => s.setStep(SIMPLE_SLUGS.indexOf('system'))} className="text-sm font-semibold text-brand underline">Change package or switch to Custom</button>}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[150px_minmax(0,1fr)_auto_96px] gap-3 rounded-t-xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase">
                    <span>Product</span><span>Choice</span><span>Qty</span><span className="text-right">Price*</span>
                  </div>
                  {/* the panel and the pole first, then every product of the company's catalog */}
                  {/* the panel and the pole are chosen on the Package step (they decide the layout) */}
                  <ProductRow label="Panel" total={money(design.cost.panels)} qty={`${count} nos`}>
                    <button type="button" disabled={s.readOnly} onClick={() => s.setStep(SIMPLE_SLUGS.indexOf('system'))} title="Change on the Package step" className="truncate text-left text-sm text-slate-800 hover:underline">{spec.brand} {spec.model || ''} · {spec.watts} W</button>
                  </ProductRow>
                  {(structure.columns > 0 || !structure.hooks) && (
                    <ProductRow label="Pole & structure" total={money(design.cost.pillars)} qty={`${Math.round(design.cost.pillarFt)} ft`}>
                      <button type="button" disabled={s.readOnly} onClick={() => s.setStep(SIMPLE_SLUGS.indexOf('system'))} title="Change on the Package step" className="truncate text-left text-sm text-slate-800 hover:underline">{design.pillar.name}</button>
                    </ProductRow>
                  )}
                  {(design.catalog.materialCategories || []).map((cat) => {
                    const entry = config.customMaterials?.[cat.id] || {};
                    const line = (design.cost.categoryMaterials || []).find((m) => m.categoryId === cat.id);
                    const setEntry = (patch) => s.patch('config', { customMaterials: { ...(config.customMaterials || {}), [cat.id]: { ...entry, ...patch } } });
                    // the inverter against the design: how many the strings need, and whether it is big enough
                    const el = design.electrical || {};
                    const isInv = /inverter/i.test(cat.name) && line && count > 0;
                    const needInv = isInv ? el.inverterCount || 0 : 0;
                    const invNote = !isInv ? null
                      : needInv > line.qty ? (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          The design uses <b>{needInv}</b> of this inverter{designBuildings.length > 1 ? ' (each building has its own)' : ''}, but <b>{line.qty}</b> is in the price.
                          {!s.readOnly && <button type="button" onClick={() => setEntry({ qty: needInv })} className="ml-2 font-semibold underline">Price {needInv}</button>}
                        </p>
                      ) : el.dcAc > 1.5 && el.acKw > 0 ? (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          This looks too small: <b>{Number(el.acKw.toFixed(1))} kW</b> of inverter for <b>{totals.kwp.toFixed(1)} kW</b> of panels. Pick a bigger one or raise the quantity.
                        </p>
                      ) : null;
                    return (
                      <ProductRow key={cat.id} label={cat.name} note={invNote} total={line ? money(line.baseTotal ?? line.total) : '—'}
                        qty={entry.productId ? <NumField min={1} title="Quantity" disabled={s.readOnly} className="h-10 w-16 rounded-lg border border-slate-300 bg-white px-1 text-center text-sm" value={entry.qty ?? 1} onValue={(v) => setEntry({ qty: v })} /> : null}>
                        <select disabled={s.readOnly} className={PICK} value={entry.productId || ''} onChange={(e) => {
                          const p = cat.products.find((x) => x.id === e.target.value);
                          setEntry({ productId: e.target.value, price: undefined, gstPercent: p ? (Number(p.gstPercent) >= 0 ? Number(p.gstPercent) : defaultTaxRate()) : undefined });
                        }}>
                          <option value="">Not included</option>
                          {(cat.products || []).map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}{p.unit ? `/${p.unit}` : ''}</option>)}
                        </select>
                      </ProductRow>
                    );
                  })}
                  {/* the standard amount charged while no product is picked: shown, never hidden */}
                  {!design.cost.hasChosenMaterials && design.cost.other > 0 && (
                    <ProductRow label="Standard wiring & installation" total={money(design.cost.other)} qty={`${totals.kwp.toFixed(1)} kW`}>
                      <span className="text-sm text-slate-600">Inverter, wiring and fitting at the company&rsquo;s usual rate per kW. Used while every item above is &ldquo;Not included&rdquo;; picking any item replaces it with the items you pick.</span>
                    </ProductRow>
                  )}
                </div>
              )}

              {!isPkg && <p className="-mt-3 text-xs text-slate-500">* Before {taxName()}. {design.cost.hasChosenMaterials ? <>Only the items you picked are in the price: anything left on &ldquo;Not included&rdquo; is not charged.</> : <>Pick &ldquo;Not included&rdquo; for anything this proposal does not need.</>}</p>}
              {want > count && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  The package has <b>{want} panels</b>; <b>{count}</b> are placed. Place the other <b>{want - count}</b> yourself on the Panels step (Add base, then Add panel) — the price stays the package&rsquo;s.
                  {!s.readOnly && <button type="button" onClick={() => s.setStep(SIMPLE_SLUGS.indexOf('panels'))} className="mt-2 block font-semibold underline">Place the panels</button>}
                </div>
              )}

              {/* the answer: what the client pays */}
              <div className="rounded-2xl bg-slate-900 px-5 py-5 text-white">
                <div className="text-sm font-semibold text-slate-300">Total price{design.cost.withGst !== false && design.cost.gstAmount > 0 ? ` (incl. ${taxName()})` : ''}</div>
                <div className="text-4xl font-extrabold">{money(design.cost.total)}</div>
                <div className="mt-3 grid grid-cols-3 gap-3 border-t border-white/10 pt-3 text-sm">
                  <div><div className="text-slate-400">System</div><div className="font-semibold">{count} panels · {totals.kwp.toFixed(1)} kW</div></div>
                  <div><div className="text-slate-400">Saves</div><div className="font-semibold">{money(fin.firstYearSavings / 12)} / month</div></div>
                  <div><div className="text-slate-400">Payback</div><div className="font-semibold">{fin.payback ? `${fin.payback.toFixed(1)} years` : `${fin.rows.length}+ years`}</div></div>
                </div>
              </div>

              <Fold title={`Discount, ${taxName()} & price breakdown`} open>
                <div className="text-[15px] text-slate-700">{costBody}</div>
              </Fold>
              <Fold title="More options" hint="Floor cost, installation charges, subsidy, proposal terms" open={Number(config.floorCost) > 0 || (config.installationCharges || []).length > 0}>
                <div className="space-y-5">
                            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-[15px] text-slate-700">
                <div className="text-base font-semibold text-slate-900">Services</div>
                {floorBlock}
                {chargesBlock}
              </div>
              {subsidyCard}
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-[15px] text-slate-700">{termsBlock}</div>
                </div>
              </Fold>
            </div>
          )}
          {stage === 'proposal' && (
            <div className="space-y-4 px-5 py-4">
          {/* 2 — result */}
          <div className="rounded-2xl bg-slate-900 p-5 text-white" aria-live="polite">
            <div className="text-3xl font-extrabold">{count} panels <span className="text-xl font-medium text-slate-300">· {totals.kwp.toFixed(1)} kW</span></div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              <div><div className="text-base font-semibold text-slate-300">Generates</div><div className="text-2xl font-bold text-white">{Math.round(totals.acKwh / 12).toLocaleString()} units<span className="text-base font-normal text-slate-300"> / month</span></div><div className="text-base text-slate-300">{Math.round(totals.acKwh).toLocaleString()} kWh / year</div></div>
              <div><div className="text-base font-semibold text-slate-300">Saves</div><div className="text-2xl font-bold text-white">{money(fin.firstYearSavings / 12)}<span className="text-base font-normal text-slate-300"> / month</span></div></div>
              <div><div className="text-base font-semibold text-slate-300">Total price</div><div className="text-2xl font-bold text-white">{money(design.cost.total)}</div>{design.cost.withGst !== false && design.cost.gstAmount > 0 && <div className="text-sm text-slate-300">incl. {taxName()}</div>}</div>
              <div><div className="text-base font-semibold text-slate-300">Payback</div><div className="text-2xl font-bold text-white">{fin.payback ? `${fin.payback.toFixed(1)} years` : `${fin.rows.length}+ years`}</div></div>
            </div>
          </div>
              <div>
                <Big>Proposal</Big>
                <Sub>Download the branded proposal for your client, or share it.</Sub>
              </div>
              {totals.invalid > 0 && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{totals.invalid} red base{totals.invalid > 1 ? 's are' : ' is'} not counted. Fix it on the Panels step first.</p>}
              <div className="space-y-2">
                {/* the PDF first: it is what this step is for */}
                {[...actions].sort((a, b) => (b.key === 'pdf') - (a.key === 'pdf')).map(({ key, icon: Icon, label, hint, disabled, onClick }) => (
                  <button key={key} type="button" disabled={disabled} onClick={onClick} className={cx('flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50', key === 'pdf' ? 'border-brand bg-brand-soft hover:bg-brand-soft/70' : 'border-slate-200 hover:bg-slate-50')}>
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                    <span>
                      <span className="block text-base font-semibold text-slate-900">{label}</span>
                      <span className="block text-sm text-slate-500">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* after a panel change: re-size to the bill / kW if one is set, otherwise keep the same number of panels */}
        <button id="rearrange" type="button" hidden onClick={() => (amount > 0 ? sizeFor(sizeBy, sizeValue) : autoGroups(design, count >= maxFit ? 0 : count))} />
      </aside>

      <ShadowReportModal open={Boolean(wantShadow) && sceneReady} mode={wantShadow || 'report'} onClose={() => useStore.getState().set({ shadowReport: false })} design={design} />
    </>
  );
}
