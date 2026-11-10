'use client';

// Panel groups: each group is an independent block of panels with its own tilt, height, size.

import { ChevronDown, Columns3, Compass, Copy, Eraser, Footprints, Grid2x2, Plus, Rows3, Sparkles, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';
import { sideName } from '@/lib/geo';
import { addBaseOnRoof, baseLabel, clearBases, plantBases, withinPackage } from '@/lib/autofill';
import { baseFit, baseFor, isBase, MAX_SUPPORTS, midSupports, newId, PATH_COLORS, PATH_WIDTH } from '@/lib/model';
import { useStore } from '@/lib/store';
import { cx } from '../ui';
import { Adjust, PoleHeightsIcon, Stepper, SupportIcon } from './DesignPanel';

const FT = 3.281;

export default function GroupList({ design }) {
  const s = useStore();
  const groups = s.objects.filter((o) => o.type === 'array');
  const { spec } = design;

  // base first: a new group is an empty base in the middle of the roof; panels are planted on it next
  const add = () => addBaseOnRoof(design);

  // a group picked on the 3D or plan view: bring its details into view in the sidebar
  const cards = useRef(new Map());
  useEffect(() => {
    const el = s.selectedId && cards.current.get(s.selectedId);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [s.selectedId]);

  // the list goes roof side by roof side ("South side · 8 panels"), each base under its side; the bases
  // keep the number of their place in the design (the Strings step names them the same way)
  const many = design.buildings.length > 1;
  const sideOf = (g) => {
    const t = design.tables.find((x) => x.source === g.id);
    const side = `${sideName(t?.azimuth ?? g.azimuth ?? 180)} side`;
    const b = many && t ? design.buildings.find((k) => k.id === t.building)?.name : '';
    return b ? `${b} · ${side}` : side;
  };
  const order = [];
  const bySide = new Map();
  groups.forEach((g, i) => {
    const key = sideOf(g);
    if (!bySide.has(key)) { bySide.set(key, []); order.push(key); }
    bySide.get(key).push([g, i]);
  });
  const panelsOn = (g) => (g.planted === false ? 0 : (design.tables.find((x) => x.source === g.id)?.modules.length ?? 0));

  return (
    <div className="space-y-2">
      {order.map((key) => {
        const list = bySide.get(key);
        const n = list.reduce((a, [g]) => a + panelsOn(g), 0);
        return (
          <Fragment key={key}>
            {order.length > 1 && <div className="flex items-baseline justify-between px-1 pt-2 text-sm first:pt-0"><b className="text-slate-900">{key}</b><span className="text-slate-500">{n} panel{n === 1 ? '' : 's'}</span></div>}
            {list.map(([g, i]) => {
        const open = g.id === s.selectedId;
        const t = design.tables.find((x) => x.source === g.id);
        // with a package, more rows / columns plant only up to the package's panels
        const u = (patch) => s.updateObject(g.id, patch.rows !== undefined || patch.cols !== undefined || patch.count !== undefined ? withinPackage(g, patch, spec) : patch);
        const base = isBase(g);
        const fit = baseFit(g, spec);
        const slots = Math.max(fit.rows, g.planted === false ? 0 : g.rows || 0); // panel rows the base has room for
        // the back pole: its own height, or the one the group's tilt gives (groups saved with a tilt)
        const backShown = g.heightMode === 'heights' && g.backLeg >= 0 ? g.backLeg : Math.round((t?.backLeg ?? g.frontLeg) * 20) / 20;
        const supports = midSupports(g, slots);
        const n = t ? t.modules.length : g.rows * g.cols;
        const empty = base && g.planted === false;
        return (
          <div key={g.id} ref={(el) => (el ? cards.current.set(g.id, el) : cards.current.delete(g.id))} className={cx('overflow-hidden rounded-md border transition', open ? 'border-brand ring-2 ring-brand/20' : 'border-slate-200')}>
            <button type="button" onClick={() => s.set({ selectedId: open ? null : g.id })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
              <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-brand-fg', t?.valid === false ? 'bg-red-500' : 'bg-brand')}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{baseLabel(g, i)}</span>
                <span className="block text-xs text-slate-500">
                  {empty ? <b className="text-amber-700">Empty</b> : <>{n} panel{n === 1 ? '' : 's'} · {((n * spec.watts) / 1000).toFixed(1)} kW</>}
                  {' · '}{fit.rows} × {fit.cols} slots{t?.flush ? ' · on the slope' : ` · ${Math.round(t?.tilt ?? g.tilt)}° tilt`}
                </span>
              </span>
              <ChevronDown className={cx('h-4 w-4 text-slate-400 transition', open && 'rotate-180')} />
            </button>
            {open && (
              <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-3">
                {t?.valid === false && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">{t.reason} — drag it to a free spot, or make it smaller.</p>}
                <div className="flex gap-2">
                  <input value={baseLabel(g, i) === g.name ? g.name : ''} placeholder={`Base ${i + 1}`} onChange={(e) => u({ name: e.target.value })} className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-brand" />
                  {base && (empty
                    ? <button type="button" title="Put panels on this base" onClick={() => { u({ count: undefined, filled: undefined }); plantBases(design, [g.id]); }} className="flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"><Sparkles className="h-3.5 w-3.5" /> Fill</button>
                    : <button type="button" title="Take every panel off this base" onClick={() => clearBases([g.id])} className="flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-50"><Eraser className="h-3.5 w-3.5" /> Clear</button>)}
                </div>
                {/* size: panels on it, and the base itself in panel slots */}
                <div className="mt-1 text-xs font-semibold text-slate-800">Panels & size</div>
                <div className="grid grid-cols-3 gap-2">
                  {base && !empty
                    ? <Stepper label={<><Grid2x2 className="h-4 w-4 text-slate-500" /> Panels</>} name="Panels" value={n} min={1} max={Math.max(1, fit.rows * fit.cols)} onChange={(count) => u({ count, filled: undefined, rows: fit.rows, cols: fit.cols, planted: true, auto: false })} />
                    : <div className="text-xs text-slate-500"><Grid2x2 className="mb-1 h-4 w-4 text-slate-400" />Holds {fit.rows * fit.cols}</div>}
                  <Stepper label={<><Rows3 className="h-4 w-4 text-slate-500" /> Rows</>} name="Rows" value={base ? fit.rows : g.rows} min={1} max={200} onChange={(rows) => u(base ? { rows: empty ? g.rows : rows, cols: empty ? g.cols : fit.cols, ...baseFor(rows, fit.cols, g, spec), auto: false } : { rows })} />
                  <Stepper label={<><Columns3 className="h-4 w-4 text-slate-500" /> Per row</>} name="Panels per row" value={base ? fit.cols : g.cols} min={1} max={500} onChange={(cols) => u(base ? { rows: empty ? g.rows : fit.rows, cols: empty ? g.cols : cols, ...baseFor(fit.rows, cols, g, spec), auto: false } : { cols })} />
                </div>
                {(fit.rows >= 2 || fit.cols >= 2) && (
                  <>
                    <div className="mt-1 text-xs font-semibold text-slate-800">Pathway for cleaning</div>
                    {[['pathRow', 'row', fit.rows, 'Between rows', 'runs side to side'], ['pathCol', 'col', fit.cols, 'Between columns', 'runs front to back']].map(([field, axis, n0, label, runs]) => {
                      if (n0 < 2) return null;
                      const cur = g[field];
                      const strips = (t?.pathways || []).filter((p) => p.axis === axis);
                      const every = Math.min(Number(cur?.every ?? cur?.after) || 1, n0 - 1);
                      const noun = axis === 'row' ? 'rows' : 'columns';
                      // turning a pathway on or off keeps the panel slots: the base grows or shrinks by it
                      const setPath = (path) => {
                        const next = { ...g, [field]: path || undefined };
                        u({ [field]: path || undefined, ...(base ? baseFor(fit.rows, fit.cols, next, spec) : {}), auto: false });
                      };
                      return (
                        <div key={field} className="rounded-lg border bg-white p-2" style={cur ? { borderColor: PATH_COLORS[axis], background: `${PATH_COLORS[axis]}12` } : undefined}>
                          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-800">
                            <input type="checkbox" checked={Boolean(cur)} onChange={(e) => setPath(e.target.checked ? { every: Math.min(2, n0 - 1), width: PATH_WIDTH } : null)} className="h-4 w-4" style={{ accentColor: PATH_COLORS[axis] }} />
                            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: PATH_COLORS[axis] }} aria-hidden />
                            <Footprints className="h-4 w-4 text-slate-500" /> {label} <span className="font-normal text-slate-500">· {runs}</span>
                          </label>
                          {cur && (
                            <div className="mt-2 space-y-2">
                              {strips.length > 0 && (
                                <div className="rounded-md px-2 py-1 text-center text-xs font-bold text-white" style={{ background: PATH_COLORS[axis] }}>
                                  {strips.length} pathway{strips.length > 1 ? 's' : ''} · each {strips[0].width.toFixed(2)} m × {strips[0].length.toFixed(1)} m ({(strips[0].width * FT).toFixed(1)} × {(strips[0].length * FT).toFixed(1)} ft)
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                <Stepper label={`Every … ${noun}`} name={`A pathway after every so many ${noun}`} value={every} min={1} max={n0 - 1} onChange={(n) => setPath({ width: cur.width, every: n })} />
                                <Stepper label="Width (cm)" name="Pathway width in centimetres" step={5} value={Math.round((cur.width || PATH_WIDTH) * 100)} min={30} max={200} onChange={(cm) => setPath({ ...cur, width: Math.max(0.3, Math.min(2, cm / 100)) })} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
                {t?.flush ? (
                  <p className="text-xs text-slate-500">Lies flat on the sloped roof · tilt {Math.round(t.tilt)}°</p>
                ) : (
                  <>
                    {/* poles: two heights (they give the tilt) and the supports between them */}
                    <div className="mt-1 text-xs font-semibold text-slate-800">Pole heights</div>
                    <div className="flex items-center gap-3">
                      <PoleHeightsIcon className="h-9 w-12 shrink-0" />
                      <div className="text-xs text-slate-500">Tilt <b className="text-slate-800">{t ? t.tilt.toFixed(1) : g.tilt}°</b> · {t ? t.legs.length + (t.midLegs?.length || 0) : 0} columns{g.heightMode === 'heights' && backShown < g.frontLeg ? ' · back lower than front' : ''}</div>
                    </div>
                    <Adjust label={<><span className="rounded bg-slate-800 px-1 text-[10px] font-bold text-white">F</span> Front pole · {(g.frontLeg * FT).toFixed(1)} ft</>} value={g.frontLeg} min={0.2} max={4} step={0.05} suffix="m" onChange={(frontLeg) => u({ frontLeg, backLeg: backShown, heightMode: 'heights' })} />
                    <Adjust label={<><span className="rounded bg-slate-800 px-1 text-[10px] font-bold text-white">B</span> Back pole · {(backShown * FT).toFixed(1)} ft</>} value={backShown} min={0.2} max={6} step={0.05} suffix="m" onChange={(backLeg) => u({ backLeg, heightMode: 'heights' })} />
                  </>
                )}
                {!t?.flush && <div className="mt-1 text-xs font-semibold text-slate-800">Leg supports</div>}
                <div className="grid grid-cols-2 gap-2">
                  {!t?.flush && <Stepper label={<><SupportIcon dir="h" /> Horizontal</>} name="Horizontal supports, between front and back" value={supports} min={0} max={MAX_SUPPORTS} onChange={(midSupport) => u({ midSupport })} />}
                  {!t?.flush && <Stepper label={<><SupportIcon dir="v" /> Vertical{t?.poleBlocks > 1 ? ' (per block)' : ''}</>} name={t?.poleBlocks > 1 ? 'Vertical supports between the edges of each panel block' : 'Vertical supports, between left and right'} value={g.midSupportV != null ? Number(g.midSupportV) || 0 : t?.vSupports ?? 0} min={0} max={MAX_SUPPORTS} onChange={(midSupportV) => u({ midSupportV })} />}
                </div>
                {!t?.flush && t?.poleBlocks > 1 && <p className="text-xs text-slate-500">The pathways split the panels into {t.poleBlocks} blocks. Each block stands on its own poles, one at each edge, so no pole is in a pathway.</p>}
                {!t?.flush && <div className="mt-1 text-xs font-semibold text-slate-800">Direction</div>}
                <div className="grid grid-cols-2 gap-2">
                  {!t?.flush && <Stepper label={<><Compass className="h-4 w-4 text-slate-500" /> Facing</>} name="Facing direction, 180 is south" value={g.azimuth} min={0} max={359} suffix="°" onChange={(azimuth) => u({ azimuth })} />}
                </div>
                {t && !t.flush && design.catalog?.pillars?.length > 0 && (
                  <>
                    <div className="mt-1 text-xs font-semibold text-slate-800">Pole type</div>
                    <select value={g.poleId || ''} onChange={(e) => u({ poleId: e.target.value || undefined })} className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-brand">
                      <option value="">Project pole ({design.pillar?.name})</option>
                      {design.catalog.pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </>
                )}
                {/* turning the panels keeps the same rows × columns: the base (and its structure) takes the new panel size */}
                <div className="mt-1 text-xs font-semibold text-slate-800">Panel direction</div>
                <div className="flex gap-1 rounded-lg bg-slate-200/70 p-1 text-xs font-medium">
                  {[['portrait', 'Upright'], ['landscape', 'Sideways']].map(([k, label]) => (
                    <button key={k} type="button" title={k} onClick={() => g.orientation !== k && u({ orientation: k, ...(base ? baseFor(Math.max(1, fit.rows), Math.max(1, fit.cols), { ...g, orientation: k }, spec) : {}) })} className={cx('flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md', g.orientation === k ? 'bg-white shadow-sm' : 'text-slate-500')}>
                      <span className={cx('inline-block border border-current', k === 'portrait' ? 'h-3 w-2' : 'h-2 w-3')} /> {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" title="Make a copy next to it" onClick={() => { const copy = { ...g, id: newId('g'), name: `${baseLabel(g, i)} copy`, x: g.x + 2, y: g.y - 2 }; s.addObject({ ...copy, ...withinPackage(copy, {}, spec, { isNew: true }) }); }} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium hover:bg-slate-50">
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </button>
                  <button type="button" title="Remove this base and its panels" onClick={() => s.remove(g.id)} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
            })}
          </Fragment>
        );
      })}
      <button type="button" title="A new empty base in the middle of the roof" onClick={add} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50">
        <Plus className="h-4 w-4" /> Add a base
      </button>
    </div>
  );
}
