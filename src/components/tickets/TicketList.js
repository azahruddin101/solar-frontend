'use client';

// Support tickets: the company's own, or every company's for the platform admin.
import { LifeBuoy, Plus, RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { usePagedResource } from '@/lib/useResource';
import { ticketCreateSchema, useValidation } from '@/lib/validation';
import { useUnread } from '@/lib/unread';
import { Alert, Badge, Button, Card, EmptyState, FormField, FormModal, Input, LoadingBlock, LoadMoreRow, PageHeader, Select, Textarea, cx, timeAgo } from '../kit';
import { Attachment, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, TicketStatusBadge, labelOf } from './shared';
import Composer from './Composer';

function NewTicket({ onClose, onCreated }) {
  const [form, setForm] = useState({ subject: '', category: 'technical', priority: 'normal', body: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const v = useValidation(ticketCreateSchema, form);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const data = v.validate();
    if (!data) return;
    if (!data.body && !files.length) { setError('Describe the problem or attach a file'); return; }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(data).forEach(([k, val]) => fd.append(k, val));
      files.forEach((f) => fd.append('files', f));
      onCreated(await api('/api/tickets', { method: 'POST', form: fd }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title="New support ticket" description="Tell the platform team what you need help with." submitLabel="Send ticket" busy={busy} error={error} onSubmit={submit} noValidate>
      <FormField label="Subject" error={v.error('subject')}><Input value={form.subject} onValue={(x) => set({ subject: x })} maxLength={150} autoFocus /></FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Category"><Select value={form.category} onValue={(v) => set({ category: v })}>{TICKET_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></FormField>
        <FormField label="Priority"><Select value={form.priority} onValue={(v) => set({ priority: v })}>{TICKET_PRIORITIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></FormField>
      </div>
      <FormField label="Describe the problem" error={v.error('body')}><Textarea rows={5} value={form.body} onValue={(x) => set({ body: x })} maxLength={4000} /></FormField>
      <FormField label="Attachments" optional hint="Images or PDFs, up to 5 files, 10 MB each."><Composer.Attach files={files} setFiles={setFiles} /></FormField>
    </FormModal>
  );
}

export default function TicketList({ admin = false, basePath }) {
  const router = useRouter();
  const base = basePath || (admin ? '/admin/support' : '/dashboard/support');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState(''); // the search that is applied (on Search / Enter)
  const [creating, setCreating] = useState(false);
  const { items: data, total, loading, error, reload, hasMore, loadingMore, loadMore } = usePagedResource(`/api/tickets?${new URLSearchParams({ ...(status && { status }), ...(q && { q }) })}`, { limit: 50 });
  const refreshBadge = useUnread((s) => s.refresh);

  const refresh = async () => { await reload(); refreshBadge(); };

  return (
    <>
      <PageHeader title="Support" description={admin ? 'Tickets from every company, newest activity first.' : 'Ask the platform team for help. Replies show up here.'}>
        <Button icon={RefreshCw} onClick={refresh}>Refresh</Button>
        {!admin && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New ticket</Button>}
      </PageHeader>

      <form className="mb-4 flex max-w-md gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setQ(query.trim()); }}>
        <Input value={query} onValue={setQuery} placeholder="Search by ticket ID (TKT-…) or subject" aria-label="Search tickets" />
        {q && <Button type="button" icon={X} aria-label="Clear search" onClick={() => { setQuery(''); setQ(''); }} />}
        <Button type="submit" variant="primary" icon={Search}>Search</Button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {[{ id: '', label: 'All' }, ...TICKET_STATUSES].map((s) => (
          <button key={s.id} type="button" onClick={() => setStatus(s.id)} className={cx('rounded-full px-3 py-1 text-[13px] font-medium ring-1 ring-inset', status === s.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>{s.label}</button>
        ))}
      </div>

      {error && <Alert className="mb-6">{error}</Alert>}
      {loading && !data ? <LoadingBlock /> : !data?.length ? (
        <Card><EmptyState icon={LifeBuoy} title={q ? 'No matching tickets' : 'No tickets'} description={q ? 'Try a different ticket ID or subject.' : admin ? 'Nothing here yet.' : 'Need help? Open a ticket and the platform team will reply here.'}>
          {!admin && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New ticket</Button>}
        </EmptyState></Card>
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {data.map((t) => {
            const last = t.messages?.at(-1);
            return (
              <Link key={t.id} href={`${base}/${t.id}`} className={cx('block px-5 py-4 hover:bg-slate-50', t.unread > 0 && 'bg-brand-soft/40')}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs font-medium text-slate-400">{t.ref}</span>
                  <span className={cx('min-w-0 flex-1 truncate text-sm text-slate-900', t.unread > 0 && 'font-semibold')}>{t.subject}</span>
                  {t.unread > 0 && <Badge tone="brand">{t.unread} new</Badge>}
                  <TicketStatusBadge status={t.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  {admin && <span className="font-medium text-slate-600">{t.company?.name}</span>}
                  <span>{labelOf(TICKET_CATEGORIES, t.category)}</span>
                  {t.priority === 'high' && <span className="font-medium text-red-600">High priority</span>}
                  <span>{t.messageCount} message{t.messageCount === 1 ? '' : 's'}</span>
                  <span className="ml-auto">{timeAgo(t.lastMessageAt)}</span>
                </div>
                {last && <p className="mt-1.5 line-clamp-1 text-[13px] text-slate-600">{last.authorName}: {last.body || (last.attachments?.length ? 'Sent an attachment' : '')}</p>}
              </Link>
            );
          })}
          <LoadMoreRow hasMore={hasMore} loadingMore={loadingMore} onClick={loadMore} loaded={data.length} total={total} />
        </Card>
      )}

      {creating && <NewTicket onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); router.push(`${base}/${t.id}`); }} />}
    </>
  );
}
