'use client';

// The client's sign-in, shown once right after it is created or reset (only the hash is stored) so the company can hand it over.
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button, Modal, toast } from '../kit';

function Row({ label, value }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error('Copy did not work — select the text instead.');
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
      <div className="min-w-0"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div><div className="select-all break-all font-mono text-sm font-semibold text-slate-900">{value}</div></div>
      <button type="button" onClick={copy} aria-label={`Copy ${label}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900">{done ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
    </div>
  );
}

export default function ClientCredentials({ clientName, credentials, onClose }) {
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/login`;
  const message = `Hello ${clientName},\n\nYou can now follow your solar proposals online.\n\nSign in: ${url}\nEmail: ${credentials.email}\nPassword: ${credentials.password}\n\nPlease change your password after signing in.`;
  const [copied, setCopied] = useState(false);
  return (
    <Modal open onClose={onClose} title="Client login created" description={`${clientName} can now sign in to see their proposals (view only).`} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-3">
        <Alert tone="warn">Copy the password now — it is shown only once. If it is lost, reset it from the client&apos;s page.</Alert>
        <Row label="Sign-in page" value={url} />
        <Row label="Email" value={credentials.email} />
        <Row label="Password" value={credentials.password} />
        <Button icon={copied ? Check : Copy} onClick={async () => { try { await navigator.clipboard.writeText(message); setCopied(true); } catch { toast.error('Copy did not work'); } }}>{copied ? 'Message copied' : 'Copy as a message to send'}</Button>
      </div>
    </Modal>
  );
}
