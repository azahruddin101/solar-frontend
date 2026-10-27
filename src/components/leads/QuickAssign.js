'use client';

// "Assign by count": give a number of the unassigned leads to one staff member, without ticking them one by one.
// The leads waiting longest go first. Used on the Meta, Google Ads and manual lead pages.
import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, cx, FormField, FormModal, Input, Select, toast } from '../kit';

const ALL_SOURCE_OPTIONS = [
  { id: 'meta', label: 'Meta' },
  { id: 'google', label: 'Google Ads' },
  { id: 'manual', label: 'Manual' },
];

/** `source`: 'meta' | 'google' | 'manual' | 'all'. `onAssigned()` reloads the page's list. */
export default function QuickAssign({ source, onClose, onAssigned }) {
  const [sources, setSources] = useState({ meta: true, google: true, manual: true });
  const pickedSources = useMemo(
    () => ALL_SOURCE_OPTIONS.filter((o) => sources[o.id]).map((o) => o.id),
    [sources],
  );
  const countQuery = source === 'all' && pickedSources.length ? `?sources=${pickedSources.join(',')}` : '';
  const staff = useResource('/api/leads/assignees');
  const pool = useResource(source === 'all' ? `/api/leads/all/unassigned-count${countQuery}` : `/api/leads/${source}/unassigned-count`);
  const [form, setForm] = useState({ counsellorId: '', count: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = pickedSources.length ? (pool.data?.unassigned ?? null) : 0;
  const count = Number(form.count);
  const person = (staff.data || []).find((s) => s._id === form.counsellorId);

  const toggleSource = (id) => {
    setSources((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      const any = ALL_SOURCE_OPTIONS.some((o) => next[o.id]);
      if (!any) return prev;
      return next;
    });
    setForm((f) => ({ ...f, count: '' }));
  };

  const submit = async () => {
    if (source === 'all' && !pickedSources.length) return setError('Choose at least one source');
    if (!form.counsellorId) return setError('Choose the staff member');
    if (!Number.isInteger(count) || count < 1) return setError('Enter how many leads to assign');
    if (available !== null && count > available) return setError(`Only ${available} lead${available === 1 ? ' is' : 's are'} unassigned`);
    setBusy(true);
    setError('');
    try {
      const body = { counsellorId: form.counsellorId, count };
      if (source === 'all') body.sources = pickedSources;
      await api(`/api/leads/${source}/assign-unassigned`, { method: 'POST', body });
      toast.success(`${count} lead${count === 1 ? '' : 's'} assigned to ${person?.name || 'the staff member'}`);
      onAssigned();
    } catch (e) {
      setError(e.message);
      setBusy(false);
      pool.reload();
    }
  };

  const none = available === 0;
  const counting = pickedSources.length && available === null;
  return (
    <FormModal
      open
      onClose={onClose}
      title="Assign by count"
      description="Give a number of unassigned leads to one person. The leads waiting longest go first."
      submitLabel={count > 0 ? `Assign ${count} lead${count === 1 ? '' : 's'}` : 'Assign'}
      busy={busy}
      error={error}
      onSubmit={submit}
      noValidate
    >
      {source === 'all' && (
        <FormField label="Sources" hint="Only unassigned leads from the sources you tick are counted and assigned.">
          <div className="flex flex-wrap gap-2">
            {ALL_SOURCE_OPTIONS.map((o) => (
              <label
                key={o.id}
                className={cx(
                  'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors',
                  sources[o.id] ? 'border-brand/30 bg-brand/5 text-brand' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                )}
              >
                <input
                  type="checkbox"
                  checked={sources[o.id]}
                  onChange={() => toggleSource(o.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                />
                {o.label}
              </label>
            ))}
          </div>
        </FormField>
      )}
      <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
        <Users className="h-5 w-5 shrink-0 text-slate-400" />
        <p className="text-sm text-slate-700">
          {counting ? 'Counting unassigned leads…' : none ? 'There are no unassigned leads right now for the sources you chose.' : <><b className="text-slate-900">{available}</b> unassigned lead{available === 1 ? '' : 's'}</>}
        </p>
      </div>
      {none ? (
        <Alert tone="info">Every lead already has someone working on it{source === 'all' ? ' in the sources you chose' : ''}.</Alert>
      ) : (
        <>
          <FormField label="Staff member">
            <Select value={form.counsellorId} onValue={(x) => setForm({ ...form, counsellorId: x })} disabled={!staff.data}>
              <option value="">{staff.data ? (staff.data.length ? 'Choose who gets the leads…' : 'No staff can work on leads yet') : 'Loading staff…'}</option>
              {(staff.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Number of leads" hint={available ? `1 to ${available}` : undefined}>
            <div className="flex items-center gap-2">
              <Input type="number" inputMode="numeric" min={1} max={available || undefined} value={form.count} onValue={(x) => setForm({ ...form, count: x.replace(/\D/g, '') })} placeholder="e.g. 20" className="w-32" />
              {available > 0 && <button type="button" className="text-[13px] font-medium text-brand hover:underline" onClick={() => setForm({ ...form, count: String(available) })}>All {available}</button>}
            </div>
          </FormField>
        </>
      )}
    </FormModal>
  );
}
