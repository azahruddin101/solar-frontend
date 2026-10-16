'use client';

// Integrations → Google Sheet. Each company connects its own sheet: copy the script (it carries this company's
// secret) into the sheet, publish it as a web app, paste the web app address here. From then on the sheet's
// "Leads" tab is rewritten a few seconds after any lead changes — same columns as the lead export.
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, KeyRound, Link2, RefreshCw, Unplug } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, ConfirmDialog, cx, Input, LoadingBlock, toast } from '@/components/kit';
import { copyValue, formatWhen, StatusPill, Step } from './integrationUi';

const BASE = '/api/company/integrations/sheet';

const SheetIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="#0F9D58" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <path fill="#87CEAC" d="M14.5 2v5.5H20z" />
    <path fill="#fff" d="M7.5 10.5h9v7h-9zm1.2 1.2v1.7h2.7v-1.7zm3.9 0v1.7h2.7v-1.7zm-3.9 2.9v1.7h2.7v-1.7zm3.9 0v1.7h2.7v-1.7z" />
  </svg>
);
export { SheetIcon };

const Kbd = ({ children }) => <b className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] font-medium text-slate-800">{children}</b>;

function ScriptBox({ script }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyValue(script)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-medium text-slate-500">Script for your sheet · includes your private key</span>
        <button type="button" onClick={copy} className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors', copied ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-700')}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy script'}
        </button>
      </div>
      <pre className="max-h-[28rem] overflow-auto bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-600">{script}</pre>
    </div>
  );
}

export default function GoogleSheetIntegration() {
  const { data: sheet, setData, error: loadError } = useResource(BASE);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // 'key' | 'off'

  const run = async (kind, fn) => {
    setBusy(kind);
    setError('');
    try {
      await fn();
    } catch (e) {
      if (kind === 'connect') setError(e.message);
      else toast.error(e.message);
    }
    setBusy('');
  };
  const connect = (e) => {
    e.preventDefault();
    run('connect', async () => {
      const next = await api(BASE, { method: 'PUT', body: { webAppUrl: url.trim() } });
      setData(next);
      setUrl('');
      toast.success(next.message || 'Google Sheet connected');
    });
  };
  const syncNow = () => run('sync', async () => {
    try {
      const next = await api(`${BASE}/sync`, { method: 'POST' });
      setData(next);
      toast.success(next.message);
    } catch (e) {
      setData((s) => ({ ...s, lastError: e.message, lastErrorAt: new Date().toISOString() }));
      throw e;
    }
  });
  const newKey = () => run('key', async () => {
    setData(await api(`${BASE}/secret`, { method: 'POST' }));
    setConfirm(null);
    toast.success('New key made. Copy the script again and paste it over the old one in your sheet.');
  });
  const disconnect = () => run('off', async () => {
    setData(await api(BASE, { method: 'DELETE' }));
    setConfirm(null);
    toast.success('Google Sheet disconnected. What’s already in the sheet stays.');
  });

  if (!sheet) return loadError ? <Alert>{loadError}</Alert> : <LoadingBlock />;
  const connected = sheet.connected;
  const failing = connected && sheet.lastError;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 ring-1 ring-emerald-100"><SheetIcon className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-slate-900">Google Sheet</h2>
                <p className="text-[13px] text-slate-500">Keep a live copy of all your leads in your own Google Sheet.</p>
              </div>
            </div>
            {failing ? <StatusPill tone="red">Not updating</StatusPill> : connected ? <StatusPill tone="green">Connected</StatusPill> : <StatusPill tone="slate">Not connected</StatusPill>}
          </div>

          {connected ? (
            <div className="space-y-4 px-6 py-6">
              {failing ? (
                <Alert>
                  <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><b>The last update didn’t go through.</b> {sheet.lastError}</span></span>
                </Alert>
              ) : (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Your sheet’s <b>Leads</b> tab updates by itself a few seconds after a lead is added, edited, assigned or changes status.</span>
                </div>
              )}
              <dl className="grid gap-4 sm:grid-cols-3">
                <div><dt className="text-xs font-medium text-slate-500">Leads in the sheet</dt><dd className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{sheet.lastSyncCount}</dd></div>
                <div><dt className="text-xs font-medium text-slate-500">Last updated</dt><dd className="mt-1.5 text-sm font-medium text-slate-900">{sheet.lastSyncAt ? formatWhen(sheet.lastSyncAt) : 'Not yet'}</dd></div>
                <div><dt className="text-xs font-medium text-slate-500">Connected</dt><dd className="mt-1.5 text-sm font-medium text-slate-900">{formatWhen(sheet.connectedAt)}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button icon={RefreshCw} loading={busy === 'sync'} onClick={syncNow}>Update now</Button>
                <a href={sheet.webAppUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"><ExternalLink className="h-4 w-4" />Test the web app</a>
              </div>
              {failing && (
                <details className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-800">Fix it: copy the script again</summary>
                  <p className="mt-2 mb-3">Paste it over everything in <Kbd>Extensions → Apps Script</Kbd>, save, then <Kbd>Deploy → Manage deployments</Kbd> → edit (pencil) → Version: <Kbd>New version</Kbd> → Deploy. Then click Update now.</p>
                  <ScriptBox script={sheet.script} />
                </details>
              )}
            </div>
          ) : (
            <ol className="px-6 py-6">
              <Step n={1} title="Open your Google Sheet" state="current">
                <p>Use the sheet you want the leads in, or <a href="https://sheets.new" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">make a new one <ExternalLink className="h-3.5 w-3.5" /></a>. The CRM writes to a tab called <b>Leads</b> (it makes it if needed).</p>
              </Step>
              <Step n={2} title="Add the script" state="current">
                <p className="mb-3">In the sheet open <Kbd>Extensions → Apps Script</Kbd>. Delete what’s there, paste this script, and click <b>Save</b> (💾).</p>
                <ScriptBox script={sheet.script} />
              </Step>
              <Step n={3} title="Publish it as a web app" state="current">
                <ol className="list-decimal space-y-1.5 pl-5">
                  <li>Click <Kbd>Deploy → New deployment</Kbd>, then the gear ⚙ next to “Select type” → <Kbd>Web app</Kbd>.</li>
                  <li>Set <b>Execute as: Me</b> and <b>Who has access: Anyone</b> — exactly “Anyone”, not “Only myself” or “Anyone with a Google account” — then click <b>Deploy</b>.</li>
                  <li>Google asks for permission: <b>Authorize access</b> → pick your account → <b>Advanced</b> → <b>Go to … (unsafe)</b> → <b>Allow</b>. It’s your own script, so this is safe.</li>
                  <li>Copy the <b>Web app URL</b> (it ends with <code className="text-[13px]">/exec</code>).</li>
                </ol>
              </Step>
              <Step n={4} title="Paste the Web app URL here" state="current" last>
                <form onSubmit={connect} className="space-y-3" noValidate>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input className="flex-1" value={url} onValue={setUrl} placeholder="https://script.google.com/macros/s/…/exec" aria-label="Web app URL" />
                    <Button type="submit" variant="primary" icon={Link2} loading={busy === 'connect'} disabled={!url.trim()}>Connect</Button>
                  </div>
                  {error && <Alert>{error}</Alert>}
                  <p className="text-xs text-slate-500">The CRM writes your leads to the sheet right away to check it works.</p>
                </form>
              </Step>
            </ol>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Good to know</h3>
          <ul className="mt-3 space-y-2.5 text-[13px] text-slate-600">
            <li>Meta, Google Ads and manually added leads all go in, newest first, with status and who they’re assigned to.</li>
            <li>The columns match <b>Export</b> on the lead pages, including your own lead-form fields.</li>
            <li>Extra answers from Meta / Google forms (beyond name, phone, email and address) aren’t copied to the sheet — they stay in the CRM and in Export.</li>
            <li>The <b>Leads</b> tab is rewritten on every update — keep your own notes on another tab.</li>
            <li>Only your company’s leads go to your sheet. The key in the script keeps others out.</li>
          </ul>
        </Card>
        {connected && (
          <div className="space-y-1">
            <Button variant="ghost" icon={KeyRound} className="w-full" onClick={() => setConfirm('key')}>Make a new key</Button>
            <Button variant="dangerGhost" icon={Unplug} className="w-full" onClick={() => setConfirm('off')}>Disconnect Google Sheet</Button>
          </div>
        )}
      </div>

      <ConfirmDialog open={confirm === 'key'} onClose={() => setConfirm(null)} onConfirm={newKey} busy={busy === 'key'} title="Make a new key?" confirmLabel="Make new key">
        The script in your sheet stops working straight away. Afterwards, copy the script from this page again, paste it over the old one and deploy a new version.
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'off'} onClose={() => setConfirm(null)} onConfirm={disconnect} busy={busy === 'off'} title="Disconnect Google Sheet?" confirmLabel="Disconnect">
        The CRM stops updating your sheet. Everything already in it stays. You can connect again any time.
      </ConfirmDialog>
    </div>
  );
}
