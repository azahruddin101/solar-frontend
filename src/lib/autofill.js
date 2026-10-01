'use client';

import { buildDesign, newId, zonesForSection } from './model.js';
import { useStore } from './store.js';

/** Replace auto zones with one zone per roof section using the current defaults. */
export function autoFillRoof(design) {
  const s = useStore.getState();
  const c = s.config;
  const zones = design.sections.flatMap((sec) => zonesForSection(sec, c, design.azimuthFor(sec), design.lat, newId('z'))).map((z) => ({ ...z, auto: true }));
  s.set({ objects: [...s.objects.filter((o) => !(o.type === 'zone' && o.auto)), ...zones], selectedId: null });
}

/**
 * Auto-arrange panels as independent groups (one array object per table), optionally
 * limited to `count` panels. Groups can then be moved / tilted / resized individually.
 *
 * Groups are rows × cols rectangles, so a limit that is not a multiple of the rows per table lands
 * just under it (13 → 12). With `atLeast`, the limit is raised until the layout covers `count`
 * (13 → 14) — used when sizing to a bill or a kW figure, where falling short is the wrong side.
 */
export function autoGroups(design, count = 0, { atLeast = false } = {}) {
  const s = useStore.getState();
  const c = s.config;
  const keep = s.objects.filter((o) => o.type === 'tree' || o.type === 'block');
  // flat roofs: one zone with the design's tilt; sloped roofs: one zone per slope, panels flush
  const zones = design.sections.flatMap((sec) => zonesForSection(sec, c, design.azimuthFor(sec), design.lat, newId('z')));
  const layout = (limit) => {
    const temp = buildDesign({ sections: s.sections, buildings: s.buildings, objects: [...keep, ...zones], config: { ...c, maxPanels: limit }, lat: design.lat, spec: design.spec });
    return temp.tables.map((t, i) => ({ id: newId('g'), type: 'array', name: `Group ${i + 1}`, x: t.x, y: t.y, rows: t.rows, cols: t.cols, tilt: t.tilt, azimuth: t.azimuth, frontLeg: t.frontLeg, orientation: t.orientation }));
  };
  const placed = (groups) => groups.reduce((a, g) => a + g.rows * g.cols, 0);

  let groups = layout(count);
  if (atLeast && count > 0) {
    // stops as soon as the target is covered, or when a higher limit adds nothing (the roof is full)
    for (let limit = count + 1, last = placed(groups); last < count && limit <= count + 8; limit++) {
      const next = layout(limit);
      if (placed(next) <= last && limit > count + 4) break;
      if (placed(next) > last) {
        groups = next;
        last = placed(next);
      }
    }
  }
  s.set({ objects: [...keep, ...groups], selectedId: null, config: { ...c, maxPanels: 0, targetKw: 0 } });
  return groups.length;
}
