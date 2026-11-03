'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Button, FormField, FormModal, Input, LoadingBlock, PageHeader, PasswordInput, showError, toast } from '@/components/kit';
import BranchList from '@/components/org/BranchList';

function AddBranchModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', ownerName: '', ownerEmail: '', ownerPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (busy) return;
    onClose();
    setForm({ name: '', ownerName: '', ownerEmail: '', ownerPassword: '' });
    setError('');
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        name: form.name.trim(),
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        ownerPassword: form.ownerPassword,
      };
      await api('/api/organization/branches', { method: 'POST', body });
      toast.success(`Branch created. ${body.ownerEmail} can now sign in.`);
      setForm({ name: '', ownerName: '', ownerEmail: '', ownerPassword: '' });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
      showError(err, 'Branch was not created');
    }
    setBusy(false);
  };

  return (
    <FormModal
      open={open}
      onClose={close}
      title="Add a branch"
      description="Creates a branch location and a separate sign-in for its owner."
      submitLabel="Create branch"
      busy={busy}
      error={error}
      onSubmit={create}
    >
      <FormField label="Branch name" hint="City, office or unit name — shown to your team.">
        <Input required maxLength={120} value={form.name} onValue={(name) => setForm((f) => ({ ...f, name }))} />
      </FormField>
      <FormField label="Branch owner name" optional>
        <Input maxLength={120} value={form.ownerName} onValue={(ownerName) => setForm((f) => ({ ...f, ownerName }))} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Branch owner email" hint="Their own sign-in for this branch — different from yours.">
          <Input type="email" required value={form.ownerEmail} onValue={(ownerEmail) => setForm((f) => ({ ...f, ownerEmail }))} />
        </FormField>
        <FormField label="Branch owner password" hint="At least 8 characters, with a letter and a number.">
          <PasswordInput required minLength={8} defaultVisible value={form.ownerPassword} onValue={(ownerPassword) => setForm((f) => ({ ...f, ownerPassword }))} autoComplete="new-password" />
        </FormField>
      </div>
    </FormModal>
  );
}

export default function OrgBranchesPage() {
  const overview = useResource('/api/organization/overview');
  const branches = useResource('/api/organization/branches');
  const [addOpen, setAddOpen] = useState(false);

  const reload = () => {
    overview.reload();
    branches.reload();
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
      >
        {canCreate && (
          <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
            Add branch
          </Button>
        )}
      </PageHeader>

      {branches.loading || overview.loading ? <LoadingBlock /> : (
        <BranchList branches={branches.data || []} />
      )}

      <AddBranchModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={reload} />

      {!canCreate && !overview.loading && (
        <Alert tone="info">
          Branch limit reached ({d?.maxBranches ?? 1}). Contact the platform administrator to allow more branches.
        </Alert>
      )}
    </div>
  );
}
