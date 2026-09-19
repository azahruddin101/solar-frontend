'use client';

// Loads the open design from the backend and autosaves changes back to it.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useSession } from './session.js';
import { SAVED_KEYS, serializeDesign, useStore } from './store.js';

const SAVE_DELAY = 1200;

/** `summary` = { address, kwp, panels, cost, annualKwh } shown in the designs list. */
export function useDesignSync(designId, summary) {
  const company = useSession((s) => s.company);
  const loadedId = useStore((s) => s.designId);
  const [load, setLoad] = useState({ status: 'loading', error: '' }); // loading | ready | error
  const [save, setSave] = useState('saved'); // saved | dirty | saving | error
  const ready = load.status === 'ready' && loadedId === designId;

  const summaryRef = useRef(summary);
  const sync = useRef({ timer: null, dirty: false, markDirty: () => {} });
  useEffect(() => {
    summaryRef.current = summary;
  });

  // load (skipped when moving between steps of the design that is already open)
  useEffect(() => {
    if (useStore.getState().designId === designId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoad({ status: 'ready', error: '' });
      return undefined;
    }
    let alive = true;
    setLoad({ status: 'loading', error: '' });
    api(`/api/designs/${designId}`)
      .then((design) => {
        if (!alive) return;
        useStore.getState().loadDesign(design, company);
        setLoad({ status: 'ready', error: '' });
      })
      .catch((e) => alive && setLoad({ status: 'error', error: e.message }));
    return () => (alive = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);

  // autosave: any saved key (or the summary) changing marks the design dirty; one debounced PUT sends both
  useEffect(() => {
    if (!ready) return undefined;
    const s = sync.current;

    const flush = async ({ keepalive = false } = {}) => {
      clearTimeout(s.timer);
      if (!s.dirty) return;
      const st = useStore.getState();
      if (st.designId !== designId) return;
      s.dirty = false;
      setSave('saving');
      try {
        await api(`/api/designs/${designId}`, { method: 'PUT', keepalive, body: { data: serializeDesign(st), summary: summaryRef.current } });
        setSave(s.dirty ? 'dirty' : 'saved');
      } catch {
        s.dirty = true;
        setSave('error');
      }
    };
    s.markDirty = () => {
      s.dirty = true;
      setSave('dirty');
      clearTimeout(s.timer);
      s.timer = setTimeout(flush, SAVE_DELAY);
    };

    const unsubscribe = useStore.subscribe((st, prev) => {
      if (st.designId === designId && prev.designId === designId && SAVED_KEYS.some((k) => st[k] !== prev[k])) s.markDirty();
    });
    // leaving the tab: send what is pending (keepalive lets small payloads finish after unload)
    const onHide = () => document.visibilityState === 'hidden' && flush({ keepalive: true });
    document.addEventListener('visibilitychange', onHide);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
      s.markDirty = () => {};
      flush();
    };
  }, [ready, designId]);

  // the computed summary (kWp, cost…) settles a moment after the geometry changes
  const summaryKey = JSON.stringify(summary);
  const savedSummary = useRef(null);
  useEffect(() => {
    if (!ready) return;
    if (savedSummary.current !== null && savedSummary.current !== summaryKey) sync.current.markDirty();
    savedSummary.current = summaryKey;
  }, [summaryKey, ready]);

  return { ...load, save };
}
