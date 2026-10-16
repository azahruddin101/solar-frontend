'use client';

// Staff roles: named permission sets ("Accountant", "Cashier") the owner defines once and gives to several people.
// A change to a role applies to everyone who has it, on their next action.
import { ArrowLeft, Copy, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { normalizePermissions } from '@/lib/permissions';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, buttonClass, Card, ConfirmDialog, EmptyState, FormField, FormModal, Input, LoadingBlock, PageHeader, RowMenu, Select, Table, Td, Th, Tr, Textarea, toast } from '../kit';
import { AreaPills, PermissionEditor, PermissionSummary } from './PermissionEditor';

function RoleForm({ role, templates, onClose, onSaved }) {
  const editing = Boolean(role?.id);
  const [form, setForm] = useState(() => ({ name: role?.name || '', description: role?.description || '', permissions: role?.permissions || [] }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const applyTemplate = (key) => {
    const t = templates.find((x) => x.key === key);
    if (!t) return;
    setForm((f) => ({ name: f.name || t.name, description: f.description || t.description, permissions: normalizePermissions(t.permissions) }));
  };

  const submit = async () => {
    if (!form.name.trim()) return setError('Give the role a name');
    setBusy(true);
    setError('');
    try {
      const body = { name: form.name.trim(), description: form.description.trim(), permissions: form.permissions };
      const saved = editing ? await api(`/api/roles/${role.id}`, { method: 'PUT', body }) : await api('/api/roles', { method: 'POST', body });
      onSaved(saved);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal
      open
      onClose={onClose}
      size="xl"
      title={editing ? `Edit access role · ${role.name}` : 'New access role'}
      description={editing && role.usedBy ? `${role.usedBy} staff member${role.usedBy > 1 ? 's have' : ' has'} this role — changes apply to them straight away.` : 'Pick what people with this role may do. Masters, staff, roles, integrations and settings always stay with you.'}
      submitLabel={editing ? 'Save role' : 'Create role'}
      busy={busy}
      error={error}
      onSubmit={submit}
      noValidate
    >
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="space-y-4">
          {!editing && templates.length > 0 && (
            <FormField label="Start from a template" optional hint="Fills in the permissions; you can change anything afterwards.">
              <Select defaultValue="" onValue={applyTemplate}>
                <option value="">Blank role</option>
                {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </Select>
            </FormField>
          )}
          <FormField label="Role name"><Input maxLength={60} value={form.name} onValue={(v) => set({ name: v })} placeholder="Accountant" /></FormField>
          <FormField label="Description" optional><Textarea maxLength={200} rows={2} value={form.description} onValue={(v) => set({ description: v })} placeholder="Issues invoices and records payments." /></FormField>
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-slate-700">People with this role can</div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"><PermissionSummary permissions={form.permissions} empty="Nothing yet — pick what they can do on the right." /></div>
          </div>
        </div>
        <FormField label="Permissions">
          <PermissionEditor value={form.permissions} onChange={(permissions) => set({ permissions })} />
        </FormField>
      </div>
    </FormModal>
  );
}

export default function StaffRoles() {
  const roles = useResource('/api/roles');
  const catalog = useResource('/api/roles/catalog');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const templates = catalog.data?.templates || [];

  const close = () => { setModal(null); setModalError(''); };
  const saved = (role) => {
    roles.setData((list) => (list?.some((r) => r.id === role.id) ? list.map((r) => (r.id === role.id ? role : r)) : [...(list || []), role].sort((a, b) => a.name.localeCompare(b.name))));
    toast.success(modal?.role?.id ? 'Role saved' : 'Role created');
    close();
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/roles/${modal.role.id}`, { method: 'DELETE' });
      roles.setData((list) => list.filter((r) => r.id !== modal.role.id));
      toast.success('Role deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <Link href="/dashboard/team" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" /> Staff Management</Link>
      <PageHeader title="Access roles" description="Each access role is a set of things a person can open and do in the app — for example Telecaller or Accountant. Make one, then give it to people under Staff Management.">
        <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>New role</Button>
      </PageHeader>
      {roles.error && <Alert className="mb-6">{roles.error}</Alert>}

      <Card className="overflow-hidden">
        {roles.loading ? <LoadingBlock /> : !roles.data?.length ? (
          <EmptyState icon={ShieldCheck} title="No roles yet" description="Start from a template such as Accountant, Cashier or Sales executive, and adjust it to how your company works.">
            <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Create the first role</Button>
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Role</Th><Th>Access</Th><Th className="text-right">Staff</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {roles.data.map((r) => (
                <Tr key={r.id} className="cursor-pointer" onClick={() => setModal({ type: 'form', role: r })}>
                  <Td>
                    <div className="font-medium text-slate-900">{r.name}</div>
                    {r.description && <div className="max-w-[320px] truncate text-xs text-slate-500">{r.description}</div>}
                  </Td>
                  <Td>
                    <div className="max-w-[380px]"><AreaPills permissions={r.permissions} empty={<span className="text-xs text-slate-400">Opens nothing yet</span>} /></div>
                  </Td>
                  <Td className="text-right tabular-nums"><span className="inline-flex items-center gap-1 text-slate-700"><Users className="h-3.5 w-3.5 text-slate-400" />{r.usedBy}</span></Td>
                  <Td>
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <RowMenu
                        label={`Actions for ${r.name}`}
                        items={[
                          { key: 'edit', icon: Pencil, label: 'Edit role', onClick: () => setModal({ type: 'form', role: r }) },
                          { key: 'copy', icon: Copy, label: 'Duplicate', onClick: () => setModal({ type: 'form', role: { name: `${r.name} (copy)`, description: r.description, permissions: r.permissions } }) },
                          { key: 'delete', icon: Trash2, label: 'Delete role', tone: 'danger', onClick: () => setModal({ type: 'delete', role: r }) },
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
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Masters, staff, roles, lead integrations, plan and company settings are always yours alone — they can’t be given to a role.</p>

      {modal?.type === 'form' && <RoleForm role={modal.role} templates={templates} onClose={close} onSaved={saved} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this role?" confirmLabel="Delete role">
        {modal?.role?.usedBy
          ? <><b className="text-slate-900">{modal.role.usedBy} staff member{modal.role.usedBy > 1 ? 's' : ''}</b> still {modal.role.usedBy > 1 ? 'have' : 'has'} <b className="text-slate-900">{modal.role.name}</b>. Take the role off them under Staff Management first.</>
          : <><b className="text-slate-900">{modal?.role?.name}</b> will be deleted. Nobody has it right now.</>}
      </ConfirmDialog>
      <div className="mt-6"><Link href="/dashboard/team" className={buttonClass({ size: 'sm' })}>Give roles to staff</Link></div>
    </>
  );
}
