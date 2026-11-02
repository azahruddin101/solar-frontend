'use client';

// Company (organization) dashboard at /org: money, sales pipeline and operations across every branch, with a
// per-branch view. Sales & money numbers are the same ones each branch sees on its own dashboard
// (GET /api/organization/overview → branches[].insights, and `insights` for the whole company).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  FileText,
  GitBranch,
  HandCoins,
  HardHat,
  Headset,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from 'lucide-react';
import { useResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import { CollectionsMeter, Kpi, PipelineChart, RevenueChart, compactMoney } from '@/components/dashboard/DashboardCharts';
import { BarList, ColumnChart, SERIES_COLORS } from '@/components/dashboard/DashboardGraphs';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  LoadingBlock,
  Table,
  Td,
  Th,
  Tr,
  cx,
  showError,
} from '@/components/kit';

const n = (v) => (v ?? 0).toLocaleString('en-IN');
const kwp = (v) => `${(Math.round((v || 0) * 10) / 10).toLocaleString('en-IN')} kWp`;
/** Month-on-month change in percent, or null when there is nothing to compare with. */
const change = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);
const PIPELINE_FILLS = { draft: '#cbd5e1', proposed: '#f59e0b', reproposed: '#8b5cf6', negotiation: '#0ea5e9', won: '#16a34a', lost: '#dc2626' };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function AttentionLink({ icon: Icon, label, detail, onClick, urgent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'group flex w-full items-center gap-3 rounded-lg border bg-white px-3.5 py-3 text-left transition-colors',
        urgent ? 'border-amber-200 hover:border-amber-400' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full', urgent ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600')}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{detail}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-700" />
    </button>
  );
}

function Attention({ items }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Needs attention</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <AttentionLink key={item.key} icon={item.icon} label={item.label} detail={item.detail} urgent={item.urgent} onClick={item.onClick} />
        ))}
      </div>
    </section>
  );
}

/**
 * What needs someone's attention. `where(key)` names the branch to open for an item (the one with the most of it,
 * or the branch itself in the branch view); `detail(key)` says where it is.
 */
function attentionItems(c, ins, { where, detail, openInBranch, currency }) {
  const item = (key, cond, rest) => cond && { key, onClick: () => openInBranch(where(key), rest.path), ...rest };
  return [
    item('leadsUnassigned', (c.leadsUnassigned ?? 0) > 0, {
      icon: Megaphone, urgent: true, path: '/dashboard/leads?assignedTo=unassigned',
      label: `${n(c.leadsUnassigned)} unassigned lead${c.leadsUnassigned === 1 ? '' : 's'}`, detail: detail('leadsUnassigned', 'Give them to someone to call'),
    }),
    item('yetToBill', (ins?.money?.yetToBill ?? 0) > 0, {
      icon: Receipt, urgent: true, path: '/dashboard/billing',
      label: `${compactMoney(ins?.money?.yetToBill, currency)} booked but not billed`, detail: detail('yetToBill', 'Booked proposals still to be billed'),
    }),
    item('billingQueue', (c.billingQueue ?? 0) > 0, {
      icon: HandCoins, path: '/dashboard/billing',
      label: `${n(c.billingQueue)} billing item${c.billingQueue === 1 ? '' : 's'} waiting`, detail: detail('billingQueue', 'Open e-way bills and bills not yet invoiced'),
    }),
    item('clientSupportOpen', (c.clientSupportOpen ?? 0) > 0, {
      icon: Headset, path: '/dashboard/client-support',
      label: `${n(c.clientSupportOpen)} client request${c.clientSupportOpen === 1 ? '' : 's'} open`, detail: detail('clientSupportOpen', 'Clients waiting for an answer'),
    }),
    item('amcInstallationsPending', (c.amcInstallationsPending ?? 0) > 0, {
      icon: ShieldCheck, path: '/dashboard/amc',
      label: `${n(c.amcInstallationsPending)} site${c.amcInstallationsPending === 1 ? '' : 's'} with AMC visits pending`, detail: detail('amcInstallationsPending', 'Service due on completed installations'),
    }),
    item('platformTicketsOpen', (c.platformTicketsOpen ?? 0) > 0, {
      icon: Headset, path: '/dashboard/support',
      label: `${n(c.platformTicketsOpen)} platform ticket${c.platformTicketsOpen === 1 ? '' : 's'} open`, detail: detail('platformTicketsOpen', 'Your tickets with the platform team'),
    }),
  ].filter(Boolean);
}

/** Headline money and sales numbers (top row) and the operations behind them (second row). */
function KpiRows({ c, ins, currency }) {
  const leadsDelta = change(c.leadsThisMonth ?? 0, c.leadsLastMonth ?? 0);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Collected this month"
          value={compactMoney(ins?.thisMonth, currency)}
          icon={Wallet}
          delta={change(ins?.thisMonth ?? 0, ins?.lastMonth ?? 0)}
          deltaLabel="vs last month"
          hint={`${compactMoney(c.revenueTotal, currency)} all time`}
        />
        <Kpi
          label="Open pipeline"
          value={compactMoney(ins?.pipelineValue, currency)}
          icon={FileText}
          hint={`${n(ins?.pipelineCount)} quote${ins?.pipelineCount === 1 ? '' : 's'} waiting on clients`}
        />
        <Kpi
          label="Booked"
          value={compactMoney(ins?.bookedValue, currency)}
          icon={BadgeCheck}
          hint={`${n(ins?.bookedCount)} deal${ins?.bookedCount === 1 ? '' : 's'} · ${kwp(ins?.bookedKwp)}${ins?.winRate != null ? ` · ${ins.winRate}% win rate` : ''}`}
        />
        <Kpi
          label="Yet to bill"
          value={compactMoney(ins?.money?.yetToBill, currency)}
          icon={Receipt}
          tone={(ins?.money?.yetToBill ?? 0) > 0 ? 'warn' : undefined}
          hint={`${ins?.money?.billedPct ?? 0}% of booked value billed`}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="New leads this month"
          value={n(c.leadsThisMonth)}
          icon={Megaphone}
          delta={leadsDelta}
          deltaLabel="vs last month"
          hint={`${n(c.leads)} live · ${n(c.leadsConverted)} converted`}
        />
        <Kpi label="Clients" value={n(c.clients)} icon={Users} hint={`${n(c.designs)} proposals made`} />
        <Kpi label="Active installations" value={n(c.installationsActive)} icon={HardHat} hint={`${n(c.installationsCompleted)} completed · ${n(c.staff)} staff`} />
        <Kpi label="Loans & subsidies" value={n((c.loansOpen ?? 0) + (c.subsidiesOpen ?? 0))} icon={Landmark} hint={`${n(c.loansOpen)} loans · ${n(c.subsidiesOpen)} subsidies in progress`} />
      </div>
    </>
  );
}

/** Money received by month, the proposal pipeline, quotes made vs booked, and how much of the booked value is billed. */
function SalesCharts({ ins, currency }) {
  if (!ins) return null;
  return (
    <>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-h-[22rem] xl:col-span-2"><RevenueChart data={ins.revenue} currency={currency} /></div>
        <div className="min-h-[22rem]"><PipelineChart stages={ins.stages} currency={currency} winRate={ins.winRate} fills={PIPELINE_FILLS} /></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ColumnChart
            title="Quotes made and booked"
            description="Last 6 months"
            rows={ins.activity}
            series={[{ key: 'created', label: 'Quotes made', color: SERIES_COLORS[1] }, { key: 'won', label: 'Booked', color: PIPELINE_FILLS.won }]}
            empty="No quotes in the last 6 months."
          />
        </div>
        <div className="min-h-[10rem]"><CollectionsMeter money={ins.money} currency={currency} wonCount={ins.bookedCount} /></div>
      </div>
    </>
  );
}

function BranchTable({ branches, currency, focusBranch, busyId }) {
  if (!branches.length) {
    return (
      <p className="px-6 pb-8 text-sm text-slate-500">
        No branches yet.{' '}
        <Link href="/org/branches" className="font-medium text-brand hover:underline">Create your first branch</Link>
      </p>
    );
  }
  return (
    <Table>
      <thead>
        <tr>
          <Th>Branch</Th>
          <Th className="text-right">New leads</Th>
          <Th className="text-right">Open pipeline</Th>
          <Th className="text-right">Booked</Th>
          <Th className="text-right">Win rate</Th>
          <Th className="text-right">Collected (month)</Th>
          <Th className="text-right">Yet to bill</Th>
          <Th className="text-right">Active installs</Th>
          <Th className="text-right">Staff</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {branches.map((b) => {
          const c = b.counts || {};
          const i = b.insights || {};
          const unassigned = (c.leadsUnassigned ?? 0) > 0;
          return (
            <Tr key={b.id}>
              <Td>
                <span className="font-medium text-slate-900">{b.name}</span>
                {b.status !== 'active' && <Badge tone="amber" className="ml-2">Suspended</Badge>}
                {b.owner?.name && <span className="block text-xs text-slate-500">{b.owner.name}</span>}
                {unassigned && <span className="block text-xs text-amber-700">{n(c.leadsUnassigned)} unassigned leads</span>}
              </Td>
              <Td className="text-right tabular-nums">{n(c.leadsThisMonth)}</Td>
              <Td className="text-right tabular-nums">{compactMoney(i.pipelineValue, currency)}<span className="block text-xs text-slate-500">{n(i.pipelineCount)} quotes</span></Td>
              <Td className="text-right tabular-nums">{compactMoney(i.bookedValue, currency)}<span className="block text-xs text-slate-500">{kwp(i.bookedKwp)}</span></Td>
              <Td className="text-right tabular-nums">{i.winRate != null ? `${i.winRate}%` : '—'}</Td>
              <Td className="text-right tabular-nums">{compactMoney(i.thisMonth, currency)}</Td>
              <Td className={cx('text-right tabular-nums', (i.money?.yetToBill ?? 0) > 0 && 'font-medium text-amber-800')}>{compactMoney(i.money?.yetToBill, currency)}</Td>
              <Td className="text-right tabular-nums">{n(c.installationsActive)}</Td>
              <Td className="text-right tabular-nums">{n(c.staff)}</Td>
              <Td className="text-right">
                <Button size="sm" variant="ghost" loading={busyId === b.id} onClick={() => focusBranch(b.id)}>Overview</Button>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function AllBranchesDashboard({ d, branches, attention, focusBranch, busyId }) {
  const t = d.totals || {};
  const ins = d.insights;
  const currency = d.currency || 'INR';
  const used = d.branchesUsed ?? 0;
  const max = d.maxBranches ?? 1;

  const collectedBars = useMemo(
    () => branches.map((b) => ({ key: b.id, label: b.name, value: b.counts?.revenueTotal ?? 0, text: compactMoney(b.counts?.revenueTotal, currency) })),
    [branches, currency],
  );
  const leadBars = useMemo(
    () => branches.map((b) => ({ key: b.id, label: b.name, value: b.counts?.leadsThisMonth ?? 0, text: n(b.counts?.leadsThisMonth) })),
    [branches],
  );

  return (
    <div className="space-y-8 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm text-slate-500">{greeting()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{d.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Money, sales and operations across all {used} branch{used === 1 ? '' : 'es'}. Pick a branch in the <strong className="font-medium text-slate-800">View</strong> menu, or its <strong className="font-medium text-slate-800">Overview</strong> below, to see one location.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={d.canCreateBranch ? 'slate' : 'amber'}>{used} of {max} branch{max === 1 ? '' : 'es'} used</Badge>
          <Link href="/org/masters"><Button variant="secondary" size="sm" icon={SlidersHorizontal}>Masters</Button></Link>
          <Link href="/org/branches"><Button variant="secondary" size="sm" icon={GitBranch}>Manage branches</Button></Link>
        </div>
      </header>

      {!d.canCreateBranch && (
        <Alert tone="info">All {max} branch slots are in use. Ask the platform admin if you need more.</Alert>
      )}

      <KpiRows c={t} ins={ins} currency={currency} />

      <Attention items={attention} />

      <SalesCharts ins={ins} currency={currency} />

      <Card>
        <CardHeader className="py-4" title="Branches compared" description="This month’s leads and collections, the pipeline and what is booked — open a branch to see its details." />
        <BranchTable branches={branches} currency={currency} focusBranch={focusBranch} busyId={busyId} />
      </Card>

      {branches.length > 1 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="py-3" title="Collected by branch" description="All time" />
            <div className="px-5 pb-5">
              {collectedBars.some((r) => r.value > 0) ? <BarList rows={collectedBars} labelWidth="9rem" /> : <p className="py-6 text-center text-sm text-slate-500">Nothing collected yet.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader className="py-3" title="New leads by branch" description="This month" />
            <div className="px-5 pb-5">
              {leadBars.some((r) => r.value > 0) ? <BarList rows={leadBars} labelWidth="9rem" /> : <p className="py-6 text-center text-sm text-slate-500">No new leads this month.</p>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function BranchOverviewDashboard({ branch, d, openInBranch, showAllBranches, busy }) {
  const c = branch.counts || {};
  const ins = branch.insights;
  const currency = d.currency || 'INR';
  const attention = attentionItems(c, ins, { where: () => branch.id, detail: (_, text) => text, openInBranch, currency });
  const leadSources = [
    { label: 'Meta', value: c.metaLeads ?? 0 },
    { label: 'Google', value: c.googleLeads ?? 0 },
    { label: 'Manual', value: c.manualLeads ?? 0 },
  ].filter((x) => x.value > 0);

  return (
    <div className="space-y-8 pb-4">
      <header className="border-b border-slate-200 pb-6">
        <button type="button" onClick={showAllBranches} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> All branches
        </button>
        <p className="text-sm text-slate-500">{d.name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{branch.name}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {branch.owner?.name ? <>Branch owner: <strong className="font-medium text-slate-800">{branch.owner.name}</strong>. </> : null}
          Use <strong className="font-medium text-slate-800">Open workspace</strong> for leads, billing, installations and daily work.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" icon={LayoutDashboard} loading={busy} onClick={() => openInBranch(branch.id, '/dashboard')}>
            Open workspace
          </Button>
          <Link href="/org/masters"><Button variant="secondary" size="sm" icon={SlidersHorizontal}>Masters</Button></Link>
        </div>
      </header>

      <KpiRows c={c} ins={ins} currency={currency} />

      <Attention items={attention} />

      <SalesCharts ins={ins} currency={currency} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-4" title="Leads by source" description={`${n(c.leads)} live · ${n(c.leadsUnassigned)} unassigned`} />
          <div className="px-5 pb-5">
            {leadSources.length > 0 ? (
              <BarList rows={leadSources.map((s) => ({ key: s.label, label: s.label, value: s.value, text: n(s.value) }))} labelWidth="4.5rem" />
            ) : (
              <p className="text-sm text-slate-500">No live leads in this branch.</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader className="py-4" title="Service & support" description="This branch" />
          <dl className="grid grid-cols-2 gap-4 px-5 pb-5 sm:grid-cols-3">
            {[
              { label: 'Installations done', value: n(c.installationsCompleted) },
              { label: 'AMC pending', value: n(c.amcInstallationsPending) },
              { label: 'Client requests', value: n(c.clientSupportOpen) },
              { label: 'Billing queue', value: n(c.billingQueue) },
              { label: 'Loans open', value: n(c.loansOpen) },
              { label: 'Subsidies open', value: n(c.subsidiesOpen) },
            ].map((m) => (
              <div key={m.label}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{m.label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{m.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}

export default function OrgDashboard() {
  const router = useRouter();
  const overview = useResource('/api/organization/overview');
  const { company, switchBranch, orgDashboardScope, setOrgDashboardScope } = useSession();
  const [busyId, setBusyId] = useState(null);

  const openInBranch = async (branchId, path = '/dashboard') => {
    if (!branchId) return;
    setBusyId(branchId);
    try {
      if (company?.id !== branchId) await switchBranch(branchId);
      router.push(path);
    } catch (err) {
      showError(err, 'Could not open branch');
    }
    setBusyId(null);
  };

  const focusBranch = async (branchId) => {
    setBusyId(branchId);
    try {
      if (company?.id !== branchId) await switchBranch(branchId);
      setOrgDashboardScope(branchId);
    } catch (err) {
      showError(err, 'Could not switch branch');
    }
    setBusyId(null);
  };

  const showAllBranches = () => setOrgDashboardScope('all');

  if (overview.loading) return <LoadingBlock className="py-16" />;
  if (overview.error) return <Alert className="mt-2">{overview.error}</Alert>;

  const d = overview.data;
  const branches = d.branches || [];
  const currency = d.currency || 'INR';

  // the branch with the most of something — where a company-wide attention item takes you
  const valueOf = (b, key) => (key === 'yetToBill' ? b.insights?.money?.yetToBill : b.counts?.[key]) ?? 0;
  const busiest = (key) => branches.reduce((best, b) => (valueOf(b, key) > valueOf(best, key) ? b : best), branches[0]);
  const orgAttention = attentionItems(d.totals || {}, d.insights, {
    where: (key) => busiest(key)?.id || company?.id,
    detail: (key, text) => (branches.length > 1 && busiest(key) ? `Most in ${busiest(key).name}` : text),
    openInBranch,
    currency,
  });

  const scope = orgDashboardScope;
  const branchForScope = scope !== 'all' ? branches.find((b) => b.id === scope) || branches.find((b) => b.id === company?.id) : null;

  if (scope !== 'all' && branchForScope) {
    return (
      <BranchOverviewDashboard
        branch={branchForScope}
        d={d}
        openInBranch={openInBranch}
        showAllBranches={showAllBranches}
        busy={busyId === branchForScope.id}
      />
    );
  }

  return <AllBranchesDashboard d={d} branches={branches} attention={orgAttention} focusBranch={focusBranch} busyId={busyId} />;
}
