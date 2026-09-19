'use client';

// Who is signed in: super admin or company. Clients never sign in.
import { create } from 'zustand';
import { api, setUnauthorizedHandler, tokens } from './api.js';

export const homeFor = (role) => (role === 'superadmin' ? '/admin' : '/dashboard');

export const useSession = create((set, get) => ({
  status: 'loading', // loading | guest | ready
  user: null,
  company: null,
  impersonated: false,

  apply: (s) => set({ status: 'ready', user: s.user, company: s.company, impersonated: Boolean(s.impersonated) }),
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
      set({ status: 'guest', user: null, company: null });
    }
  },

  async login(email, password) {
    const s = await api('/api/auth/login', { method: 'POST', body: { email, password } });
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
    tokens.set(tokens.getAdmin());
    tokens.setAdmin('');
    get().apply(await api('/api/auth/me'));
  },

  logout() {
    tokens.clear();
    set({ status: 'guest', user: null, company: null, impersonated: false });
  },
}));

setUnauthorizedHandler(() => {
  if (useSession.getState().status === 'ready') useSession.getState().logout();
});
