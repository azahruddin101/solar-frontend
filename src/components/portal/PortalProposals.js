'use client';

// A client's proposals (view only): what the company has shared with them.
import { ArrowUpRight, Box, FileText } from 'lucide-react';
import Link from 'next/link';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Card, EmptyState, LoadingBlock, PageHeader, Table, Td, Th, Tr, buttonClass, timeAgo } from '../kit';
import { DesignStatusBadge } from '../dashboard/shared';

export default function PortalProposals() {
  const { user, company } = useSession();
  const { data, loading, error } = useResource('/api/portal/proposals');
  const money = (v) => formatMoney(v, company?.currency);

  return (
    <>
      <PageHeader title={`Welcome, ${user?.name || 'there'}`} description={`Your solar proposals from ${company?.name || 'your provider'}. When a proposal is marked “Proposed”, you can accept it, decline it, or request changes — with a short note each time.`} />
      {error && <Alert className="mb-6">{error}</Alert>}
      <Card className="overflow-hidden">
        {loading ? <LoadingBlock /> : !data?.length ? (
          <EmptyState icon={FileText} title="No proposals yet" description="When your solar provider shares a proposal with you, it will appear here." />
        ) : (
          <Table>
            <thead><tr><Th>Proposal</Th><Th>Status</Th><Th className="text-right">System</Th><Th className="text-right">Price</Th><Th className="text-right">Balance</Th><Th>Updated</Th><Th className="text-right">View</Th></tr></thead>
            <tbody>
              {data.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-slate-900">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.name}
                      {p.canRespond && p.reviewInvite && <Badge tone="brand">Updated — please review</Badge>}
                      {p.canRespond && !p.reviewInvite && <Badge tone="amber">Your response needed</Badge>}
                      {p.clientResponse?.decision === 'changes_requested' && <Badge tone="amber">Changes requested</Badge>}
                    </div>
                  </Td>
                  <Td><DesignStatusBadge status={p.status} /></Td>
                  <Td className="text-right tabular-nums">{p.summary?.kwp ? `${p.summary.kwp.toFixed(2)} kWp` : '—'}</Td>
                  <Td className="text-right tabular-nums">{p.total ? money(p.total) : '—'}</Td>
                  <Td className="text-right tabular-nums">{p.balance === null ? '—' : p.balance <= 0 ? 'Paid' : money(p.balance)}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{timeAgo(p.updatedAt)}</Td>
                  <Td className="text-right whitespace-nowrap">{p.type !== 'quick' && p.summary?.panels > 0 && <Link href={`/view/${p.id}`} className={buttonClass({ size: 'sm', variant: 'ghost', className: 'mr-1' })}><Box className="mr-1 h-3.5 w-3.5" />3D view</Link>}<Link href={`/portal/${p.id}`} className={buttonClass({ size: 'sm', variant: 'ghost' })}>Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
