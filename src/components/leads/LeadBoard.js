'use client';

// The leads as a Kanban board: one column per status, "Not started" first. Drag a card to another column to change the
// lead's status — the same change the list pages make, so a status that asks for a date asks here too.
import { ArrowLeftRight, CalendarClock, CircleCheck, GripVertical, Lock, Plus, Search, Star, Users } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatSchedule, isOverdue } from '@/lib/leadSchedule';
import { isLeadStatusLocked } from '@/lib/leads';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, FormField, FormModal, Input, LoadingBlock, PageHeader, Select, Textarea, capName, cx, toast } from '../kit';
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanColumnHeader, flashCard } from '../kanban/Kanban';
import ConvertToClient from './ConvertToClient';
import LeadForm from './LeadForm';
import LeadViewSwitch, { leadPaths } from './LeadViewSwitch';
import ManualLeadDetail from './ManualLeadDetail';
import QuickAssign from './QuickAssign';
import ScheduleField from './ScheduleField';
import LeadSourceTabs from '@/components/leads/LeadSourceTabs';

const SOURCE_TONE = { meta: 'blue', google: 'amber', manual: 'slate', import: 'violet' };
const SOURCE_QUERY = { meta: 'meta', google: 'google', manual: 'manual_all' }; // what the board endpoint's ?source= takes
const STATUS_PATH = { meta: 'meta', google: 'google', manual: 'manual', import: 'manual' }; // PUT /api/leads/<path>/:id/status
const DOT = { slate: '#94a3b8', blue: '#3b82f6', amber: '#f59e0b', emerald: '#10b981', rose: '#f43f5e', purple: '#8b5cf6', cyan: '#06b6d4' };

function CardBody({ lead, locked, preview = false }) {
  return (
    <>
      <div className="flex items-start gap-2">
        {!preview && (locked ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" aria-label="Converted — cannot be moved" /> : <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />)}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {lead.isPriority && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Priority" />}
            <span className="truncate text-sm font-medium text-slate-900">{capName(lead.fullName) || 'No name'}</span>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">{lead.phone || '—'}</div>
        </div>
        <Badge tone={SOURCE_TONE[lead.leadSource] || 'slate'} className="shrink-0">{lead.sourceLabel}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 truncate"><Users className="h-3 w-3 text-slate-400" />{lead.assignedTo?.name || <span className="text-amber-700">Unassigned</span>}</span>
        {lead.scheduledAt && <span className={cx('inline-flex items-center gap-1 whitespace-nowrap', isOverdue(lead.scheduledAt) ? 'font-medium text-red-600' : '')}><CalendarClock className="h-3 w-3" />{formatSchedule(lead.scheduledAt)}</span>}
        {lead.isReassigned && <span className="inline-flex items-center gap-1 text-violet-700"><ArrowLeftRight className="h-3 w-3" />Reassigned{lead.reassignedCount > 1 ? ` ×${lead.reassignedCount}` : ''}</span>}
        {lead.convertedClient && <span className="inline-flex items-center gap-1 text-emerald-700"><CircleCheck className="h-3 w-3" />{lead.convertedClientName || 'Client'}</span>}
      </div>
    </>
  );
}

/** The date a status asks for, before the move. */
function MoveModal({ move, onClose, onConfirm }) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = { name: move.to.name, requiresDate: move.to.requiresDate };
  const submit = async () => {
    if (status.requiresDate && !scheduledAt) return setError(`Choose a date for “${status.name}”`);
    setBusy(true);
    setError('');
    try {
      await onConfirm({ scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null, remark });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <FormModal open onClose={onClose} size="md" title={`Move to “${move.to.name}”`} description={`${capName(move.lead.fullName) || 'This lead'} · ${move.from.name} → ${move.to.name}`} submitLabel="Move" busy={busy} error={error} onSubmit={submit}>
      <ScheduleField status={status} value={scheduledAt} onChange={setScheduledAt} />
      <FormField label="Remark (optional)"><Textarea rows={2} maxLength={1000} value={remark} onValue={setRemark} placeholder="e.g. Asked to call after 6 pm" /></FormField>
    </FormModal>
  );
}

export default function LeadBoard() {
  const router = useRouter();
  const paths = leadPaths(usePathname());
  const SOURCE_PATH = { meta: `${paths.base}/meta`, google: `${paths.base}/google` }; // Meta and Google Ads leads open on their own page
  const can = useCan();
  const may = { all: can('leads', 'view_all'), create: can('leads', 'create'), update: can('leads', 'update'), status: can('leads', 'change_status'), assign: can('leads', 'assign') };
  const canAddClient = can('clients', 'create');
  const statusesRes = useResource('/api/leads/statuses');
  const assigneesRes = useResource(may.all ? '/api/leads/assignees' : null);
  const form = useResource('/api/leads/form');
  const statuses = useMemo(() => statusesRes.data || [], [statusesRes.data]);
  const assignees = assigneesRes.data || [];
  const fields = form.data?.fields || [];

  const [query, setQuery] = useState('');
  const fixedSource = paths.source; // on a source page the board shows that source only
  const [filters, setFilters] = useState({ search: '', assignedTo: '', source: '' });
  const [state, setState] = useState({ columns: [], total: 0, truncated: false, loading: true, error: '' });
  const [move, setMove] = useState(null); // a drop onto a status that asks for a date, waiting for the date
  const [modal, setModal] = useState(null); // { type: 'detail' | 'form' | 'convert', lead }
  const [quickAssign, setQuickAssign] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: query.trim() })), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: s.columns.length === 0, error: '' }));
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      if (fixedSource && !(fixedSource === 'manual' && filters.source)) params.set('source', SOURCE_QUERY[fixedSource]);
      const res = await api(`/api/leads/board?${params}`);
      setState({ columns: res.columns || [], total: res.total || 0, truncated: Boolean(res.truncated), loading: false, error: '' });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [filters, fixedSource]);
  useEffect(() => { load(); }, [load]);

  const columnOf = useCallback((id) => state.columns.find((c) => c.id === id), [state.columns]);
  const canDragLead = (lead) => may.status && !isLeadStatusLocked(lead, statuses);
  const canDropHere = (column) => may.status && column.id !== 'none' && column.isActive; // a status can't be cleared, nor a switched-off one chosen

  /** Put the lead in `to` on screen straight away, then tell the server; put it back if the server says no. */
  const performMove = useCallback(async (lead, from, to, { scheduledAt = null, remark = '' } = {}) => {
    const before = state.columns;
    const moved = { ...lead, currentStatus: { _id: to.id, name: to.name, color: to.color }, scheduledAt: scheduledAt || (to.requiresDate ? lead.scheduledAt : null) };
    setState((s) => ({
      ...s,
      columns: s.columns.map((c) => {
        if (c.id === from.id) { const leads = c.leads.filter((l) => l._id !== lead._id); return { ...c, leads, count: leads.length }; }
        if (c.id === to.id) { const leads = [moved, ...c.leads]; return { ...c, leads, count: leads.length }; }
        return c;
      }),
    }));
    try {
      await api(`/api/leads/${STATUS_PATH[lead.leadSource] || 'manual'}/${lead._id}/status`, { method: 'PUT', body: { statusId: to.id, remark, scheduledAt } });
      flashCard(lead._id);
      toast.success(`${capName(lead.fullName) || 'Lead'} → ${to.name}`);
      if (to.outcome === 'converted' && !lead.convertedClient) {
        if (canAddClient) setModal({ type: 'convert', lead: moved });
        else toast.success('Converted — ask someone who can add clients to add them as a client.');
      }
    } catch (e) {
      setState((s) => ({ ...s, columns: before }));
      toast.error(e.message);
      throw e;
    }
  }, [state.columns, canAddClient]);

  const onMove = useCallback((data, toId) => {
    const from = columnOf(data.columnId);
    const to = columnOf(toId);
    const lead = from?.leads.find((l) => l._id === data.id);
    if (!from || !to || !lead) return;
    if (to.requiresDate) setMove({ lead, from, to }); // ask for the date first
    else performMove(lead, from, to).catch(() => {});
  }, [columnOf, performMove]);

  const openLead = async (lead) => {
    if (SOURCE_PATH[lead.leadSource]) {
      router.push(`${SOURCE_PATH[lead.leadSource]}${lead.phone ? `?search=${encodeURIComponent(lead.phone)}` : ''}`);
      return;
    }
    try {
      const res = await api(`/api/leads/manual?limit=5&search=${encodeURIComponent(lead.phone || lead.fullName)}`);
      const full = (res.leads || []).find((l) => l._id === lead._id);
      if (!full) return toast.error('This lead could not be opened');
      setModal({ type: 'detail', lead: full });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const filtered = Boolean(filters.search || filters.assignedTo || filters.source);

  return (
    <>
      <LeadSourceTabs />
      <PageHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LeadViewSwitch view="board" />
          <div className="flex flex-wrap items-center gap-2">
          {may.assign && <Button icon={Users} onClick={() => setQuickAssign(true)}>Assign by count</Button>}
          {may.create && (!fixedSource || fixedSource === 'manual') && <Button variant="primary" icon={Plus} disabled={!fields.length} onClick={() => setModal({ type: 'form' })}>Add lead</Button>}
          </div>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1 basis-[240px]">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
          <Input aria-label="Search leads" placeholder="Search name, phone or address" value={query} onValue={setQuery} className="pl-9" />
        </div>
        {may.all && (
          <Select aria-label="Assigned to" value={filters.assignedTo} onValue={setFilter('assignedTo')} className="w-48">
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </Select>
        )}
        {fixedSource === 'manual' ? (
          <Select aria-label="Source" value={filters.source} onValue={setFilter('source')} className="w-40">
            <option value="">Added and imported</option>
            <option value="manual">Added</option>
            <option value="import">Imported</option>
          </Select>
        ) : !fixedSource && (
          <Select aria-label="Source" value={filters.source} onValue={setFilter('source')} className="w-40">
            <option value="">All sources</option>
            <option value="meta">Meta</option>
            <option value="google">Google Ads</option>
            <option value="manual">Added</option>
            <option value="import">Imported</option>
          </Select>
        )}
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setFilters({ search: '', assignedTo: '', source: '' }); }}>Clear</Button>}
        {!state.loading && <span className="ml-auto text-sm text-slate-500">{state.total} lead{state.total === 1 ? '' : 's'}</span>}
      </div>

      {state.error && <Alert className="mb-4">{state.error}</Alert>}
      {state.truncated && <Alert tone="warn" className="mb-4">The board shows the newest 400 leads from each source. Use the filters to narrow it down.</Alert>}

      {state.loading ? <LoadingBlock /> : (
        <KanbanBoard type="lead" onMove={onMove} className="h-[calc(100vh-17rem)] min-h-[24rem]">
          {state.columns.map((column) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              label={`${column.name}: ${column.count} lead${column.count === 1 ? '' : 's'}`}
              droppable={canDropHere(column)}
              header={(
                <KanbanColumnHeader color={DOT[column.color] || DOT.slate} name={column.name} muted={!column.isActive} count={column.count}>
                  {column.requiresDate && <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Asks for a date" />}
                </KanbanColumnHeader>
              )}
              empty={column.leads.length === 0 ? (column.id === 'none' ? 'Leads with no status yet show here' : 'No leads') : null}
            >
              {column.leads.map((lead) => (
                <KanbanCard key={`${lead.leadSource}-${lead._id}`} id={lead._id} columnId={column.id} data={{ source: lead.leadSource }} canDrag={canDragLead(lead)} onOpen={() => openLead(lead)} preview={<CardBody lead={lead} preview />}>
                  <CardBody lead={lead} locked={!canDragLead(lead)} />
                </KanbanCard>
              ))}
            </KanbanColumn>
          ))}
        </KanbanBoard>
      )}

      {move && (
        <MoveModal
          move={move}
          onClose={() => setMove(null)}
          onConfirm={async (extra) => { await performMove(move.lead, move.from, move.to, extra); setMove(null); }}
        />
      )}
      {modal?.type === 'detail' && (
        <ManualLeadDetail
          fields={fields}
          lead={modal.lead}
          statuses={statuses}
          assignees={assignees}
          may={may}
          onClose={() => { setModal(null); load(); }}
          onChanged={(lead) => setModal({ type: 'detail', lead })}
          onEdit={() => setModal({ type: 'form', lead: modal.lead })}
          onConverted={(lead) => {
            if (canAddClient) setModal({ type: 'convert', lead: { ...lead, leadSource: 'manual' } });
            else toast.success('Converted — ask someone who can add clients to add them as a client.');
          }}
        />
      )}
      {modal?.type === 'form' && (
        <LeadForm fields={fields} lead={modal.lead} onClose={() => setModal(modal.lead ? { type: 'detail', lead: modal.lead } : null)} onSaved={(saved) => { toast.success(modal.lead ? 'Lead saved' : 'Lead added'); if (modal.lead) setModal({ type: 'detail', lead: saved }); else { setModal(null); load(); } }} />
      )}
      {modal?.type === 'convert' && (
        <ConvertToClient
          lead={{ source: STATUS_PATH[modal.lead.leadSource] || 'manual', id: modal.lead._id, name: modal.lead.fullName, phone: modal.lead.phone, address: modal.lead.address, email: fields.filter((f) => f.type === 'email').map((f) => modal.lead.fields?.[f.key]).find(Boolean) }}
          onClose={() => { setModal(null); load(); }}
          onConverted={() => { setModal(null); load(); }}
        />
      )}
      {quickAssign && <QuickAssign source="all" onClose={() => setQuickAssign(false)} onAssigned={() => { setQuickAssign(false); load(); }} />}
    </>
  );
}
