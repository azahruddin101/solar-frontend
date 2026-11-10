'use client';

// The house as Google measured it (the js-solar-potential methodology): once the location is set,
// Google's measurements (outline, roof faces, heights) become the design's roof — nothing is drawn.

import { useEffect } from 'react';
import { api } from './api.js';
import { pointInPolygon, polygonCentroid, signedArea } from './geometry.js';
import { toLocal } from './geo.js';
import { buildingAzimuth, newId, normSection, roofZ } from './model.js';
import { useStore } from './store.js';

export const originKey = (o) => (o ? `${o.lat.toFixed(6)},${o.lng.toFixed(6)}` : '');
/** The roofs marked on the map, one outline per building (older designs kept a single `roofArea`). */
export const markedAreas = (st) => (Array.isArray(st.roofAreas) && st.roofAreas.length ? st.roofAreas.filter((a) => a?.length >= 3) : st.roofArea?.length >= 3 ? [st.roofArea] : []);
/** The middle of marked outlines (the average of all their corners: good enough for a roof). */
export const areasMiddle = (areas) => {
  const pts = areas.flat();
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
};
/** The marked roofs for the API ("lat,lng;…|lat,lng;…", one outline per building), or '' when only a pin was set. */
const areaParam = (areas) => areas.filter((a) => a?.length >= 3).map((a) => a.map((p) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`).join(';')).join('|');
/** A short fingerprint of the marked roofs: a moved or added outline rebuilds the roof. */
const areaKey = (areas) => {
  const s = areaParam(areas);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return s ? `|a${(h >>> 0).toString(36)}` : '';
};

/** The roof styles a user can pick for the measured house. */
export const ROOF_STYLES = [
  { id: 'flat', label: 'Flat' },
  { id: 'shed', label: 'Single slope' },
  { id: 'hip', label: 'Four slopes' },
  { id: 'gable', label: 'Two slopes' },
  { id: 'kerala', label: 'Kerala' },
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
export const floorsOf = (sec) => Math.max(1, Math.round((!sec.roofType || sec.roofType === 'flat' ? sec.height : sec.auto?.wallH ?? sec.height) / FLOOR_H));

/** The same roof on `floors` floors: walls (or a flat roof) at floors × FLOOR_H, any style after. */
export function setFloors(sec, floors) {
  const h = Math.max(1, floors) * FLOOR_H;
  return { ...sec, height: h, auto: { ...(sec.auto || {}), flatH: h, wallH: h, floors } };
}

function sectionForHouse(house, planes, key, building, alone = true) {
  const footprint = house.footprint;
  const heights = (house.heightsCm || []).filter((v) => v >= 0).map((v) => v / 100).sort((a, b) => a - b);
  const q = (f) => (heights.length ? heights[Math.floor(f * (heights.length - 1))] : null);
  const own = planes.filter((p) => p.centre && pointInPolygon(p.centre, footprint));
  // the faces on this roof; the only house may borrow every face, another building's faces say nothing about this one
  const use = own.length ? own : alone ? planes : [];
  const planeH = use.map((p) => p.height).sort((a, b) => a - b);
  const mid = q(0.5) ?? planeH[Math.floor(planeH.length / 2)] ?? 3;
  let total = 0;
  let steep = 0;
  let steepPitch = 0;
  for (const p of use) {
    const a = Math.abs(signedArea(p.points));
    total += a;
    if (p.pitch >= 12) {
      steep += a;
      steepPitch += a * p.pitch;
    }
  }
  const sloped = total > 0 && steep / total >= 0.35;
  const pitch = steep ? Math.max(15, Math.min(45, Math.round(steepPitch / steep))) : 25;
  const hip = { roofType: 'hip', ends: 'hip', overhang: 0.4, pitch, points: footprint, height: Math.max(2.4, q(0.1) ?? mid - 1.5) };
  const misses = use.filter((p) => p.pitch >= 12 || !sloped).map((p) => p.height - roofZ(normSection(hip), p.centre.x, p.centre.y)).filter(Number.isFinite).sort((a, b) => a - b);
  const wallH = Math.round(Math.max(2.4, hip.height + (misses.length ? misses[Math.floor((misses.length - 1) / 2)] : 0)) * 100) / 100;
  const flatH = Math.round(Math.max(2.4, mid) * 100) / 100;
  const base = { id: newId('r'), name: 'Roof', building, fromGoogle: true, googleKey: key, points: footprint, parapetT: 0.23, auto: { flatH, wallH, pitch, style: sloped ? 'hip' : 'flat' } };
  return restyleRoof({ ...base, roofType: 'flat', height: flatH }, sloped ? 'hip' : 'flat', pitch);
}

/**
 * The design's roofs, built from what Google measured: one clean roof per building in the marked
 * areas. `outlines`: the marked roofs (local metres, one per building); a marked roof Google found no
 * house in becomes a building of its own, with the outline as its roof.
 */
export function sectionsFromModel(model, key, outlines = []) {
  const listed = (model.houses?.length ? model.houses : model.house ? [model.house] : []).filter((h) => h.footprint?.length >= 3);
  const houses = [...listed];
  for (const o of outlines || []) {
    if (o?.length >= 3 && !houses.some((h) => pointInPolygon(polygonCentroid(h.footprint), o))) houses.push({ footprint: o, heightsCm: [] });
  }
  if (!houses.length) return { sections: [], buildings: [] };
  const buildings = houses.map((_, i) => ({ id: `b${i + 1}`, name: `Building ${i + 1}` }));
  const sections = houses.map((h, i) => sectionForHouse(h, model.planes || [], key, buildings[i].id, houses.length === 1));
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

/** Load Google's model for the design's location and, for a new or Google-made roof, use its faces. */
export function useSolarModel(ready) {
  const origin = useStore((s) => s.origin);
  const roofArea = useStore((s) => s.roofArea);
  const roofAreas = useStore((s) => s.roofAreas);
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!ready || !origin) return undefined;
    // only what is inside the roofs the user marked is read (older designs have just the pin)
    const areas = markedAreas({ roofArea, roofAreas });
    const key = originKey(origin) + areaKey(areas);
    const outline = areaParam(areas);
    const ctrl = new AbortController();
    set({ solarModel: { status: 'loading', data: null, error: null, key } });
    api(`/api/solar/model?lat=${origin.lat}&lng=${origin.lng}${outline ? `&outline=${encodeURIComponent(outline)}` : ''}&r=2`, { signal: ctrl.signal })
      .then((data) => {
        const st = useStore.getState();
        st.set({ solarModel: { status: 'ok', data, error: null, key: `${key}|v${data.version || 1}` } });
        if (st.readOnly) return;
        // a roof drawn by hand in an older proposal is left as it is; an empty roof, or a roof made
        // from Google's data for another spot (or by an older way of building it), is (re)built
        const made = (s) => s.fromGoogle || s.google;
        const drawn = st.sections.some((s) => !made(s));
        const faceKey = `${key}|v${data.version || 1}`;
        const current = st.sections.length && st.sections.every((s) => s.fromGoogle && s.googleKey === faceKey);
        if (!drawn && !current) {
          const marked = areas.map((a) => a.map((p) => toLocal(p, origin)));
          const { sections, buildings } = sectionsFromModel(data, faceKey, marked);
          if (!sections.length) return;
          const keep = st.objects.filter((o) => o.type === 'tree' || o.type === 'block');
          st.set({ sections, buildings, objects: keep, layoutKey: '' });
        }
      })
      .catch((e) => !ctrl.signal.aborted && set({ solarModel: { status: 'error', data: null, error: e.message, key } }));
    return () => ctrl.abort();
  }, [ready, origin, roofArea, roofAreas, set]);
}
