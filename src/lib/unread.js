'use client';

// Unread counts for the sidebar badges: notifications (owners/agents), support tickets with the platform
// (owners/staff/admin), client support (owners/staff on the company side, the client in their portal).
import { create } from 'zustand';
import { api } from './api.js';
import { canView } from './permissions.js';

export const useUnread = create((set, get) => ({
  count: 0, // notifications
  tickets: 0, // tickets with the platform with unread messages (for a client: their help requests)
  clientTickets: 0, // client support requests with unread messages (company side)
  user: null,
  set: (count) => set({ count }),
  /** Pass the signed-in user (AppShell does); later calls without it reuse that user. */
  async refresh(user) {
    const u = user && typeof user === 'object' ? user : get().user;
    if (u !== get().user) set({ user: u });
    if (!u) return;
    const team = u.role === 'company' || u.role === 'agent';
    // only ask what this person may see (a refused request would also refresh the whole session)
    const [n, t, c] = await Promise.allSettled([
      team ? api('/api/notifications/unread-count') : null,
      u.role === 'client' ? api('/api/portal/tickets/unread-count') : u.role === 'superadmin' || (team && canView(u, 'support')) ? api('/api/tickets/unread-count') : null,
      team && canView(u, 'helpdesk') ? api('/api/client-tickets/unread-count') : null,
    ]);
    set((s) => ({
      count: n.status === 'fulfilled' && n.value ? n.value.unread || 0 : s.count,
      tickets: t.status === 'fulfilled' && t.value ? t.value.unread || 0 : s.tickets,
      clientTickets: c.status === 'fulfilled' && c.value ? c.value.unread || 0 : s.clientTickets,
    }));
  },
}));
