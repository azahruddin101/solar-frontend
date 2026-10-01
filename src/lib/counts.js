'use client';

// The numbers beside the company sidebar links (clients, designs, products…). Refreshed on navigation, every minute,
// when the window regains focus, and right after anything is created, edited or deleted (api.js announces `sp:changed`).
import { create } from 'zustand';
import { api } from './api.js';

let timer = null;

export const useCounts = create((set) => ({
  counts: null,
  /** `path` is the counts endpoint for whoever is signed in (company workspace or admin console). */
  async refresh(path = '/api/dashboard/counts') {
    try {
      set({ counts: await api(path) });
    } catch {
      /* the badges simply keep their last numbers */
    }
  },
  /** Several changes in a row (an autosave, an import) cause a single refresh. */
  refreshSoon(path) {
    clearTimeout(timer);
    timer = setTimeout(() => useCounts.getState().refresh(path), 500);
  },
}));
