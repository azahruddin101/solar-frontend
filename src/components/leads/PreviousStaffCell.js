'use client';

// "Previously with": who held a lead before it was handed over, latest first, with when they held it on hover.
import { formatDate } from '../kit';

export default function PreviousStaffCell({ lead }) {
  const past = (lead?.assignmentHistory || []).filter((h) => h.endedAt && h.name).reverse(); // latest hand-over first
  if (!past.length) return <span className="text-slate-400">—</span>;
  const [latest, ...older] = past;
  const title = past.map((h) => `${h.name} · ${formatDate(h.assignedAt)} – ${formatDate(h.endedAt)}`).join('\n');
  return (
    <div className="whitespace-nowrap text-slate-700" title={title}>
      <div>{latest.name}</div>
      <div className="text-xs text-slate-500">until {formatDate(latest.endedAt)}{older.length ? ` · +${older.length} earlier` : ''}</div>
    </div>
  );
}
