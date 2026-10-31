'use client';

// All · Meta · Google Ads · Manual on the right of the breadcrumb line, with each source's count. The sidebar has a
// single "Leads" entry; this control does what its sub-items used to, and keeps the view (list or pipeline) you are in.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCounts } from '@/lib/counts';
import BreadcrumbActions from '../layout/BreadcrumbActions';
import { cx } from '../kit';
import { leadPaths } from './LeadViewSwitch';

const SOURCES = [
  { id: null, label: 'All', countKey: 'leads' },
  { id: 'meta', label: 'Meta', countKey: 'metaLeads' },
  { id: 'google', label: 'Google Ads', countKey: 'googleLeads' },
  { id: 'manual', label: 'Manual', countKey: 'manualLeads' },
];

export default function LeadSourceTabs() {
  const pathname = usePathname();
  const { base, source } = leadPaths(pathname);
  const counts = useCounts((s) => s.counts);
  const onBoard = pathname.endsWith('/board');
  return (
    <BreadcrumbActions>
      <div role="tablist" aria-label="Lead source" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5 text-[13px]">
        {SOURCES.map((s) => {
          const active = s.id === source;
          const href = `${base}${s.id ? `/${s.id}` : ''}${onBoard ? '/board' : ''}`;
          const n = counts?.[s.countKey];
          return (
            <Link
              key={s.label}
              role="tab"
              aria-selected={active}
              href={href}
              className={cx('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors', active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}
            >
              {s.label}
              {n !== undefined && n !== null && <span className={cx('rounded-full px-1.5 py-px text-[11px] leading-none font-semibold tabular-nums', active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600')}>{n > 999 ? '999+' : n}</span>}
            </Link>
          );
        })}
      </div>
    </BreadcrumbActions>
  );
}
