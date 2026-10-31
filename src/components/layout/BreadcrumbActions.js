'use client';

// Puts its children on the right of the breadcrumb line (a page's Filters button, say). Renders in place when the
// line is not there, e.g. on an area's home page.
import { createPortal } from 'react-dom';
import { useBreadcrumbStore } from '@/lib/breadcrumbs';

export default function BreadcrumbActions({ children }) {
  const slot = useBreadcrumbStore((s) => s.slot);
  return slot ? createPortal(children, slot) : children;
}
