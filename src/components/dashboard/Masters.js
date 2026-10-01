'use client';

// Manage Masters: the setup lists behind proposals, the catalog and installations, on one page.
// The tabs sit at the top right; the chosen tab lives in the URL (?tab=…), so it can be linked to and survives a reload.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCounts } from '@/lib/counts';
import { cx } from '../kit';
import AgentRoles from './AgentRoles';
import Categories from './Categories';
import InstallationCharges from './InstallationCharges';
import ProductUnits from './ProductUnits';
import Workflow from './Workflow';

const TABS = [
  { id: 'agent-roles', label: 'Agent roles', count: 'agentRoles', Page: AgentRoles },
  { id: 'installation-steps', label: 'Installation steps', count: 'installationSteps', Page: Workflow },
  { id: 'installation-charges', label: 'Installation charges', count: 'installationCharges', Page: InstallationCharges },
  { id: 'catalog-categories', label: 'Catalog categories', count: 'categories', Page: Categories },
  { id: 'product-units', label: 'Product units', count: 'productUnits', Page: ProductUnits },
];

export default function Masters({ tabIds, pageProps }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const counts = useCounts((s) => s.counts);
  const tabs = tabIds ? TABS.filter((t) => tabIds.includes(t.id)) : TABS;
  const active = tabs.find((t) => t.id === params.get('tab')) || tabs[0];
  const Page = active.Page;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[18rem]">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Masters</h1>
          <p className="mt-1 text-sm text-slate-500">The lists your proposals, catalog and installations are built from.</p>
        </div>
        <div role="tablist" aria-label="Masters" className="ml-auto flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-0.5">
          {tabs.map((t) => {
            const on = t.id === active.id;
            const n = counts?.[t.count];
            return (
              <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => router.replace(`${pathname}?tab=${t.id}`, { scroll: false })} className={cx('flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors', on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                {t.label}
                {n !== undefined && <span className={cx('rounded-full px-1.5 py-px text-[11px] tabular-nums', on ? 'bg-slate-100 text-slate-600' : 'bg-white/70 text-slate-500')}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" className="border-t border-slate-200 pt-6" key={active.id}>
        <Page {...pageProps} />
      </div>
    </>
  );
}
