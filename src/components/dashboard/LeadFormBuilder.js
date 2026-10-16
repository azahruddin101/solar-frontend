'use client';

// Manage Masters → Lead form: the company's own fields on the form used to add and import manual leads.
// Name, Phone and Address are always on it; everything after them is the company's. A live preview shows the form.
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { FIELD_TYPE, FIELD_TYPES, FIXED_FIELDS, MAX_FIELDS, WITH_OPTIONS } from '@/lib/leadForm';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, CardHeader, ConfirmDialog, cx, FormField, FormModal, IconButton, Input, PageHeader, Textarea, Toggle, toast } from '../kit';
import LeadFields from '../leads/LeadFields';

let seq = 0;
const withIds = (fields) => fields.map((f) => ({ ...f, uid: ++seq }));
const strip = (fields) => fields.map(({ uid, ...f }) => f);

function FieldForm({ field, others, onClose, onSave }) {
  const [f, setF] = useState(() => ({ label: '', type: 'text', required: false, help: '', options: [], ...field }));
  const [choices, setChoices] = useState(() => (field?.options || []).join('\n'));
  const [error, setError] = useState('');
  const needsOptions = WITH_OPTIONS.includes(f.type);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const submit = () => {
    const label = f.label.trim().replace(/\s+/g, ' ');
    if (!label) return setError('Give the field a name');
    const clash = [...FIXED_FIELDS, ...others].some((o) => o.label.toLowerCase() === label.toLowerCase());
    if (clash) return setError(`There’s already a field called “${label}”`);
    const options = needsOptions ? [...new Set(choices.split('\n').map((c) => c.trim()).filter(Boolean))] : [];
    if (needsOptions && !options.length) return setError('Add at least one choice, one per line');
    onSave({ ...f, label, help: f.help.trim(), options });
  };
  return (
    <FormModal open onClose={onClose} title={field?.label ? `Edit “${field.label}”` : 'Add a field'} submitLabel={field?.label ? 'Save field' : 'Add field'} error={error} onSubmit={submit} noValidate>
      <FormField label="Field name" hint="As staff will see it on the form, e.g. “Monthly electricity bill”."><Input autoFocus maxLength={60} value={f.label} onValue={(x) => set({ label: x })} /></FormField>
      <FormField label="Type">
        <div className="grid gap-2 sm:grid-cols-3">
          {FIELD_TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => set({ type: t.id })} className={cx('flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors', f.type === t.id ? 'border-brand bg-brand-soft/60 ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300')}>
              <t.icon className={cx('mt-0.5 h-4 w-4 shrink-0', f.type === t.id ? 'text-brand' : 'text-slate-400')} />
              <span><span className="block text-[13px] font-medium text-slate-900">{t.label}</span><span className="block text-[11px] leading-snug text-slate-500">{t.hint}</span></span>
            </button>
          ))}
        </div>
      </FormField>
      {needsOptions && (
        <FormField label="Choices" hint="One per line."><Textarea rows={4} value={choices} onValue={setChoices} placeholder={'RCC roof\nTin shed\nFactory roof'} /></FormField>
      )}
      <FormField label="Help text" optional hint="A short line under the field."><Input maxLength={200} value={f.help} onValue={(x) => set({ help: x })} /></FormField>
      <Toggle checked={f.required} onChange={(x) => set({ required: x })} label="Required" description="A lead can’t be saved, or imported, without it." />
    </FormModal>
  );
}

export default function LeadFormBuilder() {
  const { company, setCompany } = useSession();
  const [fields, setFields] = useState(() => withIds(company?.leadForm || []));
  const [saved, setSaved] = useState(() => JSON.stringify(company?.leadForm || []));
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState({});
  const dirty = JSON.stringify(strip(fields)) !== saved;
  const allFields = useMemo(() => [...FIXED_FIELDS, ...strip(fields)], [fields]);

  const move = (i, d) => setFields((list) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return next;
  });
  const save = async () => {
    setBusy(true);
    try {
      const res = await api('/api/company/lead-form', { method: 'PUT', body: { fields: strip(fields) } });
      const custom = res.fields.filter((f) => !f.fixed);
      setCompany({ ...company, leadForm: custom });
      setFields(withIds(custom));
      setSaved(JSON.stringify(custom));
      toast.success('Lead form saved');
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Lead form" description="The form your team fills in to add a lead by hand, and the columns of the Excel import. Name, Phone and Address are always on it; add the details your company needs.">
        {dirty && <Button onClick={() => { setFields(withIds(JSON.parse(saved))); }}>Discard changes</Button>}
        <Button variant="primary" onClick={save} loading={busy} disabled={!dirty}>Save form</Button>
      </PageHeader>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader title="Fields" description={`${fields.length} of your own (up to ${MAX_FIELDS})`} action={<Button size="sm" variant="primary" icon={Plus} disabled={fields.length >= MAX_FIELDS} onClick={() => setModal({ type: 'field' })}>Add field</Button>} />
          <ul className="divide-y divide-slate-100">
            {FIXED_FIELDS.map((f) => (
              <li key={f.key} className="flex items-center gap-3 bg-slate-50/60 px-6 py-3">
                <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{f.label}</div>
                  <div className="text-xs text-slate-500">{FIELD_TYPE[f.type].label} · on every lead form</div>
                </div>
                {f.required ? <Badge tone="slate">Required</Badge> : <Badge tone="slate">Optional</Badge>}
              </li>
            ))}
            {fields.map((f, i) => {
              const T = FIELD_TYPE[f.type];
              return (
                <li key={f.uid} className="flex items-center gap-3 px-6 py-3">
                  <T.icon className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{f.label}</div>
                    <div className="truncate text-xs text-slate-500">{T.label}{f.options?.length ? ` · ${f.options.join(', ')}` : ''}</div>
                  </div>
                  {f.required && <Badge tone="brand">Required</Badge>}
                  <div className="flex shrink-0 items-center">
                    <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} className="disabled:opacity-30" onClick={() => move(i, -1)} />
                    <IconButton icon={ArrowDown} label="Move down" disabled={i === fields.length - 1} className="disabled:opacity-30" onClick={() => move(i, 1)} />
                    <IconButton icon={Pencil} label={`Edit ${f.label}`} onClick={() => setModal({ type: 'field', index: i })} />
                    <IconButton icon={Trash2} label={`Remove ${f.label}`} tone="danger" onClick={() => setModal({ type: 'remove', index: i })} />
                  </div>
                </li>
              );
            })}
          </ul>
          {!fields.length && <p className="border-t border-slate-100 px-6 py-5 text-sm text-slate-500">No fields of your own yet. Add what you ask every lead — for example monthly bill, roof type, or how they heard of you.</p>}
          {dirty && <p className="border-t border-amber-200 bg-amber-50 px-6 py-2.5 text-[13px] text-amber-800">You have unsaved changes.</p>}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Preview" description="What your team sees when they add a lead." />
          <div className="p-6"><LeadFields fields={allFields} values={preview} onChange={setPreview} /></div>
        </Card>
      </div>

      {modal?.type === 'field' && (
        <FieldForm
          field={modal.index !== undefined ? fields[modal.index] : null}
          others={fields.filter((_, i) => i !== modal.index)}
          onClose={() => setModal(null)}
          onSave={(f) => {
            setFields((list) => (modal.index !== undefined ? list.map((x, i) => (i === modal.index ? { ...x, ...f } : x)) : [...list, { ...f, uid: ++seq }]));
            setModal(null);
          }}
        />
      )}
      <ConfirmDialog
        open={modal?.type === 'remove'}
        onClose={() => setModal(null)}
        onConfirm={() => { setFields((list) => list.filter((_, i) => i !== modal.index)); setModal(null); }}
        title="Remove this field?"
        confirmLabel="Remove field"
      >
        <b className="text-slate-900">{fields[modal?.index]?.label}</b> will no longer be on the form or the import. Answers already saved on leads are kept. Click <b className="text-slate-900">Save form</b> to apply.
      </ConfirmDialog>
    </>
  );
}
