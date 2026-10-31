'use client';

// Where you are: Home › Leads › Manual leads › Board. Built from the URL, named by the sidebar's own labels, with a
// page able to put a record's name in place of "Details" (lib/breadcrumbs.js). Hidden on the area's home page.
import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { useBreadcrumbStore } from '@/lib/breadcrumbs';
import { cx } from '../kit';

/** Labels for segments the sidebar does not name (sub-pages, settings pages reached from elsewhere). */
const SEGMENT_LABELS = {
  board: 'Pipeline',
  edit: 'Edit',
  new: 'New',
  roles: 'Roles',
  analytics: 'Analytics',
  reasons: 'Expense reasons',
  integrations: 'Integrations',
  classic: 'Classic dashboard',
  workflow: 'Installation steps',
  'agent-roles': 'Job titles',
  categories: 'Catalog categories',
  units: 'Product units',
  'installation-charges': 'Installation charges',
  plan: 'Plan',
  notifications: 'Notifications',
  projects: 'Installations',
  meta: 'Meta leads',
  google: 'Google Ads leads',
  manual: 'Manual leads',
  designs: 'Proposals',
  leads: 'Leads',
  support: 'Platform support',
};
/** Paths that are not pages of their own (a segment with no list behind it): shown, not linked. */
const NOT_PAGES = new Set(['/agent/projects', '/admin/companies/leads']);
const isId = (seg) => /^[a-f0-9]{24}$/i.test(seg);
const titleCase = (seg) => seg.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** href → label from the sidebar config (groups → items → children). */
function navLabels(nav) {
  const out = {};
  for (const group of nav || []) {
    for (const item of group.items || []) {
      if (item.href) out[item.href] = item.label;
      for (const child of item.children || []) out[child.href] = child.label;
    }
  }
  return out;
}

export default function Breadcrumbs({ nav }) {
  const pathname = usePathname();
  const labels = useBreadcrumbStore((s) => s.labels);
  const tails = useBreadcrumbStore((s) => s.tails);
  const setSlot = useBreadcrumbStore((s) => s.setSlot);
  const slotRef = useCallback((node) => setSlot(node), [setSlot]); // pages portal their controls here (BreadcrumbActions)
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null; // the area's home page: nothing to trail back to

  const root = `/${segments[0]}`;
  const fromNav = navLabels(nav);
  const crumbs = segments.slice(1).map((seg, i) => {
    const href = `${root}/${segments.slice(1, i + 2).join('/')}`;
    const label = labels[href] || fromNav[href] || SEGMENT_LABELS[seg] || (isId(seg) ? 'Details' : titleCase(seg));
    return { href, label, link: !NOT_PAGES.has(href) };
  });
  const tail = tails[pathname];
  const last = crumbs.length - 1;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 -mt-2 flex min-h-8 items-center justify-between gap-4 lg:-mt-4">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-slate-500">
        <li className="flex items-center">
          <Link href={root} className="grid h-6 w-6 place-items-center rounded-md hover:bg-slate-100 hover:text-slate-900" aria-label="Home"><Home className="h-3.5 w-3.5" /></Link>
        </li>
        {crumbs.map((c, i) => {
          const current = i === last && !tail;
          return (
            <li key={c.href} className={cx('flex min-w-0 items-center gap-1', i < last - 1 && 'hidden sm:flex')}>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
              {current ? (
                <span aria-current="page" className="max-w-[16rem] truncate font-medium text-slate-900">{c.label}</span>
              ) : c.link ? (
                <Link href={c.href} className="max-w-[12rem] truncate rounded-sm hover:text-slate-900 hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">{c.label}</Link>
              ) : (
                <span className="max-w-[12rem] truncate">{c.label}</span>
              )}
            </li>
          );
        })}
        {last > 1 && <li className="flex items-center gap-1 sm:hidden"><ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden /><span aria-hidden>…</span></li>}
        {tail && (
          <li className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
            <span aria-current="page" className="max-w-[16rem] truncate font-medium text-slate-900">{tail}</span>
          </li>
        )}
      </ol>
      <div ref={slotRef} className="flex shrink-0 items-center gap-2" />
    </nav>
  );
}
