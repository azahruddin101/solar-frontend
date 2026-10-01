'use client';

import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { planSchema, useValidation } from '@/lib/validation';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, FormField, FormModal, IconButton, Input, NameInput, LoadingBlock, PageHeader, CardHeader, Select, Table, Td, Textarea, Th, Toggle, Tr, toast, RowMenu } from '../kit';

const BLANK = { code: '', name: '', description: '', kind: 'fixed', priceMonthly: 30, maxClients: 25, maxDesigns: 50, maxConcurrentLogins: 2, features: [], selfServe: true, active: true, sortOrder: 0 };

const MAX_FEATURES = 20;

/** The plan's feature lines: type one, press Enter (or "Add feature") for the next. */
function FeaturesEditor({ value, onChange, error }) {
  const list = value || [];
  const setAt = (i, text) => onChange(list.map((f, j) => (j === i ? text : f)));
  const add = () => list.length < MAX_FEATURES && onChange([...list, '']);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-slate-700">Features <span className="text-xs font-normal text-slate-400">Optional · shown to companies on the plan</span></div>
      <div className="space-y-2">
        {list.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label={`Feature ${i + 1}`} maxLength={100} value={f} placeholder="e.g. PDF proposals with your branding" autoFocus={i === list.length - 1 && !f}
              onValue={(x) => setAt(i, x)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (f.trim()) add(); } }} />
            <IconButton icon={X} label={`Remove feature ${i + 1}`} onClick={() => onChange(list.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button type="button" size="sm" icon={Plus} disabled={list.length >= MAX_FEATURES} onClick={add}>Add feature</Button>
        <span className="text-xs text-slate-400">{list.filter((f) => f.trim()).length} / {MAX_FEATURES}</span>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PlanForm({ plan, onClose, onSaved }) {
  const editing = Boolean(plan?.id);
  const [form, setForm] = useState(() => ({ ...BLANK, ...plan })); // a new plan may come with its type preset
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isCustom = form.kind === 'custom';

  const v = useValidation(planSchema, form);
  const codeError = !editing && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(form.code || '') ? 'Use 2–40 lowercase letters, digits or dashes' : undefined;
  const submit = async () => {
    const checked = v.validate();
    if (!checked || codeError) { setTried(true); return; }
    setBusy(true);
    setError('');
    try {
      const body = { ...checked, priceMonthly: Number(checked.priceMonthly) || 0, maxClients: Number(checked.maxClients), maxDesigns: Number(checked.maxDesigns), maxConcurrentLogins: Number(checked.maxConcurrentLogins), features: (checked.features || []).map((f) => f.trim()).filter(Boolean), sortOrder: Number(form.sortOrder) || 0 };
      const saved = editing ? await api(`/api/admin/plans/${plan.id}`, { method: 'PATCH', body }) : await api('/api/admin/plans', { method: 'POST', body });
      onSaved(saved);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={editing ? `Edit ${plan.name}` : isCustom ? 'Add custom plan' : 'Add fixed plan'} description="Fixed plans can be chosen by companies; custom plans are assigned by you with per-company limits." submitLabel={editing ? 'Save' : 'Create plan'} busy={busy} error={error} onSubmit={submit} noValidate>
      {!editing && <FormField label="Code" hint="Short id, e.g. basic or pro. Cannot be changed later." error={tried ? codeError : undefined}><Input maxLength={40} value={form.code} onValue={(x) => set({ code: x.toLowerCase().replace(/\s+/g, '-') })} placeholder="basic" /></FormField>}
      <FormField label="Name" error={v.error('name')}><NameInput kind="business" maxLength={80} value={form.name} onValue={(x) => set({ name: x })} /></FormField>
      <FormField label="Description" optional error={v.error('description')}><Textarea rows={2} maxLength={300} value={form.description} onValue={(x) => set({ description: x })} /></FormField>
      <FeaturesEditor value={form.features} onChange={(features) => set({ features })} error={v.error('features')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Type"><Select value={form.kind} onValue={(v) => set({ kind: v, selfServe: v !== 'custom' })}><option value="fixed">Fixed (self-serve)</option><option value="custom">Custom (admin-assigned)</option></Select></FormField>
        <FormField label="Monthly price (₹)" hint={isCustom ? 'Custom plans are quoted separately.' : undefined} error={v.error('priceMonthly')}><Input type="number" min={0} disabled={isCustom} value={form.priceMonthly} onValue={(x) => set({ priceMonthly: x })} /></FormField>
        <FormField label="Max clients" hint="At least 1" error={v.error('maxClients')}><Input type="number" min={1} step="1" value={form.maxClients} onValue={(x) => set({ maxClients: x })} /></FormField>
        <FormField label="Max proposals" hint="At least 1" error={v.error('maxDesigns')}><Input type="number" min={1} step="1" value={form.maxDesigns} onValue={(x) => set({ maxDesigns: x })} /></FormField>
        <FormField label="Concurrent sign-ins" hint="Company owner devices signed in at once" error={v.error('maxConcurrentLogins')}><Input type="number" min={1} step="1" value={form.maxConcurrentLogins} onValue={(x) => set({ maxConcurrentLogins: x })} /></FormField>
        <FormField label="Sort order"><Input type="number" value={form.sortOrder} onValue={(v) => set({ sortOrder: v })} /></FormField>
      </div>
      {!isCustom && <Toggle checked={form.selfServe} onChange={(v) => set({ selfServe: v })} label="Self-serve" description="Companies can upgrade to this plan themselves." />}
      <Toggle checked={form.active} onChange={(v) => set({ active: v })} label="Active" description="Inactive plans are hidden from companies." />
    </FormModal>
  );
}

const BUILT_IN = ['basic', 'pro', 'custom']; // cannot be deleted

/** One group of plans (fixed or custom) as its own card and table. */
function PlanTable({ title, description, kind, plans, empty, onAdd, onEdit, onDelete }) {
  const custom = kind === 'custom';
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={<span className="flex items-center gap-2">{title}<Badge tone={custom ? 'violet' : 'blue'}>{plans.length}</Badge></span>}
        description={description}
        action={<Button size="sm" icon={Plus} onClick={onAdd}>{custom ? 'Add custom plan' : 'Add fixed plan'}</Button>}
      />
      {!plans.length ? <p className="px-6 py-8 text-center text-sm text-slate-500">{empty}</p> : (
        <Table>
          <thead>
            <tr>
              <Th>Plan</Th>
              {!custom && <Th>Price</Th>}
              <Th>{custom ? 'Default limits' : 'Limits'}</Th>
              {!custom && <Th>Self-serve</Th>}
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <Tr key={p.id}>
                <Td><div className="max-w-[260px] truncate font-medium text-slate-900" title={p.name}>{p.name}</div><div className="text-xs text-slate-500">{p.code}</div></Td>
                {!custom && <Td className="whitespace-nowrap tabular-nums">₹{p.priceMonthly}/mo</Td>}
                <Td className="text-[13px] text-slate-600">{p.maxClients} clients · {p.maxDesigns} proposals · {p.maxConcurrentLogins} devices{p.features?.length ? ` · ${p.features.length} feature${p.features.length === 1 ? '' : 's'}` : ''}</Td>
                {!custom && <Td>{p.selfServe ? <Badge tone="green">Yes</Badge> : <Badge tone="slate">Admin only</Badge>}</Td>}
                <Td>{p.active ? <Badge dot tone="green">Active</Badge> : <Badge dot tone="slate">Off</Badge>}</Td>
                <Td>
                  <div className="flex justify-end">
                    <RowMenu
                      label={`Actions for ${p.name}`}
                      items={[
                        { key: 'edit', icon: Pencil, label: 'Edit plan', onClick: () => onEdit(p) },
                        { key: 'delete', icon: Trash2, label: 'Delete plan', tone: 'danger', disabled: BUILT_IN.includes(p.code), onClick: () => onDelete(p) },
                      ]}
                    />
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

export default function AdminPlans() {
  const { data, setData, loading, error, reload } = useResource('/api/admin/plans');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/plans/${modal.plan.id}`, { method: 'DELETE' });
      setData((list) => list.filter((p) => p.id !== modal.plan.id));
      toast.success('Plan deleted');
      setModal(null);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  const bySort = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
  const groups = {
    fixed: (data || []).filter((p) => p.kind !== 'custom').sort(bySort),
    custom: (data || []).filter((p) => p.kind === 'custom').sort(bySort),
  };

  return (
    <>
      <PageHeader title="Plans" description="Subscription tiers: two fixed plans companies can upgrade between, plus custom limits you assign per company (like Hotstar)." />
      {error && <Alert className="mb-6">{error}</Alert>}
      {loading ? <Card><LoadingBlock /></Card> : !data?.length ? (
        <Card><EmptyState title="No plans" description="Default plans are created when the API starts. Refresh or add a plan."><Button onClick={() => reload()}>Refresh</Button></EmptyState></Card>
      ) : (
        <div className="space-y-6">
          <PlanTable
            title="Fixed plans"
            description="Priced tiers. Companies can move between the self-serve ones on their own."
            kind="fixed"
            plans={groups.fixed}
            empty="No fixed plans yet."
            onAdd={() => setModal({ type: 'form', plan: { kind: 'fixed', selfServe: true } })}
            onEdit={(p) => setModal({ type: 'form', plan: p })}
            onDelete={(p) => setModal({ type: 'delete', plan: p })}
          />
          <PlanTable
            title="Custom plans"
            description="Quoted separately and assigned by you, with limits set per company."
            kind="custom"
            plans={groups.custom}
            empty="No custom plans yet."
            onAdd={() => setModal({ type: 'form', plan: { kind: 'custom', selfServe: false } })}
            onEdit={(p) => setModal({ type: 'form', plan: p })}
            onDelete={(p) => setModal({ type: 'delete', plan: p })}
          />
        </div>
      )}
      {modal?.type === 'form' && <PlanForm plan={modal.plan} onClose={() => setModal(null)} onSaved={(p) => { const editing = Boolean(modal.plan?.id); setData((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p])); toast.success(editing ? 'Plan updated' : 'Plan created'); setModal(null); }} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={() => setModal(null)} onConfirm={remove} busy={busy} title="Delete this plan?" confirmLabel="Delete">Only unused plans can be removed. Built-in basic, pro and custom cannot be deleted.</ConfirmDialog>
    </>
  );
}
