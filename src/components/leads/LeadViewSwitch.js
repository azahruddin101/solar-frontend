'use client';

// List ⇄ Board: the same leads, as a table or as a Kanban board by status.
import { KanbanSquare, List } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '../kit';

/**
 * Where the list and the board live for the page we are on: the company's dashboard or the staff area, and all leads
 * or one source (Meta, Google Ads, Manual — each has its own list and its own board).
 */
export function leadPaths(pathname) {
  const path = pathname || '';
  const agent = path.startsWith('/agent');
  const base = agent ? '/agent/leads' : '/dashboard/leads';
  const source = ['meta', 'google', 'manual'].find((s) => path === `${base}/${s}` || path.startsWith(`${base}/${s}/`)) || null;
  const list = source ? `${base}/${source}` : base;
  return { agent, base, source, list, board: source ? `${base}/${source}/board` : `${base}/board` };
}

export default function LeadViewSwitch({ view }) {
  const paths = leadPaths(usePathname());
  const VIEWS = [
    { id: 'list', label: 'List', icon: List, href: paths.list },
    { id: 'board', label: 'Pipeline', icon: KanbanSquare, href: paths.board },
  ];
  return (
    <div role="tablist" aria-label="Lead view" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
      {VIEWS.map((v) => (
        <Link
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          href={v.href}
          className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors', view === v.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}
        >
          <v.icon className="h-4 w-4" />{v.label}
        </Link>
      ))}
    </div>
  );
}
