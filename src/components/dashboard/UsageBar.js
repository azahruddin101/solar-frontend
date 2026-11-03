// Small usage-vs-cap bar: slate normally, amber from 80%, red when full.
export function usageTone(used, max) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return { pct, full: max > 0 && used >= max, warn: pct >= 80 };
}

export default function UsageBar({ used = 0, max = 0, className = '' }) {
  const { pct, full, warn } = usageTone(used, max);
  const color = full ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-blue-600';
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={used}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
