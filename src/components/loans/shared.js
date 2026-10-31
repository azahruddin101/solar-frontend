'use client';

// Bits shared by the company's loan screens and the client portal.
import { Check, ChevronDown, Circle, Loader, Paperclip } from 'lucide-react';
import { Badge, cx, formatDate } from '../kit';

export const LOAN_STATUSES = [
  { id: 'in_progress', label: 'In progress', tone: 'blue' },
  { id: 'completed', label: 'Completed', tone: 'green' },
  { id: 'rejected', label: 'Rejected', tone: 'red' },
];

export function LoanStatusBadge({ status }) {
  const s = LOAN_STATUSES.find((x) => x.id === status) || LOAN_STATUSES[0];
  return <Badge dot tone={s.tone}>{s.label}</Badge>;
}

const ICON = { done: Check, in_progress: Loader, pending: Circle };

/** The loan's steps as a vertical timeline. `renderExtra(step)` adds controls under a step (the company's view). */
/**
 * The loan's steps as a timeline. With `openIds` + `onToggle` each step folds: the header row is a button, and the
 * controls and documents (`renderExtra`) show only for open steps — the step being worked on is open by default.
 */
export function LoanTimeline({ steps, renderExtra, openIds = null, onToggle = null }) {
  const collapsible = Boolean(openIds && onToggle);
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const Icon = ICON[s.status] || Circle;
        const last = i === steps.length - 1;
        const open = !collapsible || openIds.has(s.id);
        const docCount = (s.documents || []).length;
        return (
          <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span className={cx('absolute top-9 left-[17px] h-[calc(100%-2.25rem)] w-0.5', s.status === 'done' ? 'bg-emerald-400' : 'bg-slate-200')} aria-hidden />}
            <span
              className={cx(
                'grid h-9 w-9 shrink-0 place-items-center rounded-full border-2',
                s.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : s.status === 'in_progress' ? 'border-amber-500 bg-amber-50 text-amber-600' : 'border-slate-300 bg-white text-slate-400',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              {collapsible ? (
                <button type="button" onClick={() => onToggle(s.id)} aria-expanded={open} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-slate-50">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-slate-900">{i + 1}. {s.name}</span>
                    {s.status === 'done' && s.completedAt && <span className="text-xs text-emerald-700">Done {formatDate(s.completedAt)}</span>}
                    {s.status === 'in_progress' && <span className="text-xs text-amber-700">In progress</span>}
                    {!open && s.remark && <span className="max-w-[18rem] truncate text-xs text-slate-500">· “{s.remark}”</span>}
                  </span>
                  {docCount > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"><Paperclip className="h-3 w-3" />{docCount}</span>}
                  <ChevronDown className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-slate-900">{i + 1}. {s.name}</span>
                  {s.status === 'done' && s.completedAt && <span className="text-xs text-emerald-700">Done {formatDate(s.completedAt)}</span>}
                  {s.status === 'in_progress' && <span className="text-xs text-amber-700">In progress</span>}
                </div>
              )}
              {open && (
                <>
                  {s.description && <p className="mt-0.5 text-[13px] text-slate-500">{s.description}</p>}
                  {!renderExtra && s.remark && <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">{s.remark}</p>}
                  {renderExtra?.(s)}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
