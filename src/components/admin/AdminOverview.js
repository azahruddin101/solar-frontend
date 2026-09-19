'use client';

import { ArrowRight, Building2, PenTool, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import { assetUrl } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, LogoChip, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, StatCard, Table, Td, Th, Tr, buttonClass, timeAgo } from '../kit';
import { PlanBadge, StatusBadge } from './shared';

export default function AdminOverview() {
  const stats = useResource('/api/admin/stats');
  const companies = useResource('/api/admin/companies');
  const s = stats.data;

  return (
    <>
      <PageHeader title="Platform overview" description="Every company using the platform, at a glance.">
        <Link href="/admin/companies?new=1" className={buttonClass({ variant: 'primary' })}><Building2 className="h-4 w-4" /> Add company</Link>
      </PageHeader>
      {(stats.error || companies.error) && <Alert className="mb-6">{stats.error || companies.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Companies" value={s?.companies ?? '—'} icon={Building2} hint={s ? `${s.active} active · ${s.suspended} suspended` : undefined} />
        <StatCard label="Clients" value={s?.clients ?? '—'} icon={Users} hint="Across all companies" />
        <StatCard label="Designs" value={s?.designs ?? '—'} icon={PenTool} hint="Across all companies" />
        <StatCard label="Designed capacity" value={s ? s.kwp.toFixed(1) : '—'} unit="kWp" icon={Zap} />
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Recently added companies" action={<Link href="/admin/companies" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">View all <ArrowRight className="h-4 w-4" /></Link>} />
        {companies.loading ? <LoadingBlock /> : !companies.data?.length ? (
          <EmptyState icon={Building2} title="No companies yet" description="Add the first solar company to get started.">
            <Link href="/admin/companies?new=1" className={buttonClass({ variant: 'primary' })}>Add company</Link>
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Company</Th><Th>Plan</Th><Th>Status</Th><Th className="text-right">Clients</Th><Th className="text-right">Designs</Th><Th>Last sign-in</Th></tr></thead>
            <tbody>
              {companies.data.slice(0, 6).map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <LogoChip name={c.name} src={assetUrl(c.logo)} />
                      <div className="min-w-0"><div className="truncate font-medium text-slate-900">{c.name}</div><div className="truncate text-xs text-slate-500">{c.loginEmail}</div></div>
                    </div>
                  </Td>
                  <Td><PlanBadge plan={c.plan} /></Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td className="text-right tabular-nums">{c.counts.clients}</Td>
                  <Td className="text-right tabular-nums">{c.counts.designs}</Td>
                  <Td className="text-slate-500">{timeAgo(c.lastLoginAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
