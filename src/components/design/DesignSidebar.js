'use client';

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Compass,
  Crosshair,
  Grid3x3,
  LayoutGrid,
  Loader2,
  RotateCw,
  SatelliteDish,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '@/lib/energy';
import { compassLabel, normalizeAzimuth } from '@/lib/geo';
import { edges } from '@/lib/geometry';
import { autoFillPanels, importGooglePanels } from '@/lib/layout';
import { googlePanelSpec, PANEL_PRESETS } from '@/lib/panels';
import { azimuthOfVector, defaultRoofAzimuth, ROOF_TYPES } from '@/lib/roof';
import { sceneApi } from '@/lib/sceneApi';
import { useStore } from '@/lib/store';
import { summarizeSegments } from '../map/SolarInsights';
import { Button, cx, Field, NumberInput, Notice, Section, Segmented, Slider, Stat } from '../ui';

const WALL_COLORS = ['#ebe4d8', '#f5f5f4', '#d6c7b0', '#c9d3dc', '#e8d5c4', '#a8a29e'];
const ROOF_COLORS = ['#9a4b3c', '#5b5f66', '#3f4a3c', '#7c5a3a', '#1f2937', '#b45309'];

function Swatches({ colors, value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cx('h-7 w-7 rounded-full ring-1 ring-slate-300 transition', value === c && 'ring-2 ring-amber-500 ring-offset-2')}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function AzimuthField({ label, value, onChange, disabled, hint }) {
  return (
    <Field label={label} value={`${Math.round(value)}° ${compassLabel(value)}`} hint={hint}>
      <Slider min={0} max={359} value={Math.round(value)} onChange={onChange} disabled={disabled} />
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>N</span>
        <span>E</span>
        <span>S</span>
        <span>W</span>
        <span>N</span>
      </div>
    </Field>
  );
}

/** Recommended roof + array settings from Solar API segments (or sensible defaults). */
function recommendDesign({ solarData, footprint, shape, origin, yieldModel }) {
  const segs = summarizeSegments(solarData);
  const total = segs.reduce((s, x) => s + x.area, 0);
  const pitched = segs.filter((s) => s.pitch >= 10);
  const pitchedArea = pitched.reduce((s, x) => s + x.area, 0);
  const opt = yieldModel?.optimal || { tilt: 15, azimuth: origin.lat >= 0 ? 180 : 0 };
  const array = { tilt: Math.round(opt.tilt), azimuth: Math.round(opt.azimuth) };

  if (total > 0 && pitchedArea / total > 0.5) {
    const largest = pitched.reduce((a, b) => (b.area > a.area ? b : a));
    const avgPitch = pitched.reduce((s, x) => s + x.pitch * x.area, 0) / pitchedArea;
    return {
      building: {
        roofType: shape.convex && pitched.length >= 4 ? 'hip' : 'gable',
        roofPitch: Math.round(avgPitch),
        roofAzimuth: Math.round(largest.azimuth),
      },
      array: { ...array, mount: 'flush' },
    };
  }
  return {
    building: { roofType: 'flat', roofAzimuth: defaultRoofAzimuth(footprint, origin.lat) },
    array: { ...array, mount: 'rack' },
  };
}

export default function DesignSidebar({ design }) {
  const { footprint, shape, roof, spec, yieldModel, poses, totals, solarData, origin, building } = design;
  const solarStatus = useStore((s) => s.solar.status);
  const designInit = useStore((s) => s.designInit);
  const initDesign = useStore((s) => s.initDesign);
  const updateBuilding = useStore((s) => s.updateBuilding);
  const array = useStore((s) => s.array);
  const updateArray = useStore((s) => s.updateArray);
  const panelSpecId = useStore((s) => s.panelSpecId);
  const setPanelSpecId = useStore((s) => s.setPanelSpecId);
  const panels = useStore((s) => s.panels);
  const setPanels = useStore((s) => s.setPanels);
  const autoLayout = useStore((s) => s.autoLayout);
  const selectedId = useStore((s) => s.selectedId);
  const updatePanel = useStore((s) => s.updatePanel);
  const removePanel = useStore((s) => s.removePanel);
  const select = useStore((s) => s.select);
  const setSnapshot = useStore((s) => s.setSnapshot);
  const setStep = useStore((s) => s.setStep);
  const [busy, setBusy] = useState(false);

  const googleSpec = googlePanelSpec(solarData);
  const specs = googleSpec ? [googleSpec, ...PANEL_PRESETS] : PANEL_PRESETS;
  const hasGoogleLayout = Boolean(solarData?.solarPotential?.solarPanels?.length);
  const segs = summarizeSegments(solarData);

  // ---- one-time defaults from Solar API ----
  useEffect(() => {
    if (designInit || !origin || footprint.length < 3 || solarStatus === 'loading') return;
    const rec = recommendDesign({ solarData, footprint, shape, origin, yieldModel });
    initDesign(rec.building, rec.array, googleSpec ? 'google' : 'mono-550');
  }, [designInit, origin, footprint, shape, solarData, solarStatus, yieldModel, googleSpec, initDesign]);

  const runAutoFill = (overrides = {}) => {
    if (!roof) return;
    const list = autoFillPanels({
      roof,
      footprint,
      spec,
      array: { ...useStore.getState().array, ...overrides },
      lat: origin.lat,
      yieldModel,
      maxPanels: useStore.getState().array.maxPanels,
    });
    setPanels(list, true);
  };

  // ---- keep the layout in sync with settings ----
  const layoutKey = JSON.stringify([array, building, spec.id, spec.watts, footprint]);
  const lastKey = useRef(layoutKey);
  useEffect(() => {
    if (lastKey.current === layoutKey) return;
    lastKey.current = layoutKey;
    const st = useStore.getState();
    if (st.autoLayout) {
      runAutoFill();
    } else if (st.panels.length) {
      const a = st.array;
      const next = st.panels.map((p) =>
        p.custom ? p : { ...p, tilt: a.tilt, azimuth: a.azimuth, flush: a.mount === 'flush', orientation: a.orientation },
      );
      setPanels(next, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  const selected = panels.find((p) => p.id === selectedId);
  const selectedPose = poses.find((p) => p.id === selectedId);
  const flushOnPitched = array.mount === 'flush' && roof?.type !== 'flat';
  const efficiency = yieldModel && !flushOnPitched ? yieldModel.factor(array.tilt, array.azimuth) : null;

  const alignToBuilding = () => {
    const target = origin.lat >= 0 ? 180 : 0;
    let best = array.azimuth;
    let bestDiff = 999;
    for (const e of edges(footprint)) {
      const az = azimuthOfVector(e.outward.x, e.outward.y);
      const diff = Math.abs(((az - target + 540) % 360) - 180);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = az;
      }
    }
    updateArray({ azimuth: Math.round(best) });
  };

  const goToReport = async () => {
    setBusy(true);
    select(null);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      setSnapshot((await sceneApi.capture?.()) || null);
    } catch {
      setSnapshot(null);
    }
    setBusy(false);
    setStep(3);
  };

  if (!roof) return null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <h2 className="text-lg font-semibold">Design your system</h2>
        <p className="mt-1 text-sm text-slate-500">Shape the 3D house, then place panels and adjust their tilt and direction.</p>
      </div>

      <Section title="Building" icon={Building2}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Floors">
              <NumberInput value={building.floors} min={1} max={20} onChange={(v) => updateBuilding({ floors: Math.min(20, Math.max(1, Math.round(v))) })} />
            </Field>
            <Field label="Floor height">
              <NumberInput value={building.floorHeight} min={2.4} max={6} step={0.1} suffix="m" onChange={(v) => updateBuilding({ floorHeight: Math.min(6, Math.max(2.4, v)) })} />
            </Field>
          </div>
          <Field label="Roof type">
            <Segmented
              value={building.roofType}
              onChange={(roofType) => updateBuilding({ roofType })}
              options={ROOF_TYPES.map((r) => ({
                ...r,
                disabled: r.id === 'hip' && !shape.convex,
                title: r.id === 'hip' && !shape.convex ? 'Hip roofs need a convex footprint' : undefined,
              }))}
            />
          </Field>
          {roof.type === 'flat' ? (
            <Field label="Parapet height" value={`${building.parapet.toFixed(1)} m`}>
              <Slider min={0} max={1.5} step={0.1} value={building.parapet} onChange={(parapet) => updateBuilding({ parapet })} />
            </Field>
          ) : (
            <>
              <Field label="Roof pitch" value={`${building.roofPitch}°`}>
                <Slider min={5} max={50} value={building.roofPitch} onChange={(roofPitch) => updateBuilding({ roofPitch })} />
              </Field>
              {roof.type !== 'hip' && (
                <AzimuthField
                  label={roof.type === 'gable' ? 'Main slope faces' : 'Slope faces'}
                  value={building.roofAzimuth}
                  onChange={(roofAzimuth) => updateBuilding({ roofAzimuth })}
                />
              )}
              <Field label="Overhang" value={`${building.overhang.toFixed(2)} m`}>
                <Slider min={0} max={1} step={0.05} value={building.overhang} onChange={(overhang) => updateBuilding({ overhang })} />
              </Field>
              <Field label="Roof colour">
                <Swatches colors={ROOF_COLORS} value={building.roofColor} onChange={(roofColor) => updateBuilding({ roofColor })} />
              </Field>
            </>
          )}
          <Field label="Wall colour">
            <Swatches colors={WALL_COLORS} value={building.wallColor} onChange={(wallColor) => updateBuilding({ wallColor })} />
          </Field>
          {segs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const rec = recommendDesign({ solarData, footprint, shape, origin, yieldModel });
                updateBuilding(rec.building);
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800"
            >
              <SatelliteDish className="h-3.5 w-3.5" /> Match roof shape detected by Solar API
            </button>
          )}
          {roof.hipFallback && (
            <Notice tone="warn" icon={AlertTriangle}>
              Hip roofs need a convex footprint — showing a gable roof instead.
            </Notice>
          )}
        </div>
      </Section>

      <Section title="Solar panels" icon={Grid3x3}>
        <div className="space-y-4">
          <Field label="Panel model" hint={`${spec.length.toFixed(2)} × ${spec.width.toFixed(2)} m · ${spec.watts} W`}>
            <select
              value={panelSpecId}
              onChange={(e) => setPanelSpecId(e.target.value)}
              className="h-9 w-full rounded-lg bg-white px-2.5 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-amber-400"
            >
              {specs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.id !== 'google' ? '' : '(Google default)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mounting">
            <Segmented
              value={array.mount}
              onChange={(mount) => updateArray({ mount })}
              options={[
                { id: 'rack', label: 'Tilted rack' },
                { id: 'flush', label: roof.type === 'flat' ? 'Flat (no tilt)' : 'Flush with roof' },
              ]}
            />
          </Field>
          {flushOnPitched ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Flush-mounted panels follow each roof face ({roof.pitch}° pitch). Switch to a tilted rack to set a custom tilt and direction.
            </p>
          ) : array.mount === 'rack' ? (
            <>
              <Field label="Tilt" value={`${array.tilt}°`}>
                <Slider min={0} max={60} value={array.tilt} onChange={(tilt) => updateArray({ tilt })} />
              </Field>
              <AzimuthField label="Facing direction" value={array.azimuth} onChange={(azimuth) => updateArray({ azimuth })} />
            </>
          ) : (
            <AzimuthField label="Row direction" value={array.azimuth} onChange={(azimuth) => updateArray({ azimuth })} />
          )}
          {array.mount === 'rack' && yieldModel && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                icon={Sparkles}
                onClick={() => updateArray({ tilt: Math.round(yieldModel.optimal.tilt), azimuth: Math.round(yieldModel.optimal.azimuth) })}
              >
                Optimal ({Math.round(yieldModel.optimal.tilt)}° {compassLabel(yieldModel.optimal.azimuth)})
              </Button>
              <Button size="sm" icon={Compass} onClick={alignToBuilding}>
                Align to building
              </Button>
            </div>
          )}
          {efficiency !== null && (
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-500">Orientation efficiency</span>
                <span className={cx('font-semibold', efficiency > 0.95 ? 'text-emerald-600' : efficiency > 0.85 ? 'text-amber-600' : 'text-red-600')}>
                  {(efficiency * 100).toFixed(0)}% of optimal
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500" style={{ width: `${Math.min(100, efficiency * 100)}%` }} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Orientation">
              <Segmented
                value={array.orientation}
                onChange={(orientation) => updateArray({ orientation })}
                options={[
                  { id: 'portrait', label: 'Portrait' },
                  { id: 'landscape', label: 'Landscape' },
                ]}
              />
            </Field>
            <Field label="Edge setback">
              <NumberInput value={array.setback} min={0} max={3} step={0.1} suffix="m" onChange={(setback) => updateArray({ setback: Math.min(3, Math.max(0, setback)) })} />
            </Field>
          </div>
          <Field label="Panel limit" hint="0 = fill all usable roof area">
            <NumberInput value={array.maxPanels} min={0} step={1} onChange={(v) => updateArray({ maxPanels: Math.max(0, Math.round(v)) })} />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" icon={LayoutGrid} onClick={() => runAutoFill()} className="col-span-2">
              {panels.length ? 'Re-run auto layout' : 'Auto-fill roof with panels'}
            </Button>
            {hasGoogleLayout && (
              <Button
                size="sm"
                icon={SatelliteDish}
                className="col-span-2"
                onClick={() => {
                  const list = importGooglePanels({ solarData, origin, footprint, maxPanels: array.maxPanels });
                  setPanels(list, false);
                  if (googleSpec) setPanelSpecId('google');
                }}
              >
                Import Google&apos;s recommended layout
              </Button>
            )}
            <Button size="sm" variant="danger" icon={Trash2} disabled={!panels.length} onClick={() => setPanels([], false)} className="col-span-2">
              Remove all panels
            </Button>
          </div>
          {autoLayout && panels.length > 0 && <p className="text-xs text-slate-400">Auto layout is on — changing settings re-flows the panels. Moving or adding a panel switches to manual.</p>}
        </div>
      </Section>

      {selected && selectedPose && (
        <Section title="Selected panel" icon={Crosshair} className="bg-amber-50/60">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Energy" value={formatNumber(totals.perPanel[selected.id] || 0)} unit="kWh/yr" tone="accent" />
              <Stat label="Pose" value={`${selectedPose.tilt.toFixed(0)}° / ${Math.round(selectedPose.azimuth)}°`} />
            </div>
            {!selectedPose.valid && (
              <Notice tone="error" icon={AlertTriangle}>
                {selectedPose.overlap ? 'This panel overlaps another panel.' : 'This panel hangs over the roof edge.'} It is excluded from totals.
              </Notice>
            )}
            <Field label="Mounting">
              <Segmented
                value={selected.flush ? 'flush' : 'rack'}
                onChange={(m) => updatePanel(selected.id, { flush: m === 'flush', custom: true })}
                options={[
                  { id: 'rack', label: 'Tilted rack' },
                  { id: 'flush', label: 'Flush' },
                ]}
              />
            </Field>
            {!selected.flush && (
              <>
                <Field label="Tilt" value={`${selected.tilt}°`}>
                  <Slider min={0} max={60} value={selected.tilt} onChange={(tilt) => updatePanel(selected.id, { tilt, custom: true })} />
                </Field>
                <AzimuthField
                  label="Facing direction"
                  value={selected.azimuth}
                  onChange={(azimuth) => updatePanel(selected.id, { azimuth: normalizeAzimuth(azimuth), custom: true })}
                />
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={RotateCw}
                onClick={() => updatePanel(selected.id, { orientation: selected.orientation === 'portrait' ? 'landscape' : 'portrait', custom: true })}
              >
                Rotate 90°
              </Button>
              <Button
                size="sm"
                icon={Undo2}
                disabled={!selected.custom}
                onClick={() =>
                  updatePanel(selected.id, {
                    tilt: array.tilt,
                    azimuth: array.azimuth,
                    flush: array.mount === 'flush',
                    orientation: array.orientation,
                    custom: false,
                  })
                }
              >
                Use array settings
              </Button>
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => removePanel(selected.id)}>
                Delete
              </Button>
            </div>
            <p className="text-xs text-slate-400">Drag the panel on the roof to move it. Shortcuts: R rotate, Delete remove.</p>
          </div>
        </Section>
      )}

      <div className="sticky bottom-0 mt-auto border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Panels" value={totals.count} />
          <Stat label="System" value={totals.kwp.toFixed(2)} unit="kWp" />
          <Stat label="Energy" value={formatNumber(totals.acKwh)} unit="kWh/yr" tone="accent" />
        </div>
        {totals.invalid > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" /> {totals.invalid} panel{totals.invalid > 1 ? 's' : ''} overlap or overhang (shown red)
          </p>
        )}
        {yieldModel && (
          <p className="mt-2 text-[11px] text-slate-400">
            {yieldModel.source === 'google' ? 'Calibrated with Google Solar API sunshine data.' : 'Estimated with the built-in irradiance model (no Solar API data).'}
          </p>
        )}
        <Button variant="dark" size="lg" className="mt-3 w-full" disabled={!totals.count || busy} icon={busy ? Loader2 : ArrowRight} onClick={goToReport}>
          Review plan &amp; download PDF
        </Button>
      </div>
    </div>
  );
}
