'use client';

// Company (organization) dashboard at /org: money, sales pipeline and operations across every branch, with a
// per-branch view. Sales & money numbers are the same ones each branch sees on its own dashboard
// (GET /api/organization/overview → branches[].insights, and `insights` for the whole company).
import { useEffect, useMemo, useState } from 'react';
import UsageBar, { usageTone } from '../dashboard/UsageBar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  GitBranch,
  HandCoins,
  HardHat,
  Headset,
  Megaphone,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  PanelsTopLeft,
  FileText,
} from 'lucide-react';
import BranchSwitcher from '@/components/org/BranchSwitcher';
import AttentionDropdown from '@/components/org/AttentionDropdown';
import Overview from '@/components/dashboard/Overview';
import { branchAttentionItems } from '@/components/dashboard/dashboardTodos';
import { useResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import { compactMoney } from '@/components/dashboard/DashboardCharts';
import { LineChart, BarList, ArcGauge, DonutChart, HorizontalCompareChart, StackedRowChart, SERIES_COLORS, Sparkline } from '@/components/dashboard/DashboardGraphs';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DashboardLoadingShell,
  cx,
  showError,
} from '@/components/kit';

const n = (v) => (v ?? 0).toLocaleString('en-IN');

const BRANCH_SLICE_COLORS = ['#2563eb', '#ea580c', '#059669', '#7c3aed', '#dc2626', '#0891b2', '#64748b', '#ca8a04'];

function shortBranchLabel(name) {
  const dash = String(name).indexOf('—');
  if (dash >= 0) return String(name).slice(dash + 1).trim();
  return name.length > 18 ? `${name.slice(0, 16)}…` : name;
}

function branchDonutRows(branches, valueFn) {
  return branches.map((b, i) => ({
    key: b.id,
    label: shortBranchLabel(b.name),
    value: valueFn(b),
    color: BRANCH_SLICE_COLORS[i % BRANCH_SLICE_COLORS.length],
  }));
}

const WORKLOAD_SERIES_TABS = {
  installs: 'installations',
  amc: 'installations',
  billing: 'money',
  leads: 'leads',
  quotes: 'sales',
};

const STAGE_LABELS = { draft: 'Draft', proposed: 'With client', reproposed: 'Sent again', negotiation: 'Negotiating', won: 'Booked', lost: 'Lost' };
const PIPELINE_BAR_STAGES = ['proposed', 'reproposed', 'negotiation', 'won', 'lost'];
const STAGE_COLORS = { draft: '#cbd5e1', proposed: '#f59e0b', reproposed: '#8b5cf6', negotiation: '#0ea5e9', won: '#16a34a', lost: '#dc2626' };

function OrgKpi({ label, value, note, icon: Icon, tone, onClick, children }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
        {Icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <div className={cx('mt-4 text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums', tone === 'warn' ? 'text-amber-700' : tone === 'bad' ? 'text-red-700' : 'text-slate-900')}>{value}</div>
      {note && <p className={cx('mt-2.5 text-xs leading-snug', tone === 'good' ? 'font-medium text-emerald-700' : 'text-slate-500')}>{note}</p>}
      {children && <div className="mt-auto pt-3">{children}</div>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="dash-kpi h-full w-full text-left transition-shadow hover:shadow-[0_2px_4px_rgba(15,23,42,0.06),0_16px_40px_rgba(15,23,42,0.07)]">
        {inner}
      </button>
    );
  }
  return <div className="dash-kpi h-full">{inner}</div>;
}

/** Company-wide KPIs, revenue trend, billing gauge, pipeline, and branch comparison. */
function OrgCompanySnapshot({ d, branches, onBranchTab }) {
  const ins = d.insights;
  const tot = d.totals || {};
  const currency = d.currency || 'INR';
  const money = (v) => compactMoney(v, currency);
  if (!ins) return null;

  const diff = ins.thisMonth - ins.lastMonth;
  const diffPct = ins.lastMonth ? Math.round((diff / ins.lastMonth) * 100) : null;
  const openWork = branches.reduce((a, b) => a + workInFlight(b.counts), 0);
  const leadDiff = (tot.leadsThisMonth ?? 0) - (tot.leadsLastMonth ?? 0);
  const revenueRows = (ins.revenue || []).map((r) => ({ key: r.key, label: r.label, received: r.amount }));
  const total12 = revenueRows.reduce((a, r) => a + r.received, 0);
  const pipelineBars = PIPELINE_BAR_STAGES.map((id) => ({
    key: id,
    label: STAGE_LABELS[id] || id,
    value: ins.stages?.[id]?.count || 0,
    text: `${ins.stages?.[id]?.count || 0} quotes`,
    color: STAGE_COLORS[id],
  })).filter((r) => r.value > 0);
  const branchRows = [...branches]
    .sort((a, b) => (b.counts?.revenueThisMonth ?? 0) - (a.counts?.revenueThisMonth ?? 0))
    .slice(0, 8);

  const topBranch = (pick) => {
    if (!branches.length) return null;
    return branches.reduce((best, b) => (pick(b) > pick(best) ? b : best), branches[0]);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Company snapshot</h2>
        <p className="text-sm text-slate-500">Totals across {branches.length} branch{branches.length === 1 ? '' : 'es'}</p>
      </div>

      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OrgKpi
          label="Collected this month"
          icon={HandCoins}
          value={money(ins.thisMonth)}
          note={!ins.lastMonth ? (ins.thisMonth ? 'No collections last month' : 'No collections yet') : diff >= 0 ? `${money(diff)} vs last month${diffPct != null ? ` · +${diffPct}%` : ''}` : `${money(-diff)} vs last month${diffPct != null ? ` · ${diffPct}%` : ''}`}
          tone={ins.lastMonth && diff > 0 ? 'good' : undefined}
          onClick={topBranch((b) => b.insights?.thisMonth ?? 0) ? () => onBranchTab(topBranch((b) => b.insights?.thisMonth ?? 0).id, 'money') : undefined}
        >
          <Sparkline values={(ins.revenue || []).map((r) => r.amount)} />
        </OrgKpi>
        <OrgKpi
          label="Open pipeline"
          icon={FileText}
          value={money(ins.pipelineValue)}
          note={`${n(ins.pipelineCount)} quotes with clients`}
          onClick={topBranch((b) => b.insights?.pipelineValue ?? 0) ? () => onBranchTab(topBranch((b) => b.insights?.pipelineValue ?? 0).id, 'sales') : undefined}
        />
        <OrgKpi
          label="New leads this month"
          icon={Megaphone}
          value={n(tot.leadsThisMonth ?? 0)}
          note={leadDiff >= 0 ? `${n(leadDiff)} more than last month` : `${n(-leadDiff)} fewer than last month`}
          tone={(tot.leadsUnassigned ?? 0) > 0 ? 'warn' : undefined}
          onClick={topBranch((b) => b.counts?.leadsThisMonth ?? 0) ? () => onBranchTab(topBranch((b) => b.counts?.leadsThisMonth ?? 0).id, 'leads') : undefined}
        />
        <OrgKpi
          label="Open work"
          icon={HardHat}
          value={n(openWork)}
          note={`${n(tot.installationsActive ?? 0)} installs · ${n(tot.leadsUnassigned ?? 0)} unassigned leads`}
          tone={openWork > 0 ? 'warn' : undefined}
          onClick={topBranch((b) => workInFlight(b.counts)) ? () => onBranchTab(topBranch((b) => workInFlight(b.counts)).id, 'installations') : undefined}
        />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <div className="flex min-h-[18rem] flex-col lg:col-span-2">
          <LineChart
            title="Collections by month"
            description={`${money(total12)} collected in the last 12 months (all branches)`}
            rows={revenueRows}
            series={[{ key: 'received', label: 'Collected', color: SERIES_COLORS[0] }]}
            format={money}
            empty="No payments recorded yet."
          />
        </div>
        <Card className="flex h-full min-h-[18rem] flex-col">
          <CardHeader className="shrink-0 py-3" title="Billing progress" description="Booked value collected or billed company-wide" />
          <ArcGauge
            pct={ins.money?.billedPct ?? 0}
            title="Of booked value"
            subtitle={(ins.money?.yetToBill ?? 0) > 0 ? `${money(ins.money.yetToBill)} still to bill` : 'All booked jobs are billed'}
          />
          <div className="mt-auto grid grid-cols-2 gap-3 border-t border-slate-100 px-5 py-4 text-center">
            <div>
              <div className="text-sm font-semibold text-slate-900 tabular-nums">{ins.winRate != null ? `${ins.winRate}%` : '—'}</div>
              <div className="text-xs text-slate-500">Win rate</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 tabular-nums">{n(ins.bookedKwp ?? 0)} kWp</div>
              <div className="text-xs text-slate-500">Booked capacity</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="py-3" title="Quote pipeline" description="Quotes in each stage (all branches)" />
          <div className="flex flex-1 flex-col px-5 py-4">
            {pipelineBars.length ? <BarList labelWidth="7.5rem" rows={pipelineBars} /> : <p className="text-sm text-slate-500">No quotes yet.</p>}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="py-3" title="Branches at a glance" description="Tap a row to open that branch on the company dashboard" />
          {branchRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Branch</th>
                    <th className="px-3 py-2 text-right font-medium">Collected</th>
                    <th className="px-3 py-2 text-right font-medium">Pipeline</th>
                    <th className="px-3 py-2 text-right font-medium">Leads</th>
                    <th className="px-5 py-2 text-right font-medium">Open work</th>
                  </tr>
                </thead>
                <tbody>
                  {branchRows.map((b) => (
                    <tr key={b.id}>
                      <td className="border-t border-slate-100 px-5 py-2.5">
                        <button type="button" onClick={() => onBranchTab(b.id, 'money')} className="font-medium text-slate-900 hover:text-brand hover:underline">
                          {shortBranchLabel(b.name)}
                        </button>
                      </td>
                      <td className="border-t border-slate-100 px-3 py-2.5 text-right tabular-nums">{money(b.insights?.thisMonth ?? 0)}</td>
                      <td className="border-t border-slate-100 px-3 py-2.5 text-right tabular-nums">{money(b.insights?.pipelineValue ?? 0)}</td>
                      <td className="border-t border-slate-100 px-3 py-2.5 text-right tabular-nums">{n(b.counts?.leadsThisMonth ?? 0)}</td>
                      <td className="border-t border-slate-100 px-5 py-2.5 text-right tabular-nums">{n(workInFlight(b.counts))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Add a branch to compare performance here.</p>
          )}
        </Card>
      </div>
    </section>
  );
}

function BranchMetricDonuts({ branches, currency, onBranchTab }) {
  const money = (v) => compactMoney(v, currency);
  if (branches.length < 2) return null;

  const charts = [
    { title: 'Collected this month', fn: (b) => b.insights?.thisMonth ?? 0, format: money, tab: 'money' },
    { title: 'New leads', fn: (b) => b.counts?.leadsThisMonth ?? 0, format: n, tab: 'leads' },
    { title: 'Open pipeline', fn: (b) => b.insights?.pipelineValue ?? 0, format: money, tab: 'sales' },
    { title: 'Open work', fn: (b) => workInFlight(b.counts), format: n, tab: 'installations' },
  ];

  return (
    <Card>
      <CardHeader
        className="py-3"
        title="Share by branch"
        description="Each chart is the company total for that metric, split by branch. Click a slice or row to open that branch on the matching dashboard tab."
      />
      <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 xl:grid-cols-4">
        {charts.map(({ title, fn, format, tab }) => {
          const rows = branchDonutRows(branches, fn);
          const total = rows.reduce((a, r) => a + r.value, 0);
          return (
            <div key={title} className="dash-card flex min-h-[19rem] flex-col p-4">
              <h3 className="text-center text-[13px] font-semibold text-slate-800">{title}</h3>
              <div className="mt-3 flex flex-1 flex-col justify-center">
                {total > 0 ? (
                  <DonutChart
                    rows={rows}
                    format={format}
                    sortByValue={false}
                    layout="vertical"
                    holeLabel="All branches"
                    onSliceClick={onBranchTab ? (slice) => onBranchTab(slice.key, tab) : undefined}
                  />
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">No data yet.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BranchInventoryCharts({ branches, currency, onBranchTab }) {
  const money = (v) => compactMoney(v, currency);
  if (branches.length < 2) return null;

  const stockRows = useMemo(
    () => branches.map((b, i) => ({
      key: b.id,
      label: shortBranchLabel(b.name),
      value: b.inventory?.value ?? 0,
      color: BRANCH_SLICE_COLORS[i % BRANCH_SLICE_COLORS.length],
    })),
    [branches],
  );

  const reorderRows = useMemo(
    () => branches.map((b) => ({
      key: b.id,
      label: shortBranchLabel(b.name),
      outOfStock: b.inventory?.outOfStock ?? 0,
      low: b.inventory?.low ?? 0,
    })),
    [branches],
  );

  const openInventory = onBranchTab ? (row) => onBranchTab(row.key, 'inventory') : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <HorizontalCompareChart
        title="Stock value by branch"
        description="Ranked by inventory at purchase price — click a row to open that branch’s inventory"
        rows={stockRows}
        format={money}
        empty="No stock on hand in any branch."
        onRowClick={openInventory}
      />
      <StackedRowChart
        title="Reorder attention by branch"
        description="Products out of stock vs running low — click a coloured segment to open inventory"
        rows={reorderRows}
        series={[
          { key: 'outOfStock', label: 'Out of stock', color: '#dc2626' },
          { key: 'low', label: 'Running low', color: '#f59e0b' },
        ]}
        empty="Stock levels look fine in every branch."
        onSegmentClick={openInventory ? (row) => openInventory(row) : undefined}
      />
    </div>
  );
}

/** Open work items waiting on a branch team (installs, service, billing, leads, quotes). */
function workInFlight(counts) {
  if (!counts) return 0;
  return (
    (counts.installationsActive ?? 0)
    + (counts.amcInstallationsPending ?? 0)
    + (counts.billingQueue ?? 0)
    + (counts.leadsUnassigned ?? 0)
    + (counts.proposalsOpen ?? 0)
  );
}

function BranchScoreboard({ branches, currency, onBranchTab }) {
  const workloadRows = useMemo(
    () => branches.map((b) => {
      const c = b.counts || {};
      return {
        key: b.id,
        label: shortBranchLabel(b.name),
        installs: c.installationsActive ?? 0,
        amc: c.amcInstallationsPending ?? 0,
        billing: c.billingQueue ?? 0,
        leads: c.leadsUnassigned ?? 0,
        quotes: c.proposalsOpen ?? 0,
      };
    }),
    [branches],
  );

  if (!branches.length) {
    return (
      <p className="text-sm text-slate-500">
        No branches yet.{' '}
        <Link href="/org/branches" className="font-medium text-brand hover:underline">Create your first branch</Link>
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <BranchMetricDonuts branches={branches} currency={currency} onBranchTab={onBranchTab} />

      <BranchInventoryCharts branches={branches} currency={currency} onBranchTab={onBranchTab} />

      {branches.length > 1 && (
        <StackedRowChart
          title="What each branch is working on"
          description="Open work by type — click a segment to open that branch on the related tab"
          rows={workloadRows}
          series={[
            { key: 'installs', label: 'Installs', color: SERIES_COLORS[0] },
            { key: 'amc', label: 'AMC', color: '#f59e0b' },
            { key: 'billing', label: 'Billing', color: '#64748b' },
            { key: 'leads', label: 'Unassigned leads', color: '#dc2626' },
            { key: 'quotes', label: 'Open quotes', color: '#8b5cf6' },
          ]}
          empty="No open tasks."
          onSegmentClick={onBranchTab ? (row, seriesKey) => onBranchTab(row.key, WORKLOAD_SERIES_TABS[seriesKey] || 'installations') : undefined}
        />
      )}
    </section>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
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
      label: `${n(c.billingQueue)} billing item${c.billingQueue === 1 ? '' : 's'} waiting`, detail: detail('billingQueue', 'Open bills not yet invoiced'),
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

function AllBranchesDashboard({ d, branches, attention, onBranchTab, branchSwitcherList }) {
  const t = d.totals || {};
  const currency = d.currency || 'INR';
  const used = d.branchesUsed ?? 0;
  const max = d.maxBranches ?? 1;

  return (
    <div className="space-y-6 pb-4">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm text-slate-500">{greeting()}</p>
        <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{d.name}</h1>
            <p className="mt-1 text-sm text-slate-600">Company totals across branches — charts below compare each branch.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            <AttentionDropdown items={attention} />
            <BranchSwitcher hideLabel className="mb-0 w-full sm:w-72" branches={branchSwitcherList} />
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={d.canCreateBranch ? 'slate' : 'amber'}>{used} of {max} branch{max === 1 ? '' : 'es'} used</Badge>
        <Link href="/org/masters"><Button variant="secondary" size="sm" icon={SlidersHorizontal}>Masters</Button></Link>
        <Link href="/org/catalog"><Button variant="secondary" size="sm" icon={PanelsTopLeft}>Product catalog</Button></Link>
        <Link href="/org/branches"><Button variant="secondary" size="sm" icon={GitBranch}>Manage branches</Button></Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[['Clients', t.clients, d.limits?.maxClients], ['Designs', t.designs, d.limits?.maxDesigns]].filter(([, , cap]) => cap != null).map(([label, usedN, cap]) => {
          const tone = usageTone(usedN ?? 0, cap);
          return (
            <div key={label} className="dash-card px-4 py-3">
              <div className="flex items-baseline justify-between text-sm"><span className="font-medium text-slate-700">{label}</span><span className={`tabular-nums ${tone.full ? 'text-red-600' : tone.warn ? 'text-amber-600' : 'text-slate-500'}`}>{n(usedN ?? 0)} of {n(cap)}</span></div>
              <UsageBar used={usedN ?? 0} max={cap} className="mt-2" />
            </div>
          );
        })}
      </div>

      {!d.canCreateBranch && (
        <Alert tone="info">All {max} branch slots are in use. Ask the platform admin if you need more.</Alert>
      )}

      <OrgCompanySnapshot d={d} branches={branches} onBranchTab={onBranchTab} />

      <BranchScoreboard branches={branches} currency={currency} onBranchTab={onBranchTab} />
    </div>
  );
}

function branchIdsMatch(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function OrgBranchDashboard({ branchId, branchName, branchList, showAllBranches }) {
  const router = useRouter();
  const { company, switchBranch } = useSession();
  const ready = branchIdsMatch(company?.id, branchId);
  const todayRes = useResource(ready ? '/api/dashboard/today' : null);
  const branchAttention = useMemo(
    () => (todayRes.data ? branchAttentionItems(todayRes.data, (href) => router.push(href)) : []),
    [todayRes.data, router],
  );

  useEffect(() => {
    if (!branchId || branchIdsMatch(company?.id, branchId)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await switchBranch(branchId);
      } catch (err) {
        if (!cancelled) showError(err, 'Could not switch branch');
      }
    })();
    return () => { cancelled = true; };
  }, [branchId, company?.id, switchBranch]);

  const label = branchName ? shortBranchLabel(branchName) : 'branch';

  return (
    <div className="space-y-2">
      <div className="mb-2 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <button type="button" onClick={showAllBranches} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> All branches
        </button>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <AttentionDropdown items={branchAttention} variant="branch" />
          <BranchSwitcher hideLabel className="mb-0 w-full sm:w-72" branches={branchList} />
        </div>
      </div>
      <Overview
        embedded
        branchSwitching={!ready}
        branchSwitchLabel={label}
      />
    </div>
  );
}

export default function OrgDashboard() {
  const router = useRouter();
  const organizationId = useSession((s) => s.organization?.id);
  const overview = useResource('/api/organization/overview', { cacheKey: organizationId ? `org-${organizationId}` : 'org' });
  const { company, switchBranch, orgDashboardScope, setOrgDashboardScope } = useSession();
  const [busyId, setBusyId] = useState(null);

  const showAllBranches = () => setOrgDashboardScope('all');
  const scope = orgDashboardScope;
  const branchIdFromScope = scope !== 'all' ? scope : null;
  const branchesFromOverview = overview.data?.branches || [];
  const branchMeta = branchIdFromScope
    ? branchesFromOverview.find((b) => b.id === branchIdFromScope)
    : null;
  const branchSwitcherList = branchesFromOverview.length
    ? branchesFromOverview.map((b) => ({ id: b.id, name: b.name, status: b.status }))
    : branchIdFromScope && company?.name
      ? [{ id: branchIdFromScope, name: company.name, status: 'active' }]
      : undefined;

  // Branch workspace: one loader (inside OrgBranchDashboard / embedded Overview) — do not block on org overview refetch.
  if (branchIdFromScope) {
    return (
      <OrgBranchDashboard
        branchId={branchIdFromScope}
        branchName={branchMeta?.name || company?.name}
        branchList={branchSwitcherList}
        showAllBranches={showAllBranches}
      />
    );
  }

  if (overview.loading && !overview.data) {
    return (
      <DashboardLoadingShell
        title="Loading company dashboard"
        subtitle="Gathering totals and branch comparisons…"
        className="pb-10"
      />
    );
  }
  if (overview.error) return <Alert className="mt-2">{overview.error}</Alert>;

  const d = overview.data;
  const branches = d.branches || [];
  const currency = d.currency || 'INR';

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

  const openBranchTab = (branchId, tab = 'money') => {
    if (!branchId) return;
    setOrgDashboardScope(branchId);
    router.push(`/org?tab=${tab}`);
  };

  const valueOf = (b, key) => (key === 'yetToBill' ? b.insights?.money?.yetToBill : b.counts?.[key]) ?? 0;
  const busiest = (key) => branches.reduce((best, b) => (valueOf(b, key) > valueOf(best, key) ? b : best), branches[0]);
  const orgAttention = attentionItems(d.totals || {}, d.insights, {
    where: (key) => busiest(key)?.id || company?.id,
    detail: (key, text) => (branches.length > 1 && busiest(key) ? `Most in ${busiest(key).name}` : text),
    openInBranch,
    currency,
  });

  return (
    <AllBranchesDashboard
      d={d}
      branches={branches}
      attention={orgAttention}
      onBranchTab={openBranchTab}
      branchSwitcherList={branchSwitcherList}
    />
  );
}
