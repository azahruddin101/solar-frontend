// Automatic roof detection: ask the backend to read the satellite picture, then turn its answer
// (roof parts as lat/lng outlines with roof settings) into this building's roof sections.

import { api } from './api.js';
import { buildingIdOf, buildingList } from './buildings.js';
import { toLocal } from './geo.js';
import { buildingAzimuth, newId, normSection } from './model.js';

/** Ask the backend: { source, ai, confidence, notes, storeys, parts }. Throws ApiError with a plain message. */
export const detectRoofAt = ({ lat, lng }, signal) => api('/api/roof-detect', { method: 'POST', body: { lat, lng }, signal });
/** The user's own outline (lat/lng points) is the roof: only what is inside it is read. */
export const detectRoofIn = (outline, signal) => api('/api/roof-detect', { method: 'POST', body: { outline }, signal });

const NAMES = { main: 'Main roof', upper: 'Upper floor roof', verandah: 'Verandah roof' };

/**
 * Roof sections for one building from a detection. The main roof comes first (it is the building's
 * main section); a lower main roof under an upper floor is kept low enough not to poke through it.
 */
export function sectionsFromDetection(result, origin, building, lat) {
  const count = { main: 0, upper: 0, verandah: 0 };
  const sections = result.parts.map((p) => {
    count[p.role] += 1;
    const sec = {
      id: newId('r'),
      name: count[p.role] > 1 ? `${NAMES[p.role]} ${count[p.role]}` : NAMES[p.role],
      building,
      points: p.points.map((q) => toLocal(q, origin)),
      height: p.height,
      parapetH: p.roofType === 'flat' ? (p.parapetH ?? 1) : 0,
      parapetT: 0.23,
      roofType: p.roofType,
      detected: true,
    };
    if (p.roofType === 'flat') return sec;
    Object.assign(sec, { pitch: p.pitch });
    if (p.roofType === 'hip') Object.assign(sec, { ends: p.ends, overhang: p.overhang });
    else sec.slopeAz = p.slopeAz ?? buildingAzimuth([normSection({ ...sec, roofType: 'flat' })], lat);
    return sec;
  });
  // a sloped main roof under an upper floor: its top stays a little below the upper floor's walls
  const main = sections[0];
  const uppers = sections.filter((s) => s.name.startsWith(NAMES.upper));
  if (main && main.roofType !== 'flat' && uppers.length) {
    const fr = normSection(main).frame;
    const limit = Math.min(...uppers.map((u) => u.height)) - 0.3 - main.height;
    if (fr && fr.rise > limit && limit > 0.3) {
      const tan = Math.tan((main.pitch * Math.PI) / 180) * (limit / fr.rise);
      main.pitch = Math.max(8, Math.round((Math.atan(tan) * 180) / Math.PI));
    }
  }
  return sections;
}

/**
 * Put a detection on the design: it replaces the roof of `buildingId` (or makes the first roof).
 * Returns what was there before, so it can be put back.
 */
export function applyDetection(store, result, buildingId) {
  const s = store.getState();
  const building = buildingId || buildingList(s.buildings)[0].id;
  const before = { sections: s.sections, buildings: s.buildings };
  const others = s.sections.filter((x) => buildingIdOf(x, s.buildings) !== building);
  const lat = s.origin?.lat ?? 0;
  s.set({ sections: [...others, ...sectionsFromDetection(result, s.origin, building, lat)], buildingId: building, tool: 'select', pendingKey: null, selectedId: null });
  return before;
}
