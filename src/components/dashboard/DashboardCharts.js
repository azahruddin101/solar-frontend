'use client';

// Dashboard building blocks. The company's brand colour is the one data hue; everything else is neutral, so the
// charts wear the company's theme. Thin marks (columns ≤ 24px, 4px rounded tops), hairline grid, values in text
// tokens, a tooltip on hover/focus for every mark, and a table view for each chart.
import { ArrowDownRight, ArrowUpRight, Table2 } from 'lucide-react';
import { useState } from 'react';
import { CURRENCIES } from '@/lib/energy';
import { Card, CardHeader, cx } from '../kit';

/** ₹3.7 L / ₹1.2 Cr for rupees, a compact form (1.2M) for other currencies. */
export function compactMoney(v, currency = 'INR') {
  const n = Number(v) || 0;
  const c = CURRENCIES[currency] || CURRENCIES.INR;
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (currency === 'INR') {
    if (a >= 1e7) return `${sign}${c.symbol}${(a / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
    if (a >= 1e5) return `${sign}${c.symbol}${(a / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`;
    return `${sign}${c.symbol}${Math.round(a).toLocaleString('en-IN')}`;
  }
  return `${sign}${c.symbol}${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(a)}`;
}

/** Round the top of an axis so the middle gridline is a clean number. */
export function niceMax(max) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 4, 5, 8, 10].map((m) => m * p).find((m) => m >= max);
}

/* ───────────── KPI tile ───────────── */

/** A headline number with an optional change chip and a one-line explanation of what it counts. */
export function Kpi({ label, value, icon: Icon, delta, deltaLabel, hint, tone }) {
  const up = delta > 0;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
        {Icon && <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand"><Icon className="h-4 w-4" /></span>}
      </div>
      <div className={cx('mt-1.5 text-[26px] leading-none font-semibold tracking-tight tabular-nums', tone === 'warn' ? 'text-amber-700' : 'text-slate-900')}>{value}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {delta !== undefined && delta !== null && (
          <span className={cx('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium', delta === 0 ? 'bg-slate-100 text-slate-600' : up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
            {delta === 0 ? '±' : up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta === 0 ? '0%' : `${Math.abs(delta)}%`}
            <span className="sr-only">{up ? 'up' : delta === 0 ? 'no change' : 'down'}</span>
          </span>
        )}
        {deltaLabel && <span>{deltaLabel}</span>}
        {hint && <span>{hint}</span>}
      </div>
    </Card>
  );
}

/* ───────────── revenue columns ───────────── */

export function RevenueChart({ data, currency }) {
  const [range, setRange] = useState(12);
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const rows = data.slice(-range);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const top = niceMax(Math.max(0, ...rows.map((r) => r.amount)));
  const ticks = [0, top / 2, top];
  const best = rows.reduce((b, r, i) => (r.amount > (rows[b]?.amount ?? -1) ? i : b), 0);
  const short = (label) => label.split(' ')[0];
  const shown = hover != null ? rows[hover] : null;

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader
        className="shrink-0 py-3"
        title="Money received"
        description={`${compactMoney(total, currency)} in the last ${range} months · payments taken on bills`}
        action={
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Range" className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
              {[6, 12].map((n) => <button key={n} type="button" aria-pressed={range === n} onClick={() => { setRange(n); setHover(null); }} className={cx('rounded-md px-2.5 py-1 text-xs font-medium', range === n ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>{n}M</button>)}
            </div>
            <button type="button" onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Table2 className="h-3.5 w-3.5" />{table ? 'Chart' : 'Table'}</button>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-3 pb-4">
        {table ? (
          <div className="max-h-[19.2rem] overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2 font-medium">Month</th><th className="px-3 py-2 text-right font-medium">Payments</th><th className="px-3 py-2 text-right font-medium">Received</th></tr></thead>
              <tbody>{[...rows].reverse().map((r) => <tr key={r.key} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{r.label}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.count}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{compactMoney(r.amount, currency)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : total === 0 ? (
          <div className="grid min-h-[16.8rem] flex-1 place-items-center px-6 text-center text-sm text-slate-400">No payments recorded yet. When you record a payment on a booked proposal, it appears here.</div>
        ) : (
          <div className="flex min-h-[9.6rem] flex-1 gap-2">
            <div className="relative mb-[22px] w-14 shrink-0 text-right text-[11px] text-slate-400 tabular-nums" aria-hidden>
              {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>{t === 0 ? '0' : compactMoney(t, currency)}</span>)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative flex-1" role="img" aria-label={`Money received per month, last ${range} months: ${compactMoney(total, currency)} in total`}>
                {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ top: `${100 - (t / top) * 100}%` }} aria-hidden />)}
                <div className="absolute inset-0 flex items-end gap-1.5" onPointerLeave={() => setHover(null)}>
                  {rows.map((r, i) => (
                    <div key={r.key} tabIndex={0} aria-label={`${r.label}: ${compactMoney(r.amount, currency)} from ${r.count} payment${r.count === 1 ? '' : 's'}`}
                      onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                      className={cx('relative flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none', hover === i && 'bg-slate-100')}>
                      {r.amount > 0 && <div className={cx('w-full max-w-6 rounded-t-[4px] bg-brand transition-opacity', hover != null && hover !== i && 'opacity-60')} style={{ height: `${(r.amount / top) * 100}%` }} />}
                      {i === best && r.amount > 0 && hover == null && <span className="pointer-events-none absolute -translate-y-1 text-[11px] font-semibold text-slate-700 tabular-nums" style={{ bottom: `${(r.amount / top) * 100}%` }}>{compactMoney(r.amount, currency)}</span>}
                    </div>
                  ))}
                </div>
                {shown && (
                  <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-white shadow-lg" style={{ left: `${((hover + 0.5) / rows.length) * 100}%`, top: `calc(${100 - (shown.amount / top) * 100}% - 6px)`, minWidth: '5.5rem' }}>
                    <div className="text-sm font-semibold tabular-nums">{compactMoney(shown.amount, currency)}</div>
                    <div className="text-[11px] text-slate-300">{shown.label} · {shown.count} payment{shown.count === 1 ? '' : 's'}</div>
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex gap-1.5 text-[11px] text-slate-400" aria-hidden>{rows.map((r) => <div key={r.key} className="min-w-0 flex-1 text-center whitespace-nowrap">{short(r.label)}</div>)}</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ───────────── pipeline ───────────── */

const BASE_STAGES = [
  { id: 'draft', label: 'Draft', hint: 'Being prepared', fill: '#cbd5e1' },
  { id: 'proposed', label: 'Proposed', hint: 'Sent to the client', fill: '#64748b' },
  { id: 'reproposed', label: 'Reproposed', hint: 'A revised quote sent', fill: '#94a3b8' },
  { id: 'negotiation', label: 'Negotiation', hint: 'Price being discussed', fill: '#475569' },
  { id: 'won', label: 'Booked', hint: 'Accepted — ready for payments', fill: 'var(--brand)' },
  { id: 'lost', label: 'Lost', hint: 'Not going ahead', fill: '#e2e8f0' },
];

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSegment(cx, cy, ro, ri, start, end) {
  const span = Math.min(end - start, 359.98);
  if (span <= 0) return '';
  const e = start + span;
  const so = polar(cx, cy, ro, start);
  const eo = polar(cx, cy, ro, e);
  const si = polar(cx, cy, ri, e);
  const ei = polar(cx, cy, ri, start);
  const large = span > 180 ? 1 : 0;
  return `M ${so.x} ${so.y} A ${ro} ${ro} 0 ${large} 1 ${eo.x} ${eo.y} L ${si.x} ${si.y} A ${ri} ${ri} 0 ${large} 0 ${ei.x} ${ei.y} Z`;
}

/** Donut by proposal value; Booked uses brand colour. Hover a slice or legend row for detail. `fills` ({ won: '#…' }) recolours stages. */
export function PipelineChart({ stages, currency, winRate, fills }) {
  const [hover, setHover] = useState(null);
  const STAGES = fills ? BASE_STAGES.map((s) => ({ ...s, fill: fills[s.id] || s.fill })) : BASE_STAGES;
  const totalCount = STAGES.reduce((a, s) => a + (stages[s.id]?.count || 0), 0);
  const totalValue = STAGES.reduce((a, s) => a + (stages[s.id]?.value || 0), 0);
  const slices = STAGES.map((s) => {
    const st = stages[s.id] || { count: 0, value: 0 };
    const weight = st.value > 0 ? st.value : st.count;
    return { ...s, ...st, weight };
  }).filter((s) => s.weight > 0);
  const sum = slices.reduce((a, s) => a + s.weight, 0);
  const gap = slices.length > 1 ? 2.2 : 0;
  let cursor = 0;
  const arcs = slices.map((s, i) => {
    const share = sum > 0 ? (s.weight / sum) * (360 - gap * slices.length) : 0;
    const start = cursor + gap / 2;
    const end = start + share;
    cursor = end + gap / 2;
    return { ...s, i, start, end, pct: sum > 0 ? Math.round((s.weight / sum) * 100) : 0 };
  });
  const active = hover != null ? arcs.find((a) => a.i === hover) : null;
  const pieX = 50;
  const pieY = 50;
  const ro = 42;
  const ri = 26;

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 py-3" title="Proposal pipeline" description={winRate === null ? 'Win rate appears once a proposal is booked or lost.' : `${winRate}% of decided proposals were booked`} />
      {!totalCount ? <div className="px-5 pb-6 text-sm text-slate-400">No proposals yet.</div> : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-1 pb-4">
          <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-x-4 gap-y-3 overflow-hidden sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:items-start">
            <div className="relative mx-auto aspect-square w-full max-w-[11rem] min-w-0 sm:mx-0 sm:max-w-[min(100%,15rem)] sm:justify-self-center" onPointerLeave={() => setHover(null)}>
              <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-sm" role="img" aria-label={`Proposal pipeline by value: ${compactMoney(totalValue, currency)} across ${totalCount} proposals`}>
                {arcs.map((a) => {
                  const mid = (a.start + a.end) / 2;
                  const push = hover === a.i ? 2.8 : 0;
                  const tx = Math.cos(((mid - 90) * Math.PI) / 180) * push;
                  const ty = Math.sin(((mid - 90) * Math.PI) / 180) * push;
                  return (
                    <g key={a.id} transform={`translate(${tx} ${ty})`} className="transition-transform duration-200">
                      <path
                        d={donutSegment(pieX, pieY, ro, ri, a.start, a.end)}
                        fill={a.fill}
                        className="cursor-pointer transition-opacity duration-200"
                        style={{ opacity: hover == null || hover === a.i ? 1 : 0.42 }}
                        onPointerEnter={() => setHover(a.i)}
                        onFocus={() => setHover(a.i)}
                        onBlur={() => setHover(null)}
                        tabIndex={0}
                        aria-label={`${a.label}: ${a.pct}% · ${compactMoney(a.value, currency)} · ${a.count} proposal${a.count === 1 ? '' : 's'}`}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
            <ul className="min-h-0 min-w-0 space-y-0.5 overflow-y-auto sm:max-h-full">
              {STAGES.map((s) => {
                const st = stages[s.id];
                const arc = arcs.find((a) => a.id === s.id);
                const on = hover === (arc?.i ?? -1);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!st.count}
                      onPointerEnter={() => arc && setHover(arc.i)}
                      onFocus={() => arc && setHover(arc.i)}
                      onBlur={() => setHover(null)}
                      onClick={() => arc && setHover((h) => (h === arc.i ? null : arc.i))}
                      className={cx(
                        'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-2 py-1.5 text-left transition-colors sm:gap-x-2.5',
                        st.count && 'hover:bg-slate-50',
                        on && 'bg-slate-50 ring-1 ring-slate-200',
                      )}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: s.fill }} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-tight text-slate-800">{s.label}</span>
                        <span className="block text-[11px] leading-snug text-slate-400 tabular-nums">
                          {st.count ? `${compactMoney(st.value, currency)}${st.kwp ? ` · ${st.kwp.toFixed(1)} kWp` : ''}` : '—'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right leading-tight">
                        <span className="block text-sm font-semibold text-slate-900 tabular-nums">{st.count}</span>
                        <span className="block text-[10px] text-slate-400 tabular-nums">{arc ? `${arc.pct}%` : '—'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mt-3 flex shrink-0 items-end justify-between gap-4 border-t border-slate-100 pt-3" aria-live="polite">
            {active ? (
              <>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-slate-500">{active.label}</div>
                  <div className="text-lg font-semibold text-slate-900 tabular-nums">{compactMoney(active.value, currency)}</div>
                </div>
                <div className="shrink-0 text-right text-[11px] text-slate-400 tabular-nums">
                  {active.pct}% · {active.count} proposal{active.count === 1 ? '' : 's'}
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-slate-500">Total value</div>
                  <div className="text-lg font-semibold text-slate-900 tabular-nums">{compactMoney(totalValue, currency)}</div>
                </div>
                <div className="shrink-0 text-right text-[11px] text-slate-400 tabular-nums">
                  {totalCount} proposal{totalCount === 1 ? '' : 's'}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ───────────── billing progress meter ───────────── */

export function CollectionsMeter({ money, currency, wonCount }) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 py-3" title="Billed against quotes" action={<span className="text-xs text-slate-500">{wonCount} booked proposal{wonCount === 1 ? '' : 's'}</span>} />
      <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xl leading-none font-semibold text-slate-900 tabular-nums">{money.billedPct}%</span>
          <span className="text-xs text-slate-500 tabular-nums">{compactMoney(money.billed, currency)} of {compactMoney(money.quoted, currency)}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={money.billedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of booked proposals billed"><div className="h-2 rounded-full bg-brand" style={{ width: `${money.billedPct}%` }} /></div>
        <div className="mt-2 flex justify-between text-xs text-slate-500"><span>Yet to bill</span><span className="font-semibold text-slate-900 tabular-nums">{compactMoney(money.yetToBill, currency)}</span></div>
      </div>
    </Card>
  );
}
