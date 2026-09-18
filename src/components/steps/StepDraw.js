'use client';

import { Layers, PenLine, Trash2, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
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

  useEffect(() => {
    if (!useStore.getState().sections.length) set({ tool: 'draw-section' });
  }, [set]);

  return (
    <Editor2D design={design} showPanels={false} showObjects={false} editSections>
      <Hint>
        {tool === 'draw-section'
          ? 'Click the roof corners · lines snap to 90° · click the first point or press Enter to finish · Backspace undoes'
          : 'Drag corners to adjust · right-click a corner to delete it · add elevated roof sections on top'}
      </Hint>
      {!sections.length && (
        <Card className="absolute bottom-6 left-1/2 w-[420px] -translate-x-1/2">
          <div className="text-[15px] font-semibold">How to mark the roof</div>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
            <li>Scroll to zoom in on your house, drag to move the picture.</li>
            <li>Click on each corner of your roof, one after another.</li>
            <li>Press the green “Done” button. Made a mistake? Press “Undo last point”.</li>
          </ol>
        </Card>
      )}
      {tool !== 'draw-section' && sections.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => useStore.getState().setStep(2)} className="h-14 rounded-lg bg-blue-700 px-8 text-base font-semibold text-white shadow-xl hover:bg-blue-800">
            Roof marked — continue
          </button>
        </div>
      )}
      {tool === 'draw-section' && (
        <div className="absolute bottom-6 right-6 flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => key('Backspace')} className="h-12 rounded-md bg-white px-5 text-sm font-semibold shadow-lg hover:bg-slate-50">Undo last point</button>
          <button type="button" onClick={() => key('Enter')} className="h-12 rounded-md bg-blue-700 px-6 text-sm font-semibold text-white shadow-lg hover:bg-blue-800">Finish outline</button>
        </div>
      )}
      <div className="absolute left-4 top-4 flex flex-col gap-3">
        <RoundBtn icon={PenLine} label={sections.length ? 'Add elevated roof section' : 'Draw roof outline'} active={tool === 'draw-section'} onClick={() => set({ tool: tool === 'draw-section' ? 'select' : 'draw-section', selectedId: null })} />
        <RoundBtn icon={Undo2} label="Cancel drawing (Esc)" disabled={tool !== 'draw-section'} onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))} />
        <RoundBtn icon={Trash2} label="Delete selected section" danger disabled={!selectedId} onClick={() => remove(selectedId)} />
      </div>
      {sections.length > 0 && (
        <Card className="absolute right-4 top-4 w-60">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4" /> Roof sections
          </div>
          {sections.map((s) => (
            <button key={s.id} type="button" onClick={() => set({ selectedId: s.id })} className={`flex w-full justify-between rounded-lg px-2 py-1.5 text-left text-sm ${s.id === selectedId ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'}`}>
              <span>{s.name}</span>
              <span className="text-slate-400">{s.height} m</span>
            </button>
          ))}
        </Card>
      )}
    </Editor2D>
  );
}
