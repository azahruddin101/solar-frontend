'use client';

import { Eye, EyeOff, Info, Loader2, SatelliteDish } from 'lucide-react';
import { SEGMENT_COLORS } from '@/lib/actions';
import { formatNumber } from '@/lib/energy';
import { compassLabel } from '@/lib/geo';
import { useStore } from '@/lib/store';
import { Notice, Section, Stat } from '../ui';

function formatDate(d) {
  if (!d?.year) return '—';
  return new Date(d.year, (d.month || 1) - 1, d.day || 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function summarizeSegments(solarData) {
  const segs = solarData?.solarPotential?.roofSegmentStats || [];
  return segs.map((s, i) => {
    const q = s.stats?.sunshineQuantiles || [];
    return {
      index: i,
      pitch: s.pitchDegrees || 0,
      azimuth: s.azimuthDegrees || 0,
      area: s.stats?.areaMeters2 || 0,
      median: q.length ? q[Math.floor(q.length / 2)] : 0,
      height: s.planeHeightAtCenterMeters,
    };
  });
}

export default function SolarInsights({ showToggle = false }) {
  const solar = useStore((s) => s.solar);
  const showSegments = useStore((s) => s.showSegments);
  const toggleSegments = useStore((s) => s.toggleSegments);

  if (solar.status === 'idle') return null;

  const sp = solar.data?.solarPotential;
  const segments = summarizeSegments(solar.data);
  const maxMedian = Math.max(1, ...segments.map((s) => s.median));

  return (
    <Section
      title="Solar API roof analysis"
      icon={SatelliteDish}
      action={
        showToggle && segments.length > 0 ? (
          <button type="button" onClick={toggleSegments} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            {showSegments ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Segments
          </button>
        ) : null
      }
    >
      {solar.status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Analysing the roof with Google Solar API…
        </div>
      )}
      {solar.status === 'error' && (
        <Notice tone="warn" icon={Info}>
          <b>{solar.error}</b>
          <div className="mt-1 text-xs opacity-80">
            You can still continue — energy estimates will use the built-in sun-path and clear-sky irradiance model.
          </div>
        </Notice>
      )}
      {solar.status === 'ok' && sp && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200">
              {solar.data.imageryQuality || 'UNKNOWN'} quality
            </span>
            <span>Imagery {formatDate(solar.data.imageryDate)}</span>
            {solar.data.postalCode && <span>· {solar.data.postalCode}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Max panels" value={formatNumber(sp.maxArrayPanelsCount)} tone="accent" />
            <Stat label="Max array area" value={formatNumber(sp.maxArrayAreaMeters2)} unit="m²" />
            <Stat label="Peak sunshine" value={formatNumber(sp.maxSunshineHoursPerYear)} unit="h/yr" />
            <Stat label="Roof area" value={formatNumber(sp.wholeRoofStats?.areaMeters2)} unit="m²" />
          </div>
          {segments.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-600">Roof segments ({segments.length})</div>
              <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">#</th>
                      <th className="px-2 py-1.5 text-right font-medium">Pitch</th>
                      <th className="px-2 py-1.5 text-right font-medium">Faces</th>
                      <th className="px-2 py-1.5 text-right font-medium">Area</th>
                      <th className="px-2 py-1.5 text-left font-medium">Sunshine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.slice(0, 12).map((s) => (
                      <tr key={s.index} className="border-t border-slate-100">
                        <td className="px-2 py-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SEGMENT_COLORS[s.index % SEGMENT_COLORS.length] }} />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{s.pitch.toFixed(0)}°</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {s.azimuth.toFixed(0)}° {compassLabel(s.azimuth)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{s.area.toFixed(0)} m²</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full bg-amber-400" style={{ width: `${(s.median / maxMedian) * 100}%` }} />
                            </div>
                            <span className="tabular-nums text-slate-500">{formatNumber(s.median)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">Sunshine = median kWh per kW of panels per year on that segment.</p>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
