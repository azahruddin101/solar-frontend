'use client';

import { Box, FileText, MapPin, PenTool, RotateCcw, Sun } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { distanceMeters } from '@/lib/geo';
import { useStore } from '@/lib/store';
import { useDesign } from '@/lib/useDesign';
import DesignSidebar from './design/DesignSidebar';
import LocateSidebar from './map/LocateSidebar';
import OutlineSidebar from './map/OutlineSidebar';
import ReportSidebar from './report/ReportSidebar';
import ReportView from './report/ReportView';
import { cx } from './ui';
import MapView from './map/MapView';

const Scene3D = dynamic(() => import('./three/Scene3D'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Loading 3D engine…</div>,
});

const STEPS = [
  { label: 'Locate', icon: MapPin },
  { label: 'Outline roof', icon: PenTool },
  { label: '3D design', icon: Box },
  { label: 'Report', icon: FileText },
];

function useSolarInsights() {
  const origin = useStore((s) => s.origin);
  const place = useStore((s) => s.place);
  const setSolar = useStore((s) => s.setSolar);

  useEffect(() => {
    const target = origin || place?.location;
    if (!target) return;
    const key = `${target.lat.toFixed(6)},${target.lng.toFixed(6)}`;
    const current = useStore.getState().solar;
    if (current.key === key && (current.status === 'ok' || current.status === 'error')) return;
    // A request for a spot a few metres away returns the same building.
    if (current.status === 'ok' && current.key) {
      const [lat, lng] = current.key.split(',').map(Number);
      if (distanceMeters({ lat, lng }, target) < 12) return;
    }
    const ctrl = new AbortController();
    setSolar({ status: 'loading', key, error: null });
    fetch(`/api/solar?lat=${target.lat}&lng=${target.lng}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `Solar API error ${r.status}`);
        setSolar({ status: 'ok', data: body, error: null });
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setSolar({ status: 'error', data: null, error: e.message });
      });
    return () => ctrl.abort();
  }, [origin, place, setSolar]);
}

function canEnter(step, s, design) {
  if (step === 0) return true;
  if (step === 1) return Boolean(s.place || s.polygon.length);
  if (step === 2) return s.closed && design.footprint.length >= 3 && design.shape.simple;
  return canEnter(2, s, design) && design.totals.count > 0;
}

export default function App() {
  useSolarInsights();
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const resetAll = useStore((s) => s.resetAll);
  const state = useStore();
  const design = useDesign();

  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900 px-4 text-white">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500 text-slate-950">
            <Sun className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Rooftop Solar Planner</div>
            <div className="hidden text-[11px] text-slate-400 sm:block">Google Solar API · 3D design · PDF plan</div>
          </div>
        </div>
        <nav className="mx-auto flex items-center gap-1 overflow-x-auto">
          {STEPS.map((st, i) => {
            const enabled = canEnter(i, state, design);
            const Icon = st.icon;
            return (
              <div key={st.label} className="flex items-center">
                {i > 0 && <div className={cx('mx-1 h-px w-4 sm:w-8', i <= step ? 'bg-amber-500' : 'bg-slate-700')} />}
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => setStep(i)}
                  className={cx(
                    'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    i === step ? 'bg-amber-500 text-slate-950' : enabled ? 'text-slate-200 hover:bg-slate-800' : 'cursor-not-allowed text-slate-600',
                  )}
                >
                  <span
                    className={cx(
                      'grid h-5 w-5 place-items-center rounded-full text-[11px]',
                      i === step ? 'bg-slate-950/15' : i < step ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800',
                    )}
                  >
                    {i + 1}
                  </span>
                  <Icon className="h-3.5 w-3.5 sm:hidden" />
                  <span className="hidden sm:inline">{st.label}</span>
                </button>
              </div>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Start a new project? The current design will be cleared.')) resetAll();
          }}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden md:inline">New project</span>
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 min-h-0 flex-1 overflow-y-auto border-slate-200 bg-white lg:order-1 lg:w-[390px] lg:flex-none lg:border-r">
          {step === 0 && <LocateSidebar />}
          {step === 1 && <OutlineSidebar design={design} />}
          {step === 2 && <DesignSidebar design={design} />}
          {step === 3 && <ReportSidebar design={design} />}
        </aside>
        <section className="relative order-1 h-[55vh] shrink-0 lg:order-2 lg:h-auto lg:flex-1">
          {step <= 1 && <MapView design={design} />}
          {step === 2 && <Scene3D design={design} />}
          {step === 3 && <ReportView design={design} />}
        </section>
      </main>
    </div>
  );
}
