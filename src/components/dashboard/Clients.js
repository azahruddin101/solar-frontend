'use client';

// The company keeps its clients here. A client with an email also gets a view-only sign-in to follow their proposals.
import { Eye, Pencil, Plus, Search, Trash2, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { usePagedResource } from '@/lib/useResource';
import { Alert, Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, Input, LoadingBlock, LoadMoreRow, PageHeader, Table, Td, Th, Tr, formatDate, toast, RowMenu } from '../kit';
import ClientCredentials from './ClientCredentials';
import ClientForm from './ClientForm';

export default function Clients({ basePath = '/dashboard/clients' }) {
  const router = useRouter();
  const params = useSearchParams();
  const { items: data, setItems: setData, total, loading, error, hasMore, loadingMore, loadMore } = usePagedResource('/api/clients', { limit: 100 });
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [creds, setCreds] = useState(null); // a client's fresh sign-in, shown once

  useEffect(() => {
    if (params.get('new')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal({ type: 'form' });
      router.replace(basePath);
    }
  }, [params, router, basePath]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter(
      (c) =>
        !q ||
        `${c.name} ${c.email} ${c.phone} ${c.address} ${c.consumerNumber || ''} ${c.source || ''} ${c.referredBy?.name || ''}`
          .toLowerCase()
          .includes(q)
    );
  }, [data, query]);

  const close = () => {
    setModal(null);
    setModalError('');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/clients/${modal.client.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.client.id));
      toast.success('Client deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Clients" description="The people and businesses you design solar for.">
        <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>
          Add client
        </Button>
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input
              aria-label="Search clients"
              placeholder="Search by name, email, phone, consumer no. or source"
              value={query}
              onValue={setQuery}
              className="pl-9"
            />
          </div>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : !rows.length ? (
          <EmptyState
            icon={Users}
            title={data?.length ? 'No clients match' : 'No clients yet'}
            description={data?.length ? 'Try a different search.' : 'Add a client to start creating designs and proposals for them.'}
          >
            {!data?.length && (
              <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>
                Add client
              </Button>
            )}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Contact</Th>
                <Th>Requirement</Th>
                <Th className="text-right">Proposals</Th>
                <Th>Added</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <div className="min-w-0">
                        <Link
                          href={`${basePath}/${c.id}`}
                          className="font-medium text-slate-900 hover:text-brand hover:underline block truncate max-w-[220px]"
                        >
                          {c.name}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          {c.source && <span>{c.source}</span>}
                          {c.documents?.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-brand font-medium">{c.documents.length} doc{c.documents.length > 1 ? 's' : ''}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-[13px]">
                    {c.phone && <div className="font-medium text-slate-800">{c.phone}</div>}
                    {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                    {!c.phone && !c.email && <span className="text-slate-400">—</span>}
                  </Td>
                  <Td className="text-[13px]">
                    {c.kwRequired ? (
                      <Badge tone="brand">
                        <Zap className="h-3 w-3" /> {c.kwRequired} kW
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {c.designs ? (
                      <button
                        type="button"
                        className="font-medium text-brand hover:underline"
                        onClick={() => router.push(`/dashboard/designs?client=${c.id}`)}
                      >
                        {c.designs}
                      </button>
                    ) : (
                      0
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(c.createdAt)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${c.name}`}
                        items={[
                          { key: 'view', icon: Eye, label: 'View client', href: `${basePath}/${c.id}` },
                          { key: 'edit', icon: Pencil, label: 'Edit client', onClick: () => setModal({ type: 'form', client: c }) },
                          { key: 'delete', icon: Trash2, label: 'Delete client', tone: 'danger', onClick: () => setModal({ type: 'delete', client: c }) },
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

      {modal?.type === 'form' && (
        <ClientForm
          client={modal.client}
          onClose={close}
          onSaved={({ credentials, loginError, ...c }) => {
            setData((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]));
            toast.success(modal.client ? 'Client updated' : 'Client added');
            if (loginError) toast.error(`Client added, but no login was created: ${loginError}`);
            close();
            if (credentials) setCreds({ clientName: c.name, credentials });
          }}
        />
      )}
      {creds && <ClientCredentials clientName={creds.clientName} credentials={creds.credentials} onClose={() => setCreds(null)} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this client?" confirmLabel="Delete client">
        <b className="text-slate-900">{modal?.client?.name}</b> will be permanently deleted
        {modal?.client?.designs ? (
          <>
            , together with their <b className="text-slate-900">{modal.client.designs} proposal{modal.client.designs > 1 ? 's' : ''}</b>
          </>
        ) : (
          ''
        )}
      </ConfirmDialog>
    </>
  );
}

