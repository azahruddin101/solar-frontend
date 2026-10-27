'use client';

// Add or edit one expense: the amount, the reason (a common one or "Other" with its text), an optional note and the
// date. Opened on a project's page, or from the expenses list with `projects` to choose which project it was spent on.
import { useState } from 'react';
import { api } from '@/lib/api';
import { FormField, FormModal, Input, NumField, Select, toast } from '../kit';

// Common reasons to pick from; anything else is typed under "Other".
const REASONS = ['Transport of material', 'Labour charges', 'Material purchase', 'Structure fabrication', 'Electrical work', 'Permits & net-metering fees', 'Travel & site visit', 'Tools & equipment', 'Food & accommodation', 'Repair / rework'];
const OTHER = '__other__';
const today = () => new Date().toISOString().slice(0, 10);

/** "Proposal — Client"; two projects that would read the same also show their site address. */
function projectLabels(projects) {
  const base = (p) => (p.client?.name ? `${p.name} — ${p.client.name}` : p.name);
  const seen = new Map();
  projects.forEach((p) => seen.set(base(p), (seen.get(base(p)) || 0) + 1));
  return projects.map((p) => {
    const label = base(p);
    const address = (p.address || '').length > 45 ? `${p.address.slice(0, 44)}…` : p.address;
    return { id: p.id, label: seen.get(label) > 1 && address ? `${label} (${address})` : label };
  });
}

/**
 * `expense` to edit one, else a new one for `designId` — or, from the list, for the project picked from `projects`
 * ([{ id, name, client, address }]).
 */
export default function ExpenseForm({ expense, designId, projects, onClose, onSaved }) {
  const picking = !expense && !designId;
  const [project, setProject] = useState('');
  const [amount, setAmount] = useState(expense?.amount ?? '');
  // an existing reason that isn't one of the options opens as "Other" with its text
  const [choice, setChoice] = useState(() => (!expense ? '' : REASONS.includes(expense.reason) ? expense.reason : OTHER));
  const [other, setOther] = useState(() => (expense && !REASONS.includes(expense.reason) ? expense.reason : ''));
  const reason = choice === OTHER ? other : choice;
  const [note, setNote] = useState(expense?.note ?? '');
  const [spentOn, setSpentOn] = useState(expense?.spentOn ? String(expense.spentOn).slice(0, 10) : today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (picking && !project) return setError('Choose the project the money was spent on');
    if (!choice) return setError('Choose the reason for the expense');
    if (!reason.trim()) return setError('Write the reason for the expense');
    if (!(Number(amount) > 0)) return setError('Enter the amount spent');
    setBusy(true);
    setError('');
    try {
      const body = { amount: Number(amount), reason, note, spentOn };
      const saved = await (expense ? api(`/api/expenses/${expense.id}`, { method: 'PUT', body }) : api(`/api/expenses/design/${designId || project}`, { method: 'POST', body }));
      toast.success(expense ? 'Expense updated' : 'Expense added');
      onSaved(saved);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} size="md" title={expense ? 'Edit expense' : 'Add an expense'} submitLabel={expense ? 'Save changes' : 'Add expense'} busy={busy} error={error} onSubmit={submit}>
      {picking && (
        <FormField label="Project" hint={projects.length ? undefined : 'Booked proposals appear here, ready for their expenses.'}>
          <Select value={project} onValue={setProject} autoFocus>
            <option value="">Choose a project…</option>
            {projectLabels(projects).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </FormField>
      )}
      <FormField label="Reason">
        <Select value={choice} onValue={setChoice}>
          <option value="">Choose a reason…</option>
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          <option value={OTHER}>Other…</option>
        </Select>
      </FormField>
      {choice === OTHER && (
        <FormField label="Write the reason">
          <Input maxLength={300} value={other} onValue={setOther} placeholder="What was this money spent on?" autoFocus />
        </FormField>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Amount spent">
          <NumField min={0} step="any" value={amount} onValue={setAmount} placeholder="e.g. 2500" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" autoFocus={!picking} />
        </FormField>
        <FormField label="Date">
          <Input type="date" value={spentOn} onValue={setSpentOn} />
        </FormField>
      </div>
      <FormField label="Note" optional>
        <Input maxLength={500} value={note} onValue={setNote} placeholder="e.g. Bill no. 4521 from Sunrise Traders" />
      </FormField>
    </FormModal>
  );
}
