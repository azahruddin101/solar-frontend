'use client';

// "What is on your roof?" — big buttons, tap to place, drag to move, corner to resize.

import { Building2, Cylinder, DoorOpen, Package, Trash2, TreePine } from 'lucide-react';
import { compassLabel, normalizeAzimuth } from '@/lib/geo';
import { edges } from '@/lib/geometry';
import { buildingAzimuth, normSection, ROOF_TYPES } from '@/lib/model';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import Editor2D from '../editor/Editor2D';
import { cx } from '../ui';
import RoofPreview from './RoofPreview';

const FT = 3.281;
const ITEMS = [
  { key: 'tank', icon: Cylinder, label: 'Water tank', tool: 'add-block', preset: { name: 'Water tank', w: 1.5, d: 1.5, h: 1.8 } },
  { key: 'stair', icon: DoorOpen, label: 'Staircase room', tool: 'add-block', preset: { name: 'Staircase room', w: 3, d: 3, h: 2.7 } },
  { key: 'floor', icon: Building2, label: 'Roof on roof (room / upper floor)', tool: 'mark-area' },
  { key: 'tree', icon: TreePine, label: 'Tree near roof', tool: 'add-tree' },
  { key: 'other', icon: Package, label: 'AC / dish / other', tool: 'add-block', preset: { name: 'Other', w: 1, d: 1, h: 1 } },
];
// side views of the three roof shapes
const SHAPE_ICON = { flat: 'M6 12H42V27H6Z', shed: 'M6 27V16L42 6V27Z', gable: 'M6 27V16L24 4L42 16V27Z' };
const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

/** Metres box that tolerates half-typed numbers ("1.") and only commits valid ones. */
function Metres({ value, onCommit, label, min = 0.1, max = 60 }) {
  const shown = Number(value.toFixed(2));
  const [text, setText] = useState(String(shown));
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setText(String(shown)), [shown]);
  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <input
        inputMode="decimal"
        aria-label={label}
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, '');
          setText(t);
          const n = Number(t);
          if (t && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
        }}
        onBlur={() => setText(String(shown))}
        className="h-9 w-16 rounded-md border border-slate-300 px-2 text-right text-sm font-semibold tabular-nums outline-none focus:border-brand"
      />
      <span className="text-xs text-slate-400">m</span>
    </label>
  );
}

function Heights({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={l} type="button" onClick={() => onChange(v)} className={cx('rounded-full border px-3 py-1 text-xs font-medium', Math.abs(value - v) < 0.01 ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
          {l}
        </button>
      ))}
    </div>
  );
}

export default function StepSimpleObstacles({ design }) {
  const s = useStore();
  const { tool, objects, sections, selectedId } = s;
  const main = sections[0];
  const sloped = main && main.roofType && main.roofType !== 'flat';
  // a slope can face any side of the building: offer the outward direction of each long wall
  const facings = main
    ? [...new Set(edges(normSection({ ...main, roofType: 'flat' }).poly).filter((e) => e.length >= 1.5).map((e) => Math.round(normalizeAzimuth((Math.atan2(e.outward.x, e.outward.y) * 180) / Math.PI))))].sort((a, b) => a - b)
    : [];
  const setRoofType = (roofType) => {
    if (roofType === 'flat') return s.updateSection(main.id, { roofType, parapetH: main.parapetH || 1 });
    // first time: 20° pitch, facing the sunny side of the building
    s.updateSection(main.id, { roofType, pitch: main.pitch || 20, slopeAz: main.slopeAz ?? buildingAzimuth([normSection({ ...main, roofType: 'flat' })], design.lat) });
  };
  const frame = sloped ? normSection(main).frame : null;
  const rise = frame ? frame.rise : 0;
  const depth = frame ? frame.dMax - frame.dMin : 0;
  const gable = sloped && main.roofType === 'gable';
  const uneven = gable && (Math.abs(frame.ridge - 0.5) > 0.01 || Math.abs(frame.rise2 - frame.rise) > 0.01);
  // kept to 0.001° so a typed rise survives the round trip through the angle (1 m stays 1 m)
  const pitchFor = (riseM, widthM) => Math.min(60, Math.max(1, Math.round((Math.atan(riseM / widthM) * 180000) / Math.PI) / 1000));
  // each slope, described the way people measure a roof: how wide it is (on the plan) and how far it climbs
  const slopes = !frame ? [] : gable
    ? [
        { key: 'a', side: compassLabel(frame.az), width: frame.ridge * depth, rise: frame.rise, pitch: main.pitch,
          setWidth: (w) => { const ridge = Math.min(0.85, Math.max(0.15, w / depth)); s.updateSection(main.id, { ridge, pitch: pitchFor(frame.rise, ridge * depth) }); },
          setRise: (r) => s.updateSection(main.id, { pitch: pitchFor(r, frame.ridge * depth), rise2: main.rise2 > 0 ? main.rise2 : frame.rise2 }) },
        { key: 'b', side: compassLabel(normalizeAzimuth(frame.az + 180)), width: (1 - frame.ridge) * depth, rise: frame.rise2, pitch: frame.pitch2,
          setWidth: (w) => { const ridge = Math.min(0.85, Math.max(0.15, 1 - w / depth)); s.updateSection(main.id, { ridge, pitch: pitchFor(frame.rise, ridge * depth) }); },
          setRise: (r) => s.updateSection(main.id, { rise2: r }) },
      ]
    : [{ key: 'a', side: compassLabel(frame.az), width: depth, rise: frame.rise, pitch: main.pitch, setRise: (r) => s.updateSection(main.id, { pitch: pitchFor(r, depth) }) }];
  const things = [...sections.slice(1).map((x) => ({ ...x, kind: 'floor' })), ...objects.filter((o) => o.type === 'block' || o.type === 'tree')];

  // tap a button, then drag across the area on the picture — the object takes exactly that size
  const armed = tool === 'mark-area' || tool === 'draw-section' ? s.pendingKey : null;
  // roof on roof is traced corner by corner (any shape); the other objects are dragged as a rectangle
  const pick = (it) =>
    armed === it.key
      ? s.set({ tool: 'select', pendingKey: null, pendingBlock: null })
      : s.set({ tool: it.key === 'floor' ? 'draw-section' : 'mark-area', pendingKey: it.key, pendingBlock: it.preset || null, selectedId: null });
  const armedItem = ITEMS.find((i) => i.key === armed);
  const hint = armedItem
    ? armed === 'floor' ? 'Click each corner of the upper roof on the picture, then press Finish · corners can be dragged afterwards' : `Press and drag across the ${armedItem.label.toLowerCase()} on the picture to select its area`
    : sloped ? `Click the LOW edge of the roof${main.roofType === 'gable' ? ' · drag the white dot to move the ridge' : ''}`
    : things.length ? 'Drag an object to move it · pull a white dot to resize' : 'Nothing on the roof? Just press Continue';

  return (
    <>
      <div className="absolute inset-y-0 left-0 right-[400px]">
        <Editor2D design={design} showPanels={false} slopeEdit editSections={tool === 'draw-section' || sections.slice(1).some((x) => x.id === selectedId)}>
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-slate-900/85 px-5 py-2 text-sm text-white shadow-lg">{hint}</div>
          {tool === 'draw-section' && (
            <div className="absolute bottom-6 right-6 flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => key('Backspace')} className="h-12 rounded-md bg-white px-5 text-sm font-semibold shadow-lg">Undo last point</button>
              <button type="button" onClick={() => key('Enter')} className="h-12 rounded-md bg-brand px-6 text-sm font-semibold text-brand-fg shadow-lg">Finish</button>
            </div>
          )}
        </Editor2D>
      </div>

      <aside className="absolute inset-y-0 right-0 flex w-[400px] flex-col overflow-y-auto border-l border-slate-200 bg-white px-6 py-5">
        <h2 className="text-[22px] font-bold leading-tight">Roof marked</h2>
        <p className="mt-1 text-sm font-medium text-brand-ink">Press Continue to see the solar plan.</p>
        {main && (
          <div className="mt-5 rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">What does the roof look like?</div>
            <div role="radiogroup" aria-label="Roof shape" className="grid grid-cols-3 gap-2">
              {ROOF_TYPES.map((t) => {
                const on = (main.roofType || 'flat') === t.id;
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setRoofType(t.id)} className={cx('flex flex-col items-center gap-1 rounded-lg border-2 px-1 pt-2 pb-1.5 text-xs font-semibold leading-tight transition', on ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                    <svg viewBox="0 0 48 30" className="h-8 w-12" aria-hidden>
                      <path d={SHAPE_ICON[t.id]} fill={on ? 'var(--brand)' : '#cbd5e1'} fillOpacity={on ? 0.25 : 0.6} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3"><RoofPreview section={main} /></div>

            {sloped ? (
              <>
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <b>On the picture:</b> click the edge where the roof is <b>lowest</b>{main.roofType === 'gable' ? ', and drag the white dot to move the ridge' : ''}. The orange line marks the low edge.
                </p>

                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <label htmlFor="pitch" className="shrink-0 text-sm font-semibold">How steep?{uneven && <span className="font-normal text-slate-500"> {compassLabel(frame.az)} side</span>}</label>
                  <span className="text-right text-sm"><b className="text-base tabular-nums">{Math.round(main.pitch)}°</b> <span className="text-xs text-slate-500">· climbs {rise.toFixed(1)} m ({(rise * FT).toFixed(0)} ft)</span></span>
                </div>
                <input id="pitch" type="range" min={5} max={45} step={1} value={Math.round(main.pitch)} onChange={(e) => s.updateSection(main.id, { pitch: Number(e.target.value) })} className="mt-1.5 h-2 w-full cursor-pointer accent-brand" />
                <div className="mt-1.5 flex gap-1.5">
                  {[[10, 'Gentle'], [20, 'Normal'], [30, 'Steep']].map(([v, l]) => (
                    <button key={l} type="button" onClick={() => s.updateSection(main.id, { pitch: v })} className={cx('flex-1 rounded-full border px-2 py-1 text-xs font-medium', main.pitch === v ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>{l} · {v}°</button>
                  ))}
                </div>

                <div className="mt-4 text-sm font-semibold">{gable ? 'Size of each slope' : 'Size of the slope'}</div>
                <p className="mt-0.5 text-xs text-slate-500">{gable ? 'The two sides can be different — for example one climbs 1 m and the other 2 m.' : 'Type the height difference if you know it.'}</p>
                <table className="mt-2 w-full text-sm">
                  <thead><tr className="text-left text-[11px] tracking-wide text-slate-400 uppercase"><th className="pb-1 font-medium">Side</th><th className="pb-1 font-medium">Width</th><th className="pb-1 font-medium">Climbs</th><th className="pb-1 text-right font-medium">Angle</th></tr></thead>
                  <tbody>
                    {slopes.map((sl) => (
                      <tr key={sl.key} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2 font-semibold">{sl.side}</td>
                        <td className="py-1.5">{sl.setWidth ? <Metres label={`${sl.side} slope width`} value={sl.width} max={depth} onCommit={sl.setWidth} /> : <span className="text-slate-500 tabular-nums">{sl.width.toFixed(1)} m</span>}</td>
                        <td className="py-1.5"><Metres label={`${sl.side} slope rise`} value={sl.rise} min={0.05} max={25} onCommit={sl.setRise} /></td>
                        <td className="py-1.5 text-right text-slate-500 tabular-nums">{Math.round(sl.pitch)}°</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {gable && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Roof edges: {compassLabel(frame.az)} at {(main.height * FT).toFixed(0)} ft, {compassLabel(normalizeAzimuth(frame.az + 180))} at {(frame.eave2 * FT).toFixed(0)} ft · top at {((main.height + rise) * FT).toFixed(0)} ft</span>
                    {uneven && <button type="button" onClick={() => s.updateSection(main.id, { ridge: 0.5, rise2: undefined })} className="shrink-0 font-semibold text-brand underline">Make both equal</button>}
                  </div>
                )}

                <details className="mt-3 text-xs text-slate-500">
                  <summary className="cursor-pointer font-medium text-slate-600">Or choose the low side by direction</summary>
                  <div className="mt-2"><Heights value={main.slopeAz} onChange={(slopeAz) => s.updateSection(main.id, { slopeAz })} options={facings.map((az) => [az, `${compassLabel(az)} side`])} /></div>
                </details>
              </>
            ) : (
              <>
                <div className="mb-2 mt-3 text-sm font-semibold">Boundary wall around the roof</div>
                <Heights value={main.parapetH} onChange={(parapetH) => s.updateSection(main.id, { parapetH })} options={[[0, 'No wall'], [0.5, 'Low · 1.5 ft'], [1, 'Normal · 3 ft'], [1.5, 'High · 5 ft']]} />
              </>
            )}
            <div className="mb-2 mt-3 text-sm font-semibold">{sloped ? 'Wall height (up to the roof edge)' : 'Building height'}</div>
            <Heights value={main.height} onChange={(height) => s.updateSection(main.id, { height })} options={[[3, '1 floor'], [6, '2 floors'], [9, '3 floors'], [12, '4 floors'], [15, '5 floors']]} />
          </div>
        )}

        <h3 className="mt-5 text-base font-semibold">Optional: objects on or near the roof</h3>
        <p className="mt-1 text-sm text-slate-500">Choose what it is, then press and drag over its area on the picture. Panels are kept away from these.</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {ITEMS.map((it) => (
            <button key={it.key} type="button" onClick={() => pick(it)} className={cx('flex items-center gap-2.5 rounded-lg border-2 px-3 py-3 text-left text-sm font-semibold transition', armed === it.key ? 'border-brand bg-brand-soft' : 'border-slate-200 hover:border-slate-300')}>
              <it.icon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden /> {it.label}
            </button>
          ))}
        </div>

        <button type="button" onClick={() => window.confirm('Redraw the roof outline? Objects and panels will be cleared.') && s.set({ sections: [], objects: [], tool: 'draw-section' })} className="mt-4 self-start text-sm font-medium text-slate-500 underline hover:text-slate-800">Redraw roof outline</button>

        <div className="mt-5 text-sm font-semibold">On your roof ({things.length})</div>
        {!things.length && <p className="mt-1 text-sm text-slate-400">Nothing added yet.</p>}
        <div className="mt-2 space-y-2">
          {things.map((o) => {
            const sel = o.id === selectedId;
            const isFloor = o.kind === 'floor';
            const up = (patch) => (isFloor ? s.updateSection(o.id, patch) : s.updateObject(o.id, patch));
            const h = isFloor ? o.height - (main?.height || 0) : o.h;
            const setH = (v) => up(isFloor ? { height: (main?.height || 0) + v } : { h: v });
            return (
              <div key={o.id} onClick={() => s.set({ selectedId: o.id, tool: 'select' })} className={cx('cursor-pointer rounded-lg border-2 p-3', sel ? 'border-brand' : 'border-slate-200')}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{isFloor ? 'Roof on roof' : o.type === 'tree' ? 'Tree' : o.name}</div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); s.remove(o.id); }} className="grid h-8 w-8 place-items-center rounded-full text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {o.type === 'tree' ? `${(o.r * 2 * FT).toFixed(0)} ft wide` : isFloor ? 'panels can also go on top of it' : `${(o.w * FT).toFixed(0)} × ${(o.d * FT).toFixed(0)} ft`} · {(h * FT).toFixed(0)} ft tall
                </div>
                {sel && (
                  <div className="mt-2">
                    <div className="mb-1 text-xs text-slate-500">How tall is it?</div>
                    <Heights value={h} onChange={setH} options={o.type === 'tree' ? [[4, '13 ft'], [6, '20 ft'], [9, '30 ft'], [12, '40 ft']] : [[1, '3 ft'], [1.8, '6 ft'], [2.7, '9 ft · one floor'], [5.4, '18 ft · two floors']]} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
