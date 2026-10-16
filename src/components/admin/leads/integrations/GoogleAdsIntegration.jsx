'use client';

// Integrations → Google Ads. Three steps: turn it on (the CRM makes a key), paste the address and the key into the
// Google Ads lead form, send a test lead — the page watches for it and turns green when it arrives.
import { CheckCircle2, ChevronRight, FileUp, KeyRound, Power, RefreshCw, Unplug } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { API_URL, api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, ConfirmDialog, LoadingBlock, toast } from '@/components/kit';
import { CopyField, formatWhen, GoogleAdsIcon, StatusPill, Step } from './integrationUi';

const BASE = '/api/company/google-leads';
const WEBHOOK_URL = `${API_URL}/api/company/google-leads/webhook`;

// Where to click in Google Ads, as a breadcrumb trail
const GOOGLE_PATH = ['Campaigns', 'your campaign', 'Assets', 'Lead forms', 'open the form'];

const Crumbs = ({ items }) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    {items.map((x, i) => (
      <span key={x} className="inline-flex items-center gap-1">
        {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] font-medium text-slate-800">{x}</span>
      </span>
    ))}
  </span>
);

export default function GoogleAdsIntegration() {
  const { data: status, setData: setStatus, error: loadError, reload: load } = useResource(`${BASE}/integration`);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null); // 'key' | 'off'
  const fileInput = useRef(null);

  const hasKey = Boolean(status && status.keySource !== 'none');
  const heard = Boolean(status && (status.lastTestAt || status.lastLeadAt));
  // While waiting for the test lead, look every 5 seconds so it turns green by itself
  useEffect(() => {
    const t = setInterval(load, hasKey && !heard ? 5000 : 30000);
    return () => clearInterval(t);
  }, [load, hasKey, heard]);

  const run = async (kind, fn) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error(e.message);
    }
    setBusy('');
  };
  const turnOn = () => run('key', async () => {
    setStatus(await api(`${BASE}/integration/key`, { method: 'POST' }));
    if (confirm === 'key') toast.success('New key made. Paste it into every Google Ads lead form.');
    setConfirm(null);
  });
  const turnOff = () => run('off', async () => {
    setStatus(await api(`${BASE}/integration/key`, { method: 'DELETE' }));
    toast.success('Google Ads turned off. Leads already in the CRM are kept.');
    setConfirm(null);
  });
  const importFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    run('import', async () => {
      toast.success((await api(`${BASE}/import`, { method: 'POST', form })).message);
      load();
    });
  };

  if (!status) return loadError ? <Alert>{loadError}</Alert> : <LoadingBlock />;

  const fromEnv = status.keySource === 'env';
  const live = Boolean(status.lastLeadAt);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-50 ring-1 ring-slate-200"><GoogleAdsIcon className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-slate-900">Google Ads lead forms</h2>
                <p className="text-[13px] text-slate-500">Leads from your Google Ads lead forms land in the CRM by themselves.</p>
              </div>
            </div>
            {heard ? <StatusPill tone="green">{live ? 'Receiving leads' : 'Connected'}</StatusPill> : hasKey ? <StatusPill tone="amber">Waiting for a test lead</StatusPill> : <StatusPill tone="slate">Off</StatusPill>}
          </div>

          <ol className="px-6 py-6">
            <Step n={1} title="Turn on Google Ads leads" state={hasKey ? 'done' : 'current'}>
              {hasKey ? (
                <p>On. The CRM made a private key for your company.</p>
              ) : (
                <div className="space-y-3">
                  <p>The CRM makes a web address and a private key for you to paste into Google Ads. It takes one click.</p>
                  <Button variant="primary" icon={Power} loading={busy === 'key'} onClick={turnOn}>Turn on</Button>
                </div>
              )}
            </Step>
            <Step n={2} title="Paste these two into your Google Ads lead form" state={!hasKey ? 'todo' : heard ? 'done' : 'current'}>
              {hasKey && (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <CopyField label="Webhook URL" value={WEBHOOK_URL} />
                    <CopyField label="Key" value={status.webhookKey} secret />
                  </div>
                  {!heard && (
                    <ol className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-[13px] text-slate-700">
                      <li className="flex gap-2"><b className="w-4 shrink-0 text-slate-400">a</b><span>Open <a href="https://ads.google.com" target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">Google Ads</a> and go to <Crumbs items={GOOGLE_PATH} /></span></li>
                      <li className="flex gap-2"><b className="w-4 shrink-0 text-slate-400">b</b><span>Scroll down to <b>Lead delivery option</b> and choose <b>Webhook integration</b>.</span></li>
                      <li className="flex gap-2"><b className="w-4 shrink-0 text-slate-400">c</b><span>Paste the <b>Webhook URL</b> and the <b>Key</b> from above into the two boxes.</span></li>
                      <li className="flex gap-2"><b className="w-4 shrink-0 text-slate-400">d</b><span>Click <b>Send test data</b>, then <b>Save</b>. Have more lead forms? Paste the same two into each one.</span></li>
                    </ol>
                  )}
                </div>
              )}
            </Step>
            <Step n={3} title="Send a test lead" state={heard ? 'done' : hasKey ? 'current' : 'todo'} last>
              {heard ? (
                <p>{status.lastTestAt ? `Test lead received ${formatWhen(status.lastTestAt)}.` : ''} {live ? `Last real lead ${formatWhen(status.lastLeadAt)}.` : 'Real leads will show up as people fill your form.'}</p>
              ) : hasKey ? (
                <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <span className="relative flex h-3 w-3 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" /></span>
                  <span>Waiting for the test lead… this turns green by itself a few seconds after you click <b>Send test data</b> in Google Ads.</span>
                </div>
              ) : null}
            </Step>
          </ol>

          {heard && (
            <div className="border-t border-slate-100 bg-emerald-50/60 px-6 py-4 text-sm text-emerald-900">
              <CheckCircle2 className="mr-1.5 inline h-4 w-4 text-emerald-600" />
              You’re all set. New leads appear under <Link href="/dashboard/leads/google" className="font-semibold underline">Leads → Google Ads</Link> the moment someone fills your form.
            </div>
          )}
        </Card>

        {heard && (
          <Card>
            <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-6 py-4"><p className="text-xs font-medium text-slate-500">Leads received</p><p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{status.leads}</p></div>
              <div className="px-6 py-4"><p className="text-xs font-medium text-slate-500">Lead forms sending</p><p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{status.forms.length}</p></div>
              <div className="px-6 py-4"><p className="text-xs font-medium text-slate-500">Last lead</p><p className="mt-1.5 text-sm font-medium text-slate-900">{live ? formatWhen(status.lastLeadAt) : 'None yet'}</p></div>
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-slate-900">Leads from before</h3>
              <p className="mt-1 text-[13px] text-slate-500">In Google Ads, open the lead form and click <b>Download leads</b>. Upload that file here — leads already in the CRM are skipped.</p>
              <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={importFile} />
              <Button className="mt-3" size="sm" icon={FileUp} loading={busy === 'import'} onClick={() => fileInput.current?.click()}>Upload file</Button>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Good to know</h3>
          <ul className="mt-3 space-y-2.5 text-[13px] text-slate-600">
            <li>One address and key work for all your lead forms.</li>
            <li>Test leads are marked as tests and don’t count as real leads.</li>
            <li>Keep the key private — anyone with it can send leads to your CRM.</li>
          </ul>
        </Card>
        {hasKey && !fromEnv && (
          <div className="space-y-1">
            <Button variant="ghost" icon={KeyRound} className="w-full" onClick={() => setConfirm('key')}>Make a new key</Button>
            <Button variant="dangerGhost" icon={Unplug} className="w-full" onClick={() => setConfirm('off')}>Turn off Google Ads</Button>
          </div>
        )}
        {heard && <Button variant="ghost" size="sm" icon={RefreshCw} className="w-full" onClick={load}>Refresh</Button>}
      </div>

      <ConfirmDialog open={confirm === 'key'} onClose={() => setConfirm(null)} onConfirm={turnOn} busy={busy === 'key'} title="Make a new key?" confirmLabel="Make new key">
        The current key stops working straight away. You’ll need to paste the new key into <b>every</b> Google Ads lead form, or leads will stop arriving.
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'off'} onClose={() => setConfirm(null)} onConfirm={turnOff} busy={busy === 'off'} title="Turn off Google Ads?" confirmLabel="Turn off">
        The key is deleted and new Google Ads leads stop arriving. Leads already in the CRM are kept, and you can turn it on again any time (with a new key).
      </ConfirmDialog>
    </div>
  );
}
