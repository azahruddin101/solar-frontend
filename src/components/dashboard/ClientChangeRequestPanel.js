'use client';

import { MessageSquare, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Button, Card, FormField, Modal, Textarea, buttonClass, formatDate, toast } from '../kit';
import { designHref } from './shared';

const DEFAULT_MESSAGE = 'I have made the changes you requested. Please review the updated proposal.';

/** Shown when the client asked for changes on a proposed design — full feedback + send-for-review action. */
export default function ClientChangeRequestPanel({ design, compact, onSent, className }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [busy, setBusy] = useState(false);

  if (!design || design.status !== 'proposed' || design.clientResponse?.decision !== 'changes_requested') return null;

  const note = design.clientResponse.note || '';
  const respondedAt = design.clientResponse.respondedAt;

  const send = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error('Add a short message for your client.');
      return;
    }
    setBusy(true);
    try {
      const updated = await api(`/api/designs/${design.id}/send-for-review`, { method: 'POST', body: { message: trimmed } });
      toast.success('The client can review the updated proposal in their portal.');
      onSent?.(updated);
      setOpen(false);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950">Client requested changes</p>
          {!compact && design.client?.name && <p className="mt-0.5 text-xs text-amber-900/80">From {design.client.name}{respondedAt ? ` · ${formatDate(respondedAt)}` : ''}</p>}
          <blockquote className="mt-3 rounded-lg border border-amber-200/80 bg-white/70 px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap">{note || '—'}</blockquote>
        </div>
        {!compact && (
          <Link href={designHref(design)} className={buttonClass({ size: 'sm', variant: 'ghost', className: 'shrink-0' })}>Open proposal</Link>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" icon={Send} onClick={() => { setMessage(DEFAULT_MESSAGE); setOpen(true); }}>Send for client review</Button>
        <p className="self-center text-xs text-amber-900/80">Use this after you have updated the proposal. The client will be notified to accept, decline, or request further changes.</p>
      </div>
    </>
  );

  return (
    <>
      {compact ? (
        <div className={className}>{body}</div>
      ) : (
        <Card className={`border-amber-200 bg-amber-50/80 p-5 ${className || ''}`}>{body}</Card>
      )}
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Send updated proposal for review"
        description="Your client will see this message in their portal and can respond again."
        footer={(
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Send} loading={busy} onClick={send}>Notify client</Button>
          </>
        )}
      >
        <FormField label="Message to client" htmlFor="review-message">
          <Textarea id="review-message" rows={4} value={message} onValue={setMessage} maxLength={2000} />
        </FormField>
      </Modal>
    </>
  );
}

/** List of all designs awaiting company action after a client change request. */
export function ClientChangeRequestsSection({ designs, onSent }) {
  const pending = (designs || []).filter((d) => d.status === 'proposed' && d.clientResponse?.decision === 'changes_requested');
  if (!pending.length) return null;
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare className="h-4 w-4 text-amber-600" />Client change requests ({pending.length})</div>
      {pending.map((d) => (
        <ClientChangeRequestPanel key={d.id} design={d} onSent={(updated) => onSent?.(d.id, updated)} />
      ))}
    </div>
  );
}
