'use client';

// All leads from Meta, Google Ads and manual entry in one list.
import { Eye, Star, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { PRIORITY_FILTER_OPTIONS } from '@/components/admin/leads/PriorityToggle';
import ExportAllLeadsButton from '../admin/leads/ExportAllLeadsButton';
import LeadListFilterBar from './LeadListFilterBar';
import QuickAssign from './QuickAssign';
import { Alert, Badge, Button, Card, cx, EmptyState, FormField, LoadingBlock, PageHeader, Select, Table, TablePagination, Td, Th, Tr, formatDate } from '../kit';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { search: '', assignedTo: '', statusId: '', source: '', priority: '', fromDate: '', toDate: '', pageId: '', formId: '' };
const STATUS_TONE = { amber: 'amber', blue: 'blue', purple: 'violet', violet: 'violet', rose: 'red', red: 'red', emerald: 'green', green: 'green', slate: 'slate' };
const SOURCE_TONE = { meta: 'blue', google: 'amber', manual: 'slate', import: 'violet' };

const StatusBadge = ({ status }) => (status ? <Badge tone={STATUS_TONE[status.color] || 'slate'}>{status.name}</Badge> : <span className="text-[13px] text-slate-400">Not started</span>);

const VIEW_PATH = {
  meta: '/dashboard/leads/meta',
  google: '/dashboard/leads/google',
  manual: '/dashboard/leads/manual',
  import: '/dashboard/leads/manual',
};

export default function AllLeads() {
  const router = useRouter();
  const can = useCan();
  const may = { all: can('leads', 'view_all'), assign: can('leads', 'assign'), export: can('leads', 'export') };
  const statusesRes = useResource('/api/leads/statuses');
  const assigneesRes = useResource(may.all ? '/api/leads/assignees' : null);
  const metaFiltersRes = useResource(may.all ? '/api/leads/meta/filters' : null);
  const statuses = statusesRes.data || [];
  const assignees = assigneesRes.data || [];
  const metaPages = metaFiltersRes.data?.pages || [];

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const metaForms = useMemo(() => {
    const forms = metaFiltersRes.data?.forms || [];
    if (!filters.pageId) return forms;
    return forms.filter((f) => f.pageId === filters.pageId);
  }, [metaFiltersRes.data, filters.pageId]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ leads: [], total: 0, totalPages: 1, loading: true, error: '' });
  const [quickAssign, setQuickAssign] = useState(false);

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
  };

  const clearFilters = () => {
    setQuery('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const extraFilterCount = [
    filters.assignedTo,
    filters.statusId,
    filters.source,
    filters.priority,
    filters.fromDate,
    filters.toDate,
    showMetaFilters && filters.pageId,
    showMetaFilters && filters.formId,
  ].filter(Boolean).length;

  const hasFilters = Boolean(filters.search || extraFilterCount);

  const openLead = (lead) => {
    const base = VIEW_PATH[lead.leadSource] || '/dashboard/leads/manual';
    const q = lead.phone ? `?search=${encodeURIComponent(lead.phone)}` : '';
    router.push(`${base}${q}`);
  };

  return (
    <>
      <PageHeader title="Leads" description={may.all ? 'Every lead from Meta, Google Ads and your team — in one place.' : 'The leads given to you, from every source.'}>
        <div className="flex flex-wrap gap-2">
          {may.assign && <Button icon={Users} onClick={() => setQuickAssign(true)}>Assign by count</Button>}
          {may.export && <ExportAllLeadsButton />}
        </div>
      </PageHeader>

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
                          <div className="max-w-[220px] truncate font-medium text-slate-900">{l.fullName || '—'}</div>
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
                    </Td>
                    <Td><StatusBadge status={l.currentStatus} /></Td>
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

      {quickAssign && <QuickAssign source="all" onClose={() => setQuickAssign(false)} onAssigned={() => { setQuickAssign(false); load(); }} />}
    </>
  );
}
