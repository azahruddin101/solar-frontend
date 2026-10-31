// Breadcrumb labels that only a page knows: a client's name on /dashboard/clients/<id>, the tab open on Manage Masters.
// A page registers its label while it is mounted; the shell's Breadcrumbs reads them by path.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { create } from 'zustand';

export const useBreadcrumbStore = create((set) => ({
  labels: {}, // path → label (replaces the generic label for that segment, e.g. "Details" → "Ravi Kumar")
  tails: {}, // path → label appended after the page (e.g. the open tab)
  slot: null, // the element on the right of the breadcrumb line that a page may put controls into (BreadcrumbActions)
  setSlot: (slot) => set({ slot }),
  setLabel: (path, label) => set((s) => ({ labels: { ...s.labels, [path]: label } })),
  clearLabel: (path) => set((s) => { const labels = { ...s.labels }; delete labels[path]; return { labels }; }),
  setTail: (path, label) => set((s) => ({ tails: { ...s.tails, [path]: label } })),
  clearTail: (path) => set((s) => { const tails = { ...s.tails }; delete tails[path]; return { tails }; }),
}));

/** Name the current page (or `path`) in the breadcrumbs, e.g. the record's name instead of "Details". Nothing happens until `label` is known. */
export function useBreadcrumb(label, path) {
  const pathname = usePathname();
  const key = path || pathname;
  const setLabel = useBreadcrumbStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbStore((s) => s.clearLabel);
  useEffect(() => {
    if (!label) return undefined;
    setLabel(key, label);
    return () => clearLabel(key);
  }, [key, label, setLabel, clearLabel]);
}

/** Add a crumb after the current page, e.g. the tab that is open. */
export function useBreadcrumbTail(label) {
  const pathname = usePathname();
  const setTail = useBreadcrumbStore((s) => s.setTail);
  const clearTail = useBreadcrumbStore((s) => s.clearTail);
  useEffect(() => {
    if (!label) return undefined;
    setTail(pathname, label);
    return () => clearTail(pathname);
  }, [pathname, label, setTail, clearTail]);
}
