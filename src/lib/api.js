// The API lives in the separate Node backend (backend/); this app has no server routes.
const CONFIGURED_API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

/**
 * Opened from another device (a phone on http://192.168.x.x:3000), "localhost" would point at that device,
 * so a localhost API URL follows whatever host the page itself was loaded from.
 */
function resolveApiUrl() {
  if (typeof window === 'undefined') return CONFIGURED_API_URL;
  try {
    const url = new URL(CONFIGURED_API_URL);
    const local = ['localhost', '127.0.0.1'];
    if (local.includes(url.hostname) && !local.includes(window.location.hostname)) {
      url.hostname = window.location.hostname;
      return url.toString().replace(/\/+$/, '');
    }
  } catch { /* keep the configured value */ }
  return CONFIGURED_API_URL;
}

export const API_URL = resolveApiUrl();

export const apiUrl = (path) => `${API_URL}${path}`;
/** Absolute URL of an uploaded file (logo, signature, QR) stored as /uploads/… */
export const assetUrl = (path) => (path ? apiUrl(path) : '');

const TOKEN_KEY = 'sp.token';
const ADMIN_TOKEN_KEY = 'sp.adminToken'; // the super admin's own token while signed in as a company

const read = (k) => (typeof window === 'undefined' ? '' : window.localStorage.getItem(k) || '');
const write = (k, v) => (v ? window.localStorage.setItem(k, v) : window.localStorage.removeItem(k));

export const tokens = {
  get: () => read(TOKEN_KEY),
  set: (t) => write(TOKEN_KEY, t),
  getAdmin: () => read(ADMIN_TOKEN_KEY),
  setAdmin: (t) => write(ADMIN_TOKEN_KEY, t),
  clear: () => {
    write(TOKEN_KEY, '');
    write(ADMIN_TOKEN_KEY, '');
  },
};

export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);
let onForbidden = null;
/** Called on every 403: the session's permissions may be out of date (the owner changed a role), so it refreshes them. */
export const setForbiddenHandler = (fn) => (onForbidden = fn);

/** Sends an upload with XMLHttpRequest, which (unlike fetch) reports how many bytes have gone; answers like fetch. */
function sendWithProgress(url, { method, headers, body, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress({ loaded: e.loaded, total: e.total }); };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: async () => JSON.parse(xhr.responseText) });
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.onabort = () => reject(new DOMException('The upload was cancelled', 'AbortError'));
    if (signal?.aborted) return xhr.abort();
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/**
 * JSON request with the session token. `form` sends multipart (uploads); with it, `onProgress({ loaded, total })` is
 * told as the bytes go up.
 */
export async function api(path, { method = 'GET', body, form, signal, keepalive, onProgress } = {}) {
  const token = tokens.get();
  const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let res;
  try {
    res = form && onProgress
      ? await sendWithProgress(apiUrl(path), { method, headers, body: form, signal, onProgress })
      : await fetch(apiUrl(path), { method, signal, keepalive, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  // anything that changed data may have changed a sidebar count: tell the counts to refresh
  if (res.ok && method !== 'GET' && typeof window !== 'undefined') window.dispatchEvent(new Event('sp:changed'));
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/logout') onUnauthorized?.();
    if (res.status === 403) onForbidden?.();
    // per-field problems (`errors`, e.g. from the lead form) travel in details.errors
    throw new ApiError(res.status, data?.error || data?.message || `Request failed (${res.status})`, data?.code, data?.details ?? (data?.errors ? { errors: data.errors } : undefined));
  }
  return data;
}

/** Downloads a file the API generates (e.g. an export) with the session token, under the name the API gives it. */
export async function downloadApiFile(path, fallbackName = 'download') {
  const token = tokens.get();
  let res;
  try {
    res = await fetch(apiUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, data?.error || data?.message || `Request failed (${res.status})`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
