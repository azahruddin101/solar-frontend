'use client';

// Charts for the main dashboard, in the same style as DashboardCharts: the company's brand colour is the lead hue,
// slate greys carry the other series, columns are thin with rounded tops, gridlines are hairlines, every mark shows its
// values on hover/focus, and each column chart has a table view.
import { CalendarClock, HardHat, Megaphone, Table2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Card, CardHeader, cx } from '../kit';
import { niceMax } from './DashboardCharts';

/** Series colours, in order: brand first, then two greys that stay apart from it and from each other. */
export const SERIES_COLORS = ['var(--brand)', '#64748b', '#cbd5e1'];

function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
    </div>
  );
}

/**
 * Columns per row (month), one or more series side by side — or stacked with `stacked`.
 * rows: [{ key, label, [series.key]: number }]; series: [{ key, label, color }]; format: value → text.
 */
export function ColumnChart({ title, description, rows, series, format = (v) => String(Math.round(v)), stacked = false, empty = 'Nothing to show yet.', footer }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const val = (r, s) => Number(r[s.key]) || 0;
  const totals = rows.map((r) => series.reduce((a, s) => a + val(r, s), 0));
  const peak = stacked ? Math.max(0, ...totals) : Math.max(0, ...rows.flatMap((r) => series.map((s) => val(r, s))));
  // whole-number data (counts) gets whole-number gridlines: a top that halves evenly, at least 2
  const counts = rows.every((r) => series.every((s) => Number.isInteger(val(r, s))));
  const nice = niceMax(peak);
  const top = counts ? Math.max(2, nice % 2 ? nice + 1 : nice) : nice;
  const ticks = [0, top / 2, top];
  const short = (label) => label.split(' ')[0];
  const shown = hover != null ? rows[hover] : null;
  const every = rows.length > 14 ? Math.ceil(rows.length / 8) : 1; // long series (days): label every few columns, always the latest
  const barMax = series.length > 1 && !stacked ? 'max-w-3' : 'max-w-6';

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader
        className="shrink-0 py-3"
        title={title}
        description={description}
        action={<button type="button" onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Table2 className="h-3.5 w-3.5" />{table ? 'Chart' : 'Table'}</button>}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pt-3 pb-4">
        {!table && peak > 0 && <Legend series={series} />}
        {table ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2 font-medium">Month</th>{series.map((s) => <th key={s.key} className="px-3 py-2 text-right font-medium">{s.label}</th>)}</tr></thead>
              <tbody>{[...rows].reverse().map((r) => <tr key={r.key} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{r.label}</td>{series.map((s) => <td key={s.key} className="px-3 py-1.5 text-right text-slate-900 tabular-nums">{format(val(r, s))}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : peak === 0 ? (
          <div className="grid min-h-[12rem] flex-1 place-items-center px-6 text-center text-sm text-slate-400">{empty}</div>
        ) : (
          <div className="flex min-h-[12rem] flex-1 gap-2">
            <div className="relative mb-[22px] w-12 shrink-0 text-right text-[11px] text-slate-400 tabular-nums" aria-hidden>
              {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>{t === 0 ? '0' : format(t)}</span>)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative flex-1" role="img" aria-label={title}>
                {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ top: `${100 - (t / top) * 100}%` }} aria-hidden />)}
                <div className="absolute inset-0 flex items-end gap-1.5" onPointerLeave={() => setHover(null)}>
                  {rows.map((r, i) => (
                    <div key={r.key} tabIndex={0} aria-label={`${r.label}: ${series.map((s) => `${s.label} ${format(val(r, s))}`).join(', ')}`}
                      onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                      className={cx('relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-sm outline-none', hover === i && 'bg-slate-100')}>
                      {stacked ? (
                        totals[i] > 0 && (
                          <div className={cx('flex w-full flex-col-reverse gap-[2px] transition-opacity', barMax, hover != null && hover !== i && 'opacity-60')} style={{ height: `${(totals[i] / top) * 100}%` }}>
                            {series.map((s) => val(r, s) > 0 && <div key={s.key} className="w-full last:rounded-t-[4px]" style={{ flexGrow: val(r, s), flexBasis: 0, background: s.color, minHeight: 2 }} />)}
                          </div>
                        )
                      ) : series.map((s) => val(r, s) > 0 && (
                        <div key={s.key} className={cx('w-full rounded-t-[4px] transition-opacity', barMax, hover != null && hover !== i && 'opacity-60')} style={{ height: `${(val(r, s) / top) * 100}%`, background: s.color }} />
                      ))}
                    </div>
                  ))}
                </div>
                {shown && (
                  <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-white shadow-lg" style={{ left: `${Math.min(80, Math.max(20, ((hover + 0.5) / rows.length) * 100))}%`, minWidth: '8.5rem' }}>
                    <div className="mb-0.5 text-[11px] text-slate-300">{shown.label}</div>
                    {series.map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-300"><span className="h-0.5 w-2.5 shrink-0" style={{ background: s.color === SERIES_COLORS[2] ? '#e2e8f0' : s.color }} />{s.label}</span>
                        <span className="font-semibold whitespace-nowrap tabular-nums">{format(val(shown, s))}</span>
                      </div>
                    ))}
                    {stacked && series.length > 1 && <div className="mt-0.5 flex justify-between gap-3 border-t border-slate-700 pt-0.5 text-xs"><span className="text-slate-300">Total</span><span className="font-semibold tabular-nums">{format(totals[hover])}</span></div>}
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex gap-1.5 text-[11px] text-slate-400" aria-hidden>{rows.map((r, i) => <div key={r.key} className="min-w-0 flex-1 text-center whitespace-nowrap">{(rows.length - 1 - i) % every === 0 ? short(r.label) : ''}</div>)}</div>
            </div>
          </div>
        )}
        {footer}
      </div>
    </Card>
  );
}

/** Distinct hues for the slices of a part-to-whole chart, in a fixed order checked for colour-blind separation. */
export const CATEGORY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const OTHER_COLOR = '#cbd5e1';

function arc(cx, cy, ro, ri, start, end) {
  const pt = (r, deg) => [cx + r * Math.cos(((deg - 90) * Math.PI) / 180), cy + r * Math.sin(((deg - 90) * Math.PI) / 180)];
  const span = Math.min(end - start, 359.99);
  const large = span > 180 ? 1 : 0;
  const [x1, y1] = pt(ro, start);
  const [x2, y2] = pt(ro, start + span);
  const [x3, y3] = pt(ri, start + span);
  const [x4, y4] = pt(ri, start);
  return `M${x1},${y1}A${ro},${ro} 0 ${large} 1 ${x2},${y2}L${x3},${y3}A${ri},${ri} 0 ${large} 0 ${x4},${y4}Z`;
}

/**
 * A donut for a part-to-whole split. rows: [{ key, label, value }]. More than 7 slices fold into "Other". The legend
 * carries every name, count and share, so nothing depends on telling colours apart; hover or focus a slice or a row.
 */
export function DonutChart({ rows, format = (v) => String(v), unit = '' }) {
  const [hover, setHover] = useState(null);
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const slices = sorted.length > 8 ? [...sorted.slice(0, 7), { key: 'other', label: 'Other', value: sorted.slice(7).reduce((a, r) => a + r.value, 0), other: true }] : sorted;
  const total = slices.reduce((a, r) => a + r.value, 0);
  const gap = slices.length > 1 ? 1.6 : 0; // degrees of surface between slices
  const degrees = (v) => (total ? (v / total) * 360 : 0);
  const arcs = slices.map((s, i) => {
    const at = slices.slice(0, i).reduce((sum, p) => sum + degrees(p.value), 0); // where this slice starts
    return { ...s, color: s.other ? OTHER_COLOR : CATEGORY_COLORS[i], start: at + gap / 2, end: at + degrees(s.value) - gap / 2, pct: total ? Math.round((s.value / total) * 100) : 0 };
  });
  const on = arcs.find((a) => a.key === hover);
  if (!total) return null;
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]" onPointerLeave={() => setHover(null)}>
      <div className="relative mx-auto aspect-square w-full max-w-[11rem]">
        <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={arcs.map((a) => `${a.label}: ${format(a.value)} (${a.pct}%)`).join(', ')}>
          {arcs.map((a) => (
            <path key={a.key} d={arc(50, 50, 46, 30, a.start, a.end)} fill={a.color} tabIndex={0} aria-label={`${a.label}: ${format(a.value)}, ${a.pct}%`}
              onPointerEnter={() => setHover(a.key)} onFocus={() => setHover(a.key)} onBlur={() => setHover(null)}
              className="cursor-default outline-none transition-opacity" style={{ opacity: hover && hover !== a.key ? 0.35 : 1 }} />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xl leading-none font-semibold text-slate-900 tabular-nums">{format(on ? on.value : total)}</div>
            <div className="mt-1 max-w-[5.5rem] truncate text-[11px] text-slate-500">{on ? on.label : unit || 'in total'}</div>
          </div>
        </div>
      </div>
      <ul className="min-w-0 space-y-0.5">
        {arcs.map((a) => (
          <li key={a.key} onPointerEnter={() => setHover(a.key)}
            className={cx('grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm', hover === a.key && 'bg-slate-50 ring-1 ring-slate-200')}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} aria-hidden />
            <span className="truncate text-slate-700">{a.label}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{format(a.value)}</span>
            <span className="w-10 text-right text-xs text-slate-500 tabular-nums">{a.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A trend over time: one or more lines with a light wash under the first, a dot per point and a hover guide that
 * reads every series at that point. Same card, table view and axis rules as ColumnChart.
 * rows: [{ key, label, [series.key]: number }]; series: [{ key, label, color }].
 */
export function LineChart({ title, description, rows, series, format = (v) => String(Math.round(v)), empty = 'Nothing to show yet.' }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const val = (r, s) => Number(r[s.key]) || 0;
  const peak = Math.max(0, ...rows.flatMap((r) => series.map((s) => val(r, s))));
  const counts = rows.every((r) => series.every((s) => Number.isInteger(val(r, s))));
  const nice = niceMax(peak);
  const top = counts ? Math.max(2, nice % 2 ? nice + 1 : nice) : nice;
  const ticks = [0, top / 2, top];
  const x = (i) => ((i + 0.5) / rows.length) * 100; // centred over its label, as the columns are
  const y = (v) => 100 - (v / top) * 100;
  const shown = hover != null ? rows[hover] : null;
  const every = rows.length > 14 ? Math.ceil(rows.length / 8) : 1;

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader
        className="shrink-0 py-3"
        title={title}
        description={description}
        action={<button type="button" onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Table2 className="h-3.5 w-3.5" />{table ? 'Chart' : 'Table'}</button>}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pt-3 pb-4">
        {!table && peak > 0 && <Legend series={series} />}
        {table ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2 font-medium">Month</th>{series.map((s) => <th key={s.key} className="px-3 py-2 text-right font-medium">{s.label}</th>)}</tr></thead>
              <tbody>{[...rows].reverse().map((r) => <tr key={r.key} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{r.label}</td>{series.map((s) => <td key={s.key} className="px-3 py-1.5 text-right text-slate-900 tabular-nums">{format(val(r, s))}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : peak === 0 ? (
          <div className="grid min-h-[12rem] flex-1 place-items-center px-6 text-center text-sm text-slate-400">{empty}</div>
        ) : (
          <div className="flex min-h-[12rem] flex-1 gap-2">
            <div className="relative mb-[22px] w-12 shrink-0 text-right text-[11px] text-slate-400 tabular-nums" aria-hidden>
              {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(t)}%` }}>{t === 0 ? '0' : format(t)}</span>)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative flex-1" role="img" aria-label={`${title}: ${rows.map((r) => `${r.label} ${series.map((s) => format(val(r, s))).join(' / ')}`).join(', ')}`}>
                {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ top: `${y(t)}%` }} aria-hidden />)}
                {shown && <div className="pointer-events-none absolute inset-y-0 border-l border-slate-300" style={{ left: `${x(hover)}%` }} aria-hidden />}
                {/* the lines stretch with the card; the dots are HTML so they stay round at any width */}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                  {series.map((s, si) => {
                    const pts = rows.map((r, i) => `${x(i)},${y(val(r, s))}`);
                    return (
                      <g key={s.key}>
                        {si === 0 && <polygon points={`${x(0)},100 ${pts.join(' ')} ${x(rows.length - 1)},100`} fill={s.color} opacity="0.1" />}
                        <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                      </g>
                    );
                  })}
                </svg>
                {series.map((s) => rows.map((r, i) => (
                  <span key={`${s.key}-${r.key}`} className={cx('pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-transform', hover === i && 'scale-125')} style={{ left: `${x(i)}%`, top: `${y(val(r, s))}%`, background: s.color }} aria-hidden />
                )))}
                {/* one hit area per point, as wide as its slot */}
                <div className="absolute inset-0 flex" onPointerLeave={() => setHover(null)}>
                  {rows.map((r, i) => (
                    <div key={r.key} tabIndex={0} className="h-full flex-1 outline-none" aria-label={`${r.label}: ${series.map((s) => `${s.label} ${format(val(r, s))}`).join(', ')}`}
                      onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                  ))}
                </div>
                {shown && (
                  <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-white shadow-lg" style={{ left: `${Math.min(80, Math.max(20, x(hover)))}%`, minWidth: '8.5rem' }}>
                    <div className="mb-0.5 text-[11px] text-slate-300">{shown.label}</div>
                    {series.map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-300"><span className="h-0.5 w-2.5 shrink-0" style={{ background: s.color === SERIES_COLORS[2] ? '#e2e8f0' : s.color }} />{s.label}</span>
                        <span className="font-semibold whitespace-nowrap tabular-nums">{format(val(shown, s))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex gap-1.5 text-[11px] text-slate-400" aria-hidden>{rows.map((r, i) => <div key={r.key} className="min-w-0 flex-1 text-center whitespace-nowrap">{(rows.length - 1 - i) % every === 0 ? r.label.split(' ')[0] : ''}</div>)}</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Labelled horizontal bars; each value is written beside its bar. rows: [{ key, label, value, text, color? }] */
export function BarList({ rows, labelWidth = '9rem' }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key} className="grid items-center gap-3 text-sm" style={{ gridTemplateColumns: `minmax(0, ${labelWidth}) minmax(0, 1fr) auto` }} title={`${r.label}: ${r.text}`}>
          <span className="truncate text-slate-600">{r.label}</span>
          <span className="h-3 rounded-r bg-slate-100"><span className="block h-full rounded-r" style={{ width: `${max ? Math.max(r.value ? 2 : 0, (r.value / max) * 100) : 0}%`, background: r.color || 'var(--brand)' }} /></span>
          <span className="min-w-[4.5rem] text-right font-semibold text-slate-900 tabular-nums">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

/** A small trend line for a stat tile: the past in grey, the latest point in the brand colour. */
export function Sparkline({ values, className }) {
  const W = 120;
  const H = 28;
  if (values.length < 2 || values.every((v) => !v)) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => [3 + (i * (W - 6)) / (values.length - 1), 4 + (H - 8) * (max === min ? 0.5 : 1 - (v - min) / (max - min))]);
  // the SVG stretches to the tile's width, so the latest period is a brand-coloured last segment rather than a dot
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cx('h-7 w-full', className)} aria-hidden>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <polyline points={pts.slice(-2).map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ───────────── kinds of work (staff table, staff page) ───────────── */

/** Each kind of work in the staff table has its own colour: header band, column wash and number chips. */
export const WORK = {
  tasks: { label: 'Installation tasks', icon: HardHat, head: 'bg-sky-50 text-sky-800', wash: 'bg-sky-50/40', chip: 'bg-sky-100 text-sky-800 ring-sky-200' },
  leads: { label: 'Leads', icon: Megaphone, head: 'bg-violet-50 text-violet-800', wash: 'bg-violet-50/40', chip: 'bg-violet-100 text-violet-800 ring-violet-200' },
  visits: { label: 'Service visits', icon: CalendarClock, head: 'bg-teal-50 text-teal-800', wash: 'bg-teal-50/40', chip: 'bg-teal-100 text-teal-800 ring-teal-200' },
};
/** Numbers that mean something on their own wear that meaning instead of the group colour. */
export const CHIP_TONE = {
  good: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-100 text-amber-800 ring-amber-200',
  bad: 'bg-red-100 text-red-700 ring-red-200',
};

/** A number in the staff table: a coloured chip that opens the matching list, or a faint dash when it is zero. */
export function Chip({ n, href, group, tone }) {
  if (!n) return <span className="text-slate-300" aria-label="none">–</span>;
  const cls = cx('inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset', tone ? CHIP_TONE[tone] : WORK[group].chip);
  return href ? <Link href={href} className={cx(cls, 'transition-shadow hover:shadow-sm hover:ring-2')}>{n}</Link> : <span className={cls}>{n}</span>;
}
