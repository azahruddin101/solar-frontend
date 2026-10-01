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
function niceMax(max) {
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
        description={`${compactMoney(total, currency)} in the last ${range} months · payments recorded on receipts`}
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
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2 font-medium">Month</th><th className="px-3 py-2 text-right font-medium">Receipts</th><th className="px-3 py-2 text-right font-medium">Received</th></tr></thead>
              <tbody>{[...rows].reverse().map((r) => <tr key={r.key} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{r.label}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.count}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{compactMoney(r.amount, currency)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : total === 0 ? (
          <div className="grid min-h-56 flex-1 place-items-center px-6 text-center text-sm text-slate-400">No payments recorded yet. When you record a payment on a booked proposal, it appears here.</div>
        ) : (
          <div className="flex min-h-32 flex-1 gap-2">
            <div className="relative mb-[22px] w-14 shrink-0 text-right text-[11px] text-slate-400 tabular-nums" aria-hidden>
              {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>{t === 0 ? '0' : compactMoney(t, currency)}</span>)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative flex-1" role="img" aria-label={`Money received per month, last ${range} months: ${compactMoney(total, currency)} in total`}>
                {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ top: `${100 - (t / top) * 100}%` }} aria-hidden />)}
                <div className="absolute inset-0 flex items-end gap-1.5" onPointerLeave={() => setHover(null)}>
                  {rows.map((r, i) => (
                    <div key={r.key} tabIndex={0} aria-label={`${r.label}: ${compactMoney(r.amount, currency)} from ${r.count} receipt${r.count === 1 ? '' : 's'}`}
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
                    <div className="text-[11px] text-slate-300">{shown.label} · {shown.count} receipt{shown.count === 1 ? '' : 's'}</div>
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

const STAGES = [
  { id: 'draft', label: 'Draft', hint: 'Being prepared', bar: 'bg-slate-300' },
  { id: 'proposed', label: 'Proposed', hint: 'Sent to the client', bar: 'bg-slate-500' },
  { id: 'won', label: 'Booked', hint: 'Accepted — ready for payments', bar: 'bg-brand' },
  { id: 'lost', label: 'Lost', hint: 'Not going ahead', bar: 'bg-slate-200' },
];

/** Emphasis chart: Won carries the brand colour, the other stages stay neutral. Count at the tip, value beneath. */
export function PipelineChart({ stages, currency, winRate }) {
  const max = Math.max(1, ...STAGES.map((s) => stages[s.id].count));
  const total = STAGES.reduce((a, s) => a + stages[s.id].count, 0);
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 py-3" title="Proposal pipeline" description={winRate === null ? 'Win rate appears once a proposal is booked or lost.' : `${winRate}% of decided proposals were booked`} />
      {!total ? <div className="px-5 pb-6 text-sm text-slate-400">No proposals yet.</div> : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pt-2.5 pb-3">
          {STAGES.map((s) => {
            const st = stages[s.id];
            return (
              <li key={s.id} title={`${s.label} — ${s.hint}: ${st.count} proposals · ${compactMoney(st.value, currency)}`}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate text-slate-700">{s.label}<span className="ml-2 text-xs text-slate-400 tabular-nums">{st.count ? `${compactMoney(st.value, currency)}${st.kwp ? ` · ${st.kwp.toFixed(1)} kWp` : ''}` : '—'}</span></span>
                  <span className="font-semibold text-slate-900 tabular-nums">{st.count}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100"><div className={cx('h-2 rounded-full', s.bar)} style={{ width: st.count ? `${Math.max(4, (st.count / max) * 100)}%` : 0 }} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ───────────── collections meter ───────────── */

export function CollectionsMeter({ money, currency, wonCount }) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 py-3" title="Collections" action={<span className="text-xs text-slate-500">{wonCount} booked proposal{wonCount === 1 ? '' : 's'}</span>} />
      <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xl leading-none font-semibold text-slate-900 tabular-nums">{money.collectedPct}%</span>
          <span className="text-xs text-slate-500 tabular-nums">{compactMoney(money.collected, currency)} of {compactMoney(money.billed, currency)}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={money.collectedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of booked proposals collected"><div className="h-2 rounded-full bg-brand" style={{ width: `${money.collectedPct}%` }} /></div>
        <div className="mt-2 flex justify-between text-xs text-slate-500"><span>Still to collect</span><span className="font-semibold text-slate-900 tabular-nums">{compactMoney(money.outstanding, currency)}</span></div>
      </div>
    </Card>
  );
}
