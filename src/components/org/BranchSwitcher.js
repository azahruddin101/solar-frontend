'use client';

import { GitBranch, Loader2 } from 'lucide-react';
import { useResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import { FormField, Select, cx } from '@/components/kit';

/** Org admin: pick all branches (company-wide) or one branch (branch overview on /org). */
export default function BranchSwitcher({ branches: branchesProp, loading: loadingProp, hideLabel = false, className = '' }) {
  const organizationId = useSession((s) => s.organization?.id);
  const { orgDashboardScope, setOrgDashboardScope } = useSession();
  const useOwnFetch = branchesProp == null;
  const branchesRes = useResource(useOwnFetch ? '/api/organization/branches' : null, {
    cacheKey: organizationId ? `org-${organizationId}-branches` : 'org-branches',
  });
  const loading = loadingProp ?? (useOwnFetch && branchesRes.loading);
  const list = branchesProp ?? branchesRes.data ?? [];

  if (loading && !list.length) {
    return (
      <FormField label={hideLabel ? undefined : 'View'} className={cx('mb-0 w-full min-w-[14rem] sm:w-64', className)}>
        <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" aria-hidden />
          Loading branches…
        </div>
      </FormField>
    );
  }

  if (!list.length) return null;

  const selectValue = orgDashboardScope === 'all' ? 'all' : orgDashboardScope;

  const onChange = (value) => {
    if (!value) return;
    if (value === 'all') {
      if (orgDashboardScope === 'all') return;
      setOrgDashboardScope('all');
      return;
    }
    if (value === orgDashboardScope) return;
    setOrgDashboardScope(value);
  };

  return (
    <FormField label={hideLabel ? undefined : 'View'} className={cx('mb-0 w-full min-w-[14rem] sm:w-64', className)}>
      <div className="relative">
        <GitBranch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Select
          aria-label="Company view"
          className="h-10 pl-9"
          value={selectValue}
          onValue={onChange}
        >
          <option value="all">All branches — combined</option>
          {list.map((b) => (
            <option key={b.id} value={b.id} disabled={b.status !== 'active'}>
              {b.name}{b.status !== 'active' ? ' (suspended)' : ''}
            </option>
          ))}
        </Select>
      </div>
    </FormField>
  );
}
