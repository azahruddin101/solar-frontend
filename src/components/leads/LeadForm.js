'use client';

// Add or edit one lead on the company's lead form. Shared by the Leads and Manual leads pages.
import { useState } from 'react';
import { api } from '@/lib/api';
import { leadValue } from '@/lib/leadForm';
import { Alert, FormModal, toast } from '../kit';
import LeadFields from './LeadFields';

/** The form's values for a lead, keyed by field key (what LeadFields edits). */
const valuesOf = (fields, lead) => Object.fromEntries(fields.map((f) => [f.key, leadValue(lead, f) ?? (f.type === 'multiselect' ? [] : '')]));

/** Add or edit one lead on the company's form; the API checks every value again and reports problems per field. */
export default function LeadForm({ fields, lead, onClose, onSaved }) {
  const [values, setValues] = useState(() => (lead ? valuesOf(fields, lead) : {}));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const missing = Object.fromEntries(fields.filter((f) => f.required && (values[f.key] === undefined || values[f.key] === '' || (Array.isArray(values[f.key]) && !values[f.key].length))).map((f) => [f.key, `${f.label} is required`]));
    if (Object.keys(missing).length) return setErrors(missing);
    setBusy(true);
    setErrors({});
    try {
      const saved = lead ? await api(`/api/leads/manual/${lead._id}`, { method: 'PUT', body: values }) : await api('/api/leads/manual', { method: 'POST', body: values });
      onSaved(saved);
    } catch (e) {
      setErrors(e.details?.errors || { _: e.message });
      if (!e.details?.errors) toast.error(e.message);
      setBusy(false);
    }
  };
  return (
    <FormModal open onClose={onClose} size="lg" title={lead ? `Edit ${lead.fullName}` : 'Add a lead'} description={lead ? undefined : 'Fill in what you know — required fields are marked.'} submitLabel={lead ? 'Save changes' : 'Add lead'} busy={busy} onSubmit={submit} noValidate>
      {errors._ && <Alert className="mb-2">{errors._}</Alert>}
      <LeadFields fields={fields} values={values} onChange={setValues} errors={errors} />
    </FormModal>
  );
}
