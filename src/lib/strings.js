'use client';

// String layout by hand: the user starts a string and taps panels (3D or plan) to put them in it.
// Picked strings live in store.electrical.strings; everything not picked is auto-strung (see
// lib/electrical.js). The active string and the 'string' tool are transient.

import { newId } from './model.js';
import { useStore } from './store.js';

const list = () => useStore.getState().electrical.strings || [];
const save = (strings, more = {}) => {
  const s = useStore.getState();
  s.set({ electrical: { ...s.electrical, strings }, ...more });
};

/** A new empty string, made the active one with the string tool armed. Returns its id. */
export function newString() {
  const id = newId('st');
  save([...list(), { id, modules: [] }], { activeStringId: id, tool: 'string', selectedId: null });
  return id;
}

/**
 * Edit an automatic string: every automatic string on screen becomes a picked one, exactly as it
 * is (so nothing reshuffles), and the chosen one opens in the string tool. Returns its new id.
 */
export function adoptAutoStrings(el, index) {
  const autos = (el?.strings || []).filter((st) => !st.manual);
  if (!autos.length) return null;
  const adopted = autos.map((st) => ({ id: newId('st'), modules: [...(st.modules || [])] }));
  const chosen = adopted[Math.max(0, autos.findIndex((st) => st.index === index))] || adopted[0];
  save([...list(), ...adopted], { activeStringId: chosen.id, tool: 'string', selectedId: null });
  return chosen.id;
}

/** Arm the string tool on an existing picked string. */
export function editString(id) {
  useStore.getState().set({ activeStringId: id, tool: 'string', selectedId: null });
}

/** Put the string tool away. */
export function stopStringTool() {
  const s = useStore.getState();
  if (s.tool === 'string') s.set({ tool: 'select' });
  s.set({ activeStringId: null });
}

export function renameString(id, name) {
  save(list().map((st) => (st.id === id ? { ...st, name: name || undefined } : st)));
}

/** Drop a picked string: its panels go back to the automatic strings. */
export function removeString(id) {
  const s = useStore.getState();
  save(list().filter((st) => st.id !== id), s.activeStringId === id ? { activeStringId: null, tool: s.tool === 'string' ? 'select' : s.tool } : {});
}

/** Back to fully automatic strings. */
export function clearStrings() {
  save([], { activeStringId: null, tool: useStore.getState().tool === 'string' ? 'select' : useStore.getState().tool });
}

/**
 * The string tool's tap: a panel not in the active string joins it (leaving any other picked
 * string); a panel already in it is taken out. Returns true when something changed.
 */
export function toggleModuleInString(moduleId, stringId) {
  if (!stringId) return false;
  const strings = list();
  if (!strings.some((st) => st.id === stringId)) return false;
  const next = strings.map((st) => {
    const has = (st.modules || []).includes(moduleId);
    if (st.id === stringId) return { ...st, modules: has ? st.modules.filter((m) => m !== moduleId) : [...(st.modules || []), moduleId] };
    return has ? { ...st, modules: st.modules.filter((m) => m !== moduleId) } : st;
  });
  save(next);
  return true;
}

/**
 * The string being built: its panels in the order they were tapped (that is the wiring order),
 * with their roof-plan positions, and its colour. Null when the string tool is away.
 */
export function activeStringPath(design, activeId, tool) {
  if (tool !== 'string' || !activeId) return null;
  const st = (useStore.getState().electrical.strings || []).find((x) => x.id === activeId);
  if (!st) return null;
  const byId = new Map(design.modules.map((m) => [m.id, m]));
  const el = (design.electrical?.strings || []).find((x) => x.id === activeId);
  const points = (st.modules || []).map((id) => byId.get(id)).filter(Boolean);
  return { id: st.id, color: el?.color || '#0f172a', points };
}

/** Module id → colour for the picked strings (the automatic ones stay uncoloured). */
export function pickedStringColors(el) {
  const map = new Map();
  for (const st of el?.strings || []) if (st.manual) for (const id of st.modules || []) map.set(id, st.color);
  return map;
}

// ── the Strings step: tap or drag across panels ─────────────────────────────────────────────
// On the Strings step the string tool is always out. A tap with no string open starts a new one
// with that panel (or opens the string the panel is already in); with a string open, a tap adds
// the panel or, if it is already in it, takes it out. Pressing and dragging keeps doing the same
// thing (adding, or taking out) over every panel passed. A string that is full (`maxLen`) is
// closed and the next panel starts a new string, so one drag along a long row splits it up.

const owner = (strings, moduleId) => strings.find((st) => (st.modules || []).includes(moduleId));

function addTo(moduleId, maxLen) {
  const s = useStore.getState();
  const strings = list();
  const active = strings.find((st) => st.id === s.activeStringId);
  if (active && (active.modules || []).includes(moduleId)) return;
  if (!active || (maxLen && (active.modules || []).length >= maxLen)) {
    // a new string, holding just this panel (taken from any other picked string)
    const id = newId('st');
    const rest = strings.map((st) => ((st.modules || []).includes(moduleId) ? { ...st, modules: st.modules.filter((m) => m !== moduleId) } : st));
    save([...rest, { id, modules: [moduleId] }], { activeStringId: id, tool: 'string', selectedId: null });
    return;
  }
  toggleModuleInString(moduleId, active.id);
}

/** Pointer down on a panel in the string tool. Returns the stroke's mode for `stringPaint`. */
export function stringStroke(moduleId, maxLen) {
  const s = useStore.getState();
  const strings = list();
  const active = strings.find((st) => st.id === s.activeStringId);
  if (active && (active.modules || []).includes(moduleId)) {
    toggleModuleInString(moduleId, active.id);
    return 'remove';
  }
  if (!active) {
    const mine = owner(strings, moduleId);
    if (mine) {
      // a panel of a picked string: open that string (dragging on adds to it)
      s.set({ activeStringId: mine.id, tool: 'string', selectedId: null });
      return 'add';
    }
  }
  addTo(moduleId, maxLen);
  return 'add';
}

/** The pointer passed over another panel while still pressed. */
export function stringPaint(moduleId, mode, maxLen) {
  const s = useStore.getState();
  const active = list().find((st) => st.id === s.activeStringId);
  if (mode === 'remove') {
    if (active && (active.modules || []).includes(moduleId)) toggleModuleInString(moduleId, active.id);
    return;
  }
  addTo(moduleId, maxLen);
}

/** Take the last tapped panel off the open string. */
export function undoLastPanel() {
  const s = useStore.getState();
  const active = list().find((st) => st.id === s.activeStringId);
  if (!active?.modules?.length) return;
  save(list().map((st) => (st.id === active.id ? { ...st, modules: st.modules.slice(0, -1) } : st)));
}

/** Close the open string (an empty one is dropped); the string tool stays out. */
export function finishString() {
  const s = useStore.getState();
  const active = list().find((st) => st.id === s.activeStringId);
  if (active && !(active.modules || []).length) save(list().filter((st) => st.id !== active.id), { activeStringId: null });
  else s.set({ activeStringId: null });
}

/** Module id → colour for every string, the automatic ones too (the Strings step colours the roof). */
export function allStringColors(el) {
  const map = new Map();
  for (const st of el?.strings || []) for (const id of st.modules || []) map.set(id, st.color);
  return map;
}
