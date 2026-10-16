'use client';

// A lead's activity, newest first: the 3 latest entries are shown and the rest fold away behind "Show N earlier".
// Used by the Manual, Meta and Google Ads lead details. Each entry: { at, title, by?, remark?, status?: { name, color } }.
import { ChevronDown, Clock } from 'lucide-react';
import { useState } from 'react';
import { Badge, cx } from '../kit';

const SHOWN = 3;
const STATUS_TONE = { amber: 'amber', blue: 'blue', purple: 'violet', violet: 'violet', rose: 'red', red: 'red', emerald: 'green', green: 'green', slate: 'slate' };
const when = (at) => (at ? new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

export default function LeadLog({ entries, empty = 'Nothing has happened on this lead yet.', className }) {
  const [open, setOpen] = useState(false);
  const sorted = [...entries].filter((e) => e && e.at).sort((a, b) => new Date(b.at) - new Date(a.at));
  const list = open ? sorted : sorted.slice(0, SHOWN);
  const hidden = sorted.length - SHOWN;
  return (
    <div className={cx('rounded-lg border border-slate-200', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <span className="text-[13px] font-semibold text-slate-900">Activity log</span>
        {sorted.length > 0 && <span className="text-xs text-slate-400">{sorted.length} entr{sorted.length === 1 ? 'y' : 'ies'}</span>}
      </div>
      {!sorted.length ? (
        <p className="px-4 py-4 text-[13px] text-slate-500">{empty}</p>
      ) : (
        <ol className="relative px-4 py-3">
          {list.map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
              {/* the timeline's line and dot */}
              {i < list.length - 1 && <span className="absolute top-4 left-[5px] h-full w-px bg-slate-200" aria-hidden />}
              <span className={cx('relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-white', i === 0 ? 'bg-brand' : 'bg-slate-300')} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium text-slate-900">{e.title}</span>
                  {e.status && <Badge tone={STATUS_TONE[e.status.color] || 'slate'}>{e.status.name}</Badge>}
                </div>
                {e.remark && <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-[13px] break-words text-slate-700">“{e.remark}”</p>}
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3 w-3" />{when(e.at)}{e.by ? ` · ${e.by}` : ''}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="flex w-full items-center justify-center gap-1 border-t border-slate-100 px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900">
          <ChevronDown className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} />
          {open ? 'Show fewer' : `Show ${hidden} earlier`}
        </button>
      )}
    </div>
  );
}
