'use client';

// Manage Masters: the setup lists behind proposals, the catalog and installations, on one page.
// A dropdown at the top right picks the list; the choice lives in the URL (?tab=…), so it can be linked to and survives a reload.
import { Check, ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useCounts } from '@/lib/counts';
import { cx } from '../kit';
import AgentRoles from './AgentRoles';
import Categories from './Categories';
import InstallationCharges from './InstallationCharges';
import LeadFormBuilder from './LeadFormBuilder';
import LeadStatuses from './LeadStatuses';
import ProductUnits from './ProductUnits';
import Workflow from './Workflow';
import AmcTemplates from './AmcTemplates';
import LoanSteps from './LoanSteps';
import SubsidySteps from './SubsidySteps';
import { useBreadcrumbTail } from '@/lib/breadcrumbs';

const TABS = [
  { id: 'agent-roles', label: 'Job titles', count: 'agentRoles', Page: AgentRoles },
  { id: 'installation-steps', label: 'Installation steps', count: 'installationSteps', Page: Workflow },
  { id: 'amc-schedule', label: 'AMC schedule', count: 'amcTemplates', Page: AmcTemplates },
  { id: 'loan-steps', label: 'Loan steps', count: 'loanSteps', Page: LoanSteps },
  { id: 'subsidy-steps', label: 'Subsidy steps', count: 'subsidySteps', Page: SubsidySteps },
  { id: 'installation-charges', label: 'Installation charges', count: 'installationCharges', Page: InstallationCharges },
  { id: 'catalog-categories', label: 'Catalog categories', count: 'categories', Page: Categories },
  { id: 'product-units', label: 'Product units', count: 'productUnits', Page: ProductUnits },
  { id: 'lead-form', label: 'Lead form', Page: LeadFormBuilder },
  { id: 'lead-statuses', label: 'Lead statuses', Page: LeadStatuses },
];

const Count = ({ n, on }) => (n === undefined ? null : <span className={cx('rounded-full px-1.5 py-px text-[11px] tabular-nums', on ? 'bg-brand-soft text-brand-ink' : 'bg-slate-100 text-slate-500')}>{n}</span>);

/** The masters as a dropdown: the button shows the open one, the menu lists them all with their counts. */
function MasterPicker({ tabs, active, counts, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative ml-auto">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((x) => !x)} className="flex h-10 min-w-56 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-300 ring-inset hover:bg-slate-50">
        <span className="flex-1 text-left">{active.label}</span>
        <Count n={counts?.[active.count]} />
        <ChevronDown className={cx('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Masters" className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {tabs.map((t) => {
            const on = t.id === active.id;
            return (
              <li key={t.id} role="option" aria-selected={on}>
                <button type="button" onClick={() => { setOpen(false); onPick(t.id); }} className={cx('flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm', on ? 'bg-brand-soft/50 font-medium text-brand-ink' : 'text-slate-700 hover:bg-slate-50')}>
                  <Check className={cx('h-4 w-4 shrink-0', on ? 'text-brand' : 'invisible')} />
                  <span className="flex-1">{t.label}</span>
                  <Count n={counts?.[t.count]} on={on} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Masters({ tabIds, pageProps }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const counts = useCounts((s) => s.counts);
  const tabs = tabIds ? TABS.filter((t) => tabIds.includes(t.id)) : TABS;
  const active = tabs.find((t) => t.id === params.get('tab')) || tabs[0];
  const Page = active.Page;
  useBreadcrumbTail(active.label);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[18rem]">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manage Masters</h1>
          <p className="mt-1 text-sm text-slate-500">The lists your proposals, catalog and installations are built from.</p>
        </div>
        <MasterPicker tabs={tabs} active={active} counts={counts} onPick={(id) => router.replace(`${pathname}?tab=${id}`, { scroll: false })} />
      </div>
      <div role="tabpanel" className="border-t border-slate-200 pt-6" key={active.id}>
        <Page {...pageProps} />
      </div>
    </>
  );
}
