'use client';

// "Find my roof automatically": one tap reads the satellite picture (Google outline + AI) and builds
// the roof — main roof, upper floor, verandahs. The result can be kept or undone in one tap.

import { Check, Loader2, Sparkles, Undo2 } from 'lucide-react';
import { applyDetection, detectRoofAt, detectRoofIn } from '@/lib/roofDetect';
import { useStore } from '@/lib/store';
import { cx } from '../ui';

const CONFIDENCE = {
  high: { label: 'Sure', tone: 'bg-emerald-50 text-emerald-800' },
  medium: { label: 'Fairly sure', tone: 'bg-amber-50 text-amber-800' },
  low: { label: 'Not sure — please check', tone: 'bg-red-50 text-red-700' },
};

/**
 * Run a detection for `buildingId` (the first building when left out): inside the drawn `outline`
 * (lat/lng points) when there is one — nothing outside it is touched — else at `point` ({lat, lng}).
 */
export async function runDetection(point, buildingId, outline = null) {
  const { set } = useStore.getState();
  set({ roofDetect: { status: 'loading' } });
  try {
    const result = outline?.length >= 3 ? await detectRoofIn(outline) : await detectRoofAt(point);
    const before = applyDetection(useStore, result, buildingId);
    set({ roofDetect: { status: 'done', result, before } });
  } catch (err) {
    set({ roofDetect: { status: 'error', error: err?.message || 'The roof could not be found. Draw it instead.' } });
  }
}

/** Big call to action on an empty roof step. */
export function DetectRoofHero({ point }) {
  const state = useStore((s) => s.roofDetect);
  const loading = state?.status === 'loading';
  return (
    <div className="w-[min(440px,calc(100vw-2rem))] rounded-xl bg-white p-4 shadow-xl ring-1 ring-black/5" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={loading || !point}
        onClick={() => runDetection(point)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand text-[15px] font-semibold text-brand-fg shadow hover:bg-brand-600 disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        {loading ? 'Reading the satellite picture…' : 'Find my roof automatically'}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">
        {loading ? 'This takes about half a minute.' : 'Or click each corner of the roof on the picture to draw it yourself.'}
      </p>
      {state?.status === 'error' && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>}
    </div>
  );
}

/** After a detection: what was found, Keep / Undo. Before one: a small "detect again" button. */
export function DetectRoofPanel({ point, buildingId, outline }) {
  const state = useStore((s) => s.roofDetect);
  const set = useStore((s) => s.set);
  const loading = state?.status === 'loading';

  if (state?.status === 'done') {
    const { result, before } = state;
    const conf = CONFIDENCE[result.confidence] || CONFIDENCE.low;
    const counts = result.parts.reduce((m, p) => ({ ...m, [p.role]: (m[p.role] || 0) + 1 }), {});
    const found = [
      'main roof',
      counts.upper && `${counts.upper} upper-floor roof${counts.upper > 1 ? 's' : ''}`,
      counts.verandah && `${counts.verandah} verandah${counts.verandah > 1 ? 's' : ''}`,
    ].filter(Boolean).join(', ');
    return (
      <div className="mt-4 rounded-lg border-2 border-brand/40 bg-brand-soft/40 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-brand" /> Roof found automatically
          <span className={cx('ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold', conf.tone)}>{conf.label}</span>
        </div>
        <p className="mt-1.5 text-xs text-slate-600">Found: {found} · {result.storeys} storey{result.storeys > 1 ? 's' : ''}.</p>
        {result.notes && <p className="mt-1 text-xs text-slate-600">{result.notes}</p>}
        <p className="mt-1.5 text-xs text-slate-500">Check it on the picture and the 3D preview. Anything off? Drag the corners or pick another roof shape below.</p>
        <div className="mt-2.5 flex gap-2">
          <button type="button" onClick={() => set({ roofDetect: null })} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-brand text-sm font-semibold text-brand-fg hover:bg-brand-600">
            <Check className="h-4 w-4" /> Looks right
          </button>
          <button type="button" onClick={() => set({ ...before, roofDetect: null, selectedId: null })} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Undo2 className="h-4 w-4" /> Undo
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={loading || !point}
        onClick={() => window.confirm('Work out the roof inside your outline automatically? The roof style you have now will be replaced (you can undo it).') && runDetection(point, buildingId, outline)}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border-2 border-brand/50 text-sm font-semibold text-brand-ink hover:bg-brand-soft disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? 'Reading the satellite picture… (about half a minute)' : 'Work out this roof automatically'}
      </button>
      {state?.status === 'error' && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>}
    </div>
  );
}
