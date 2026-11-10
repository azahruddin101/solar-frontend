'use client';

// "Convert to proposal": makes a 2D proposal from a saved estimate with the same items and prices. A proposal always
// belongs to a saved client, so an estimate whose client was typed by hand asks which client it is for.
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { convertEstimateToProposal } from '@/lib/estimateToQuote';
import { useResource } from '@/lib/useResource';
import { Alert, FormField, FormModal, Select, toast } from '../kit';

const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10);

/** `estimate`: a saved estimate (the list's row is enough: id, client, design). */
export default function ConvertEstimateDialog({ estimate, onClose }) {
  const router = useRouter();
  const clients = useResource('/api/clients?limit=500');
  const list = useMemo(() => clients.data?.items || [], [clients.data]);
  // the estimate's own client; for a typed client, the saved client with the same phone or name
  const guess = useMemo(() => {
    const c = estimate.client || {};
    if (c.clientId && list.some((x) => x.id === c.clientId)) return c.clientId;
    const phone = digits(c.phone);
    const name = String(c.name || '').trim().toLowerCase();
    return (list.find((x) => phone && digits(x.phone) === phone) || list.find((x) => name && String(x.name || '').trim().toLowerCase() === name))?.id || '';
  }, [estimate, list]);
  const [picked, setPicked] = useState(null);
  const clientId = picked ?? guess;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const madeBefore = estimate.design?.id || (typeof estimate.design === 'string' ? estimate.design : '');

  const submit = async () => {
    if (!clientId) return setError('Choose the client this proposal is for');
    setBusy(true);
    setError('');
    try {
      const full = estimate.lines ? estimate : await api(`/api/estimates/${estimate.id}`);
      const design = await convertEstimateToProposal(full, clientId);
      toast.success('Proposal created from the estimate');
      router.push(`/proposal/${design.id}`);
    } catch (e) {
      setError(e.message || 'The proposal could not be created');
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} title="Convert to proposal" description="A 2D proposal is made with the same items, quantities and prices. The estimate stays as it is." submitLabel="Create proposal" busy={busy} error={error} onSubmit={submit} noValidate>
      <FormField label="Client" hint={!estimate.client?.clientId && !clients.loading ? (guess ? 'Matched to a saved client by phone or name. Change it if this is not right.' : 'This estimate’s client was typed by hand. Choose the saved client, or add the client under Clients first.') : undefined}>
        <Select value={clientId} onValue={(v) => { setPicked(v); setError(''); }} disabled={clients.loading}>
          <option value="">{clients.loading ? 'Loading clients…' : 'Choose a client'}</option>
          {list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
        </Select>
      </FormField>
      {clients.error && <Alert>{clients.error}</Alert>}
      {madeBefore && <Alert tone="warn">A proposal was already made from this estimate{estimate.design?.name ? ` (${estimate.design.name})` : ''}. This will make another one.</Alert>}
    </FormModal>
  );
}
