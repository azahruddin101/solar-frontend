'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useSession } from './session.js';

/** Load a list/object from the API: { data, setData, loading, error, reload }. A falsy `path` loads nothing.
 * Data is tied to the company it was loaded for, so a different company never sees the previous one's rows. */
export function useResource(path) {
  const companyId = useSession((s) => s.company?.id);
  const key = `${companyId || ''}|${path || ''}`;
  const [state, setState] = useState({ key, data: null, loading: true, error: '' });
  const reload = useCallback(async () => {
    if (!path) return setState({ key, data: null, loading: false, error: '' });
    try {
      setState({ key, data: await api(path), loading: false, error: '' });
    } catch (e) {
      setState((s) => ({ ...(s.key === key ? s : { key, data: null }), loading: false, error: e.message }));
    }
  }, [path, key]);
  useEffect(() => {
    reload();
  }, [reload]);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  const current = state.key === key;
  return { data: current ? state.data : null, loading: current ? state.loading : true, error: current ? state.error : '', setData, reload };
}
