'use client';

// The house is designed by hand: the user marks each roof's outline on the satellite map (the picture
// is their reference), then picks the type of house that looks like theirs and its number of floors.
// Nothing is read from Google's Solar API any more (its measurements were not good enough).

import { useEffect } from 'react';
import { ensureCCW } from './geometry.js';
import { toLocal } from './geo.js';
import { buildingAzimuth, newId, normSection } from './model.js';
import { squareUp } from './squareUp.js';
import { useStore } from './store.js';

/** The roofs marked on the map, one outline per building (older designs kept a single `roofArea`). */
export const markedAreas = (st) => (Array.isArray(st.roofAreas) && st.roofAreas.length ? st.roofAreas.filter((a) => a?.length >= 3) : st.roofArea?.length >= 3 ? [st.roofArea] : []);
/** The middle of marked outlines (the average of all their corners: good enough for a roof). */
export const areasMiddle = (areas) => {
  const pts = areas.flat();
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
};
/** The types of house a user can pick: the one that looks most like their building. */
export const ROOF_STYLES = [
  { id: 'flat', label: 'Flat roof' },
  { id: 'shed', label: 'One slope' },
  { id: 'gable', label: 'Two slopes' },
  { id: 'hip', label: 'Four slopes' },
  { id: 'kerala', label: 'Kerala style' },
];

/** The style a roof section is drawn in (one of ROOF_STYLES). */
export const roofStyleOf = (sec) => (!sec.roofType || sec.roofType === 'flat' ? 'flat' : sec.roofType === 'shed' ? 'shed' : sec.roofType === 'gable' ? 'gable' : sec.ends === 'gable' || sec.ends === 'kerala' ? sec.ends : 'hip');

/** The side a single-slope roof falls to when none was chosen: the wall facing the sun. */
export const defaultSlopeAz = (sec, lat = useStore.getState().origin?.lat ?? 20) => buildingAzimuth([normSection({ ...sec, roofType: 'flat' })], lat);

/**
 * The same roof in another style or pitch: walls and outline stay, the roof on top changes. Uses the
 * heights measured when the roof was made (`auto`): the flat roof's level, and the wall height under
 * a sloped roof.
 */
export function restyleRoof(sec, style, pitch = sec.pitch) {
  if (sec.ground) sec = { ...sec, ground: false }; // a type of house was picked: it is a building again
  const auto = sec.auto || {};
  const wasFlat = !sec.roofType || sec.roofType === 'flat'; // a drawn roof has no type until one is picked
  // a roof made before these heights were kept: about a storey's roof height between the two
  if (style === 'flat') return { ...sec, roofType: 'flat', height: auto.flatH ?? (wasFlat ? sec.height : sec.height + 1), parapetH: 0.9 };
  const p = Math.max(10, Math.min(45, Math.round(pitch || auto.pitch || 25)));
  const wallH = auto.wallH ?? (wasFlat ? Math.max(2.4, sec.height - 1) : sec.height);
  // one plane falling towards `slopeAz` (the low wall is `height`); the side can be changed afterwards
  if (style === 'shed') return { ...sec, roofType: 'shed', pitch: p, slopeAz: sec.slopeAz ?? defaultSlopeAz(sec), height: wallH, parapetH: 0 };
  return { ...sec, roofType: 'hip', ends: style, overhang: sec.overhang ?? 0.4, pitch: p, height: wallH, parapetH: 0 };
}

/** Height of one floor (m): the building's height is chosen in floors, like the hand-drawn roofs. */
export const FLOOR_H = 3;

/** How many floors a measured roof stands on (its walls, or a flat roof's top, ÷ a floor's height). */
export const floorsOf = (sec) => sec.ground ? 0 : Math.max(1, Math.round((!sec.roofType || sec.roofType === 'flat' ? sec.height : sec.auto?.wallH ?? sec.height) / FLOOR_H));

/** The same roof on `floors` floors: walls (or a flat roof) at floors × FLOOR_H, any style after. */
export function setFloors(sec, floors) {
  const h = Math.max(1, floors) * FLOOR_H;
  const auto = { ...(sec.auto || {}), flatH: h, wallH: h, floors };
  // from the ground back onto a building: a flat-roofed one, until another type is picked
  if (sec.ground) return restyleRoof({ ...sec, auto }, 'flat');
  return { ...sec, height: h, auto };
}

/** Height (m) of the marked area of a ground-mounted system: the land itself, a hair above the picture. */
export const GROUND_H = 0.05;

/**
 * Panels mounted on the ground: the marked outline is the piece of land, with no building under it.
 * The panels stand on their frames as on a flat roof. The heights the building had are kept, so picking
 * a number of floors or a type of house brings it back.
 */
export function setGround(sec) {
  const flat = !sec.roofType || sec.roofType === 'flat';
  const auto = { ...(sec.auto || {}) };
  auto.flatH ??= flat ? sec.height : sec.height + 1;
  auto.wallH ??= flat ? Math.max(2.4, sec.height - 1) : sec.height;
  return { ...sec, ground: true, roofType: 'flat', height: GROUND_H, parapetH: 0, auto: { ...auto, floors: 0 } };
}

/**
 * The design's roofs, made from the outlines the user marked on the map: one building per outline
 * (local metres), its walls squared up. Each starts as a one-floor flat-roofed house; the Building step
 * asks which type of house it looks like and how many floors it has.
 */
export function sectionsFromOutlines(outlines = []) {
  const list = (outlines || []).filter((o) => o?.length >= 3);
  const buildings = list.map((_, i) => ({ id: `b${i + 1}`, name: `Building ${i + 1}` }));
  const sections = list.map((o, i) => {
    const points = ensureCCW(squareUp(ensureCCW(o), 25));
    const base = { id: newId('r'), name: 'Roof', building: buildings[i].id, fromMap: true, points, parapetT: 0.23, auto: { flatH: FLOOR_H, wallH: FLOOR_H, pitch: 25, floors: 1 } };
    return restyleRoof({ ...base, roofType: 'flat', height: FLOOR_H }, 'flat');
  });
  return { sections, buildings: buildings.length > 1 ? buildings : [] };
}

/**
 * Keep the roofs marked on the location step: the design's origin moves to their middle and the
 * solar plan is rebuilt from them. Returns false when the user keeps the design as it is.
 */
export function commitMarkedAreas(areas) {
  const st = useStore.getState();
  const list = (areas || []).filter((a) => a?.length >= 3);
  if (!list.length) return false;
  const same = JSON.stringify(markedAreas(st)) === JSON.stringify(list);
  if (same) {
    st.set({ markedDraft: null });
    return true;
  }
  if (st.sections.length && !window.confirm('Changing the roof outlines rebuilds the solar design. Continue?')) return false;
  st.set({ origin: areasMiddle(list), roofAreas: list, roofArea: list[0], sections: [], buildings: [], buildingId: null, objects: [], snapshot: null, layoutKey: '', markedDraft: null });
  return true;
}

/**
 * A design with roofs marked on the map but no roof yet (a new design, or outlines that were just
 * changed) gets its roofs from those outlines. Roofs that exist — drawn, or made from Google's
 * measurements in an older proposal — are left as they are.
 */
export function useMarkedRoofs(ready) {
  const origin = useStore((s) => s.origin);
  const roofArea = useStore((s) => s.roofArea);
  const roofAreas = useStore((s) => s.roofAreas);
  const empty = useStore((s) => s.sections.length === 0);
  const readOnly = useStore((s) => s.readOnly);
  useEffect(() => {
    if (!ready || !origin || !empty || readOnly) return;
    const areas = markedAreas({ roofArea, roofAreas });
    if (!areas.length) return;
    const { sections, buildings } = sectionsFromOutlines(areas.map((a) => a.map((p) => toLocal(p, origin))));
    if (!sections.length) return;
    const st = useStore.getState();
    st.set({ sections, buildings, objects: st.objects.filter((o) => o.type === 'tree' || o.type === 'block'), layoutKey: '' });
  }, [ready, origin, roofArea, roofAreas, empty, readOnly]);
}
