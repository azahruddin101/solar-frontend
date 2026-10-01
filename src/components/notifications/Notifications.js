'use client';

// The signed-in user's notification inbox, newest first.
import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { api } from '@/lib/api';
import { usePaginatedResource, useResource } from '@/lib/useResource';
import { useUnread } from '@/lib/unread';
import { Alert, Button, Card, EmptyState, LoadingBlock, PageHeader, TablePagination, cx, timeAgo } from '../kit';

const PAGE_SIZE = 10;

export default function Notifications() {
  const router = useRouter();
  const setUnread = useUnread((s) => s.set);
  const { items, total, page, setPage, totalPages, loading, error, setItems } = usePaginatedResource('/api/notifications', { limit: PAGE_SIZE });
  const { data: unreadData, reload: reloadUnread } = useResource('/api/notifications/unread-count');
  const unread = unreadData?.unread ?? 0;

  const syncUnread = useCallback((n) => {
    setUnread(n);
    reloadUnread();
  }, [setUnread, reloadUnread]);

  const open = async (n) => {
    if (!n.readAt) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      syncUnread(Math.max(0, unread - 1));
      api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    }
    if (n.path) router.push(n.path);
  };

  const readAll = async () => {
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      setItems((cur) => cur.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
      syncUnread(0);
    } catch (e) {
      /* error surfaced via reload if needed */
    }
  };

  return (
    <>
      <PageHeader title="Notifications" description="Updates on your installations, newest first.">
        {unread > 0 && <Button icon={CheckCheck} onClick={readAll}>Mark all as read</Button>}
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      {loading && !items.length ? <LoadingBlock /> : !items.length ? (
        <Card><EmptyState icon={Bell} title="No notifications yet" description="When an installation step changes status, you’ll see it here." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100">
            {items.map((n) => (
              <button key={n.id} type="button" onClick={() => open(n)} className={cx('flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50', !n.readAt && 'bg-brand-soft/40')}>
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')} aria-label={n.readAt ? undefined : 'Unread'} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-sm text-slate-900', !n.readAt && 'font-semibold')}>{n.title}</span>
                  <span className="mt-0.5 block text-[13px] text-slate-600">{n.body}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400" title={new Date(n.createdAt).toLocaleString()}>{timeAgo(n.createdAt)}</span>
              </button>
            ))}
          </div>
          <TablePagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </Card>
      )}
    </>
  );
}
