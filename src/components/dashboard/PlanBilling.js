'use client';

// Plan & usage. Payment is settled outside the app: the company asks for a plan (or a custom set of limits) and the
// platform administrator approves it.
import { ArrowUpCircle, Calendar, Check, Clock, Layers, Monitor, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, FormField, Input, LoadingBlock, PageHeader, Textarea, showError, toast } from '../kit';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function LimitPill({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

const STATUS = {
  pending: { tone: 'amber', label: 'Waiting for approval' },
  approved: { tone: 'green', label: 'Approved' },
  rejected: { tone: 'red', label: 'Not approved' },
  cancelled: { tone: 'slate', label: 'Withdrawn' },
};

function RequestCard({ req, busy, onCancel }) {
  const s = STATUS[req.status] || STATUS.pending;
  const what = req.type === 'preset' ? `${req.requestedPlan?.name || 'Standard'} plan` : 'Custom plan';
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">{what}</span>
        <Badge tone={s.tone}>{s.label}</Badge>
        <span className="ml-auto text-xs text-slate-400">Requested {formatDate(req.createdAt)}</span>
      </div>
      {req.type === 'custom' && (
        <p className="mt-2 text-sm text-slate-600">{req.requestedLimits?.maxClients} clients · {req.requestedLimits?.maxDesigns} proposals · {req.requestedLimits?.maxConcurrentLogins} sign-ins</p>
      )}
      {req.message && <p className="mt-2 text-sm text-slate-600">“{req.message}”</p>}
      {req.status === 'approved' && <p className="mt-2 text-sm text-emerald-700">{req.planName} is now active on your workspace.</p>}
      {req.adminNotes && req.status !== 'pending' && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600"><span className="font-medium text-slate-700">Administrator: </span>{req.adminNotes}</p>}
      {req.status === 'pending' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">The platform administrator will review this and confirm payment with you directly.</span>
          <Button variant="secondary" size="sm" loading={busy === 'cancel'} onClick={onCancel}>Withdraw request</Button>
        </div>
      )}
    </Card>
  );
}

function PresetCard({ plan, disabled, busy, onRequest }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">₹{plan.priceMonthly}<span className="text-sm font-normal text-slate-500">/mo</span></p>
      <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-600">
        <li>{plan.maxClients} clients</li>
        <li>{plan.maxDesigns} proposals</li>
        <li>{plan.maxConcurrentLogins} concurrent sign-ins</li>
        {plan.features?.map((f) => <li key={f} className="flex items-start gap-1.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{f}</li>)}
      </ul>
      <Button variant="primary" size="sm" className="mt-4 w-full" icon={ArrowUpCircle} disabled={disabled} loading={busy === plan.id} onClick={() => onRequest(plan.id)}>Request this plan</Button>
    </div>
  );
}

export default function PlanBilling() {
  const { company } = useSession();
  const billing = company?.billing;
  const upgrades = useResource('/api/company/subscription/upgrades'); // 403 for companies on a custom plan → no preset options
  const current = useResource('/api/company/plan-request');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [custom, setCustom] = useState({ maxClients: '50', maxDesigns: '100', maxConcurrentLogins: '3', message: '' });
  const [error, setError] = useState('');

  const plan = billing?.plan;
  const limits = billing?.limits || {};
  const sub = billing?.subscription || {};
  const isCustom = plan?.kind === 'custom';
  const req = current.data;
  const pending = req?.status === 'pending';
  const presets = upgrades.error ? [] : upgrades.data || [];

  const send = async (key, body) => {
    setBusy(key);
    setError('');
    try {
      await api('/api/company/plan-request', { method: 'POST', body });
      toast.success('Request sent to the administrator');
      await current.reload();
      setOpen(false);
    } catch (e) {
      setError(e.message);
      showError(e, 'The request was not sent');
    }
    setBusy(null);
  };

  const withdraw = async () => {
    setBusy('cancel');
    try {
      await api('/api/company/plan-request', { method: 'DELETE' });
      toast.success('Request withdrawn');
      await current.reload();
    } catch (e) {
      showError(e, 'Could not withdraw the request');
    }
    setBusy(null);
  };

  return (
    <>
      <PageHeader title="Plan & usage" description="Your plan and its limits. Plan changes are approved by the platform administrator.">
        {plan && <Button variant={open ? 'secondary' : 'primary'} icon={open ? undefined : ArrowUpCircle} disabled={pending && !open} onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Request a plan change'}</Button>}
      </PageHeader>

      {!plan ? <LoadingBlock /> : (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="green">Active</Badge>
                  <Badge tone={isCustom ? 'violet' : 'blue'}>{isCustom ? 'Custom' : 'Standard'}</Badge>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{plan.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{isCustom ? 'Tailored limits for your workspace' : plan.description || 'Standard plan'}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold tabular-nums text-slate-900">₹{plan.priceMonthly ?? 0}</p>
                <p className="text-xs text-slate-500">per month</p>
              </div>
            </div>
            {sub.periodEnd && (
              <div className="grid gap-3 border-b border-slate-100 px-6 py-4 sm:grid-cols-2">
                <div className="flex gap-3 rounded-xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/80"><Calendar className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden /><div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Valid until</p><p className="text-lg font-semibold text-slate-900">{formatDate(sub.periodEnd)}</p></div></div>
                <div className="flex gap-3 rounded-xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/80"><Clock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden /><div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Days remaining</p><p className="text-lg font-semibold tabular-nums text-slate-900">{sub.daysRemaining ?? '—'}</p></div></div>
              </div>
            )}
            {plan.features?.length > 0 && (
              <ul className="grid gap-x-6 gap-y-1.5 border-b border-slate-100 px-6 py-4 text-sm text-slate-700 sm:grid-cols-2">
                {plan.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{f}</li>)}
              </ul>
            )}
            <div className="grid gap-3 p-6 sm:grid-cols-3">
              <LimitPill icon={Users} label="Clients" value={limits.maxClients} />
              <LimitPill icon={Layers} label="Proposals" value={limits.maxDesigns} />
              <LimitPill icon={Monitor} label="Sign-ins" value={limits.maxConcurrentLogins} />
            </div>
          </section>

          {current.loading && !req ? <LoadingBlock /> : req && <RequestCard req={req} busy={busy} onCancel={withdraw} />}

          {open && !pending && (
            <section className="space-y-6">
              {error && <Alert>{error}</Alert>}
              {presets.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Standard plans</h3>
                  <p className="mt-1 text-sm text-slate-600">Ask for a standard plan. It is applied once the administrator approves it.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {presets.map((p) => <PresetCard key={p.id} plan={p} busy={busy} onRequest={(planId) => send(planId, { type: 'preset', planId })} />)}
                  </div>
                </div>
              )}
              <Card className="overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                  <Sparkles className="h-5 w-5 text-violet-600" aria-hidden />
                  <div><h3 className="font-semibold text-slate-900">Custom plan</h3><p className="text-sm text-slate-500">Tell us the limits you need. The administrator will confirm the price with you.</p></div>
                </div>
                <div className="space-y-4 p-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField label="Clients"><Input type="number" min={1} step="1" value={custom.maxClients} onValue={(v) => setCustom({ ...custom, maxClients: v })} /></FormField>
                    <FormField label="Proposals"><Input type="number" min={1} step="1" value={custom.maxDesigns} onValue={(v) => setCustom({ ...custom, maxDesigns: v })} /></FormField>
                    <FormField label="Concurrent sign-ins"><Input type="number" min={1} step="1" value={custom.maxConcurrentLogins} onValue={(v) => setCustom({ ...custom, maxConcurrentLogins: v })} /></FormField>
                  </div>
                  <FormField label="What do you need?"><Textarea rows={3} maxLength={2000} value={custom.message} onValue={(v) => setCustom({ ...custom, message: v })} placeholder="e.g. 5 field agents and about 300 clients this year" /></FormField>
                  <Button variant="primary" icon={Check} loading={busy === 'custom'} disabled={!custom.message.trim()} onClick={() => send('custom', { type: 'custom', message: custom.message, requestedLimits: { maxClients: Number(custom.maxClients) || 1, maxDesigns: Number(custom.maxDesigns) || 1, maxConcurrentLogins: Number(custom.maxConcurrentLogins) || 1 } })}>Send request</Button>
                </div>
              </Card>
            </section>
          )}
        </div>
      )}
    </>
  );
}
