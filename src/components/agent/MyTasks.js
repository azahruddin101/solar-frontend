'use client';

// The agent's home: installations where they hold a step, the ones needing action first.
import { ChevronRight, ClipboardList, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Card, EmptyState, LoadingBlock, PageHeader } from '../kit';
import { Progress, StepStatusBadge, StepPriorityBadge } from '../installations/shared';

export default function MyTasks() {
  const user = useSession((s) => s.user);
  const { data, loading, error } = useResource('/api/my/projects');

  const rows = (data || []).map((p) => ({ project: p, mine: p.steps.filter((s) => s.assignee?.id === user.id) }));
  const open = rows.filter((r) => r.mine.some((s) => s.status !== 'done'));
  const finished = rows.filter((r) => !open.includes(r));

  const section = (title, list) => list.length > 0 && (
    <section className="mb-8">
      <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-slate-500 uppercase">{title} · {list.length}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map(({ project: p, mine }) => (
          <Link key={p.id} href={`/agent/projects/${p.id}`} className="group block">
            <Card className="h-full px-5 py-4 transition-shadow group-hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900 group-hover:text-brand">{p.design?.name || 'Installation'}</div>
                  <div className="truncate text-[13px] text-slate-500">{p.client?.name}</div>
                </div>
                <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-300 group-hover:text-brand" />
              </div>
              {(p.design?.summary?.address || p.client?.address) && <div className="mt-2 flex items-start gap-1.5 text-[13px] text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="line-clamp-1">{p.design?.summary?.address || p.client?.address}</span></div>}
              <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                {mine.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-slate-700">{s.name}</span><span className="flex shrink-0 items-center gap-1.5">{s.status !== 'done' && <StepPriorityBadge step={s} />}<StepStatusBadge status={s.status} /></span></li>)}
              </ul>
              <Progress project={p} className="mt-3" />
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );

  return (
    <>
      <PageHeader title={`Hello${user.name ? `, ${user.name.split(' ')[0]}` : ''}`} description="The installation steps assigned to you." />
      {error && <Alert className="mb-6">{error}</Alert>}
      {loading ? <LoadingBlock /> : !rows.length ? (
        <Card><EmptyState icon={ClipboardList} title="Nothing assigned yet" description="When your company assigns you an installation step, it shows up here." /></Card>
      ) : (
        <>
          {section('To do', open)}
          {section('Finished', finished)}
        </>
      )}
    </>
  );
}
