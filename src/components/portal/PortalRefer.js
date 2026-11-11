'use client';

// "Refer someone" in the client portal: the client fills in the company's own lead form (the same fields its staff
// fill in for a lead: Name, Phone, Address and whatever the company added) for someone who may want solar. The
// client's own details go with it, so the company knows who referred them. For the company this is a referral lead; the client never sees it as a lead. Of what happens to it they are shown two
// things only: that it went ahead (converted) or that it did not (lost). Until then it is simply "in progress".
import { CheckCircle2, Clock, HeartHandshake, Mail, Phone, UserPlus, UserRound, XCircle } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, FormField, LoadingBlock, PageHeader, Textarea, formatDate, toast } from '../kit';
import LeadFields from '../leads/LeadFields';

const OUTCOME = {
  open: { tone: 'amber', icon: Clock, label: 'In progress', text: 'Our team is in touch with them.' },
  converted: { tone: 'green', icon: CheckCircle2, label: 'Went ahead', text: 'They became a customer. Thank you!' },
  lost: { tone: 'slate', icon: XCircle, label: 'Did not go ahead', text: 'They decided not to go ahead for now.' },
};

export default function PortalRefer() {
  const { company } = useSession();
  const { data, setData, loading, error } = useResource('/api/portal/referrals');
  const formRes = useResource('/api/portal/referrals/form'); // the company's own lead form
  const me = useResource('/api/portal/me'); // the client's details, sent along as "referred by"
  const [values, setValues] = useState({});
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const provider = company?.name || 'your solar company';
  const fields = formRes.data?.fields || [];

  const submit = async (e) => {
    e.preventDefault();
    const missing = Object.fromEntries(fields.filter((f) => f.required && (values[f.key] === undefined || values[f.key] === '' || (Array.isArray(values[f.key]) && !values[f.key].length))).map((f) => [f.key, `${f.label} is required`]));
    if (Object.keys(missing).length) return setErrors(missing);
    setBusy(true);
    setErrors({});
    try {
      const made = await api('/api/portal/referrals', { method: 'POST', body: { ...values, note } });
      setData((list) => [made, ...(list || [])]);
      setValues({});
      setNote('');
      toast.success(`Thank you! ${provider} will contact ${made.name}.`);
    } catch (err) {
      setErrors(err.details?.errors || { _: err.message });
    }
    setBusy(false);
  };

  const list = data || [];
  const went = list.filter((r) => r.outcome === 'converted').length;

  return (
    <>
      <PageHeader title="Refer someone" description={`Know someone who would like solar? Tell ${provider} and they will get in touch. You will be told here when your referral goes ahead.`} />
      {error && <Alert className="mb-6">{error}</Alert>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader title="Who would you like to refer?" description="A friend, a relative, a neighbour or a business." />
            {formRes.loading && !formRes.data ? <LoadingBlock /> : formRes.error ? <Alert className="mx-6 mb-6">{formRes.error}</Alert> : (
              <form onSubmit={submit} noValidate className="space-y-4 px-6 pb-6">
                <LeadFields fields={fields} values={values} onChange={(v) => { setValues(v); setErrors({}); }} errors={errors} disabled={busy} />
                <FormField label="Anything we should know" optional><Textarea rows={2} maxLength={300} value={note} onValue={setNote} placeholder="e.g. My neighbour, has a large terrace" /></FormField>
                {errors._ && <Alert>{errors._}</Alert>}
                <Button type="submit" variant="primary" icon={UserPlus} loading={busy} className="w-full">Refer them</Button>
                <p className="text-xs leading-relaxed text-slate-500">Please ask them first: {provider} will call the number you give.</p>
              </form>
            )}
          </Card>
          {/* the client's own details: they travel with every referral */}
          <Card className="h-fit p-5">
            <div className="text-sm font-semibold text-slate-900">Referred by you</div>
            <p className="mt-0.5 text-[13px] text-slate-500">{provider} sees these details with each person you refer.</p>
            <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
              <div className="flex items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-slate-400" /> {me.data?.name || '—'}</div>
              {me.data?.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-slate-400" /> {me.data.phone}</div>}
              {me.data?.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-slate-400" /> <span className="truncate">{me.data.email}</span></div>}
            </dl>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader title="People you referred" description={list.length ? `${list.length} referred${went ? ` · ${went} went ahead` : ''}` : undefined} />
          {loading && !data ? <LoadingBlock /> : !list.length ? (
            <EmptyState icon={HeartHandshake} title="No referrals yet" description="When you refer someone, they appear here, and you will see when they go ahead." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((r) => {
                const o = OUTCOME[r.outcome] || OUTCOME.open;
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{r.name}</div>
                      <div className="text-sm text-slate-500">{r.phone} · referred {formatDate(r.createdAt)}</div>
                      <div className="mt-0.5 text-sm text-slate-600">{o.text}{r.outcomeAt ? ` (${formatDate(r.outcomeAt)})` : ''}</div>
                    </div>
                    <Badge tone={o.tone} className="gap-1.5"><o.icon className="h-3.5 w-3.5" /> {o.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
