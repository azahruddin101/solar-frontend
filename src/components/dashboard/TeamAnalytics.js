'use client';

// Company Overview: how the whole team is doing — headline numbers, a 30-day completion chart, where the open work
// sits (by role and by agent) and how far the installations have got. One hue (the company's brand colour) throughout.
import { ArrowRight, CheckCircle2, ClipboardList, Clock, HardHat, Table2, UserCog, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { assetUrl } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Avatar, Card, CardHeader, EmptyState, LoadingBlock, Table, Td, Th, Tr, cx } from '../kit';
import { Kpi } from './DashboardCharts';

const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function duration(hours) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours % 1 ? hours.toFixed(1) : hours} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

/** Round the top of the axis so the middle gridline is a whole number: 4, 6, 8 … 20, then multiples of 10 (or 100 …). */
function niceMax(max) {
  if (max <= 4) return 4;
  if (max <= 20) return Math.ceil(max / 2) * 2;
  const step = max <= 100 ? 10 : 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
}

/** Tasks completed per day: columns ≤ 24px, 4px rounded tops, hairline grid, tooltip on hover/focus, table on request. */
function TrendChart({ trend }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const total = trend.reduce((n, d) => n + d.count, 0);
  const top = niceMax(Math.max(0, ...trend.map((d) => d.count)));
  const ticks = [0, top / 2, top];
  const shown = hover != null ? trend[hover] : null;

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader
        className="shrink-0 py-3"
        title="Tasks completed"
        description={`${total} in the last 30 days`}
        action={<button type="button" onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Table2 className="h-3.5 w-3.5" />{table ? 'Show chart' : 'Show table'}</button>}
      />
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-2 pb-4">
        {table ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2 font-medium">Day</th><th className="px-3 py-2 text-right font-medium">Tasks completed</th></tr></thead>
              <tbody>{[...trend].reverse().map((d) => <tr key={d.date} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{dayLabel(d.date)}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{d.count}</td></tr>)}</tbody>
            </table>
          </div>
        ) : total === 0 ? (
          <div className="grid min-h-24 flex-1 place-items-center text-sm text-slate-400">No tasks were completed in the last 30 days.</div>
        ) : (
          <div className="flex min-h-24 flex-1 gap-2">
            <div className="relative mb-[18px] w-7 shrink-0 text-right text-[11px] text-slate-400 tabular-nums" aria-hidden>
              {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>{t % 1 ? t.toFixed(1) : t}</span>)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative flex-1" role="img" aria-label={`Tasks completed per day, last 30 days: ${total} in total`}>
                {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ top: `${100 - (t / top) * 100}%` }} aria-hidden />)}
                <div className="absolute inset-0 flex items-end gap-[2px]" onPointerLeave={() => setHover(null)}>
                  {trend.map((d, i) => (
                    <div key={d.date} tabIndex={0} aria-label={`${dayLabel(d.date)}: ${d.count} task${d.count === 1 ? '' : 's'} completed`}
                      onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                      className={cx('flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none', hover === i && 'bg-slate-100')}>
                      {d.count > 0 && <div className={cx('w-full max-w-6 rounded-t-[4px] bg-brand transition-opacity', hover != null && hover !== i && 'opacity-60')} style={{ height: `${(d.count / top) * 100}%` }} />}
                    </div>
                  ))}
                </div>
                {shown && (
                  <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-white shadow-lg" style={{ left: `${((hover + 0.5) / trend.length) * 100}%`, top: `calc(${100 - (shown.count / top) * 100}% - 6px)`, minWidth: '4.5rem' }}>
                    <div className="text-sm font-semibold tabular-nums">{shown.count} task{shown.count === 1 ? '' : 's'}</div>
                    <div className="text-[11px] text-slate-300">{dayLabel(shown.date)}</div>
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex gap-[2px] text-[11px] text-slate-400" aria-hidden>
                {trend.map((d, i) => <div key={d.date} className="min-w-0 flex-1 text-center whitespace-nowrap">{i % 6 === 0 || i === trend.length - 1 ? dayLabel(d.date).replace(' ', ' ') : ''}</div>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Horizontal bars, one hue; the value sits at the tip and the split is in the tooltip (title). */
function RoleBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.open));
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 py-3" title="Open work by role" description="Steps not finished yet, in active installations" />
      {!rows.length ? <div className="px-5 py-4 text-sm text-slate-400">Nothing open right now.</div> : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pt-3 pb-4">
          {rows.map((r) => (
            <li key={r.role} title={`${r.inProgress} in progress · ${r.pending} pending`}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]"><span className="truncate text-slate-700">{r.role}</span><span className="font-semibold text-slate-900 tabular-nums">{r.open}</span></div>
              <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-r-full rounded-l-full bg-brand" style={{ width: `${(r.open / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InstallationProgress({ inst, unassigned }) {
  const pct = inst.stepsTotal ? Math.round((inst.stepsDone / inst.stepsTotal) * 100) : 0;
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 py-3" title="Installations" description="Progress across all installation steps" />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-4">
        <div className="flex items-baseline justify-between"><span className="text-[28px] leading-none font-semibold text-slate-900 tabular-nums">{pct}%</span><span className="text-xs text-slate-500 tabular-nums">{inst.stepsDone} of {inst.stepsTotal} steps done</span></div>
        <div className="mt-3 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Steps completed"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-slate-500">In progress</dt><dd className="font-semibold text-slate-900 tabular-nums">{inst.active}</dd></div>
          <div><dt className="text-xs text-slate-500">Completed</dt><dd className="font-semibold text-slate-900 tabular-nums">{inst.completed}</dd></div>
        </dl>
        {unassigned > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{unassigned} open step{unassigned === 1 ? ' has' : 's have'} no staff member yet.</p>}
      </div>
    </Card>
  );
}

export default function TeamAnalytics() {
  const { data, loading, error } = useResource('/api/agents/analytics');

  return (
    <section className="flex flex-col xl:min-h-0 xl:flex-1" aria-labelledby="team-analytics-title">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 id="team-analytics-title" className="text-base font-semibold text-slate-900">Team performance</h2>
        <Link href="/dashboard/team" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">Manage team <ArrowRight className="h-4 w-4" /></Link>
      </div>
      {error && <Alert className="mb-4">{error}</Alert>}
      {loading && !data ? <LoadingBlock /> : !data ? null : !data.team.agents ? (
        <Card><EmptyState icon={UserCog} title="No team yet" description="Add your staff and assign installation steps to see how the team is doing.">
          <Link href="/dashboard/team" className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-600">Add a staff member</Link>
        </EmptyState></Card>
      ) : (
        <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
          <div className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Active staff" value={`${data.team.activeAgents} of ${data.team.agents}`} icon={Users} />
            <Kpi label="Open tasks" value={data.totals.open} icon={ClipboardList} hint={`${data.totals.inProgress} in progress · ${data.totals.pending} pending`} />
            <Kpi label="Done · 7 days" value={data.totals.done7} icon={CheckCircle2} />
            <Kpi label="Done · 30 days" value={data.totals.done30} icon={CheckCircle2} hint={`${data.totals.done90} in 90 days`} />
            <Kpi label="Avg time per step" value={duration(data.avgStepHours)} icon={Clock} hint="Started to done, last 90 days" />
          </div>

          <div className="grid gap-4 xl:min-h-0 xl:flex-[5] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-h-64 xl:min-h-0"><TrendChart trend={data.trend} /></div>
            <div className="xl:min-h-0"><InstallationProgress inst={data.installations} unassigned={data.totals.unassignedOpen} /></div>
          </div>

          <div className="grid gap-4 xl:min-h-0 xl:flex-[5] xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="flex max-h-96 min-h-0 flex-col overflow-hidden xl:max-h-none">
              <CardHeader className="shrink-0 py-3" title="Staff" description="Current workload and completed tasks" />
              <div className="min-h-0 flex-1 overflow-y-auto">
              <Table>
                <thead className="sticky top-0 z-10"><tr><Th>Staff</Th><Th className="text-right">Open</Th><Th className="text-right">7 days</Th><Th className="text-right">30 days</Th><Th className="text-right">90 days</Th></tr></thead>
                <tbody>
                  {[...data.agents].sort((a, b) => b.done30 - a.done30 || b.open - a.open || a.name.localeCompare(b.name)).map((a) => (
                    <Tr key={a.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={a.name} src={a.photo ? assetUrl(a.photo) : undefined} size={32} />
                          <div className="min-w-0"><div className="truncate font-medium text-slate-900">{a.name}{!a.active && <span className="ml-2 text-xs font-normal text-slate-400">inactive</span>}</div>{a.roles.length > 0 && <div className="truncate text-xs text-slate-500">{a.roles.join(' · ')}</div>}</div>
                        </div>
                      </Td>
                      <Td className="text-right tabular-nums" title={`${a.inProgress} in progress · ${a.pending} pending`}>{a.open}</Td>
                      <Td className="text-right tabular-nums">{a.done7}</Td>
                      <Td className="text-right tabular-nums">{a.done30}</Td>
                      <Td className="text-right tabular-nums">{a.done90}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              </div>
            </Card>
            <div className="max-h-72 xl:max-h-none xl:min-h-0"><RoleBars rows={data.byRole} /></div>
          </div>
        </div>
      )}
    </section>
  );
}
