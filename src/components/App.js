'use client';

import { ArrowLeft, ArrowRight, Check, Sun } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PRO_SLUGS, SIMPLE_SLUGS, SIMPLE_STEPS, STEPS, useStore } from '@/lib/store';
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
import StepRoof from './steps/StepRoof';
import { cx } from './ui';

const StepSimpleDesign = dynamic(() => import('./steps/StepSimpleDesign'), { ssr: false });
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

function useCatalog() {
  const set = useStore((s) => s.set);
  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((catalog) => {
        const st = useStore.getState();
        set({ catalog, finance: { ...st.finance, currency: catalog.currency, tariff: catalog.tariff, init: true } });
      })
      .catch(() => {});
  }, [set]);
}

const SIMPLE_SCREENS = [StepLocation, StepRoof, StepSimpleDesign];
const PRO_SCREENS = [StepLocation, StepDraw, StepRoofDetails, StepObstructions, StepPanelConfig, StepManualEdit, Step3D, StepElectrical, StepFinancials, StepReport];

export default function App({ slug }) {
  useSolar();
  useCatalog();
  const router = useRouter();
  const state = useStore();
  const design = useDesign();

  // one flow only: Location → Roof → Solar plan
  const simple = true;
  const slugs = SIMPLE_SLUGS;
  const names = SIMPLE_STEPS;
  const screens = SIMPLE_SCREENS;
  const step = Math.max(0, slugs.indexOf(slug));
  const Screen = screens[step];

  const ready = [Boolean(state.origin), design.sections.length > 0];
  const reachable = (i) => i === 0 || (ready[0] && (i === 1 || ready[1]));

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new')) {
      useStore.getState().reset();
      router.replace('/design/location');
    }
  }, [router]);

  useEffect(() => {
    const st = useStore.getState();
    st.set({ step, mode: 'simple', tool: 'select', selectedId: null, navigate: (i) => router.push(`/design/${slugs[Math.max(0, Math.min(slugs.length - 1, i))]}`) });
    if (!slugs.includes(slug)) router.replace(`/design/${['roof-details', 'obstructions', 'obstacles'].includes(slug) ? 'roof' : PRO_SLUGS.includes(slug) ? 'plan' : 'location'}`);
    else if (step > 0 && !st.origin) router.replace('/design/location');
    else if (step > 1 && !st.sections.length) router.replace('/design/roof');
  }, [slug, step, simple, slugs, router]);

  const blocker =
    Screen === StepLocation ? !ready[0] && 'Confirm the location to continue'
    : Screen === StepDraw || Screen === StepRoof ? !ready[1] && 'Mark the roof outline to continue'
    : Screen === StepManualEdit ? !design.totals.count && 'Place at least one panel'
    : null;

  const go = (i) => {
    if (Screen === Step3D) state.set({ snapshot: sceneApi.capture?.() || state.snapshot });
    state.setStep(i);
  };
  const switchMode = () => {
    const map = simple ? [0, 1, 5] : [0, 1, 1, 1, 2, 2, 2, 2, 2, 2];
    const target = (simple ? PRO_SLUGS : SIMPLE_SLUGS)[map[step] ?? 0];
    state.set({ mode: simple ? 'pro' : 'simple' });
    router.push(`/design/${target}`);
  };
  const last = step === slugs.length - 1;

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold" aria-label="Solar Planner home">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-700 text-white"><Sun className="h-4 w-4" /></span>
          <span className="hidden sm:inline">Solar Planner</span>
        </Link>
        <div className="hidden min-w-0 border-l border-slate-200 pl-4 text-sm text-slate-500 md:block">
          <span className="block max-w-[280px] truncate">{state.place?.address || 'New project'}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-slate-400 lg:inline">Saved automatically</span>
          <button type="button" onClick={() => window.confirm('Start a new project? The current design will be cleared.') && router.push('/design/location?new=1')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
            New project
          </button>
        </div>
      </header>

      <nav aria-label="Progress" className="shrink-0 overflow-x-auto border-b border-slate-200 bg-white px-5">
        <ol className="flex min-w-max items-center gap-1 py-2.5">
          {names.map((name, i) => {
            const ok = reachable(i);
            const done = i < step;
            return (
              <li key={name} className="flex items-center">
                {i > 0 && <span aria-hidden className={cx('mx-1 h-px w-5', done || i === step ? 'bg-blue-700' : 'bg-slate-300')} />}
                <button type="button" disabled={!ok} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)} className={cx('flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium', i === step ? 'text-blue-800' : ok ? 'text-slate-600 hover:bg-slate-100' : 'cursor-not-allowed text-slate-300')}>
                  <span className={cx('grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold', i === step ? 'bg-blue-700 text-white' : done ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-500')}>
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {name}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="relative min-h-0 flex-1">
        <Screen design={design} />
      </main>

      <footer className="flex h-16 shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5">
        <button type="button" disabled={step === 0} onClick={() => go(step - 1)} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:invisible">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="text-sm text-slate-500" role="status">{blocker || `Step ${step + 1} of ${slugs.length}`}</div>
        <button type="button" disabled={Boolean(blocker) || last} onClick={() => go(step + 1)} className={cx('inline-flex h-10 items-center gap-2 rounded-md bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-slate-300', last && 'invisible')}>
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
    </div>
  );
}
