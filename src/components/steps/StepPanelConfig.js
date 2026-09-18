'use client';

import { Grid3x3 } from 'lucide-react';
import { compassLabel } from '@/lib/geo';
import { autoRowGap, moduleDims } from '@/lib/model';
import { useStore } from '@/lib/store';
import { Choice, FormPage, inputCls, Label, Num } from './common';

export default function StepPanelConfig({ design }) {
  const c = useStore((s) => s.config);
  const patch = useStore((s) => s.patch);
  const u = (p) => patch('config', p);
  const spec = design.spec;
  const slopeLen = moduleDims(spec, c.orientation).slope * c.rowsPerTable;
  const gap = autoRowGap(c.tilt, slopeLen, design.lat);
  const opt = design.yieldModel.optimal;
  const az = design.defaultAzimuth;
  const eff = design.yieldModel.factor(c.tilt, az) * 100;

  return (
    <FormPage icon={Grid3x3} title="Panel & Mounting Structure">
      <div>
        <Label>Solar Panel</Label>
        <select className={inputCls} value={spec.id} onChange={(e) => u({ specId: e.target.value })}>
          {design.catalog.panels.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.length} × {p.width} m — {p.price}/panel
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Pillar type</Label>
        <select className={inputCls} value={design.pillar.id} onChange={(e) => u({ pillarId: e.target.value })}>
          {design.catalog.pillars.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.shape}) — {p.pricePerFt}/ft
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Panel Orientation</Label>
        <Choice value={c.orientation} onChange={(orientation) => u({ orientation })} options={[{ id: 'portrait', label: 'Portrait' }, { id: 'landscape', label: 'Landscape' }]} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Num label={`Tilt angle (optimal ${Math.round(opt.tilt)}°)`} value={c.tilt} step={1} min={0} max={45} suffix="°" onChange={(tilt) => u({ tilt })} />
        <Num label="Rows per table" value={c.rowsPerTable} step={1} min={1} max={6} onChange={(v) => u({ rowsPerTable: Math.round(v) })} />
        <Num label="Front leg height" value={c.frontLeg} min={0.1} max={6} suffix="m" onChange={(frontLeg) => u({ frontLeg })} />
        <Num label="Setback from parapet" value={c.setback} min={0} max={5} suffix="m" onChange={(setback) => u({ setback })} />
      </div>
      <div>
        <Label>Array Direction</Label>
        <Choice
          value={c.azimuthMode}
          onChange={(azimuthMode) => u({ azimuthMode })}
          options={[{ id: 'building', label: 'Align to building' }, { id: 'south', label: design.lat >= 0 ? 'True south' : 'True north' }, { id: 'custom', label: 'Custom' }]}
        />
        {c.azimuthMode === 'custom' && (
          <div className="mt-3">
            <Num label="Azimuth (0 = N, 180 = S)" value={c.azimuth} step={5} min={0} max={359} suffix="°" onChange={(azimuth) => u({ azimuth })} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
        <div>
          <div className="text-slate-500">Facing</div>
          <div className="font-semibold">{az}° {compassLabel(az)}</div>
        </div>
        <div>
          <div className="text-slate-500">Row gap (shadow-free)</div>
          <div className="font-semibold">{gap.toFixed(2)} m</div>
        </div>
        <div>
          <div className="text-slate-500">Orientation efficiency</div>
          <div className="font-semibold">{eff.toFixed(0)}% of optimal</div>
        </div>
      </div>
      <p className="text-sm text-slate-500">These defaults are used for auto-layout and new arrays in the next step. Every array can be adjusted individually there.</p>
    </FormPage>
  );
}
