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
function ColumnChartTooltip({ row, series, format, val, stacked, total }) {
  return (
    <div className="w-max min-w-[8.5rem] max-w-[15rem] rounded-lg bg-slate-900 px-2.5 py-1.5 text-white shadow-lg">
      <div className="mb-0.5 truncate text-[11px] text-slate-300">{row.label}</div>
      {series.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-3 text-xs">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-300">
            <span className="h-0.5 w-2.5 shrink-0" style={{ background: s.color === SERIES_COLORS[2] ? '#e2e8f0' : s.color }} aria-hidden />
            <span className="truncate">{s.label}</span>
          </span>
          <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">{format(val(row, s))}</span>
        </div>
      ))}
      {stacked && series.length > 1 && (
        <div className="mt-0.5 flex justify-between gap-3 border-t border-slate-700 pt-0.5 text-xs">
          <span className="text-slate-300">Total</span>
          <span className="font-semibold tabular-nums">{format(total)}</span>
        </div>
      )}
    </div>
  );
}

export function ColumnChart({ title, description, rows, series, format = (v) => String(Math.round(v)), stacked = false, empty = 'Nothing to show yet.', footer, onBarClick }) {
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
  const axisLabel = (r) => (rows.length <= 6 ? r.label : short(r.label));
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
          <div className="flex min-h-[12rem] flex-1 gap-2 overflow-visible pt-1">
            <div className="relative mb-[22px] w-12 shrink-0 text-right text-[11px] text-slate-400 tabular-nums" aria-hidden>
              {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>{t === 0 ? '0' : format(t)}</span>)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col overflow-visible">
              <div className="relative min-h-0 flex-1 overflow-visible" role="img" aria-label={title}>
                {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ top: `${100 - (t / top) * 100}%` }} aria-hidden />)}
                <div className="absolute inset-0 flex items-end gap-1.5 overflow-visible" onPointerLeave={() => setHover(null)}>
                  {rows.map((r, i) => {
                    const barH = stacked ? (totals[i] / top) * 100 : Math.max(...series.map((s) => (val(r, s) / top) * 100), 0);
                    const tipAlign = i === 0 ? 'left-0 translate-x-0' : i === rows.length - 1 ? 'right-0 left-auto translate-x-0' : 'left-1/2 -translate-x-1/2';
                    return (
                      <div key={r.key} tabIndex={onBarClick ? 0 : undefined} aria-label={`${r.label}: ${series.map((s) => `${s.label} ${format(val(r, s))}`).join(', ')}`}
                        onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                        onClick={() => onBarClick?.(r)}
                        onKeyDown={(e) => { if (onBarClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onBarClick(r); } }}
                        className={cx('relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] overflow-visible rounded-sm outline-none', hover === i && 'bg-slate-100', onBarClick && 'cursor-pointer')}>
                        {hover === i && barH > 0 && (
                          <div
                            className={cx('pointer-events-none absolute z-20 -translate-y-2', tipAlign)}
                            style={{ bottom: `${barH}%` }}
                          >
                            <ColumnChartTooltip row={r} series={series} format={format} val={val} stacked={stacked} total={totals[i]} />
                          </div>
                        )}
                        {stacked ? (
                          totals[i] > 0 && (
                            <div className={cx('flex w-full flex-col-reverse gap-[2px] transition-opacity', barMax, hover != null && hover !== i && 'opacity-60')} style={{ height: `${barH}%` }}>
                              {series.map((s) => val(r, s) > 0 && (
                                <div
                                  key={s.key}
                                  role={onBarClick ? 'button' : undefined}
                                  tabIndex={onBarClick ? 0 : undefined}
                                  className={cx('w-full last:rounded-t-[4px]', onBarClick && 'cursor-pointer hover:brightness-95')}
                                  style={{ flexGrow: val(r, s), flexBasis: 0, background: s.color, minHeight: 2 }}
                                  onClick={(e) => { e.stopPropagation(); onBarClick?.(r, s.key); }}
                                  onKeyDown={(e) => { if (onBarClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); onBarClick(r, s.key); } }}
                                />
                              ))}
                            </div>
                          )
                        ) : series.map((s) => val(r, s) > 0 && (
                          <div key={s.key} className={cx('w-full rounded-t-[4px] transition-opacity', barMax, hover != null && hover !== i && 'opacity-60')} style={{ height: `${(val(r, s) / top) * 100}%`, background: s.color }} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-1.5 flex gap-1.5 text-[11px] text-slate-500" aria-hidden>{rows.map((r, i) => <div key={r.key} className="min-w-0 flex-1 truncate text-center" title={r.label}>{(rows.length - 1 - i) % every === 0 ? axisLabel(r) : ''}</div>)}</div>
            </div>
          </div>
        )}
        {footer}
      </div>
    </Card>
  );
}

/** Semi-circle progress (0–100). Used on the company dashboard. */
export function ArcGauge({ pct, title, subtitle, className }) {
  const p = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
  const r = 38;
  const track = Math.PI * r;
  const filled = (p / 100) * track;
  const path = `M ${50 - r} 54 A ${r} ${r} 0 0 1 ${50 + r} 54`;
  return (
    <div className={cx('flex flex-col items-center justify-center px-2 py-3 text-center', className)}>
      <svg viewBox="0 0 100 64" className="h-[7.5rem] w-full max-w-[12rem]" role="img" aria-label={`${title}: ${p}%`}>
        <path d={path} fill="none" stroke="#e2e8f0" strokeWidth="9" strokeLinecap="round" />
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${filled} ${track}`} />
      </svg>
      <div className="-mt-6 text-[1.65rem] leading-none font-semibold tracking-tight text-slate-900 tabular-nums">{p}%</div>
      <div className="mt-1.5 text-[13px] font-semibold text-slate-800">{title}</div>
      {subtitle && <p className="mt-0.5 max-w-[12rem] text-xs leading-snug text-slate-500">{subtitle}</p>}
    </div>
  );
}

/** Distinct hues for part-to-whole slices, in a fixed order checked for colour-blind separation. */
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

/** Degrees of space between adjacent slices (each slice loses half on each side). */
export const PIE_SLICE_GAP_DEG = 0.35;

function pieSector(cx, cy, r, start, end) {
  const span = Math.min(end - start, 359.99);
  const large = span > 180 ? 1 : 0;
  const rad = (deg) => ((deg - 90) * Math.PI) / 180;
  const [x1, y1] = [cx + r * Math.cos(rad(start)), cy + r * Math.sin(rad(start))];
  const [x2, y2] = [cx + r * Math.cos(rad(start + span)), cy + r * Math.sin(rad(start + span))];
  return `M${cx},${cy}L${x1},${y1}A${r},${r} 0 ${large} 1 ${x2},${y2}Z`;
}

/** Flat 2D pie or donut; legend and captions live in the parent. */
export function PieChart2D({
  arcs,
  format,
  hover,
  setHover,
  clickable,
  pickSlice,
  donut = false,
  center,
}) {
  const chartCx = 50;
  const chartCy = 50;
  const ro = 46;
  const ri = donut ? 30 : 0;
  const pathFor = (a) => (ri > 0 ? arc(chartCx, chartCy, ro, ri, a.start, a.end) : pieSector(chartCx, chartCy, ro, a.start, a.end));

  return (
    <div className={cx('relative mx-auto aspect-square w-full', donut ? 'max-w-[11rem]' : 'max-w-[11.5rem]')}>
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={arcs.map((a) => `${a.label}: ${format(a.value)} (${a.pct}%)`).join(', ')}>
        {arcs.map((a) => (
          <path
            key={a.key}
            d={pathFor(a)}
            fill={a.color}
            stroke={donut ? '#fff' : 'none'}
            strokeWidth={donut ? 0.75 : 0}
            tabIndex={clickable && !a.other ? 0 : undefined}
            aria-label={`${a.label}: ${format(a.value)}, ${a.pct}%`}
            onPointerEnter={() => setHover(a.key)}
            onFocus={() => setHover(a.key)}
            onBlur={() => setHover(null)}
            onClick={() => pickSlice(a)}
            onKeyDown={(e) => { if (clickable && !a.other && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickSlice(a); } }}
            className={cx('outline-none transition-opacity duration-150', clickable && !a.other ? 'cursor-pointer' : 'cursor-default')}
            style={{ opacity: hover && hover !== a.key ? 0.4 : 1 }}
          />
        ))}
      </svg>
      {center && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-2 text-center">
          {center}
        </div>
      )}
    </div>
  );
}

/**
 * A donut for a part-to-whole split. rows: [{ key, label, value }]. More than 7 slices fold into "Other". The legend
 * carries every name, count and share, so nothing depends on telling colours apart; hover or focus a slice or a row.
 */
export function DonutChart({
  rows,
  format = (v) => String(v),
  unit = '',
  sortByValue = true,
  layout = 'horizontal',
  holeLabel = '',
  onSliceClick,
}) {
  const [hover, setHover] = useState(null);
  const clickable = Boolean(onSliceClick);
  const pickSlice = (a) => {
    if (!onSliceClick || a.other) return;
    onSliceClick(a);
  };
  const filtered = rows.filter((r) => r.value > 0);
  const sorted = sortByValue ? [...filtered].sort((a, b) => b.value - a.value) : filtered;
  const slices = sorted.length > 8 ? [...sorted.slice(0, 7), { key: 'other', label: 'Other', value: sorted.slice(7).reduce((a, r) => a + r.value, 0), other: true }] : sorted;
  const total = slices.reduce((a, r) => a + r.value, 0);
  const gap = slices.length > 1 ? PIE_SLICE_GAP_DEG : 0;
  const degrees = (v) => (total ? (v / total) * 360 : 0);
  const arcs = slices.map((s, i) => {
    const at = slices.slice(0, i).reduce((sum, p) => sum + degrees(p.value), 0); // where this slice starts
    return { ...s, color: s.other ? OTHER_COLOR : (s.color || CATEGORY_COLORS[i]), start: at + gap / 2, end: at + degrees(s.value) - gap / 2, pct: total ? Math.round((s.value / total) * 100) : 0 };
  });
  const on = arcs.find((a) => a.key === hover);
  if (!total) return null;

  const holeTitle = on ? on.label : (holeLabel || unit || 'Total');
  const holeValue = format(on ? on.value : total);

  const legend = (
    <ul className={cx('min-w-0 space-y-1', layout === 'vertical' && 'w-full')}>
      {arcs.map((a) => (
        <li
          key={a.key}
          onPointerEnter={() => setHover(a.key)}
          onClick={() => pickSlice(a)}
          onKeyDown={(e) => { if (clickable && !a.other && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickSlice(a); } }}
          tabIndex={clickable && !a.other ? 0 : undefined}
          role={clickable && !a.other ? 'button' : undefined}
          className={cx(
            'rounded-lg px-2 py-1.5',
            layout === 'vertical'
              ? 'flex items-start gap-2.5 text-left'
              : 'grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-0.5 text-sm',
            hover === a.key && 'bg-slate-50 ring-1 ring-slate-200',
            clickable && !a.other && 'cursor-pointer hover:bg-slate-50/80',
          )}
        >
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: a.color }} aria-hidden />
          {layout === 'vertical' ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-slate-800">{a.label}</span>
              <span className="mt-0.5 block whitespace-nowrap text-xs tabular-nums text-slate-600">
                {format(a.value)}
                <span className="text-slate-400"> · </span>
                {a.pct}%
              </span>
            </span>
          ) : (
            <>
              <span className="truncate text-slate-700">{a.label}</span>
              <span className="shrink-0 whitespace-nowrap font-semibold text-slate-900 tabular-nums">{format(a.value)}</span>
              <span className="w-9 shrink-0 text-right text-xs text-slate-500 tabular-nums">{a.pct}%</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );

  const ring = layout === 'vertical' ? (
    <div className="flex w-full flex-col items-center">
      <div className="mb-2 text-center">
        <div className="text-sm font-semibold tabular-nums text-slate-900">{holeValue}</div>
        <div className="text-[10px] leading-snug text-slate-500">{holeTitle}</div>
      </div>
      <PieChart2D
        arcs={arcs}
        format={format}
        hover={hover}
        setHover={setHover}
        clickable={clickable}
        pickSlice={pickSlice}
        donut={false}
      />
    </div>
  ) : (
    <PieChart2D
      arcs={arcs}
      format={format}
      hover={hover}
      setHover={setHover}
      clickable={clickable}
      pickSlice={pickSlice}
      donut
      center={(
        <div className="min-w-0 max-w-full">
          <div className="text-xl font-semibold leading-tight text-slate-900 tabular-nums">{holeValue}</div>
          <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-500">{holeTitle}</div>
        </div>
      )}
    />
  );

  if (layout === 'vertical') {
    return (
      <div className="flex flex-col items-stretch gap-3" onPointerLeave={() => setHover(null)}>
        {ring}
        {legend}
      </div>
    );
  }

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]" onPointerLeave={() => setHover(null)}>
      {ring}
      {legend}
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
                  <defs>
                    <linearGradient id="line-area-brand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {series.map((s, si) => {
                    const pts = rows.map((r, i) => `${x(i)},${y(val(r, s))}`);
                    return (
                      <g key={s.key}>
                        {si === 0 && <polygon points={`${x(0)},100 ${pts.join(' ')} ${x(rows.length - 1)},100`} fill={s.color === SERIES_COLORS[0] ? 'url(#line-area-brand)' : s.color} opacity={s.color === SERIES_COLORS[0] ? 1 : 0.1} />}
                        <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={si === 0 ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
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
          <span className="h-2.5 rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${max ? Math.max(r.value ? 2 : 0, (r.value / max) * 100) : 0}%`, background: r.color || 'var(--brand)' }} /></span>
          <span className="min-w-[4.5rem] text-right font-semibold text-slate-900 tabular-nums">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Rank/compare a handful of categories (e.g. branches): full-width horizontal bars, value always visible.
 * rows: [{ key, label, value, color?, text? }]
 */
export function HorizontalCompareChart({
  title,
  description,
  rows,
  format = (v) => String(Math.round(v)),
  empty = 'Nothing to show yet.',
  sortByValue = true,
  onRowClick,
  footer,
  embedded = false,
}) {
  const sorted = sortByValue ? [...rows].sort((a, b) => (b.value || 0) - (a.value || 0)) : rows;
  const max = Math.max(0, ...sorted.map((r) => r.value || 0));
  const peak = max || 1;

  const body = (
    <>
      {!embedded && title && <CardHeader className="shrink-0 py-3" title={title} description={description} />}
      <div className={cx('flex flex-1 flex-col gap-3', embedded ? '' : 'px-5 py-4')}>
        {!sorted.length || max === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{empty}</p>
        ) : (
          <ul className="space-y-4">
            {sorted.map((r, i) => {
              const pct = Math.max(r.value ? 4 : 0, (r.value / peak) * 100);
              const text = r.text ?? format(r.value);
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    disabled={!onRowClick}
                    onClick={() => onRowClick?.(r)}
                    className={cx(
                      'group w-full rounded-xl px-2 py-2 text-left transition-colors',
                      onRowClick && 'hover:bg-slate-50 focus-visible:bg-slate-50',
                    )}
                  >
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-800">
                        <span className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-semibold text-slate-600 tabular-nums">{i + 1}</span>
                        {r.label}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">{text}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${pct}%`, background: r.color || 'var(--brand)' }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {footer}
      </div>
    </>
  );

  if (embedded) return body;
  return <Card className="flex h-full flex-col">{body}</Card>;
}

/**
 * One horizontal stacked bar per row (branch workload, inventory alerts). Better than thin vertical columns for few rows.
 */
export function StackedRowChart({
  title,
  description,
  rows,
  series,
  format = (v) => String(Math.round(v)),
  empty = 'Nothing to show yet.',
  onSegmentClick,
  footer,
}) {
  const val = (r, s) => Number(r[s.key]) || 0;
  const totalOf = (r) => series.reduce((a, s) => a + val(r, s), 0);
  const peak = Math.max(0, ...rows.map(totalOf));
  const hasData = peak > 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0 py-3" title={title} description={description} />
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        {hasData && series.length > 1 && <Legend series={series} />}
        {!hasData ? (
          <p className="py-8 text-center text-sm text-slate-500">{empty}</p>
        ) : (
          <ul className="space-y-5">
            {rows.map((r) => {
              const total = totalOf(r);
              return (
                <li key={r.key}>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{r.label}</span>
                    <span className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-900 tabular-nums">{format(total)}</span>
                      {' '}total open
                    </span>
                  </div>
                  {total > 0 ? (
                    <>
                      <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                        {series.map((s) => {
                          const n = val(r, s);
                          if (n <= 0) return null;
                          const w = (n / total) * 100;
                          return (
                            <button
                              key={s.key}
                              type="button"
                              disabled={!onSegmentClick}
                              title={`${s.label}: ${format(n)}`}
                              onClick={() => onSegmentClick?.(r, s.key)}
                              className={cx('h-full min-w-[4px] transition-opacity hover:brightness-95 disabled:cursor-default', onSegmentClick && 'cursor-pointer')}
                              style={{ width: `${w}%`, background: s.color }}
                            />
                          );
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                        {series.map((s) => {
                          const n = val(r, s);
                          if (n <= 0) return null;
                          return (
                            <span key={s.key} className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                              {s.label}
                              <span className="font-semibold text-slate-800 tabular-nums">{format(n)}</span>
                            </span>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">Nothing open in this branch</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {footer}
      </div>
    </Card>
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
