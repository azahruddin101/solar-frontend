'use client';

// Who is signed in: super admin, company or one of the company's agents. Clients never sign in.
import { create } from 'zustand';
import { api, setUnauthorizedHandler, tokens } from './api.js';
import { clearFileLinks } from './files.js';
import { clearMapToken } from './staticMap.js';
import { useStore } from './store.js';

/** Nothing of one company's workspace (designer catalog, open design) may survive into another's. */
function wipeWorkspace() {
  clearMapToken();
  clearFileLinks();
  useStore.getState().reset();
  useStore.setState({ catalog: null });
}

const HOMES = { superadmin: '/admin', company: '/dashboard', agent: '/agent' };
export const homeFor = (role) => HOMES[role] || '/login';

export const useSession = create((set, get) => ({
  status: 'loading', // loading | guest | ready
  user: null,
  company: null,
  impersonated: false,

  apply: (s) => {
    if (get().company?.id !== s.company?.id) wipeWorkspace();
    set({ status: 'ready', user: s.user, company: s.company, impersonated: Boolean(s.impersonated) });
  },
  setCompany: (company) => set({ company }),

  /** Restore the session from the stored token (once per page load). */
  async init() {
    if (get().status !== 'loading' || get().started) return;
    set({ started: true });
    if (!tokens.get()) return set({ status: 'guest' });
    try {
      get().apply(await api('/api/auth/me'));
    } catch {
      tokens.clear();
      wipeWorkspace();
      set({ status: 'guest', user: null, company: null });
    }
  },

  async login(email, password, { replaceSessions = false } = {}) {
    const s = await api('/api/auth/login', { method: 'POST', body: { email, password, replaceSessions } });
    tokens.clear();
    tokens.set(s.token);
    get().apply(s);
    return s;
  },

  /** Super admin opens a company's workspace. */
  async impersonate(companyId) {
    const s = await api(`/api/admin/companies/${companyId}/impersonate`, { method: 'POST' });
    tokens.setAdmin(tokens.get());
    tokens.set(s.token);
    get().apply(s);
  },

  async stopImpersonating() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* already ended */ } // ends the impersonation session on the server
    tokens.set(tokens.getAdmin());
    tokens.setAdmin('');
    get().apply(await api('/api/auth/me'));
  },

  async logout() {
    try {
      if (tokens.get()) await api('/api/auth/logout', { method: 'POST' });
    } catch { /* session already gone */ }
    tokens.clear();
    wipeWorkspace();
    set({ status: 'guest', user: null, company: null, impersonated: false });
  },
}));

setUnauthorizedHandler(() => {
  if (useSession.getState().status !== 'ready') return;
  tokens.clear();
  wipeWorkspace();
  useSession.setState({ status: 'guest', user: null, company: null, impersonated: false });
});
