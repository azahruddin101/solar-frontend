'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Button, FormField, Input, LoadingBlock, PageHeader, showError, toast } from '@/components/kit';
import BranchList from '@/components/org/BranchList';

export default function OrgBranchesPage() {
  const overview = useResource('/api/organization/overview');
  const branches = useResource('/api/organization/branches');
  const [form, setForm] = useState({ name: '', ownerName: '', ownerEmail: '', ownerPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = () => {
    overview.reload();
    branches.reload();
  };

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { name: form.name.trim(), ownerName: form.ownerName.trim(), ownerEmail: form.ownerEmail.trim(), ownerPassword: form.ownerPassword };
      await api('/api/organization/branches', { method: 'POST', body });
      toast.success(`Branch created. ${body.ownerEmail} can now sign in.`);
      setForm({ name: '', ownerName: '', ownerEmail: '', ownerPassword: '' });
      reload();
    } catch (err) {
      setError(err.message);
      showError(err, 'Branch was not created');
    }
    setBusy(false);
  };

  const d = overview.data;
  const canCreate = d?.canCreateBranch !== false && !overview.loading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description={
          overview.loading
            ? 'Loading…'
            : `${d?.branchesUsed ?? 0} of ${d?.maxBranches ?? 1} used · ${d?.branchesRemaining ?? 0} slot${(d?.branchesRemaining ?? 0) === 1 ? '' : 's'} left`
        }
      />

      {branches.loading || overview.loading ? <LoadingBlock /> : (
        <BranchList branches={branches.data || []} onUpdated={reload} />
      )}

      {canCreate ? (
        <form onSubmit={create} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Add a branch</h2>
          {error && <Alert>{error}</Alert>}
          <FormField label="Branch name" hint="City, office or unit name — shown to your team.">
            <Input required maxLength={120} value={form.name} onValue={(name) => setForm((f) => ({ ...f, name }))} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Branch owner name" optional>
              <Input maxLength={120} value={form.ownerName} onValue={(ownerName) => setForm((f) => ({ ...f, ownerName }))} />
            </FormField>
            <FormField label="Branch owner email" hint="Their own sign-in for this branch — different from yours.">
              <Input type="email" required value={form.ownerEmail} onValue={(ownerEmail) => setForm((f) => ({ ...f, ownerEmail }))} />
            </FormField>
            <FormField label="Branch owner password" hint="At least 8 characters, with a letter and a number.">
              <Input type="password" required minLength={8} value={form.ownerPassword} onValue={(ownerPassword) => setForm((f) => ({ ...f, ownerPassword }))} />
            </FormField>
          </div>
          <Button type="submit" variant="primary" loading={busy}>Create branch</Button>
        </form>
      ) : !overview.loading && (
        <Alert tone="info">
          Branch limit reached ({d?.maxBranches ?? 1}). Contact the platform administrator to allow more branches.
        </Alert>
      )}
    </div>
  );
}
