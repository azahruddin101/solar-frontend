'use client';

// One staff member's page (/dashboard/team/<id>): who they are and everything on their plate — installation tasks,
// leads, AMC visits, expenses they recorded and what they did lately. Colours follow the dashboard's Staff tab
// (WORK in DashboardGraphs.js); every number links to the list it counts. Data: GET /api/agents/:id/overview.
import { ArrowLeft, ArrowRight, Clock, Mail, PenLine, Phone, ReceiptText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { assetUrl } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { describeLifecycleEvent } from '@/lib/lifecycleLog';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Avatar, Badge, Card, CardHeader, LoadingBlock, TablePagination, buttonClass, capName, cx, formatDate, timeAgo, usePagedItems } from '../kit';
import { CHIP_TONE, DonutChart, LineChart, SERIES_COLORS, WORK } from './DashboardGraphs';
import { designHref } from './shared';
import { useBreadcrumb } from '@/lib/breadcrumbs';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayWord = (d) => (d == null ? 'No date' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 0 ? `${plural(-d, 'day')} late` : `In ${d} days`);
/** "5 min ago" for recent times, "on 23 Sept 2026" for older ones. */
const since = (d) => { const t = timeAgo(d); return /ago|now/i.test(t) ? t.toLowerCase() : `on ${formatDate(d)}`; };
const PRIORITY = { urgent: ['Urgent', 'red'], high: ['High', 'amber'], medium: ['Medium', 'slate'], low: ['Low', 'slate'] };
const STATUS_DOT = { slate: '#94a3b8', blue: '#3b82f6', amber: '#f59e0b', emerald: '#10b981', rose: '#f43f5e', purple: '#a855f7', cyan: '#06b6d4' };

/** A headline figure tinted with its kind of work. */
function Stat({ work, label, value, note, href, tone }) {
  const g = WORK[work];
  const Icon = g?.icon || ReceiptText;
  return (
    <Link href={href} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-400">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-600"><span className={cx('grid h-7 w-7 place-items-center rounded-lg', g ? g.head : 'bg-slate-100 text-slate-600')}><Icon className="h-3.5 w-3.5" /></span>{label}</div>
      <div className={cx('mt-2.5 text-[26px] leading-none font-semibold tracking-tight tabular-nums', tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900')}>{value}</div>
      {note && <p className="mt-1.5 text-xs text-slate-500">{note}</p>}
    </Link>
  );
}

/** A card whose header wears the colour of its kind of work. */
function Section({ work, title, sub, href, linkLabel = 'See all', children, className }) {
  const g = WORK[work];
  const Icon = g?.icon;
  return (
    <Card className={cx('flex flex-col overflow-hidden', className)}>
      <div className={cx('flex items-start justify-between gap-3 px-5 py-3', g ? g.head : 'border-b border-slate-100')}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">{Icon && <Icon className="h-4 w-4" />}{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] opacity-80">{sub}</p>}
        </div>
        {href && <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline">{linkLabel} <ArrowRight className="h-4 w-4" /></Link>}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </Card>
  );
}

const Empty = ({ children }) => <p className="px-5 py-5 text-sm text-slate-500">{children}</p>;

/** A list shown `size` rows at a time, with Previous / Next under it once it is longer than one page. */
function PagedList({ items, size = 5, as: List = 'ul', className = 'divide-y divide-slate-100', children }) {
  const { rows, pager } = usePagedItems(items, size);
  const offset = (pager.page - 1) * size;
  return (
    <>
      <List className={className}>{rows.map((item, i) => children(item, offset + i))}</List>
      <TablePagination className="mt-auto px-5" {...pager} />
    </>
  );
}

export default function StaffDetail({ agentId }) {
  const currency = useSession((s) => s.company?.currency) || 'INR';
  const { data, loading, error } = useResource(`/api/agents/${agentId}/overview`);
  useBreadcrumb(capName(data?.profile?.name));
  if (loading) return <LoadingBlock />;
  if (error || !data) return <><Link href="/dashboard/team" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Staff</Link><Alert>{error || 'This staff member could not be found.'}</Alert></>;

  const { profile: p, tasks, leads, visits, expenses, activity } = data;
  const money = (v) => formatMoney(v, currency);
  const statuses = leads.byStatus.filter((s) => s.count > 0);
  // installation tasks and service visits only make sense for someone with a job role (or who has done that work before)
  const doesJobs = p.roles.length > 0 || tasks.open > 0 || tasks.doneTotal > 0 || visits.open > 0 || visits.done > 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 pb-10">
      <Link href="/dashboard/team" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Staff</Link>

      {/* who they are */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={p.name} src={p.photo ? assetUrl(p.photo) : undefined} size={72} zoom />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{p.name || p.email}</h1>
              <Badge tone={p.active ? 'green' : 'slate'} dot>{p.active ? 'Active' : 'Inactive · cannot sign in'}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.roles.length ? p.roles.map((r) => <span key={r} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{r}</span>) : <span className="text-sm text-slate-400">No job role set</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-600">
              {p.phone && <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1.5 hover:text-slate-900"><Phone className="h-4 w-4 text-slate-400" />{p.phone}</a>}
              {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 hover:text-slate-900"><Mail className="h-4 w-4 text-slate-400" />{p.email}</a>}
              <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-slate-400" />{p.lastLoginAt ? `Last signed in ${since(p.lastLoginAt)}` : 'Has not signed in yet'}</span>
              {p.createdAt && <span className="text-slate-500">Added {formatDate(p.createdAt)}</span>}
            </div>
            {p.staffRoles.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5" />Access:
                {p.staffRoles.map((r) => <span key={r.id} className="rounded-md bg-brand-soft px-2 py-0.5 font-medium text-brand-ink">{r.name}</span>)}
              </div>
            )}
          </div>
          <Link href={`/dashboard/team/${p.id}/edit`} className={buttonClass()}><PenLine className="h-4 w-4" />Edit details</Link>
        </div>
      </Card>

      {/* the numbers */}
      <div className={cx('grid gap-4 sm:grid-cols-2', doesJobs ? 'xl:grid-cols-5' : 'xl:grid-cols-2')}>
        {doesJobs && <Stat work="tasks" label="Open tasks" href="#tasks" value={tasks.open} tone={tasks.stuck ? 'warn' : undefined} note={`${tasks.inProgress} in progress · ${tasks.pending} waiting${tasks.stuck ? ` · ${tasks.stuck} stuck` : ''}`} />}
        {doesJobs && <Stat work="tasks" label="Tasks done (30 days)" href="#tasks" value={tasks.done30} note={tasks.avgHours == null ? `${tasks.doneTotal} done in total` : tasks.avgHours < 1 ? 'Under an hour per task' : `About ${tasks.avgHours} h per task`} />}
        <Stat work="leads" label="Leads given" href={`/dashboard/leads?assignedTo=${p.id}`} value={leads.total} tone={leads.notStarted ? 'warn' : undefined} note={`${leads.notStarted} not called · ${leads.converted} became clients${leads.handedOverCount ? ` · ${leads.handedOverCount} handed over` : ''}`} />
        {doesJobs && <Stat work="visits" label="Service visits" href={`/dashboard/amc?staff=${p.id}`} value={visits.open} tone={visits.late ? 'bad' : undefined} note={`${visits.late} late · ${visits.done} done`} />}
        <Stat label="Expenses recorded" href="#expenses" value={money(expenses.total)} note={`${plural(expenses.count, 'expense')} in the last 90 days`} />
      </div>

      {/* installation tasks (people with a job role) */}
      {doesJobs && <div id="tasks" className="grid scroll-mt-24 items-start gap-4 xl:grid-cols-[3fr_2fr]">
        <Section work="tasks" title="Open installation tasks" sub={tasks.open ? `${plural(tasks.open, 'task')} on ${plural(tasks.jobs, 'job')} · most urgent first` : 'Nothing waiting'} href="/dashboard/installations?status=active" linkLabel="Installations">
          {tasks.openList.length ? (
            <PagedList items={tasks.openList} size={6}>
              {(s) => {
                const { stuck } = s;
                return (
                  <li key={`${s.projectId}-${s.step}`}>
                    <Link href={`/dashboard/installations/${s.projectId}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{s.step}<span className="font-normal text-slate-500"> · {capName(s.client || s.project)}</span></span>
                        <span className="block truncate text-xs text-slate-500">{s.status === 'in_progress' ? `Started ${since(s.startedAt)}` : 'Not started yet'}{s.address ? ` · ${s.address}` : ''}</span>
                      </span>
                      {stuck && <Badge tone="amber">Stuck</Badge>}
                      <Badge tone={PRIORITY[s.priority]?.[1] || 'slate'}>{PRIORITY[s.priority]?.[0] || s.priority}</Badge>
                      <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', s.status === 'in_progress' ? WORK.tasks.chip : 'bg-slate-50 text-slate-600 ring-slate-200')}>{s.status === 'in_progress' ? 'In progress' : 'Waiting'}</span>
                    </Link>
                  </li>
                );
              }}
            </PagedList>
          ) : <Empty>No open tasks right now.</Empty>}
        </Section>
        <div className="flex flex-col gap-4">
          <LineChart title="Tasks finished each month" description={`Last 6 months · ${tasks.doneTotal} in total`} rows={tasks.monthly} series={[{ key: 'done', label: 'Finished', color: SERIES_COLORS[0] }]} empty="No task finished in the last 6 months." />
          <Section work="tasks" title="Recently finished">
            {tasks.doneList.length ? (
              <PagedList items={tasks.doneList} size={5}>
                {(s) => (
                  <li key={`${s.projectId}-${s.step}-${s.completedAt}`}>
                    <Link href={`/dashboard/installations/${s.projectId}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0 truncate text-sm text-slate-800">{s.step}<span className="text-slate-500"> · {capName(s.client || s.project)}</span></span>
                      <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', CHIP_TONE.good)}>{formatDate(s.completedAt)}</span>
                    </Link>
                  </li>
                )}
              </PagedList>
            ) : <Empty>Nothing finished yet.</Empty>}
          </Section>
        </div>
      </div>}

      {/* leads and service visits */}
      <div className={cx('grid gap-4', doesJobs && 'xl:grid-cols-2')}>
        <Section work="leads" title="Leads" sub={leads.total ? `${plural(leads.total, 'lead')} given to ${p.name.split(' ')[0]} · by status` : 'No leads given yet'} href={`/dashboard/leads?assignedTo=${p.id}`}>
          {leads.total ? (
            <>
              <div className="px-5 py-4"><DonutChart unit="leads" rows={statuses.map((s) => ({ key: s.id, label: s.name, value: s.count }))} /></div>
              <div className="border-t border-slate-100 px-5 pt-3 pb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Latest leads</div>
              <PagedList items={leads.recent} size={5}>
                {(l) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-900">{l.name || 'No name'}</span><span className="block truncate text-xs text-slate-500">{[l.phone, l.source, formatDate(l.at)].filter(Boolean).join(' · ')}</span></span>
                    {l.status ? <span className="inline-flex items-center gap-1.5 text-xs text-slate-700"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_DOT[l.status.color] || STATUS_DOT.slate }} />{l.status.name}</span> : <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', CHIP_TONE.warn)}>Not called</span>}
                  </li>
                )}
              </PagedList>
              {leads.handedOver?.length > 0 && (
                <>
                  <div className="border-t border-slate-100 px-5 pt-3 pb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Handed over to someone else</div>
                  <PagedList items={leads.handedOver} size={5}>
                    {(l) => (
                      <li key={`past-${l.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-900">{l.name || 'No name'}</span><span className="block truncate text-xs text-slate-500">{[l.phone, l.source, l.heldFrom ? `held ${formatDate(l.heldFrom)} – ${formatDate(l.heldUntil)}` : ''].filter(Boolean).join(' · ')}</span></span>
                        <span className="shrink-0 text-xs text-violet-700">now with {l.nowWith || 'nobody'}</span>
                      </li>
                    )}
                  </PagedList>
                  <Link href={`/dashboard/leads?assignedTo=${p.id}&includePast=1`} className="mx-5 my-3 block text-sm text-brand hover:underline">See every lead {p.name.split(' ')[0]} has ever held</Link>
                </>
              )}
              {leads.notStarted > 0 && <Link href={`/dashboard/leads?assignedTo=${p.id}&statusId=none`} className="mx-5 my-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:underline">{plural(leads.notStarted, 'lead')} not called yet. See them</Link>}
            </>
          ) : <Empty>Leads given to {p.name.split(' ')[0] || 'them'} will show here.</Empty>}
        </Section>

        {doesJobs && <Section work="visits" title="Service visits" sub={`${visits.open} open · ${visits.late} late · ${visits.done} done`} href={`/dashboard/amc?staff=${p.id}`}>
          {visits.openList.length ? (
            <PagedList items={visits.openList} size={5}>
              {(v) => (
                <li key={v.id}>
                  <Link href={v.projectId ? `/dashboard/amc?project=${v.projectId}` : `/dashboard/amc?staff=${p.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{capName(v.client || v.name)}</span><span className="block truncate text-xs text-slate-500">{v.name}{v.address ? ` · ${v.address}` : ''}</span></span>
                    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', v.daysLeft != null && v.daysLeft < 0 ? CHIP_TONE.bad : v.daysLeft === 0 ? CHIP_TONE.warn : WORK.visits.chip)}>{v.booked ? dayWord(v.daysLeft) : 'Not booked yet'}</span>
                  </Link>
                </li>
              )}
            </PagedList>
          ) : <Empty>No open service visits.</Empty>}
        </Section>}
      </div>

      {/* money and activity */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div id="expenses" className="scroll-mt-24">
          <Section title="Expenses recorded" sub={`Last 90 days · ${plural(expenses.count, 'expense')} · ${money(expenses.total)}`} href="/dashboard/expenses" linkLabel="Expenses">
            {expenses.recent.length ? (
              <PagedList items={expenses.recent} size={5}>
                {(e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{e.reason}</span><span className="block truncate text-xs text-slate-500">{[e.design?.name, formatDate(e.spentOn)].filter(Boolean).join(' · ')}</span></span>
                    <span className="shrink-0 font-semibold text-slate-900 tabular-nums">{money(e.amount)}</span>
                  </li>
                )}
              </PagedList>
            ) : <Empty>No expenses recorded in the last 90 days.</Empty>}
          </Section>
        </div>

        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="py-3" title="Recent activity" description={doesJobs ? 'What they did, and what happened on their tasks and leads · newest first' : 'What they did, and what happened on their leads · newest first'} />
          {activity.length ? (
            <PagedList items={activity} size={6} as="ol" className="relative mx-5 my-4 border-l border-slate-200">
              {(a, i) => {
                const line = describeLifecycleEvent(a);
                const href = a.href || (a.design ? designHref(a.design) : null);
                return (
                  <li key={`${a.at}-${i}`} className="mb-3 ml-4 last:mb-0">
                    <span className={cx('absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white', a.phase === 'installation' ? 'bg-sky-500' : a.phase === 'lead' ? 'bg-violet-500' : 'bg-slate-400')} />
                    <div className="text-sm text-slate-800">{line.text}</div>
                    <div className="text-xs text-slate-500">{href ? <Link href={href} className="hover:underline">{a.where}</Link> : a.where} · {timeAgo(a.at)}{a.byName && ` · by ${a.byName}`}</div>
                    {line.detail && <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{line.detail}</div>}
                  </li>
                );
              }}
            </PagedList>
          ) : <Empty>No recorded activity yet.</Empty>}
        </Card>
      </div>
    </div>
  );
}
