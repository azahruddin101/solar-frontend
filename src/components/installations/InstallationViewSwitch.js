'use client';

// List ⇄ Board: the installations as a table, or their steps as a Kanban board by status.
import { KanbanSquare, List } from 'lucide-react';
import Link from 'next/link';
import { cx } from '../kit';

export default function InstallationViewSwitch({ view, basePath = '/dashboard/installations', listHref = basePath }) {
  const VIEWS = [
    { id: 'list', label: 'List', icon: List, href: listHref },
    { id: 'board', label: 'Pipeline', icon: KanbanSquare, href: `${basePath}/board` },
  ];
  return (
    <div role="tablist" aria-label="Installation view" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
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
