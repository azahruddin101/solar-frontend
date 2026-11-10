'use client';

// Copy / paste of what is selected on the roof (a base with its panels, an obstacle, a tree):
// Ctrl/⌘ + C copies, Ctrl/⌘ + V pastes a copy next to the original (each further paste steps on, so copies
// never land on each other) and selects it, Ctrl/⌘ + D duplicates at once. With a package, a pasted base takes
// only the panels the package still has (withinPackage). Each paste is one undo step (history.js).

import { withinPackage } from './autofill.js';
import { newId } from './model.js';
import { useStore } from './store.js';

const STEP = 2; // m between a copy and the one before it
let clip = null; // { object, pastes }

/** The selected object that can be copied, or null. */
function selected() {
  const s = useStore.getState();
  const o = s.objects.find((x) => x.id === s.selectedId);
  return o && ['array', 'block', 'tree'].includes(o.type) ? o : null;
}

export function copySelected() {
  const o = selected();
  if (!o) return false;
  clip = { object: structuredClone(o), pastes: 0 };
  return true;
}

/** Paste the copied object; `spec` is the design's panel (for the package's panel count). */
export function paste(spec) {
  const s = useStore.getState();
  if (!clip || s.readOnly) return false;
  clip.pastes += 1;
  const src = clip.object;
  const d = STEP * clip.pastes;
  const name = src.name ? `${src.name.replace(/ copy( \d+)?$/, '')} copy${clip.pastes > 1 ? ` ${clip.pastes}` : ''}` : src.name;
  const copy = { ...structuredClone(src), id: newId(src.type === 'array' ? 'g' : 'o'), x: (src.x ?? 0) + d, y: (src.y ?? 0) - d, auto: false, ...(name ? { name } : {}) };
  // an obstacle drawn by its outline moves with it
  if (Array.isArray(copy.points)) copy.points = copy.points.map((p) => ({ ...p, x: p.x + d, y: p.y - d }));
  s.addObject(copy.type === 'array' && spec ? { ...copy, ...withinPackage(copy, {}, spec, { isNew: true }) } : copy);
  return true;
}

/** Keyboard: Ctrl/⌘ + C, V, D (left alone inside text fields). `getSpec` gives the design's panel. Returns the remover. */
export function clipboardKeys(getSpec) {
  const onKey = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (window.getSelection?.()?.toString()) return; // text selected on the page: the browser's own copy
    const k = e.key.toLowerCase();
    if (k === 'c' && copySelected()) e.preventDefault();
    else if (k === 'v' && clip) {
      e.preventDefault();
      paste(getSpec());
    } else if (k === 'd' && selected()) {
      e.preventDefault(); // (the browser's bookmark shortcut)
      copySelected();
      paste(getSpec());
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
