'use client';

import { Building2, Info, Layers, PenLine, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { buildingList, sectionsOf } from '@/lib/buildings';
import { useStore } from '@/lib/store';
import Editor2D from '../editor/Editor2D';
import { cx } from '../ui';
import { Card, RoundBtn } from './common';

const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

const DRAW_STEPS = [
  'Scroll to zoom in on your house, drag to move the picture.',
  'Click on each corner of your roof, one after another. Lines snap to 90°.',
  'Press Finish outline, or click the first point. Made a mistake? Press Undo last point.',
];
const ADJUST_STEPS = [
  'Drag corners to adjust the outline.',
  'Right-click a corner to delete it.',
  'Add an elevated roof section on top, or another building.',
];

function RoofHelp({ drawing }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const steps = drawing ? DRAW_STEPS : ADJUST_STEPS;
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={ref} className="absolute right-4 top-4 z-20" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="How to mark the roof"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx('grid h-9 w-9 place-items-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-black/5 hover:bg-slate-50', open && 'bg-brand text-brand-fg')}
      >
        <Info className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div role="dialog" aria-label={drawing ? 'How to mark the roof' : 'How to adjust the roof'} className="absolute right-0 top-full mt-2 w-[min(420px,calc(100vw-2rem))] rounded-lg bg-white p-4 text-left shadow-xl ring-1 ring-black/5">
          <div className="text-[15px] font-semibold">{drawing ? 'How to mark the roof' : 'How to adjust the roof'}</div>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function StepDraw({ design }) {
  const tool = useStore((s) => s.tool);
  const set = useStore((s) => s.set);
  const sections = useStore((s) => s.sections);
  const selectedId = useStore((s) => s.selectedId);
  const remove = useStore((s) => s.remove);
  const buildings = buildingList(useStore((s) => s.buildings));
  const buildingId = useStore((s) => s.buildingId);
  const pendingKey = useStore((s) => s.pendingKey);
  const renameBuilding = useStore((s) => s.renameBuilding);
  const removeBuilding = useStore((s) => s.removeBuilding);
  const addingBuilding = tool === 'draw-section' && pendingKey === 'building';

  useEffect(() => {
    if (!useStore.getState().sections.length) set({ tool: 'draw-section' });
  }, [set]);

  return (
    <Editor2D design={design} showPanels={false} showObjects={false} editSections>
      <RoofHelp drawing={tool === 'draw-section'} />
      {tool === 'draw-section' && (
        <div className="absolute bottom-6 right-6 flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => key('Backspace')} className="h-12 rounded-md bg-white px-5 text-sm font-semibold shadow-lg hover:bg-slate-50">Undo last point</button>
          <button type="button" onClick={() => key('Enter')} className="h-12 rounded-md bg-brand px-6 text-sm font-semibold text-brand-fg shadow-lg hover:bg-brand-600">Finish outline</button>
        </div>
      )}
      <div className="absolute left-4 top-4 flex flex-col gap-3">
        <RoundBtn icon={PenLine} label={sections.length ? 'Add elevated roof section' : 'Draw roof outline'} active={tool === 'draw-section' && !addingBuilding} onClick={() => set({ tool: tool === 'draw-section' && !addingBuilding ? 'select' : 'draw-section', pendingKey: null, selectedId: null })} />
        {sections.length > 0 && <RoundBtn icon={Building2} label="Add another building (campus)" active={addingBuilding} onClick={() => set(addingBuilding ? { tool: 'select', pendingKey: null } : { tool: 'draw-section', pendingKey: 'building', selectedId: null })} />}
        <RoundBtn icon={Undo2} label="Cancel drawing (Esc)" disabled={tool !== 'draw-section'} onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))} />
        <RoundBtn icon={Trash2} label="Delete selected section" danger disabled={!selectedId} onClick={() => remove(selectedId)} />
      </div>
      {sections.length > 0 && (
        <Card className="absolute right-4 top-16 max-h-[calc(100%-5rem)] w-64 overflow-y-auto">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4" /> {buildings.length > 1 ? `Buildings (${buildings.length})` : 'Roof sections'}
          </div>
          {buildings.map((b) => (
            <div key={b.id} className="mb-2 last:mb-0">
              {buildings.length > 1 && (
                <div className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <input aria-label="Building name" value={b.name} maxLength={40} onFocus={() => set({ buildingId: b.id })} onChange={(e) => renameBuilding(b.id, e.target.value)} className={`min-w-0 flex-1 rounded px-1 py-0.5 text-[13px] font-semibold outline-none focus:bg-slate-100 ${b.id === buildingId ? 'text-brand' : ''}`} />
                  <button type="button" aria-label={`Delete ${b.name}`} title="Delete building" onClick={() => window.confirm(`Delete ${b.name} and its roof?`) && removeBuilding(b.id)} className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {sectionsOf(sections, buildings, b.id).map((s) => (
                <button key={s.id} type="button" onClick={() => set({ selectedId: s.id, buildingId: b.id })} className={`flex w-full justify-between rounded-lg px-2 py-1.5 text-left text-sm ${s.id === selectedId ? 'bg-brand-soft text-brand' : 'hover:bg-slate-50'}`}>
                  <span>{s.name}</span>
                  <span className="text-slate-400">{s.height} m</span>
                </button>
              ))}
            </div>
          ))}
        </Card>
      )}
    </Editor2D>
  );
}
