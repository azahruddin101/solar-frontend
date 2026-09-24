'use client';

// Client documents, installation photos and ticket attachments open through a short-lived signed link that the API
// hands out to signed-in users (GET /api/files/link). Everything else under /uploads is public.
import { useEffect, useState } from 'react';
import { api, assetUrl } from './api.js';

const cache = new Map(); // /uploads/<name> → { promise, at }
const REUSE_MS = 8 * 60 * 1000; // links last 10 minutes; ask again before that

export function signedFileUrl(url) {
  if (!url) return Promise.resolve('');
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.promise;
  const promise = api(`/api/files/link?url=${encodeURIComponent(url)}`)
    .then((r) => assetUrl(r.url))
    .catch((e) => { cache.delete(url); throw e; });
  cache.set(url, { promise, at: Date.now() });
  return promise;
}

/** Forget every signed link (called on sign-out so the next person on this browser never reuses one). */
export const clearFileLinks = () => cache.clear();

/** The openable address of a stored file ('' while it is being fetched, or if access is refused). */
export function useSignedUrl(url) {
  const [state, setState] = useState({ url: '', signed: '' });
  useEffect(() => {
    let alive = true;
    signedFileUrl(url).then((signed) => alive && setState({ url, signed })).catch(() => alive && setState({ url, signed: '' }));
    return () => { alive = false; };
  }, [url]);
  return state.url === url ? state.signed : '';
}

/** Open a stored file in a new tab. The tab opens straight away (so pop-up blockers allow it) and is pointed at the link. */
export function openFile(url) {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  signedFileUrl(url)
    .then((signed) => { if (tab) tab.location.href = signed; else window.location.assign(signed); })
    .catch(() => tab?.close());
}
