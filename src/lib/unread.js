'use client';

// Unread counts for the sidebar badges: notifications (owners/agents) and support tickets (owners/admin).
import { create } from 'zustand';
import { api } from './api.js';

export const useUnread = create((set) => ({
  count: 0, // notifications
  tickets: 0, // tickets with unread messages
  set: (count) => set({ count }),
  /** `inbox` false skips the notification count (super admin has no inbox). */
  async refresh(inbox = true) {
    const [n, t] = await Promise.allSettled([
      inbox ? api('/api/notifications/unread-count') : null,
      api('/api/tickets/unread-count'),
    ]);
    set((s) => ({
      count: n.status === 'fulfilled' && n.value ? n.value.unread || 0 : s.count,
      tickets: t.status === 'fulfilled' ? t.value.unread || 0 : s.tickets,
    }));
  },
}));
