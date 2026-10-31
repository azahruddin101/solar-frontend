'use client';

// One manual lead in a dialog: its answers, status (with the booked date), who has it, and its activity. Shared by the
// Manual leads page and the all-sources Leads page, so the lead looks and works the same from both.
import { CircleCheck, Pencil, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { leadValue, valueText } from '@/lib/leadForm';
import { isLeadStatusLocked, LEAD_CONVERTED_LOCK_HINT } from '@/lib/leads';
import { toLocalInput } from '@/lib/leadSchedule';
import { Badge, Button, Modal, Select, Textarea, cx, formatDate, timeAgo, toast } from '../kit';
import LeadLog from './LeadLog';
import ScheduleField from './ScheduleField';
import { LOG_TITLE } from './ReassignedMark';

const STATUS_TONE = { amber: 'amber', blue: 'blue', purple: 'violet', violet: 'violet', rose: 'red', red: 'red', emerald: 'green', green: 'green', slate: 'slate' };
const StatusBadge = ({ status }) => (status ? <Badge tone={STATUS_TONE[status.color] || 'slate'}>{status.name}</Badge> : <span className="text-[13px] text-slate-400">Not started</span>);

/** One lead: its answers, and what the user may do with it (edit, status, assign, priority). */
export default function ManualLeadDetail({ fields, lead, statuses, assignees, may, onClose, onChanged, onEdit, onConverted }) {
  const [statusForm, setStatusForm] = useState({ statusId: lead.currentStatus?._id || '', remark: '', scheduledAt: toLocalInput(lead.scheduledAt) });
  const chosenStatus = statuses.find((s) => s._id === statusForm.statusId);
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState('');
  const run = async (key, fn, done) => {
    setBusy(key);
    let res = null;
    try {
      res = await fn();
      onChanged(res);
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy('');
    return res;
  };
  const saveStatus = async () => {
    const chosen = statuses.find((s) => s._id === statusForm.statusId);
    if (chosen?.requiresDate && !statusForm.scheduledAt) return toast.error(`Choose a date for “${chosen.name}”`);
    const res = await run('status', () => api(`/api/leads/manual/${lead._id}/status`, { method: 'PUT', body: { ...statusForm, scheduledAt: statusForm.scheduledAt ? new Date(statusForm.scheduledAt).toISOString() : null } }), 'Status updated');
    if (!res) return;
    setStatusForm((x) => ({ ...x, remark: '' }));
    // the converted status: add the lead as a client straight away, filled in from the lead
    if (chosen?.outcome === 'converted' && !lead.convertedClient) onConverted(res);
  };
  const reload = async () => {
    const res = await api(`/api/leads/manual?limit=1&search=${encodeURIComponent(lead.phone)}`);
    return res.leads.find((l) => l._id === lead._id) || lead;
  };
  const leadLocked = isLeadStatusLocked(lead, statuses);
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={lead.fullName}
      description={`${lead.source === 'import' ? 'Imported' : 'Added'} ${timeAgo(lead.createdAt).replace(/^Just now$/, 'just now')}${lead.createdByName ? ` by ${lead.createdByName}` : ''}`}
      footer={<>{may.update && <Button icon={Pencil} onClick={onEdit}>Edit details</Button>}<Button variant="primary" onClick={onClose}>Close</Button></>}
    >
      {/* left: the lead and what can be done with it; right: what has happened */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {fields.map((f) => {
              const text = valueText(f, leadValue(lead, f));
              return (
                <div key={f.key} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-[13px] font-medium text-slate-500">{f.label}</dt>
                  <dd className={cx('min-w-0 text-sm break-words whitespace-pre-line', text ? 'text-slate-900' : 'text-slate-400')}>{text || '—'}</dd>
                </div>
              );
            })}
          </dl>

          {lead.convertedClient && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-900">
              <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Converted to client <b className="font-semibold">{lead.convertedClientName}</b>{lead.convertedAt ? ` on ${formatDate(lead.convertedAt)}` : ''}.</span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-slate-900">Status</span>
                <StatusBadge status={lead.currentStatus} />
              </div>
              {may.status ? (
                !leadLocked && (
                  <div className="space-y-2">
                    <Select value={statusForm.statusId} onValue={(x) => setStatusForm({ ...statusForm, statusId: x })} aria-label="New status">
                      <option value="">Choose a status…</option>
                      {statuses.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </Select>
                    <ScheduleField status={chosenStatus} value={statusForm.scheduledAt} onChange={(x) => setStatusForm({ ...statusForm, scheduledAt: x })} />
                    <Textarea rows={2} maxLength={1000} placeholder="Remark (optional)" value={statusForm.remark} onValue={(x) => setStatusForm({ ...statusForm, remark: x })} />
                    <Button size="sm" variant="primary" disabled={!statusForm.statusId || (chosenStatus?.requiresDate && !statusForm.scheduledAt)} loading={busy === 'status'} onClick={saveStatus}>Update status</Button>
                  </div>
                )
              ) : !leadLocked ? <p className="text-xs text-slate-500">You can see the status but not change it.</p> : null}
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 text-[13px] font-semibold text-slate-900">Assigned to</div>
              <div className="text-sm text-slate-700">{lead.assignedTo?.name || 'Nobody yet'}</div>
              {may.assign ? (
                leadLocked ? (
                  <p className="mt-1 text-xs text-slate-500">{LEAD_CONVERTED_LOCK_HINT}</p>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    <Select value={assignee} onValue={setAssignee} aria-label="Assign to">
                      <option value="">Choose a staff member…</option>
                      {assignees.filter((a) => a._id !== lead.assignedTo?._id).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                      {lead.assignedTo && <option value="unassign">Remove assignment</option>}
                    </Select>
                    <Button size="sm" icon={UserPlus} disabled={!assignee} loading={busy === 'assign'} onClick={() => run('assign', async () => { await api('/api/leads/manual/assign', { method: 'POST', body: { leadIds: [lead._id], counsellorId: assignee === 'unassign' ? null : assignee } }); setAssignee(''); return reload(); }, 'Assignment saved')}>Assign</Button>
                  </div>
                )
              ) : <p className="mt-1 text-xs text-slate-500">You can’t change who has this lead.</p>}
            </div>
          </div>
        </div>

        <LeadLog
          className="lg:sticky lg:top-0"
          entries={[
            { at: lead.createdAt, title: lead.source === 'import' ? 'Imported from a spreadsheet' : 'Lead added', by: lead.createdByName },
            ...(lead.logs?.length ? lead.logs.filter((e) => !['lead_status', 'lead_rescheduled'].includes(e.action)).map((e) => ({ at: e.at, title: LOG_TITLE[e.action] || e.action, remark: e.message, by: e.byName })) : [lead.assignedTo && { at: lead.assignedAt, title: `Assigned to ${lead.assignedTo.name}` }]),
            lead.convertedClient && { at: lead.convertedAt, title: `Converted to client ${lead.convertedClientName}`, by: lead.convertedByName },
            ...(lead.statusHistory || []).map((h) => ({ at: h.changedAt, title: h.rescheduled ? 'Rescheduled' : 'Status changed', status: { name: h.statusName, color: h.statusColor }, remark: h.remark, scheduledAt: h.scheduledAt, by: h.changedByName })),
          ]}
        />
      </div>
    </Modal>
  );
}
