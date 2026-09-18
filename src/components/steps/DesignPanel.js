'use client';

// Docked right-hand panel for Manual Edit and 3D steps: calculator + live adjust controls.

import { Calculator, Copy, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { newId } from '@/lib/model';
import { useStore } from '@/lib/store';

/** Slider + free-typing number box. Commits valid numbers immediately, clamps on blur. */
export function Adjust({ label, value, onChange, min, max, step = 1, suffix = '' }) {
  const [text, setText] = useState(null); // non-null only while the box is focused
  const clamp = (v) => Math.min(max, Math.max(min, v));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            value={text ?? String(value)}
            onFocus={() => setText(String(value))}
            onChange={(e) => {
              setText(e.target.value);
              const v = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
            }}
            onBlur={() => {
              const v = Number(text);
              if (text !== '' && text !== null && Number.isFinite(v)) onChange(clamp(v));
              setText(null);
            }}
            className="h-7 w-16 rounded-md border border-slate-300 px-1.5 text-right text-[13px] outline-none focus:border-blue-600"
          />
          <span className="w-5 text-xs text-slate-400">{suffix}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-[#f5a524]" />
    </div>
  );
}

const Row = ({ k, v, strong }) => (
  <div className="flex justify-between gap-3 py-1 text-[13px]">
    <span className="text-slate-500">{k}</span>
    <span className={strong ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}>{v}</span>
  </div>
);

const Head = ({ icon: Icon, children }) => (
  <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
    <Icon className="h-4 w-4 text-[#f5a524]" /> {children}
  </div>
);

export default function DesignPanel({ design }) {
  const s = useStore();
  const { config, objects, sections, selectedId } = s;
  const { totals, structure, spec } = design;
  const panelObjs = objects.filter((o) => o.type === 'array' || o.type === 'zone');
  const sel = objects.find((o) => o.id === selectedId && (o.type === 'array' || o.type === 'zone'));
  const selTable = sel?.type === 'array' ? design.tables.find((t) => t.source === sel.id) : null;
  const main = sections[0];

  /** Apply to defaults and to every existing array / zone. */
  const applyAll = (patch) => s.set({ config: { ...config, ...patch }, objects: objects.map((o) => (o.type === 'array' && !o.elevated) || o.type === 'zone' ? { ...o, ...patch } : o) });
  const u = (patch) => s.updateObject(sel.id, patch);
  const setTarget = (kw) => s.patch('config', { targetKw: kw, maxPanels: kw > 0 ? Math.ceil((kw * 1000) / spec.watts) : 0 });
  const needed = config.targetKw > 0 ? Math.ceil((config.targetKw * 1000) / spec.watts) : 0;
  const label = (o, i) => `${o.type === 'zone' ? 'Zone' : o.elevated ? 'Elevated structure' : 'Array'} ${i + 1}`;

  return (
    <aside className="absolute inset-y-0 right-0 z-10 w-[330px] overflow-y-auto border-l border-slate-200 bg-white" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <section className="border-b border-slate-200 p-4">
        <Head icon={Calculator}>Calculator</Head>
        <Adjust label="Target capacity (0 = fill roof)" value={config.targetKw} min={0} max={500} step={0.5} suffix="kW" onChange={setTarget} />
        {needed > 0 && (
          <p className="mt-1.5 text-xs text-slate-500">
            {config.targetKw} kW ÷ {spec.watts} W = <b>{needed} panels</b> needed{totals.count < needed ? ` — only ${totals.count} fit with the current layout. Add a zone or press Auto-fill.` : ''}
          </p>
        )}
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
          <Row k="Panels" v={`${totals.count} × ${spec.watts} W`} strong />
          <Row k="Total power" v={`${(totals.count * spec.watts).toLocaleString()} W = ${totals.kwp.toFixed(2)} kWp`} strong />
          <Row k="Energy" v={`${Math.round(totals.acKwh).toLocaleString()} kWh / year`} />
          <Row k="Per day (avg)" v={`${(totals.acKwh / 365).toFixed(1)} kWh`} />
          <Row k="Shading loss" v={`${totals.shadeLossPct.toFixed(1)} %`} />
          <Row k="Roof used" v={`${(totals.count * spec.length * spec.width).toFixed(0)} of ${design.roofArea.toFixed(0)} m²`} />
        </div>
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2">
          <Row k="Iron columns (legs)" v={`${structure.columns} nos`} strong />
          <Row k="  front / back" v={`${structure.front} / ${structure.back}`} />
          <Row k="Column steel (60×60 SHS)" v={`${structure.columnM.toFixed(1)} m`} strong />
          <Row k="Rafters (80×40)" v={`${structure.rafterM.toFixed(1)} m`} />
          <Row k="Purlins / rails" v={`${structure.purlinM.toFixed(1)} m`} />
          {structure.braceM > 0 && <Row k="Bracing angle" v={`${structure.braceM.toFixed(1)} m`} />}
          <Row k="Base plates / foundations" v={`${structure.basePlates} nos`} />
          <Row k="Anchor bolts" v={`${structure.anchorBolts} nos`} />
          <Row k="Approx. steel weight" v={`${Math.round(structure.weight)} kg`} />
          {structure.cutList.length > 0 && (
            <div className="mt-1 border-t border-amber-200 pt-1.5 text-xs text-slate-600">
              <div className="mb-0.5 font-semibold">Column cut list</div>
              {structure.cutList.map((c) => (
                <div key={c.len} className="flex justify-between">
                  <span>{c.len.toFixed(2)} m</span>
                  <span>× {c.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 border-b border-slate-200 p-4">
        <Head icon={SlidersHorizontal}>Adjust all arrays</Head>
        <Adjust label="Tilt" value={config.tilt} min={0} max={45} suffix="°" onChange={(tilt) => applyAll({ tilt })} />
        <Adjust label="Height above roof (front leg)" value={config.frontLeg} min={0.1} max={4} step={0.05} suffix="m" onChange={(frontLeg) => applyAll({ frontLeg })} />
        <Adjust label="Rows per table" value={config.rowsPerTable} min={1} max={6} onChange={(v) => s.set({ config: { ...config, rowsPerTable: v }, objects: objects.map((o) => (o.type === 'zone' ? { ...o, rowsPerTable: v } : o)) })} />
        <Adjust label="Setback from parapet" value={config.setback} min={0} max={3} step={0.1} suffix="m" onChange={(setback) => s.patch('config', { setback })} />
        {main && (
          <>
            <Adjust label="Roof height" value={main.height} min={2} max={60} step={0.5} suffix="m" onChange={(height) => s.updateSection(main.id, { height })} />
            <Adjust label="Parapet height" value={main.parapetH} min={0} max={2.5} step={0.1} suffix="m" onChange={(parapetH) => s.updateSection(main.id, { parapetH })} />
          </>
        )}
      </section>

      <section className="space-y-3 p-4">
        <Head icon={SlidersHorizontal}>Selected array</Head>
        <select value={sel?.id || ''} onChange={(e) => s.set({ selectedId: e.target.value || null })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm">
          <option value="">— pick an array / zone —</option>
          {panelObjs.map((o, i) => (
            <option key={o.id} value={o.id}>
              {label(o, i)}
            </option>
          ))}
        </select>
        {sel && (
          <>
            {sel.type === 'array' ? (
              <>
                <Adjust label="Rows" value={sel.rows} min={1} max={10} onChange={(rows) => u({ rows })} />
                <Adjust label="Columns" value={sel.cols} min={1} max={40} onChange={(cols) => u({ cols })} />
              </>
            ) : (
              <>
                <Adjust label="Rows per table" value={sel.rowsPerTable} min={1} max={6} onChange={(rowsPerTable) => u({ rowsPerTable })} />
                <Adjust label="Row gap (0 = auto)" value={sel.rowGap} min={0} max={8} step={0.1} suffix="m" onChange={(rowGap) => u({ rowGap })} />
              </>
            )}
            <Adjust label="Tilt" value={sel.tilt} min={0} max={45} suffix="°" onChange={(tilt) => u({ tilt })} />
            <Adjust label="Facing direction" value={sel.azimuth} min={0} max={359} suffix="°" onChange={(azimuth) => u({ azimuth })} />
            <Adjust label="Front leg height" value={sel.frontLeg} min={0.1} max={6} step={0.05} suffix="m" onChange={(frontLeg) => u({ frontLeg })} />
            {selTable && <Row k="Back leg height" v={`${selTable.backLeg.toFixed(2)} m`} strong />}
            {selTable && <Row k="This array" v={selTable.valid ? `${selTable.modules.length} panels · ${selTable.legs.length} columns` : selTable.reason} />}
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium">
              {['portrait', 'landscape'].map((k) => (
                <button key={k} type="button" onClick={() => u({ orientation: k })} className={`h-7 flex-1 rounded-md capitalize ${sel.orientation === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
                  {k}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {sel.type === 'array' && (
                <button type="button" onClick={() => s.addObject({ ...sel, id: newId('c'), x: sel.x + 2, y: sel.y - 2 })} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">
                  <Copy className="h-4 w-4" /> Duplicate
                </button>
              )}
              <button type="button" onClick={() => s.remove(sel.id)} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </>
        )}
        {!panelObjs.length && <p className="text-xs text-slate-400">No panels yet — use Auto-fill (wand button) in Manual Edit.</p>}
      </section>
    </aside>
  );
}
