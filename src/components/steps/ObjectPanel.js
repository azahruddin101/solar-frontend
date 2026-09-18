'use client';

import { Copy, Trash2 } from 'lucide-react';
import { newId } from '@/lib/model';
import { useStore } from '@/lib/store';
import { Card, MiniNum } from './common';

const TITLES = { tree: 'Tree', block: 'Obstruction', zone: 'Panel placement zone', array: 'Panel array' };

export default function ObjectPanel({ design }) {
  const id = useStore((s) => s.selectedId);
  const o = useStore((s) => s.objects.find((x) => x.id === id));
  const update = useStore((s) => s.updateObject);
  const remove = useStore((s) => s.remove);
  const add = useStore((s) => s.addObject);
  if (!o) return null;
  const u = (patch) => update(o.id, patch);
  const table = design.tables.find((t) => t.source === o.id && o.type === 'array');
  const zoneCount = o.type === 'zone' ? design.tables.filter((t) => t.source === o.id).reduce((a, t) => a + t.modules.length, 0) : 0;
  const isPanels = o.type === 'array' || o.type === 'zone';

  return (
    <Card className="absolute left-20 top-16 w-72 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{o.elevated ? 'Elevated structure' : TITLES[o.type]}</div>
        <div className="flex gap-1">
          {o.type !== 'zone' && (
            <button type="button" title="Duplicate" onClick={() => add({ ...o, id: newId('c'), x: o.x + 2, y: o.y - 2 })} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100">
              <Copy className="h-4 w-4" />
            </button>
          )}
          <button type="button" title="Delete" onClick={() => remove(o.id)} className="grid h-8 w-8 place-items-center rounded-full text-red-500 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {o.type === 'tree' && (
        <>
          <MiniNum label="Canopy radius" value={o.r} step={0.5} min={0.5} max={15} suffix="m" onChange={(r) => u({ r })} />
          <MiniNum label="Height" value={o.h} step={0.5} min={1} max={40} suffix="m" onChange={(h) => u({ h })} />
        </>
      )}
      {o.type === 'block' && (
        <>
          <input value={o.name} onChange={(e) => u({ name: e.target.value })} className="h-8 w-full rounded-lg border border-slate-300 px-2 text-sm" />
          <MiniNum label="Width" value={o.w} step={0.1} min={0.3} max={30} suffix="m" onChange={(w) => u({ w })} />
          <MiniNum label="Depth" value={o.d} step={0.1} min={0.3} max={30} suffix="m" onChange={(d) => u({ d })} />
          <MiniNum label="Height" value={o.h} step={0.1} min={0.2} max={15} suffix="m" onChange={(h) => u({ h })} />
          <MiniNum label="Rotation" value={Math.round(o.rot || 0)} step={5} min={-360} max={360} suffix="°" onChange={(rot) => u({ rot })} />
        </>
      )}
      {isPanels && (
        <>
          {o.type === 'array' ? (
            <>
              <MiniNum label="Rows" value={o.rows} min={1} max={10} onChange={(rows) => u({ rows: Math.round(rows) })} />
              <MiniNum label="Columns" value={o.cols} min={1} max={40} onChange={(cols) => u({ cols: Math.round(cols) })} />
            </>
          ) : (
            <>
              <MiniNum label="Rows per table" value={o.rowsPerTable} min={1} max={6} onChange={(v) => u({ rowsPerTable: Math.round(v) })} />
              <MiniNum label="Row gap (0 = auto)" value={o.rowGap} step={0.1} min={0} max={10} suffix="m" onChange={(rowGap) => u({ rowGap })} />
            </>
          )}
          <MiniNum label="Tilt" value={o.tilt} min={0} max={45} suffix="°" onChange={(tilt) => u({ tilt })} />
          <MiniNum label="Facing (azimuth)" value={o.azimuth} step={5} min={0} max={359} suffix="°" onChange={(azimuth) => u({ azimuth })} />
          <MiniNum label="Front leg height" value={o.frontLeg} step={0.1} min={0.1} max={6} suffix="m" onChange={(frontLeg) => u({ frontLeg })} />
          {table && (
            <div className="flex justify-between text-sm text-slate-600">
              <span>Back leg height</span>
              <span className="font-medium">{table.backLeg.toFixed(2)} m</span>
            </div>
          )}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium">
            {['portrait', 'landscape'].map((k) => (
              <button key={k} type="button" onClick={() => u({ orientation: k })} className={`h-7 flex-1 rounded-md capitalize ${o.orientation === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
                {k}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
            {o.type === 'zone' ? `${zoneCount} panels auto-placed in this zone` : table?.valid ? `${table.modules.length} panels · ${((table.modules.length * design.spec.watts) / 1000).toFixed(2)} kWp` : <span className="text-red-600">{table?.reason}</span>}
          </div>
        </>
      )}
    </Card>
  );
}
