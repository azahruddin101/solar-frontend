'use client';

import { AlertCircle, ArrowLeft, ArrowRight, Check, ChevronLeft, CloudOff, Download, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '@/lib/api';
import { generatePdf } from '@/lib/pdf';
import { useSession } from '@/lib/session';
import { PRO_SLUGS, SIMPLE_SLUGS, SIMPLE_STEPS, useStore } from '@/lib/store';
import { useDesign } from '@/lib/useDesign';
import { useDesignSync } from '@/lib/useDesignSync';
import { FullPageLoader, LogoChip, Toaster, buttonClass, toast } from './kit';
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
    api(`/api/solar?lat=${origin.lat}&lng=${origin.lng}`, { signal: ctrl.signal })
      .then((body) => patch('solar', { status: 'ok', data: body }))
      .catch((e) => !ctrl.signal.aborted && patch('solar', { status: 'error', data: null, error: e.message }));
    return () => ctrl.abort();
  }, [origin, patch]);
}

/** The company's own panels, poles and pricing — applied once the design itself has loaded. */
function useCatalog(ready) {
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!ready) return;
    api('/api/catalog')
      .then((catalog) => {
        const st = useStore.getState();
        const finance = st.finance.currency === catalog.currency && st.finance.tariff === catalog.tariff && st.finance.init ? st.finance : { ...st.finance, currency: catalog.currency, tariff: catalog.tariff, init: true };
        set({ catalog, finance });
      })
      .catch(() => {});
  }, [set, ready]);
}

const SAVE_LABEL = { saved: 'All changes saved', dirty: 'Saving…', saving: 'Saving…', error: 'Not saved — retrying on next change' };

const SIMPLE_SCREENS = [StepLocation, StepRoof, StepSimpleDesign];
const PRO_SCREENS = [StepLocation, StepDraw, StepRoofDetails, StepObstructions, StepPanelConfig, StepManualEdit, Step3D, StepElectrical, StepFinancials, StepReport];

export default function App({ designId, slug }) {
  const router = useRouter();
  const company = useSession((s) => s.company);
  const state = useStore();
  const design = useDesign();
  const [exporting, setExporting] = useState(false);

  const summary = useMemo(
    () => ({ address: state.place?.address || '', kwp: Number(design.totals.kwp.toFixed(3)), panels: design.totals.count, cost: Math.round(design.cost.total), annualKwh: Math.round(design.totals.acKwh) }),
    [state.place, design.totals.kwp, design.totals.count, design.totals.acKwh, design.cost.total],
  );
  const sync = useDesignSync(designId, summary);
  const loaded = sync.status === 'ready' && state.designId === designId;
  useSolar();
  useCatalog(loaded);

  // one flow only: Location → Roof → Solar plan
  const slugs = SIMPLE_SLUGS;
  const names = SIMPLE_STEPS;
  const screens = SIMPLE_SCREENS;
  const step = Math.max(0, slugs.indexOf(slug));
  const Screen = screens[step];
  const base = `/design/${designId}`;

  const ready = [Boolean(state.origin), design.sections.length > 0];
  const reachable = (i) => i === 0 || (ready[0] && (i === 1 || ready[1]));

  useEffect(() => {
    if (!loaded) return;
    const st = useStore.getState();
    st.set({ step, tool: 'select', selectedId: null, navigate: (i) => router.push(`${base}/${slugs[Math.max(0, Math.min(slugs.length - 1, i))]}`) });
    if (!slugs.includes(slug)) router.replace(`${base}/${['roof-details', 'obstructions', 'obstacles'].includes(slug) ? 'roof' : PRO_SLUGS.includes(slug) ? 'plan' : 'location'}`);
    else if (step > 0 && !st.origin) router.replace(`${base}/location`);
    else if (step > 1 && !st.sections.length) router.replace(`${base}/roof`);
  }, [loaded, slug, step, slugs, base, router]);

  if (sync.status === 'error')
    return (
      <div className="grid h-dvh place-items-center bg-slate-50 px-6 text-center">
        <div>
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600"><AlertCircle className="h-6 w-6" /></span>
          <h1 className="text-lg font-semibold text-slate-900">This design could not be opened</h1>
          <p className="mt-1 text-sm text-slate-500">{sync.error}</p>
          <Link href="/dashboard/designs" className={buttonClass({ variant: 'primary', className: 'mt-6' })}>Back to designs</Link>
        </div>
      </div>
    );
  if (!loaded) return <FullPageLoader />;

  const blocker =
    Screen === StepLocation ? !ready[0] && 'Confirm the location to continue'
    : Screen === StepDraw || Screen === StepRoof ? !ready[1] && 'Mark the roof outline to continue'
    : Screen === StepManualEdit ? !design.totals.count && 'Place at least one panel'
    : null;

  const go = (i) => {
    if (Screen === Step3D) state.set({ snapshot: sceneApi.capture?.() || state.snapshot });
    state.setStep(i);
  };
  const last = step === slugs.length - 1;

  const downloadPdf = async () => {
    setExporting(true);
    try {
      // the 3D view supplies the cover picture; in plan view the last captured one is used
      const snapshot = sceneApi.capture?.() || state.snapshot;
      if (snapshot !== state.snapshot) state.set({ snapshot });
      await generatePdf({ design, project: state.project, place: state.place, finance: state.finance, snapshot, company, client: state.client, designId: state.designId });
    } catch (e) {
      console.error(e);
      toast.error('Sorry, the PDF could not be created. Please try again.');
    }
    setExporting(false);
  };
  const SaveIcon = sync.save === 'saved' ? Check : sync.save === 'error' ? CloudOff : Loader2;

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link href="/dashboard/designs" className="flex items-center gap-1 rounded-md py-1.5 pr-2.5 pl-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100" aria-label="Back to designs">
          <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Designs</span>
        </Link>
        <div className="flex min-w-0 items-center gap-3 border-l border-slate-200 pl-4">
          <LogoChip name={company.name} src={assetUrl(company.logo)} />
          <div className="min-w-0 leading-tight">
            <div className="max-w-[46vw] truncate text-sm font-semibold sm:max-w-[360px]">{state.designName}</div>
            <div className="max-w-[46vw] truncate text-xs text-slate-500 sm:max-w-[360px]">For {state.client?.name || 'client'}{state.place?.address ? ` · ${state.place.address}` : ''}</div>
          </div>
        </div>
        <div className={cx('ml-auto hidden items-center gap-1.5 text-xs md:flex', sync.save === 'error' ? 'text-red-600' : 'text-slate-400')} role="status">
          <SaveIcon className={cx('h-3.5 w-3.5', (sync.save === 'dirty' || sync.save === 'saving') && 'animate-spin')} /> {SAVE_LABEL[sync.save]}
        </div>
        {last && (
          <button type="button" onClick={downloadPdf} disabled={exporting || !design.totals.count} title={design.totals.count ? undefined : 'Place at least one panel first'} className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-brand px-3.5 text-sm font-semibold text-brand-fg hover:bg-brand-600 disabled:bg-slate-300 md:ml-0">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Download proposal (PDF)</span><span className="sm:hidden">PDF</span>
          </button>
        )}
      </header>

      <nav aria-label="Progress" className="shrink-0 overflow-x-auto border-b border-slate-200 bg-white px-5">
        <ol className="flex min-w-max items-center gap-1 py-2.5">
          {names.map((name, i) => {
            const ok = reachable(i);
            const done = i < step;
            return (
              <li key={name} className="flex items-center">
                {i > 0 && <span aria-hidden className={cx('mx-1 h-px w-5', done || i === step ? 'bg-brand' : 'bg-slate-300')} />}
                <button type="button" disabled={!ok} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)} className={cx('flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium', i === step ? 'text-brand-ink' : ok ? 'text-slate-600 hover:bg-slate-100' : 'cursor-not-allowed text-slate-300')}>
                  <span className={cx('grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold', i === step ? 'bg-brand text-brand-fg' : done ? 'bg-brand-muted text-brand-ink' : 'bg-slate-200 text-slate-500')}>
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
        <button type="button" disabled={Boolean(blocker) || last} onClick={() => go(step + 1)} className={cx('inline-flex h-10 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-brand-fg hover:bg-brand-600 disabled:bg-slate-300', last && 'invisible')}>
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
      <Toaster />
    </div>
  );
}
