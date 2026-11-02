'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, FormField, Input, showError, toast, cx } from '@/components/kit';

function CapEditor({ branch, onDone, onCancel }) {
  const [limits, setLimits] = useState({
    maxConcurrentLogins: branch.limits?.maxConcurrentLogins ?? '',
  });
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/organization/branches/${branch.id}`, {
        method: 'PATCH',
        body: {
          limits: {
            maxConcurrentLogins: Number(limits.maxConcurrentLogins) || undefined,
          },
        },
      });
      toast.success('Limits updated');
      onDone();
    } catch (err) {
      showError(err, 'Limits were not saved');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
      <FormField label="Concurrent logins"><Input type="number" min={1} value={limits.maxConcurrentLogins} onValue={(v) => setLimits((l) => ({ ...l, maxConcurrentLogins: v }))} /></FormField>
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" size="sm" variant="primary" loading={busy}>Save</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export default function BranchList({ branches, onUpdated, className = '' }) {
  const router = useRouter();
  const { switchBranch } = useSession();
  const [editingId, setEditingId] = useState(null);
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
              <p className="text-xs text-slate-500">
                {b.limits?.maxConcurrentLogins ?? '—'} devices signed in at once
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditingId(editingId === b.id ? null : b.id)}>
                {editingId === b.id ? 'Close limits' : 'Limits'}
              </Button>
              <Button size="sm" variant="primary" loading={busyId === b.id} onClick={() => manageBranch(b.id)}>
                Manage branch
              </Button>
            </div>
          </div>
          {editingId === b.id && (
            <CapEditor branch={b} onCancel={() => setEditingId(null)} onDone={() => { setEditingId(null); onUpdated?.(); }} />
          )}
        </li>
      ))}
      {!branches.length && (
        <li className="text-sm text-slate-500">No branches yet.</li>
      )}
    </ul>
  );
}
