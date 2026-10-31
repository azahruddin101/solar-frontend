'use client';

// Every proposal bought on a subsidy: where its subsidy stands in the company's subsidy steps.
import { BadgeIndianRupee, ExternalLink, ListChecks, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { Alert, Card, EmptyState, Input, LoadingBlock, PageHeader, Select, Table, Td, Th, Tr, buttonClass, capName, timeAgo } from '../kit';
import { Progress, currentStep } from '../installations/shared';
import { SUBSIDY_STATUSES, SubsidyStatusBadge } from './shared';

export default function Subsidies({ basePath = '/dashboard/subsidies', designsPath = '/dashboard/designs', stepsPath = '/dashboard/masters?tab=subsidy-steps' }) {
  const { company, user } = useSession();
  const may = useCan();
  const { data, loading, error } = useResource('/api/subsidies');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const isOwner = user?.role === 'company';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((l) => (status === 'all' || l.status === status) && (!q || `${l.design?.name} ${l.client?.name} ${l.client?.phone} ${l.client?.email} ${l.scheme} ${l.applicationNo}`.toLowerCase().includes(q)));
  }, [data, query, status]);
  const filtered = Boolean(query.trim() || status !== 'all');

  return (
    <>
      <PageHeader title="Subsidies" description="Proposals bought on a subsidy, and how far each subsidy has got through your subsidy steps.">
        {isOwner && <Link href={stepsPath} className={buttonClass({})}><ListChecks className="h-4 w-4" /> Subsidy steps</Link>}
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="relative min-w-[12rem] flex-1 basis-[200px]">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input aria-label="Search subsidies" placeholder="Search by proposal, client, phone or application number" value={query} onValue={setQuery} className="pl-9" />
          </div>
          <Select aria-label="Filter by status" value={status} onValue={setStatus} className="w-40 shrink-0">
            <option value="all">All</option>
            {SUBSIDY_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        {loading ? <LoadingBlock /> : !rows.length ? (
          <EmptyState
            icon={BadgeIndianRupee}
            title={filtered || data?.length ? 'No subsidies match' : 'No subsidies yet'}
            description={filtered || data?.length ? 'Try a different search or status.' : 'Turn on “Subsidy” when creating a proposal, or on the proposal’s page, and it appears here.'}
          >
            {!data?.length && may('proposals', 'view') && <Link href={designsPath} className={buttonClass({ variant: 'primary' })}>Go to proposals</Link>}
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Proposal</Th><Th>Scheme</Th><Th className="text-right">Expected</Th><Th className="text-right">Received</Th><Th>Status</Th><Th>Progress</Th><Th>Current step</Th><Th>Updated</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {rows.map((l) => {
                const step = l.status === 'in_progress' ? currentStep(l) : null;
                return (
                  <Tr key={l.id}>
                    <Td>
                      <Link href={`${basePath}/${l.id}`} className="block max-w-[260px] truncate font-medium text-slate-900 hover:text-brand">{capName(l.design?.name) || 'Proposal'}</Link>
                      <div className="max-w-[260px] truncate text-xs text-slate-500">{[l.client?.name, l.client?.phone].filter(Boolean).join(' · ')}</div>
                    </Td>
                    <Td>
                      <div className="text-slate-900">{l.scheme || <span className="text-slate-400">—</span>}</div>
                      {l.applicationNo && <div className="text-xs text-slate-500">{l.applicationNo}</div>}
                    </Td>
                    <Td className="text-right whitespace-nowrap tabular-nums text-slate-900">{(l.centralAmount || l.stateAmount) ? formatMoney((l.centralAmount || 0) + (l.stateAmount || 0), company?.currency, { decimals: 0 }) : <span className="text-slate-400">—</span>}</Td>
                    <Td className="text-right whitespace-nowrap tabular-nums text-slate-900">{l.receivedAmount != null ? formatMoney(l.receivedAmount, company?.currency, { decimals: 0 }) : <span className="text-slate-400">—</span>}</Td>
                    <Td><SubsidyStatusBadge status={l.status} /></Td>
                    <Td>{l.steps.length ? <Progress project={l} className="w-36" /> : <span className="text-xs text-amber-700">No steps</span>}</Td>
                    <Td>{step ? <span className="block max-w-[220px] truncate text-slate-900">{step.name}</span> : <span className="text-slate-400">—</span>}</Td>
                    <Td className="whitespace-nowrap text-slate-500">{timeAgo(l.updatedAt)}</Td>
                    <Td><div className="flex justify-end"><Link href={`${basePath}/${l.id}`} className={buttonClass({ size: 'sm' })}><ExternalLink className="h-3.5 w-3.5" /> Open</Link></div></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
