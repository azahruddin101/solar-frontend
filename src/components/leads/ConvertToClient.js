'use client';

// When a lead is set to the converted status: the Add client form opens straight away, filled in from the lead
// (name, phone, address, email). Saving creates the client and links it to the lead ("Converted to client …").
import { api } from '@/lib/api';
import { toast } from '../kit';
import ClientForm from '../dashboard/ClientForm';

/** The lead's details as a new client (phone as the 10-digit mobile the client form expects). */
export function clientFromLead({ name, phone, address, email, source }) {
  return {
    name: name || '',
    phone: String(phone || '').replace(/\D/g, '').slice(-10),
    address: address || '',
    email: email || '',
    source: source === 'meta' ? 'Social Media' : source === 'google' ? 'Advertisement' : 'Other',
    notes: '',
  };
}

/** `lead`: { source: 'meta' | 'google' | 'manual', id, name, phone, address, email }. */
export default function ConvertToClient({ lead, onClose, onConverted }) {
  return (
    <ClientForm
      client={clientFromLead(lead)}
      onClose={onClose}
      onSaved={async (client) => {
        try {
          const link = await api(`/api/leads/${lead.source}/${lead.id}/converted`, { method: 'PUT', body: { clientId: client.id } });
          toast.success(`${client.name} added as a client`);
          onConverted({ ...link, client });
        } catch (e) {
          // the client exists either way; only the link to the lead failed
          toast.error(`${client.name} was added as a client, but the lead could not be linked: ${e.message}`);
          onClose();
        }
      }}
    />
  );
}
