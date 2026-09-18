'use client';

import { offsetPolygon } from './geometry.js';
import { newId } from './model.js';
import { useStore } from './store.js';

/** Replace auto zones with one zone per roof section using the current defaults. */
export function autoFillRoof(design) {
  const s = useStore.getState();
  const c = s.config;
  const zones = design.sections.map((sec) => {
    const inner = offsetPolygon(sec.poly, 0.05);
    return { id: newId('z'), type: 'zone', auto: true, points: inner.length >= 3 ? inner : sec.poly, tilt: c.tilt, azimuth: design.defaultAzimuth, frontLeg: c.frontLeg, rowsPerTable: c.rowsPerTable, orientation: c.orientation, rowGap: c.rowGap };
  });
  s.set({ objects: [...s.objects.filter((o) => !(o.type === 'zone' && o.auto)), ...zones], selectedId: null });
}
