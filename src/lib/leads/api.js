import { API_URL, api } from '../api.js';

export { API_URL };

function withQuery(path, params) {
  if (!params || typeof params !== 'object') return path;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

function fullPath(path) {
  return path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
}

async function wrap(method, path, { body, form, params } = {}) {
  try {
    const data = await api(withQuery(fullPath(path), params), { method, body, form });
    return { data };
  } catch (e) {
    const err = new Error(e.message || 'Request failed');
    err.response = { status: e.status, data: { message: e.message, error: e.message } };
    throw err;
  }
}

/** Axios-shaped client for company-scoped leads APIs (`/api/company/integrations/meta`, `/api/company/google-leads`). */
const leadsApi = {
  defaults: { baseURL: `${API_URL}/api` },
  get: (path, config = {}) => wrap('GET', path, { params: config.params }),
  post: (path, body, config = {}) => wrap('POST', path, { body, form: body instanceof FormData ? body : undefined }),
  put: (path, body) => wrap('PUT', path, { body }),
  delete: (path) => wrap('DELETE', path),
};

export default leadsApi;
