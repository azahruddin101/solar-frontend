'use client';

// The company dashboard, in three views (tabs, top right): Finance · Needs attention · Team performance.
// The finance and attention figures come from one company-scoped request (/api/dashboard); the team view loads its own.
import { ArrowRight, Check, FileText, HandCoins, MessageSquare, PenTool, Plus, Receipt, ReceiptText, Target, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, LoadingBlock, Table, Td, Th, Tr, buttonClass, cx, formatDate, timeAgo } from '../kit';
import { CollectionsMeter, Kpi, PipelineChart, RevenueChart, compactMoney } from './DashboardCharts';
import { DesignStatusBadge, NewDesignModal, designHref } from './shared';
import TeamAnalytics from './TeamAnalytics';

const MODE = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank transfer', cheque: 'Cheque', card: 'Card', other: 'Other' };
/** The three views of the dashboard, switched with the tabs at the top right (?tab=…). */
const TABS = [
  { id: 'finance', label: 'Finance' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'team', label: 'Team performance' },
];
const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** A short list of things to act on, each row linking to where it is done. Fills its slot; a long list scrolls inside the card. */
function AttentionCard({ icon: Icon, title, description, count, empty, children }) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-5 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><h3 className="text-[15px] font-semibold text-slate-900">{title}</h3><p className="text-[13px] text-slate-500">{description}</p></div>
        {count > 0 && <Badge tone="amber">{count}</Badge>}
      </div>
      {count > 0 ? <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">{children}</ul> : <p className="flex items-center gap-2 px-5 py-4 text-sm text-slate-400"><Check className="h-4 w-4 text-emerald-500" />{empty}</p>}
    </Card>
  );
}

const Row = ({ href, title, sub, right, rightSub }) => (
  <li><Link href={href} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
    <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{title}</span><span className="block truncate text-xs text-slate-500">{sub}</span></span>
    <span className="shrink-0 text-right"><span className="block text-sm font-semibold text-slate-900 tabular-nums">{right}</span>{rightSub && <span className="block text-xs text-slate-500">{rightSub}</span>}</span>
  </Link></li>
);

export default function Overview() {
  const { company, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const dash = useResource('/api/dashboard');
  const clientsResource = useResource('/api/clients?limit=500');
  const clients = { loading: clientsResource.loading, data: clientsResource.data?.items };
  const catalog = useResource('/api/catalog');
  const [creating, setCreating] = useState(false);
  const cur = company.currency;
  const d = dash.data;

  const setup = [
    { done: Boolean(company.logo), label: 'Upload your logo', href: '/dashboard/settings?tab=branding' },
    { done: Boolean(company.signature), label: 'Add your e-signature', href: '/dashboard/settings?tab=branding' },
    { done: Boolean(company.phone && company.address), label: 'Complete your company profile', href: '/dashboard/settings' },
    { done: (catalog.data?.panels.length || 0) > 0, label: 'Add the solar panels you sell', href: '/dashboard/catalog' },
    { done: (clients.data?.length || 0) > 0, label: 'Add your first client', href: '/dashboard/clients?new=1' },
  ];
  const remaining = setup.filter((s) => !s.done);
  const openValue = d ? d.stages.proposed.value : 0;

  const attentionCount = d ? (d.attention.clientChanges?.length || 0) + d.attention.followUp.length + d.attention.collect.length + d.attention.invoice.length : 0;
  const tab = TABS.find((t) => t.id === params.get('tab'))?.id || 'finance';

  return (
    <div className="flex flex-col xl:h-[calc(100dvh-5rem)]">
      {/* title on the left; the three views and the quick actions on the right */}
      <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[20rem]">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{`Welcome back${user.name ? `, ${user.name.split(' ')[0]}` : ''}`}</h1>
          <p className="mt-1 text-sm text-slate-500">{`Sales, collections and installations at ${company.name}.`}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <div role="tablist" aria-label="Dashboard view" className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-0.5">
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => router.replace(`${pathname}?tab=${t.id}`, { scroll: false })} className={cx('flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors', on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                  {t.label}
                  {t.id === 'attention' && attentionCount > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-px text-[11px] font-semibold text-amber-800 tabular-nums">{attentionCount}</span>}
                </button>
              );
            })}
          </div>
          <Link href="/dashboard/clients?new=1" className={buttonClass()}><Users className="h-4 w-4" /> Add client</Link>
          <Button variant="primary" icon={Plus} disabled={!clients.data?.length} title={clients.data?.length ? undefined : 'Add a client first'} onClick={() => setCreating(true)}>New proposal</Button>
        </div>
      </div>
      {dash.error && <Alert className="mb-4 shrink-0">{dash.error}</Alert>}

      {!catalog.loading && !clients.loading && remaining.length > 0 && (
        <Card className="mb-4 shrink-0 border-brand-muted bg-brand-soft/60 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm font-semibold text-slate-900">Finish setting up · {setup.length - remaining.length} of {setup.length} done</span>
            <div className="flex flex-wrap gap-2">{remaining.map((s) => <Link key={s.label} href={s.href} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:ring-brand">{s.label}<ArrowRight className="h-3 w-3" /></Link>)}</div>
          </div>
        </Card>
      )}

      {/* Each view fits the screen height on desktop (xl): rows share the height, long lists scroll inside their card.
          Below xl the same content simply stacks and the page scrolls. */}

      {/* Finance: headline numbers → money in and the pipeline → collections and the latest receipts */}
      {tab === 'finance' && (dash.loading ? <LoadingBlock /> : d && (
        <div role="tabpanel" className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
          <section aria-label="Key figures" className="grid shrink-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Received this month" icon={HandCoins} value={compactMoney(d.thisMonth, cur)} delta={pct(d.thisMonth, d.lastMonth)} deltaLabel={d.lastMonth ? `vs ${compactMoney(d.lastMonth, cur)} last month` : 'no payments last month'} />
            <Kpi label="To collect" icon={Wallet} value={compactMoney(d.money.outstanding, cur)} tone={d.money.outstanding > 0 ? 'warn' : undefined} hint={`${d.stages.won.count} booked proposal${d.stages.won.count === 1 ? '' : 's'} · ${d.money.collectedPct}% collected`} />
            <Kpi label="Open pipeline" icon={FileText} value={compactMoney(openValue, cur)} hint={`${d.stages.proposed.count} proposal${d.stages.proposed.count === 1 ? '' : 's'} awaiting a decision`} />
            <Kpi label="Win rate" icon={Target} value={d.winRate === null ? '—' : `${d.winRate}%`} hint={d.stages.won.count ? `Average deal ${compactMoney(d.averageDeal, cur)}` : 'No decided proposals yet'} />
          </section>

          <section aria-label="Revenue and pipeline" className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:min-h-0 xl:flex-[5] xl:grid-cols-3">
            <div className="min-h-72 xl:col-span-2 xl:min-h-0"><RevenueChart data={d.revenue} currency={cur} /></div>
            <div className="xl:min-h-0"><PipelineChart stages={d.stages} currency={cur} winRate={d.winRate} /></div>
          </section>

          <section aria-label="Collections and payments" className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:min-h-0 xl:flex-[3] xl:grid-cols-3">
            <div className="xl:min-h-0"><CollectionsMeter money={d.money} currency={cur} wonCount={d.stages.won.count} /></div>
            <Card className="flex min-h-0 flex-col overflow-hidden xl:col-span-2">
              <CardHeader className="shrink-0 py-3" title="Recent payments" action={<Link href="/dashboard/billing" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">Billing <ArrowRight className="h-4 w-4" /></Link>} />
              {!d.recentPayments.length ? <p className="px-5 py-4 text-sm text-slate-400">No payments yet. They appear here once you record one on a booked proposal.</p> : (
                <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
                  {d.recentPayments.map((p) => (
                    <li key={p.id}><Link href={`/dashboard/billing/${p.designId}`} className="flex items-center gap-3 px-5 py-2 hover:bg-slate-50">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Receipt className="h-3.5 w-3.5" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{p.client || p.design}</span><span className="block truncate text-xs text-slate-500">{p.receiptNo} · {MODE[p.mode] || p.mode} · {formatDate(p.receivedOn)}</span></span>
                      <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">{formatMoney(p.amount, cur)}</span>
                    </Link></li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      ))}

      {/* Needs attention: what to act on, then the latest proposals */}
      {tab === 'attention' && (dash.loading ? <LoadingBlock /> : d && (
        <div role="tabpanel" className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
          <section aria-label="Needs attention" className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:min-h-0 xl:flex-[5] xl:grid-cols-2">
            <div className="max-h-72 xl:max-h-none xl:min-h-0">
              <AttentionCard icon={MessageSquare} title="Client change requests" description="Proposals where the client asked for changes" count={d.attention.clientChanges?.length || 0} empty="No open change requests from clients.">
                {(d.attention.clientChanges || []).map((p) => <Row key={p.id} href={designHref(p)} title={p.name} sub={`${p.client} · ${timeAgo(p.respondedAt)}${p.note ? ` · “${p.note.slice(0, 60)}${p.note.length > 60 ? '…' : ''}”` : ''}`} right={p.value ? compactMoney(p.value, cur) : '—'} />)}
              </AttentionCard>
            </div>
            <div className="max-h-72 xl:max-h-none xl:min-h-0">
              <AttentionCard icon={FileText} title="Follow up" description="Proposed, no movement for 7+ days" count={d.attention.followUp.length} empty="No proposals are waiting on a reply.">
                {d.attention.followUp.map((p) => <Row key={p.id} href={designHref(p)} title={p.name} sub={`${p.client} · sent ${timeAgo(p.updatedAt)}`} right={p.value ? compactMoney(p.value, cur) : '—'} />)}
              </AttentionCard>
            </div>
            <div className="max-h-72 xl:max-h-none xl:min-h-0">
              <AttentionCard icon={HandCoins} title="Collect payment" description="Booked proposals with a balance due" count={d.attention.collect.length} empty="Every booked proposal is fully paid.">
                {d.attention.collect.map((w) => <Row key={w.id} href={`/dashboard/billing/${w.id}`} title={w.name} sub={`${w.client} · ${w.paid ? `last paid ${formatDate(w.lastPaymentOn)}` : 'no payment yet'}`} right={compactMoney(w.balance, cur)} rightSub="due" />)}
              </AttentionCard>
            </div>
            <div className="max-h-72 xl:max-h-none xl:min-h-0">
              <AttentionCard icon={ReceiptText} title="Invoice pending" description="Booked proposals with no invoice yet" count={d.attention.invoice.length} empty="No invoices are waiting to be issued.">
                {d.attention.invoice.map((w) => <Row key={w.id} href={`/dashboard/billing/${w.id}`} title={w.name} sub={w.client} right={compactMoney(w.total, cur)} rightSub="paid" />)}
              </AttentionCard>
            </div>
          </section>

          <Card className="flex min-h-0 flex-col overflow-hidden xl:flex-[6]">
            <CardHeader className="shrink-0 py-3" title="Recent proposals" description={`${d.totals.proposals} in total · ${d.totals.kwp.toFixed(1)} kWp designed · ${d.totals.clients} client${d.totals.clients === 1 ? '' : 's'}`} action={<Link href="/dashboard/designs" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">View all <ArrowRight className="h-4 w-4" /></Link>} />
            {!d.recentProposals.length ? (
              <EmptyState icon={PenTool} title="No proposals yet" description={clients.data?.length ? 'Create a proposal for one of your clients.' : 'Add a client, then create their proposal.'}>
                {clients.data?.length ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New proposal</Button> : <Link href="/dashboard/clients?new=1" className={buttonClass({ variant: 'primary' })}>Add client</Link>}
              </EmptyState>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Table>
                  <thead className="sticky top-0 z-10"><tr><Th>Proposal</Th><Th>Status</Th><Th className="text-right">Size</Th><Th className="text-right">Value</Th><Th>Updated</Th></tr></thead>
                  <tbody>
                    {d.recentProposals.map((p) => (
                      <Tr key={p.id}>
                        <Td className="!py-2.5"><Link href={designHref(p)} className="font-medium text-slate-900 hover:text-brand">{p.name}</Link><div className="text-xs text-slate-500">{p.client}{p.type === 'quick' ? ' · no 3D' : ''}</div></Td>
                        <Td className="!py-2.5"><DesignStatusBadge status={p.status} /></Td>
                        <Td className="!py-2.5 text-right whitespace-nowrap tabular-nums">{p.kwp ? `${p.kwp.toFixed(2)} kWp` : '—'}</Td>
                        <Td className="!py-2.5 text-right whitespace-nowrap tabular-nums">{p.value ? compactMoney(p.value, cur) : '—'}</Td>
                        <Td className="!py-2.5 whitespace-nowrap text-slate-500">{timeAgo(p.updatedAt)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      ))}

      {/* Team performance: agents, tasks and installation progress */}
      {tab === 'team' && <div role="tabpanel" className="flex flex-col xl:min-h-0 xl:flex-1"><TeamAnalytics /></div>}

      {creating && <NewDesignModal clients={clients.data} onClose={() => setCreating(false)} />}
    </div>
  );
}
