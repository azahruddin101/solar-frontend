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

/**
 * A `/api/...?page=&limit=` list that grows with a "Load more" button, for endpoints returning
 * `{ items, total, page, limit }`. `path` may include its own query string (e.g. filters); page/limit are appended.
 * A falsy `path` loads nothing, same as `useResource`.
 */
export function usePagedResource(path, { limit = 50 } = {}) {
  const companyId = useSession((s) => s.company?.id);
  const key = `${companyId || ''}|${path || ''}`;
  const [state, setState] = useState({ key, items: [], total: 0, page: 0, loading: true, error: '', loadingMore: false });

  const fetchPage = useCallback(
    async (page, replace) => {
      if (!path) return setState({ key, items: [], total: 0, page: 0, loading: false, error: '', loadingMore: false });
      const sep = path.includes('?') ? '&' : '?';
      try {
        const res = await api(`${path}${sep}page=${page}&limit=${limit}`);
        setState((s) => ({
          key,
          total: res.total,
          page: res.page,
          loading: false,
          loadingMore: false,
          error: '',
          items: replace ? res.items : [...(s.key === key ? s.items : []), ...res.items],
        }));
      } catch (e) {
        setState((s) => ({ ...(s.key === key ? s : { key, items: [], total: 0, page: 0 }), loading: false, loadingMore: false, error: e.message }));
      }
    },
    [path, limit, key]
  );

  const reload = useCallback(() => {
    setState((s) => ({ ...s, key, loading: true }));
    fetchPage(1, true);
  }, [fetchPage, key]);

  useEffect(() => {
    setState((s) => (s.key === key ? s : { key, items: [], total: 0, page: 0, loading: true, error: '', loadingMore: false }));
    fetchPage(1, true);
  }, [fetchPage, key]);

  const current = state.key === key;
  const items = current ? state.items : [];
  const total = current ? state.total : 0;
  const page = current ? state.page : 0;
  const hasMore = current && items.length < total;
  const loadMore = useCallback(() => {
    if (!hasMore || state.loadingMore) return;
    setState((s) => ({ ...s, loadingMore: true }));
    fetchPage(page + 1, false);
  }, [hasMore, state.loadingMore, fetchPage, page]);

  const setItems = useCallback((fn) => setState((s) => ({ ...s, items: typeof fn === 'function' ? fn(s.items) : fn })), []);

  return { items, total, loading: current ? state.loading : true, loadingMore: current ? state.loadingMore : false, error: current ? state.error : '', hasMore, loadMore, reload, setItems };
}

/** Page-by-page list (`{ items, total, page, limit }`). Replaces rows when the page changes (for table footers with Prev/Next). */
export function usePaginatedResource(path, { limit = 10 } = {}) {
  const companyId = useSession((s) => s.company?.id);
  const key = `${companyId || ''}|${path || ''}`;
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ key, items: [], total: 0, loading: true, error: '' });

  useEffect(() => {
    setPage(1);
  }, [key]);

  const fetchPage = useCallback(
    async (p) => {
      if (!path) return setState({ key, items: [], total: 0, loading: false, error: '' });
      const sep = path.includes('?') ? '&' : '?';
      try {
        const res = await api(`${path}${sep}page=${p}&limit=${limit}`);
        setState({ key, items: res.items || [], total: res.total ?? 0, loading: false, error: '' });
      } catch (e) {
        setState({ key, items: [], total: 0, loading: false, error: e.message });
      }
    },
    [path, limit, key],
  );

  useEffect(() => {
    setState((s) => (s.key === key ? { ...s, loading: true } : { key, items: [], total: 0, loading: true, error: '' }));
    fetchPage(page);
  }, [fetchPage, page, key]);

  const current = state.key === key;
  const items = current ? state.items : [];
  const total = current ? state.total : 0;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

  const reload = useCallback(() => fetchPage(page), [fetchPage, page]);

  const setItems = useCallback((fn) => setState((s) => ({ ...s, items: typeof fn === 'function' ? fn(s.items) : fn })), []);

  return {
    items,
    total,
    page,
    setPage,
    limit,
    totalPages,
    loading: current ? state.loading : true,
    error: current ? state.error : '',
    reload,
    setItems,
  };
}
