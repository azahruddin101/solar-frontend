'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const STEPS = ['Project Setup', 'Draw Roof', 'Roof Details', 'Obstructions', 'Panel & Mounting', 'Manual Edit', '3D View & Shadows', 'Electrical Design', 'Financials', 'Report & Drawings'];

export const SIMPLE_SLUGS = ['location', 'roof', 'obstacles', 'plan'];
export const PRO_SLUGS = ['location', 'roof', 'roof-details', 'obstructions', 'panels', 'layout', 'view-3d', 'electrical', 'financials', 'report'];
export const SIMPLE_STEPS = ['Location', 'Roof outline', 'Roof objects', 'Solar plan'];

const initial = {
  step: 0,
  mode: 'simple',
  project: { name: '', customer: '', preparedBy: '' },
  place: null, // {address, location}
  origin: null, // confirmed {lat, lng}
  catalog: null,
  solar: { status: 'idle', data: null, error: null },
  sections: [], // {id, name, points, height, parapetH, parapetT}
  objects: [], // array | zone | tree | block
  config: { specId: '', pillarId: '', orientation: 'portrait', tilt: 15, azimuthMode: 'building', azimuth: 180, setback: 0.6, frontLeg: 0.4, rowsPerTable: 2, rowGap: 0, maxPanels: 0, targetKw: 0 },
  electrical: { inverterId: 'auto' },
  finance: { currency: 'INR', tariff: 8, costPerKw: 55000, efficiency: 85, degradation: 0.5, escalation: 3, init: false },
  sun: { season: 'today', hour: 12 },
  tool: 'select',
  pendingBlock: null,
  pendingKey: null,
  layoutKey: '',
  selectedId: null,
  snapshot: null,
};

export const useStore = create(
  persist(
    (set, get) => ({
      ...initial,
      navigate: null,
      set: (patch) => set(patch),
      setStep: (step) => get().navigate?.(step),
      patch: (key, patch) => set((s) => ({ [key]: { ...s[key], ...patch } })),
      addSection: (sec) => set((s) => ({ sections: [...s.sections, sec], selectedId: sec.id, tool: 'select' })),
      updateSection: (id, patch) => set((s) => ({ sections: s.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      addObject: (o) => set((s) => ({ objects: [...s.objects, o], selectedId: o.id, tool: 'select' })),
      updateObject: (id, patch) => set((s) => ({ objects: s.objects.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      remove: (id) =>
        set((s) => ({
          sections: s.sections.filter((x) => x.id !== id),
          objects: s.objects.filter((x) => x.id !== id),
          selectedId: null,
        })),
      reset: () => set((st) => ({ ...initial, catalog: st.catalog, navigate: st.navigate, mode: st.mode })),
    }),
    {
      name: 'solar-planner-v2',
      merge: (saved, cur) => ({ ...cur, ...saved, config: { ...cur.config, ...(saved?.config || {}) } }),
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ mode, layoutKey, step, project, place, origin, sections, objects, config, electrical, finance, sun }) => ({ mode, layoutKey, step, project, place, origin, sections, objects, config, electrical, finance, sun }),
    },
  ),
);
