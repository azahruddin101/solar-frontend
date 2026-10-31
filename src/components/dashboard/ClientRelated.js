'use client';

// Everything else about one client, under their details: installations and each one's steps, money billed and
// received on bills, with invoices, loans, AMC visits, support requests and expenses. Each block shows only when
// the person may see that area (the API leaves it out otherwise).
import { BadgeIndianRupee, AlertTriangle, CalendarClock, CircleCheck, FileText, HardHat, Headset, Landmark, ReceiptText, WalletCards } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { formatMoney } from '@/lib/energy';
import { stepPriority } from '@/lib/steps';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Card, LoadingBlock, Table, Td, Th, Tr, capName, cx, formatDate } from '../kit';
import { Progress, ProjectStatusBadge } from '../installations/shared';

const LOAN_STATUS = { in_progress: { label: 'In progress', tone: 'blue' }, completed: { label: 'Completed', tone: 'green' }, rejected: { label: 'Rejected', tone: 'red' } };
const TICKET_TONE = { open: 'amber', in_progress: 'blue', resolved: 'green', closed: 'slate' };

/** One colour per area, so a glance tells the blocks apart: the header band, the icon chip and the link share it. */
export const AREA_TONE = {
  proposals: { band: 'bg-brand-soft/50 border-brand/15', chip: 'bg-brand text-white', link: 'text-brand-ink', title: 'text-brand-ink' },
  installations: { band: 'bg-sky-50/80 border-sky-100', chip: 'bg-sky-600 text-white', link: 'text-sky-700', title: 'text-sky-950' },
  billing: { band: 'bg-emerald-50/80 border-emerald-100', chip: 'bg-emerald-600 text-white', link: 'text-emerald-700', title: 'text-emerald-950' },
  loans: { band: 'bg-violet-50/80 border-violet-100', chip: 'bg-violet-600 text-white', link: 'text-violet-700', title: 'text-violet-950' },
  subsidies: { band: 'bg-fuchsia-50/80 border-fuchsia-100', chip: 'bg-fuchsia-600 text-white', link: 'text-fuchsia-700', title: 'text-fuchsia-950' },
  amc: { band: 'bg-teal-50/80 border-teal-100', chip: 'bg-teal-600 text-white', link: 'text-teal-700', title: 'text-teal-950' },
  support: { band: 'bg-amber-50/80 border-amber-100', chip: 'bg-amber-500 text-white', link: 'text-amber-700', title: 'text-amber-950' },
  expenses: { band: 'bg-rose-50/80 border-rose-100', chip: 'bg-rose-500 text-white', link: 'text-rose-700', title: 'text-rose-950' },
  slate: { band: 'bg-slate-50 border-slate-100', chip: 'bg-slate-600 text-white', link: 'text-slate-700', title: 'text-slate-900' },
};

function Section({ icon: Icon, tone = 'slate', title, sub, href, linkLabel = 'Open', children }) {
  const t = AREA_TONE[tone] || AREA_TONE.slate;
  return (
    <Card className="overflow-hidden">
      <div className={cx('flex items-center justify-between gap-3 border-b px-6 py-3.5', t.band)}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg shadow-sm', t.chip)}><Icon className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h3 className={cx('font-semibold', t.title)}>{title}</h3>
            {sub && <p className="truncate text-xs text-slate-600">{sub}</p>}
          </div>
        </div>
        {href && <Link href={href} className={cx('shrink-0 text-sm font-medium hover:underline', t.link)}>{linkLabel}</Link>}
      </div>
      {children}
    </Card>
  );
}

/** The small heading of a side-column card: an icon chip in the area's colour and the uppercase label. */
export function SideHeading({ icon: Icon, tone = 'slate', children, right }) {
  const t = AREA_TONE[tone] || AREA_TONE.slate;
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
        <span className={cx('grid h-6 w-6 place-items-center rounded-md', t.chip)}><Icon className="h-3.5 w-3.5" /></span>
        {children}
      </h3>
      {right}
    </div>
  );
}

const Empty = ({ children }) => <p className="px-6 py-5 text-sm text-slate-500">{children}</p>;
const dayWord = (n) => (n == null ? 'No date' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} late` : n === 0 ? 'Today' : `In ${n} day${n === 1 ? '' : 's'}`);

/** The overview of one client (GET /api/clients/:id/overview), fetched once by the page and shared by its blocks. */
export const useClientOverview = (clientId) => useResource(`/api/clients/${clientId}/overview`);

const useMoney = () => {
  const company = useSession((s) => s.company);
  return useMemo(() => (v) => formatMoney(v, company?.currency || 'INR', { decimals: 0 }), [company?.currency]);
};

/** Booked value, received and balance due — one compact card for the page's side column. */
export function ClientMoneyCard({ overview }) {
  const money = useMoney();
  const billing = overview.data?.billing;
  if (!billing || !billing.rows.length) return null;
  const rows = [
    { label: 'Booked value', value: money(billing.total), hint: `${billing.rows.length} booked proposal${billing.rows.length === 1 ? '' : 's'}` },
    { label: 'Billed & received', value: money(billing.paid), hint: `${billing.payments.length} payment${billing.payments.length === 1 ? '' : 's'}`, tone: 'text-emerald-700' },
    billing.balance < -0.005
      ? { label: 'Billed above quote', value: money(-billing.balance), hint: 'More billed than the quotes' }
      : { label: 'Yet to bill', value: money(billing.balance), hint: billing.balance > 0 ? 'Quoted, not billed yet' : 'Everything quoted is billed' },
  ];
  return (
    <Card className="p-5">
      <SideHeading icon={WalletCards} tone="billing">Money</SideHeading>
      <dl className="divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <dt><span className="block text-sm text-slate-700">{r.label}</span><span className="block text-xs text-slate-500">{r.hint}</span></dt>
            <dd className={cx('text-lg font-semibold tracking-tight tabular-nums', r.tone || 'text-slate-900')}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default function ClientRelated({ overview, basePath = '/dashboard/clients' }) {
  const agent = basePath.startsWith('/agent');
  const root = agent ? '/agent' : '/dashboard';
  const money = useMoney();
  const { data, loading, error } = overview;
  if (loading) return <LoadingBlock />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const { installations, billing, loans, subsidies, amc, tickets, expenses } = data;
  const openVisits = (amc || []).filter((v) => v.status !== 'completed');

  return (
    <div className="mt-6 space-y-6">
      {installations && (
        <Section icon={HardHat} tone="installations" title="Installations" sub={installations.length ? `${installations.length} installation${installations.length === 1 ? '' : 's'} · every step and who is on it` : undefined} href={`${root}/installations`} linkLabel="All installations">
          {installations.length ? (
            <div className="divide-y divide-slate-100">
              {installations.map((p) => (
                <div key={p.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`${root}/installations/${p.id}`} className="font-medium text-slate-900 hover:text-brand hover:underline">{capName(p.design.name)}</Link>
                      <div className="text-xs text-slate-500">Started {formatDate(p.startedAt)}{p.installationCompletedAt ? ` · completed ${formatDate(p.installationCompletedAt)}` : p.current ? ` · now on ${p.current.name}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress project={{ steps: p.steps }} className="w-40" />
                      <ProjectStatusBadge status={p.status} />
                    </div>
                  </div>
                  <ol className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {p.steps.map((s) => (
                      <li key={s.id} className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', s.status === 'done' ? 'border-slate-100 bg-slate-50/60' : s.id === p.current?.id ? 'border-brand/40 bg-brand-soft/40' : 'border-slate-200')}>
                        <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold', s.status === 'done' ? 'bg-emerald-500 text-white' : s.status === 'in_progress' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500')}>{s.status === 'done' ? <CircleCheck className="h-3 w-3" /> : s.index}</span>
                        <span className="min-w-0 flex-1">
                          <span className={cx('block truncate', s.status === 'done' ? 'text-slate-500' : 'font-medium text-slate-900')}>{s.name}</span>
                          <span className="block truncate text-xs text-slate-500">{s.assignee?.name || 'Unassigned'}{s.stuck && <span className="ml-1 inline-flex items-center gap-0.5 text-red-600"><AlertTriangle className="h-3 w-3" />stuck</span>}</span>
                        </span>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stepPriority(s).color }} title={`${stepPriority(s).label} priority`} />
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          ) : <Empty>No installation started for this client yet.</Empty>}
        </Section>
      )}

      {billing && (
        <Section icon={ReceiptText} tone="billing" title="Billing & invoices" sub={billing.rows.length ? `${money(billing.paid)} received of ${money(billing.total)}` : undefined} href={`${root}/billing`} linkLabel="Billing">
          {billing.rows.length ? (
            <>
              <Table>
                <thead><tr><Th>Proposal</Th><Th className="text-right">Value</Th><Th className="text-right">Billed & received</Th><Th className="text-right">Yet to bill</Th><Th>Last bill</Th></tr></thead>
                <tbody>
                  {billing.rows.map((r) => (
                    <Tr key={r.id}>
                      <Td><Link href={`${root}/billing/${r.id}`} className="font-medium text-slate-900 hover:text-brand hover:underline">{capName(r.name)}</Link></Td>
                      <Td className="text-right tabular-nums">{money(r.total)}</Td>
                      <Td className="text-right tabular-nums text-emerald-700">{money(r.paid)}</Td>
                      <Td className="text-right font-medium tabular-nums text-slate-500">{r.balance < -0.005 ? 'Above quote' : money(r.balance)}</Td>
                      <Td className="text-slate-600">{r.lastPaidOn ? formatDate(r.lastPaidOn) : '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              {(billing.invoices.length > 0 || billing.payments.length > 0) && (
                <div className="grid gap-0 border-t border-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-slate-100">
                  <div className="px-6 py-4">
                    <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Invoices ({billing.invoices.length})</div>
                    {billing.invoices.length ? (
                      <ul className="divide-y divide-slate-100 text-sm">
                        {billing.invoices.slice(0, 8).map((i) => (
                          <li key={i.id} className="flex items-center justify-between gap-3 py-1.5">
                            <span className="min-w-0 truncate"><FileText className="mr-1.5 inline h-3.5 w-3.5 text-slate-400" />{i.invoiceNo}<span className="text-slate-500"> · {i.design ? capName(i.design.name) : 'Direct'}</span></span>
                            <span className="shrink-0 text-slate-600 tabular-nums">{money(i.total)} · {formatDate(i.issuedOn)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-slate-500">No invoice yet.</p>}
                  </div>
                  <div className="px-6 py-4">
                    <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Payments ({billing.payments.length})</div>
                    {billing.payments.length ? (
                      <ul className="divide-y divide-slate-100 text-sm">
                        {billing.payments.slice(0, 8).map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                            <span className="min-w-0 truncate">{p.receiptNo}<span className="text-slate-500"> · {p.design ? capName(p.design.name) : 'Direct'} · {p.mode}</span></span>
                            <span className="shrink-0 text-emerald-700 tabular-nums">{money(p.amount)} · {formatDate(p.receivedOn)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-slate-500">Nothing received yet.</p>}
                  </div>
                </div>
              )}
            </>
          ) : <Empty>Nothing to bill yet — billing starts once a proposal is booked.</Empty>}
        </Section>
      )}

      {loans && (
        <Section icon={Landmark} tone="loans" title="Loans" sub={loans.length ? `${loans.length} loan${loans.length === 1 ? '' : 's'}` : undefined} href={`${root}/loans`} linkLabel="All loans">
          {loans.length ? (
            <Table>
              <thead><tr><Th>Proposal</Th><Th>Lender</Th><Th className="text-right">Amount</Th><Th>Progress</Th><Th>Status</Th></tr></thead>
              <tbody>
                {loans.map((l) => (
                  <Tr key={l.id}>
                    <Td><Link href={`${root}/loans/${l.id}`} className="font-medium text-slate-900 hover:text-brand hover:underline">{capName(l.design.name)}</Link></Td>
                    <Td className="text-slate-700">{l.lender || '—'}</Td>
                    <Td className="text-right tabular-nums">{l.amount != null ? money(l.amount) : '—'}</Td>
                    <Td><div className="text-slate-700">{l.done}/{l.total} steps</div>{l.currentStep && <div className="text-xs text-slate-500">now: {l.currentStep}</div>}</Td>
                    <Td><Badge dot tone={LOAN_STATUS[l.status]?.tone || 'slate'}>{LOAN_STATUS[l.status]?.label || l.status}</Badge></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : <Empty>No loan for this client.</Empty>}
        </Section>
      )}

      {subsidies && (
        <Section icon={BadgeIndianRupee} tone="subsidies" title="Subsidies" sub={subsidies.length ? `${subsidies.length} subsidy file${subsidies.length === 1 ? '' : 's'}` : undefined} href={`${root}/subsidies`} linkLabel="All subsidies">
          {subsidies.length ? (
            <Table>
              <thead><tr><Th>Proposal</Th><Th>Scheme</Th><Th className="text-right">Expected</Th><Th className="text-right">Received</Th><Th>Progress</Th><Th>Status</Th></tr></thead>
              <tbody>
                {subsidies.map((l) => (
                  <Tr key={l.id}>
                    <Td><Link href={`${root}/subsidies/${l.id}`} className="font-medium text-slate-900 hover:text-brand hover:underline">{capName(l.design.name)}</Link></Td>
                    <Td className="text-slate-700">{l.scheme || '—'}</Td>
                    <Td className="text-right tabular-nums">{l.expected ? money(l.expected) : '—'}</Td>
                    <Td className="text-right tabular-nums">{l.received != null ? money(l.received) : '—'}</Td>
                    <Td><div className="text-slate-700">{l.done}/{l.total} steps</div>{l.currentStep && <div className="text-xs text-slate-500">now: {l.currentStep}</div>}</Td>
                    <Td><Badge dot tone={LOAN_STATUS[l.status]?.tone || 'slate'}>{LOAN_STATUS[l.status]?.label || l.status}</Badge></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : <Empty>No subsidy for this client.</Empty>}
        </Section>
      )}

      {amc && (
        <Section icon={CalendarClock} tone="amc" title="AMC visits" sub={amc.length ? `${openVisits.length} open · ${amc.length - openVisits.length} done` : undefined} href={`${root}/amc`} linkLabel="AMC tracker">
          {amc.length ? (
            <Table>
              <thead><tr><Th>Visit</Th><Th>Installation</Th><Th>Due</Th><Th>Staff</Th><Th>Status</Th></tr></thead>
              <tbody>
                {amc.map((v) => (
                  <Tr key={v.id}>
                    <Td><div className="font-medium text-slate-900">{v.name}</div><div className="text-xs text-slate-500">{v.free ? 'Free' : 'Paid'} · {v.kind}</div></Td>
                    <Td className="text-slate-700">{v.design ? capName(v.design.name) : '—'}</Td>
                    <Td><div className="tabular-nums text-slate-900">{v.dueDate ? formatDate(v.dueDate) : '—'}</div>{v.status !== 'completed' && <div className={cx('text-xs', v.daysLeft != null && v.daysLeft < 0 ? 'font-medium text-red-600' : 'text-slate-500')}>{v.booked ? dayWord(v.daysLeft) : 'Not booked yet'}</div>}</Td>
                    <Td className="text-slate-700">{v.assignee?.name || <span className="text-amber-700">Not assigned</span>}</Td>
                    <Td>{v.status === 'completed' ? <Badge dot tone="green">Done {v.completedAt ? formatDate(v.completedAt) : ''}</Badge> : <Badge dot tone={v.assignee ? 'blue' : 'amber'}>{v.assignee ? 'Scheduled' : 'To assign'}</Badge>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : <Empty>No AMC visit yet — they are scheduled once an installation is completed.</Empty>}
        </Section>
      )}

      <div className={cx('grid gap-6', tickets && expenses && 'lg:grid-cols-2')}>
        {tickets && (
          <Section icon={Headset} tone="support" title="Support requests" sub={tickets.length ? `${tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length} open` : undefined} href={`${root}/client-support`} linkLabel="Client support">
            {tickets.length ? (
              <ul className="divide-y divide-slate-100">
                {tickets.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <Link href={`${root}/client-support/${t.id}`} className="flex items-center justify-between gap-3 px-6 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{t.subject}</span><span className="block text-xs text-slate-500">{t.ref} · {t.messageCount} message{t.messageCount === 1 ? '' : 's'} · {formatDate(t.updatedAt)}</span></span>
                      <span className="flex shrink-0 items-center gap-2">{t.teamUnread > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">{t.teamUnread}</span>}<Badge dot tone={TICKET_TONE[t.status] || 'slate'}>{t.status.replace('_', ' ')}</Badge></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>No support request from this client.</Empty>}
          </Section>
        )}
        {expenses && (
          <Section icon={WalletCards} tone="expenses" title="Expenses" sub={expenses.rows.length ? `${money(expenses.total)} spent on their projects` : undefined} href={`${root}/expenses`} linkLabel="Expenses">
            {expenses.rows.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {expenses.rows.map((e) => (
                  <li key={e.design.id}>
                    <Link href={`${root}/expenses/${e.design.id}`} className="flex items-center justify-between gap-3 px-6 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{capName(e.design.name)}</span><span className="block text-xs text-slate-500">{e.count} entr{e.count === 1 ? 'y' : 'ies'} · last {formatDate(e.last)}</span></span>
                      <span className="shrink-0 tabular-nums text-slate-900">{money(e.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>No expense recorded on their projects.</Empty>}
          </Section>
        )}
      </div>
    </div>
  );
}
