'use client';

import { ArrowLeft, CircleHelp, Home, Save } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { STEPS, useStore } from '@/lib/store';
import { useDesign } from '@/lib/useDesign';
import { sceneApi } from './scene/Scene3D';
import StepDraw from './steps/StepDraw';
import StepElectrical from './steps/StepElectrical';
import StepFinancials from './steps/StepFinancials';
import StepLocation from './steps/StepLocation';
import StepManualEdit from './steps/StepManualEdit';
import StepObstructions from './steps/StepObstructions';
import StepPanelConfig from './steps/StepPanelConfig';
import StepReport from './steps/StepReport';
import StepRoofDetails from './steps/StepRoofDetails';

const Step3D = dynamic(() => import('./steps/Step3D'), { ssr: false });

function useSolar() {
  const origin = useStore((s) => s.origin);
  const patch = useStore((s) => s.patch);
  useEffect(() => {
    if (!origin) return undefined;
    const ctrl = new AbortController();
    patch('solar', { status: 'loading', error: null });
    fetch(`/api/solar?lat=${origin.lat}&lng=${origin.lng}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `Solar API error ${r.status}`);
        patch('solar', { status: 'ok', data: body });
      })
      .catch((e) => !ctrl.signal.aborted && patch('solar', { status: 'error', data: null, error: e.message }));
    return () => ctrl.abort();
  }, [origin, patch]);
}

export default function App() {
  useSolar();
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const state = useStore();
  const design = useDesign();
  const [saved, setSaved] = useState(false);

  const blockers = [
    !state.origin && 'Confirm the installation location',
    !design.sections.length && 'Draw the roof outline',
    null,
    null,
    null,
    !design.totals.count && 'Place at least one panel',
    null,
    null,
    null,
    null,
  ];
  const blocker = blockers[step];
  const screens = [StepLocation, StepDraw, StepRoofDetails, StepObstructions, StepPanelConfig, StepManualEdit, Step3D, StepElectrical, StepFinancials, StepReport];
  const Screen = screens[step];

  const next = () => {
    if (blocker) return;
    if (step === 6) state.set({ snapshot: sceneApi.capture?.() || state.snapshot });
    setStep(step + 1);
  };

  return (
    <div className="flex h-dvh flex-col bg-white text-slate-900">
      <header className="relative flex h-16 shrink-0 items-center gap-3 px-5">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="grid h-9 w-9 place-items-center rounded-full text-slate-700 hover:bg-slate-100 disabled:opacity-30">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-[15px] font-semibold">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {blocker && <span className="mr-2 hidden text-xs text-slate-400 sm:inline">{blocker}</span>}
          <button type="button" title="Saved automatically" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1500); }} className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100">
            <Save className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="New project" onClick={() => window.confirm('Start a new project? This clears the current design.') && state.reset()} className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100">
            <Home className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="Scroll to zoom · drag to pan · Delete removes the selection" className="grid h-9 w-9 place-items-center rounded-full text-slate-300">
            <CircleHelp className="h-[18px] w-[18px]" />
          </button>
          {step < STEPS.length - 1 && (
            <button type="button" onClick={next} disabled={Boolean(blocker)} className="ml-2 h-10 rounded-lg bg-[#0f172a] px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
              Next
            </button>
          )}
        </div>
        {saved && <div className="absolute right-40 top-5 rounded bg-slate-900 px-2 py-1 text-xs text-white">Saved</div>}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-100">
          <div className="h-full bg-slate-700 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        <Screen design={design} />
      </main>
    </div>
  );
}
