'use client';

// Staff: the company's team. They sign in and work on the installation steps assigned to them, plus whatever their
// roles (named permission sets, see StaffRoles.js) and any extra grants on their own account allow.
import { CheckCircle2, ClipboardList, Eye, HardHat, KeyRound, Mail, Pencil, Phone, Plus, Trash2, UserCog } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { agentRolesOf } from '@/lib/agents';
import { api, assetUrl } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Avatar, Badge, Button, buttonClass, Card, ConfirmDialog, EmptyState, LoadingBlock, Modal, PageHeader, StatCard, Table, Td, Th, Tr, timeAgo, toast, RowMenu } from '../kit';
import { AreaPills, PermissionSummary } from './PermissionEditor';
import { AccessChip, JobChip } from './StaffEditor';

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="text-xl font-semibold text-slate-900 tabular-nums">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

/** The two kinds of "role" on this page, said once, plainly, in their colours. */
function TwoKindsExplainer() {
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white"><HardHat className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">Job title = field work</div>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-600">Electrician, Installer, Surveyor… Decides which <b className="font-medium text-slate-800">installation tasks</b> a person can be given. Opens nothing in the app.</p>
          <Link href="/dashboard/masters?tab=agent-roles" className="mt-1.5 inline-block text-[13px] font-medium text-amber-700 hover:underline">Edit job titles →</Link>
        </div>
      </div>
      <div className="flex gap-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><KeyRound className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">Access role = app access</div>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-600">Telecaller, Accountant, Sales… Decides what a person can <b className="font-medium text-slate-800">open and do in the app</b> — leads, proposals, payments.</p>
          <Link href="/dashboard/team/roles" className="mt-1.5 inline-block text-[13px] font-medium text-violet-700 hover:underline">Manage access roles →</Link>
        </div>
      </div>
    </div>
  );
}

/** Everything about one staff member: contact, roles, permissions, current workload and recent completions. */
function StaffDetails({ agent: a, onClose, onEdit }) {
  const st = a.stats || {};
  return (
    <Modal open onClose={onClose} title="Staff details" footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button icon={Pencil} onClick={onEdit}>Edit</Button></>}>
      <div className="flex items-center gap-4">
        <Avatar name={a.name} src={a.photo ? assetUrl(a.photo) : undefined} size={56} zoom />
        <div className="min-w-0">
          <Link href={`/dashboard/team/${a.id}`} className="block truncate text-base font-semibold text-slate-900 hover:text-brand hover:underline">{a.name}</Link>
          <div className="mt-1">{a.active ? <Badge dot tone="green">Active</Badge> : <Badge dot tone="slate">Inactive</Badge>}</div>
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-slate-700"><Mail className="h-4 w-4 text-slate-400" /> {a.email}</div>
        {a.phone && <div className="flex items-center gap-2 text-slate-700"><Phone className="h-4 w-4 text-slate-400" /> {a.phone}</div>}
        <div className="text-[13px] text-slate-500">Last sign-in: {timeAgo(a.lastLoginAt)}</div>
      </dl>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800"><HardHat className="h-4 w-4" /> Field work</div>
          {agentRolesOf(a).length ? <div className="mt-2 flex flex-wrap gap-1.5">{agentRolesOf(a).map((r) => <JobChip key={r}>{r}</JobChip>)}</div> : <p className="mt-1.5 text-xs text-slate-500">No job title</p>}
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-violet-800"><KeyRound className="h-4 w-4" /> App access</div>
          {a.staffRoles?.length || a.permissions?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">{a.staffRoles?.map((r) => <AccessChip key={r.id}>{r.name}</AccessChip>)}{a.permissions?.length > 0 && <AccessChip extra>Customised</AccessChip>}</div>
          ) : <p className="mt-1.5 text-xs text-slate-500">No access role — only their own tasks</p>}
        </div>
      </div>

      <h3 className="mt-6 mb-2 text-[13px] font-semibold tracking-wide text-slate-500 uppercase">{a.name.split(/\s+/)[0]} can</h3>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3"><PermissionSummary permissions={a.effectivePermissions || []} ownTasks /></div>

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
  const router = useRouter();
  const { data, setData, loading, error } = useResource('/api/agents');
  const addNew = () => router.push('/dashboard/team/new');
  const edit = (a) => router.push(`/dashboard/team/${a.id}/edit`);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const close = () => { setModal(null); setModalError(''); };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/agents/${modal.agent.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.agent.id));
      toast.success('Staff member deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Team" description="Your staff: the field work each person does, and what they can use in the app.">
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/team/roles" className={buttonClass()}><KeyRound className="h-4 w-4 text-violet-600" />Access roles</Link>
          <Button variant="primary" icon={Plus} onClick={addNew}>Add staff member</Button>
        </div>
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      <TwoKindsExplainer />

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
          <EmptyState icon={UserCog} title="No staff yet" description="Add your surveyors, installers and electricians, then assign installation steps to them.">
            <Button variant="primary" icon={Plus} onClick={addNew}>Add staff member</Button>
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Staff</Th><Th><span className="text-amber-700">Job title</span></Th><Th><span className="text-violet-700">App access</span></Th><Th className="text-right">Open tasks</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {data.map((a) => (
                <Tr key={a.id} className="cursor-pointer" onClick={() => setModal({ type: 'details', agent: a })}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={a.name} src={a.photo ? assetUrl(a.photo) : undefined} />
                      <div className="min-w-0">
                        <Link href={`/dashboard/team/${a.id}`} onClick={(e) => e.stopPropagation()} className="block max-w-[220px] truncate font-medium text-slate-900 hover:text-brand hover:underline">{a.name}</Link>
                        <div className="text-xs">{a.active ? <span className="text-emerald-700">● Can sign in</span> : <span className="text-slate-400">● Switched off</span>}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {agentRolesOf(a).length ? <div className="flex max-w-[220px] flex-wrap gap-1">{agentRolesOf(a).map((r) => <JobChip key={r}>{r}</JobChip>)}</div> : <span className="text-xs text-slate-400">—</span>}
                  </Td>
                  <Td>
                    {a.staffRoles?.length || a.permissions?.length ? (
                      <div className="max-w-[300px] space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {a.staffRoles?.map((r) => <AccessChip key={r.id}>{r.name}</AccessChip>)}
                          {a.permissions?.length > 0 && <AccessChip extra>{a.staffRoles?.length ? '+ customised' : 'Customised'}</AccessChip>}
                        </div>
                        <AreaPills permissions={a.effectivePermissions} />
                      </div>
                    ) : <span className="text-xs text-slate-400">Only their own tasks</span>}
                  </Td>
                  <Td className="text-right font-medium text-slate-900 tabular-nums">{a.stats?.open ?? 0}</Td>
                  <Td>
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <RowMenu
                        label={`Actions for ${a.name}`}
                        items={[
                          { key: 'view', icon: Eye, label: 'View details', onClick: () => setModal({ type: 'details', agent: a }) },
                          { key: 'edit', icon: Pencil, label: 'Edit staff member', onClick: () => edit(a) },
                          { key: 'delete', icon: Trash2, label: 'Delete staff member', tone: 'danger', onClick: () => setModal({ type: 'delete', agent: a }) },
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
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><KeyRound className="h-3.5 w-3.5" /> Staff sign in on the same sign-in page as you. To reset a password, edit them and set a new one.</p>

      {modal?.type === 'details' && <StaffDetails agent={data?.find((x) => x.id === modal.agent.id) || modal.agent} onClose={close} onEdit={() => edit(modal.agent)} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this staff member?" confirmLabel="Delete staff member">
        <b className="text-slate-900">{modal?.agent?.name}</b> will no longer be able to sign in{modal?.agent?.openSteps ? <>, and their <b className="text-slate-900">{modal.agent.openSteps} open step{modal.agent.openSteps > 1 ? 's' : ''}</b> will become unassigned</> : ''}. Activity logs keep their name. To pause access instead, mark them inactive.
      </ConfirmDialog>
    </>
  );
}
