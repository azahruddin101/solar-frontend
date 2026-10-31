'use client';

// The signed-in client's subsidies — one per proposal bought on a subsidy — and where each stands in the company's subsidy steps.
import { BadgeIndianRupee } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, Select, formatDate } from '../kit';
import { Progress } from '../installations/shared';
import { SubsidyStatusBadge, SubsidyTimeline } from '../subsidies/shared';

export default function PortalSubsidy() {
  const { company } = useSession();
  const { data, loading, error } = useResource('/api/portal/subsidies');
  const [subsidyId, setSubsidyId] = useState('');
  const subsidies = data || [];
  const subsidy = subsidies.find((l) => l.id === subsidyId) || subsidies[0];

  return (
    <>
      <PageHeader title="My subsidies" description="Follow your solar subsidy step by step. Your provider updates it as each step is done.">
        {subsidies.length > 1 && (
          <Select aria-label="Proposal" value={subsidy?.id} onValue={setSubsidyId} className="w-64">
            {subsidies.map((l) => <option key={l.id} value={l.id}>{l.proposal.name}</option>)}
          </Select>
        )}
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      {loading ? <LoadingBlock /> : !subsidy ? (
        <Card><EmptyState icon={BadgeIndianRupee} title="No subsidies" description="None of your proposals is being bought on a subsidy. If you’d like to, ask your provider under Help & support." /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden">
            <CardHeader title="Subsidy steps" description={subsidy.steps.length ? <Progress project={subsidy} className="mt-1 max-w-xs" /> : 'Your provider hasn’t set up the steps yet.'} />
            {subsidy.steps.length > 0 && <div className="px-6 py-5"><SubsidyTimeline steps={subsidy.steps} /></div>}
          </Card>
          <Card className="h-fit space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Proposal</span>
              {subsidy.proposal.shared ? <Link href={`/portal/${subsidy.proposal.id}`} className="truncate text-right font-medium text-brand hover:underline">{subsidy.proposal.name}</Link> : <span className="truncate text-right font-medium text-slate-900">{subsidy.proposal.name}</span>}
            </div>
            <div className="flex items-center justify-between"><span className="text-slate-500">Status</span><SubsidyStatusBadge status={subsidy.status} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Scheme</span><span className="text-right font-medium text-slate-900">{subsidy.scheme || '—'}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Application no.</span><span className="text-right font-medium text-slate-900">{subsidy.applicationNo || '—'}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Expected</span><span className="font-medium text-slate-900">{(subsidy.centralAmount || subsidy.stateAmount) ? formatMoney((subsidy.centralAmount || 0) + (subsidy.stateAmount || 0), company?.currency) : '—'}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Received</span><span className="font-medium text-slate-900">{subsidy.receivedAmount != null ? formatMoney(subsidy.receivedAmount, company?.currency) : '—'}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Started</span><span className="text-slate-900">{formatDate(subsidy.createdAt)}</span></div>
          </Card>
        </div>
      )}
    </>
  );
}
