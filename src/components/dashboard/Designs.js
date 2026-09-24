'use client';

import { Copy, ExternalLink, FileText, HardHat, MapPin, PenTool, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { generateLifecyclePdf } from '@/lib/lifecyclePdf';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, LoadingBlock, PageHeader, Select, Table, Td, Th, Tr, buttonClass, timeAgo, toast } from '../kit';
import { DESIGN_STATUSES, NewDesignModal, designHref } from './shared';

export default function Designs() {
  const router = useRouter();
  const params = useSearchParams();
  const company = useSession((s) => s.company);
  const { data, setData, loading, error } = useResource('/api/designs');
  const clients = useResource('/api/clients');
  const projects = useResource('/api/projects');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const clientId = params.get('client') || 'all';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((d) => (status === 'all' || d.status === status) && (clientId === 'all' || d.client?.id === clientId) && (!q || `${d.name} ${d.client?.name} ${d.summary?.address}`.toLowerCase().includes(q)));
  }, [data, query, status, clientId]);

  const installationOf = useMemo(() => new Map((projects.data || []).map((p) => [p.design?.id, p.id])), [projects.data]);

  const downloadHistory = async (d) => {
    try {
      const lifecycle = await api(`/api/designs/${d.id}/lifecycle`);
      await generateLifecyclePdf({ lifecycle, company, client: lifecycle.client });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const close = () => { setModal(null); setModalError(''); };
  const setDesignStatus = async (d, next) => {
    setData((list) => list.map((x) => (x.id === d.id ? { ...x, status: next } : x)));
    try {
      await api(`/api/designs/${d.id}`, { method: 'PUT', body: { status: next } });
    } catch (e) {
      setData((list) => list.map((x) => (x.id === d.id ? { ...x, status: d.status } : x)));
      toast.error(e.message);
    }
  };
  const duplicate = async (d) => {
    try {
      const copy = await api(`/api/designs/${d.id}/duplicate`, { method: 'POST' });
      setData((list) => [copy, ...list]);
      toast.success('Design duplicated');
    } catch (e) {
      toast.error(e.message);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/designs/${modal.design.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.design.id));
      toast.success('Design deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  const hasClients = Boolean(clients.data?.length);
  const newButton = hasClients ? <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'new' })}>New design</Button> : <Link href="/dashboard/clients?new=1" className={buttonClass({ variant: 'primary' })}>Add a client first</Link>;

  return (
    <>
      <PageHeader title="Designs" description="Rooftop solar designs and proposals for your clients.">{!clients.loading && newButton}</PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input aria-label="Search designs" placeholder="Search by design, client or address" value={query} onValue={setQuery} className="pl-9" />
          </div>
          <Select aria-label="Filter by client" value={clientId} onValue={(v) => router.replace(v === 'all' ? '/dashboard/designs' : `/dashboard/designs?client=${v}`)} className="w-48">
            <option value="all">All clients</option>
            {(clients.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label="Filter by status" value={status} onValue={setStatus} className="w-40">
            <option value="all">All statuses</option>
            {DESIGN_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        {loading ? <LoadingBlock /> : !rows.length ? (
          <EmptyState icon={PenTool} title={data?.length ? 'No designs match' : 'No designs yet'} description={data?.length ? 'Try a different search or filter.' : 'Pick a client, outline their roof and get a priced, branded proposal.'}>
            {!data?.length && !clients.loading && newButton}
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Design</Th><Th>Client</Th><Th>Status</Th><Th className="text-right">System</Th><Th className="text-right">Value</Th><Th>Updated</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <Tr key={d.id}>
                  <Td>
                    <Link href={designHref(d)} className="block max-w-[260px] truncate font-medium text-slate-900 hover:text-brand">{d.name}</Link>
                    {d.summary?.address && <div className="flex max-w-[260px] items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{d.summary.address}</span></div>}
                  </Td>
                  <Td className="whitespace-nowrap">{d.client?.name || '—'}</Td>
                  <Td>
                    <Select aria-label="Status" value={d.status} onValue={(v) => setDesignStatus(d, v)} className="h-8 w-[118px] text-[13px]">
                      {DESIGN_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </Select>
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{d.summary?.kwp ? <>{d.summary.kwp.toFixed(2)} kWp<div className="text-xs text-slate-500">{d.summary.panels} panels</div></> : <span className="text-slate-400">Not designed</span>}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{d.summary?.cost ? formatMoney(d.summary.cost, company.currency) : '—'}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{timeAgo(d.updatedAt)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-0.5">
                      <Link href={designHref(d)} className={buttonClass({ size: 'sm', className: 'mr-1' })}><ExternalLink className="h-3.5 w-3.5" /> Open</Link>
                      {installationOf.has(d.id)
                        ? <IconButton icon={HardHat} label="View installation" className="text-brand" onClick={() => router.push(`/dashboard/installations/${installationOf.get(d.id)}`)} />
                        : <IconButton icon={HardHat} label="Start installation" onClick={() => router.push(`/dashboard/installations?start=${d.id}`)} />}
                      <IconButton icon={FileText} label="Download activity log (PDF)" onClick={() => downloadHistory(d)} />
                      <IconButton icon={Copy} label="Duplicate" onClick={() => duplicate(d)} />
                      <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setModal({ type: 'delete', design: d })} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modal?.type === 'new' && <NewDesignModal clients={clients.data} clientId={clientId !== 'all' ? clientId : undefined} onClose={close} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this design?" confirmLabel="Delete design">
        <b className="text-slate-900">{modal?.design?.name}</b> for {modal?.design?.client?.name} will be permanently deleted{installationOf.has(modal?.design?.id) ? <>, together with <b className="text-slate-900">its installation and activity log</b></> : ''}.
      </ConfirmDialog>
    </>
  );
}
