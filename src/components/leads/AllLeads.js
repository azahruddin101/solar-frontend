'use client';

// All leads from Meta, Google Ads and manual entry in one list.
import { Eye, Plus, Star, Users } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { PRIORITY_FILTER_OPTIONS } from '@/components/admin/leads/PriorityToggle';
import ExportAllLeadsButton from '../admin/leads/ExportAllLeadsButton';
import LeadListFilterBar from './LeadListFilterBar';
import LeadForm from './LeadForm';
import LeadViewSwitch from './LeadViewSwitch';
import ManualLeadDetail from './ManualLeadDetail';
import ConvertToClient from './ConvertToClient';
import QuickAssign from './QuickAssign';
import StatusCell from './StatusCell';
import PreviousStaffCell from './PreviousStaffCell';
import ReassignedMark from './ReassignedMark';
import { SCHEDULE_OPTIONS } from '@/lib/leadSchedule';
import { Alert, Badge, Button, Card, EmptyState, FilterNotice, FormField, LoadingBlock, PageHeader, Select, Table, TablePagination, Td, Th, Tr, capName, cx, formatDate, toast } from '../kit';
import LeadSourceTabs from '@/components/leads/LeadSourceTabs';

const PAGE_SIZE = 20;
/** Filters a dashboard link may open the list with (?assignedTo=unassigned, ?statusId=none, ?source=, ?from=), and what to call that list. */
function linkedFilters(params) {
  const out = params.get('includePast') === '1' ? { includePast: '1' } : {}; // from a staff page: leads they held before too
  if (['unassigned', 'reassigned'].includes(params.get('assignedTo')) || /^[a-f0-9]{24}$/.test(params.get('assignedTo') || '')) out.assignedTo = params.get('assignedTo');
  if (params.get('statusId') === 'none' || /^[a-f0-9]{24}$/.test(params.get('statusId') || '')) out.statusId = params.get('statusId');
  if (['meta', 'google', 'manual', 'import'].includes(params.get('source'))) out.source = params.get('source');
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '')) out.fromDate = params.get('from');
  return out;
}
function linkedLabel(f, statuses, assignees) {
  if (f.assignedTo === 'unassigned') return 'leads not given to anyone';
  if (f.assignedTo) {
    const who = assignees.find((a) => a._id === f.assignedTo)?.name || '…';
    return f.statusId === 'none' ? `leads given to ${who} that nobody has called yet` : `leads given to ${who}`;
  }
  if (f.includePast && f.assignedTo) return `every lead ${assignees.find((a) => a._id === f.assignedTo)?.name || '…'} has ever held`;
  if (f.statusId && f.statusId !== 'none') return `leads with the status “${statuses.find((s) => s._id === f.statusId)?.name || '…'}”`;
  if (f.statusId === 'none') return f.fromDate ? `leads nobody has called yet, since ${formatDate(f.fromDate)}` : 'leads nobody has called yet';
  if (f.fromDate) return `leads that came in since ${formatDate(f.fromDate)}`;
  return '';
}
const EMPTY_FILTERS = { search: '', assignedTo: '', statusId: '', source: '', priority: '', schedule: '', includePast: '', fromDate: '', toDate: '', pageId: '', formId: '' };
const STATUS_TONE = { amber: 'amber', blue: 'blue', purple: 'violet', violet: 'violet', rose: 'red', red: 'red', emerald: 'green', green: 'green', slate: 'slate' };
const SOURCE_TONE = { meta: 'blue', google: 'amber', manual: 'slate', import: 'violet' };



export default function AllLeads() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const can = useCan();
  const may = { all: can('leads', 'view_all'), create: can('leads', 'create'), update: can('leads', 'update'), status: can('leads', 'change_status'), assign: can('leads', 'assign'), export: can('leads', 'export') };
  const canAddClient = can('clients', 'create');
  const form = useResource('/api/leads/form');
  const fields = form.data?.fields || [];
  const statusesRes = useResource('/api/leads/statuses');
  const assigneesRes = useResource(may.all ? '/api/leads/assignees' : null);
  const metaFiltersRes = useResource(may.all ? '/api/leads/meta/filters' : null);
  const statuses = statusesRes.data || [];
  const assignees = assigneesRes.data || [];
  const metaPages = metaFiltersRes.data?.pages || [];

  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...linkedFilters(params) }));
  const [linked, setLinked] = useState(() => Object.keys(linkedFilters(params)).length > 0); // opened from a dashboard link
  const metaForms = useMemo(() => {
    const forms = metaFiltersRes.data?.forms || [];
    if (!filters.pageId) return forms;
    return forms.filter((f) => f.pageId === filters.pageId);
  }, [metaFiltersRes.data, filters.pageId]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ leads: [], total: 0, totalPages: 1, loading: true, error: '' });
  const [quickAssign, setQuickAssign] = useState(false);
  const [adding, setAdding] = useState(false);
  const [modal, setModal] = useState(null); // { type: 'detail' | 'form' | 'convert', lead } — a manual lead, as on the Manual leads page

  const showMetaFilters = may.all && (!filters.source || filters.source === 'meta');

  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, search: query.trim() })); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filters.search) params.set('search', filters.search);
    if (filters.assignedTo) params.set('assignedTo', filters.assignedTo);
    if (filters.statusId) params.set('statusId', filters.statusId);
    if (filters.source) params.set('source', filters.source);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.schedule) params.set('schedule', filters.schedule);
    if (filters.includePast) params.set('includePast', '1');
    if (filters.fromDate) params.set('from', filters.fromDate);
    if (filters.toDate) params.set('to', filters.toDate);
    if (showMetaFilters && filters.pageId) params.set('pageId', filters.pageId);
    if (showMetaFilters && filters.formId) params.set('formId', filters.formId);
    try {
      const res = await api(`/api/leads/all?${params}`);
      setState({ leads: res.leads, total: res.total, totalPages: res.totalPages, loading: false, error: '' });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [filters, page, showMetaFilters]);
  useEffect(() => { load(); }, [load]);

  const setFilter = (k) => (v) => {
    setFilters((f) => {
      const next = { ...f, [k]: v };
      if (k === 'source' && v && v !== 'meta') {
        next.pageId = '';
        next.formId = '';
      }
      if (k === 'pageId' && v !== f.pageId) next.formId = '';
      return next;
    });
    setPage(1);
    setLinked(false); // the list no longer is the one the dashboard linked to
  };

  const clearFilters = () => {
    setQuery('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
    if (linked) {
      setLinked(false);
      router.replace(pathname);
    }
  };

  const extraFilterCount = [
    filters.assignedTo,
    filters.statusId,
    filters.source,
    filters.priority,
    filters.schedule,
    filters.fromDate,
    filters.toDate,
    showMetaFilters && filters.pageId,
    showMetaFilters && filters.formId,
  ].filter(Boolean).length;

  const hasFilters = Boolean(filters.search || extraFilterCount);

  const SOURCE_PATH = { meta: '/dashboard/leads/meta', google: '/dashboard/leads/google' };
  const openLead = async (lead) => {
    if (SOURCE_PATH[lead.leadSource]) { // Meta and Google Ads leads open on their own page, in that page's dialog
      router.push(`${SOURCE_PATH[lead.leadSource]}${lead.phone ? `?search=${encodeURIComponent(lead.phone)}` : ''}`);
      return;
    }
    try { // a manual lead: the full record, in the same dialog the Manual leads page uses
      const res = await api(`/api/leads/manual?limit=5&search=${encodeURIComponent(lead.phone || lead.fullName)}`);
      const full = (res.leads || []).find((l) => l._id === lead._id);
      if (!full) return toast.error('This lead could not be opened');
      setModal({ type: 'detail', lead: full });
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <LeadSourceTabs />
      <PageHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LeadViewSwitch view="list" />
          <div className="flex flex-wrap items-center gap-2">
          {may.assign && <Button icon={Users} onClick={() => setQuickAssign(true)}>Assign by count</Button>}
          {may.export && <ExportAllLeadsButton />}
          {may.create && <Button variant="primary" icon={Plus} disabled={!fields.length} onClick={() => setAdding(true)}>Add lead</Button>}
          </div>
        </div>
      </PageHeader>

      {linked && <FilterNotice className="mb-4" label={linkedLabel(filters, statuses, assignees)} count={state.loading ? null : `${state.total} lead${state.total === 1 ? '' : 's'}`} onClear={clearFilters} />}
      <LeadListFilterBar
        search={query}
        onSearchChange={setQuery}
        activeFilterCount={extraFilterCount}
        showClear={hasFilters}
        onClear={clearFilters}
        fromDate={filters.fromDate}
        toDate={filters.toDate}
        onDateChange={({ from, to }) => {
          setFilters((f) => ({ ...f, fromDate: from, toDate: to }));
          setPage(1);
        }}
      >
        <FormField label="Source">
          <Select aria-label="Source" value={filters.source} onValue={setFilter('source')}>
            <option value="">All sources</option>
            <option value="meta">Meta</option>
            <option value="google">Google Ads</option>
            <option value="manual">Added</option>
            <option value="import">Imported</option>
          </Select>
        </FormField>
        {may.all && (
          <FormField label="Assigned to">
            <Select aria-label="Assigned to" value={filters.assignedTo} onValue={setFilter('assignedTo')}>
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              <option value="reassigned">Reassigned (handed over)</option>
              {assignees.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Status">
          <Select aria-label="Status" value={filters.statusId} onValue={setFilter('statusId')}>
            <option value="">Any status</option>
            <option value="none">Not started</option>
            {statuses.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Priority">
          <Select aria-label="Priority" value={filters.priority} onValue={setFilter('priority')}>
            {PRIORITY_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Scheduled">
          <Select aria-label="Scheduled" value={filters.schedule} onValue={setFilter('schedule')}>
            {SCHEDULE_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
          </Select>
        </FormField>
        {showMetaFilters && (
          <>
            <FormField label="Meta page">
              <Select aria-label="Meta page" value={filters.pageId} onValue={setFilter('pageId')}>
                <option value="">All pages</option>
                {metaPages.map((p) => <option key={p.pageId} value={p.pageId}>{p.pageName}</option>)}
              </Select>
            </FormField>
            <FormField label="Meta form">
              <Select aria-label="Meta form" value={filters.formId} onValue={setFilter('formId')} disabled={!metaForms.length && !filters.pageId}>
                <option value="">All forms</option>
                {metaForms.map((f) => <option key={f.formId} value={f.formId}>{f.formName}</option>)}
              </Select>
            </FormField>
          </>
        )}
      </LeadListFilterBar>

      {state.error && <Alert className="mb-4">{state.error}</Alert>}
      <Card className="overflow-hidden">
        {state.loading ? <LoadingBlock /> : !state.leads.length ? (
          <EmptyState icon={Users} title={hasFilters ? 'No leads match' : 'No leads yet'} description={hasFilters ? 'Try a different search or filter.' : 'Leads from Meta, Google Ads or your team will show here.'}>
            {hasFilters && <Button variant="ghost" onClick={clearFilters}>Clear filters</Button>}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Lead</Th>
                  <Th>Source</Th>
                  <Th>Address</Th>
                  <Th>Assigned to</Th>
                  <Th>Previously with</Th>
                  <Th>Status</Th>
                  <Th>Received</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {state.leads.map((l) => (
                  <Tr key={`${l.leadSource}-${l._id}`} className={cx('cursor-pointer', l.isPriority && 'bg-amber-50/50')} onClick={() => openLead(l)}>
                    <Td>
                      <div className="flex items-center gap-2">
                        {l.isPriority && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" aria-hidden />}
                        <div className="min-w-0">
                          <div className="max-w-[220px] truncate font-medium text-slate-900">{capName(l.fullName) || '—'}</div>
                          <div className="text-xs text-slate-500 tabular-nums">{l.phone || '—'}</div>
                        </div>
                      </div>
                    </Td>
                    <Td><Badge tone={SOURCE_TONE[l.leadSource] || 'slate'}>{l.sourceLabel}</Badge></Td>
                    <Td><div className="max-w-[200px] truncate text-slate-600" title={l.address}>{l.address || '—'}</div></Td>
                    <Td className="whitespace-nowrap text-slate-700">
                      {l.assignedTo?.name ? (
                        <>
                          <div>{l.assignedTo.name}</div>
                          {l.assignedAt && <div className="text-xs text-slate-500">{formatDate(l.assignedAt)}</div>}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      <ReassignedMark lead={l} />
                    </Td>
                    <Td><PreviousStaffCell lead={l} /></Td>
                    <Td><StatusCell status={l.currentStatus} scheduledAt={l.scheduledAt} rescheduledCount={l.rescheduledCount} previousSchedules={l.previousSchedules} /></Td>
                    <Td className="whitespace-nowrap text-slate-500">{formatDate(l.receivedAt || l.createdAt)}</Td>
                    <Td>
                      <div className="flex justify-end">
                        <Button size="sm" variant="ghost" icon={Eye} onClick={(e) => { e.stopPropagation(); openLead(l); }}>View</Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <TablePagination page={page} totalPages={state.totalPages} total={state.total} pageSize={PAGE_SIZE} onPageChange={setPage} className="border-t border-slate-100" />
          </>
        )}
      </Card>

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
            if (canAddClient) setModal({ type: 'convert', lead });
            else toast.success('Converted — ask someone who can add clients to add them as a client.');
          }}
        />
      )}
      {modal?.type === 'form' && modal.lead && (
        <LeadForm fields={fields} lead={modal.lead} onClose={() => setModal({ type: 'detail', lead: modal.lead })} onSaved={(saved) => { toast.success('Lead saved'); setModal({ type: 'detail', lead: saved }); }} />
      )}
      {modal?.type === 'convert' && (
        <ConvertToClient
          lead={{ source: 'manual', id: modal.lead._id, name: modal.lead.fullName, phone: modal.lead.phone, address: modal.lead.address, email: fields.filter((f) => f.type === 'email').map((f) => modal.lead.fields?.[f.key]).find(Boolean) }}
          onClose={() => setModal({ type: 'detail', lead: modal.lead })}
          onConverted={(link) => setModal({ type: 'detail', lead: { ...modal.lead, ...link } })}
        />
      )}
      {adding && <LeadForm fields={fields} onClose={() => setAdding(false)} onSaved={() => { toast.success('Lead added'); setAdding(false); setPage(1); load(); }} />}
      {quickAssign && <QuickAssign source="all" onClose={() => setQuickAssign(false)} onAssigned={() => { setQuickAssign(false); load(); }} />}
    </>
  );
}
