'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Badge, FormField, FormModal, Input, Select } from '../kit';

export const DESIGN_STATUSES = [
  { id: 'draft', label: 'Draft', tone: 'slate' },
  { id: 'proposed', label: 'Proposed', tone: 'blue' },
  { id: 'won', label: 'Won', tone: 'green' },
  { id: 'lost', label: 'Lost', tone: 'red' },
];

export function DesignStatusBadge({ status }) {
  const s = DESIGN_STATUSES.find((x) => x.id === status) || DESIGN_STATUSES[0];
  return <Badge dot tone={s.tone}>{s.label}</Badge>;
}

export const designHref = (d) => `/design/${d.id}/${d.summary?.panels ? 'plan' : 'location'}`;

/** Pick the client (or arrive with one) and name the design, then open the designer. */
export function NewDesignModal({ clients, clientId, onClose }) {
  const router = useRouter();
  const [client, setClient] = useState(clientId || clients[0]?.id || '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const design = await api('/api/designs', { method: 'POST', body: { client, name } });
      router.push(`/design/${design.id}/location`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} size="sm" title="New design" description="The proposal PDF will be addressed to this client." submitLabel="Start designing" busy={busy} error={error} onSubmit={submit}>
      <FormField label="Client">
        <Select required value={client} onValue={setClient}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </FormField>
      <FormField label="Design name" optional hint="Defaults to “Client name – rooftop solar”.">
        <Input value={name} onValue={setName} maxLength={120} placeholder="e.g. Main building, 10 kW option" />
      </FormField>
    </FormModal>
  );
}
