'use client';

import { Compass, Copy, Hand, LayoutGrid, Plus, SquareDashedMousePointer, Trash2, Warehouse, Wand2 } from 'lucide-react';
import { autoFillRoof } from '@/lib/autofill';
import { newId } from '@/lib/model';
import { useStore } from '@/lib/store';
import Editor2D from '../editor/Editor2D';
import { Hint, RoundBtn } from './common';
import DesignPanel from './DesignPanel';
import ObjectPanel from './ObjectPanel';

export default function StepManualEdit({ design }) {
  const tool = useStore((s) => s.tool);
  const set = useStore((s) => s.set);
  const config = useStore((s) => s.config);
  const selectedId = useStore((s) => s.selectedId);
  const pick = (t) => set({ tool: tool === t ? 'select' : t, selectedId: null });
  const st = useStore.getState;

  const autoFill = () => autoFillRoof(design);
  const duplicate = () => {
    const o = st().objects.find((x) => x.id === selectedId);
    if (o && o.type !== 'zone') st().addObject({ ...o, id: newId('c'), x: o.x + 2, y: o.y - 2 });
  };
  const hints = {
    'draw-zone': 'Click corners of the area on which you want to place the panels · Enter to finish',
    'add-array': 'Click on the roof to drop a panel array',
    'add-elevated': 'Click to drop an elevated structure — adjust its front leg height in the panel on the right',
  };
  const { totals } = design;

  return (
    <Editor2D design={design}>
      <Hint>{hints[tool] || 'Drag arrays to move · orange handle rotates · select to edit rows, tilt and leg heights'}</Hint>
      <div className="absolute left-4 top-4 flex flex-col gap-3">
        <RoundBtn icon={Wand2} label="Auto-fill whole roof" onClick={autoFill} />
        <RoundBtn icon={SquareDashedMousePointer} label="Draw panel placement zone" active={tool === 'draw-zone'} onClick={() => pick('draw-zone')} />
        <RoundBtn icon={LayoutGrid} label="Add panel array" active={tool === 'add-array'} onClick={() => pick('add-array')} />
        <RoundBtn icon={Warehouse} label="Add elevated structure" active={tool === 'add-elevated'} onClick={() => pick('add-elevated')} />
      </div>
      <div className="absolute right-[346px] top-4 flex gap-2.5">
        <RoundBtn icon={Hand} label="Select / pan" active={tool === 'select'} onClick={() => set({ tool: 'select' })} />
        <RoundBtn icon={Plus} label="Add panel array" onClick={() => pick('add-array')} />
        <RoundBtn icon={Copy} label="Duplicate" disabled={!selectedId} onClick={duplicate} />
        <RoundBtn icon={Trash2} label="Delete" danger disabled={!selectedId} onClick={() => st().remove(selectedId)} />
        <RoundBtn icon={Compass} label={`Arrays face ${design.defaultAzimuth}°`} onClick={() => {}} />
      </div>
      {design.trees.concat(design.blocks).some((o) => o.id === selectedId) && <ObjectPanel design={design} />}
      <DesignPanel design={design} />
      <div onPointerDown={(e) => e.stopPropagation()} className="absolute bottom-4 left-4 right-[346px] flex items-center gap-6 rounded-lg bg-white px-5 py-3 shadow-xl">
        <Stat label="Panels" value={totals.count} />
        <Stat label="Capacity" value={`${totals.kwp.toFixed(2)} kWp`} />
        <Stat label="Energy" value={`${Math.round(totals.acKwh).toLocaleString()} kWh/yr`} />
        <Stat label="Shading loss" value={`${totals.shadeLossPct.toFixed(1)}%`} />
        {totals.invalid > 0 && <span className="text-sm text-red-600">{totals.invalid} array(s) in an invalid position</span>}
        <button type="button" onClick={() => window.confirm('Remove all panels?') && st().set({ objects: st().objects.filter((o) => o.type === 'tree' || o.type === 'block'), selectedId: null })} className="ml-auto text-sm text-slate-500 hover:text-red-600">
          Clear panels
        </button>
      </div>
    </Editor2D>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-[15px] font-semibold">{value}</div>
    </div>
  );
}
