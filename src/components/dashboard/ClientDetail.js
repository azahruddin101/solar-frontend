'use client';

import { ArrowLeft, ArrowUpRight, Calendar, Download, Eye, FileText, Mail, MapPin, PenTool, Pencil, Phone, Plus, ReceiptText, Trash2, User, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api, assetUrl } from '@/lib/api';
import { can } from '@/lib/agents';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, FormField, IconButton, Input, LoadingBlock, PageHeader, Select, Table, Td, Textarea, Th, Tr, buttonClass, cx, formatDate, openStoredFile, timeAgo, toast, RowMenu } from '@/components/kit';
import ClientCredentials from './ClientCredentials';
import { DESIGN_STATUSES, NewDesignModal, PROJECT_TYPE_LABEL, ROOF_TYPE_LABEL, designHref } from './shared';

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function ClientDetail({ id, basePath = '/dashboard/clients', billingBasePath = '/dashboard/billing' }) {
  const router = useRouter();
  const company = useSession((s) => s.company);
  const me = useSession((s) => s.user);
  const canViewDesigns = can(me, 'designs', 'view');
  const canCreateDesign = can(me, 'designs', 'create');
  const clientResource = useResource(`/api/clients/${id}`);
  const designsResource = useResource(canViewDesigns ? `/api/designs?client=${id}&limit=200` : null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [creds, setCreds] = useState(null);

  const client = clientResource.data;

  const clientDesigns = designsResource.data?.items || [];

  const close = () => {
    setModal(null);
    setModalError('');
  };

  const manageLogin = async () => {
    setBusy(true);
    try {
      const credentials = await api(`/api/clients/${id}/login`, { method: 'POST' });
      clientResource.setData((c) => ({ ...c, hasLogin: true }));
      setCreds({ clientName: client.name, credentials });
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };
  const removeLogin = async () => {
    setBusy(true);
    try {
      await api(`/api/clients/${id}/login`, { method: 'DELETE' });
      clientResource.setData((c) => ({ ...c, hasLogin: false }));
      toast.success('Access removed');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/clients/${id}`, { method: 'DELETE' });
      toast.success('Client deleted');
      router.replace(basePath);
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  if (clientResource.loading) return <LoadingBlock />;
  if (clientResource.error) {
    return (
      <div className="space-y-4">
        <Link href={basePath} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to clients
        </Link>
        <Alert>{clientResource.error}</Alert>
      </div>
    );
  }
  if (!client) return null;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={basePath}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50"
            title="Back to clients"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900">{client.name}</h1>
              {client.kwRequired ? (
                <Badge tone="brand">
                  <Zap className="h-3 w-3" /> {client.kwRequired} kW
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">Client since {formatDate(client.createdAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canCreateDesign && (
            <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'design' })}>
              New Proposal
            </Button>
          )}
          <IconButton icon={Trash2} label="Delete client" tone="danger" onClick={() => setModal({ type: 'delete' })} />
        </div>
      </div>

      {/* Grid: Client Info + Documents */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Details & Meta */}
        <div className="space-y-6 lg:col-span-2">
          {/* Key Information Card */}
          <Card className="p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Client Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="text-xs text-slate-400">Phone number</span>
                <p className="mt-0.5 text-sm font-medium text-slate-900">
                  {client.phone ? (
                    <a href={`tel:${client.phone}`} className="hover:text-brand hover:underline">
                      {client.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
              </div>

              <div>
                <span className="text-xs text-slate-400">Email address</span>
                <p className="mt-0.5 text-sm font-medium text-slate-900">
                  {client.email ? (
                    <a href={`mailto:${client.email}`} className="hover:text-brand hover:underline">
                      {client.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
              </div>

              <div>
                <span className="text-xs text-slate-400">Consumer Number / Meter No.</span>
                <p className="mt-0.5 text-sm font-mono font-medium text-slate-900">{client.consumerNumber || '—'}</p>
              </div>

              <div>
                <span className="text-xs text-slate-400">Required Solar Capacity</span>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{client.kwRequired ? `${client.kwRequired} kW` : '—'}</p>
              </div>

              <div>
                <span className="text-xs text-slate-400">Project Type</span>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{PROJECT_TYPE_LABEL[client.projectType] || '—'}</p>
              </div>

              <div>
                <span className="text-xs text-slate-400">Roof Type</span>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{ROOF_TYPE_LABEL[client.roofType] || '—'}</p>
              </div>

              {client.projectType !== 'residential' && (
                <div>
                  <span className="text-xs text-slate-400">GST Number</span>
                  <p className="mt-0.5 text-sm font-mono font-medium text-slate-900">{client.gstNumber || '—'}</p>
                </div>
              )}

              <div className="sm:col-span-2">
                <span className="text-xs text-slate-400">Address</span>
                <p className="mt-0.5 text-sm text-slate-800 leading-relaxed">{client.address || '—'}</p>
              </div>

              {client.notes && (
                <div className="sm:col-span-2 rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Internal Notes</span>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Portal access: the client's own view-only sign-in */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Client portal access</h2>
                <p className="mt-1 text-sm text-slate-600">{client.hasLogin ? <>Signs in with <b className="text-slate-900">{client.email}</b> and can view their proposals, prices and payments — not edit anything.</> : client.email ? 'No login yet. Create one so this client can view their proposals.' : 'Add an email address to this client to create their login.'}</p>
              </div>
              <div className="flex items-center gap-2">
                {client.hasLogin && <Badge tone="green">Active</Badge>}
                <Button size="sm" disabled={!client.email} loading={busy} onClick={manageLogin}>{client.hasLogin ? 'Reset password' : 'Create login'}</Button>
                {client.hasLogin && <Button size="sm" variant="dangerGhost" onClick={() => setModal({ type: 'removeLogin' })}>Remove access</Button>}
              </div>
            </div>
          </Card>

          {/* Client Designs Table */}
          {canViewDesigns && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">Proposals</h3>
                <p className="text-xs text-slate-500">Proposals created specifically for this client</p>
              </div>
              {canCreateDesign && (
                <Button size="sm" variant="secondary" icon={Plus} onClick={() => setModal({ type: 'design' })}>
                  Create proposal
                </Button>
              )}
            </div>

            {designsResource.loading ? (
              <LoadingBlock />
            ) : !clientDesigns.length ? (
              <div className="p-8 text-center">
                <PenTool className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-800">No proposals yet for this client</p>
                <p className="mt-1 text-xs text-slate-500">Create a solar rooftop design and pricing proposal.</p>
                {canCreateDesign && (
                  <Button size="sm" variant="primary" icon={Plus} className="mt-4" onClick={() => setModal({ type: 'design' })}>
                    New Proposal
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Proposal</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Capacity</Th>
                    <Th className="text-right">Price</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {clientDesigns.map((d) => (
                    <Tr key={d.id}>
                      <Td>
                        <Link href={designHref(d)} className="font-medium text-slate-900 hover:text-brand">
                          {d.name}
                        </Link>
                        {d.summary?.address && <div className="text-xs text-slate-400 truncate max-w-[200px]">{d.summary.address}</div>}
                      </Td>
                      <Td>
                        <Badge tone="slate">{d.status}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">{d.summary?.kwp ? `${d.summary.kwp.toFixed(2)} kWp` : '—'}</Td>
                      <Td className="text-right tabular-nums">{d.summary?.cost ? formatMoney(d.summary.cost, company.currency) : '—'}</Td>
                      <Td>
                        <div className="flex justify-end">
                          <RowMenu
                            label={`Actions for ${d.name}`}
                            items={[
                              { key: 'open', icon: ArrowUpRight, label: 'Open proposal', href: designHref(d) },
                              d.status === 'won' && { key: 'billing', icon: ReceiptText, label: 'Billing', href: `${billingBasePath}/${d.id}` },
                            ]}
                          />
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          )}
        </div>

        {/* Right Col: Source, Referral & Documents */}
        <div className="space-y-6">
          {/* Source & Referral Card */}
          <Card className="p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Lead Source &amp; Referral</h3>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-slate-400">Acquisition Source</span>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{client.source || 'Direct'}</p>
              </div>

              <div>
                <span className="text-xs text-slate-400">Referred by</span>
                <p className="mt-0.5 text-sm font-medium text-slate-900">
                  {client.referredBy?.name ? (
                    <>
                      {client.referredBy.name}
                      {client.referredBy.phone && <span className="block text-xs text-slate-500">{client.referredBy.phone}</span>}
                    </>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
            </div>
          </Card>

          {/* Uploaded Documents Card */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Documents ({client.documents?.length || 0})</h3>
            </div>

            {!client.documents?.length ? (
              <p className="text-xs text-slate-400">No documents attached.</p>
            ) : (
              <div className="space-y-2.5">
                {client.documents.map((doc, idx) => (
                  <div key={doc.url || idx} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <a
                          href={assetUrl(doc.url)}
                          onClick={(e) => { e.preventDefault(); openStoredFile(doc.url, { mimetype: doc.mimetype, name: doc.name }); }}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate font-medium text-slate-800 hover:text-brand hover:underline"
                          title={doc.name}
                        >
                          {doc.name || 'Document'}
                        </a>
                        <span className="text-xs text-slate-400">{formatFileSize(doc.size)}</span>
                      </div>
                    </div>
                    <a
                      href={assetUrl(doc.url)}
                      onClick={(e) => { e.preventDefault(); openStoredFile(doc.url, { mimetype: doc.mimetype, name: doc.name }); }}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="View file"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {creds && <ClientCredentials clientName={creds.clientName} credentials={creds.credentials} onClose={() => setCreds(null)} />}
      <ConfirmDialog open={modal?.type === 'removeLogin'} onClose={close} onConfirm={removeLogin} busy={busy} error={modalError} title="Remove portal access?" confirmLabel="Remove access">
        <b className="text-slate-900">{client.name}</b> will no longer be able to sign in. Their proposals stay; you can create a new login any time.
      </ConfirmDialog>
      {modal?.type === 'design' && canCreateDesign && <NewDesignModal clients={[client]} clientId={client.id} onClose={close} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this client?" confirmLabel="Delete client">
        <b className="text-slate-900">{client.name}</b> will be permanently deleted along with their proposals.
      </ConfirmDialog>
    </div>
  );
}
