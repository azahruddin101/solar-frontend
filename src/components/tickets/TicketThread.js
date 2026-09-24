'use client';

// One conversation: messages, reply box, status, and the audit log. No websocket — Refresh pulls the latest.
import { ArrowLeft, MessageSquare, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useUnread } from '@/lib/unread';
import { Alert, Avatar, Button, Card, LoadingBlock, Select, Tabs, cx, formatDate, toast } from '../kit';
import Composer from './Composer';
import { Attachment, TICKET_CATEGORIES, TICKET_STATUSES, TicketStatusBadge, labelOf } from './shared';

const stamp = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const clock = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayKey = (d) => new Date(d).toDateString();
function dayLabel(d) {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
const GROUP_GAP_MS = 5 * 60 * 1000; // consecutive messages from one person within 5 min share a header

/** Messages and status changes in time order, each message flagged when it continues the previous one. */
function buildTimeline(ticket, isMine) {
  const events = [
    ...ticket.messages.map((m) => ({ kind: 'message', at: new Date(m.createdAt), m })),
    ...ticket.logs.filter((l) => l.action === 'status_changed' || l.action === 'reopened').map((l) => ({ kind: 'event', at: new Date(l.at), l })),
  ].sort((a, b) => a.at - b.at);
  const out = [];
  let prev = null;
  let lastDay = '';
  for (const e of events) {
    if (dayKey(e.at) !== lastDay) {
      lastDay = dayKey(e.at);
      out.push({ kind: 'day', key: `day-${lastDay}`, at: e.at });
      prev = null;
    }
    if (e.kind === 'message') {
      const cont = prev && prev.kind === 'message' && prev.m.author === e.m.author && e.at - prev.at < GROUP_GAP_MS;
      out.push({ ...e, key: e.m.id, mine: isMine(e.m), cont });
    } else out.push({ ...e, key: e.l.id });
    prev = out.at(-1);
  }
  return out;
}

const ACTIONS = { created: 'Ticket opened', message: 'Message', status_changed: 'Status changed', reopened: 'Reopened' };

export default function TicketThread({ id, admin = false }) {
  const me = useSession((s) => s.user);
  const refreshBadge = useUnread((s) => s.refresh);
  const base = admin ? '/admin/support' : '/dashboard/support';
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const [tab, setTab] = useState('chat');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const end = useRef(null);
  const lastCount = useRef(0);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setTicket(await api(`/api/tickets/${id}`));
      setCheckedAt(new Date());
      setError('');
      refreshBadge();
    } catch (e) { setError(e.message); } finally { setRefreshing(false); }
  }, [id, refreshBadge]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // scroll to the newest message when the conversation grows
  useEffect(() => {
    const n = ticket?.messages?.length || 0;
    if (n > lastCount.current) end.current?.scrollIntoView({ behavior: lastCount.current ? 'smooth' : 'auto', block: 'end' });
    lastCount.current = n;
  }, [ticket, tab]);

  const send = async () => {
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('body', text);
      files.forEach((f) => fd.append('files', f));
      setTicket(await api(`/api/tickets/${id}/messages`, { method: 'POST', form: fd }));
      setText('');
      setFiles([]);
    } catch (e) { toast.error(e.message); } finally { setSending(false); }
  };

  const setStatus = async (status) => {
    try { setTicket(await api(`/api/tickets/${id}/status`, { method: 'PUT', body: { status } })); } catch (e) { toast.error(e.message); }
  };

  const isMine = useCallback((m) => m.author === me.id || (admin ? m.authorRole === 'superadmin' : m.authorRole === 'company'), [me.id, admin]);
  const timeline = useMemo(() => (ticket ? buildTimeline(ticket, isMine) : []), [ticket, isMine]);

  if (error && !ticket) return <><Link href={base} className="mb-4 inline-flex items-center gap-1 text-sm text-brand hover:underline"><ArrowLeft className="h-4 w-4" /> Support</Link><Alert>{error}</Alert></>;
  if (!ticket) return <LoadingBlock />;

  const closed = ticket.status === 'closed';
  const adminBlocked = admin && closed;
  return (
    <>
      <Link href={base} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"><ArrowLeft className="h-4 w-4" /> All tickets</Link>

      <Card className="mb-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-400">{ticket.ref}</div>
            <h1 className="text-lg font-semibold text-slate-900">{ticket.subject}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {admin && <span className="font-medium text-slate-700">{ticket.company?.name}</span>}
              <span>{labelOf(TICKET_CATEGORIES, ticket.category)}</span>
              <span>{ticket.priority === 'high' ? 'High priority' : `${ticket.priority} priority`}</span>
              <span>Opened {formatDate(ticket.createdAt)}{ticket.createdBy?.name ? ` by ${ticket.createdBy.name}` : ''}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {admin ? (
              <Select value={ticket.status} onValue={setStatus} aria-label="Ticket status" className="!w-40">{TICKET_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
            ) : (
              <>
                <TicketStatusBadge status={ticket.status} />
                {!closed && <Button size="sm" onClick={() => setStatus('closed')}>Close ticket</Button>}
                {['resolved', 'closed'].includes(ticket.status) && <Button size="sm" onClick={() => setStatus('open')}>Reopen</Button>}
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'chat', label: 'Conversation' }, { id: 'log', label: `Activity log (${ticket.logs.length})` }]} />
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {checkedAt && <span>Updated {checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <Button size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>Refresh</Button>
        </div>
      </div>
      {error && <Alert className="mb-3">{error}</Alert>}

      {tab === 'chat' ? (
        <Card className="overflow-hidden">
          <div className="max-h-[60vh] min-h-64 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] bg-[length:22px_22px] bg-slate-50 px-3 py-4 sm:px-6">
            {!timeline.length ? (
              <div className="grid min-h-40 place-items-center text-center text-sm text-slate-400"><span><MessageSquare className="mx-auto mb-2 h-6 w-6" />No messages yet</span></div>
            ) : timeline.map((row) => {
              if (row.kind === 'day') return <div key={row.key} className="my-4 flex justify-center"><span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">{dayLabel(row.at)}</span></div>;
              if (row.kind === 'event') return <div key={row.key} className="my-3 flex justify-center px-4"><span className="max-w-full rounded-full bg-slate-200/70 px-3 py-1 text-center text-[11px] text-slate-600">{row.l.byName} · {row.l.message} · {clock(row.at)}</span></div>;
              const { m, mine, cont } = row;
              const hasText = Boolean(m.body);
              const images = (m.attachments || []).filter((a) => a.mime?.startsWith('image/'));
              const docs = (m.attachments || []).filter((a) => !a.mime?.startsWith('image/'));
              return (
                <div key={row.key} className={cx('flex items-end gap-2', mine ? 'flex-row-reverse' : 'flex-row', cont ? 'mt-0.5' : 'mt-4')}>
                  <div className="w-8 shrink-0">{!cont && <Avatar name={m.authorName} size={32} />}</div>
                  <div className={cx('flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
                    {!cont && <div className="mb-1 px-1 text-xs text-slate-500"><span className="font-medium text-slate-700">{m.authorName}</span>{m.authorRole === 'superadmin' && <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-px text-[10px] font-medium text-slate-600 uppercase">Admin</span>}</div>}
                    <div className={cx('max-w-full space-y-2 px-3.5 py-2 text-sm shadow-sm', mine ? 'bg-brand text-brand-fg' : 'bg-white text-slate-800 ring-1 ring-slate-200', mine ? (cont ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-br-md') : (cont ? 'rounded-2xl rounded-tl-md' : 'rounded-2xl rounded-bl-md'))}>
                      {images.length > 0 && <div className={cx('grid gap-1.5', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>{images.map((a) => <Attachment key={a.id || a.url} file={a} mine={mine} />)}</div>}
                      {docs.map((a) => <Attachment key={a.id || a.url} file={a} mine={mine} />)}
                      {hasText && <p className="break-words whitespace-pre-wrap">{m.body}</p>}
                      <div className={cx('text-right text-[10px] leading-none', mine ? 'text-white/70' : 'text-slate-400')}>{clock(m.createdAt)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={end} />
          </div>
          <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
            {adminBlocked ? <p className="rounded-lg bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">This ticket is closed. The company can reopen it to continue.</p> : (
              <Composer text={text} setText={setText} files={files} setFiles={setFiles} busy={sending} onSend={send} />
            )}
          </div>
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100">
          {[...ticket.logs].reverse().map((l) => (
            <div key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-3 text-[13px]">
              <span className="w-32 shrink-0 text-xs text-slate-400">{stamp(l.at)}</span>
              <span className="font-medium text-slate-800">{ACTIONS[l.action] || l.action}</span>
              <span className="text-slate-600">{l.message}</span>
              <span className="ml-auto text-xs text-slate-400">{l.byName}{l.byRole === 'superadmin' ? ' · Admin' : ''}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
