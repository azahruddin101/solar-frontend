'use client';

import { useState } from 'react';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdf';
import { useResource } from '@/lib/useResource';
import { invoiceBillToSchema, useValidation } from '@/lib/validation';
import { FormField, FormModal, Input, NumField, PhoneInput, Select } from '../kit';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY_BILL_TO = { name: '', phone: '', email: '', address: '' };

/** Record a payment receipt that is not tied to a proposal (like a direct invoice). */
export default function ReceiptDirectModal({ open, onClose, currency = 'INR', busy, onSubmit }) {
  const { data: clientList } = useResource(open ? '/api/clients?limit=200' : null);
  const [clientId, setClientId] = useState('');
  const [billTo, setBillTo] = useState(EMPTY_BILL_TO);
  const [title, setTitle] = useState('');
  const [form, setForm] = useState({ amount: '', mode: 'upi', reference: '', receivedOn: today(), note: '' });
  const [error, setError] = useState('');
  const billToV = useValidation(invoiceBillToSchema, billTo);

  const pickClient = (id) => {
    setClientId(id);
    const c = (clientList?.items || []).find((x) => x.id === id);
    if (c) setBillTo({ name: c.name || '', phone: c.phone || '', email: c.email || '', address: c.address || '' });
    else setBillTo(EMPTY_BILL_TO);
  };

  const submit = () => {
    const cleaned = billToV.validate();
    if (!cleaned) return setError('Check the payer details');
    const amount = Number(form.amount);
    if (!(amount > 0)) return setError('Enter the amount received');
    setError('');
    onSubmit({
      client: clientId || null,
      billTo: cleaned,
      title: title.trim() || billTo.name,
      amount,
      mode: form.mode,
      reference: form.reference,
      receivedOn: form.receivedOn,
      note: form.note,
    });
  };

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const needsRef = form.mode !== 'cash';

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Direct receipt"
      description="Issue a receipt for a payment that is not linked to a proposal."
      submitLabel="Save & create receipt"
      busy={busy}
      error={error}
      onSubmit={submit}
      noValidate
      size="lg"
    >
      <FormField label="Existing client" optional hint="Optional — fills payer details from your client list.">
        <Select value={clientId} onValue={pickClient}>
          <option value="">Type payer details below</option>
          {(clientList?.items || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
          ))}
        </Select>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Received from" error={billToV.error('name')}>
          <Input maxLength={120} value={billTo.name} onValue={(v) => setBillTo((b) => ({ ...b, name: v }))} />
        </FormField>
        <FormField label="Phone" optional error={billToV.error('phone')}>
          <PhoneInput value={billTo.phone} onValue={(v) => setBillTo((b) => ({ ...b, phone: v }))} />
        </FormField>
        <FormField label="Email" optional className="sm:col-span-2" error={billToV.error('email')}>
          <Input type="email" value={billTo.email} onValue={(v) => setBillTo((b) => ({ ...b, email: v }))} />
        </FormField>
        <FormField label="Address" optional className="sm:col-span-2" error={billToV.error('address')}>
          <Input value={billTo.address} onValue={(v) => setBillTo((b) => ({ ...b, address: v }))} />
        </FormField>
        <FormField label="Towards" optional hint="Shown on the receipt (defaults to payer name).">
          <Input maxLength={160} value={title} onValue={setTitle} placeholder="e.g. Advance for rooftop solar" />
        </FormField>
        <FormField label="Amount received">
          <NumField min={0} step="any" value={form.amount} onValue={(v) => set({ amount: v })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        </FormField>
        <FormField label="Payment date">
          <Input type="date" max={today()} value={form.receivedOn} onValue={(v) => set({ receivedOn: v })} />
        </FormField>
        <FormField label="Payment mode">
          <Select value={form.mode} onValue={(v) => set({ mode: v })}>
            {Object.entries(PAYMENT_MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </FormField>
        <FormField label={form.mode === 'cheque' ? 'Cheque number' : 'Reference / Transaction no.'} optional={!needsRef}>
          <Input maxLength={80} value={form.reference} onValue={(v) => set({ reference: v })} />
        </FormField>
      </div>
      <FormField label="Note" optional>
        <Input maxLength={300} value={form.note} onValue={(v) => set({ note: v })} />
      </FormField>
    </FormModal>
  );
}
