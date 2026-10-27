'use client';

// The signed-in client's loans — one per proposal bought on a loan — and where each stands in the company's loan steps.
import { Landmark } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, Select, formatDate } from '../kit';
import { Progress } from '../installations/shared';
import { LoanStatusBadge, LoanTimeline } from '../loans/shared';

export default function PortalLoan() {
  const { company } = useSession();
  const { data, loading, error } = useResource('/api/portal/loans');
  const [loanId, setLoanId] = useState('');
  const loans = data || [];
  const loan = loans.find((l) => l.id === loanId) || loans[0];

  return (
    <>
      <PageHeader title="My loans" description="Follow your solar loan step by step. Your provider updates it as each step is done.">
        {loans.length > 1 && (
          <Select aria-label="Proposal" value={loan?.id} onValue={setLoanId} className="w-64">
            {loans.map((l) => <option key={l.id} value={l.id}>{l.proposal.name}</option>)}
          </Select>
        )}
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      {loading ? <LoadingBlock /> : !loan ? (
        <Card><EmptyState icon={Landmark} title="No loans" description="None of your proposals is being bought on a loan. If you’d like to, ask your provider under Help & support." /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden">
            <CardHeader title="Loan steps" description={loan.steps.length ? <Progress project={loan} className="mt-1 max-w-xs" /> : 'Your provider hasn’t set up the steps yet.'} />
            {loan.steps.length > 0 && <div className="px-6 py-5"><LoanTimeline steps={loan.steps} /></div>}
          </Card>
          <Card className="h-fit space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Proposal</span>
              {loan.proposal.shared ? <Link href={`/portal/${loan.proposal.id}`} className="truncate text-right font-medium text-brand hover:underline">{loan.proposal.name}</Link> : <span className="truncate text-right font-medium text-slate-900">{loan.proposal.name}</span>}
            </div>
            <div className="flex items-center justify-between"><span className="text-slate-500">Status</span><LoanStatusBadge status={loan.status} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Bank / lender</span><span className="text-right font-medium text-slate-900">{loan.lender || '—'}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Amount</span><span className="font-medium text-slate-900">{loan.amount != null ? formatMoney(loan.amount, company?.currency) : '—'}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Started</span><span className="text-slate-900">{formatDate(loan.createdAt)}</span></div>
          </Card>
        </div>
      )}
    </>
  );
}
