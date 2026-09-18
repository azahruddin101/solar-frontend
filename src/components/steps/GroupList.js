'use client';

// Panel groups: each group is an independent block of panels with its own tilt, height, size.

import { ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { polygonCentroid } from '@/lib/geometry';
import { newId } from '@/lib/model';
import { useStore } from '@/lib/store';
import { cx } from '../ui';
import { Adjust } from './DesignPanel';

const FT = 3.281;

export default function GroupList({ design }) {
  const s = useStore();
  const groups = s.objects.filter((o) => o.type === 'array');
  const { spec } = design;

  const add = () => {
    const sec = design.sections[0];
    const c = sec ? polygonCentroid(sec.poly) : { x: 0, y: 0 };
    s.addObject({ id: newId('g'), type: 'array', name: `Group ${groups.length + 1}`, x: c.x, y: c.y, rows: s.config.rowsPerTable, cols: 4, tilt: s.config.tilt, azimuth: design.defaultAzimuth, frontLeg: s.config.frontLeg, orientation: s.config.orientation });
  };

  return (
    <div className="space-y-2">
      {groups.map((g, i) => {
        const open = g.id === s.selectedId;
        const t = design.tables.find((x) => x.source === g.id);
        const u = (patch) => s.updateObject(g.id, patch);
        const n = g.rows * g.cols;
        return (
          <div key={g.id} className={cx('overflow-hidden rounded-xl border transition', open ? 'border-[#f5a524] ring-2 ring-[#f5a524]/30' : 'border-slate-200')}>
            <button type="button" onClick={() => s.set({ selectedId: open ? null : g.id })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
              <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white', t?.valid === false ? 'bg-red-500' : 'bg-blue-600')}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{g.name || `Group ${i + 1}`}</span>
                <span className="block text-xs text-slate-500">
                  {n} panels · {((n * spec.watts) / 1000).toFixed(1)} kW · tilt {g.tilt}° · {g.frontLeg.toFixed(1)} m high
                </span>
              </span>
              <ChevronDown className={cx('h-4 w-4 text-slate-400 transition', open && 'rotate-180')} />
            </button>
            {open && (
              <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-3">
                {t?.valid === false && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">{t.reason} — open “Move panels” and drag this group to a free spot, or make it smaller.</p>}
                <input value={g.name || ''} placeholder={`Group ${i + 1}`} onChange={(e) => u({ name: e.target.value })} className="h-8 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-blue-600" />
                <Adjust label="Tilt" value={g.tilt} min={0} max={45} suffix="°" onChange={(tilt) => u({ tilt })} />
                <Adjust label={`Height (front leg) · ${(g.frontLeg * FT).toFixed(1)} ft`} value={g.frontLeg} min={0.2} max={4} step={0.05} suffix="m" onChange={(frontLeg) => u({ frontLeg })} />
                {t && <p className="-mt-1 text-xs text-slate-500">Back leg: <b>{t.backLeg.toFixed(2)} m</b> · {t.legs.length} iron columns</p>}
                <div className="grid grid-cols-2 gap-3">
                  <Adjust label="Rows" value={g.rows} min={1} max={8} onChange={(rows) => u({ rows })} />
                  <Adjust label="Panels per row" value={g.cols} min={1} max={40} onChange={(cols) => u({ cols })} />
                </div>
                <Adjust label="Facing direction (180 = south)" value={g.azimuth} min={0} max={359} suffix="°" onChange={(azimuth) => u({ azimuth })} />
                <div className="flex gap-1 rounded-lg bg-slate-200/70 p-1 text-xs font-medium">
                  {['portrait', 'landscape'].map((k) => (
                    <button key={k} type="button" onClick={() => u({ orientation: k })} className={cx('h-7 flex-1 rounded-md capitalize', g.orientation === k ? 'bg-white shadow-sm' : 'text-slate-500')}>
                      {k}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => s.addObject({ ...g, id: newId('g'), name: `${g.name || 'Group'} copy`, x: g.x + 2, y: g.y - 2 })} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium hover:bg-slate-50">
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </button>
                  <button type="button" onClick={() => s.remove(g.id)} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" onClick={add} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50">
        <Plus className="h-4 w-4" /> Add a panel group
      </button>
    </div>
  );
}
