'use client';

import { useRouter } from 'next/navigation';
import { GitBranch } from 'lucide-react';
import { useState } from 'react';
import { useResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import { FormField, Select, showError } from '@/components/kit';

/** Org admin: pick all branches (company-wide) or one branch (branch overview on /org). */
export default function BranchSwitcher({ branches: branchesProp, loading: loadingProp }) {
  const router = useRouter();
  const { company, switchBranch, orgDashboardScope, setOrgDashboardScope } = useSession();
  const branchesRes = useResource(branchesProp != null ? null : '/api/organization/branches');
  const [busy, setBusy] = useState(false);
  const loading = loadingProp ?? branchesRes.loading;
  const list = branchesProp ?? branchesRes.data ?? [];

  if (loading) {
    return (
      <FormField label="View" className="mb-0 w-full min-w-[14rem] sm:w-64">
        <Select aria-label="Company view" className="h-10" disabled value="">
          <option value="">Loading…</option>
        </Select>
      </FormField>
    );
  }

  if (!list.length) return null;

  const selectValue = orgDashboardScope === 'all' ? 'all' : company?.id || list[0]?.id || 'all';

  const onChange = async (value) => {
    if (!value || busy) return;
    if (value === 'all') {
      if (orgDashboardScope === 'all') return;
      setOrgDashboardScope('all');
      router.refresh();
      return;
    }
    if (value === company?.id && orgDashboardScope === value) return;
    setBusy(true);
    try {
      if (company?.id !== value) await switchBranch(value);
      setOrgDashboardScope(value);
      router.refresh();
    } catch (err) {
      showError(err, 'Could not switch branch');
    }
    setBusy(false);
  };

  return (
    <FormField label="View" className="mb-0 w-full min-w-[14rem] sm:w-64">
      <div className="relative">
        <GitBranch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Select
          aria-label="Company view"
          className="h-10 pl-9"
          disabled={busy}
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
