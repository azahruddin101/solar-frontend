'use client';

import { Building2 } from 'lucide-react';
import { buildingIdOf, buildingList } from '@/lib/buildings';
import { polygonArea } from '@/lib/geometry';
import { useStore } from '@/lib/store';
import { FormPage, Num } from './common';

export default function StepRoofDetails() {
  const sections = useStore((s) => s.sections);
  const update = useStore((s) => s.updateSection);
  const buildings = buildingList(useStore((s) => s.buildings));
  const renameBuilding = useStore((s) => s.renameBuilding);
  return (
    <FormPage icon={Building2} title="Roof Height & Parapet Walls">
      <p className="text-sm text-slate-500">RCC roof. Heights are measured from the ground; parapet walls cast shadows and define the usable area.</p>
      {buildings.map((b) => (
        <div key={b.id} className="space-y-4">
          {buildings.length > 1 && (
            <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
              <Building2 className="h-4 w-4 text-slate-400" />
              <input aria-label="Building name" value={b.name} maxLength={40} onChange={(e) => renameBuilding(b.id, e.target.value)} className="min-w-0 flex-1 text-base font-bold outline-none" />
            </div>
          )}
          {sections.filter((s) => buildingIdOf(s, buildings) === b.id).map((s) => (
        <div key={s.id} className="rounded-lg border border-slate-200 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} className="text-lg font-semibold outline-none" />
            <span className="text-sm text-slate-400">{polygonArea(s.points).toFixed(1)} m²</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Num label="Roof height" value={s.height} min={1} max={150} step={0.5} suffix="m" onChange={(height) => update(s.id, { height })} />
            <Num label="Parapet height" value={s.parapetH} min={0} max={3} suffix="m" onChange={(parapetH) => update(s.id, { parapetH })} />
            <Num label="Parapet thickness" value={s.parapetT} min={0.1} max={0.6} step={0.01} suffix="m" onChange={(parapetT) => update(s.id, { parapetT })} />
          </div>
        </div>
          ))}
        </div>
      ))}
    </FormPage>
  );
}
