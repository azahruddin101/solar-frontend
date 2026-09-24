'use client';

// Super admin: approve or reject companies' plan requests (payment is settled outside the app).
import { Check, ClipboardCheck, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, EmptyState, FormField, FormModal, Input, LoadingBlock, PageHeader, Table, Td, Textarea, Th, Tr, formatDate, toast } from '../kit';

const STATUS = {
  pending: { tone: 'amber', label: 'Pending' },
  approved: { tone: 'green', label: 'Approved' },
  rejected: { tone: 'red', label: 'Rejected' },
  cancelled: { tone: 'slate', label: 'Withdrawn' },
};

function DecisionModal({ row, action, onClose, onDone }) {
  const approving = action === 'approve';
  const custom = row.type === 'custom';
  const [form, setForm] = useState({
    planName: `${row.companyName} Custom`,
    maxClients: row.requestedLimits?.maxClients ?? 25,
    maxDesigns: row.requestedLimits?.maxDesigns ?? 50,
    maxConcurrentLogins: row.requestedLimits?.maxConcurrentLogins ?? 2,
    priceMonthly: '',
    periodDays: 30,
    adminNotes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = approving ? { ...(custom ? form : { periodDays: form.periodDays }), adminNotes: form.adminNotes } : { adminNotes: form.adminNotes };
      onDone(await api(`/api/admin/plan-requests/${row.id}/${action}`, { method: 'POST', body }));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={`${approving ? 'Approve' : 'Reject'} request · ${row.companyName}`} description={approving ? 'Confirm you have settled payment with the company. Approving changes their plan right away.' : 'The company sees your note.'} submitLabel={approving ? 'Approve' : 'Reject'} danger={!approving} busy={busy} error={error} onSubmit={submit} noValidate>
      {approving && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {custom ? 'Custom plan' : <>Standard plan: <b>{row.requestedPlan?.name}</b> (₹{row.requestedPlan?.priceMonthly}/month)</>}
          {row.message && <span className="mt-1 block text-slate-500">“{row.message}”</span>}
        </p>
      )}
      {approving && custom && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Plan name" className="sm:col-span-2"><Input maxLength={80} value={form.planName} onValue={(v) => set({ planName: v })} /></FormField>
          <FormField label="Clients"><Input type="number" min={1} step="1" value={form.maxClients} onValue={(v) => set({ maxClients: v })} /></FormField>
          <FormField label="Designs"><Input type="number" min={1} step="1" value={form.maxDesigns} onValue={(v) => set({ maxDesigns: v })} /></FormField>
          <FormField label="Concurrent sign-ins"><Input type="number" min={1} step="1" value={form.maxConcurrentLogins} onValue={(v) => set({ maxConcurrentLogins: v })} /></FormField>
          <FormField label="Monthly price (₹)" optional hint="Empty = calculated from the pricing rules."><Input type="number" min={0} value={form.priceMonthly} onValue={(v) => set({ priceMonthly: v })} /></FormField>
        </div>
      )}
      {approving && <FormField label="Valid for (days)"><Input type="number" min={1} max={366} step="1" value={form.periodDays} onValue={(v) => set({ periodDays: v })} /></FormField>}
      <FormField label="Note to the company" optional><Textarea rows={2} maxLength={2000} value={form.adminNotes} onValue={(v) => set({ adminNotes: v })} placeholder={approving ? 'e.g. Payment received by bank transfer' : 'Why it was not approved'} /></FormField>
    </FormModal>
  );
}

export default function AdminPlanRequests() {
  const { data, setData, loading, error } = useResource('/api/admin/plan-requests');
  const [modal, setModal] = useState(null); // { row, action }

  const decided = (updated) => {
    setData((list) => list.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
    toast.success(updated.status === 'approved' ? 'Plan approved and applied' : 'Request rejected');
    setModal(null);
  };

  return (
    <>
      <PageHeader title="Plan requests" description="Companies ask for a plan change; you settle payment with them and approve here." />
      {error && <Alert className="mb-6">{error}</Alert>}
      <Card className="overflow-hidden">
        {loading && !data ? <LoadingBlock /> : !data?.length ? (
          <EmptyState icon={ClipboardCheck} title="No plan requests" description="When a company asks for a different plan, it appears here." />
        ) : (
          <Table>
            <thead><tr><Th>Company</Th><Th>Request</Th><Th>Status</Th><Th>Date</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {data.map((r) => {
                const s = STATUS[r.status] || STATUS.pending;
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium text-slate-900">{r.companyName}</Td>
                    <Td className="text-[13px]">
                      {r.type === 'preset' ? <>Standard: <b>{r.requestedPlan?.name || '—'}</b></> : <>Custom: {r.requestedLimits?.maxClients} clients · {r.requestedLimits?.maxDesigns} designs · {r.requestedLimits?.maxConcurrentLogins} sign-ins</>}
                      {r.message && <div className="max-w-xs truncate text-xs text-slate-500" title={r.message}>“{r.message}”</div>}
                    </Td>
                    <Td><Badge dot tone={s.tone}>{s.label}</Badge></Td>
                    <Td className="whitespace-nowrap text-slate-500">{formatDate(r.createdAt)}</Td>
                    <Td>
                      {r.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="primary" icon={Check} onClick={() => setModal({ row: r, action: 'approve' })}>Approve</Button>
                          <Button size="sm" icon={X} onClick={() => setModal({ row: r, action: 'reject' })}>Reject</Button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {modal && <DecisionModal row={modal.row} action={modal.action} onClose={() => setModal(null)} onDone={decided} />}
    </>
  );
}
