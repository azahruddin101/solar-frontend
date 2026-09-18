'use client';

import { offsetPolygon } from './geometry.js';
import { buildDesign, newId } from './model.js';
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

/**
 * Auto-arrange panels as independent groups (one array object per table), optionally
 * limited to `count` panels. Groups can then be moved / tilted / resized individually.
 */
export function autoGroups(design, count = 0) {
  const s = useStore.getState();
  const c = s.config;
  const keep = s.objects.filter((o) => o.type === 'tree' || o.type === 'block');
  const zones = design.sections.map((sec) => {
    const inner = offsetPolygon(sec.poly, 0.05);
    return { id: newId('z'), type: 'zone', points: inner.length >= 3 ? inner : sec.poly, tilt: c.tilt, azimuth: design.defaultAzimuth, frontLeg: c.frontLeg, rowsPerTable: c.rowsPerTable, orientation: c.orientation, rowGap: c.rowGap };
  });
  const temp = buildDesign({ sections: s.sections, objects: [...keep, ...zones], config: { ...c, maxPanels: count }, lat: design.lat });
  const groups = temp.tables.map((t, i) => ({ id: newId('g'), type: 'array', name: `Group ${i + 1}`, x: t.x, y: t.y, rows: t.rows, cols: t.cols, tilt: t.tilt, azimuth: t.azimuth, frontLeg: t.frontLeg, orientation: t.orientation }));
  s.set({ objects: [...keep, ...groups], selectedId: null, config: { ...c, maxPanels: 0, targetKw: 0 } });
  return groups.length;
}
