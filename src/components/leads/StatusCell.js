'use client';

// A lead's status in a list: the badge, and under it the date that status booked (red once it has passed).
import { CalendarClock, History } from 'lucide-react';
import { formatSchedule, isOverdue } from '@/lib/leadSchedule';
import { Badge, cx } from '../kit';

const STATUS_TONE = { amber: 'amber', blue: 'blue', purple: 'violet', violet: 'violet', rose: 'red', red: 'red', emerald: 'green', green: 'green', slate: 'slate' };

export default function StatusCell({ status, scheduledAt, rescheduledCount = 0, previousSchedules = [] }) {
  const before = previousSchedules.map((p) => formatSchedule(p.scheduledAt)).join(', ');
  return (
    <div className="space-y-1">
      {status ? <Badge tone={STATUS_TONE[status.color] || 'slate'}>{status.name}</Badge> : <span className="text-[13px] text-slate-400">Not started</span>}
      {scheduledAt && (
        <div className={cx('flex items-center gap-1 text-xs whitespace-nowrap', isOverdue(scheduledAt) ? 'text-red-600' : 'text-slate-500')} title={isOverdue(scheduledAt) ? 'The date has passed' : undefined}>
          <CalendarClock className="h-3 w-3" />{formatSchedule(scheduledAt)}
        </div>
      )}
      {rescheduledCount > 0 && (
        <div className="flex items-center gap-1 text-xs font-medium whitespace-nowrap text-violet-700" title={before ? `Before: ${before}` : undefined}>
          <History className="h-3 w-3" />Rescheduled{rescheduledCount > 1 ? ` ×${rescheduledCount}` : ''}
        </div>
      )}
    </div>
  );
}
