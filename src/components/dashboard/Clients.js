'use client';

// Clients never sign in — the company keeps their name, email and address here.
import { Mail, MapPin, PenTool, Pencil, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Avatar, Button, Card, ConfirmDialog, EmptyState, FormField, FormModal, IconButton, Input, LoadingBlock, PageHeader, Table, Td, Textarea, Th, Tr, formatDate, toast } from '../kit';
import { NewDesignModal } from './shared';

const BLANK = { name: '', email: '', phone: '', address: '', notes: '' };

function ClientForm({ client, onClose, onSaved }) {
  const editing = Boolean(client?.id);
  const [form, setForm] = useState({ ...BLANK, ...client });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const saved = editing ? await api(`/api/clients/${client.id}`, { method: 'PUT', body: form }) : await api('/api/clients', { method: 'POST', body: form });
      onSaved({ designs: client?.designs || 0, ...saved });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={editing ? 'Edit client' : 'Add a client'} description="These details appear on the client’s proposal PDF." submitLabel={editing ? 'Save changes' : 'Add client'} busy={busy} error={error} onSubmit={submit}>
      <FormField label="Full name"><Input required maxLength={120} value={form.name} onValue={(v) => set({ name: v })} placeholder="Ravi Kumar" /></FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Email" optional><Input type="email" value={form.email} onValue={(v) => set({ email: v })} placeholder="ravi@example.com" /></FormField>
        <FormField label="Phone" optional><Input value={form.phone} onValue={(v) => set({ phone: v })} maxLength={40} /></FormField>
      </div>
      <FormField label="Address" optional><Textarea rows={2} maxLength={400} value={form.address} onValue={(v) => set({ address: v })} placeholder="House / street, city, PIN" /></FormField>
      <FormField label="Notes" optional hint="Private to your company."><Textarea rows={2} maxLength={1000} value={form.notes} onValue={(v) => set({ notes: v })} /></FormField>
    </FormModal>
  );
}

export default function Clients() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, setData, loading, error } = useResource('/api/clients');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (params.get('new')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal({ type: 'form' });
      router.replace('/dashboard/clients');
    }
  }, [params, router]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((c) => !q || `${c.name} ${c.email} ${c.phone} ${c.address}`.toLowerCase().includes(q));
  }, [data, query]);

  const close = () => { setModal(null); setModalError(''); };
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
        <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Add client</Button>
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input aria-label="Search clients" placeholder="Search by name, email, phone or address" value={query} onValue={setQuery} className="pl-9" />
          </div>
        </div>
        {loading ? <LoadingBlock /> : !rows.length ? (
          <EmptyState icon={Users} title={data?.length ? 'No clients match' : 'No clients yet'} description={data?.length ? 'Try a different search.' : 'Add a client to start creating designs and proposals for them.'}>
            {!data?.length && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Add client</Button>}
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Client</Th><Th>Contact</Th><Th>Address</Th><Th className="text-right">Designs</Th><Th>Added</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td><div className="flex items-center gap-3"><Avatar name={c.name} /><span className="max-w-[200px] truncate font-medium text-slate-900">{c.name}</span></div></Td>
                  <Td className="text-[13px]">
                    {c.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" /> {c.email}</div>}
                    {c.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" /> {c.phone}</div>}
                    {!c.email && !c.phone && <span className="text-slate-400">—</span>}
                  </Td>
                  <Td className="text-[13px]">{c.address ? <div className="flex max-w-[240px] items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span className="line-clamp-2">{c.address}</span></div> : <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-right tabular-nums">{c.designs ? <button type="button" className="font-medium text-brand hover:underline" onClick={() => router.push(`/dashboard/designs?client=${c.id}`)}>{c.designs}</button> : 0}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(c.createdAt)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button size="sm" icon={PenTool} onClick={() => setModal({ type: 'design', client: c })} className="mr-1">New design</Button>
                      <IconButton icon={Pencil} label="Edit" onClick={() => setModal({ type: 'form', client: c })} />
                      <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setModal({ type: 'delete', client: c })} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modal?.type === 'form' && (
        <ClientForm
          client={modal.client}
          onClose={close}
          onSaved={(c) => {
            setData((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]));
            toast.success(modal.client ? 'Client updated' : 'Client added');
            close();
          }}
        />
      )}
      {modal?.type === 'design' && <NewDesignModal clients={data} clientId={modal.client.id} onClose={close} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this client?" confirmLabel="Delete client">
        <b className="text-slate-900">{modal?.client?.name}</b> will be permanently deleted{modal?.client?.designs ? <>, together with their <b className="text-slate-900">{modal.client.designs} design{modal.client.designs > 1 ? 's' : ''}</b></> : ''}.
      </ConfirmDialog>
    </>
  );
}
