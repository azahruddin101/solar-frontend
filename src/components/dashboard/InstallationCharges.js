'use client';

// The company's installation-charge options (inverter installation, wiring…). A proposal picks from this list
// and types the price against each pick, so the list itself only needs names (and an optional starting price).
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, ConfirmDialog, EmptyState, FormField, FormModal, Input, LoadingBlock, PageHeader, Table, Td, Th, Tr, toast, RowMenu } from '../kit';

function ChargeForm({ charge, onClose, onSaved }) {
  const editing = Boolean(charge?.id);
  const [form, setForm] = useState({
    name: charge?.name || '',
    description: charge?.description || '',
    defaultPrice: charge?.defaultPrice ? String(charge.defaultPrice) : '',
    gstPercent: charge?.gstPercent != null && charge?.gstPercent !== '' ? String(charge.gstPercent) : '18',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.name.trim()) return setError('Enter a charge name');
    setBusy(true);
    setError('');
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        defaultPrice: Number(form.defaultPrice) || 0,
        gstPercent: Math.max(0, Math.min(100, Number(form.gstPercent) || 18)),
      };
      onSaved(await api(editing ? `/api/installation-charges/${charge.id}` : '/api/installation-charges', { method: editing ? 'PUT' : 'POST', body }), editing);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title={editing ? 'Edit installation charge' : 'New installation charge'} description="Something you charge for on top of the equipment — inverter installation, wiring, earthing…" submitLabel={editing ? 'Save changes' : 'Add charge'} busy={busy} error={error} onSubmit={submit} noValidate>
      <FormField label="Charge name"><Input maxLength={80} value={form.name} onValue={(v) => setForm({ ...form, name: v.replace(/^\s+/, '') })} placeholder="e.g. Inverter installation" /></FormField>
      <FormField label="Description" optional><Input maxLength={300} value={form.description} onValue={(v) => setForm({ ...form, description: v })} /></FormField>
      <FormField label="Usual price" optional hint="Only pre-fills the price on a proposal — you can change it there every time."><Input type="number" min={0} step="any" value={form.defaultPrice} onValue={(v) => setForm({ ...form, defaultPrice: v })} /></FormField>
      <FormField label="GST %" hint="Applied to this charge on proposals (ex-GST price + this %)."><Input type="number" min={0} max={100} step="0.1" value={form.gstPercent} onValue={(v) => setForm({ ...form, gstPercent: v })} /></FormField>
    </FormModal>
  );
}

export default function InstallationCharges() {
  const { data, setData, loading, error } = useResource('/api/installation-charges');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const close = () => { setModal(null); setModalError(''); };

  const saved = (item, editing) => {
    setData((list) => (editing ? list.map((x) => (x.id === item.id ? item : x)) : [...(list || []), item].sort((a, b) => a.name.localeCompare(b.name))));
    toast.success(editing ? 'Charge updated' : 'Charge added');
    close();
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/installation-charges/${modal.item.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.item.id));
      toast.success('Charge deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Installation charges" description="The charge options you can add to any proposal — with or without a 3D design. Pick one in the proposal and type its price there.">
        <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>New charge</Button>
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}

      <Card className="overflow-hidden">
        {loading ? <LoadingBlock /> : !data?.length ? (
          <EmptyState icon={Wrench} title="No installation charges yet" description="Add options like inverter installation, wiring or earthing. You will pick them from a dropdown when you create a proposal.">
            <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>New charge</Button>
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Charge</Th><Th>Description</Th><Th className="text-right">Usual price</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {data.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td className="max-w-[320px] truncate text-slate-500">{c.description || '—'}</Td>
                  <Td className="text-right tabular-nums">{c.defaultPrice ? c.defaultPrice.toLocaleString('en-IN') : '—'}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <RowMenu
                        label={`Actions for ${c.name}`}
                        items={[
                          { key: 'edit', icon: Pencil, label: 'Edit charge', onClick: () => setModal({ type: 'form', item: c }) },
                          { key: 'delete', icon: Trash2, label: 'Delete charge', tone: 'danger', onClick: () => setModal({ type: 'delete', item: c }) },
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

      {modal?.type === 'form' && <ChargeForm charge={modal.item} onClose={close} onSaved={saved} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} title="Delete this charge?" busy={busy} error={modalError}>
        “{modal?.item?.name}” will no longer appear in the dropdown. Proposals that already use it keep their charge.
      </ConfirmDialog>
    </>
  );
}
