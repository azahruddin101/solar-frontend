'use client';

// Who is signed in: super admin, company, one of the company's agents, or a client (view-only portal).
import { create } from 'zustand';
import { api, setForbiddenHandler, setUnauthorizedHandler, tokens } from './api.js';
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

const HOMES = { superadmin: '/admin', company: '/org', branch: '/dashboard', agent: '/agent', client: '/portal' };
export const homeFor = (role) => HOMES[role] || '/login';

const ORG_DASHBOARD_SCOPE_KEY = 'innovbit.orgDashboardScope';

function readOrgDashboardScope() {
  if (typeof window === 'undefined') return 'all';
  const v = localStorage.getItem(ORG_DASHBOARD_SCOPE_KEY);
  return v === 'all' || !v ? 'all' : v;
}

export const useSession = create((set, get) => ({
  status: 'loading', // loading | guest | ready
  user: null,
  company: null,
  organization: null,
  impersonated: false,
  /** On /org: `all` = combined metrics; otherwise active branch id for branch overview. */
  orgDashboardScope: 'all',

  apply: (s) => {
    const prev = get();
    if (prev.company?.id !== s.company?.id || prev.organization?.id !== s.organization?.id) wipeWorkspace();
    set({
      status: 'ready',
      user: s.user,
      company: s.company,
      organization: s.organization ?? null,
      impersonated: Boolean(s.impersonated),
    });
  },
  setCompany: (company) => set({ company }),

  setOrgDashboardScope(scope) {
    const next = scope === 'all' ? 'all' : String(scope);
    if (typeof window !== 'undefined') localStorage.setItem(ORG_DASHBOARD_SCOPE_KEY, next);
    set({ orgDashboardScope: next });
  },

  async reloadSession() {
    if (!tokens.get()) return;
    get().apply(await api('/api/auth/me'));
  },

  /** Org admin opens a branch workspace (new JWT with branch id). */
  async switchBranch(branchId) {
    const s = await api('/api/auth/branch', { method: 'POST', body: { branchId } });
    tokens.set(s.token);
    get().apply(s);
    return s;
  },

  /**
   * Re-reads who is signed in and what they may do — for staff whose roles the owner can change at any time. Runs when
   * the API refuses something (403) and when the tab comes back into view; at most once every 15 seconds.
   */
  async refresh() {
    const { status, user, refreshedAt = 0 } = get();
    if (status !== 'ready' || user?.role !== 'agent' || Date.now() - refreshedAt < 15000) return;
    set({ refreshedAt: Date.now() });
    try {
      get().apply(await api('/api/auth/me'));
    } catch { /* a 401 signs out through the handler below; anything else: keep what we have */ }
  },

  /** Restore the session from the stored token (once per page load). */
  async init() {
    if (get().status !== 'loading' || get().started) return;
    set({ started: true });
    if (!tokens.get()) return set({ status: 'guest' });
    try {
      get().apply(await api('/api/auth/me'));
      set({ orgDashboardScope: readOrgDashboardScope() });
    } catch {
      tokens.clear();
      wipeWorkspace();
      set({ status: 'guest', user: null, company: null, organization: null, orgDashboardScope: 'all' });
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
    set({ status: 'guest', user: null, company: null, organization: null, impersonated: false, orgDashboardScope: 'all' });
  },
}));

setForbiddenHandler(() => useSession.getState().refresh());
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => useSession.getState().refresh());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && useSession.getState().refresh());
}

setUnauthorizedHandler(() => {
  if (useSession.getState().status !== 'ready') return;
  tokens.clear();
  wipeWorkspace();
  useSession.setState({ status: 'guest', user: null, company: null, organization: null, impersonated: false, orgDashboardScope: 'all' });
});
