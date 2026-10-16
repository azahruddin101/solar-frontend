'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/leads/api';
import { Plug, Megaphone, CheckCircle2, AlertTriangle, RefreshCw, Unplug, ChevronLeft, ChevronRight, KeyRound, Inbox, FileText, LoaderCircle } from 'lucide-react';
import PasswordInput from '@/components/admin/leads/PasswordInput';
import { toast } from '@/components/kit';
import { CopyRow, Panel, MetricCard, SpinnerPanel } from './integrationUi';

// Public address of this CRM's API - Meta needs it for the login redirect and the webhook
const API_BASE_URL = api.defaults.baseURL.replace(/\/+$/, '');
const OAUTH_REDIRECT_URI = `${API_BASE_URL}/company/integrations/meta/callback`;

// Messages for the reason codes the backend sends back after Facebook Login
const OAUTH_ERRORS = {
  access_denied: 'Meta connection was cancelled. Nothing was changed.',
  invalid_state: 'The connection request expired or was invalid. Please try again.',
  missing_code: 'Meta did not return an authorization code. Please try again.',
  missing_permissions: 'Some required permissions were not granted. Please connect again and allow every requested permission.',
  no_pages: 'No Facebook Pages were found for this Meta account.',
  not_authorized: 'Your account is not allowed to connect Meta.',
  rate_limited: 'Meta rate limit reached. Please try again in a few minutes.',
  meta_api_error: 'Meta could not complete the connection. Please try again.',
  server_error: 'Something went wrong while connecting Meta. Please try again.',
};

const MetaLeadsIntegration = () => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('summary'); // summary | pages | forms

  const [pages, setPages] = useState([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [activePage, setActivePage] = useState(null);
  const [forms, setForms] = useState([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [selectedFormIds, setSelectedFormIds] = useState([]);

  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Meta app settings (App ID + App Secret) entered by the admin
  const [appForm, setAppForm] = useState({ appId: '', appSecret: '' });
  const [savingApp, setSavingApp] = useState(false);
  const [editingApp, setEditingApp] = useState(false);

  // Historical sync ("Sync Previous Leads")
  const [sync, setSync] = useState(null);
  const [startingSync, setStartingSync] = useState(false);
  const lastSyncStatus = useRef(null);
  const syncRunning = Boolean(sync) && ['pending', 'processing'].includes(sync.status);

  useEffect(() => {
    // Result of the Facebook Login redirect (?meta=connected | ?meta=error&reason=...)
    const result = searchParams.get('meta');
    if (result === 'connected') {
      toast.success('Meta connected successfully', { id: 'meta-oauth-result' });
    } else if (result === 'error') {
      toast.error(OAUTH_ERRORS[searchParams.get('reason')] || OAUTH_ERRORS.server_error, { id: 'meta-oauth-result', duration: 6000 });
    }
    if (result) {
      router.replace(pathname);
    }

    fetchStatus();
    // Picks up a sync that is still running, e.g. after the browser was refreshed
    fetchSyncStatus();
  }, []);

  // Poll the progress while a sync is running
  useEffect(() => {
    if (!syncRunning) return undefined;
    const timer = setInterval(fetchSyncStatus, 2000);
    return () => clearInterval(timer);
  }, [syncRunning]);

  // silent: refresh the numbers without the full-page spinner or leaving the current step
  const fetchStatus = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get('/company/integrations/meta/status');
      setStatus(response.data);
      if (silent) return;

      // Connected but nothing selected yet: continue with Page selection
      if (response.data.connected && !response.data.selectedPage) {
        setStep('pages');
        fetchPages();
      } else {
        setStep('summary');
      }
    } catch (error) {
      toast.error('Failed to load Meta integration status');
    } finally {
      setLoading(false);
    }
  };

  const fetchPages = async () => {
    setPagesLoading(true);
    try {
      const response = await api.get('/company/integrations/meta/pages');
      setPages(response.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load Facebook Pages');
    } finally {
      setPagesLoading(false);
    }
  };

  const handleSaveApp = async (e) => {
    e.preventDefault();
    setSavingApp(true);
    try {
      await api.put('/company/integrations/meta/app-settings', {
        appId: appForm.appId.trim(),
        appSecret: appForm.appSecret.trim(),
        apiBaseUrl: API_BASE_URL,
        frontendRedirectUrl: window.location.origin + window.location.pathname,
      });
      toast.success('Meta app saved');
      setAppForm({ appId: '', appSecret: '' });
      setEditingApp(false);
      fetchStatus();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save Meta app settings');
    } finally {
      setSavingApp(false);
    }
  };

  const handleEditApp = () => {
    setAppForm({ appId: status?.setup?.appId || '', appSecret: '' });
    setEditingApp(true);
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const response = await api.get('/company/integrations/meta/connect');
      // Continue on Facebook - Meta redirects back to this page afterwards
      window.location.href = response.data.url;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to start Meta connection');
      setConnecting(false);
    }
  };

  const handleChangeSelection = () => {
    setStep('pages');
    fetchPages();
  };

  const handleSelectPage = async (page) => {
    setActivePage(page);
    setForms([]);
    setSelectedFormIds([]);
    setStep('forms');
    setFormsLoading(true);
    try {
      const response = await api.get(`/company/integrations/meta/pages/${page.pageId}/forms`);
      setForms(response.data);
      setSelectedFormIds(response.data.filter((f) => f.selected).map((f) => f.formId));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load lead forms');
      if (error.response?.data?.code === 'META_RECONNECT_REQUIRED') {
        fetchStatus();
      } else {
        setStep('pages');
      }
    } finally {
      setFormsLoading(false);
    }
  };

  const toggleForm = (formId) => {
    setSelectedFormIds((current) =>
      current.includes(formId) ? current.filter((id) => id !== formId) : [...current, formId]
    );
  };

  const handleConnectForms = async () => {
    setSaving(true);
    try {
      await api.post(`/company/integrations/meta/pages/${activePage.pageId}/forms`, { formIds: selectedFormIds });
      toast.success('Lead forms connected successfully');
      fetchStatus();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to connect lead forms');
      if (error.response?.data?.code === 'META_RECONNECT_REQUIRED') {
        fetchStatus();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Meta? New leads will stop arriving. Leads already collected are kept.')) return;

    setDisconnecting(true);
    try {
      await api.delete('/company/integrations/meta');
      toast.success('Meta disconnected');
      fetchStatus();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to disconnect Meta');
    } finally {
      setDisconnecting(false);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const response = await api.get('/company/integrations/meta/sync/status');
      const next = response.data.sync;
      const wasRunning = ['pending', 'processing'].includes(lastSyncStatus.current);
      lastSyncStatus.current = next ? next.status : null;
      setSync(next);

      // The sync just finished: report the result and refresh the lead count
      if (next && wasRunning && ['completed', 'failed'].includes(next.status)) {
        if (next.status === 'completed') {
          toast.success(`Sync completed: ${next.leadsImported} lead(s) imported`, { id: 'meta-sync-result' });
        } else {
          toast.error(next.error || 'Lead sync failed', { id: 'meta-sync-result', duration: 6000 });
        }
        fetchStatus({ silent: true });
      }
    } catch (error) {
      // Keep the last known progress; the next poll tries again
    }
  };

  const handleStartSync = async () => {
    setStartingSync(true);
    try {
      const response = await api.post('/company/integrations/meta/sync');
      lastSyncStatus.current = response.data.sync.status;
      setSync(response.data.sync);
      if (response.data.alreadyRunning) {
        toast.success('A lead sync is already running');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to start the lead sync');
      if (error.response?.data?.code === 'META_RECONNECT_REQUIRED') {
        fetchStatus({ silent: true });
      }
    } finally {
      setStartingSync(false);
    }
  };

  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      const response = await api.post('/company/integrations/meta/leads/retry-failed');
      toast.success(response.data.message);
      fetchStatus();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to retry leads');
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return <SpinnerPanel />;
  }

  const connected = status?.connected;
  const setup = status?.setup || {};
  const appFromEnv = setup.source === 'env';
  // The admin enters the Meta app here unless it is fixed in the server environment
  const showAppForm = Boolean(status) && !appFromEnv && (!status.configured || editingApp);
  const counts = status?.leadCounts || { processed: 0, pending: 0, failed: 0 };
  const receiving = Boolean(status?.receivingLeads);

  const statusLabel = !status?.configured
    ? 'Setup required'
    : !connected
      ? 'Not connected'
      : status.needsReconnect
        ? 'Reconnect required'
        : receiving
          ? 'Receiving leads'
          : 'Connected';

  const statusTone = !status?.configured || !connected
    ? 'border-slate-200 bg-white text-slate-600'
    : status.needsReconnect || !receiving
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';

  const dotTone = !status?.configured || !connected
    ? 'bg-slate-400'
    : status.needsReconnect || !receiving
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  const syncForms = sync?.forms || [];
  const syncPct = syncForms.length
    ? Math.round((syncForms.filter((form) => form.status !== 'pending').length / syncForms.length) * 100)
    : 0;

  const syncLabel = !sync
    ? ''
    : syncRunning
      ? sync.retryAt
        ? 'Meta is busy. Waiting to retry...'
        : 'Syncing previous leads...'
      : sync.status === 'failed'
        ? 'Sync failed'
        : sync.formsFailed > 0
          ? 'Completed with errors'
          : 'Completed';

  const syncTone = syncRunning
    ? 'text-blue-700'
    : sync?.status === 'failed'
      ? 'text-rose-700'
      : sync?.formsFailed > 0
        ? 'text-amber-700'
        : 'text-emerald-700';

  const webhookSettings = status?.configured && !showAppForm && (
    <div className={connected && status.selectedPage ? 'mt-4 space-y-3 border-t border-slate-100 pt-4' : 'space-y-3'}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <KeyRound className="h-3.5 w-3.5" /> Webhook
        </p>
        {!appFromEnv && (
          <button type="button" onClick={handleEditApp} className="text-[11px] font-semibold text-slate-500 hover:text-blue-700">
            Change app
          </button>
        )}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        In the Meta app, add <span className="font-medium text-slate-700">Webhooks</span>, choose <span className="font-medium text-slate-700">Page</span>, paste the callback URL and verify token, then subscribe to <span className="font-medium text-slate-700">leadgen</span>.
      </p>
      {setup.webhookCallbackUrl && <CopyRow label="Webhook callback URL" value={setup.webhookCallbackUrl} />}
      {setup.webhookVerifyToken ? (
        <CopyRow label="Webhook verify token" value={setup.webhookVerifyToken} />
      ) : (
        <p className="text-[11px] font-medium text-slate-500">The webhook verify token is set in the server environment.</p>
      )}
      {setup.redirectUri && <CopyRow label="Valid OAuth redirect URI" value={setup.redirectUri} />}
      {setup.appId && <p className="text-[11px] font-medium text-slate-500">App ID {setup.appId}</p>}
    </div>
  );

  let mainPanel;
  if (showAppForm && !connected) {
    mainPanel = (
      <Panel className="lg:col-span-3" title="Setup">
        <ol className="space-y-3">
          <li className="border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Step 1</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Create a Meta app</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Open{' '}
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">
                developers.facebook.com/apps
              </a>{' '}
              and create an app of type Business.
            </p>
          </li>
          <li className="border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Step 2</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Allow the login redirect</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Add the <span className="font-medium text-slate-700">Facebook Login</span> product and paste the redirect address under Valid OAuth Redirect URIs.
            </p>
          </li>
          <li className="border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Step 3</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Copy the credentials</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              From <span className="font-medium text-slate-700">App settings &gt; Basic</span>, paste the App ID and App Secret into the form.
            </p>
          </li>
        </ol>
        <div className="mt-4">
          <CopyRow label="Valid OAuth redirect URI" value={OAUTH_REDIRECT_URI} />
        </div>
      </Panel>
    );
  } else if (connected && step === 'pages') {
    mainPanel = (
      <Panel
        className="lg:col-span-3"
        title="Facebook Pages"
        action={status.selectedPage ? (
          <button type="button" onClick={() => setStep('summary')} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-700">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
        ) : null}
        footer={!status.selectedPage ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="inline-flex h-9 items-center gap-1.5 px-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
          >
            <Unplug className="h-4 w-4" /> {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : null}
      >
        {pagesLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : pages.length > 0 ? (
          <div className="space-y-2">
            {pages.map((page) => (
              <div key={page.pageId} className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{page.pageName || page.pageId}</p>
                  {page.selected && <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Currently connected</p>}
                </div>
                <button type="button" onClick={() => handleSelectPage(page)} className="btn-outline shrink-0">Select</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">No Facebook Pages available. Reconnect Meta with an account that manages a Page.</p>
        )}
      </Panel>
    );
  } else if (connected && step === 'forms' && activePage) {
    mainPanel = (
      <Panel
        className="lg:col-span-3"
        title="Lead forms"
        action={(
          <button type="button" onClick={() => setStep('pages')} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-700">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}
        footer={forms.length > 0 && !formsLoading ? (
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-500">{selectedFormIds.length} selected</p>
            <button
              type="button"
              onClick={handleConnectForms}
              disabled={saving || selectedFormIds.length === 0}
              className="btn-primary disabled:opacity-60"
            >
              {saving ? 'Connecting...' : 'Connect selected'}
            </button>
          </div>
        ) : null}
      >
        <p className="mb-3 text-sm font-semibold text-slate-900">{activePage.pageName || activePage.pageId}</p>
        {formsLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : forms.length > 0 ? (
          <div className="space-y-2">
            {forms.map((form) => (
              <label key={form.formId} className="flex cursor-pointer items-center gap-3 border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selectedFormIds.includes(form.formId)}
                  onChange={() => toggleForm(form.formId)}
                  className="h-4 w-4 accent-blue-700"
                />
                <span className="text-sm font-medium text-slate-800">{form.formName || form.formId}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">This Page has no active lead forms.</p>
        )}
      </Panel>
    );
  } else if (connected && status.selectedPage) {
    mainPanel = (
      <Panel
        className="lg:col-span-3"
        title="Connection"
        footer={(
          <>
            <button type="button" onClick={handleChangeSelection} className="btn-outline">Change Page / forms</button>
            <button type="button" onClick={handleConnect} disabled={connecting} className="btn-outline disabled:opacity-60">
              <RefreshCw className="h-4 w-4" /> {connecting ? 'Redirecting...' : 'Reconnect'}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="inline-flex h-9 items-center gap-1.5 px-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
            >
              <Unplug className="h-4 w-4" /> {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Facebook Page</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{status.selectedPage.pageName || status.selectedPage.pageId}</p>
            {status.metaUserName && <p className="mt-1 truncate text-xs text-slate-500">Signed in as {status.metaUserName}</p>}
          </div>
          <div className="border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Delivery</p>
            <p className={`mt-1 text-sm font-semibold ${receiving ? 'text-emerald-700' : 'text-amber-700'}`}>
              {receiving ? 'Receiving leads' : 'Not receiving leads'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {status.connectedAt ? `Connected ${new Date(status.connectedAt).toLocaleDateString()}` : 'Connected'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lead forms</p>
          <ul className="mt-2 space-y-1.5">
            {status.forms.map((form) => (
              <li key={form.formId} className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="truncate">{form.formName || form.formId}</span>
              </li>
            ))}
            {status.forms.length === 0 && <li className="text-sm text-slate-500">No forms selected.</li>}
          </ul>
        </div>

        {!status.webhookConfigured && (
          <p className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            The Meta webhook is not configured on the server, so new leads cannot be delivered yet.
          </p>
        )}
      </Panel>
    );
  } else {
    mainPanel = (
      <Panel
        className="lg:col-span-3"
        title="Connection"
        footer={status?.configured ? (
          <button type="button" onClick={handleConnect} disabled={connecting} className="btn-primary disabled:opacity-60">
            <Plug className="h-4 w-4" /> {connecting ? 'Redirecting to Facebook...' : 'Connect Meta'}
          </button>
        ) : null}
      >
        <p className="max-w-xl text-sm leading-relaxed text-slate-600">
          Sign in with Facebook, choose your Page, and select the lead forms to collect. New leads then arrive in the CRM automatically.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['1', 'Sign in', 'Use the Facebook account that manages the Page.'],
            ['2', 'Choose a Page', 'One Page sends leads into this CRM.'],
            ['3', 'Select forms', 'Pick the Lead Ads forms to collect.'],
          ].map(([stepNo, title, body]) => (
            <li key={stepNo} className="border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Step {stepNo}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
            </li>
          ))}
        </ol>
      </Panel>
    );
  }

  const sidePanel = showAppForm ? (
    <Panel
      className="lg:col-span-2"
      title={editingApp ? 'Change Meta app' : 'App credentials'}
      onSubmit={handleSaveApp}
      footer={(
        <>
          {editingApp && (
            <button type="button" onClick={() => setEditingApp(false)} className="btn-outline">
              Cancel
            </button>
          )}
          <button type="submit" disabled={savingApp} className="btn-primary ml-auto disabled:opacity-60">
            {savingApp ? 'Checking with Meta...' : 'Save Meta app'}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">App ID</span>
          <input
            type="text"
            required
            inputMode="numeric"
            autoComplete="off"
            value={appForm.appId}
            onChange={(e) => setAppForm({ ...appForm, appId: e.target.value })}
            placeholder="e.g. 1234567890123456"
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">App Secret</span>
          <PasswordInput
            required
            autoComplete="new-password"
            value={appForm.appSecret}
            onChange={(e) => setAppForm({ ...appForm, appSecret: e.target.value })}
            placeholder="Paste the App Secret"
            className="input-field"
          />
        </label>
        <p className="text-[11px] leading-relaxed text-slate-500">
          The App Secret is checked with Meta, stored encrypted, and never shown again.
        </p>
      </div>
    </Panel>
  ) : (
    <Panel className="lg:col-span-2" title={connected && status.selectedPage ? 'Import' : 'Delivery setup'}>
      {connected && status.selectedPage ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Previous leads</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Import leads submitted before this connection. Meta keeps leads for 90 days, so older leads cannot be recovered.
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartSync}
              disabled={startingSync || syncRunning || status.needsReconnect}
              className="btn-outline shrink-0 disabled:pointer-events-none disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${syncRunning ? 'animate-spin' : ''}`} /> {syncRunning ? 'Syncing...' : 'Sync'}
            </button>
          </div>

          {sync && (
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className={`text-xs font-semibold ${syncTone}`}>{syncLabel}</p>
                <span className="text-[11px] font-medium tabular-nums text-slate-500">{syncPct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden bg-slate-100">
                <div
                  className={`h-full bg-ame-orange transition-all ${syncRunning && syncPct === 0 ? 'w-1/3 animate-pulse' : ''}`}
                  style={syncPct > 0 ? { width: `${syncPct}%` } : undefined}
                />
              </div>
              <ul className="space-y-2">
                {syncForms.map((form) => (
                  <li key={form.formId} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700">{form.formName || form.formId}</p>
                      {form.error && <p className="mt-0.5 text-[11px] font-medium text-rose-600">{form.error}</p>}
                    </div>
                    <span className={`shrink-0 font-medium ${form.status === 'failed' ? 'text-rose-600' : 'text-slate-500'}`}>
                      {form.status === 'pending' ? 'Waiting' : form.status === 'failed' && form.leadsProcessed === 0 ? 'Failed' : `${form.leadsProcessed} processed`}
                    </span>
                  </li>
                ))}
              </ul>
              {!syncRunning && (
                <div className="border-t border-slate-100 pt-2.5">
                  <p className="text-xs font-semibold text-slate-800">
                    {sync.leadsImported} imported · {sync.duplicatesSkipped} duplicates skipped · {sync.failedLeads} failed
                  </p>
                  {sync.completedAt && (
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">Last sync {new Date(sync.completedAt).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-slate-600">
          {status?.configured
            ? 'After you connect, lead submissions from the selected forms are delivered here. Leads already in the CRM stay if you disconnect.'
            : 'Add the Meta app credentials to enable Facebook login and lead delivery.'}
        </p>
      )}
      {webhookSettings}
    </Panel>
  );

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-orange-100 bg-orange-50 text-ame-orange">
            <Megaphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">Meta Lead Ads</h2>
            <p className="truncate text-xs text-slate-500">Facebook Lead Ads delivered into the CRM.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
            {statusLabel}
          </span>
          {connected && status.selectedPage && (
            <Link href="/dashboard/leads/meta" className="btn-primary">
              View leads <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </header>

      {appFromEnv && !status.configured && (
        <div className="flex shrink-0 items-start gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>The Meta app is set in the server environment but its settings are incomplete. Contact your administrator.</span>
        </div>
      )}

      {connected && status.needsReconnect && (
        <div className="flex shrink-0 items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Meta access has expired or was revoked. Reconnect to keep receiving leads.</span>
          <button type="button" onClick={handleConnect} disabled={connecting} className="shrink-0 font-semibold underline disabled:opacity-60">
            {connecting ? 'Redirecting...' : 'Reconnect'}
          </button>
        </div>
      )}

      {connected && (
        <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Collected"
            value={counts.processed}
            detail={status.lastLeadReceivedAt ? `Last ${new Date(status.lastLeadReceivedAt).toLocaleString()}` : 'No leads yet'}
            icon={Inbox}
            tone="bg-blue-50 text-blue-700"
          />
          <MetricCard label="Retrieving" value={counts.pending} detail="Waiting on Meta" icon={LoaderCircle} tone="bg-amber-50 text-amber-700" />
          <MetricCard
            label="Failed"
            value={counts.failed}
            detail={counts.failed > 0 ? 'Could not be retrieved' : 'None waiting'}
            icon={AlertTriangle}
            tone={counts.failed > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-500'}
            action={counts.failed > 0 ? (
              <button type="button" onClick={handleRetryFailed} disabled={retrying} className="text-[11px] font-semibold text-rose-700 hover:underline disabled:opacity-60">
                {retrying ? 'Retrying' : 'Retry'}
              </button>
            ) : null}
          />
          <MetricCard
            label="Forms"
            value={status.forms?.length || 0}
            detail={status.selectedPage?.pageName || status.selectedPage?.pageId || 'No Page selected'}
            icon={FileText}
            tone="bg-emerald-50 text-emerald-700"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-5 lg:grid-rows-1 lg:overflow-hidden">
        {mainPanel}
        {sidePanel}
      </div>
    </>
  );
};

export default MetaLeadsIntegration;
