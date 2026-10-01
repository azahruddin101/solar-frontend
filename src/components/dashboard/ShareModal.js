'use client';

// The proposal's public link and QR code: copy the link, download the QR, open the page, or switch the link off.
import { Check, Copy, Download, ExternalLink, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ensureShareUrl, qrDataUrl } from '@/lib/share';
import { Alert, Button, Modal, Spinner, buttonClass, toast } from '../kit';

export default function ShareModal({ designId, onClose }) {
  const [state, setState] = useState({ loading: true, url: '', qr: '', error: '' });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setState({ loading: true, url: '', qr: '', error: '' });
    try {
      const url = await ensureShareUrl(designId);
      setState({ loading: false, url, qr: await qrDataUrl(url, 600), error: '' });
    } catch (e) {
      setState({ loading: false, url: '', qr: '', error: e.message });
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy did not work — select the link and copy it instead.');
    }
  };
  const switchOff = async () => {
    setBusy(true);
    try {
      await api(`/api/designs/${designId}/share`, { method: 'DELETE' });
      setState({ loading: false, url: '', qr: '', error: '' });
      toast.success('The public link is switched off');
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title="Share this proposal" description="Anyone with the link, or who scans the QR code, can view the proposal — without signing in. They cannot change anything." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}
        {state.loading ? (
          <div className="grid h-56 place-items-center"><Spinner className="h-6 w-6" /></div>
        ) : state.url ? (
          <>
            <div className="grid place-items-center rounded-xl border border-slate-200 bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.qr} alt="QR code for the proposal link" className="h-48 w-48" />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="min-w-0 flex-1 select-all truncate font-mono text-sm text-slate-900">{state.url}</span>
              <button type="button" onClick={copy} aria-label="Copy link" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-700 hover:bg-white">{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={state.url} target="_blank" rel="noreferrer" className={buttonClass({ size: 'sm' })}><ExternalLink className="h-4 w-4" /> Open the page</a>
              <a href={state.qr} download="proposal-qr.png" className={buttonClass({ size: 'sm' })}><Download className="h-4 w-4" /> Download QR</a>
              <Button size="sm" variant="dangerGhost" loading={busy} onClick={switchOff}>Switch link off</Button>
            </div>
            <p className="text-xs text-slate-600">The same QR code is printed on every PDF of this proposal. Switching the link off also stops the QR codes on PDFs you already sent.</p>
          </>
        ) : !state.error && (
          <div className="space-y-3 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-700"><QrCode className="h-6 w-6" /></span>
            <p className="text-sm text-slate-700">The public link is switched off. Create a new link to share the proposal again (older QR codes stay dead).</p>
            <Button variant="primary" onClick={load}>Create a new link</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
