'use client';

import { ArrowRight, Check, PenTool, Plus, Users, Wallet, Zap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, StatCard, Table, Td, Th, Tr, buttonClass, cx, timeAgo } from '../kit';
import { DesignStatusBadge, NewDesignModal, designHref } from './shared';

export default function Overview() {
  const { company, user } = useSession();
  const clients = useResource('/api/clients');
  const designs = useResource('/api/designs');
  const catalog = useResource('/api/catalog');
  const [creating, setCreating] = useState(false);

  const list = designs.data || [];
  const open = list.filter((d) => d.status === 'draft' || d.status === 'proposed');
  const kwp = list.reduce((a, d) => a + (d.summary?.kwp || 0), 0);
  const pipeline = open.reduce((a, d) => a + (d.summary?.cost || 0), 0);

  const setup = [
    { done: Boolean(company.logo), label: 'Upload your logo', href: '/dashboard/settings?tab=branding' },
    { done: Boolean(company.signature), label: 'Add your e-signature', href: '/dashboard/settings?tab=branding' },
    { done: Boolean(company.phone && company.address), label: 'Complete your company profile', href: '/dashboard/settings' },
    { done: (catalog.data?.panels.length || 0) > 0, label: 'Add the solar panels you sell', href: '/dashboard/catalog' },
    { done: (clients.data?.length || 0) > 0, label: 'Add your first client', href: '/dashboard/clients?new=1' },
  ];
  const remaining = setup.filter((s) => !s.done).length;
  const loading = clients.loading || designs.loading || catalog.loading;

  return (
    <>
      <PageHeader title={`Welcome back${user.name ? `, ${user.name.split(' ')[0]}` : ''}`} description={`Here’s what’s happening at ${company.name}.`}>
        <Link href="/dashboard/clients?new=1" className={buttonClass()}><Users className="h-4 w-4" /> Add client</Link>
        <Button variant="primary" icon={Plus} disabled={!clients.data?.length} title={clients.data?.length ? undefined : 'Add a client first'} onClick={() => setCreating(true)}>New design</Button>
      </PageHeader>
      {(clients.error || designs.error) && <Alert className="mb-6">{clients.error || designs.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clients" value={clients.data?.length ?? '—'} icon={Users} hint={company.billing?.limits?.maxClients ? `Plan limit: ${company.billing.limits.maxClients}` : company.limits.maxClients ? `Plan limit: ${company.limits.maxClients}` : undefined} />
        <StatCard label="Designs" value={designs.data ? list.length : '—'} icon={PenTool} hint={designs.data ? `${list.filter((d) => d.status === 'won').length} won · ${open.length} open` : undefined} />
        <StatCard label="Designed capacity" value={designs.data ? kwp.toFixed(1) : '—'} unit="kWp" icon={Zap} />
        <StatCard label="Open pipeline" value={designs.data ? formatMoney(pipeline, company.currency) : '—'} icon={Wallet} hint="Draft and proposed designs" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHeader title="Recent designs" action={<Link href="/dashboard/designs" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">View all <ArrowRight className="h-4 w-4" /></Link>} />
          {loading ? <LoadingBlock /> : !list.length ? (
            <EmptyState icon={PenTool} title="No designs yet" description={clients.data?.length ? 'Create a design for one of your clients.' : 'Add a client, then create their rooftop design.'}>
              {clients.data?.length ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New design</Button> : <Link href="/dashboard/clients?new=1" className={buttonClass({ variant: 'primary' })}>Add client</Link>}
            </EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Design</Th><Th>Status</Th><Th className="text-right">Size</Th><Th>Updated</Th></tr></thead>
              <tbody>
                {list.slice(0, 6).map((d) => (
                  <Tr key={d.id}>
                    <Td><Link href={designHref(d)} className="font-medium text-slate-900 hover:text-brand">{d.name}</Link><div className="text-xs text-slate-500">{d.client?.name}</div></Td>
                    <Td><DesignStatusBadge status={d.status} /></Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">{d.summary?.kwp ? `${d.summary.kwp.toFixed(2)} kWp` : '—'}</Td>
                    <Td className="whitespace-nowrap text-slate-500">{timeAgo(d.updatedAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Get set up" description={loading ? undefined : remaining ? `${remaining} step${remaining > 1 ? 's' : ''} left for fully branded proposals.` : 'All done — your proposals are fully branded.'} />
          <ul className="p-3">
            {setup.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50">
                  <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full', s.done ? 'bg-emerald-500 text-white' : 'ring-1 ring-slate-300 ring-inset')}>{s.done && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                  <span className={cx('flex-1', s.done ? 'text-slate-400 line-through' : 'font-medium text-slate-700')}>{s.label}</span>
                  {!s.done && <ArrowRight className="h-4 w-4 text-slate-400" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {creating && <NewDesignModal clients={clients.data} onClose={() => setCreating(false)} />}
    </>
  );
}
