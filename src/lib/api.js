// The API lives in the separate Node backend (backend/); this app has no server routes.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

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
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

/** JSON request with the session token. `form` sends multipart (uploads). */
export async function api(path, { method = 'GET', body, form, signal, keepalive } = {}) {
  const token = tokens.get();
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      signal,
      keepalive,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') onUnauthorized?.();
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.code);
  }
  return data;
}
