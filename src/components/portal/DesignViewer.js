'use client';

// The 3D design exactly as the company made it — orbit, zoom and move the sun, but nothing can be selected,
// moved or saved. It loads through the client-scoped API (only the client's own proposals) and never autosaves.
import { AlertCircle, ChevronLeft, Eye } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, assetUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { setPublicMapToken, useMapToken } from '@/lib/staticMap';
import { useStore } from '@/lib/store';
import { useDesign } from '@/lib/useDesign';
import { Badge, FullPageLoader, LogoChip, buttonClass } from '../kit';
import Scene3D from '../scene/Scene3D';

export default function DesignViewer({ id, token }) {
  const sessionCompany = useSession((s) => s.company);
  const pub = Boolean(token); // opened from a public share link: nobody is signed in
  if (pub) setPublicMapToken(token);
  const [state, setState] = useState({ status: 'loading', error: '', info: null });
  const mapReady = useMapToken();
  const design = useDesign();

  useEffect(() => {
    let alive = true;
    const base = pub ? `/api/public/proposals/${token}` : `/api/portal/proposals/${id}`;
    Promise.all([api(`${base}/design`), api(pub ? `${base}/catalog` : '/api/portal/catalog')])
      .then(([d, catalog]) => {
        if (!alive) return;
        const st = useStore.getState();
        st.loadDesign(d, pub ? d.company : sessionCompany, { readOnly: true });
        st.set({ catalog });
        setState({ status: 'ready', error: '', info: d });
      })
      .catch((e) => alive && setState({ status: 'error', error: e.message, info: null }));
    return () => {
      alive = false;
      if (pub) setPublicMapToken('');
      useStore.getState().reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  if (state.status === 'error')
    return (
      <div className="grid h-dvh place-items-center bg-slate-50 px-6 text-center">
        <div>
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600"><AlertCircle className="h-6 w-6" /></span>
          <h1 className="text-lg font-semibold text-slate-900">The 3D view is not available</h1>
          <p className="mt-1 text-sm text-slate-500">{state.error}</p>
          <Link href={pub ? `/p/${token}` : `/portal/${id}`} className={buttonClass({ variant: 'primary', className: 'mt-6' })}>Back to the proposal</Link>
        </div>
      </div>
    );
  if (state.status !== 'ready' || !mapReady) return <FullPageLoader />;

  const { info } = state;
  const company = pub ? info.company : sessionCompany;
  const back = pub ? `/p/${token}` : `/portal/${id}`;
  const chips = [info.summary?.kwp ? `${info.summary.kwp.toFixed(2)} kWp` : '', info.summary?.panels ? `${info.summary.panels} panels` : '', info.summary?.annualKwh ? `${info.summary.annualKwh.toLocaleString('en-IN')} kWh / year` : ''].filter(Boolean);

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link href={back} className="flex items-center gap-1 rounded-md py-1.5 pr-2.5 pl-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100" aria-label="Back to the proposal">
          <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Proposal</span>
        </Link>
        <div className="flex min-w-0 items-center gap-3 border-l border-slate-200 pl-4">
          <LogoChip name={company?.name} src={assetUrl(company?.logo)} />
          <div className="min-w-0 leading-tight">
            <div className="max-w-[46vw] truncate text-sm font-semibold sm:max-w-[360px]">{info.name}</div>
            <div className="max-w-[46vw] truncate text-xs text-slate-500 sm:max-w-[420px]">{info.summary?.address || `For ${info.client?.name}`}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-3 text-xs text-slate-500 md:flex">{chips.map((c) => <span key={c}>{c}</span>)}</span>
          <Badge tone="slate"><Eye className="h-3 w-3" /> View only</Badge>
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        {design.sections.length && state.info ? <Scene3D design={design} /> : <div className="grid h-full place-items-center text-sm text-slate-500">This proposal has no 3D layout yet.</div>}
        <div className="pointer-events-none absolute right-4 top-4 rounded-lg bg-black/55 px-3 py-2 text-xs text-white/90 backdrop-blur">Drag to rotate · scroll to zoom · use the sun control to see shadows</div>
      </main>
    </div>
  );
}
