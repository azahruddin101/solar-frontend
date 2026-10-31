'use client';

// Adding or editing a staff member, on its own page, in the usual CRM settings layout (as in Zoho, HubSpot,
// Pipedrive): one card of sections, each with its title and a line of help on the left and the fields on the right.
// Access is given by picking access roles (named permission sets managed on their own page); per-person extras are
// tucked behind "Additional permissions". Saving or cancelling returns to Staff Management.
import { ChevronDown, ChevronRight, HardHat, KeyRound, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { agentRolesFor, agentRolesOf } from '@/lib/agents';
import { api, assetUrl } from '@/lib/api';
import { normalizePermissions } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { agentCreateSchema, agentUpdateSchema, useValidation } from '@/lib/validation';
import { Alert, Avatar, Button, FormField, ImageSourceButtons, Input, LoadingBlock, Modal, NameInput, PasswordInput, PhoneInput, Toggle, capName, cx, toast } from '../kit';
import { areasOf, PermissionEditor, PermissionSummary } from './PermissionEditor';
import { useBreadcrumb } from '@/lib/breadcrumbs';

const TEAM_PATH = '/dashboard/team';

const BLANK = { name: '', email: '', phone: '', roles: [], staffRoles: [], permissions: [], password: '', active: true };

/** Everything a person can do: the permissions of the roles picked plus the extra grants. */
const effectiveOf = (roleIds, extra, roles) => normalizePermissions([...extra, ...roles.filter((r) => roleIds.includes(r.id)).flatMap((r) => r.permissions)]);

/** A job title (field work) and an access role, as small chips — used on the Team page too. */
export const JobChip = ({ children }) => <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ring-inset"><HardHat className="h-3 w-3" />{children}</span>;
export const AccessChip = ({ children, extra }) => <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', extra ? 'bg-white text-slate-600 ring-slate-300' : 'bg-violet-50 text-violet-800 ring-violet-200')}><KeyRound className="h-3 w-3" />{children}</span>;

/** One row of the settings card: title and help on the left, the fields on the right. */
function Row({ title, help, children, last }) {
  return (
    <div className={cx('grid gap-x-10 gap-y-3 px-6 py-6 lg:grid-cols-[20rem_minmax(0,1fr)]', !last && 'border-b border-slate-200')}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {help && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{help}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A checkbox row in a bordered list (job titles, access roles). */
function CheckRow({ checked, onChange, title, detail, meta }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors', checked ? 'bg-brand-soft/60' : 'hover:bg-slate-50')}>
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        {detail && <span className="mt-0.5 block text-[13px] text-slate-500">{detail}</span>}
      </span>
      {meta && <span className="hidden shrink-0 text-xs text-slate-400 sm:block">{meta}</span>}
    </label>
  );
}

export default function StaffEditor({ agentId = null }) {
  const router = useRouter();
  const editing = Boolean(agentId);
  const agents = useResource(editing ? '/api/agents' : null);
  const roles = useResource('/api/roles');
  const agent = editing ? (agents.data || []).find((a) => a.id === agentId) : null;
  useBreadcrumb(capName(agent?.name), editing ? `/dashboard/team/${agentId}` : null); // the person's name on the crumb before "Edit"

  if ((editing && agents.loading) || roles.loading) return <LoadingBlock />;
  if (editing && !agent) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb current="Edit staff member" />
        <Alert>{agents.error || 'This staff member no longer exists.'}</Alert>
      </div>
    );
  }
  return (
    <StaffForm
      key={agent?.id || 'new'}
      agent={agent}
      roles={roles.data || []}
      onRoleCreated={(role) => roles.setData((list) => [...(list || []), role].sort((x, y) => x.name.localeCompare(y.name)))}
      onDone={(saved) => {
        toast.success(editing ? `${saved.name} updated` : `${saved.name} added to your team`);
        router.push(TEAM_PATH);
      }}
      onCancel={() => router.push(TEAM_PATH)}
    />
  );
}

function Breadcrumb({ current }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-[13px] text-slate-500">
      <Link href={TEAM_PATH} className="hover:text-slate-900">Staff Management</Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-slate-700">{current}</span>
    </nav>
  );
}

function StaffForm({ agent, roles, onRoleCreated, onDone, onCancel }) {
  const { company } = useSession();
  const jobTitles = agentRolesFor(company);
  const editing = Boolean(agent?.id);
  const catalog = useResource(roles.length ? null : '/api/roles/catalog'); // templates, only when there are no roles yet
  const [form, setForm] = useState(() => ({
    ...BLANK,
    ...agent,
    roles: agentRolesOf(agent),
    staffRoles: (agent?.staffRoles || []).map((r) => r.id),
    permissions: Array.isArray(agent?.permissions) ? agent.permissions : [],
    password: '',
  }));
  const [showExtra, setShowExtra] = useState(() => Boolean(agent?.permissions?.length));
  const [template, setTemplate] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(() => (agent?.photo ? assetUrl(agent.photo) : ''));
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // the checked form, shown for review before it is saved
  const [error, setError] = useState('');
  const v = useValidation(editing ? agentUpdateSchema : agentCreateSchema, form);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggle = (key, value) => setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  useEffect(() => () => { if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const firstName = form.name.trim().split(/\s+/)[0];
  const effective = effectiveOf(form.staffRoles, form.permissions, roles);
  const templates = catalog.data?.templates || [];

  const pickPhoto = (file) => {
    if (!file) return;
    setPhotoFile(file);
    setRemovePhoto(false);
    setPhotoPreview((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  // no roles yet: create one from a template and give it to this person
  const addFromTemplate = async () => {
    const t = templates.find((x) => x.key === template);
    if (!t) return;
    setCreatingRole(true);
    try {
      const role = await api('/api/roles', { method: 'POST', body: { name: t.name, description: t.description, permissions: t.permissions } });
      onRoleCreated(role);
      setForm((f) => ({ ...f, staffRoles: [...f.staffRoles, role.id] }));
      setTemplate('');
      toast.success(`Access role “${role.name}” created`);
    } catch (e) {
      toast.error(e.message);
    }
    setCreatingRole(false);
  };

  // first step of saving: check the form, then show the preview; nothing is saved until it's confirmed there
  const review = () => {
    const checked = v.validate();
    if (!checked) {
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }); // the fields with errors are at the top
      return;
    }
    setError('');
    setPreview(checked);
  };

  const save = async () => {
    const checked = preview;
    if (!checked) return;
    setBusy(true);
    setError('');
    try {
      const body = { ...checked, staffRoles: form.staffRoles, permissions: form.permissions };
      for (const k of ['effectivePermissions', 'stats', 'photo', 'jobTitle', 'openSteps']) delete body[k];
      let saved = editing ? await api(`/api/agents/${agent.id}`, { method: 'PUT', body }) : await api('/api/agents', { method: 'POST', body });
      const id = saved.id || agent.id;
      if (removePhoto && editing) saved = await api(`/api/agents/${id}/photo`, { method: 'DELETE' });
      else if (photoFile) {
        const fd = new FormData();
        fd.append('file', photoFile);
        saved = await api(`/api/agents/${id}/photo`, { method: 'POST', form: fd });
      }
      onDone(saved);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const actions = (
    <>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" onClick={review}>{editing ? 'Review changes' : 'Review & add'}</Button>
    </>
  );

  return (
    <div>
      <Breadcrumb current={editing ? agent.name : 'Add staff member'} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{editing ? `Edit ${agent.name}` : 'Add staff member'}</h1>
          <p className="mt-1 text-sm text-slate-500">{editing ? 'Update their details, job title and access.' : 'They’ll sign in with the email and password you set here.'}</p>
        </div>
        <div className="flex gap-2">{actions}</div>
      </div>
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <Row title="Profile" help="Their name and how to reach them. The photo is shown on the team list and on installation tasks.">
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={form.name || 'Staff'} src={photoPreview && !removePhoto ? photoPreview : undefined} size={56} />
              <div className="flex flex-wrap gap-2">
                <ImageSourceButtons onFiles={pickPhoto} />
                {(photoPreview && !removePhoto) && <Button type="button" size="sm" variant="ghost" onClick={() => { setPhotoFile(null); setRemovePhoto(true); setPhotoPreview(''); }}>Remove</Button>}
              </div>
            </div>
            <FormField label="Full name" error={v.error('name')}><NameInput maxLength={120} value={form.name} onValue={(x) => set({ name: x })} placeholder="Imran Shaikh" /></FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Email" error={v.error('email')}><Input type="email" value={form.email} onValue={(x) => set({ email: x })} autoComplete="off" placeholder="name@company.com" /></FormField>
              <FormField label="Phone" optional error={v.error('phone')}><PhoneInput maxLength={20} value={form.phone} onValue={(x) => set({ phone: x })} /></FormField>
            </div>
          </div>
        </Row>

        <Row title="Sign-in" help={editing ? 'Set a new password only if they need one. Switch sign-in off to pause their access without deleting them.' : 'They sign in with their email and this password, and can change it later.'}>
          <div className="max-w-2xl space-y-4">
            <FormField label={editing ? 'New password' : 'Password'} optional={editing} hint={editing ? 'Leave empty to keep the current password.' : 'At least 8 characters, with a letter and a number.'} error={v.error('password')}>
              <PasswordInput defaultVisible maxLength={200} value={form.password} onValue={(x) => set({ password: x })} autoComplete="new-password" />
            </FormField>
            {editing && <Toggle checked={form.active} onChange={(x) => set({ active: x })} label="Can sign in" description="Their tasks and history are kept either way." />}
          </div>
        </Row>

        <Row
          title="Job title"
          help={<>The field work they do. Used to give them installation tasks — it doesn’t open anything in the app. <Link href="/dashboard/masters?tab=agent-roles" className="font-medium text-brand hover:underline">Edit job titles</Link></>}
        >
          {jobTitles.length ? (
            <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {jobTitles.map((job) => (
                <label key={job} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
                  <input type="checkbox" checked={form.roles.includes(job)} onChange={() => toggle('roles', job)} className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand" />
                  {job}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No job titles yet.</p>
          )}
          <p className="mt-3 text-xs text-slate-400">Office staff with no field work can leave this empty.</p>
        </Row>

        <Row
          title="Access role"
          help={<>What they can see and do in the app. Each access role is a set of permissions you manage in one place. <Link href="/dashboard/team/roles" className="font-medium text-brand hover:underline">Manage access roles</Link></>}
        >
          {roles.length ? (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
              {roles.map((r) => (
                <CheckRow
                  key={r.id}
                  checked={form.staffRoles.includes(r.id)}
                  onChange={() => toggle('staffRoles', r.id)}
                  title={r.name}
                  detail={r.description}
                  meta={areasOf(r.permissions).join(' · ') || 'No access'}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-4">
              <p className="text-sm text-slate-700">You haven’t created any access roles yet.</p>
              <p className="mt-0.5 text-[13px] text-slate-500">Start from a template — it’s created for your company and given to this person. You can change it later.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select value={template} onChange={(e) => setTemplate(e.target.value)} className="h-10 min-w-[16rem] rounded-lg border border-slate-300 bg-white px-3 pr-8 text-sm text-slate-900 shadow-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand-muted/60" aria-label="Access role template">
                  <option value="">Choose a template…</option>
                  {templates.map((t) => <option key={t.key} value={t.key}>{t.name} — {t.description}</option>)}
                </select>
                <Button icon={creatingRole ? Loader2 : Plus} disabled={!template || creatingRole} onClick={addFromTemplate}>Create and assign</Button>
              </div>
            </div>
          )}

          <button type="button" onClick={() => setShowExtra((x) => !x)} className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-900">
            <ChevronDown className={cx('h-4 w-4 transition-transform', !showExtra && '-rotate-90')} />
            Additional permissions{form.permissions.length ? ` (${form.permissions.length})` : ''}
          </button>
          {showExtra && (
            <div className="mt-3">
              <p className="mb-3 text-[13px] text-slate-500">Only for {firstName || 'this person'}, on top of their access roles. Choices already given by a role are shown locked.</p>
              <PermissionEditor value={form.permissions} onChange={(permissions) => set({ permissions })} inherited={effectiveOf(form.staffRoles, [], roles)} />
            </div>
          )}
        </Row>

        <Row last title="Access summary" help="Exactly what they’ll be able to do. Anything not listed stays hidden from them.">
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <PermissionSummary permissions={effective} ownTasks columns />
          </div>
        </Row>
      </div>

      <div className="mt-6 flex justify-end gap-2">{actions}</div>

      {preview && (
        <StaffPreview
          editing={editing}
          form={form}
          photo={photoPreview && !removePhoto ? photoPreview : ''}
          roles={roles.filter((r) => form.staffRoles.includes(r.id))}
          effective={effective}
          busy={busy}
          error={error}
          onBack={() => { if (!busy) { setPreview(null); setError(''); } }}
          onConfirm={save}
        />
      )}
    </div>
  );
}

/** One line of the preview: label on the left, value on the right. */
function PreviewRow({ label, children }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[13px] font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

/** Everything about to be saved, to check once before confirming. */
function StaffPreview({ editing, form, photo, roles, effective, busy, error, onBack, onConfirm }) {
  const none = <span className="text-slate-400">—</span>;
  return (
    <Modal
      open
      onClose={onBack}
      size="lg"
      title={editing ? 'Review changes' : 'Review new staff member'}
      description="Check the details below. Nothing is saved until you confirm."
      footer={
        <>
          <Button variant="ghost" onClick={onBack} disabled={busy}>Back to edit</Button>
          <Button variant="primary" onClick={onConfirm} loading={busy}>{editing ? 'Confirm & save' : 'Confirm & add'}</Button>
        </>
      }
    >
      {error && <Alert className="mb-4">{error}</Alert>}
      <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <Avatar name={form.name || 'Staff'} src={photo || undefined} size={56} />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-slate-900">{form.name}</div>
          <div className="truncate text-[13px] text-slate-500">{form.email}{form.phone ? ` · ${form.phone}` : ''}</div>
        </div>
      </div>

      <dl className="mt-2 divide-y divide-slate-200">
        <PreviewRow label="Sign-in">
          {editing ? (
            <>{form.password ? 'A new password will be set' : 'Password unchanged'} · {form.active ? 'Can sign in' : <span className="font-medium text-red-700">Sign-in switched off</span>}</>
          ) : 'Signs in with this email and the password you set'}
        </PreviewRow>
        <PreviewRow label="Job title">
          {form.roles.length ? <div className="flex flex-wrap gap-1.5">{form.roles.map((r) => <JobChip key={r}>{r}</JobChip>)}</div> : <>{none} <span className="text-[13px] text-slate-500">No field work</span></>}
        </PreviewRow>
        <PreviewRow label="Access roles">
          {roles.length || form.permissions.length ? (
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => <AccessChip key={r.id}>{r.name}</AccessChip>)}
              {form.permissions.length > 0 && <AccessChip extra>+ {form.permissions.length} additional permission{form.permissions.length > 1 ? 's' : ''}</AccessChip>}
            </div>
          ) : <>{none} <span className="text-[13px] text-slate-500">Only their own installation tasks</span></>}
        </PreviewRow>
      </dl>

      <h3 className="mt-4 mb-2 text-[13px] font-semibold text-slate-900">{(form.name.trim().split(/\s+/)[0] || 'They')} will be able to</h3>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <PermissionSummary permissions={effective} ownTasks columns />
      </div>
    </Modal>
  );
}
