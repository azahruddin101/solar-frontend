'use client';

// The signed-in user's notification inbox, newest first.
import { Bell, CheckCheck } from 'lucide-react';
import { useCallback } from 'react';
import { api } from '@/lib/api';
import { usePaginatedResource, useResource } from '@/lib/useResource';
import { useUnread } from '@/lib/unread';
import { Alert, Button, Card, EmptyState, LoadingBlock, PageHeader, TablePagination, cx, timeAgo } from '../kit';

const PAGE_SIZE = 10;

export default function Notifications() {
  const setUnread = useUnread((s) => s.set);
  const { items, total, page, setPage, totalPages, loading, error, setItems } = usePaginatedResource('/api/notifications', { limit: PAGE_SIZE });
  const { data: unreadData, reload: reloadUnread } = useResource('/api/notifications/unread-count');
  const unread = unreadData?.unread ?? 0;

  const syncUnread = useCallback((n) => {
    setUnread(n);
    reloadUnread();
  }, [setUnread, reloadUnread]);

  const markRead = (n) => {
    if (n.readAt) return;
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    syncUnread(Math.max(0, unread - 1));
    api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
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
            {items.map((n, index) => {
              const num = (page - 1) * PAGE_SIZE + index + 1;
              return (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => markRead(n)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      markRead(n);
                    }
                  }}
                  className={cx(
                    'flex w-full cursor-default items-start gap-3 px-5 py-4 text-left transition-colors',
                    !n.readAt && 'bg-brand-soft/30 hover:bg-brand-soft/45',
                  )}
                >
                  <span className="w-7 shrink-0 pt-0.5 text-right text-sm font-semibold tabular-nums text-slate-400">{num}</span>
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')} aria-label={n.readAt ? undefined : 'Unread'} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-sm font-semibold text-brand', n.readAt && 'text-slate-700')}>{n.title}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-slate-600">{n.body}</span>
                  </span>
                  <span className="shrink-0 pt-0.5 text-xs text-slate-400" title={new Date(n.createdAt).toLocaleString()}>{timeAgo(n.createdAt)}</span>
                </div>
              );
            })}
          </div>
          <TablePagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </Card>
      )}
    </>
  );
}
