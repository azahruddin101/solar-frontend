'use client';

// Manage Masters → Lead statuses: the steps a lead goes through, used by Meta, Google Ads and manual leads.
// Each status is an ordinary step, the converted status (the lead became a client) or the lost status — exactly one
// of each always exists. Choosing Converted on a lead then asks to add the client.
import { ArrowDown, ArrowUp, CircleCheck, CircleX, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, CardHeader, ConfirmDialog, cx, FormField, FormModal, IconButton, Input, LoadingBlock, PageHeader, Toggle, toast } from '../kit';

const BASE = '/api/company/integrations/meta/lead-statuses';
export const STATUS_DOT = { slate: 'bg-slate-400', blue: 'bg-sky-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500', rose: 'bg-rose-500', purple: 'bg-violet-500', cyan: 'bg-cyan-500' };
const COLORS = Object.keys(STATUS_DOT);
const OUTCOMES = [
  { id: 'open', label: 'In progress', help: 'A step while the lead is being worked — e.g. Interested, Callback, Site visit.' },
  { id: 'converted', label: 'Converted', help: 'The lead became a client. Choosing it on a lead asks to add the client, pre-filled.', icon: CircleCheck, tone: 'text-emerald-600' },
  { id: 'lost', label: 'Lost', help: 'The lead is closed without becoming a client.', icon: CircleX, tone: 'text-rose-600' },
];
const OutcomeBadge = ({ outcome }) => (outcome === 'converted' ? <Badge tone="green">Converted</Badge> : outcome === 'lost' ? <Badge tone="red">Lost</Badge> : <Badge tone="slate">In progress</Badge>);

function StatusForm({ status, statuses, onClose, onSaved }) {
  const editing = Boolean(status?._id);
  const special = editing && status.outcome !== 'open';
  const [f, setF] = useState(() => ({ name: status?.name || '', color: status?.color || 'blue', outcome: status?.outcome || 'open' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const holder = f.outcome !== 'open' ? statuses.find((s) => s.outcome === f.outcome && s._id !== status?._id) : null;
  const submit = async () => {
    if (!f.name.trim()) return setError('Give the status a name');
    setBusy(true);
    setError('');
    try {
      const body = { name: f.name.trim(), color: f.color, outcome: f.outcome };
      const saved = editing ? await api(`${BASE}/${status._id}`, { method: 'PUT', body }) : await api(BASE, { method: 'POST', body });
      onSaved(saved);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <FormModal open onClose={onClose} title={editing ? `Edit “${status.name}”` : 'Add a status'} submitLabel={editing ? 'Save status' : 'Add status'} busy={busy} error={error} onSubmit={submit} noValidate>
      <FormField label="Name"><Input autoFocus maxLength={40} value={f.name} onValue={(x) => setF({ ...f, name: x })} placeholder="e.g. Site visit" /></FormField>
      <FormField label="Colour">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })} className={cx('grid h-8 w-8 place-items-center rounded-full ring-offset-2 transition', f.color === c ? 'ring-2 ring-slate-900' : 'hover:ring-2 hover:ring-slate-300')}>
              <span className={cx('h-5 w-5 rounded-full', STATUS_DOT[c])} />
            </button>
          ))}
        </div>
      </FormField>
      <FormField label="What does this status mean?">
        <div className="space-y-2">
          {OUTCOMES.map((o) => {
            const locked = special && o.id !== status.outcome; // the converted / lost role moves only by giving it to another status
            return (
              <label key={o.id} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors', f.outcome === o.id ? 'border-brand bg-brand-soft/50 ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300', locked && 'cursor-not-allowed opacity-50')}>
                <input type="radio" name="outcome" disabled={locked} checked={f.outcome === o.id} onChange={() => setF({ ...f, outcome: o.id })} className="mt-0.5 h-4 w-4 border-slate-300 text-brand focus:ring-brand" />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">{o.icon && <o.icon className={cx('h-4 w-4', o.tone)} />}{o.label}</span>
                  <span className="block text-[13px] text-slate-500">{o.help}</span>
                </span>
              </label>
            );
          })}
        </div>
      </FormField>
      {special && <p className="text-[13px] text-slate-500">This is your {status.outcome} status. Every company needs one, so to change it, open another status and make that one {status.outcome === 'converted' ? 'Converted' : 'Lost'}.</p>}
      {holder && <Alert tone="warn">“{holder.name}” is your {f.outcome} status now. Saving makes this one the {f.outcome} status instead, and “{holder.name}” becomes an ordinary step.</Alert>}
    </FormModal>
  );
}

export default function LeadStatuses() {
  const { data, setData, loading, error, reload } = useResource('/api/leads/statuses');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState('');
  const list = data || [];

  const reorder = async (i, d) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setData(next);
    try {
      setData(await api(`${BASE}/reorder`, { method: 'PUT', body: { statusIds: next.map((s) => s._id) } }));
    } catch (e) {
      toast.error(e.message);
      reload();
    }
  };
  const setActive = async (s, isActive) => {
    setBusy(s._id);
    try {
      const saved = await api(`${BASE}/${s._id}`, { method: 'PUT', body: { isActive } });
      setData((l) => l.map((x) => (x._id === s._id ? saved : x)));
    } catch (e) {
      toast.error(e.message);
    }
    setBusy('');
  };
  const remove = async () => {
    setBusy('delete');
    try {
      await api(`${BASE}/${modal.status._id}`, { method: 'DELETE' });
      setData((l) => l.filter((x) => x._id !== modal.status._id));
      toast.success('Status deleted');
      setModal(null);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy('');
  };

  return (
    <>
      <PageHeader title="Lead statuses" description="The steps a lead goes through, for Meta, Google Ads and manual leads. One status means Converted (the lead became a client) and one means Lost.">
        <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Add status</Button>
      </PageHeader>
      {error && <Alert className="mb-4">{error}</Alert>}
      <Card className="overflow-hidden">
        <CardHeader title="Statuses" description="In the order staff see them. Switched-off statuses stay on existing leads but can’t be chosen any more." />
        {loading ? <LoadingBlock /> : (
          <ul className="divide-y divide-slate-100">
            {list.map((s, i) => {
              const special = s.outcome === 'converted' || s.outcome === 'lost';
              return (
                <li key={s._id} className={cx('flex flex-wrap items-center gap-3 px-6 py-3', !s.isActive && 'bg-slate-50/70')}>
                  <span className={cx('h-3 w-3 shrink-0 rounded-full', STATUS_DOT[s.color] || STATUS_DOT.slate)} />
                  <div className="min-w-0 flex-1">
                    <div className={cx('truncate text-sm font-medium', s.isActive ? 'text-slate-900' : 'text-slate-400 line-through')}>{s.name}</div>
                    {special && <div className="text-xs text-slate-500">{s.outcome === 'converted' ? 'Choosing it on a lead asks to add the client' : 'Closes the lead without a client'}</div>}
                  </div>
                  <OutcomeBadge outcome={s.outcome} />
                  <div className="w-36"><Toggle checked={s.isActive} disabled={special || busy === s._id} onChange={(x) => setActive(s, x)} label={s.isActive ? 'In use' : 'Switched off'} /></div>
                  <div className="flex shrink-0 items-center">
                    <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} className="disabled:opacity-30" onClick={() => reorder(i, -1)} />
                    <IconButton icon={ArrowDown} label="Move down" disabled={i === list.length - 1} className="disabled:opacity-30" onClick={() => reorder(i, 1)} />
                    <IconButton icon={Pencil} label={`Edit ${s.name}`} onClick={() => setModal({ type: 'form', status: s })} />
                    <IconButton icon={Trash2} label={special ? `${s.name} can’t be deleted` : `Delete ${s.name}`} tone="danger" disabled={special} className="disabled:opacity-30" onClick={() => setModal({ type: 'delete', status: s })} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {modal?.type === 'form' && (
        <StatusForm
          status={modal.status}
          statuses={list}
          onClose={() => setModal(null)}
          onSaved={() => { toast.success(modal.status ? 'Status saved' : 'Status added'); setModal(null); reload(); }}
        />
      )}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={() => setModal(null)} onConfirm={remove} busy={busy === 'delete'} title="Delete this status?" confirmLabel="Delete status">
        <b className="text-slate-900">{modal?.status?.name}</b> can no longer be chosen. Leads that had it keep it in their history.
      </ConfirmDialog>
    </>
  );
}
