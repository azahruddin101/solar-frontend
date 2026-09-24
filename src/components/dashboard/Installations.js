'use client';

// Every installation the company is running: progress, the current step and who holds it.
import { ExternalLink, HardHat, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, EmptyState, FormField, FormModal, Input, LoadingBlock, PageHeader, Select, Table, Td, Th, Tr, buttonClass, timeAgo } from '../kit';
import { Progress, ProjectStatusBadge, currentStep } from '../installations/shared';

/** Pick a design that has no installation yet; its steps come from the company's template. */
function StartModal({ designs, designId, steps, onClose }) {
  const router = useRouter();
  const [design, setDesign] = useState(designId || designs[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const project = await api('/api/projects', { method: 'POST', body: { design } });
      router.push(`/dashboard/installations/${project.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!steps.length) {
    return (
      <FormModal open onClose={onClose} size="sm" title="Set up your steps first" submitLabel="Set up steps" onSubmit={() => router.push('/dashboard/workflow')}>
        <p className="text-sm text-slate-600">Define the steps your company follows for an installation — inspection, procurement, mounting… Every new installation starts with them.</p>
      </FormModal>
    );
  }
  return (
    <FormModal open onClose={onClose} size="sm" title="Start an installation" description="For a design the client has accepted." submitLabel="Start installation" busy={busy} error={error} onSubmit={submit}>
      <FormField label="Design">
        <Select required value={design} onValue={setDesign}>
          {designs.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.client?.name}</option>)}
        </Select>
      </FormField>
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-slate-700">Steps it will start with</div>
        <ol className="list-decimal space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 py-2.5 pr-3 pl-8 text-[13px] text-slate-600">
          {steps.map((s) => <li key={s.id}>{s.name}{s.role ? <span className="text-slate-400"> · {s.role}</span> : null}</li>)}
        </ol>
        <p className="mt-1.5 text-xs text-slate-500">You can add, remove and reassign steps for this installation afterwards. <Link href="/dashboard/workflow" className="font-medium text-brand hover:underline">Edit template</Link></p>
      </div>
    </FormModal>
  );
}

export default function Installations() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, loading, error } = useResource('/api/projects');
  const designs = useResource('/api/designs');
  const steps = useResource('/api/projects/steps');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [starting, setStarting] = useState(null);

  // /dashboard/installations?start=<designId> — from the Designs table
  useEffect(() => {
    const id = params.get('start');
    if (id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStarting({ designId: id });
      router.replace('/dashboard/installations');
    }
  }, [params, router]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((p) => (status === 'all' || p.status === status) && (!q || `${p.design?.name} ${p.client?.name} ${p.design?.summary?.address} ${p.steps.map((s) => `${s.assignee?.name || ''} ${s.role || ''}`).join(' ')}`.toLowerCase().includes(q)));
  }, [data, query, status]);

  const free = useMemo(() => {
    const taken = new Set((data || []).map((p) => p.design?.id));
    return (designs.data || []).filter((d) => !taken.has(d.id));
  }, [data, designs.data]);

  const ready = !loading && !designs.loading && !steps.loading;
  const startButton = <Button variant="primary" icon={Plus} disabled={!free.length} title={free.length ? undefined : 'Every design already has an installation'} onClick={() => setStarting({})}>Start installation</Button>;

  return (
    <>
      <PageHeader title="Installations" description="Accepted designs on their way to a working system — step by step.">{ready && startButton}</PageHeader>
      {(error || designs.error) && <Alert className="mb-6">{error || designs.error}</Alert>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input aria-label="Search installations" placeholder="Search by design, client, address or agent" value={query} onValue={setQuery} className="pl-9" />
          </div>
          <Select aria-label="Filter by status" value={status} onValue={setStatus} className="w-40">
            <option value="all">All</option>
            <option value="active">In progress</option>
            <option value="completed">Completed</option>
          </Select>
        </div>
        {loading ? <LoadingBlock /> : !rows.length ? (
          <EmptyState icon={HardHat} title={data?.length ? 'No installations match' : 'No installations yet'} description={data?.length ? 'Try a different search or filter.' : 'When a client accepts a design, start its installation and assign each step to your team.'}>
            {!data?.length && ready && startButton}
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Installation</Th><Th>Status</Th><Th>Progress</Th><Th>Current step</Th><Th>Updated</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const step = currentStep(p);
                return (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/dashboard/installations/${p.id}`} className="block max-w-[260px] truncate font-medium text-slate-900 hover:text-brand">{p.design?.name || 'Installation'}</Link>
                      <div className="max-w-[260px] truncate text-xs text-slate-500">{p.client?.name}</div>
                    </Td>
                    <Td><ProjectStatusBadge status={p.status} /></Td>
                    <Td><Progress project={p} className="w-36" /></Td>
                    <Td>
                      {step ? (
                        <>
                          <div className="max-w-[200px] truncate text-slate-900">{step.name}</div>
                          <div className="text-xs text-slate-500">
                            {step.assignee?.name || (step.role ? <span className="text-amber-700">{step.role} · unassigned</span> : <span className="text-amber-700">Unassigned</span>)}
                          </div>
                        </>
                      ) : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">{timeAgo(p.updatedAt)}</Td>
                    <Td><div className="flex justify-end"><Link href={`/dashboard/installations/${p.id}`} className={buttonClass({ size: 'sm' })}><ExternalLink className="h-3.5 w-3.5" /> Open</Link></div></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {starting && ready && <StartModal designs={free} designId={free.some((d) => d.id === starting.designId) ? starting.designId : undefined} steps={steps.data || []} onClose={() => setStarting(null)} />}
    </>
  );
}
