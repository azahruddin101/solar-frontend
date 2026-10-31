'use client';

import ProposalEditModal from './ProposalEditModal';
import { Copy, FileText, HardHat, History, MapPin, PenLine, PenTool, Plus, ReceiptText, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatMoney } from '@/lib/energy';
import { generateLifecyclePdf } from '@/lib/lifecyclePdf';
import { useSession } from '@/lib/session';
import { useResource, usePagedResource } from '@/lib/useResource';
import { withDateRange } from '@/lib/listDates';
import { Alert, Button, Card, ConfirmDialog, DateRangeFilter, EmptyState, FilterNotice, Input, LoadMoreRow, LoadingBlock, PageHeader, RowMenu, Select, Table, Td, Th, Tr, buttonClass, capName, timeAgo, toast } from '../kit';
import { DESIGN_STATUSES, DesignStatusBadge, NewDesignModal, designHref } from './shared';
import { ClientChangeRequestsSection } from './ClientChangeRequestPanel';

/** The ready-made lists the dashboard links to (`?show=`); the server applies them (backend listPresets.js). */
const SHOWS = {
  changes: 'quotes where the client asked for changes',
  no_reply: 'quotes with no reply for a week',
  expiring: 'quotes that expire in the next 7 days',
  not_started: 'booked jobs where installation has not started',
  loan_missing: 'booked jobs that need a loan, with no loan started',
  subsidy_missing: 'booked jobs with a subsidy, with no subsidy started',
  made_month: 'quotes made this month',
};
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

export default function Designs({ basePath = '/dashboard/designs', installationsBasePath = '/dashboard/installations', billingBasePath = '/dashboard/billing', clientsBasePath = '/dashboard/clients' }) {
  const router = useRouter();
  const params = useSearchParams();
  const company = useSession((s) => s.company);
  const me = useSession((s) => s.user);
  const canCreate = can(me, 'proposals', 'create');
  const canUpdate = can(me, 'proposals', 'update');
  const canDelete = can(me, 'proposals', 'delete');
  const canChangeStatus = can(me, 'proposals', 'change_status');
  // other areas this page links into: only load or offer what the user may open
  const canViewClients = can(me, 'clients', 'view');
  const canSeeBilling = can(me, 'finances', 'view');
  const canViewTasks = can(me, 'tasks', 'view');
  const canStartTask = can(me, 'tasks', 'create');
  const clientId = params.get('client') || 'all';
  const show = SHOWS[params.get('show')] ? params.get('show') : '';
  const [addedFrom, setAddedFrom] = useState('');
  const [addedTo, setAddedTo] = useState('');
  const listPath = useMemo(() => {
    const query = new URLSearchParams({ ...(clientId !== 'all' && { client: clientId }), ...(show && { show }) }).toString();
    return withDateRange(`/api/designs${query ? `?${query}` : ''}`, addedFrom, addedTo);
  }, [clientId, show, addedFrom, addedTo]);
  const { items: data, setItems: setData, loading, error, hasMore, loadingMore, loadMore, total } = usePagedResource(listPath, { limit: 100 });
  const clients = useResource(canViewClients ? '/api/clients?limit=500' : null);
  const projects = useResource(canViewTasks ? '/api/projects?limit=1000' : null);
  const clientList = clients.data?.items || [];
  const projectList = projects.data?.items || [];
  const [query, setQuery] = useState('');
  const [editingProposal, setEditingProposal] = useState(null); // the proposal open in the Edit proposal dialog
  const [status, setStatus] = useState(() => (DESIGN_STATUSES.some((s) => s.id === params.get('status')) ? params.get('status') : 'all')); // ?status= from a dashboard link
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const dateFiltered = Boolean(addedFrom && addedTo);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((d) => (status === 'all' || d.status === status) && (clientId === 'all' || d.client?.id === clientId) && (!q || `${d.name} ${d.client?.name} ${d.summary?.address}`.toLowerCase().includes(q)));
  }, [data, query, status, clientId]);

  const installationOf = useMemo(() => new Map((projects.data?.items || []).map((p) => [p.design?.id, p.id])), [projects.data]);

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
      toast.success('Proposal duplicated');
    } catch (e) {
      toast.error(e.message);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/designs/${modal.design.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.design.id));
      toast.success('Proposal deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  const patchDesign = (id, updated) => {
    setData((list) => list.map((x) => (x.id === id ? { ...x, clientResponse: updated.clientResponse, clientReviewInvite: updated.clientReviewInvite, updatedAt: updated.updatedAt } : x)));
  };

  const hasClients = Boolean(clientList.length);
  // a proposal is made for a client, so creating one needs the client list too
  const newButton = !canViewClients ? null : hasClients ? <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'new' })}>New Proposal</Button> : can(me, 'clients', 'create') ? <Link href={`${clientsBasePath}?new=1`} className={buttonClass({ variant: 'primary' })}>Add a client first</Link> : null;

  const closeProposalEditor = async () => {
    const d = editingProposal;
    setEditingProposal(null);
    try { const fresh = await api(`/api/designs/${d.id}`); setData((list) => list.map((x) => (x.id === d.id ? { ...x, ...fresh } : x))); } catch { /* the list refreshes on its next load */ }
  };

  return (
    <>
      {editingProposal && <ProposalEditModal designId={editingProposal.id} name={editingProposal.name} onClose={closeProposalEditor} />}
      <PageHeader title="Proposals" description="Rooftop solar designs and proposals for your clients.">{!clients.loading && canCreate && newButton}</PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      {show && <FilterNotice className="mb-4" label={SHOWS[show]} count={loading ? null : plural(total, 'proposal')} onClear={() => router.replace(basePath)} />}
      {!loading && <ClientChangeRequestsSection designs={data} onSent={patchDesign} />}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4">
          <DateRangeFilter from={addedFrom} to={addedTo} onChange={({ from, to }) => { setAddedFrom(from); setAddedTo(to); }} />
          <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input aria-label="Search proposals" placeholder="Search by proposal, client or address" value={query} onValue={setQuery} className="pl-9" />
          </div>
          <Select aria-label="Filter by client" value={clientId} onValue={(v) => router.replace(v === 'all' ? basePath : `${basePath}?client=${v}`)} className="w-48">
            <option value="all">All clients</option>
            {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label="Filter by status" value={status} onValue={setStatus} className="w-40">
            <option value="all">All statuses</option>
            {DESIGN_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
          </div>
        </div>
        {loading ? <LoadingBlock /> : !rows.length ? (
          <EmptyState icon={PenTool} title={show || dateFiltered || query.trim() || status !== 'all' || clientId !== 'all' ? 'No proposals match' : 'No proposals yet'} description={total ? 'Try a different search or filter.' : 'Pick a client, outline their roof and get a priced, branded proposal.'}>
            {!dateFiltered && !query.trim() && status === 'all' && clientId === 'all' && total === 0 && !clients.loading && canCreate && newButton}
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Proposal</Th><Th>Client</Th><Th>Status</Th><Th className="text-right">System</Th><Th className="text-right">Value</Th><Th>Updated</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <Tr key={d.id}>
                  <Td>
                    <Link href={`${basePath}/${d.id}`} className="block max-w-[260px] truncate font-medium text-slate-900 hover:text-brand">{capName(d.name)}</Link>
                    {d.summary?.address && <div className="flex max-w-[260px] items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{d.summary.address}</span></div>}
                  </Td>
                  <Td><div className="max-w-[160px] truncate" title={d.client?.name}>{capName(d.client?.name) || '—'}</div></Td>
                  <Td>
                    {canChangeStatus ? (
                      <Select aria-label="Status" value={d.status} onValue={(v) => setDesignStatus(d, v)} className="h-8 w-[118px] text-[13px]">
                        {DESIGN_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </Select>
                    ) : (
                      <DesignStatusBadge status={d.status} />
                    )}
                    {d.clientResponse?.decision === 'changes_requested' && (
                      <div className="mt-1">🔴</div>
                    )}
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{d.summary?.kwp ? <>{d.summary.kwp.toFixed(2)} kWp<div className="text-xs text-slate-500">{d.summary.panels} panels</div></> : <span className="text-slate-400">Not designed</span>}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">{d.summary?.cost ? formatMoney(d.summary.cost, company.currency) : '—'}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{timeAgo(d.updatedAt)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${d.name}`}
                        items={[
                          d.type !== 'quick' && canUpdate && { key: 'edit-design', icon: PenLine, label: 'Edit design', href: designHref(d) },
                          d.type === 'quick' || !canUpdate ? { key: 'edit', icon: ReceiptText, label: canUpdate ? 'Edit proposal' : 'Open proposal (view only)', href: designHref(d) } : { key: 'edit', icon: ReceiptText, label: 'Edit proposal', onClick: () => setEditingProposal(d) },
                          { key: 'detail', icon: History, label: 'View details & versions', href: `${basePath}/${d.id}` },
                          canSeeBilling && d.status === 'won' && { key: 'billing', icon: ReceiptText, label: 'Billing', href: `${billingBasePath}/${d.id}` },
                          canViewTasks && installationOf.has(d.id) && { key: 'installation', icon: HardHat, label: 'View installation', href: `${installationsBasePath}/${installationOf.get(d.id)}` },
                          canViewTasks && canStartTask && !installationOf.has(d.id) && d.status === 'won' && { key: 'installation', icon: HardHat, label: 'Start installation', href: `${installationsBasePath}?start=${d.id}` },
                          { key: 'log', icon: FileText, label: 'Download activity log (PDF)', onClick: () => downloadHistory(d) },
                          canCreate && { key: 'duplicate', icon: Copy, label: 'Duplicate', onClick: () => duplicate(d) },
                          canDelete && { key: 'delete', icon: Trash2, label: 'Delete proposal', tone: 'danger', onClick: () => setModal({ type: 'delete', design: d }) },
                        ]}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <LoadMoreRow hasMore={hasMore} loadingMore={loadingMore} onClick={loadMore} loaded={data?.length || 0} total={total} />
      </Card>

      {modal?.type === 'new' && <NewDesignModal clients={clientList} clientId={clientId !== 'all' ? clientId : undefined} onClose={close} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this proposal?" confirmLabel="Delete proposal">
        <b className="text-slate-900">{modal?.design?.name}</b> for {modal?.design?.client?.name} will be permanently deleted{installationOf.has(modal?.design?.id) ? <>, together with <b className="text-slate-900">its installation and activity log</b></> : ''}.
      </ConfirmDialog>
    </>
  );
}
