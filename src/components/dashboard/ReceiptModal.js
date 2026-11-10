'use client';

// Record money received from a client and give a receipt: the amount, the date, how it was paid, who took it and an
// optional reason. Any amount is fine — part of what is due, all of it, or an advance.
import { useState } from 'react';
import { PAYMENT_MODE_LABEL } from '@/lib/billingPdfShared';
import { formatMoney } from '@/lib/energy';
import { useSession } from '@/lib/session';
import { FormField, FormModal, Input, Select } from '../kit';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * `party` is `{ design }` or `{ client }` (ids); `partyName` the proposal's or client's name shown in the title;
 * `due` what is billed and not received yet (pre-fills the amount). `onSubmit(body)` posts to /api/billing/receipts.
 */
export default function ReceiptModal({ open, onClose, party, partyName, due = 0, currency = 'INR', busy, onSubmit }) {
  const user = useSession((s) => s.user);
  const [amount, setAmount] = useState(due > 0 ? String(Math.round(due * 100) / 100) : '');
  const [receivedOn, setReceivedOn] = useState(today());
  const [mode, setMode] = useState('cash');
  const [reference, setReference] = useState('');
  const [receivedBy, setReceivedBy] = useState(user?.name || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const money = (v) => formatMoney(v, currency);
  const value = Number(amount);

  const submit = () => {
    if (!(value > 0)) return setError('Enter the amount received');
    if (!receivedOn) return setError('Choose the date');
    if (receivedOn > today()) return setError('The date can’t be in the future');
    if (!receivedBy.trim()) return setError('Enter who received the money');
    setError('');
    onSubmit({ ...party, amount: Math.round(value * 100) / 100, mode, reference: reference.trim(), receivedOn, receivedBy: receivedBy.trim(), reason: reason.trim() });
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Receipt · ${partyName}`}
      description={due > 0 ? `${money(due)} is due. Enter what the client paid now.` : 'Enter what the client paid. A receipt is made for it.'}
      submitLabel={value > 0 ? `Save receipt · ${money(value)}` : 'Save receipt'}
      busy={busy}
      error={error}
      onSubmit={submit}
      noValidate
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Amount received"><Input type="number" inputMode="decimal" min={0} step="any" autoFocus value={amount} onValue={setAmount} placeholder="0" /></FormField>
        <FormField label="Date"><Input type="date" max={today()} value={receivedOn} onValue={setReceivedOn} /></FormField>
        <FormField label="Paid by">
          <Select value={mode} onValue={setMode}>{Object.entries(PAYMENT_MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </FormField>
        <FormField label="Reference no." optional hint="UPI / transaction id or cheque number"><Input maxLength={80} value={reference} onValue={setReference} /></FormField>
        <FormField label="Received by" hint="The person who took the money and gives the receipt" className="sm:col-span-2"><Input maxLength={120} value={receivedBy} onValue={setReceivedBy} /></FormField>
        <FormField label="Reason" optional hint="Printed on the receipt, e.g. Advance, Part payment" className="sm:col-span-2"><Input maxLength={300} value={reason} onValue={setReason} placeholder="Optional" /></FormField>
      </div>
    </FormModal>
  );
}
