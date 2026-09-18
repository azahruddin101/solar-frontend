'use client';

// "What is on your roof?" — big buttons, tap to place, drag to move, corner to resize.

import { Building2, Cylinder, DoorOpen, Package, Trash2, TreePine } from 'lucide-react';
import { polygonCentroid, rectPoly } from '@/lib/geometry';
import { newId } from '@/lib/model';
import { useStore } from '@/lib/store';
import Editor2D from '../editor/Editor2D';
import { cx } from '../ui';

const FT = 3.281;
const ITEMS = [
  { key: 'tank', icon: Cylinder, label: 'Water tank', tool: 'add-block', preset: { name: 'Water tank', w: 1.5, d: 1.5, h: 1.8 } },
  { key: 'stair', icon: DoorOpen, label: 'Staircase room', tool: 'add-block', preset: { name: 'Staircase room', w: 3, d: 3, h: 2.7 } },
  { key: 'floor', icon: Building2, label: 'Room / floor on top', tool: 'draw-section' },
  { key: 'tree', icon: TreePine, label: 'Tree near roof', tool: 'add-tree' },
  { key: 'other', icon: Package, label: 'AC / dish / other', tool: 'add-block', preset: { name: 'Other', w: 1, d: 1, h: 1 } },
];
const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

function Heights({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={l} type="button" onClick={() => onChange(v)} className={cx('rounded-full border px-3 py-1 text-xs font-medium', Math.abs(value - v) < 0.01 ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
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
  const things = [...sections.slice(1).map((x) => ({ ...x, kind: 'floor' })), ...objects.filter((o) => o.type === 'block' || o.type === 'tree')];

  // one tap: the object appears on the roof, already selected — the user only drags it into place
  const pick = (it) => {
    if (!main) return;
    const c = polygonCentroid(main.points);
    const n = things.length;
    const at = { x: c.x + ((n % 3) - 1) * 2.5, y: c.y - Math.floor(n / 3) * 2.5 };
    const rot = design.defaultAzimuth;
    if (it.key === 'tree') {
      const maxX = Math.max(...main.points.map((p) => p.x));
      s.addObject({ id: newId('t'), type: 'tree', x: maxX + 3, y: c.y, r: 2.5, h: 8 });
    } else if (it.key === 'floor') {
      s.addSection({ id: newId('r'), name: 'Room / floor on top', points: rectPoly(at.x, at.y, 4, 4, rot), height: main.height + 2.7, parapetH: 0.3, parapetT: 0.2 });
    } else {
      s.addObject({ id: newId('b'), type: 'block', ...it.preset, x: at.x, y: at.y, rot });
    }
  };
  const hint = things.length ? 'Drag an object to where it really is · pull a white dot to resize' : 'Nothing on the roof? Just press Continue';

  return (
    <>
      <div className="absolute inset-y-0 left-0 right-[400px]">
        <Editor2D design={design} showPanels={false} editSections={tool === 'draw-section' || sections.slice(1).some((x) => x.id === selectedId)}>
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-slate-900/85 px-5 py-2 text-sm text-white shadow-lg">{hint}</div>
          {tool === 'draw-section' && (
            <div className="absolute bottom-6 right-6 flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => key('Backspace')} className="h-12 rounded-md bg-white px-5 text-sm font-semibold shadow-lg">Undo last point</button>
              <button type="button" onClick={() => key('Enter')} className="h-12 rounded-md bg-blue-700 px-6 text-sm font-semibold text-white shadow-lg">Done</button>
            </div>
          )}
        </Editor2D>
      </div>

      <aside className="absolute inset-y-0 right-0 flex w-[400px] flex-col overflow-y-auto border-l border-slate-200 bg-white px-6 py-5">
        <h2 className="text-[22px] font-bold leading-tight">Roof marked</h2>
        <p className="mt-1 text-sm font-medium text-blue-800">Press Continue to see the solar plan.</p>
        <h3 className="mt-5 text-base font-semibold">Optional: objects on or near the roof</h3>
        <p className="mt-1 text-sm text-slate-500">Tap one to add it, then drag it to the right place on the picture. Panels are kept away from these.</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {ITEMS.map((it) => (
            <button key={it.key} type="button" onClick={() => pick(it)} className={cx('flex items-center gap-2.5 rounded-lg border-2 px-3 py-3 text-left text-sm font-semibold transition', 'border-slate-200 hover:border-blue-700 hover:bg-blue-50')}>
              <it.icon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden /> {it.label}
            </button>
          ))}
        </div>

        {main && (
          <div className="mt-5 rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">Boundary wall around the roof</div>
            <Heights value={main.parapetH} onChange={(parapetH) => s.updateSection(main.id, { parapetH })} options={[[0, 'No wall'], [0.5, 'Low · 1.5 ft'], [1, 'Normal · 3 ft'], [1.5, 'High · 5 ft']]} />
            <div className="mb-2 mt-3 text-sm font-semibold">Building height</div>
            <Heights value={main.height} onChange={(height) => s.updateSection(main.id, { height })} options={[[3, '1 floor'], [6, '2 floors'], [9, '3 floors'], [12, '4 floors'], [15, '5 floors']]} />
          </div>
        )}

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
              <div key={o.id} onClick={() => s.set({ selectedId: o.id, tool: 'select' })} className={cx('cursor-pointer rounded-lg border-2 p-3', sel ? 'border-blue-700' : 'border-slate-200')}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{isFloor ? 'Room / floor on top' : o.type === 'tree' ? 'Tree' : o.name}</div>
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
