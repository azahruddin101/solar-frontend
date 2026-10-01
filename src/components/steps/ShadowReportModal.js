'use client';

// "Generate Shadow Report": runs the shadow analysis on the live 3D scene with a step-by-step progress
// list, then offers the PDF for download. Generation starts as soon as the dialog opens.
// mode 'combined': when the analysis is done, the proposal is built with the shadow report appended
// and downloaded as one PDF (the standalone report stays available too).

import { CheckCircle2, Circle, Download, FileStack, Loader2, RefreshCw, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { generatePdf } from '@/lib/pdf';
import { REPORT_SEASONS } from '@/lib/shadowReport/config';
import { generateShadowReport, reportSteps } from '@/lib/shadowReport/generateShadowReport';
import { useStore } from '@/lib/store';
import { Alert, Button, Modal, ZoomImage, toast } from '../kit';
import { sceneApi } from '../scene/Scene3D';
import { cx } from '../ui';

const pct = (v) => (v == null ? 'N/A' : `${Math.round(v)}%`);

export default function ShadowReportModal({ open, onClose, design, mode = 'report' }) {
  const [phase, setPhase] = useState('idle'); // idle | running | done | error
  const [steps, setSteps] = useState(() => reportSteps().map((s) => ({ ...s, status: 'pending', detail: '' })));
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // {url, fileName, results, summaries, meta}
  const [combining, setCombining] = useState(false);
  const abortRef = useRef(null);
  const activeRef = useRef(null);

  const revoke = (res) => res?.url && URL.revokeObjectURL(res.url);

  /** Proposal PDF with this shadow analysis appended, downloaded as one file. */
  const downloadCombined = async (res) => {
    setCombining(true);
    try {
      const st = useStore.getState();
      const { blob, filename } = await generatePdf({
        design,
        project: st.project,
        place: st.place,
        finance: st.finance,
        snapshot: st.snapshot,
        company: useSession.getState().company,
        client: st.client,
        designId: st.designId,
        validUntil: st.validUntil,
        cover: st.cover,
        shadow: { meta: res.meta, seasons: REPORT_SEASONS, results: res.results, summaries: res.summaries },
      });
      if (st.designId && blob) {
        const form = new FormData();
        form.append('file', blob, filename);
        api(`/api/designs/${st.designId}/versions`, { method: 'POST', form }).catch((e) => console.error('Could not archive quotation PDF version', e));
      }
    } catch (e) {
      console.error(e);
      toast.error('Sorry, the combined PDF could not be created. Please try again.');
    }
    setCombining(false);
  };

  const start = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    revoke(result);
    setResult(null);
    setError('');
    setSteps(reportSteps().map((s) => ({ ...s, status: 'pending', detail: '' })));
    setPhase('running');
    // the proposal's cover picture: take it now, before the report moves the sun and camera
    const cover = sceneApi.capture?.();
    if (cover) useStore.getState().set({ snapshot: cover });
    const st = useStore.getState();
    try {
      const out = await generateShadowReport({
        design,
        getScene: () => sceneApi.getScene?.(),
        project: st.project,
        place: st.place,
        client: st.client,
        company: useSession.getState().company,
        signal: ctrl.signal,
        onStep: (id, status, detail) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail: detail ?? s.detail } : s))),
      });
      if (ctrl.signal.aborted) return;
      const res = { url: URL.createObjectURL(out.blob), fileName: out.fileName, results: out.results, summaries: out.summaries, meta: out.meta };
      setResult(res);
      setPhase('done');
      if (mode === 'combined') downloadCombined(res);
    } catch (e) {
      if (ctrl.signal.aborted || e?.name === 'AbortError') return;
      console.error(e);
      setError(e?.message || 'The shadow report could not be generated.');
      setPhase('error');
    }
  };

  // start once the dialog has painted; a finished report stays until "Generate again"
  useEffect(() => {
    if (!open) return undefined;
    // a finished report is reused: in combined mode it goes straight into the proposal
    if (result && phase === 'done') {
      if (mode !== 'combined') return undefined;
      const id = requestAnimationFrame(() => downloadCombined(result));
      return () => cancelAnimationFrame(id);
    }
    if (phase !== 'idle' || result) return undefined;
    const id = requestAnimationFrame(() => start());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => { abortRef.current?.abort(); revoke(result); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [steps]);

  const close = () => {
    if (phase === 'running') {
      abortRef.current?.abort();
      setPhase('idle');
    } else if (phase === 'error') setPhase('idle');
    onClose();
  };

  const done = steps.filter((s) => s.status === 'done').length;
  const progress = Math.round((done / steps.length) * 100);
  const daylight = result?.results.filter((r) => r.sunUp) || [];
  const lowest = daylight.reduce((b, r) => (b == null || r.effectiveOutputPercent < b.effectiveOutputPercent ? r : b), null);
  const highest = daylight.reduce((b, r) => (b == null || r.effectiveOutputPercent > b.effectiveOutputPercent ? r : b), null);

  return (
    <Modal open={open} onClose={close} title={mode === 'combined' ? 'Proposal with Shadow Analysis' : 'Shadow Analysis Report'} description={`${design.totals.count} panels · 3 seasons × 6 times of day · rendered from the 3D model`} size="lg">
      {phase === 'error' && (
        <div className="space-y-4">
          <Alert tone="error">{error}</Alert>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Close</Button>
            <Button variant="primary" icon={RefreshCw} onClick={start}>Try again</Button>
          </div>
        </div>
      )}

      {(phase === 'running' || phase === 'idle') && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand"><Loader2 className="h-5 w-5 animate-spin" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">Generating Shadow Report</div>
              <div className="text-xs text-slate-500">The 3D view steps through every season and time behind this dialog. Your own sun, selection and camera are restored afterwards.</div>
            </div>
            <span className="text-sm font-semibold text-slate-700">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand transition-all duration-300" style={{ width: `${Math.max(2, progress)}%` }} /></div>
          <ol className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-[13px]">
            {steps.map((s) => (
              <li key={s.id} ref={s.status === 'active' ? activeRef : undefined} className={cx('flex items-center gap-2 rounded-md px-2 py-1', s.status === 'active' && 'bg-white shadow-xs', s.id.startsWith('season:') || s.id === 'geometry' || s.id === 'pdf' ? 'font-semibold text-slate-800' : 'pl-7 text-slate-600')}>
                {s.status === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : s.status === 'active' ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
                <span className="truncate">{s.label}</span>
                {s.detail && <span className="ml-auto shrink-0 truncate text-xs text-slate-400">{s.detail}</span>}
              </li>
            ))}
          </ol>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={close}>Cancel</Button>
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">Shadow Report Generated</div>
              <div className="text-xs text-slate-500">
                {result.results.length} renders · {daylight.length} with direct sunlight
                {lowest && highest ? ` · effective output from ${pct(lowest.effectiveOutputPercent)} (${lowest.seasonLabel} ${lowest.timeLabel}) to ${pct(highest.effectiveOutputPercent)} (${highest.seasonLabel} ${highest.timeLabel})` : ''}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {result.results.flatMap((r) => r.images.map((im) => {
              const label = result.meta.buildings?.length > 1 ? im.buildingName : '';
              return (
              <figure key={`${r.season}-${r.hour}-${im.buildingId}`} className="overflow-hidden rounded-md border border-slate-200 bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <ZoomImage src={im.image.data} alt={`${r.seasonLabel} ${r.timeLabel}${label ? ` · ${label}` : ''}`} className="aspect-video w-full object-cover" />
                <figcaption className="flex items-center justify-between bg-white px-1.5 py-1 text-[10px] text-slate-600">
                  <span className="truncate">{r.seasonLabel} · {r.timeLabel}{label ? ` · ${label}` : ''}</span>
                  <span className={cx('font-semibold', !r.sunUp ? 'text-slate-400' : r.effectiveOutputPercent >= 90 ? 'text-emerald-600' : r.effectiveOutputPercent >= 60 ? 'text-amber-600' : 'text-red-600')}>{r.sunUp ? pct(r.effectiveOutputPercent) : 'N/A'}</span>
                </figcaption>
              </figure>
              );
            }))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {result.summaries.map((s) => (
              <div key={s.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800"><Sun className="h-3.5 w-3.5 text-amber-500" /> {s.label} · {s.dateLabel}</div>
                {s.daylightCount ? (
                  <div className="mt-1 text-slate-600">min {pct(s.min.value)} · max {pct(s.max.value)} · avg {pct(s.avg)}</div>
                ) : (
                  <div className="mt-1 text-slate-500">no daylight at the analysed times</div>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon={RefreshCw} onClick={start}>Generate again</Button>
            <a href={result.url} download={result.fileName} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              <Download className="h-4 w-4" /> Shadow analysis only
            </a>
            <Button variant="primary" icon={FileStack} loading={combining} onClick={() => downloadCombined(result)}>
              {combining ? 'Building proposal...' : 'Proposal + shadow analysis'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
