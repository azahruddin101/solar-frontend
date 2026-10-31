'use client';

// Every AMC visit in one place. Mandatory AMCs are scheduled on every job after installation; optional ones come from a client
// request (or the company adding one). The company assigns staff, and staff complete the checklist here.
import { AlertTriangle, ArrowLeftRight, CalendarClock, CalendarDays, Check, CircleCheck, ExternalLink, History, Inbox, Plus, Receipt, Search, Settings2, UserCheck, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { viewInvoiceDocument } from '@/lib/billingDocuments';
import { Alert, Badge, Button, Card, EmptyState, FormField, Input, LoadingBlock, Modal, PageHeader, RichTextContent, Select, Table, Td, Textarea, Th, Tr, cx, formatDate, showError, toast, FilterNotice } from '../kit';
import AmcPartsInvoiceModal from './AmcPartsInvoiceModal';
import AmcVisitCreateModal from './AmcVisitCreateModal';

const SOON_DAYS = 7;

/** Where a visit is in the flow; drives the status badge and the summary tiles. */
function stageOf(v) {
  if (v.status === 'completed') return 'done';
  if (v.needsInstallation) return 'blocked';
  if (!v.assignee) return 'to_assign'; // every visit needs staff before it can be done
  if (v.daysLeft != null && v.daysLeft < 0) return 'overdue';
  if (v.daysLeft != null && v.daysLeft <= SOON_DAYS) return 'due_soon';
  return 'scheduled';
}

const STAGE = {
  done: { label: 'Completed', tone: 'green' },
  blocked: { label: 'Installation not started', tone: 'amber' },
  to_assign: { label: 'To assign', tone: 'amber' },
  overdue: { label: 'Overdue', tone: 'red' },
  due_soon: { label: 'Due soon', tone: 'amber' },
  scheduled: { label: 'Scheduled', tone: 'slate' },
};

function relativeDue(v) {
  if (v.status === 'completed') return v.completedAt ? `Done ${formatDate(v.completedAt)}` : 'Done';
  if (v.daysLeft == null) return 'No date yet';
  if (v.daysLeft === 0) return 'Today';
  if (v.daysLeft > 0) return `In ${v.daysLeft} day${v.daysLeft === 1 ? '' : 's'}`;
  const n = Math.abs(v.daysLeft);
  return `${n} day${n === 1 ? '' : 's'} overdue`;
}

const isOpen = (v) => v.status !== 'completed';
const dueThisWeek = (v) => isOpen(v) && v.booked && v.daysLeft != null && v.daysLeft >= 0 && v.daysLeft <= SOON_DAYS;
const overdue = (v) => isOpen(v) && v.booked && v.daysLeft != null && v.daysLeft < 0;
const dueToday = (v) => isOpen(v) && v.booked && v.daysLeft === 0;
/** Lists only reachable from a dashboard link (?view=), shown with a "Showing only" note instead of a tile. */
const LINKED_VIEWS = { today: 'visits due today', due: 'visits due today or late' };
const VIEW_IDS = ['open', 'to_assign', 'week', 'overdue', 'reassigned', 'done', ...Object.keys(LINKED_VIEWS)];

const LOG_LABEL = { amc_requested: 'Requested', amc_added: 'Added', amc_assigned: 'Assigned', amc_reassigned: 'Reassigned', amc_completed: 'Completed', amc_parts_invoiced: 'Parts invoiced' };

/** May this person mark the visit done? Once staff are assigned. */
function completable(v, canComplete) {
  if (!canComplete || !isOpen(v) || v.needsInstallation || !v.projectId) return false;
  return Boolean(v.assignee);
}

/** May parts used on this visit be invoiced? Once staff are on it, until it has been. */
function invoiceable(v, canInvoiceParts) {
  if (!canInvoiceParts || v.partsInvoice || v.needsInstallation || !v.projectId) return false;
  return Boolean(v.assignee);
}

function SummaryTile({ icon: Icon, label, value, hint, tone = 'slate', active, onClick }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-600',
    brand: 'bg-brand-soft text-brand',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex min-w-0 flex-col rounded-xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors',
        active ? 'border-brand ring-2 ring-brand-muted/60' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-slate-500">{label}</span>
        <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', tones[tone])}><Icon className="h-4 w-4" /></span>
      </span>
      <span className="mt-2 text-2xl leading-none font-semibold tracking-tight text-slate-900 tabular-nums">{value}</span>
      {hint && <span className="mt-1.5 truncate text-xs text-slate-500">{hint}</span>}
    </button>
  );
}

/** "Previously with": who held the visit before it was handed over, latest first, with their dates on hover. */
function PreviousStaffCell({ v }) {
  const past = [...(v.previousAssignees || [])].filter((p) => p.name).reverse(); // latest hand-over first
  if (!past.length) return <span className="text-slate-400">—</span>;
  const [latest, ...older] = past;
  const title = past.map((p) => `${p.name} · ${formatDate(p.assignedAt)} – ${formatDate(p.replacedAt)}`).join('\n');
  return (
    <div className="whitespace-nowrap text-slate-700" title={title}>
      <div>{latest.name}</div>
      <div className="text-xs text-slate-500">until {formatDate(latest.replacedAt)}{older.length ? ` · +${older.length} earlier` : ''}</div>
    </div>
  );
}

/** "Reassigned ×2" with the earlier people on hover. */
function ReassignedBadge({ v }) {
  const before = (v.previousAssignees || []).map((p) => p.name).filter(Boolean).join(', ');
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-violet-700" title={before ? `Before: ${before}` : undefined}>
      <ArrowLeftRight className="h-3 w-3" />Reassigned{v.reassignedCount > 1 ? ` ×${v.reassignedCount}` : ''}
    </span>
  );
}

function TypeBadges({ v, money }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {v.free ? <Badge tone="green">Free</Badge> : <Badge tone="brand">{v.price > 0 ? money(v.price) : 'Paid'}</Badge>}
      <span className="text-xs text-slate-500">{v.kind === 'optional' ? 'Optional' : 'Mandatory'}</span>
    </span>
  );
}

/** Details, client note and the checklist; staff tick every item to complete the visit. */
function VisitModal({ visit, money, canComplete, canInvoiceParts, completeBase, installationsPath, onClose, onCompleted, onInvoiceParts }) {
  const company = useSession((s) => s.company);
  const [criteria, setCriteria] = useState(() => (visit.criteria || []).map((c) => ({ ...c })));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = completable(visit, canComplete);
  const stage = STAGE[stageOf(visit)];
  const remaining = criteria.filter((c) => !c.checked).length;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`${completeBase}/${visit.projectId}/amc/${visit.id}`, {
        method: 'PUT',
        body: { note, criteria: criteria.map((c) => ({ id: c.id, checked: c.checked, note: c.note || '' })) },
      });
      toast.success(`${visit.name} completed`);
      onCompleted();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  /** The archived parts invoice, or a fresh PDF of it when no copy was archived. */
  const viewPartsInvoice = async () => {
    try {
      const res = await api(`${completeBase}/${visit.projectId}/amc/${visit.id}/invoice`);
      await viewInvoiceDocument({ invoice: res.invoice, pdfName: res.invoice.pdfName, company, client: res.client, currency: company?.currency || 'INR' });
    } catch (e) {
      showError(e, 'The invoice could not be opened');
    }
  };

  const facts = [
    ['Client', visit.client?.name || '—', visit.client?.phone],
    ['Site', visit.design?.name || '—', visit.design?.address],
    ['Due', visit.dueDate ? formatDate(visit.dueDate) : 'No date yet', relativeDue(visit)],
    ['Staff', visit.assignee?.name || (visit.free ? 'Not assigned (optional)' : 'Not assigned'), visit.reassigned ? `Reassigned ${visit.reassignedCount}× — before: ${visit.previousAssignees.map((p) => p.name).join(', ')}` : null],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={visit.name}
      description={visit.kind === 'optional' ? 'Optional visit — requested by the client, or added by the company' : 'Mandatory visit — scheduled after installation'}
      footer={(
        <>
          {visit.projectId && (
            <Link href={`${installationsPath}/${visit.projectId}`} className="mr-auto inline-flex items-center gap-1 self-center text-sm font-medium text-brand hover:underline">
              Open installation <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          {invoiceable(visit, canInvoiceParts) && <Button icon={Receipt} onClick={() => onInvoiceParts(visit)}>Invoice parts</Button>}
          <Button onClick={onClose}>{editable ? 'Cancel' : 'Close'}</Button>
          {editable && (
            <Button variant="primary" icon={Check} loading={busy} disabled={busy || remaining > 0} onClick={submit}>
              {remaining > 0 ? `${remaining} item${remaining === 1 ? '' : 's'} left` : 'Mark completed'}
            </Button>
          )}
        </>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={stage.tone}>{stage.label}</Badge>
        <TypeBadges v={visit} money={money} />
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 rounded-xl bg-slate-50 px-4 py-3.5 sm:grid-cols-2">
        {facts.map(([label, value, sub]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-slate-900">{value}</dd>
            {sub && <dd className="truncate text-xs text-slate-500">{sub}</dd>}
          </div>
        ))}
      </dl>

      {visit.requestNote && (
        <div className="mt-4 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Client note</span>
          <p className="mt-0.5">{visit.requestNote}</p>
        </div>
      )}
      {visit.description && <RichTextContent html={visit.description} className="mt-4 text-sm" />}

      {visit.needsInstallation && <Alert tone="warn" className="mt-4">This visit was requested before the installation started. Start the installation to assign staff.</Alert>}
      {!visit.assignee && isOpen(visit) && !visit.needsInstallation && (
        <Alert tone="info" className="mt-4">Assign staff to this visit — they mark it completed after doing the checklist.</Alert>
      )}

      {criteria.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-slate-900">Checklist</p>
          <ul className="space-y-2">
            {criteria.map((c, i) => (
              <li key={c.id} className={cx('rounded-lg border px-3 py-2.5', c.checked ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200')}>
                <label className={cx('flex items-start gap-2.5', editable && 'cursor-pointer')}>
                  <input
                    type="checkbox"
                    checked={Boolean(c.checked)}
                    disabled={!editable}
                    onChange={(e) => setCriteria((list) => list.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-slate-800">{c.label}</span>
                </label>
                {editable && c.checked && (
                  <Input className="mt-2 ml-6.5 w-[calc(100%-1.625rem)]" maxLength={300} value={c.note || ''} onValue={(val) => setCriteria((list) => list.map((x, j) => (j === i ? { ...x, note: val } : x)))} placeholder="Note (optional)" />
                )}
                {!editable && c.note && <p className="mt-1 pl-6.5 text-xs text-slate-500">{c.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {editable && (
        <FormField label="Overall note" optional className="mt-4">
          <Textarea rows={2} maxLength={1000} value={note} onValue={setNote} placeholder="Summary for the client and activity log" />
        </FormField>
      )}
      {(visit.parts?.length > 0 || visit.partsInvoice) && (
        <div className="mt-5 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
            <span className="text-sm font-semibold text-slate-900">Parts used</span>
            {visit.partsInvoice && (
              <button type="button" onClick={viewPartsInvoice} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"><Receipt className="h-3.5 w-3.5" /> Invoice {visit.partsInvoice.invoiceNo}</button>
            )}
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {(visit.parts || []).map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-2">
                <span className="min-w-0 truncate text-slate-800">{p.productName}</span>
                <span className="shrink-0 text-slate-500 tabular-nums">{p.qty} {p.unit} × {money(p.rate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {visit.status === 'completed' && (
        <p className="mt-4 flex items-start gap-1.5 text-sm text-slate-600">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          Completed {formatDate(visit.completedAt)}{visit.completedByName ? ` by ${visit.completedByName}` : ''}{visit.completionNote ? ` — ${visit.completionNote}` : ''}
        </p>
      )}
      {visit.logs?.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-slate-900"><History className="h-4 w-4 text-slate-500" />Activity</div>
          <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {visit.logs.map((l) => (
              <li key={l.id} className="flex items-start gap-3 px-3.5 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-900">{LOG_LABEL[l.action] || l.action}</span>
                  {l.message && <span className="text-slate-600"> · {l.message}</span>}
                </span>
                <span className="shrink-0 text-right text-xs text-slate-500">{formatDate(l.at)}{l.byName ? <><br />{l.byName}</> : null}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {error && <Alert className="mt-4">{error}</Alert>}
    </Modal>
  );
}

/**
 * `apiPath`: the visits list. `completeBase`: `/api/projects` or `/api/my/projects`.
 * `canAssign` shows the staff picker; `canComplete` lets this person tick the checklist.
 */
export default function AmcBoard({
  title = 'MNRE AMC Guideline Schedule',
  description,
  apiPath = '/api/projects/amc-visits',
  completeBase = '/api/projects',
  installationsPath = '/dashboard/installations',
  settingsPath = null,
  canAssign = false,
  canComplete = false,
  canInvoiceParts = false,
  headerExtra = null,
}) {
  const currency = useSession((s) => s.company?.currency) || 'INR';
  const money = (v) => formatMoney(v, currency, { decimals: 2 });
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data, loading, error, reload } = useResource(apiPath);
  const { data: staff } = useResource(canAssign ? '/api/projects/assignees' : null);

  const [view, setView] = useState(() => (VIEW_IDS.includes(params.get('view')) ? params.get('view') : 'open')); // ?view= from a dashboard link
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [amcName, setAmcName] = useState('all');
  const [staffFilter, setStaffFilter] = useState(() => (/^[a-f0-9]{24}$/.test(params.get('staff') || '') ? params.get('staff') : 'all')); // ?staff= from the dashboard's Staff tab
  const [projectFilter, setProjectFilter] = useState(() => params.get('project') || '');
  const [openId, setOpenId] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [adding, setAdding] = useState(false); // the "Add visit" dialog
  const [partsFor, setPartsFor] = useState(null); // the visit whose parts are being invoiced
  const all = useMemo(() => data?.items || [], [data]);
  // the company's AMC schedule plus any name already on a visit (e.g. one since renamed), so new AMCs are filterable at once
  const amcNames = useMemo(() => [...new Set([...(data?.amcNames || []), ...all.map((v) => v.name)])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [data, all]);
  const amcTemplates = useMemo(() => data?.amcTemplates || [], [data]);
  const counts = useMemo(() => ({
    open: all.filter(isOpen).length,
    toAssign: all.filter((v) => ['to_assign', 'blocked'].includes(stageOf(v))).length,
    week: all.filter(dueThisWeek).length,
    overdue: all.filter(overdue).length,
    reassigned: all.filter((v) => v.reassigned).length,
    done: all.filter((v) => !isOpen(v)).length,
  }), [all]);

  const projectLabel = projectFilter ? all.find((v) => v.projectId === projectFilter)?.design?.name || 'this installation' : '';

  const rows = useMemo(() => {
    const byView = {
      open: isOpen,
      to_assign: (v) => ['to_assign', 'blocked'].includes(stageOf(v)),
      week: dueThisWeek,
      overdue,
      reassigned: (v) => v.reassigned, // handed from one person to another at least once
      done: (v) => !isOpen(v),
      today: dueToday,
      due: (v) => dueToday(v) || overdue(v),
    }[view] || (() => true);
    const q = query.trim().toLowerCase();
    return all.filter((v) => {
      if (!byView(v)) return false;
      if (projectFilter && v.projectId !== projectFilter) return false;
      if (amcName !== 'all' && v.name !== amcName) return false;
      if (type === 'free' && !v.free) return false;
      if (type === 'paid' && v.free) return false;
      if (staffFilter === 'none' && v.assignee) return false;
      if (staffFilter !== 'all' && staffFilter !== 'none' && v.assignee?.id !== staffFilter) return false;
      if (!q) return true;
      return [v.name, v.client?.name, v.client?.phone, v.design?.name, v.design?.address, v.assignee?.name].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [all, view, query, type, amcName, staffFilter, projectFilter]);

  const assign = async (v, assigneeId) => {
    if (!assigneeId) return;
    setAssigning(v.id);
    try {
      await api(`/api/projects/${v.projectId}/amc/${v.id}/assign`, { method: 'PUT', body: { assigneeId } });
      toast.success(`${v.name} assigned`);
      await reload();
    } catch (e) {
      toast.error(e.message);
    }
    setAssigning(null);
  };

  const activeStaff = (staff || []).filter((s) => s.active);
  const openVisit = all.find((v) => v.id === openId);
  const filtered = Boolean(query.trim() || type !== 'all' || amcName !== 'all' || staffFilter !== 'all' || projectFilter);

  const tiles = [
    { id: 'open', icon: CalendarClock, label: 'Open visits', value: counts.open, tone: 'brand' },
    canAssign && { id: 'to_assign', icon: UserCheck, label: 'To assign', value: counts.toAssign, tone: counts.toAssign ? 'amber' : 'slate', hint: 'Visits waiting for staff' },
    { id: 'week', icon: CalendarDays, label: 'Due this week', value: counts.week, tone: counts.week ? 'amber' : 'slate', hint: `Next ${SOON_DAYS} days` },
    { id: 'overdue', icon: AlertTriangle, label: 'Overdue', value: counts.overdue, tone: counts.overdue ? 'red' : 'slate' },
    canAssign && { id: 'reassigned', icon: ArrowLeftRight, label: 'Reassigned', value: counts.reassigned, tone: counts.reassigned ? 'violet' : 'slate', hint: 'Handed to someone else' },
    { id: 'done', icon: CircleCheck, label: 'Completed', value: counts.done, tone: 'green' },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={title}
        description={description || 'Mandatory visits are scheduled after installation; optional ones come from a client request or from you. Assign staff to each visit — they mark it completed after the checklist.'}
      >
        {headerExtra}
        {canAssign && amcTemplates.length > 0 && <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add visit</Button>}
        {settingsPath && (
          <Link href={settingsPath} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
            <Settings2 className="h-4 w-4" /> AMC schedule
          </Link>
        )}
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      {LINKED_VIEWS[view] && <FilterNotice className="mb-4" label={LINKED_VIEWS[view]} count={loading ? null : `${rows.length} visit${rows.length === 1 ? '' : 's'}`} onClear={() => { setView('open'); router.replace(pathname); }} />}

      <div className={cx('mb-5 grid grid-cols-2 gap-3', tiles.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        {tiles.map((t) => <SummaryTile key={t.id} {...t} active={view === t.id} onClick={() => setView(t.id)} />)}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3.5 lg:px-6">
          <div className="relative min-w-[12rem] flex-1 basis-[220px]">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input aria-label="Search AMC visits" placeholder="Search visit, client, site or staff" value={query} onValue={setQuery} className="pl-9" />
          </div>
          <Select aria-label="AMC name" value={amcName} onValue={setAmcName} className="w-40 shrink-0">
            <option value="all">All AMCs</option>
            {amcNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
          <Select aria-label="Visit type" value={type} onValue={setType} className="w-36 shrink-0">
            <option value="all">Free & paid</option>
            <option value="free">Free only</option>
            <option value="paid">Paid only</option>
          </Select>
          {canAssign && (
            <Select aria-label="Staff" value={staffFilter} onValue={setStaffFilter} className="w-44 shrink-0">
              <option value="all">All staff</option>
              <option value="none">Unassigned</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          {projectFilter && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pr-1 pl-3 text-xs font-medium text-brand-ink">
              {projectLabel}
              <button type="button" aria-label="Show all installations" onClick={() => setProjectFilter('')} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/60"><X className="h-3.5 w-3.5" /></button>
            </span>
          )}
          <span className="ml-auto text-sm text-slate-500 tabular-nums">{rows.length} shown</span>
        </div>

        {loading ? (
          <LoadingBlock />
        ) : !rows.length ? (
          <EmptyState
            icon={Inbox}
            title={filtered ? 'No visits match' : view === 'open' ? 'No open AMC visits' : 'Nothing here'}
            description={filtered
              ? 'Try a different search or filter.'
              : all.length ? 'Pick another tile above to see other visits.' : 'Visits appear when an installation is completed (free visits) or a client books a paid visit.'}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Visit</Th>
                <Th>Client & site</Th>
                <Th>Due</Th>
                <Th>Staff</Th>
                <Th>Previously with</Th>
                <Th>Status</Th>
                <Th className="text-right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const stage = stageOf(v);
                const st = STAGE[stage];
                const pickable = canAssign && isOpen(v) && v.projectId;
                return (
                  <Tr key={v.id} className="cursor-pointer" onClick={() => setOpenId(v.id)}>
                    <Td>
                      <div className="font-medium text-slate-900">{v.name}</div>
                      <div className="mt-1"><TypeBadges v={v} money={money} /></div>
                    </Td>
                    <Td>
                      <div className="text-slate-900">{v.client?.name || '—'}</div>
                      <div className="max-w-[16rem] truncate text-xs text-slate-500">{[v.design?.name, v.design?.address].filter(Boolean).join(' · ')}</div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="tabular-nums text-slate-900">{v.dueDate ? formatDate(v.dueDate) : '—'}</div>
                      <div className={cx('text-xs', stage === 'overdue' ? 'font-medium text-red-600' : 'text-slate-500')}>
                        {relativeDue(v)}{v.kind === 'optional' && v.clientRequestedDate && isOpen(v) ? ' · requested date' : ''}
                      </div>
                    </Td>
                    <Td className="min-w-[11rem]">
                      {pickable ? (
                        <div onClick={(e) => e.stopPropagation()}>
                        <Select
                          aria-label={`Staff for ${v.name}`}
                          value={v.assignee?.id || ''}
                          disabled={assigning === v.id}
                          onValue={(id) => assign(v, id)}
                          className={cx('w-full', !v.assignee && 'border-amber-300')}
                        >
                          <option value="">Assign staff…</option>
                          {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-700">{v.assignee?.name || '—'}</span>
                      )}
                      {v.reassigned && <ReassignedBadge v={v} />}
                    </Td>
                    <Td><PreviousStaffCell v={v} /></Td>
                    <Td><Badge tone={st.tone} dot>{st.label}</Badge></Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button size="sm" variant={completable(v, canComplete) ? 'primary' : 'secondary'} onClick={(e) => { e.stopPropagation(); setOpenId(v.id); }}>
                        {completable(v, canComplete) ? 'Complete' : 'View'}
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {openVisit && (
        <VisitModal
          key={openVisit.id}
          visit={openVisit}
          money={money}
          canComplete={canComplete}
          canInvoiceParts={canInvoiceParts}
          completeBase={completeBase}
          installationsPath={installationsPath}
          onClose={() => setOpenId(null)}
          onCompleted={() => { setOpenId(null); reload(); }}
          onInvoiceParts={(v) => { setOpenId(null); setPartsFor(v); }}
        />
      )}
      {adding && <AmcVisitCreateModal amcs={amcTemplates} staff={activeStaff} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); reload(); }} />}
      {partsFor && (
        <AmcPartsInvoiceModal
          visit={partsFor}
          base={completeBase}
          currency={currency}
          onClose={() => { setPartsFor(null); setOpenId(partsFor.id); }}
          onDone={() => { setPartsFor(null); reload(); }}
        />
      )}
    </>
  );
}
