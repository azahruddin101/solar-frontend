'use client';

// Add or edit one expense: the amount, the reason (a common one or "Other" with its text), an optional note and the
// date. Opened on a project's page, or from the expenses list with `projects` to choose which project it was spent on.
import { Eye, FileText, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { BILL_ACCEPT, BILL_ALLOWED, MAX_BILL_BYTES, viewExpenseBill } from '@/lib/expenseBill';
import { expenseReasonsFor } from '@/lib/expenses';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Button, FormField, FormModal, Input, NumField, Select, toast } from '../kit';

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
  const company = useSession((s) => s.company);
  const reasonsRes = useResource('/api/expenses/reasons');
  const reasons = Array.isArray(reasonsRes.data) ? reasonsRes.data : expenseReasonsFor(company);
  const billInput = useRef(null);

  const picking = !expense && !designId;
  const [project, setProject] = useState('');
  const [amount, setAmount] = useState(expense?.amount ?? '');
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const reason = choice === OTHER ? other : choice;
  const [note, setNote] = useState(expense?.note ?? '');
  const [spentOn, setSpentOn] = useState(expense?.spentOn ? String(expense.spentOn).slice(0, 10) : today());
  const [billFile, setBillFile] = useState(null);
  const [removeBill, setRemoveBill] = useState(false);
  const [billError, setBillError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hasStoredBill = Boolean(expense?.billUrl) && !removeBill;

  useEffect(() => {
    if (!expense) return;
    if (reasons.includes(expense.reason)) {
      setChoice(expense.reason);
      setOther('');
    } else {
      setChoice(OTHER);
      setOther(expense.reason || '');
    }
  }, [expense, reasonsRes.data]);

  const pickBill = (file) => {
    setBillError('');
    if (!file) return;
    if (!BILL_ALLOWED.test(file.name)) return setBillError('Upload a PDF, PNG, JPG, WebP image or Excel file (XLSX, XLS)');
    if (file.size > MAX_BILL_BYTES) return setBillError('The bill must be 20 MB or smaller');
    setRemoveBill(false);
    setBillFile(file);
  };

  const submit = async () => {
    if (picking && !project) return setError('Choose the project the money was spent on');
    if (!choice) return setError('Choose the reason for the expense');
    if (!reason.trim()) return setError('Write the reason for the expense');
    if (!(Number(amount) > 0)) return setError('Enter the amount spent');
    if (billError) return setError(billError);
    setBusy(true);
    setError('');
    try {
      const body = { amount: Number(amount), reason, note, spentOn };
      let saved = await (expense ? api(`/api/expenses/${expense.id}`, { method: 'PUT', body }) : api(`/api/expenses/design/${designId || project}`, { method: 'POST', body }));
      if (removeBill && expense?.billUrl) saved = await api(`/api/expenses/${saved.id}/bill`, { method: 'DELETE' });
      if (billFile) {
        const form = new FormData();
        form.append('file', billFile);
        saved = await api(`/api/expenses/${saved.id}/bill`, { method: 'POST', form });
      }
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
        <Select value={choice} onValue={setChoice} disabled={reasonsRes.loading && !reasons.length}>
          <option value="">{reasonsRes.loading ? 'Loading reasons…' : 'Choose a reason…'}</option>
          {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
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
      <FormField label="Bill" optional error={billError} hint="PDF, image (PNG, JPG, WebP) or Excel (XLSX, XLS), up to 20 MB.">
        <input ref={billInput} type="file" accept={BILL_ACCEPT} className="hidden" onChange={(e) => { pickBill(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" icon={Upload} onClick={() => billInput.current?.click()}>
            {billFile ? 'Choose another' : hasStoredBill ? 'Replace bill' : 'Upload bill'}
          </Button>
          {billFile ? (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{billFile.name}</span>
              <button type="button" aria-label="Remove selected bill" onClick={() => setBillFile(null)} className="text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
            </span>
          ) : hasStoredBill ? (
            <>
              <button type="button" onClick={() => viewExpenseBill({ url: expense.billUrl, name: expense.billName || 'Bill' })} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink hover:underline">
                <Eye className="h-3.5 w-3.5" />
                {expense.billName || 'View bill'}
              </button>
              <button type="button" onClick={() => { setRemoveBill(true); setBillFile(null); }} className="text-xs text-slate-500 hover:text-red-600">Remove</button>
            </>
          ) : (
            <span className="text-xs text-slate-500">No bill attached</span>
          )}
        </div>
      </FormField>
      <FormField label="Note" optional>
        <Input maxLength={500} value={note} onValue={setNote} placeholder="e.g. Bill no. 4521 from Sunrise Traders" />
      </FormField>
    </FormModal>
  );
}
