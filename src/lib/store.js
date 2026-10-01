'use client';

// Designer state for the design that is currently open. It is loaded from and autosaved to the
// backend (see src/lib/useDesignSync.js) — nothing is kept in localStorage.
import { create } from 'zustand';
import { buildingIdOf, buildingList, nextBuildingName } from './buildings.js';

export const STEPS = ['Project Setup', 'Draw Roof', 'Roof Details', 'Obstructions', 'Panel & Mounting', 'Manual Edit', '3D View & Shadows', 'Electrical Design', 'Financials', 'Report & Drawings'];

export const SIMPLE_SLUGS = ['location', 'roof', 'plan'];
export const PRO_SLUGS = ['location', 'roof', 'roof-details', 'obstructions', 'panels', 'layout', 'view-3d', 'electrical', 'financials', 'report'];
export const SIMPLE_STEPS = ['Location', 'Roof', 'Solar plan'];

// what is saved with the design
export const SAVED_KEYS = ['mode', 'layoutKey', 'project', 'place', 'origin', 'buildings', 'sections', 'objects', 'config', 'electrical', 'finance', 'sun'];

const initial = {
  step: 0,
  mode: 'simple',
  project: { name: '', customer: '', preparedBy: '' },
  place: null, // {address, location}
  origin: null, // confirmed {lat, lng}
  catalog: null,
  solar: { status: 'idle', data: null, error: null },
  buildings: [], // {id, name} — several for a campus; empty = one building (see lib/buildings.js)
  buildingId: null, // transient: the building being edited on the roof step
  sections: [], // {id, name, building, points, height, parapetH, parapetT}
  objects: [], // array | zone | tree | block
  config: { specId: '', pillarId: '', orientation: 'portrait', tilt: 15, azimuthMode: 'building', azimuth: 180, setback: 0.6, frontLeg: 0.4, rowsPerTable: 2, rowGap: 0, maxPanels: 0, targetKw: 0, sizeBy: 'bill', sizeBill: '', sizeKw: '', pricingMode: 'custom', packageId: '', floorPlacement: 0, floorCost: 0, installationCharges: [], outlookYears: 10, tariff: 0, customMaterials: {}, withGst: true, gstPercent: 18 }, // sized by monthly bill or by kW; both are kept so switching shows the same system either way
  electrical: { inverterId: 'auto' },
  finance: { currency: 'INR', tariff: 8, costPerKw: 55000, efficiency: 85, degradation: 0.5, init: false },
  sun: { season: 'today', hour: 12 },
  // transient {day, hour} the shadow report drives the sun with; the user's `sun` is left untouched
  sunOverride: null,
  // transient: the header's Export menu asks the open 3D step to run the shadow report —
  // 'report' (shadow analysis PDF) or 'combined' (proposal with the shadow analysis appended)
  shadowReport: false,
  cover: null, // transient: the front page picked for the PDF being exported (see coverStyles.js)
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
  validUntil: null, // the proposal's valid-until date (a design field, edited from the sidebar)
  readOnly: false, // the client's viewer: nothing can be selected, moved or saved
  client: null, // {id, name, email, phone, address}
};

export const serializeDesign = (state) => Object.fromEntries(SAVED_KEYS.map((k) => [k, state[k]]));

export const useStore = create((set, get) => ({
  ...initial,
  navigate: null,
  set: (patch) => set(patch),
  setStep: (step) => get().navigate?.(step),
  patch: (key, patch) => set((s) => ({ [key]: { ...s[key], ...patch } })),
  /** A new, empty building; its roof is drawn next. Returns its id. */
  addBuilding: (name) => {
    const list = buildingList(get().buildings);
    const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    set({ buildings: [...list, { id, name: name || nextBuildingName(list) }], buildingId: id });
    return id;
  },
  renameBuilding: (id, name) => set((s) => ({ buildings: buildingList(s.buildings).map((b) => (b.id === id ? { ...b, name } : b)) })),
  /** Removes a building with its roof sections; panels and objects elsewhere stay. The last building cannot go. */
  removeBuilding: (id) =>
    set((s) => {
      const list = buildingList(s.buildings);
      if (list.length < 2) return {};
      const buildings = list.filter((b) => b.id !== id);
      return { buildings, sections: s.sections.filter((x) => buildingIdOf(x, list) !== id), buildingId: buildings[0].id, selectedId: null };
    }),
  addSection: (sec) => set((s) => ({ sections: [...s.sections, sec], selectedId: sec.id, tool: 'select' })),
  updateSection: (id, patch) => set((s) => ({ sections: s.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  addObject: (o) => set((s) => ({ objects: [...s.objects, o], selectedId: o.id, tool: 'select' })),
  updateObject: (id, patch) => set((s) => ({ objects: s.objects.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  remove: (id) =>
    set((s) => {
      const sections = s.sections.filter((x) => x.id !== id);
      // a building whose last roof section went is gone too
      const list = buildingList(s.buildings);
      const left = list.filter((b) => sections.some((x) => buildingIdOf(x, list) === b.id));
      const buildings = sections.length === s.sections.length || !s.buildings.length ? s.buildings : left.length ? left : [];
      return { sections: left.length === list.length ? sections : sections.map((x) => ({ ...x, building: buildingIdOf(x, list) })), buildings, objects: s.objects.filter((x) => x.id !== id), selectedId: null };
    }),
  /** Replace the designer state with a design fetched from the backend. */
  loadDesign: (design, company, { readOnly = false } = {}) =>
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
        validUntil: design.validUntil || null,
        readOnly,
        client: design.client || null,
      };
    }),
  reset: () => set((st) => ({ ...initial, catalog: st.catalog, navigate: st.navigate })),
}));
