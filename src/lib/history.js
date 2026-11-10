'use client';

// Undo / redo for the design. Every change to what the design is made of (bases and panels, roof sections,
// buildings, settings and pricing choices, hand-picked strings) is recorded; changes that come in a quick burst
// (a drag, typing a number, the automatic follow-ups of one action) are one step, so one undo takes back the whole
// action. Restoring a step goes through the store like any edit, so the autosave saves it.

import { create } from 'zustand';
import { useStore } from './store.js';

/** The parts of the store a step restores. `layoutKey` goes with the sections, so a restored roof is not re-laid out. */
const KEYS = ['objects', 'sections', 'buildings', 'config', 'electrical', 'layoutKey'];
const LIMIT = 100; // steps kept
const BURST_MS = 600; // changes closer together than this are one step

let past = [];
let future = [];
let lastChange = 0;
let quietUntil = 0; // just after an undo / redo: the app's own follow-up changes are not new steps
let armed = false; // recording starts with the user's first click or key on the opened design (not its own set-up)

const snapshot = (st) => Object.fromEntries(KEYS.map((k) => [k, st[k]]));
const changed = (st, prev) => KEYS.some((k) => st[k] !== prev[k]);

/** Whether there is anything to undo / redo (for the buttons). */
export const useHistory = create(() => ({ canUndo: false, canRedo: false }));
const sync = () => useHistory.setState({ canUndo: past.length > 0, canRedo: future.length > 0 });

/** Start recording; returns the function that stops it. */
export function startHistory() {
  past = [];
  future = [];
  armed = false;
  sync();
  const arm = () => (armed = true);
  window.addEventListener('pointerdown', arm, true);
  window.addEventListener('keydown', arm, true);
  const unsubscribe = useStore.subscribe((st, prev) => {
    if (st.designId !== prev.designId) {
      // another design opened: its own history starts empty
      past = [];
      future = [];
      lastChange = 0;
      armed = false;
      return sync();
    }
    if (!armed || !st.designId || st.readOnly || !changed(st, prev)) return;
    const now = Date.now();
    if (now < quietUntil) return;
    // the first change of a burst records the state before it
    if (now - lastChange > BURST_MS) {
      past.push(snapshot(prev));
      if (past.length > LIMIT) past.shift();
    }
    lastChange = now;
    future = [];
    sync();
  });
  return () => {
    unsubscribe();
    window.removeEventListener('pointerdown', arm, true);
    window.removeEventListener('keydown', arm, true);
  };
}

function restore(snap) {
  quietUntil = Date.now() + BURST_MS;
  lastChange = 0;
  useStore.setState({ ...snap, selectedId: null, activeStringId: null, tool: 'select', pendingKey: null });
  sync();
}

export function undo() {
  const st = useStore.getState();
  if (!past.length || st.readOnly) return false;
  future.push(snapshot(st));
  restore(past.pop());
  return true;
}

export function redo() {
  const st = useStore.getState();
  if (!future.length || st.readOnly) return false;
  past.push(snapshot(st));
  restore(future.pop());
  return true;
}

/**
 * Keyboard: Ctrl/⌘ + Z undo, Ctrl/⌘ + Shift + Z or Ctrl + Y redo. Inside a text field the field's own undo is
 * left alone. Returns the function that removes the listener.
 */
export function historyKeys() {
  const onKey = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.metaKey)) {
      e.preventDefault();
      redo();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
