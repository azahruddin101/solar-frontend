'use client';

// Designer state for the design that is currently open. It is loaded from and autosaved to the
// backend (see src/lib/useDesignSync.js) — nothing is kept in localStorage.
import { create } from 'zustand';

export const STEPS = ['Project Setup', 'Draw Roof', 'Roof Details', 'Obstructions', 'Panel & Mounting', 'Manual Edit', '3D View & Shadows', 'Electrical Design', 'Financials', 'Report & Drawings'];

export const SIMPLE_SLUGS = ['location', 'roof', 'plan'];
export const PRO_SLUGS = ['location', 'roof', 'roof-details', 'obstructions', 'panels', 'layout', 'view-3d', 'electrical', 'financials', 'report'];
export const SIMPLE_STEPS = ['Location', 'Roof', 'Solar plan'];

// what is saved with the design
export const SAVED_KEYS = ['mode', 'layoutKey', 'project', 'place', 'origin', 'sections', 'objects', 'config', 'electrical', 'finance', 'sun'];

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
  config: { specId: '', pillarId: '', orientation: 'portrait', tilt: 15, azimuthMode: 'building', azimuth: 180, setback: 0.6, frontLeg: 0.4, rowsPerTable: 2, rowGap: 0, maxPanels: 0, targetKw: 0, sizeBy: 'bill', sizeBill: '', sizeKw: '', pricingMode: 'custom', packageId: '', floorPlacement: 0, floorCost: 0, customMaterials: {}, gstIncluded: true, gstPercent: 18 }, // sized by monthly bill or by kW; both are kept so switching shows the same system either way
  electrical: { inverterId: 'auto' },
  finance: { currency: 'INR', tariff: 8, costPerKw: 55000, efficiency: 85, degradation: 0.5, escalation: 3, init: false },
  sun: { season: 'today', hour: 12 },
  // transient {day, hour} the shadow report drives the sun with; the user's `sun` is left untouched
  sunOverride: null,
  // transient: the header's Export menu asks the open 3D step to run the shadow report —
  // 'report' (shadow analysis PDF) or 'combined' (proposal with the shadow analysis appended)
  shadowReport: false,
  tool: 'select',
  pendingBlock: null,
  pendingKey: null,
  layoutKey: '',
  selectedId: null,
  snapshot: null,
  // the saved design this state belongs to
  designId: null,
  designName: '',
  designStatus: 'draft',
  client: null, // {id, name, email, phone, address}
};

export const serializeDesign = (state) => Object.fromEntries(SAVED_KEYS.map((k) => [k, state[k]]));

export const useStore = create((set, get) => ({
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
  /** Replace the designer state with a design fetched from the backend. */
  loadDesign: (design, company) =>
    set((st) => {
      const saved = Object.fromEntries(SAVED_KEYS.filter((k) => design.data?.[k] !== undefined && design.data[k] !== null).map((k) => [k, design.data[k]]));
      return {
        ...initial,
        catalog: st.catalog,
        navigate: st.navigate,
        ...saved,
        config: { ...initial.config, ...(saved.config || {}) },
        finance: { ...initial.finance, ...(saved.finance || {}) },
        project: { name: design.name, customer: design.client?.name || '', preparedBy: company?.name || '' },
        designId: design.id,
        designName: design.name,
        designStatus: design.status,
        client: design.client || null,
      };
    }),
  reset: () => set((st) => ({ ...initial, catalog: st.catalog, navigate: st.navigate })),
}));
