'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/** Load a list/object from the API: { data, setData, loading, error, reload }. */
export function useResource(path) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const reload = useCallback(async () => {
    try {
      setState({ data: await api(path), loading: false, error: '' });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [path]);
  useEffect(() => {
    reload();
  }, [reload]);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, setData, reload };
}
