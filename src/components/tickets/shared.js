'use client';

import { FileText } from 'lucide-react';
import { openFile, useSignedUrl } from '@/lib/files';
import { Badge, ZoomImage, cx } from '../kit';

export const TICKET_STATUSES = [
  { id: 'open', label: 'Open', tone: 'blue' },
  { id: 'in_progress', label: 'In progress', tone: 'amber' },
  { id: 'resolved', label: 'Resolved', tone: 'green' },
  { id: 'closed', label: 'Closed', tone: 'slate' },
];
export const TICKET_CATEGORIES = [
  { id: 'technical', label: 'Technical issue' },
  { id: 'billing', label: 'Billing' },
  { id: 'account', label: 'Account' },
  { id: 'other', label: 'Other' },
];
export const TICKET_PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
];

export const labelOf = (list, id) => list.find((x) => x.id === id)?.label || id;

export function TicketStatusBadge({ status }) {
  const s = TICKET_STATUSES.find((x) => x.id === status) || TICKET_STATUSES[0];
  return <Badge dot tone={s.tone}>{s.label}</Badge>;
}

export const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** An image (opens in the pop-up viewer) or a PDF card. `mine`: shown inside the sender's own coloured bubble. */
export function Attachment({ file, mine }) {
  const isImage = file.mime?.startsWith('image/');
  const src = useSignedUrl(isImage ? file.url : '');
  if (isImage) {
    return src
      ? <ZoomImage src={src} alt={file.name} className="h-36 w-full min-w-[9rem] rounded-lg object-cover ring-1 ring-black/10 transition hover:brightness-95 sm:h-40" />
      : <span className="block h-36 w-full min-w-[9rem] animate-pulse rounded-lg bg-slate-200/70 sm:h-40" aria-label="Loading image" />;
  }
  return (
    <button type="button" onClick={() => openFile(file.url)} className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] ring-1 transition', mine ? 'bg-white/15 text-white ring-white/25 hover:bg-white/25' : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100')}>
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-md', mine ? 'bg-white/20' : 'bg-red-50 text-red-600')}><FileText className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{file.name}</span>
        <span className={cx('text-xs', mine ? 'text-white/70' : 'text-slate-400')}>PDF · {fmtSize(file.size)}</span>
      </span>
    </button>
  );
}
