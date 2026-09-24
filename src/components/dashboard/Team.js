'use client';

// Agents: the company's field staff. They sign in and work on the installation steps assigned to them.
import { CheckCircle2, ClipboardList, Eye, KeyRound, Mail, Pencil, Phone, Plus, Trash2, UserCog } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { agentRolesFor, agentRolesOf } from '@/lib/agents';
import { api, assetUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { agentCreateSchema, agentUpdateSchema, useValidation } from '@/lib/validation';
import { Alert, Avatar, Badge, Button, buttonClass, Card, ConfirmDialog, cx, EmptyState, FormField, FormModal, IconButton, ImageSourceButtons, Input, NameInput, PhoneInput, LoadingBlock, Modal, PageHeader, PasswordInput, StatCard, Table, Td, Th, Toggle, Tr, timeAgo, toast } from '../kit';

const BLANK = { name: '', email: '', phone: '', roles: [], password: '', active: true };

function AgentForm({ agent, onClose, onSaved }) {
  const { company } = useSession();
  const roleOptions = agentRolesFor(company);
  const editing = Boolean(agent?.id);
  const [form, setForm] = useState(() => ({
    ...BLANK,
    ...agent,
    roles: agentRolesOf(agent),
    password: '',
  }));
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(() => (agent?.photo ? assetUrl(agent.photo) : ''));
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const v = useValidation(editing ? agentUpdateSchema : agentCreateSchema, form);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleRole = (role) => setForm((f) => ({
    ...f,
    roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
  }));

  useEffect(() => () => { if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const pickPhoto = (file) => {
    if (!file) return;
    setPhotoFile(file);
    setRemovePhoto(false);
    setPhotoPreview((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const submit = async () => {
    const checked = v.validate();
    if (!checked) return;
    setBusy(true);
    setError('');
    try {
      const body = { ...checked };
      delete body.photo;
      delete body.jobTitle;
      delete body.openSteps;
      let saved = editing ? await api(`/api/agents/${agent.id}`, { method: 'PUT', body }) : await api('/api/agents', { method: 'POST', body });
      const id = saved.id || agent.id;
      if (removePhoto && editing) {
        saved = await api(`/api/agents/${id}/photo`, { method: 'DELETE' });
      } else if (photoFile) {
        const fd = new FormData();
        fd.append('file', photoFile);
        saved = await api(`/api/agents/${id}/photo`, { method: 'POST', form: fd });
      }
      onSaved({ openSteps: agent?.openSteps || saved.openSteps || 0, ...saved });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={editing ? 'Edit agent' : 'Add an agent'} description="Agents sign in with this email and see only the installation steps assigned to them." submitLabel={editing ? 'Save changes' : 'Add agent'} busy={busy} error={error} onSubmit={submit} noValidate>
      <FormField label="Photo" optional hint="Shown in the team list and on assigned installation steps. PNG, JPG or WebP, up to 2 MB.">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={form.name || 'Agent'} src={photoPreview && !removePhoto ? photoPreview : undefined} size={56} />
          <div className="flex flex-wrap gap-2">
            <ImageSourceButtons onFiles={pickPhoto} />
            {(photoPreview && !removePhoto) && (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setPhotoFile(null); setRemovePhoto(true); setPhotoPreview(''); }}>Remove</Button>
            )}
          </div>
        </div>
      </FormField>
      <FormField label="Full name" error={v.error('name')}><NameInput maxLength={120} value={form.name} onValue={(x) => set({ name: x })} placeholder="Imran Shaikh" /></FormField>
      <FormField label="Roles" optional hint="Pick every role this person performs. Manage the list under Agent roles.">
        {roleOptions.length ? (
          <div className="flex flex-wrap gap-2">
            {roleOptions.map((role) => {
              const on = form.roles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                  )}
                >
                  {role}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No roles defined yet.{' '}
            <Link href="/dashboard/agent-roles" className="font-medium text-slate-900 underline">Add roles</Link>
          </p>
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Sign-in email" error={v.error('email')}><Input type="email" value={form.email} onValue={(x) => set({ email: x })} autoComplete="off" /></FormField>
        <FormField label="Phone" optional error={v.error('phone')}><PhoneInput maxLength={20} value={form.phone} onValue={(x) => set({ phone: x })} /></FormField>
      </div>
      <FormField label={editing ? 'New password' : 'Password'} optional={editing} hint={editing ? 'Leave empty to keep the current password.' : 'At least 8 characters with a letter and a number. Share it with the agent; they can change it after signing in.'} error={v.error('password')}>
        <PasswordInput defaultVisible maxLength={200} value={form.password} onValue={(x) => set({ password: x })} autoComplete="new-password" />
      </FormField>
      {editing && <Toggle checked={form.active} onChange={(v) => set({ active: v })} label="Active" description="An inactive agent cannot sign in. Their steps and history stay as they are." />}
    </FormModal>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="text-xl font-semibold text-slate-900 tabular-nums">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

/** Everything about one agent: contact, roles, current workload and recent completions. */
function AgentDetails({ agent: a, onClose, onEdit }) {
  const st = a.stats || {};
  return (
    <Modal open onClose={onClose} title="Agent details" footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button icon={Pencil} onClick={onEdit}>Edit</Button></>}>
      <div className="flex items-center gap-4">
        <Avatar name={a.name} src={a.photo ? assetUrl(a.photo) : undefined} size={56} zoom />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-slate-900">{a.name}</div>
          <div className="mt-1">{a.active ? <Badge dot tone="green">Active</Badge> : <Badge dot tone="slate">Inactive</Badge>}</div>
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-slate-700"><Mail className="h-4 w-4 text-slate-400" /> {a.email}</div>
        {a.phone && <div className="flex items-center gap-2 text-slate-700"><Phone className="h-4 w-4 text-slate-400" /> {a.phone}</div>}
        <div className="text-[13px] text-slate-500">Last sign-in: {timeAgo(a.lastLoginAt)}</div>
      </dl>

      {agentRolesOf(a).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">{agentRolesOf(a).map((r) => <Badge key={r} tone="slate">{r}</Badge>)}</div>
      )}

      <h3 className="mt-6 mb-2 text-[13px] font-semibold tracking-wide text-slate-500 uppercase">Current tasks</h3>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Open" value={st.open ?? 0} />
        <Tile label="In progress" value={st.inProgress ?? 0} />
        <Tile label="Pending" value={st.pending ?? 0} />
      </div>

      <h3 className="mt-5 mb-2 text-[13px] font-semibold tracking-wide text-slate-500 uppercase">Finished</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Last 7 days" value={st.done7 ?? 0} />
        <Tile label="Last 30 days" value={st.done30 ?? 0} />
        <Tile label="Last 90 days" value={st.done90 ?? 0} />
        <Tile label="All time" value={st.doneTotal ?? 0} />
      </div>
    </Modal>
  );
}

export default function Team() {
  const { data, setData, loading, error } = useResource('/api/agents');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const close = () => { setModal(null); setModalError(''); };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/agents/${modal.agent.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.agent.id));
      toast.success('Agent deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Team" description="The people who carry out your installations. Each agent has their own sign-in.">
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/agent-roles" className={buttonClass()}>Agent roles</Link>
          <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Add agent</Button>
        </div>
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}

      {data?.length > 0 && (() => {
        const sum = (k) => data.reduce((n, a) => n + (a.stats?.[k] || 0), 0);
        return (
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Open tasks" value={sum('open')} icon={ClipboardList} hint={`${sum('inProgress')} in progress · ${sum('pending')} pending`} />
            <StatCard label="Done · last 7 days" value={sum('done7')} icon={CheckCircle2} />
            <StatCard label="Done · last 30 days" value={sum('done30')} icon={CheckCircle2} />
            <StatCard label="Done · last 90 days" value={sum('done90')} icon={CheckCircle2} />
          </div>
        );
      })()}

      <Card className="overflow-hidden">
        {loading ? <LoadingBlock /> : !data?.length ? (
          <EmptyState icon={UserCog} title="No agents yet" description="Add your surveyors, installers and electricians, then assign installation steps to them.">
            <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Add agent</Button>
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Agent</Th><Th>Status</Th><Th className="text-right">Current tasks</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {data.map((a) => (
                <Tr key={a.id} className="cursor-pointer" onClick={() => setModal({ type: 'details', agent: a })}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={a.name} src={a.photo ? assetUrl(a.photo) : undefined} />
                      <div className="min-w-0">
                        <div className="max-w-[240px] truncate font-medium text-slate-900">{a.name}</div>
                        {agentRolesOf(a).length > 0 && <div className="max-w-[240px] truncate text-xs text-slate-500">{agentRolesOf(a).join(' · ')}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td>{a.active ? <Badge dot tone="green">Active</Badge> : <Badge dot tone="slate">Inactive</Badge>}</Td>
                  <Td className="text-right font-medium text-slate-900 tabular-nums">{a.stats?.open ?? 0}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <IconButton icon={Eye} label="View details" onClick={() => setModal({ type: 'details', agent: a })} />
                      <IconButton icon={Pencil} label="Edit" onClick={() => setModal({ type: 'form', agent: a })} />
                      <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setModal({ type: 'delete', agent: a })} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><KeyRound className="h-3.5 w-3.5" /> Agents sign in on the same sign-in page as you. To reset a password, edit the agent and set a new one.</p>

      {modal?.type === 'details' && <AgentDetails agent={data?.find((x) => x.id === modal.agent.id) || modal.agent} onClose={close} onEdit={() => setModal({ type: 'form', agent: modal.agent })} />}
      {modal?.type === 'form' && (
        <AgentForm
          agent={modal.agent}
          onClose={close}
          onSaved={(a) => {
            setData((list) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list]));
            toast.success(modal.agent ? 'Agent updated' : 'Agent added');
            close();
          }}
        />
      )}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this agent?" confirmLabel="Delete agent">
        <b className="text-slate-900">{modal?.agent?.name}</b> will no longer be able to sign in{modal?.agent?.openSteps ? <>, and their <b className="text-slate-900">{modal.agent.openSteps} open step{modal.agent.openSteps > 1 ? 's' : ''}</b> will become unassigned</> : ''}. Activity logs keep their name. To pause access instead, mark them inactive.
      </ConfirmDialog>
    </>
  );
}
