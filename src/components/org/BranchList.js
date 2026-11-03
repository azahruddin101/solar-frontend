'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, showError, cx } from '@/components/kit';

export default function BranchList({ branches, className = '' }) {
  const router = useRouter();
  const { switchBranch } = useSession();
  const [busyId, setBusyId] = useState(null);

  const manageBranch = async (branchId) => {
    setBusyId(branchId);
    try {
      await switchBranch(branchId);
      router.push('/dashboard');
    } catch (err) {
      showError(err, 'Could not open branch');
    }
    setBusyId(null);
  };

  return (
    <ul className={cx('space-y-2', className)}>
      {branches.map((b) => (
        <li key={b.id} className="rounded-lg border border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-900">{b.name}</p>
              <p className="text-xs text-slate-500">One device signed in at a time</p>
            </div>
            <Button size="sm" variant="primary" loading={busyId === b.id} onClick={() => manageBranch(b.id)}>
              Manage branch
            </Button>
          </div>
        </li>
      ))}
      {!branches.length && (
        <li className="text-sm text-slate-500">No branches yet.</li>
      )}
    </ul>
  );
}
