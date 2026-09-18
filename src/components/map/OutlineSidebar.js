'use client';

import { AlertTriangle, ArrowRight, Box, Check, PenTool, RotateCcw, ScanSearch, Undo2 } from 'lucide-react';
import { finishPolygon, polygonFromSolarBounds, undoPoint } from '@/lib/actions';
import { useStore } from '@/lib/store';
import { Button, Kbd, Notice, Section, Stat } from '../ui';
import SolarInsights from './SolarInsights';

export default function OutlineSidebar({ design }) {
  const polygon = useStore((s) => s.polygon);
  const closed = useStore((s) => s.closed);
  const clearPolygon = useStore((s) => s.clearPolygon);
  const setStep = useStore((s) => s.setStep);
  const panels = useStore((s) => s.panels);
  const solar = useStore((s) => s.solar);
  const { shape } = design;
  const hasBounds = Boolean(solar.data?.boundingBox);

  return (
    <div>
      <div className="px-5 pb-4 pt-5">
        <h2 className="text-lg font-semibold">Outline the roof</h2>
        <p className="mt-1 text-sm text-slate-500">Trace the building&apos;s roof edge on the satellite image. This footprint becomes the 3D model.</p>
      </div>

      <Section title="Footprint" icon={PenTool}>
        {!closed ? (
          <>
            <ul className="space-y-1.5 text-[13px] text-slate-600">
              <li>• Click each corner of the roof in order.</li>
              <li>
                • Click the first point or press <Kbd>Enter</Kbd> to close the shape.
              </li>
              <li>
                • <Kbd>⌫</Kbd> removes the last point, <Kbd>Esc</Kbd> starts over.
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" icon={Undo2} disabled={!polygon.length} onClick={undoPoint}>
                Undo point
              </Button>
              <Button size="sm" variant="dark" icon={Check} disabled={polygon.length < 3} onClick={finishPolygon}>
                Finish shape
              </Button>
            </div>
            {hasBounds && (
              <button
                type="button"
                onClick={polygonFromSolarBounds}
                className="mt-4 flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800"
              >
                <ScanSearch className="h-3.5 w-3.5" /> Start from the Solar API building bounds
              </button>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Area" value={shape.area.toFixed(1)} unit="m²" tone="accent" />
              <Stat label="Perimeter" value={shape.perimeter.toFixed(1)} unit="m" />
              <Stat label="Corners" value={design.footprint.length} />
            </div>
            {!shape.simple && (
              <Notice tone="error" icon={AlertTriangle} className="mt-3">
                The outline crosses itself. Drag the corners so the edges don&apos;t intersect.
              </Notice>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={RotateCcw}
                onClick={() => {
                  if (!panels.length || window.confirm('Redrawing removes the panels you placed. Continue?')) clearPolygon();
                }}
              >
                Redraw
              </Button>
            </div>
            <p className="mt-3 text-xs text-slate-400">Drag a corner to move it. Drag the small mid-point handles to add corners. Right-click a corner to delete it.</p>
          </>
        )}
      </Section>

      <SolarInsights showToggle />

      <div className="px-5 py-5">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          icon={closed ? Box : ArrowRight}
          disabled={!closed || !shape.simple}
          onClick={() => setStep(2)}
        >
          Build 3D model
        </Button>
        {!closed && <p className="mt-2 text-center text-xs text-slate-400">Close the outline to continue</p>}
      </div>
    </div>
  );
}
