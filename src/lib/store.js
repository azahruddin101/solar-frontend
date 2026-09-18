'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const DEFAULT_BUILDING = {
  floors: 2,
  floorHeight: 3.1,
  roofType: 'flat',
  roofPitch: 22,
  roofAzimuth: 180,
  overhang: 0.4,
  parapet: 0.9,
  wallColor: '#ebe4d8',
  roofColor: '#9a4b3c',
  showWindows: true,
};

export const DEFAULT_ARRAY = {
  mount: 'rack',
  tilt: 15,
  azimuth: 180,
  orientation: 'portrait',
  setback: 0.6,
  maxPanels: 0,
};

export const DEFAULT_FINANCE = {
  currency: 'INR',
  tariff: 8,
  costPerKw: 55000,
  efficiency: 85,
  degradation: 0.5,
  escalation: 3,
};

const initial = {
  step: 0,
  place: null,
  polygon: [],
  closed: false,
  origin: null,
  solar: { status: 'idle', data: null, error: null, key: null },
  showSegments: true,
  building: DEFAULT_BUILDING,
  designInit: false,
  array: DEFAULT_ARRAY,
  panelSpecId: 'google',
  panels: [],
  autoLayout: false,
  selectedId: null,
  tool: 'select',
  finance: DEFAULT_FINANCE,
  financeInit: false,
  report: { projectName: '', customerName: '', preparedBy: '' },
  sun: { month: 5, hour: 12 },
  snapshot: null,
};

export const useStore = create(
  persist(
    (set) => ({
      ...initial,
      setStep: (step) => set({ step, selectedId: null }),
      setPlace: (place) => set({ place }),
      setPolygon: (polygon, closed) => set((s) => ({ polygon, closed: closed ?? s.closed })),
      closePolygon: (origin) => set({ closed: true, origin }),
      clearPolygon: () => set({ polygon: [], closed: false, origin: null, panels: [], selectedId: null, autoLayout: false, designInit: false }),
      setSolar: (solar) => set((s) => ({ solar: { ...s.solar, ...solar } })),
      toggleSegments: () => set((s) => ({ showSegments: !s.showSegments })),
      updateBuilding: (patch) => set((s) => ({ building: { ...s.building, ...patch } })),
      initDesign: (building, array, panelSpecId) =>
        set((s) => ({ designInit: true, building: { ...s.building, ...building }, array: { ...s.array, ...array }, panelSpecId: panelSpecId ?? s.panelSpecId })),
      updateArray: (patch) => set((s) => ({ array: { ...s.array, ...patch } })),
      setPanelSpecId: (panelSpecId) => set({ panelSpecId }),
      setPanels: (panels, autoLayout = false) => set({ panels, autoLayout, selectedId: null }),
      addPanel: (panel) => set((s) => ({ panels: [...s.panels, panel], autoLayout: false, selectedId: panel.id })),
      updatePanel: (id, patch) => set((s) => ({ panels: s.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)), autoLayout: false })),
      removePanel: (id) => set((s) => ({ panels: s.panels.filter((p) => p.id !== id), selectedId: s.selectedId === id ? null : s.selectedId, autoLayout: false })),
      select: (selectedId) => set({ selectedId }),
      setTool: (tool) => set({ tool }),
      updateFinance: (patch) => set((s) => ({ finance: { ...s.finance, ...patch }, financeInit: true })),
      updateReport: (patch) => set((s) => ({ report: { ...s.report, ...patch } })),
      setSun: (patch) => set((s) => ({ sun: { ...s.sun, ...patch } })),
      setSnapshot: (snapshot) => set({ snapshot }),
      resetAll: () => set({ ...initial }),
    }),
    {
      name: 'solar-roof-planner-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        step: s.step,
        place: s.place,
        polygon: s.polygon,
        closed: s.closed,
        origin: s.origin,
        showSegments: s.showSegments,
        building: s.building,
        designInit: s.designInit,
        array: s.array,
        panelSpecId: s.panelSpecId,
        panels: s.panels,
        autoLayout: s.autoLayout,
        finance: s.finance,
        financeInit: s.financeInit,
        report: s.report,
        sun: s.sun,
      }),
    },
  ),
);
