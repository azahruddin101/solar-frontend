'use client';

// Manual leads: added by hand on the company's own lead form, or imported from CSV / Excel. Same pipeline as Meta and
// Google leads — statuses, assignment, priority, own-vs-all visibility — and every control follows the Leads permissions.
import { CircleCheck, Download, Eye, FileSpreadsheet, Pencil, Plus, Star, Upload, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, downloadApiFile } from '@/lib/api';
import { leadValue, valueText } from '@/lib/leadForm';
import { isLeadStatusLocked, LEAD_CONVERTED_LOCK_HINT } from '@/lib/leads';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, cx, EmptyState, FormField, FormModal, Input, LoadingBlock, Modal, PageHeader, Select, Table, TablePagination, Td, Textarea, Th, Tr, formatDate, timeAgo, toast } from '../kit';
import { PRIORITY_FILTER_OPTIONS } from '@/components/admin/leads/PriorityToggle';
import ExportAllLeadsButton from '../admin/leads/ExportAllLeadsButton';
import LeadListFilterBar from './LeadListFilterBar';
import LeadFields from './LeadFields';
import LeadLog from './LeadLog';
import ConvertToClient from './ConvertToClient';
import QuickAssign from './QuickAssign';

const PAGE_SIZE = 20;
const STATUS_TONE = { amber: 'amber', blue: 'blue', purple: 'violet', violet: 'violet', rose: 'red', red: 'red', emerald: 'green', green: 'green', slate: 'slate' };
const StatusBadge = ({ status }) => (status ? <Badge tone={STATUS_TONE[status.color] || 'slate'}>{status.name}</Badge> : <span className="text-[13px] text-slate-400">Not started</span>);

/** The form's values for a lead, keyed by field key (what LeadFields edits). */
const valuesOf = (fields, lead) => Object.fromEntries(fields.map((f) => [f.key, leadValue(lead, f) ?? (f.type === 'multiselect' ? [] : '')]));

/** Add or edit one lead on the company's form; the API checks every value again and reports problems per field. */
function LeadForm({ fields, lead, onClose, onSaved }) {
  const [values, setValues] = useState(() => (lead ? valuesOf(fields, lead) : {}));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const missing = Object.fromEntries(fields.filter((f) => f.required && (values[f.key] === undefined || values[f.key] === '' || (Array.isArray(values[f.key]) && !values[f.key].length))).map((f) => [f.key, `${f.label} is required`]));
    if (Object.keys(missing).length) return setErrors(missing);
    setBusy(true);
    setErrors({});
    try {
      const saved = lead ? await api(`/api/leads/manual/${lead._id}`, { method: 'PUT', body: values }) : await api('/api/leads/manual', { method: 'POST', body: values });
      onSaved(saved);
    } catch (e) {
      setErrors(e.details?.errors || { _: e.message });
      if (!e.details?.errors) toast.error(e.message);
      setBusy(false);
    }
  };
  return (
    <FormModal open onClose={onClose} size="lg" title={lead ? `Edit ${lead.fullName}` : 'Add a lead'} description={lead ? undefined : 'Fill in what you know — required fields are marked.'} submitLabel={lead ? 'Save changes' : 'Add lead'} busy={busy} onSubmit={submit} noValidate>
      {errors._ && <Alert className="mb-2">{errors._}</Alert>}
      <LeadFields fields={fields} values={values} onChange={setValues} errors={errors} />
    </FormModal>
  );
}

/** Bulk add from a CSV / Excel sheet laid out like the template. */
function ImportLeads({ onClose, onDone }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api('/api/leads/manual/import', { method: 'POST', form });
      setResult(res);
      if (res.imported) onDone();
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Import leads"
      description="Add many leads at once from a CSV or Excel sheet."
      footer={result ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Upload} disabled={!file} loading={busy} onClick={upload}>Import</Button></>}
    >
      {!result ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">1. Download the template</div>
              <p className="mt-0.5 text-[13px] text-slate-500">It has one column per field of your lead form, and a second sheet explaining what to enter. Name and Phone are required on every row.</p>
              <Button size="sm" className="mt-2.5" icon={Download} onClick={() => downloadApiFile('/api/leads/manual/template', 'lead-import-template.xlsx').catch((e) => toast.error(e.message))}>Download template</Button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-900">2. Upload the filled sheet</div>
            <p className="mt-0.5 text-[13px] text-slate-500">CSV, XLSX or XLS, up to 5 MB and 5,000 leads. Leads whose phone number is already in your leads are skipped.</p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <Button size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>{file ? 'Choose another file' : 'Choose file'}</Button>
              {file && <span className="truncate text-[13px] text-slate-700">{file.name}</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[['Imported', result.imported, 'text-emerald-700'], ['Already in your leads', result.duplicates, 'text-slate-700'], ['Could not import', result.rejectedCount, result.rejectedCount ? 'text-red-700' : 'text-slate-700']].map(([label, n, tone]) => (
              <div key={label} className="rounded-lg border border-slate-200 p-3"><div className={cx('text-2xl font-semibold tabular-nums', tone)}>{n}</div><div className="text-xs text-slate-500">{label}</div></div>
            ))}
          </div>
          {result.ignoredColumns?.length > 0 && <Alert tone="warn">These columns don’t match a field of your lead form and were ignored: {result.ignoredColumns.join(', ')}.</Alert>}
          {result.rejected?.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-red-200">
              <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-800">Rows that need fixing{result.rejectedCount > result.rejected.length ? ` (first ${result.rejected.length} of ${result.rejectedCount})` : ''}</div>
              <ul className="max-h-60 divide-y divide-red-100 overflow-y-auto text-[13px]">
                {result.rejected.map((r) => <li key={r.row} className="flex gap-3 px-3 py-2"><span className="w-14 shrink-0 font-medium text-slate-700">Row {r.row}</span><span className="text-slate-600">{r.message}</span></li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** One lead: its answers, and what the user may do with it (edit, status, assign, priority). */
function LeadDetail({ fields, lead, statuses, assignees, may, onClose, onChanged, onEdit, onConverted }) {
  const [statusForm, setStatusForm] = useState({ statusId: lead.currentStatus?._id || '', remark: '' });
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
    const res = await run('status', () => api(`/api/leads/manual/${lead._id}/status`, { method: 'PUT', body: statusForm }), 'Status updated');
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
                    <Textarea rows={2} maxLength={1000} placeholder="Remark (optional)" value={statusForm.remark} onValue={(x) => setStatusForm({ ...statusForm, remark: x })} />
                    <Button size="sm" variant="primary" disabled={!statusForm.statusId} loading={busy === 'status'} onClick={saveStatus}>Update status</Button>
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
            lead.assignedTo && { at: lead.assignedAt, title: `Assigned to ${lead.assignedTo.name}` },
            lead.convertedClient && { at: lead.convertedAt, title: `Converted to client ${lead.convertedClientName}`, by: lead.convertedByName },
            ...(lead.statusHistory || []).map((h) => ({ at: h.changedAt, title: 'Status changed', status: { name: h.statusName, color: h.statusColor }, remark: h.remark, by: h.changedByName })),
          ]}
        />
      </div>
    </Modal>
  );
}

export default function ManualLeads() {
  const can = useCan();
  const canAddClient = can('clients', 'create');
  const may = { all: can('leads', 'view_all'), create: can('leads', 'create'), update: can('leads', 'update'), status: can('leads', 'change_status'), assign: can('leads', 'assign'), export: can('leads', 'export') };
  const form = useResource('/api/leads/form');
  const statusesRes = useResource('/api/leads/statuses');
  const assigneesRes = useResource(may.all || may.assign ? '/api/leads/assignees' : null);
  const fields = useMemo(() => form.data?.fields || [], [form.data]);
  const statuses = statusesRes.data || [];
  const assignees = assigneesRes.data || [];

  const EMPTY_FILTERS = { search: '', assignedTo: '', statusId: '', source: '', priority: '', fromDate: '', toDate: '' };
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ leads: [], total: 0, totalPages: 1, loading: true, error: '' });
  const [modal, setModal] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, search: query.trim() })); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filters.search) params.set('search', filters.search);
    if (filters.assignedTo) params.set('assignedTo', filters.assignedTo);
    if (filters.statusId) params.set('statusId', filters.statusId);
    if (filters.source) params.set('source', filters.source);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.fromDate) params.set('from', filters.fromDate);
    if (filters.toDate) params.set('to', filters.toDate);
    try {
      const res = await api(`/api/leads/manual?${params}`);
      setState({ leads: res.leads, total: res.total, totalPages: res.totalPages, loading: false, error: '' });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  const setFilter = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const clearFilters = () => { setQuery(''); setFilters(EMPTY_FILTERS); setPage(1); };
  const extraFilterCount = [filters.assignedTo, filters.statusId, filters.source, filters.priority, filters.fromDate, filters.toDate].filter(Boolean).length;
  const replaceLead = (lead) => {
    setState((s) => ({ ...s, leads: s.leads.map((l) => (l._id === lead._id ? lead : l)) }));
    setModal((m) => (m?.lead?._id === lead._id ? { ...m, lead } : m));
  };
  const togglePriority = async (lead) => {
    try {
      const res = await api(`/api/leads/manual/${lead._id}/priority`, { method: 'PUT', body: { isPriority: !lead.isPriority } });
      replaceLead({ ...lead, isPriority: res.isPriority });
    } catch (e) {
      toast.error(e.message);
    }
  };
  const extra = fields.filter((f) => !['name', 'phone', 'address'].includes(f.key)).slice(0, 2); // first two of the company's own fields, as columns
  const hasFilters = Boolean(filters.search || extraFilterCount);

  return (
    <>
      <PageHeader title="Manual leads" description={may.all ? 'Leads your team adds by hand or imports from Excel, on your company’s lead form.' : 'The manual leads given to you.'}>
        <div className="flex flex-wrap gap-2">
          {may.assign && <Button icon={Users} onClick={() => setModal({ type: 'quick-assign' })}>Assign by count</Button>}
          {may.export && <ExportAllLeadsButton />}
          {may.create && <Button icon={Upload} onClick={() => setModal({ type: 'import' })}>Import</Button>}
          {may.create && <Button variant="primary" icon={Plus} disabled={!fields.length} onClick={() => setModal({ type: 'form' })}>Add lead</Button>}
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
        <FormField label="Added or imported">
          <Select aria-label="Source" value={filters.source} onValue={setFilter('source')}>
            <option value="">All</option>
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
      </LeadListFilterBar>

      {state.error && <Alert className="mb-4">{state.error}</Alert>}
      <Card className="overflow-hidden">
        {state.loading || form.loading ? <LoadingBlock /> : !state.leads.length ? (
          <EmptyState icon={UserPlus} title={hasFilters ? 'No leads match' : 'No manual leads yet'} description={hasFilters ? 'Try a different search or filter.' : may.create ? 'Add a lead by hand, or import a list from Excel.' : 'Leads given to you will show here.'}>
            {!hasFilters && may.create && <div className="flex gap-2"><Button icon={Upload} onClick={() => setModal({ type: 'import' })}>Import</Button><Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Add lead</Button></div>}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Lead</Th>
                  <Th>Address</Th>
                  {extra.map((f) => <Th key={f.key}>{f.label}</Th>)}
                  <Th>Assigned to</Th>
                  <Th>Status</Th>
                  <Th>Added</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {state.leads.map((l) => (
                  <Tr key={l._id} className={cx('cursor-pointer', l.isPriority && 'bg-amber-50/50')} onClick={() => setModal({ type: 'detail', lead: l })}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={!may.update} onClick={(e) => { e.stopPropagation(); togglePriority(l); }} aria-label={l.isPriority ? 'Remove priority' : 'Mark as priority'} title={may.update ? (l.isPriority ? 'Remove priority' : 'Mark as priority') : undefined} className="shrink-0 rounded p-0.5 disabled:cursor-default">
                          <Star className={cx('h-4 w-4', l.isPriority ? 'fill-amber-400 text-amber-500' : 'text-slate-300')} />
                        </button>
                        <div className="min-w-0">
                          <div className="max-w-[220px] truncate font-medium text-slate-900">{l.fullName}</div>
                          <div className="text-xs text-slate-500 tabular-nums">{l.phone}</div>
                        </div>
                      </div>
                    </Td>
                    <Td><div className="max-w-[240px] truncate text-slate-600" title={l.address}>{l.address || '—'}</div></Td>
                    {extra.map((f) => <Td key={f.key}><div className="max-w-[180px] truncate text-slate-600">{valueText(f, l.fields?.[f.key]) || '—'}</div></Td>)}
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
                    <Td className="whitespace-nowrap text-slate-500"><div>{formatDate(l.createdAt)}</div><div className="text-xs">{l.source === 'import' ? 'Imported' : 'Added'}</div></Td>
                    <Td><div className="flex justify-end"><Button size="sm" variant="ghost" icon={Eye} onClick={(e) => { e.stopPropagation(); setModal({ type: 'detail', lead: l }); }}>View</Button></div></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <TablePagination page={page} totalPages={state.totalPages} total={state.total} pageSize={PAGE_SIZE} onPageChange={setPage} className="border-t border-slate-100" />
          </>
        )}
      </Card>

      {modal?.type === 'form' && (
        <LeadForm
          fields={fields}
          lead={modal.lead}
          onClose={() => setModal(modal.lead ? { type: 'detail', lead: modal.lead } : null)}
          onSaved={(saved) => {
            toast.success(modal.lead ? 'Lead saved' : 'Lead added');
            if (modal.lead) { replaceLead(saved); setModal({ type: 'detail', lead: saved }); } else { setModal(null); setPage(1); load(); }
          }}
        />
      )}
      {modal?.type === 'import' && <ImportLeads onClose={() => setModal(null)} onDone={() => { setPage(1); load(); }} />}
      {modal?.type === 'quick-assign' && <QuickAssign source="manual" onClose={() => setModal(null)} onAssigned={() => { setModal(null); load(); }} />}
      {modal?.type === 'detail' && (
        <LeadDetail
          fields={fields}
          lead={modal.lead}
          statuses={statuses}
          assignees={assignees}
          may={may}
          onClose={() => setModal(null)}
          onChanged={(lead) => { replaceLead(lead); if (!may.all) load(); }}
          onEdit={() => setModal({ type: 'form', lead: modal.lead })}
          onConverted={(lead) => {
            if (canAddClient) setModal({ type: 'convert', lead });
            else toast.success('Converted — ask someone who can add clients to add them as a client.');
          }}
        />
      )}
      {modal?.type === 'convert' && (
        <ConvertToClient
          lead={{ source: 'manual', id: modal.lead._id, name: modal.lead.fullName, phone: modal.lead.phone, address: modal.lead.address, email: fields.filter((f) => f.type === 'email').map((f) => modal.lead.fields?.[f.key]).find(Boolean) }}
          onClose={() => setModal({ type: 'detail', lead: modal.lead })}
          onConverted={(link) => {
            const lead = { ...modal.lead, ...link };
            replaceLead(lead);
            setModal({ type: 'detail', lead });
          }}
        />
      )}
    </>
  );
}
