'use client';

// A list of support conversations, for either channel (see channelOf in ./shared): a company's tickets with the
// platform (every company's for the platform admin), or client support between a company and its clients.
import { LifeBuoy, Plus, RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { usePagedResource } from '@/lib/useResource';
import { clientTicketCreateSchema, ticketCreateSchema, useValidation } from '@/lib/validation';
import { useUnread } from '@/lib/unread';
import { Alert, Badge, Button, Card, EmptyState, FormField, FormModal, Input, LoadingBlock, LoadMoreRow, PageHeader, Select, Textarea, cx, timeAgo } from '../kit';
import { TICKET_PRIORITIES, TICKET_STATUSES, TicketStatusBadge, channelOf, labelOf } from './shared';
import Composer from './Composer';

function NewTicket({ c, withClient, onClose, onCreated }) {
  const [form, setForm] = useState({ subject: '', category: c.categories.find((x) => x.id === 'service')?.id || c.categories[0].id, priority: 'normal', body: '', ...(withClient ? { clientId: '' } : {}) });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clients = useResource(withClient ? '/api/clients?limit=200' : null);
  const v = useValidation(withClient || c.api !== '/api/tickets' ? clientTicketCreateSchema : ticketCreateSchema, form);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const data = v.validate();
    if (!data) return;
    if (withClient && !data.clientId) { setError('Choose the client'); return; }
    if (!data.body && !files.length) { setError('Describe the problem or attach a file'); return; }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(data).forEach(([k, val]) => fd.append(k, val));
      files.forEach((f) => fd.append('files', f));
      onCreated(await api(c.api, { method: 'POST', form: fd }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={c.newTitle} description={c.newDescription} submitLabel="Send" busy={busy} error={error} onSubmit={submit} noValidate>
      {withClient && (
        <FormField label="Client">
          <Select value={form.clientId} onValue={(x) => set({ clientId: x })} disabled={!clients.data}>
            <option value="">{clients.data ? 'Choose a client…' : 'Loading clients…'}</option>
            {(clients.data?.items || []).map((cl) => <option key={cl.id} value={cl.id}>{cl.name}{cl.phone ? ` · ${cl.phone}` : ''}</option>)}
          </Select>
        </FormField>
      )}
      <FormField label="Subject" error={v.error('subject')}><Input value={form.subject} onValue={(x) => set({ subject: x })} maxLength={150} autoFocus /></FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Category"><Select value={form.category} onValue={(v) => set({ category: v })}>{c.categories.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></FormField>
        <FormField label="Priority"><Select value={form.priority} onValue={(v) => set({ priority: v })}>{TICKET_PRIORITIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></FormField>
      </div>
      <FormField label={withClient ? 'Message' : 'Describe the problem'} error={v.error('body')}><Textarea rows={5} value={form.body} onValue={(x) => set({ body: x })} maxLength={4000} /></FormField>
      <FormField label="Attachments" optional hint="Images or PDFs, up to 5 files, 10 MB each."><Composer.Attach files={files} setFiles={setFiles} /></FormField>
    </FormModal>
  );
}

export default function TicketList({ admin = false, basePath, channel = 'platform', embedded = false }) {
  const router = useRouter();
  const c = channelOf(channel, admin);
  const may = useCan();
  const base = basePath || (channel === 'clients' ? '/dashboard/client-support' : channel === 'portal' ? '/portal/support' : admin ? '/admin/support' : '/dashboard/support');
  // starting one: a client always; the company with Reply permission (client support); the company's platform tickets as before
  const canCreate = Boolean(c.newLabel) && (channel !== 'clients' || may('helpdesk', 'update'));
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState(''); // the search that is applied (on Search / Enter)
  const [creating, setCreating] = useState(false);
  const { items: data, total, loading, error, reload, hasMore, loadingMore, loadMore } = usePagedResource(`${c.api}?${new URLSearchParams({ ...(status && { status }), ...(q && { q }) })}`, { limit: 50 });
  const refreshBadge = useUnread((s) => s.refresh);

  const refresh = async () => { await reload(); refreshBadge(); };

  const actions = (
    <>
      <Button icon={RefreshCw} onClick={refresh}>Refresh</Button>
      {canCreate && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{c.newLabel}</Button>}
    </>
  );

  return (
    <>
      {embedded ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>
      ) : (
        <PageHeader title={c.title} description={c.description}>{actions}</PageHeader>
      )}

      <form className="mb-4 flex max-w-md gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setQ(query.trim()); }}>
        <Input value={query} onValue={setQuery} placeholder={c.search} aria-label="Search tickets" />
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
        <Card><EmptyState icon={LifeBuoy} title={q ? 'Nothing matches' : channel === 'platform' ? 'No tickets' : 'No requests yet'} description={q ? 'Try a different ID or subject.' : c.empty}>
          {canCreate && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{c.newLabel}</Button>}
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
                  {c.party(t) && <span className="font-medium text-slate-600">{c.party(t)}</span>}
                  <span>{labelOf(c.categories, t.category)}</span>
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

      {creating && <NewTicket c={c} withClient={channel === 'clients'} onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); router.push(`${base}/${t.id}`); }} />}
    </>
  );
}
