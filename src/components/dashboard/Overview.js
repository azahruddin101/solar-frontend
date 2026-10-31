'use client';

// The company's main dashboard: today's to-do list on top, then one tab each for Money, Sales, Leads, Installations and
// Inventory (?tab=…). Every chart writes its numbers beside it and every item links to the page where it is acted on.
// Figures come from /api/dashboard (money, pipeline, monthly payments, queues), /api/dashboard/today (to-dos, who owes,
// leads, installations, stock, monthly series) and /api/agents/analytics (team workload).
// The previous dashboard is kept in OverviewClassic.js (switch in app/dashboard/page.js, always at /dashboard/classic).
import { BadgeIndianRupee, ArrowRight, Boxes, CalendarClock, Check, Clock, FileText, HandCoins, HardHat, Headset, History, Hourglass, IndianRupee, Landmark, Leaf, Megaphone, MessageSquare, Package, PackageX, Plus, ReceiptText, ShieldCheck, Sun, Target, UserPlus, Users, Wallet, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { assetUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Avatar, Button, Card, CardHeader, LoadingBlock, TablePagination, buttonClass, capName, cx, formatDate, timeAgo, usePagedItems } from '../kit';
import { PipelineChart, compactMoney } from './DashboardCharts';
import { BarList, CHIP_TONE, Chip, ColumnChart, DonutChart, LineChart, SERIES_COLORS, Sparkline, WORK } from './DashboardGraphs';
import { DesignStatusBadge, NewDesignModal, designHref } from './shared';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayWord = (d) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 0 ? `${plural(-d, 'day')} late` : `In ${d} days`);
const pctOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
/** Dot colours for the lead statuses' own colour names (MetaLeadStatus.color). */
const STATUS_DOT = { slate: '#94a3b8', blue: '#3b82f6', amber: '#f59e0b', emerald: '#10b981', rose: '#f43f5e', purple: '#a855f7', cyan: '#06b6d4' };
/** The pipeline donut in status colours: still being written, waiting on the client, booked, lost. */
const PIPELINE_FILLS = { draft: '#cbd5e1', proposed: '#f59e0b', reproposed: '#8b5cf6', negotiation: '#0ea5e9', won: '#16a34a', lost: '#dc2626' };
const OPEN_STAGES = ['proposed', 'reproposed', 'negotiation']; // quotes still waiting on the client
const PAYMENT_MODES = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank transfer', cheque: 'Cheque', card: 'Card', other: 'Other' };
const LEAD_SERIES = [
  { key: 'meta', label: 'Facebook / Instagram', color: SERIES_COLORS[0] },
  { key: 'google', label: 'Google Ads', color: SERIES_COLORS[1] },
  { key: 'manual', label: 'Added by your team', color: SERIES_COLORS[2] },
];

/** The dashboard's tabs; `alert` is the count shown on the tab when something there needs attention. */
const TABS = [
  { id: 'money', label: 'Money', icon: HandCoins, alert: () => 0 },
  { id: 'sales', label: 'Sales', icon: FileText, alert: (d, t) => t.proposals.changes + t.expiring.count },
  { id: 'leads', label: 'Leads', icon: Megaphone, alert: (d, t) => t.leads.unassigned },
  { id: 'installations', label: 'Installations', icon: HardHat, alert: (d, t) => t.installations.stuckCount + t.amc.overdue + t.amc.dueToday },
  { id: 'inventory', label: 'Inventory', icon: Package, alert: (d, t) => t.stock.low + t.stock.outOfStock },
  { id: 'staff', label: 'Staff', icon: Users, alert: (d, t) => t.staff.members.reduce((a, m) => a + m.visits.late, 0) },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The to-do list: one line per thing that needs doing, most urgent first. */
function todoItems(t) {
  const items = [
    { n: t.amc.overdue, urgent: true, icon: CalendarClock, text: (n) => `${plural(n, 'service visit')} ${n === 1 ? 'is' : 'are'} late`, href: '/dashboard/amc?view=overdue' },
    { n: t.amc.dueToday, icon: CalendarClock, text: (n) => `${plural(n, 'service visit')} due today`, href: '/dashboard/amc?view=today' },
    { n: t.proposals.changes, urgent: true, icon: MessageSquare, text: (n) => `${plural(n, 'client')} asked for changes to the quote`, href: '/dashboard/designs?show=changes' },
    { n: t.installations.stuckCount, urgent: true, icon: Clock, text: (n) => `${plural(n, 'installation task')} stuck for over a week`, href: '/dashboard/installations?show=stuck' },
    { n: t.support.unread, urgent: true, icon: Headset, text: (n) => `${plural(n, 'client message')} waiting for your reply`, href: '/dashboard/client-support?show=unread' },
    { n: t.leads.unassigned, icon: UserPlus, text: (n) => `${plural(n, 'new lead')} not given to anyone`, href: '/dashboard/leads?assignedTo=unassigned' },
    { n: t.expiring.count, icon: Hourglass, text: (n) => `${plural(n, 'quote')} will expire this week`, href: '/dashboard/designs?show=expiring' },
    { n: t.proposals.noReply, icon: FileText, text: (n) => `${plural(n, 'quote')} with no reply for a week`, href: '/dashboard/designs?show=no_reply' },
    { n: t.installations.notStarted, icon: HardHat, text: (n) => `${plural(n, 'booked job')} not started yet`, href: '/dashboard/designs?show=not_started' },
    { n: t.installations.unassignedSteps, icon: HardHat, text: (n) => `${plural(n, 'installation task')} with nobody assigned`, href: '/dashboard/installations?show=unassigned' },
    { n: t.proposals.noInvoice, icon: ReceiptText, text: (n) => `${plural(n, 'booked job')} without an invoice`, href: '/dashboard/billing?show=no_invoice' },
    { n: t.subsidies.missing, icon: BadgeIndianRupee, text: (n) => `${plural(n, 'booked job')} with a subsidy that is not started`, href: '/dashboard/designs?show=subsidy_missing' },
    { n: t.loans.missing, icon: Landmark, text: (n) => `${plural(n, 'client')} need${n === 1 ? 's' : ''} a loan that is not started`, href: '/dashboard/designs?show=loan_missing' },
    { n: t.stock.outOfStock, icon: PackageX, text: (n) => `${plural(n, 'product')} out of stock`, href: '/dashboard/catalog?show=out' },
    { n: t.stock.low, icon: Package, text: (n) => `${plural(n, 'product')} running low on stock`, href: '/dashboard/catalog?show=low' },
  ];
  return items.filter((i) => i.n > 0).sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));
}

function TodoTile({ n, urgent, icon: Icon, text, href }) {
  return (
    <Link href={href} className={cx('group flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors', urgent ? 'border-red-200 hover:border-red-400' : 'border-amber-200 hover:border-amber-400')}>
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full', urgent ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600')}><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1 text-sm leading-snug text-slate-800">{text(n)}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-900" />
    </Link>
  );
}

/** A headline figure, one line under it, and an optional trend line or meter. */
function StatTile({ label, value, note, icon: Icon, href, tone, children }) {
  return (
    <Link href={href} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-400">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-600"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand"><Icon className="h-3.5 w-3.5" /></span>{label}</div>
      <div className={cx('mt-2.5 text-[26px] leading-none font-semibold tracking-tight tabular-nums', tone === 'warn' ? 'text-amber-700' : tone === 'bad' ? 'text-red-700' : 'text-slate-900')}>{value}</div>
      {note && <p className={cx('mt-1.5 text-xs', tone === 'good' ? 'text-emerald-700' : 'text-slate-500')}>{note}</p>}
      {children && <div className="mt-auto pt-2">{children}</div>}
    </Link>
  );
}

const Stats = ({ children }) => <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;

const SeeAll = ({ href }) => <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline">See all <ArrowRight className="h-4 w-4" /></Link>;

/** A titled card with a short list; `href` adds "See all", `empty` shows when there is nothing. */
function ListCard({ title, sub, href, empty, children, className }) {
  const rows = [children].flat(Infinity).filter(Boolean);
  return (
    <Card className={cx('flex flex-col', className)}>
      <CardHeader className="py-3" title={title} description={sub} action={href && <SeeAll href={href} />} />
      {rows.length ? <ul className="divide-y divide-slate-100">{rows}</ul> : <p className="flex items-center gap-2 px-5 py-5 text-sm text-slate-500"><Check className="h-4 w-4 text-emerald-600" />{empty}</p>}
    </Card>
  );
}

const Row = ({ href, title, sub, right, rightSub, rightTone }) => (
  <li><Link href={href} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
    <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{capName(title)}</span>{sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}</span>
    <span className="shrink-0 text-right"><span className={cx('block text-sm font-semibold tabular-nums', rightTone === 'bad' ? 'text-red-700' : rightTone === 'warn' ? 'text-amber-700' : 'text-slate-900')}>{right}</span>{rightSub && <span className="block text-xs text-slate-500">{rightSub}</span>}</span>
  </Link></li>
);

/** A card with a header and free content (bars, figures). */
function Panel({ title, sub, href, children, className }) {
  return (
    <Card className={cx('flex flex-col', className)}>
      <CardHeader className="py-3" title={title} description={sub} action={href && <SeeAll href={href} />} />
      <div className="flex flex-1 flex-col px-5 py-4">{children}</div>
    </Card>
  );
}

const Note = ({ children, tone }) => <p className={cx('mt-3 rounded-lg px-3 py-2 text-sm', tone === 'bad' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600')}>{children}</p>;

function Figure({ value, label }) {
  return <div><div className="text-xl font-semibold text-slate-900 tabular-nums">{value}</div><div className="text-xs text-slate-500">{label}</div></div>;
}

export default function Overview() {
  const { company, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const dash = useResource('/api/dashboard');
  const todayRes = useResource('/api/dashboard/today');
  const team = useResource('/api/agents/analytics');
  const clientsResource = useResource('/api/clients?limit=500');
  const clients = clientsResource.data?.items;
  const catalog = useResource('/api/catalog');
  const [creating, setCreating] = useState(false);
  const cur = company.currency;
  const money = (v) => compactMoney(v, cur);
  const d = dash.data;
  const t = todayRes.data;
  const tab = TABS.find((x) => x.id === params.get('tab'))?.id || 'money';

  const setup = [
    { done: Boolean(company.logo), label: 'Upload your logo', href: '/dashboard/settings?tab=branding' },
    { done: Boolean(company.signature), label: 'Add your e-signature', href: '/dashboard/settings?tab=branding' },
    { done: Boolean(company.phone && company.address), label: 'Complete your company profile', href: '/dashboard/settings' },
    { done: (catalog.data?.panels.length || 0) > 0, label: 'Add the solar panels you sell', href: '/dashboard/catalog' },
    { done: (clients?.length || 0) > 0, label: 'Add your first client', href: '/dashboard/clients?new=1' },
  ];
  const remaining = setup.filter((s) => !s.done);
  const todo = t ? todoItems(t) : [];
  const ctx = { d, t, team: team.data, money, cur };

  return (
    <div className="mx-auto max-w-[1400px] pb-10">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{`${greeting()}${user.name ? `, ${user.name.split(' ')[0]}` : ''}`}</h1>
          <p className="mt-1 text-sm text-slate-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {company.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard/classic" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><History className="h-4 w-4" />Classic view</Link>
          <Link href="/dashboard/clients?new=1" className={buttonClass()}><Users className="h-4 w-4" /> Add client</Link>
          <Button variant="primary" icon={Plus} disabled={!clients?.length} title={clients?.length ? undefined : 'Add a client first'} onClick={() => setCreating(true)}>New proposal</Button>
        </div>
      </div>

      {(dash.error || todayRes.error) && <Alert className="mb-4">{dash.error || todayRes.error}</Alert>}

      {!catalog.loading && !clientsResource.loading && remaining.length > 0 && (
        <Card className="mb-5 border-brand-muted bg-brand-soft/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm font-semibold text-slate-900">Finish setting up · {setup.length - remaining.length} of {setup.length} done</span>
            <div className="flex flex-wrap gap-2">{remaining.map((s) => <Link key={s.label} href={s.href} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:ring-brand">{s.label}<ArrowRight className="h-3 w-3" /></Link>)}</div>
          </div>
        </Card>
      )}

      {!d || !t ? (dash.loading || todayRes.loading ? <LoadingBlock /> : null) : (
        <>
          {/* always on top: what to do today */}
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3"><h2 className="text-lg font-semibold text-slate-900">To do today</h2>{todo.length > 0 && <p className="text-sm text-slate-500">{plural(todo.length, 'thing')} to look at</p>}</div>
          {todo.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{todo.map((i) => <TodoTile key={i.text(i.n)} {...i} />)}</div>
          ) : (
            <Card className="flex items-center gap-3 border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-800"><Check className="h-5 w-5" />All caught up. Nothing needs your attention right now.</Card>
          )}

          {/* the sections, one tab each */}
          <div role="tablist" aria-label="Dashboard section" className="sticky top-0 z-20 -mx-1 mt-7 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-1 backdrop-blur">
            {TABS.map((x) => {
              const on = x.id === tab;
              const n = x.alert(d, t);
              const Icon = x.icon;
              return (
                <button key={x.id} type="button" role="tab" aria-selected={on} onClick={() => router.replace(`${pathname}?tab=${x.id}`, { scroll: false })}
                  className={cx('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[15px] font-medium whitespace-nowrap transition-colors', on ? 'border-brand text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800')}>
                  <Icon className={cx('h-4 w-4', on ? 'text-brand' : 'text-slate-400')} />{x.label}
                  {n > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-px text-[11px] font-semibold text-amber-800 tabular-nums">{n}</span>}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" className="space-y-4">
            {tab === 'money' && <MoneyTab {...ctx} />}
            {tab === 'sales' && <SalesTab {...ctx} />}
            {tab === 'leads' && <LeadsTab {...ctx} />}
            {tab === 'installations' && <InstallationsTab {...ctx} />}
            {tab === 'inventory' && <InventoryTab {...ctx} />}
            {tab === 'staff' && <StaffTab {...ctx} />}
          </div>
        </>
      )}

      {creating && <NewDesignModal clients={clients} onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ───────────── Money ───────────── */

function MoneyTab({ d, t, money }) {
  const last12 = t.monthly;
  const spentNow = t.money.spentThisMonth;
  const left = d.thisMonth - spentNow;
  const diff = d.thisMonth - d.lastMonth;
  const cashflow = d.revenue.map((r, i) => ({ key: r.key, label: r.label, received: r.amount, spent: last12[i]?.spent || 0 }));
  const net12 = cashflow.reduce((a, r) => a + r.received - r.spent, 0);
  const modesTotal = t.paymentModes.reduce((a, m) => a + m.amount, 0);

  return (
    <>
      <Stats>
        <StatTile label="Received this month" icon={HandCoins} href="/dashboard/billing" value={money(d.thisMonth)}
          note={!d.lastMonth ? (d.thisMonth ? 'No payments last month' : 'No payments yet') : diff >= 0 ? `${money(diff)} more than last month` : `${money(-diff)} less than last month`}
          tone={d.lastMonth && diff > 0 ? 'good' : undefined}>
          <Sparkline values={d.revenue.map((r) => r.amount)} />
        </StatTile>
        <StatTile label="Yet to bill" icon={Wallet} href="/dashboard/billing?show=unbilled" value={money(d.money.yetToBill)}
          note={d.money.yetToBill > 0 ? `${d.money.billedPct}% of booked value billed so far` : 'Every booked proposal is billed'}>
          <div className="h-1.5 rounded-full bg-slate-100" role="progressbar" aria-valuenow={d.money.billedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of booked value billed"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${d.money.billedPct}%` }} /></div>
        </StatTile>
        <StatTile label="Spent this month" icon={ReceiptText} href="/dashboard/expenses" value={money(spentNow)} note="Expenses recorded on projects">
          <Sparkline values={last12.map((m) => m.spent)} />
        </StatTile>
        <StatTile label="Left after expenses" icon={IndianRupee} href="/dashboard/expenses" value={money(left)} tone={left < 0 ? 'bad' : undefined} note="Received minus spent, this month" />
      </Stats>

      <div className="grid gap-4">
        <LineChart title="Money in and out" description={`Last 12 months · ${net12 >= 0 ? `${money(net12)} more came in than went out` : `${money(-net12)} more went out than came in`}`}
          rows={cashflow} series={[{ key: 'received', label: 'Received', color: SERIES_COLORS[0] }, { key: 'spent', label: 'Spent', color: SERIES_COLORS[1] }]} format={money}
          empty="No payments or expenses recorded yet." />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="How clients pay" sub="Last 12 months, by payment method" href="/dashboard/billing">
          {modesTotal ? (
            <>
              <BarList labelWidth="7rem" rows={t.paymentModes.map((m) => ({ key: m.mode, label: PAYMENT_MODES[m.mode] || m.mode, value: m.amount, text: money(m.amount) }))} />
              <Note>{`${pctOf(t.paymentModes[0].amount, modesTotal)}% came by ${PAYMENT_MODES[t.paymentModes[0].mode] || t.paymentModes[0].mode}.`}</Note>
            </>
          ) : <p className="text-sm text-slate-500">No payments in the last 12 months.</p>}
        </Panel>
        <ListCard title="Latest payments" sub="Most recent bills paid" href="/dashboard/billing" empty="No payments recorded yet.">
          {(d.recentPayments || []).map((p) => <Row key={p.id} href={p.designId ? `/dashboard/billing/${p.designId}` : '/dashboard/billing'} title={p.client || p.design} sub={`${formatDate(p.receivedOn)} · ${PAYMENT_MODES[p.mode] || p.mode}`} right={money(p.amount)} />)}
        </ListCard>
        <ListCard title="Invoice not made yet" sub="Booked jobs without an invoice" href="/dashboard/billing?show=no_invoice" empty="Every booked job has an invoice.">
          {d.attention.invoice.map((w) => <Row key={w.id} href={`/dashboard/billing/${w.id}`} title={w.client || w.name} sub={w.name} right={money(w.total)} rightSub="booked" />)}
        </ListCard>
      </div>
    </>
  );
}

/* ───────────── Sales ───────────── */

function SalesTab({ d, t, money, cur }) {
  const thisMonth = d.activity.at(-1) || { created: 0, won: 0 };
  return (
    <>
      <Stats>
        <StatTile label="Quotes waiting for a yes" icon={FileText} href="/dashboard/designs?status=proposed" value={money(OPEN_STAGES.reduce((a, k) => a + (d.stages[k]?.value || 0), 0))} note={`${plural(OPEN_STAGES.reduce((a, k) => a + (d.stages[k]?.count || 0), 0), 'quote')} sent to clients`} />
        <StatTile label="Win rate" icon={Target} href="/dashboard/designs" value={d.winRate === null ? '—' : `${d.winRate}%`} note={d.winRate === null ? 'No quotes decided yet' : `You win ${d.winRate} of every 100 quotes`} />
        <StatTile label="Average booking" icon={HandCoins} href="/dashboard/billing" value={d.stages.won.count ? money(d.averageDeal) : '—'} note={`${plural(d.stages.won.count, 'job')} booked in total`} />
        <StatTile label="Quotes made this month" icon={Check} href="/dashboard/designs?show=made_month" value={thisMonth.created} note={`${thisMonth.won} already booked · ${d.totals.wonKwp.toLocaleString('en-IN')} kWp booked in total`}>
          <Sparkline values={d.activity.map((a) => a.created)} />
        </StatTile>
      </Stats>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-h-[20rem]"><PipelineChart stages={d.stages} currency={cur} winRate={d.winRate} fills={PIPELINE_FILLS} /></div>
        <ColumnChart title="Quotes made and booked" description="Last 6 months" rows={d.activity}
          series={[{ key: 'created', label: 'Quotes made', color: SERIES_COLORS[1] }, { key: 'won', label: 'Booked', color: PIPELINE_FILLS.won }]} empty="No quotes in the last 6 months." />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Quotes expiring soon" sub="Call before the price ends" href="/dashboard/designs?show=expiring" empty="No quotes expire this week.">
          {t.expiring.items.map((e) => <Row key={e.id} href={designHref(e)} title={e.client || e.name} sub={e.name} right={money(e.value)} rightSub={dayWord(e.daysLeft)} rightTone={e.daysLeft <= 1 ? 'bad' : 'warn'} />)}
        </ListCard>
        <ListCard title="Client asked for changes" sub="Update the quote and send it again" href="/dashboard/designs?show=changes" empty="No change requests.">
          {(d.attention.clientChanges || []).map((p) => <Row key={p.id} href={designHref(p)} title={p.client || p.name} sub={p.note ? `“${p.note.slice(0, 70)}${p.note.length > 70 ? '…' : ''}”` : p.name} right={p.value ? money(p.value) : '—'} />)}
        </ListCard>
        <ListCard title="No reply for a week" sub="Give these clients a call" href="/dashboard/designs?show=no_reply" empty="Every quote has had a reply recently.">
          {d.attention.followUp.map((p) => <Row key={p.id} href={designHref(p)} title={p.client || p.name} sub={`${p.name} · sent ${timeAgo(p.updatedAt)}`} right={p.value ? money(p.value) : '—'} />)}
        </ListCard>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="py-3" title="Latest quotes" description={`${plural(d.totals.proposals, 'quote')} · ${plural(d.totals.clients, 'client')}`} action={<SeeAll href="/dashboard/designs" />} />
        {d.recentProposals.length ? (
          <ul className="divide-y divide-slate-100">
            {d.recentProposals.map((p) => (
              <li key={p.id}><Link href={designHref(p)} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{capName(p.client || p.name)}</span><span className="block truncate text-xs text-slate-500">{p.name}{p.kwp ? ` · ${p.kwp.toFixed(1)} kWp` : ''}</span></span>
                <DesignStatusBadge status={p.status} />
                <span className="w-24 shrink-0 text-right text-sm font-semibold text-slate-900 tabular-nums">{p.value ? money(p.value) : '—'}</span>
              </Link></li>
            ))}
          </ul>
        ) : <p className="px-5 py-5 text-sm text-slate-500">No quotes yet.</p>}
      </Card>
    </>
  );
}

/* ───────────── Leads ───────────── */

function LeadsTab({ t }) {
  const funnel = t.leads.funnel;
  const notCalled = funnel.leads - funnel.contacted;
  const since90 = new Date(new Date(t.generatedAt).getTime() - 90 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA'); // YYYY-MM-DD, the window the counts use
  const best = [...t.leads.sources].filter((s) => s.total >= 5).sort((a, b) => b.converted / b.total - a.converted / a.total)[0];
  return (
    <>
      <Stats>
        <StatTile label="New leads" icon={Megaphone} href={`/dashboard/leads?from=${since90}`} value={funnel.leads.toLocaleString('en-IN')} note="In the last 90 days">
          <Sparkline values={t.monthly.slice(-6).map((m) => Object.values(m.leads || {}).reduce((a, n) => a + n, 0))} />
        </StatTile>
        <StatTile label="Spoken to" icon={Users} href={`/dashboard/leads?statusId=none&from=${since90}`} value={`${pctOf(funnel.contacted, funnel.leads)}%`} note={!funnel.leads ? 'No leads yet' : notCalled > 0 ? `${plural(notCalled, 'lead')} not called yet` : 'Every lead has been called'} tone={notCalled > 0 ? 'warn' : undefined} />
        <StatTile label="Became clients" icon={Check} href="/dashboard/clients" value={funnel.converted.toLocaleString('en-IN')} note={`${pctOf(funnel.converted, funnel.leads)} of every 100 leads`} />
        <StatTile label="Not given to anyone" icon={UserPlus} href="/dashboard/leads?assignedTo=unassigned" value={t.leads.unassigned.toLocaleString('en-IN')} tone={t.leads.unassigned ? 'warn' : undefined} note="Assign them to a telecaller" />
      </Stats>

      <LeadsByStatus statuses={t.leads.byStatus} />

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <ColumnChart title="New leads each month" description="Last 6 months, by where they came from" rows={t.monthly.slice(-6).map((m) => ({ key: m.key, label: m.label, ...m.leads }))}
          series={LEAD_SERIES} stacked empty="No leads in the last 6 months. Connect Facebook or Google Ads in Leads → Integrations." />
        <Panel title="From enquiry to client" sub="Last 90 days" href="/dashboard/leads">
          <BarList labelWidth="7rem" rows={[
            { key: 'l', label: 'New leads', value: funnel.leads, text: funnel.leads.toLocaleString('en-IN') },
            { key: 'c', label: 'Spoken to', value: funnel.contacted, text: funnel.contacted.toLocaleString('en-IN') },
            { key: 'v', label: 'Became clients', value: funnel.converted, text: funnel.converted.toLocaleString('en-IN') },
          ]} />
          <Note>{funnel.leads ? `${pctOf(funnel.converted, funnel.leads)} of every 100 leads became a client.` : 'No leads in the last 90 days.'}</Note>
        </Panel>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="py-3" title="Where your leads come from" description="Last 90 days · which source brings real clients" action={<SeeAll href="/dashboard/leads" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-2 font-medium">Source</th><th className="px-3 py-2 text-right font-medium">Leads</th><th className="px-3 py-2 text-right font-medium">Spoken to</th><th className="px-3 py-2 text-right font-medium">Became clients</th><th className="px-5 py-2 text-right font-medium">Not given to anyone</th></tr></thead>
            <tbody>
              {t.leads.sources.map((s) => (
                <tr key={s.key} className="border-t border-slate-100">
                  <td className="px-5 py-2.5"><Link href={`/dashboard/leads/${s.key}`} className="font-medium text-slate-900 hover:text-brand">{s.label}</Link></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.total}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.contacted} <span className="text-slate-400">({pctOf(s.contacted, s.total)}%)</span></td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{s.converted} <span className="font-normal text-slate-400">({pctOf(s.converted, s.total)}%)</span></td>
                  <td className={cx('px-5 py-2.5 text-right tabular-nums', s.unassigned ? 'text-amber-700' : 'text-slate-500')}>{s.unassigned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {best && <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">{`${best.label} brings the most clients: ${pctOf(best.converted, best.total)} of every 100 leads.`}</p>}
      </Card>
    </>
  );
}

/** Every lead by its current status — the follow-up pipeline. Each row opens the lead list filtered to that status. */
function LeadsByStatus({ statuses }) {
  const total = statuses.reduce((a, s) => a + s.count, 0);
  const max = Math.max(1, ...statuses.map((s) => s.count));
  const hint = (st) => (st.outcome === 'converted' ? (st.count === 1 ? 'became a client' : 'became clients') : st.outcome === 'lost' ? 'closed' : '');
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3" title="Leads by status" description={`All ${plural(total, 'lead')} by where they are now · tap a status to see those leads`} action={<SeeAll href="/dashboard/leads" />} />
      {total ? (
        <ul className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-y-0 md:gap-x-6 md:px-5 md:py-2">
          {statuses.map((s) => (
            <li key={s.id}>
              <Link href={`/dashboard/leads?statusId=${s.id}`} className={cx('grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-5 py-2.5 text-sm hover:bg-slate-50 md:px-2', !s.count && 'opacity-60')}>
                <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[s.color] || STATUS_DOT.slate }} /><span className="truncate font-medium text-slate-800">{s.name}</span></span>
                <span className="h-2.5 rounded-r bg-slate-100"><span className="block h-full rounded-r bg-brand" style={{ width: `${s.count ? Math.max(3, (s.count / max) * 100) : 0}%` }} /></span>
                <span className="min-w-[4.5rem] text-right tabular-nums"><b className="font-semibold text-slate-900">{s.count.toLocaleString('en-IN')}</b>{hint(s) && <span className="ml-1 text-xs text-slate-500">{hint(s)}</span>}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="px-5 py-5 text-sm text-slate-500">No leads yet.</p>}
    </Card>
  );
}

/* ───────────── Installations ───────────── */

function InstallationsTab({ t, team }) {
  const inst = t.installations;
  const workload = (team?.agents || []).filter((a) => a.active !== false && (a.open || a.done7)).sort((a, b) => b.open - a.open).slice(0, 8);
  const maxOpen = Math.max(1, ...workload.map((w) => w.open));
  return (
    <>
      <Stats>
        <StatTile label="In progress" icon={HardHat} href={inst.unassignedSteps ? '/dashboard/installations?show=unassigned' : '/dashboard/installations?status=active'} value={inst.active} note={inst.unassignedSteps ? `${plural(inst.unassignedSteps, 'task')} with nobody assigned` : 'Every task has someone on it'} tone={inst.unassignedSteps ? 'warn' : undefined} />
        <StatTile label="Booked, not started" icon={Hourglass} href="/dashboard/designs?show=not_started" value={inst.notStarted} tone={inst.notStarted ? 'warn' : undefined} note="Start these installations" />
        <StatTile label="Finished this month" icon={Check} href="/dashboard/installations?show=finished_month" value={inst.finishedThisMonth} note="Installations completed">
          <Sparkline values={t.monthly.slice(-6).map((m) => m.finished)} />
        </StatTile>
        <StatTile label="Days to finish" icon={Clock} href="/dashboard/installations?status=completed" value={inst.avgDaysToFinish ?? '—'} note="On average, last 6 months" />
      </Stats>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Which step each job is on" sub="A long bar shows where work piles up" href="/dashboard/installations">
          {inst.byStep.length
            ? <BarList labelWidth="10rem" rows={inst.byStep.map((s) => ({ key: s.step, label: s.step, value: s.count, text: plural(s.count, 'job') }))} />
            : <p className="text-sm text-slate-500">No installations in progress.</p>}
        </Panel>
        <ColumnChart title="Installations finished" description="Last 6 months" rows={t.monthly.slice(-6)} series={[{ key: 'finished', label: 'Finished', color: SERIES_COLORS[0] }]} empty="No installation finished in the last 6 months." />
        <Panel title="Team workload" sub="Open tasks, and done this week" href="/dashboard/classic?tab=team" className="lg:col-span-2 xl:col-span-1">
          {workload.length ? (
            <>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />In progress</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[2] }} />Not started</span>
              </div>
              <div className="space-y-2.5">
                {workload.map((a) => (
                  <div key={a.id || a.name} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm" title={`${a.name}: ${a.inProgress} in progress, ${a.pending} not started, ${a.done7} done this week`}>
                    <span className="truncate text-slate-700">{a.name}</span>
                    <span className="flex h-3 gap-[2px] overflow-hidden rounded" style={{ width: `${(a.open / maxOpen) * 100}%` }}>
                      {a.inProgress > 0 && <span className="h-full bg-brand" style={{ flexGrow: a.inProgress }} />}
                      {a.pending > 0 && <span className="h-full" style={{ flexGrow: a.pending, background: SERIES_COLORS[2] }} />}
                    </span>
                    <span className="min-w-[5.5rem] text-right text-slate-500 tabular-nums"><b className="font-semibold text-slate-900">{a.open}</b> open · {a.done7} done</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-slate-500">{team ? 'No open tasks for the team.' : 'Loading team…'}</p>}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <ListCard title="Service visits" sub={`Due today or late${t.amc.next30 ? ` · ${t.amc.next30} more in the next 30 days` : ''}`} href="/dashboard/amc?view=due" empty="No service visits due today.">
          {t.amc.visits.map((v) => <Row key={v.id} href={v.projectId ? `/dashboard/amc?project=${v.projectId}` : '/dashboard/amc?view=due'} title={v.client || v.visit} sub={`${v.visit}${v.assignee ? ` · ${v.assignee}` : ' · nobody assigned'}`} right={dayWord(v.daysLeft)} rightTone={v.daysLeft < 0 ? 'bad' : 'warn'} />)}
        </ListCard>
        <ListCard title="Stuck tasks" sub="Started over a week ago, not finished" href="/dashboard/installations?show=stuck" empty="No task is stuck.">
          {inst.stuck.map((s) => <Row key={`${s.projectId}-${s.step}`} href={`/dashboard/installations/${s.projectId}`} title={`${s.step} · ${s.client || s.project}`} sub={s.assignee ? `With ${s.assignee}` : 'Nobody assigned'} right={plural(s.days, 'day')} rightTone={s.days > 14 ? 'bad' : 'warn'} />)}
        </ListCard>
        <ListCard title="Loans to start" sub={`${plural(t.loans.open, 'loan')} already in progress`} href="/dashboard/designs?show=loan_missing" empty="Every client who needs a loan has one started.">
          {t.loans.missingItems.map((l) => <Row key={l.id} href={designHref(l)} title={l.client || l.name} sub={l.name} right="Start loan" rightTone="warn" />)}
        </ListCard>
        <ListCard title="Subsidies to start" sub={`${plural(t.subsidies.open, 'subsidy')} already in progress`} href="/dashboard/designs?show=subsidy_missing" empty="Every booked job with a subsidy has one started.">
          {t.subsidies.missingItems.map((l) => <Row key={l.id} href={designHref(l)} title={l.client || l.name} sub={l.name} right="Start subsidy" rightTone="warn" />)}
        </ListCard>
      </div>

      {t.impact.kwp > 0 && (
        <Card className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Sun, `${t.impact.kwp.toLocaleString('en-IN')} kWp`, 'Solar capacity sold'],
            [Zap, `${Math.round(t.impact.annualKwh).toLocaleString('en-IN')} kWh`, 'Electricity made each year'],
            [Leaf, `${t.impact.co2Tonnes.toLocaleString('en-IN')} tonnes`, 'CO₂ saved each year'],
            [HardHat, t.impact.installed.toLocaleString('en-IN'), 'Systems installed'],
          ].map(([Icon, v, k]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Icon className="h-5 w-5" /></span>
              <div><div className="text-lg font-semibold text-slate-900 tabular-nums">{v}</div><div className="text-[13px] text-slate-500">{k}</div></div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

/* ───────────── Staff ───────────── */

const NO_TASKS = { open: 0, inProgress: 0, pending: 0, done7: 0, done30: 0, roles: [] };

function StaffTab({ t, team }) {
  const tasksOf = new Map((team?.agents || []).map((a) => [a.id, a]));
  const people = t.staff.members
    .map((m) => ({ ...m, tasks: tasksOf.get(m.id) || NO_TASKS }))
    .filter((m) => m.active || m.tasks.open || m.leads.assigned || m.visits.open)
    .sort((a, b) => b.tasks.open + b.leads.notStarted + b.visits.open - (a.tasks.open + a.leads.notStarted + a.visits.open) || a.name.localeCompare(b.name));
  const active = t.staff.members.filter((m) => m.active).length;
  const totals = team?.totals;
  const unassignedTasks = totals?.unassignedOpen || 0;
  const nobody = unassignedTasks + t.leads.unassigned + t.staff.visitsUnassigned;
  const trend = (team?.trend || []).map((d) => ({ key: d.date, label: new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), count: d.count }));
  const late = people.filter((m) => m.visits.late);
  const { rows: shown, pager } = usePagedItems(people, 8);

  return (
    <>
      <Stats>
        <StatTile label="Team members" icon={Users} href="/dashboard/team" value={active} note={t.staff.members.length > active ? `${t.staff.members.length - active} inactive` : 'All active'} />
        <StatTile label="Open installation tasks" icon={HardHat} href="/dashboard/installations?status=active" value={totals ? totals.open + unassignedTasks : '—'} note={totals ? `${totals.inProgress} in progress · ${totals.pending} waiting · ${unassignedTasks} with nobody` : 'Loading…'} />
        <StatTile label="Tasks done this week" icon={Check} href="/dashboard/installations" value={totals ? totals.done7 : '—'} note={totals ? `${totals.done30} in the last 30 days` : 'Loading…'}>
          {trend.length > 0 && <Sparkline values={trend.map((d) => d.count)} />}
        </StatTile>
        <StatTile label="Work with nobody on it" icon={UserPlus} href={unassignedTasks ? '/dashboard/installations?show=unassigned' : t.leads.unassigned ? '/dashboard/leads?assignedTo=unassigned' : '/dashboard/amc?view=to_assign'} value={nobody} tone={nobody ? 'warn' : undefined}
          note={`${plural(unassignedTasks, 'task')} · ${plural(t.leads.unassigned, 'lead')} · ${plural(t.staff.visitsUnassigned, 'visit')}`} />
      </Stats>

      {late.length > 0 && (
        <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-800">
          <CalendarClock className="h-4 w-4" />
          <span>Late service visits: {late.map((m, i) => <span key={m.id}>{i > 0 && ', '}<Link href={`/dashboard/amc?view=overdue&staff=${m.id}`} className="font-semibold underline">{m.name} ({m.visits.late})</Link></span>)}</span>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <ColumnChart title="Installation tasks finished each day" description="Last 30 days, the whole team" rows={trend} series={[{ key: 'count', label: 'Tasks finished', color: SERIES_COLORS[0] }]}
          empty={team ? 'No task finished in the last 30 days.' : 'Loading…'} />
        <Panel title="Open tasks by role" sub="Which kind of work is waiting" href="/dashboard/installations?status=active">
          {team?.byRole?.length
            ? <DonutChart unit="open tasks" rows={team.byRole.map((r) => ({ key: r.role, label: r.role, value: r.open }))} />
            : <p className="text-sm text-slate-500">{team ? 'No open tasks.' : 'Loading…'}</p>}
        </Panel>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="py-3" title="Each person" description="Who has what on their plate · tap a number to see those items" action={<SeeAll href="/dashboard/team" />} />
        {people.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
              <thead className="text-xs">
                <tr>
                  <th rowSpan={2} className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-left font-medium text-slate-500">Person</th>
                  {Object.entries(WORK).map(([key, g]) => {
                    const Icon = g.icon;
                    return (
                      <th key={key} colSpan={key === 'leads' ? 3 : 2} className={cx('border-l-4 border-white px-3 pt-2.5 pb-1 text-center font-semibold', g.head)}>
                        <span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{g.label}</span>
                      </th>
                    );
                  })}
                </tr>
                <tr className="text-center">
                  {[['tasks', 'Open'], ['tasks', 'Done this week'], ['leads', 'Given'], ['leads', 'Not called'], ['leads', 'Became clients'], ['visits', 'Open'], ['visits', 'Late']].map(([key, label], i) => (
                    <th key={`${key}-${label}`} className={cx('border-b border-slate-200 px-3 pt-0.5 pb-2 font-normal opacity-80', WORK[key].head, [0, 2, 5].includes(i) && 'border-l-4 border-l-white')}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const td = (key, first) => cx('border-b border-slate-100 px-3 py-3 text-center', WORK[key].wash, first && 'border-l-4 border-l-white');
                  return (
                    <tr key={m.id} className="group">
                      <td className="border-b border-slate-100 px-5 py-2.5 group-hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <Avatar name={m.name} src={m.tasks.photo ? assetUrl(m.tasks.photo) : undefined} size={34} />
                          <div className="min-w-0">
                            <Link href={`/dashboard/team/${m.id}`} className="font-medium text-slate-900 hover:text-brand hover:underline">{m.name}</Link>
                            <div className="truncate text-xs text-slate-500">{[m.tasks.roles?.join(' · '), !m.active && 'inactive'].filter(Boolean).join(' · ') || 'No role set'}</div>
                          </div>
                        </div>
                      </td>
                      <td className={td('tasks', true)} title={`${m.tasks.inProgress} in progress · ${m.tasks.pending} not started`}><Chip n={m.tasks.open} group="tasks" /></td>
                      <td className={td('tasks')}><Chip n={m.tasks.done7} group="tasks" tone="good" /></td>
                      <td className={td('leads', true)}><Chip n={m.leads.assigned} group="leads" href={`/dashboard/leads?assignedTo=${m.id}`} /></td>
                      <td className={td('leads')}><Chip n={m.leads.notStarted} group="leads" tone="warn" href={`/dashboard/leads?assignedTo=${m.id}&statusId=none`} /></td>
                      <td className={td('leads')}><Chip n={m.leads.converted} group="leads" tone="good" /></td>
                      <td className={td('visits', true)}><Chip n={m.visits.open} group="visits" href={`/dashboard/amc?staff=${m.id}`} /></td>
                      <td className={td('visits')}><Chip n={m.visits.late} group="visits" tone="bad" href={`/dashboard/amc?view=overdue&staff=${m.id}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePagination className="px-5" {...pager} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className={cx('h-3 w-5 rounded-full ring-1 ring-inset', CHIP_TONE.good)} />Done / became clients</span>
              <span className="inline-flex items-center gap-1.5"><span className={cx('h-3 w-5 rounded-full ring-1 ring-inset', CHIP_TONE.warn)} />Not called yet</span>
              <span className="inline-flex items-center gap-1.5"><span className={cx('h-3 w-5 rounded-full ring-1 ring-inset', CHIP_TONE.bad)} />Late</span>
              <span>– means none</span>
            </div>
          </div>
        ) : <p className="px-5 py-5 text-sm text-slate-500">No staff yet. Add your team in Staff Management.</p>}
      </Card>
    </>
  );
}

/* ───────────── Inventory ───────────── */

function InventoryTab({ t, money }) {
  const s = t.stock;
  return (
    <>
      <Stats>
        <StatTile label="Stock value" icon={IndianRupee} href="/dashboard/catalog" value={money(s.value)} note="What the stock on hand cost you" />
        <StatTile label="Products" icon={Boxes} href="/dashboard/catalog" value={s.products.toLocaleString('en-IN')} note="In your inventory" />
        <StatTile label="Running low" icon={Package} href="/dashboard/catalog?show=low" value={s.low} tone={s.low ? 'warn' : undefined} note="Some left, at or below the reorder level" />
        <StatTile label="Out of stock" icon={PackageX} href="/dashboard/catalog?show=out" value={s.outOfStock} tone={s.outOfStock ? 'bad' : undefined} note="None left in stock" />
      </Stats>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Stock value by category" sub="What the stock on hand cost you" href="/dashboard/catalog">
          {s.byCategory.length
            ? <BarList labelWidth="9rem" rows={s.byCategory.map((c) => ({ key: c.category, label: c.category, value: c.value, text: money(c.value) }))} />
            : <p className="text-sm text-slate-500">No stock on hand.</p>}
        </Panel>
        <ColumnChart title="Stock bought each month" description="Last 6 months, at purchase price" rows={t.monthly.slice(-6)} series={[{ key: 'stockReceived', label: 'Bought', color: SERIES_COLORS[0] }]} format={money}
          empty="No stock received in the last 6 months." />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Out of stock or running low" sub={`Order these soon · ${plural(s.outOfStock + s.low, 'product')}`} href="/dashboard/catalog?show=reorder" empty="Stock levels are fine.">
          {s.items.map((p) => <Row key={p.id} href={`/dashboard/catalog/${p.id}`} title={p.name} sub={p.reorderLevel ? `Reorder at ${p.reorderLevel} ${p.unit}` : p.category} right={`${p.stock} ${p.unit}`} rightSub={p.stock <= 0 ? 'Out of stock' : 'Low stock'} rightTone={p.stock <= 0 ? 'bad' : 'warn'} />)}
        </ListCard>
        <ListCard title="Warranties ending soon" sub={`Installed items, next 60 days${s.warrantiesEnding > s.warranties.length ? ` · ${s.warrantiesEnding} in total` : ''}`} href="/dashboard/catalog" empty="No warranty ends in the next 60 days.">
          {s.warranties.map((w) => <Row key={w.id} href={w.projectId ? `/dashboard/installations/${w.projectId}` : '/dashboard/catalog'} title={w.client || w.product} sub={`${w.product} · ${w.serialNo}`} right={dayWord(w.daysLeft)} rightSub={formatDate(w.endsOn)} rightTone={w.daysLeft <= 15 ? 'warn' : undefined} />)}
        </ListCard>
      </div>
      <p className="flex items-center gap-2 text-sm text-slate-500"><ShieldCheck className="h-4 w-4" />Stock value uses each batch’s purchase price, or its base price when no purchase price was entered.</p>
    </>
  );
}
