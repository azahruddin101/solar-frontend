'use client';

import { Building2, Layers, PenLine, Trash2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { buildingList, sectionsOf } from '@/lib/buildings';
import { useStore } from '@/lib/store';
import Editor2D from '../editor/Editor2D';
import { Card, Hint, RoundBtn } from './common';

const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

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
      <Hint>
        {tool === 'draw-section'
          ? 'Click the roof corners · lines snap to 90° · click the first point or press Enter to finish · Backspace undoes'
          : 'Drag corners to adjust · right-click a corner to delete it · add elevated roof sections on top, or another building'}
      </Hint>
      {!sections.length && (
        <Card className="absolute top-6 right-0 w-[420px] -translate-x-1/2">
          <div className="text-[15px] font-semibold">How to mark the roof</div>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
            <li>Scroll to zoom in on your house, drag to move the picture.</li>
            <li>Click on each corner of your roof, one after another.</li>
            <li>Press the green “Done” button. Made a mistake? Press “Undo last point”.</li>
          </ol>
        </Card>
      )}
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
        <Card className="absolute right-4 top-4 max-h-[calc(100%-2rem)] w-64 overflow-y-auto">
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
